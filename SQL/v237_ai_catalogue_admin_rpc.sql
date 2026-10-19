-- ============================================================================
-- v237: AI Centre — Ask Nidus data catalogue and AI languages (monorepo v1272, PRD D5, D9, D16, D18)
--
-- Narrow Admin → public/sim exception (both CLAUDE.md files): Admin writes
-- public|sim.ai_catalogue_entities / ai_catalogue_fields and public|sim.languages.ai_supported ONLY
-- through these RPCs, gated by ai.catalogue.edit (reads: ai.view) and audited.
--   admin_ai_list_catalogue(schema)
--   admin_ai_update_catalogue_entity(schema, entity_key, changes, reason)  label/description/editions/is_active/sort
--   admin_ai_upsert_catalogue_field(schema, entity_key, field, reason)     the column must exist in the entity's view
--   admin_ai_list_languages / admin_ai_set_language_ai_supported(code, supported, reason)
-- New registers need a curated ai_v_* view (monorepo SQL) first; Admin cannot create views.
-- Prerequisites: monorepo SQL v1274–v1275; Admin v225, v235. Idempotent.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_ai_list_catalogue(p_schema TEXT DEFAULT 'public', p_admin_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, sim, admin
AS $$
DECLARE v JSONB;
BEGIN
  PERFORM public.admin_require_public_site_permission('ai.view', p_admin_user_id);
  IF p_schema NOT IN ('public', 'sim') THEN RAISE EXCEPTION 'Schema must be public or sim'; END IF;
  EXECUTE format($q$
    SELECT COALESCE(jsonb_agg(to_jsonb(e) || jsonb_build_object(
             'fields', COALESCE((SELECT jsonb_agg(to_jsonb(f) ORDER BY f.sort_order, f.field_key) FROM %1$I.ai_catalogue_fields f WHERE f.entity_key = e.entity_key), '[]'::jsonb),
             'view_columns', COALESCE((SELECT jsonb_agg(c.column_name ORDER BY c.ordinal_position) FROM information_schema.columns c
                                        WHERE c.table_schema = %1$L AND c.table_name = e.view_name), '[]'::jsonb))
           ORDER BY e.sort_order, e.entity_key), '[]'::jsonb)
      FROM %1$I.ai_catalogue_entities e$q$, p_schema) INTO v;
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_ai_update_catalogue_entity(
  p_schema TEXT, p_entity_key TEXT, p_changes JSONB, p_reason TEXT, p_admin_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, sim, admin
AS $$
DECLARE
  v_admin UUID := public.admin_require_public_site_permission('ai.catalogue.edit', p_admin_user_id);
  v_before JSONB; v_after JSONB; k TEXT;
BEGIN
  IF p_schema NOT IN ('public', 'sim') THEN RAISE EXCEPTION 'Schema must be public or sim'; END IF;
  IF COALESCE(btrim(p_reason), '') = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  FOR k IN SELECT jsonb_object_keys(COALESCE(p_changes, '{}'::jsonb)) LOOP
    IF k NOT IN ('label', 'label_singular', 'description', 'editions', 'is_active', 'sort_order', 'route_template') THEN
      RAISE EXCEPTION '"%" cannot be changed here', k;
    END IF;
  END LOOP;
  IF p_changes ? 'editions' AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(p_changes -> 'editions') e WHERE e NOT IN ('platform', 'planner')) THEN
    RAISE EXCEPTION 'Editions must be platform and/or planner';
  END IF;
  IF p_schema = 'sim' AND p_changes ? 'editions' AND (p_changes -> 'editions') ? 'planner' THEN
    RAISE EXCEPTION 'The Simulator catalogue has no Planner edition';
  END IF;

  EXECUTE format('SELECT to_jsonb(e) FROM %I.ai_catalogue_entities e WHERE entity_key = $1', p_schema) INTO v_before USING p_entity_key;
  IF v_before IS NULL THEN RAISE EXCEPTION 'Register not found'; END IF;

  EXECUTE format($q$
    UPDATE %I.ai_catalogue_entities SET
      label = COALESCE($2 ->> 'label', label),
      label_singular = COALESCE($2 ->> 'label_singular', label_singular),
      description = COALESCE($2 ->> 'description', description),
      editions = CASE WHEN $2 ? 'editions' THEN ARRAY(SELECT jsonb_array_elements_text($2 -> 'editions')) ELSE editions END,
      is_active = COALESCE(($2 ->> 'is_active')::boolean, is_active),
      sort_order = COALESCE(($2 ->> 'sort_order')::int, sort_order),
      route_template = CASE WHEN $2 ? 'route_template' THEN NULLIF($2 ->> 'route_template', '') ELSE route_template END,
      updated_at = NOW(), updated_by_admin = $3
    WHERE entity_key = $1$q$, p_schema) USING p_entity_key, p_changes, v_admin;

  EXECUTE format('SELECT to_jsonb(e) FROM %I.ai_catalogue_entities e WHERE entity_key = $1', p_schema) INTO v_after USING p_entity_key;
  PERFORM admin.log_admin_action(v_admin, 'ai.catalogue_entity_update', 'ai_catalogue_entity', NULL,
    jsonb_build_object('reason', p_reason, 'schema', p_schema, 'entity', p_entity_key), v_before, v_after);
  RETURN v_after;
END;
$$;

-- p_field: {field_key, label, description, data_type, is_filterable, is_groupable, is_summable, is_default,
--           allowed_values[], link_entity_key, is_active, sort_order}
CREATE OR REPLACE FUNCTION public.admin_ai_upsert_catalogue_field(
  p_schema TEXT, p_entity_key TEXT, p_field JSONB, p_reason TEXT, p_admin_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, sim, admin
AS $$
DECLARE
  v_admin UUID := public.admin_require_public_site_permission('ai.catalogue.edit', p_admin_user_id);
  v_view TEXT; v_before JSONB; v_after JSONB;
  v_key TEXT := p_field ->> 'field_key';
BEGIN
  IF p_schema NOT IN ('public', 'sim') THEN RAISE EXCEPTION 'Schema must be public or sim'; END IF;
  IF COALESCE(btrim(p_reason), '') = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  IF v_key IS NULL OR v_key !~ '^[a-z][a-z0-9_]*$' THEN RAISE EXCEPTION 'Field key must be lower_snake_case'; END IF;
  IF COALESCE(btrim(p_field ->> 'label'), '') = '' THEN RAISE EXCEPTION 'A label is required'; END IF;
  IF (p_field ->> 'data_type') NOT IN ('text', 'number', 'date', 'datetime', 'boolean', 'uuid') THEN RAISE EXCEPTION 'Unknown data type'; END IF;

  EXECUTE format('SELECT view_name FROM %I.ai_catalogue_entities WHERE entity_key = $1', p_schema) INTO v_view USING p_entity_key;
  IF v_view IS NULL THEN RAISE EXCEPTION 'Register not found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = p_schema AND table_name = v_view AND column_name = v_key) THEN
    RAISE EXCEPTION 'The view % has no column "%". Add it to the view first (monorepo SQL).', v_view, v_key;
  END IF;
  IF (p_field ->> 'is_summable')::boolean AND (p_field ->> 'data_type') <> 'number' THEN RAISE EXCEPTION 'Only number fields can be summed'; END IF;

  EXECUTE format('SELECT to_jsonb(f) FROM %I.ai_catalogue_fields f WHERE entity_key = $1 AND field_key = $2', p_schema) INTO v_before USING p_entity_key, v_key;

  EXECUTE format($q$
    INSERT INTO %I.ai_catalogue_fields (entity_key, field_key, label, description, data_type, is_filterable, is_groupable, is_summable,
                                         is_default, allowed_values, link_entity_key, is_active, sort_order, updated_by_admin)
    VALUES ($1, $2, $3 ->> 'label', NULLIF($3 ->> 'description', ''), $3 ->> 'data_type',
            COALESCE(($3 ->> 'is_filterable')::boolean, TRUE), COALESCE(($3 ->> 'is_groupable')::boolean, FALSE),
            COALESCE(($3 ->> 'is_summable')::boolean, FALSE), COALESCE(($3 ->> 'is_default')::boolean, FALSE),
            CASE WHEN jsonb_typeof($3 -> 'allowed_values') = 'array' THEN ARRAY(SELECT jsonb_array_elements_text($3 -> 'allowed_values')) END,
            NULLIF($3 ->> 'link_entity_key', ''), COALESCE(($3 ->> 'is_active')::boolean, TRUE), COALESCE(($3 ->> 'sort_order')::int, 100), $4)
    ON CONFLICT (entity_key, field_key) DO UPDATE SET
      label = EXCLUDED.label, description = EXCLUDED.description, data_type = EXCLUDED.data_type,
      is_filterable = EXCLUDED.is_filterable, is_groupable = EXCLUDED.is_groupable, is_summable = EXCLUDED.is_summable,
      is_default = EXCLUDED.is_default, allowed_values = EXCLUDED.allowed_values, link_entity_key = EXCLUDED.link_entity_key,
      is_active = EXCLUDED.is_active, sort_order = EXCLUDED.sort_order, updated_at = NOW(), updated_by_admin = EXCLUDED.updated_by_admin$q$, p_schema)
  USING p_entity_key, v_key, p_field, v_admin;

  EXECUTE format('SELECT to_jsonb(f) FROM %I.ai_catalogue_fields f WHERE entity_key = $1 AND field_key = $2', p_schema) INTO v_after USING p_entity_key, v_key;
  PERFORM admin.log_admin_action(v_admin, 'ai.catalogue_field_upsert', 'ai_catalogue_field', NULL,
    jsonb_build_object('reason', p_reason, 'schema', p_schema, 'entity', p_entity_key, 'field', v_key), v_before, v_after);
  RETURN v_after;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_ai_list_languages(p_admin_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, admin
AS $$
BEGIN
  PERFORM public.admin_require_public_site_permission('ai.view', p_admin_user_id);
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('code', code, 'name', name, 'native_name', native_name, 'is_active', is_active, 'ai_supported', ai_supported)
                   ORDER BY lower(name)) FROM public.languages WHERE COALESCE(is_deleted, FALSE) = FALSE), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_ai_set_language_ai_supported(p_code TEXT, p_supported BOOLEAN, p_reason TEXT, p_admin_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, sim, admin
AS $$
DECLARE v_admin UUID := public.admin_require_public_site_permission('ai.catalogue.edit', p_admin_user_id);
BEGIN
  IF COALESCE(btrim(p_reason), '') = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  UPDATE public.languages SET ai_supported = COALESCE(p_supported, FALSE), updated_at = NOW() WHERE code = p_code;
  IF NOT FOUND THEN RAISE EXCEPTION 'Language not found'; END IF;
  UPDATE sim.languages SET ai_supported = COALESCE(p_supported, FALSE), updated_at = NOW() WHERE code = p_code;
  PERFORM admin.log_admin_action(v_admin, 'ai.language_supported', 'language', NULL,
    jsonb_build_object('reason', p_reason, 'code', p_code, 'ai_supported', p_supported), NULL, NULL);
  RETURN jsonb_build_object('code', p_code, 'ai_supported', p_supported);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_ai_list_catalogue(TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_ai_update_catalogue_entity(TEXT, TEXT, JSONB, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_ai_upsert_catalogue_field(TEXT, TEXT, JSONB, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_ai_list_languages(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_ai_set_language_ai_supported(TEXT, BOOLEAN, TEXT, UUID) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
SELECT 'v237 applied' AS status;
