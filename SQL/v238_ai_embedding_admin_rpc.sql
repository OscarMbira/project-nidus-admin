-- ============================================================================
-- v238: AI Centre — Meaning Search (monorepo v1272 Phase 2b, PRD D17, D22a, D24, story 41)
--
-- Narrow Admin → public/sim exception (documented in both CLAUDE.md files, like v236/v237):
-- Admin reads embedding-queue statistics from public|sim.search_index and resets embeddings for
-- re-embedding ONLY through these SECURITY DEFINER RPCs, gated by ai.view / ai.embeddings.manage
-- and written to admin.log_admin_action. Record titles and text are never returned to Admin.
--   admin_ai_embedding_stats()                          queue per app, per record type, per organisation,
--                                                        incl. each organisation's non-English share (D22a)
--   admin_ai_embedding_failures(schema, limit)          rows that failed 3 times (type, organisation, error)
--   admin_ai_reembed(schema, account_id, failed_only, reason)   re-queue rows for embedding
-- Prerequisites: monorepo SQL v1283; Admin v225, v235. Idempotent.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_ai_embedding_stats(p_admin_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, sim, admin SET row_security = off
AS $$
DECLARE v JSONB := '{}'::jsonb; s TEXT; v_part JSONB;
BEGIN
  PERFORM public.admin_require_public_site_permission('ai.view', p_admin_user_id);
  FOREACH s IN ARRAY ARRAY['public', 'sim'] LOOP
    EXECUTE format($q$
      SELECT jsonb_build_object(
        'indexed',    COUNT(*) FILTER (WHERE NOT is_deleted),
        'embeddable', COUNT(*) FILTER (WHERE NOT is_deleted AND embed_text IS NOT NULL),
        'embedded',   COUNT(*) FILTER (WHERE NOT is_deleted AND embedding IS NOT NULL),
        'waiting',    COUNT(*) FILTER (WHERE NOT is_deleted AND embed_text IS NOT NULL AND embedding IS NULL AND embed_attempts < 3),
        'failed',     COUNT(*) FILTER (WHERE NOT is_deleted AND embed_text IS NOT NULL AND embedding IS NULL AND embed_attempts >= 3),
        'non_english',COUNT(*) FILTER (WHERE NOT is_deleted AND content_lang = 'other'),
        'oldest_waiting', MIN(updated_at) FILTER (WHERE NOT is_deleted AND embed_text IS NOT NULL AND embedding IS NULL AND embed_attempts < 3),
        'models', COALESCE((SELECT jsonb_object_agg(m, n) FROM (SELECT embedding_model AS m, COUNT(*) AS n FROM %1$I.search_index
                    WHERE embedding IS NOT NULL AND NOT is_deleted GROUP BY embedding_model) x), '{}'::jsonb),
        'by_type', COALESCE((SELECT jsonb_agg(jsonb_build_object('entity_type', entity_type, 'embeddable', e, 'embedded', d, 'waiting', w, 'failed', f) ORDER BY entity_type)
                    FROM (SELECT entity_type,
                                 COUNT(*) FILTER (WHERE embed_text IS NOT NULL) AS e,
                                 COUNT(*) FILTER (WHERE embedding IS NOT NULL) AS d,
                                 COUNT(*) FILTER (WHERE embed_text IS NOT NULL AND embedding IS NULL AND embed_attempts < 3) AS w,
                                 COUNT(*) FILTER (WHERE embed_text IS NOT NULL AND embedding IS NULL AND embed_attempts >= 3) AS f
                            FROM %1$I.search_index WHERE NOT is_deleted GROUP BY entity_type) t), '[]'::jsonb)
      ) FROM %1$I.search_index$q$, s) INTO v_part;
    v := v || jsonb_build_object(s, v_part);
  END LOOP;

  v := v || jsonb_build_object('organisations', COALESCE((
    SELECT jsonb_agg(row ORDER BY (row ->> 'embeddable')::int DESC)
      FROM (
        SELECT jsonb_build_object(
          'account_id', a.id, 'account_name', COALESCE(a.account_display_name, a.account_name), 'account_code', a.account_code,
          'embeddable', COUNT(*) FILTER (WHERE si.embed_text IS NOT NULL),
          'embedded', COUNT(*) FILTER (WHERE si.embedding IS NOT NULL),
          'waiting', COUNT(*) FILTER (WHERE si.embed_text IS NOT NULL AND si.embedding IS NULL AND si.embed_attempts < 3),
          'failed', COUNT(*) FILTER (WHERE si.embed_text IS NOT NULL AND si.embedding IS NULL AND si.embed_attempts >= 3),
          'non_english_share', ROUND(100.0 * COUNT(*) FILTER (WHERE si.content_lang = 'other')
                                     / NULLIF(COUNT(*) FILTER (WHERE si.content_lang IS NOT NULL), 0), 1)
        ) AS row
          FROM public.search_index si
          JOIN public.accounts a ON a.id = si.account_id
         WHERE NOT si.is_deleted
         GROUP BY a.id, a.account_display_name, a.account_name, a.account_code
         ORDER BY COUNT(*) FILTER (WHERE si.embed_text IS NOT NULL) DESC
         LIMIT 300
      ) x), '[]'::jsonb));
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_ai_embedding_failures(p_schema TEXT DEFAULT 'public', p_limit INTEGER DEFAULT 200, p_admin_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, sim, admin SET row_security = off
AS $$
DECLARE v JSONB;
BEGIN
  PERFORM public.admin_require_public_site_permission('ai.view', p_admin_user_id);
  IF p_schema NOT IN ('public', 'sim') THEN RAISE EXCEPTION 'Schema must be public or sim'; END IF;
  EXECUTE format($q$
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'id', si.id, 'entity_type', si.entity_type, 'entity_id', si.entity_id,
             'account_id', si.account_id, 'account_name', COALESCE(a.account_display_name, a.account_name),
             'attempts', si.embed_attempts, 'error', si.embed_error, 'updated_at', si.updated_at)
           ORDER BY si.updated_at DESC), '[]'::jsonb)
      FROM (SELECT * FROM %I.search_index
             WHERE NOT is_deleted AND embed_text IS NOT NULL AND embedding IS NULL AND embed_attempts >= 3
             ORDER BY updated_at DESC LIMIT $1) si
      LEFT JOIN public.accounts a ON a.id = si.account_id$q$, p_schema)
    INTO v USING LEAST(GREATEST(COALESCE(p_limit, 200), 1), 1000);
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_ai_reembed(p_schema TEXT, p_account_id UUID, p_failed_only BOOLEAN, p_reason TEXT, p_admin_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, sim, admin SET row_security = off
AS $$
DECLARE v_admin UUID := public.admin_require_public_site_permission('ai.embeddings.manage', p_admin_user_id); n INTEGER;
BEGIN
  IF COALESCE(btrim(p_reason), '') = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  IF p_schema NOT IN ('public', 'sim') THEN RAISE EXCEPTION 'Schema must be public or sim'; END IF;
  EXECUTE format($q$
    UPDATE %I.search_index SET embedding = NULL, embedded_at = NULL, embed_attempts = 0, embed_error = NULL
     WHERE NOT is_deleted AND embed_text IS NOT NULL
       AND ($1::uuid IS NULL OR account_id = $1)
       AND (NOT $2 OR (embedding IS NULL AND embed_attempts >= 3))$q$, p_schema)
    USING p_account_id, COALESCE(p_failed_only, FALSE);
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM admin.log_admin_action(v_admin, 'ai.reembed', 'search_index', p_account_id,
    jsonb_build_object('reason', p_reason, 'schema', p_schema, 'failed_only', COALESCE(p_failed_only, FALSE), 'rows', n), NULL, NULL);
  RETURN jsonb_build_object('rows', n);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_ai_embedding_stats(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_ai_embedding_failures(TEXT, INTEGER, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_ai_reembed(TEXT, UUID, BOOLEAN, TEXT, UUID) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
SELECT 'v238 applied' AS status;
