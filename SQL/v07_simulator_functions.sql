-- ============================================================================
-- v736_07: Admin System — simulator management functions
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v735_01, v735_02, sim schema core tables
-- ============================================================================

-- ---------------------------------------------------------------------------
-- admin.update_sim_scenario
-- p_updates supports keys such as:
-- name, description, short_description, industry, methodology,
-- difficulty_level|difficulty, target_role, duration_minutes,
-- is_active, is_featured, is_premium, is_published,
-- scenario_data, learning_objectives, skills_covered, prerequisites,
-- thumbnail_url, sort_order
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.update_sim_scenario(
    p_scenario_id UUID,
    p_updates JSONB,
    p_admin_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public, sim
AS $$
DECLARE
    v_prev sim.scenarios%ROWTYPE;
    v_new sim.scenarios%ROWTYPE;
BEGIN
    IF NOT admin.check_admin_permission(p_admin_user_id, 'simulator.scenarios.edit') THEN
        RAISE EXCEPTION 'Permission denied: simulator.scenarios.edit required';
    END IF;

    IF p_updates IS NULL OR jsonb_typeof(p_updates) <> 'object' THEN
        RAISE EXCEPTION 'p_updates must be a JSON object';
    END IF;

    SELECT * INTO v_prev
    FROM sim.scenarios
    WHERE id = p_scenario_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Simulator scenario not found: %', p_scenario_id;
    END IF;

    UPDATE sim.scenarios
    SET name = COALESCE(NULLIF(p_updates->>'name', ''), name),
        description = COALESCE(p_updates->>'description', description),
        short_description = COALESCE(p_updates->>'short_description', short_description),
        industry = COALESCE(NULLIF(p_updates->>'industry', ''), industry),
        methodology = COALESCE(NULLIF(p_updates->>'methodology', ''), methodology),
        difficulty_level = COALESCE(
            NULLIF(p_updates->>'difficulty_level', ''),
            NULLIF(p_updates->>'difficulty', ''),
            difficulty_level
        ),
        target_role = COALESCE(NULLIF(p_updates->>'target_role', ''), target_role),
        duration_minutes = COALESCE((p_updates->>'duration_minutes')::INTEGER, duration_minutes),
        is_active = COALESCE((p_updates->>'is_active')::BOOLEAN, is_active),
        is_featured = COALESCE((p_updates->>'is_featured')::BOOLEAN, is_featured),
        is_premium = COALESCE((p_updates->>'is_premium')::BOOLEAN, is_premium),
        is_published = COALESCE((p_updates->>'is_published')::BOOLEAN, is_published),
        scenario_data = COALESCE(p_updates->'scenario_data', scenario_data),
        learning_objectives = COALESCE(p_updates->'learning_objectives', learning_objectives),
        skills_covered = COALESCE(p_updates->'skills_covered', skills_covered),
        prerequisites = COALESCE(p_updates->'prerequisites', prerequisites),
        thumbnail_url = COALESCE(NULLIF(p_updates->>'thumbnail_url', ''), thumbnail_url),
        sort_order = COALESCE((p_updates->>'sort_order')::INTEGER, sort_order),
        updated_at = NOW()
    WHERE id = p_scenario_id
    RETURNING * INTO v_new;

    PERFORM admin.log_admin_action(
        p_admin_user_id,
        'simulator.scenario.update',
        'sim_scenario',
        p_scenario_id,
        jsonb_build_object('requested_updates', p_updates),
        to_jsonb(v_prev),
        to_jsonb(v_new)
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.revoke_sim_certificate
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.revoke_sim_certificate(
    p_cert_id UUID,
    p_admin_user_id UUID,
    p_reason TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public, sim
AS $$
DECLARE
    v_prev sim.certificates%ROWTYPE;
    v_new sim.certificates%ROWTYPE;
BEGIN
    IF NOT admin.check_admin_permission(p_admin_user_id, 'simulator.certificates.edit') THEN
        RAISE EXCEPTION 'Permission denied: simulator.certificates.edit required';
    END IF;

    SELECT * INTO v_prev
    FROM sim.certificates
    WHERE id = p_cert_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Simulator certificate not found: %', p_cert_id;
    END IF;

    UPDATE sim.certificates
    SET is_verified = FALSE,
        verification_date = NULL,
        metadata = COALESCE(metadata, '{}'::JSONB) || jsonb_build_object(
            'revoked_at', NOW(),
            'revoked_by_admin_user_id', p_admin_user_id,
            'revocation_reason', COALESCE(p_reason, '')
        )
    WHERE id = p_cert_id
    RETURNING * INTO v_new;

    PERFORM admin.log_admin_action(
        p_admin_user_id,
        'simulator.certificate.revoke',
        'sim_certificate',
        p_cert_id,
        jsonb_build_object('reason', p_reason),
        to_jsonb(v_prev),
        to_jsonb(v_new)
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.reset_leaderboard_entries
-- Deletes all leaderboard entries when p_scenario_id is NULL.
-- If sim.leaderboard_entries.scenario_id exists, scoped deletes use it.
-- Otherwise falls back to metadata->>'scenario_id' when present.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.reset_leaderboard_entries(
    p_scenario_id UUID,
    p_admin_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public, sim
AS $$
DECLARE
    v_deleted_count BIGINT := 0;
    v_has_scenario_id_column BOOLEAN := FALSE;
    v_has_metadata_column BOOLEAN := FALSE;
BEGIN
    IF NOT admin.check_admin_permission(p_admin_user_id, 'simulator.leaderboard.reset') THEN
        RAISE EXCEPTION 'Permission denied: simulator.leaderboard.reset required';
    END IF;

    SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'sim'
          AND table_name = 'leaderboard_entries'
          AND column_name = 'scenario_id'
    ) INTO v_has_scenario_id_column;

    SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'sim'
          AND table_name = 'leaderboard_entries'
          AND column_name = 'metadata'
    ) INTO v_has_metadata_column;

    IF p_scenario_id IS NULL THEN
        DELETE FROM sim.leaderboard_entries;
    ELSIF v_has_scenario_id_column THEN
        EXECUTE $q$
            DELETE FROM sim.leaderboard_entries
            WHERE scenario_id = $1
        $q$ USING p_scenario_id;
    ELSIF v_has_metadata_column THEN
        EXECUTE $q$
            DELETE FROM sim.leaderboard_entries
            WHERE metadata ? 'scenario_id'
              AND metadata->>'scenario_id' = $1
        $q$ USING p_scenario_id::TEXT;
    ELSE
        RAISE EXCEPTION 'sim.leaderboard_entries has no scenario_id or metadata column for scoped reset';
    END IF;

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    PERFORM admin.log_admin_action(
        p_admin_user_id,
        'simulator.leaderboard.reset',
        'sim_leaderboard_entries',
        p_scenario_id,
        jsonb_build_object('scenario_id', p_scenario_id),
        NULL,
        jsonb_build_object('deleted_count', v_deleted_count)
    );

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION admin.update_sim_scenario(UUID, JSONB, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.revoke_sim_certificate(UUID, UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.reset_leaderboard_entries(UUID, UUID) TO authenticated, service_role;
