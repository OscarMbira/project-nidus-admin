-- =============================================================================
-- v170: RPC — sync industry_plan Global Templates from public catalog
-- Fixes gap: v772b seeds public.pmo_industry_templates only; Admin UI reads
-- admin.global_template_library. Without sync, new industries never appear.
-- Prerequisites: v166 (publish), v773 (monorepo sync), v774/v167 index fix
-- =============================================================================

-- Multi-document current-scope index (safe re-apply)
DROP INDEX IF EXISTS public.uq_pm_template_nodes_current_scope;
CREATE UNIQUE INDEX uq_pm_template_nodes_current_scope
    ON public.pm_template_nodes (
        account_id, tier, domain,
        COALESCE(scope_entity_type, ''),
        COALESCE(scope_entity_id, '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE(domain_ref_id, '00000000-0000-0000-0000-000000000000'::uuid)
    )
    WHERE is_current = TRUE;

DROP INDEX IF EXISTS sim.uq_sim_pm_template_nodes_current_scope;
CREATE UNIQUE INDEX uq_sim_pm_template_nodes_current_scope
    ON sim.pm_template_nodes (
        account_id, tier, domain,
        COALESCE(scope_entity_type, ''),
        COALESCE(scope_entity_id, '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE(domain_ref_id, '00000000-0000-0000-0000-000000000000'::uuid)
    )
    WHERE is_current = TRUE;

-- -----------------------------------------------------------------------------
-- Status: how many catalog industries are missing from the Admin library
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.industry_plan_catalog_sync_status(
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin UUID;
    v_catalog INT;
    v_library INT;
    v_missing JSONB;
BEGIN
    v_admin := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin IS NULL THEN
        RAISE EXCEPTION 'Admin user is required';
    END IF;
    IF NOT admin.check_admin_permission(v_admin, 'content.global_templates.view') THEN
        RAISE EXCEPTION 'Permission denied: content.global_templates.view required';
    END IF;

    SELECT COUNT(*)::int INTO v_catalog
    FROM public.pmo_industry_templates t
    WHERE COALESCE(t.is_deleted, FALSE) = FALSE
      AND COALESCE(t.is_active, TRUE) = TRUE
      AND NULLIF(trim(COALESCE(t.industry_code, '')), '') IS NOT NULL;

    SELECT COUNT(*)::int INTO v_library
    FROM admin.global_template_library g
    WHERE g.domain = 'industry_plan'
      AND g.record_status <> 'history'
      AND g.record_status <> 'archived';

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'industry_code', t.industry_code,
        'industry_name', t.industry_name
    ) ORDER BY t.industry_name), '[]'::jsonb)
    INTO v_missing
    FROM public.pmo_industry_templates t
    WHERE COALESCE(t.is_deleted, FALSE) = FALSE
      AND COALESCE(t.is_active, TRUE) = TRUE
      AND NULLIF(trim(COALESCE(t.industry_code, '')), '') IS NOT NULL
      AND NOT EXISTS (
          SELECT 1
          FROM admin.global_template_library g
          WHERE g.domain = 'industry_plan'
            AND g.record_status <> 'history'
            AND g.payload->>'industry_code' = t.industry_code
      );

    RETURN jsonb_build_object(
        'catalog_count', v_catalog,
        'library_count', v_library,
        'missing_count', jsonb_array_length(v_missing),
        'missing', v_missing
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- Sync: insert missing industry_plan rows + publish unsynced
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.sync_industry_plan_templates_from_catalog(
    p_admin_user_id UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public, sim
AS $$
DECLARE
    v_admin UUID;
    v_inserted INT := 0;
    v_published INT := 0;
    v_catalog INT := 0;
    v_row RECORD;
    v_sync JSONB;
    v_notes TEXT;
BEGIN
    v_admin := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin IS NULL THEN
        RAISE EXCEPTION 'Admin user is required';
    END IF;
    IF NOT admin.check_admin_permission(v_admin, 'content.global_templates.publish') THEN
        RAISE EXCEPTION 'Permission denied: content.global_templates.publish required';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'sync_global_template_node'
    ) THEN
        RAISE EXCEPTION 'public.sync_global_template_node missing — apply monorepo SQL/v773';
    END IF;

    SELECT COUNT(*)::int INTO v_catalog
    FROM public.pmo_industry_templates t
    WHERE COALESCE(t.is_deleted, FALSE) = FALSE
      AND COALESCE(t.is_active, TRUE) = TRUE
      AND NULLIF(trim(COALESCE(t.industry_code, '')), '') IS NOT NULL;

    IF v_catalog = 0 THEN
        RAISE EXCEPTION
            'No active rows in public.pmo_industry_templates. Apply monorepo SQL/v576_seed and/or SQL/v772b_seed/batches first.';
    END IF;

    v_notes := COALESCE(
        NULLIF(trim(COALESCE(p_notes, '')), ''),
        'Synced from Platform industry catalog (admin.sync_industry_plan_templates_from_catalog)'
    );

    WITH industries AS (
        SELECT
            t.id, t.industry_code, t.industry_name, t.description,
            t.typical_duration, t.icon, t.tags
        FROM public.pmo_industry_templates t
        WHERE COALESCE(t.is_deleted, FALSE) = FALSE
          AND COALESCE(t.is_active, TRUE) = TRUE
          AND NULLIF(trim(COALESCE(t.industry_code, '')), '') IS NOT NULL
    ),
    built AS (
        SELECT
            i.industry_code,
            i.industry_name,
            i.description,
            jsonb_build_object(
                'industry_code', i.industry_code,
                'industry_name', i.industry_name,
                'description', i.description,
                'typical_duration', i.typical_duration,
                'icon', i.icon,
                'tags', to_jsonb(COALESCE(i.tags, '{}'::text[])),
                'phases', COALESCE((
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'phase_number', p.phase_number,
                            'phase_name', p.phase_name,
                            'phase_description', p.phase_description,
                            'estimated_duration', p.estimated_duration,
                            'sort_order', COALESCE(p.sort_order, p.phase_number)
                        )
                        ORDER BY COALESCE(p.sort_order, p.phase_number), p.phase_number
                    )
                    FROM public.pmo_industry_template_phases p
                    WHERE p.template_id = i.id AND COALESCE(p.is_active, TRUE) = TRUE
                ), '[]'::jsonb),
                'activities', COALESCE((
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'phase_number', ph.phase_number,
                            'activity_name', a.activity_name,
                            'activity_description', a.activity_description,
                            'activity_type', a.activity_type,
                            'typical_duration', a.typical_duration,
                            'typical_effort', a.typical_effort,
                            'resource_type', a.resource_type,
                            'predecessor_notes', a.predecessor_notes,
                            'constraints', a.constraints,
                            'sort_order', COALESCE(a.sort_order, 0)
                        )
                        ORDER BY COALESCE(a.sort_order, 0), a.activity_name
                    )
                    FROM public.pmo_industry_template_activities a
                    LEFT JOIN public.pmo_industry_template_phases ph ON ph.id = a.phase_id
                    WHERE a.template_id = i.id AND COALESCE(a.is_active, TRUE) = TRUE
                ), '[]'::jsonb),
                'deliverables', COALESCE((
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'phase_number', ph.phase_number,
                            'deliverable_name', d.deliverable_name,
                            'deliverable_type', d.deliverable_type,
                            'is_mandatory', COALESCE(d.is_mandatory, FALSE),
                            'sort_order', COALESCE(d.sort_order, 0)
                        )
                        ORDER BY COALESCE(d.sort_order, 0), d.deliverable_name
                    )
                    FROM public.pmo_industry_template_deliverables d
                    LEFT JOIN public.pmo_industry_template_phases ph ON ph.id = d.phase_id
                    WHERE d.template_id = i.id AND COALESCE(d.is_active, TRUE) = TRUE
                ), '[]'::jsonb),
                'risks', COALESCE((
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'risk_title', r.risk_title,
                            'risk_description', r.risk_description,
                            'risk_category', r.risk_category,
                            'likelihood', r.likelihood,
                            'impact', r.impact,
                            'sort_order', COALESCE(r.sort_order, 0)
                        )
                        ORDER BY COALESCE(r.sort_order, 0), r.risk_title
                    )
                    FROM public.pmo_industry_template_risks r
                    WHERE r.template_id = i.id AND COALESCE(r.is_active, TRUE) = TRUE
                ), '[]'::jsonb),
                'milestones', COALESCE((
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'phase_number', ph.phase_number,
                            'milestone_name', m.milestone_name,
                            'milestone_description', m.milestone_description,
                            'sort_order', COALESCE(m.sort_order, 0)
                        )
                        ORDER BY COALESCE(m.sort_order, 0), m.milestone_name
                    )
                    FROM public.pmo_industry_template_milestones m
                    LEFT JOIN public.pmo_industry_template_phases ph ON ph.id = m.phase_id
                    WHERE m.template_id = i.id AND COALESCE(m.is_active, TRUE) = TRUE
                ), '[]'::jsonb),
                'roles', COALESCE((
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'role_title', rol.role_title,
                            'role_description', rol.role_description,
                            'is_key_role', COALESCE(rol.is_key_role, FALSE),
                            'sort_order', COALESCE(rol.sort_order, 0)
                        )
                        ORDER BY COALESCE(rol.sort_order, 0), rol.role_title
                    )
                    FROM public.pmo_industry_template_roles rol
                    WHERE rol.template_id = i.id AND COALESCE(rol.is_active, TRUE) = TRUE
                ), '[]'::jsonb)
            ) AS payload
        FROM industries i
    ),
    inserted AS (
        INSERT INTO admin.global_template_library (
            domain, category, name, description, payload,
            record_status, record_version, created_by, updated_by
        )
        SELECT
            'industry_plan',
            'international best practice',
            b.industry_name,
            b.description,
            b.payload,
            'live',
            1,
            v_admin,
            v_admin
        FROM built b
        WHERE NOT EXISTS (
            SELECT 1
            FROM admin.global_template_library g
            WHERE g.domain = 'industry_plan'
              AND g.payload->>'industry_code' = b.industry_code
        )
        RETURNING id
    )
    SELECT COUNT(*)::int INTO v_inserted FROM inserted;

    FOR v_row IN
        SELECT g.id, g.name, g.payload->>'industry_code' AS industry_code
        FROM admin.global_template_library g
        WHERE g.domain = 'industry_plan'
          AND g.record_status = 'live'
          AND g.synced_at IS NULL
        ORDER BY g.name, g.id
    LOOP
        v_sync := admin.publish_global_template(v_row.id, v_admin, v_notes);
        v_published := v_published + 1;
    END LOOP;

    PERFORM admin.log_admin_action(
        v_admin,
        'global_template.sync_from_catalog',
        'global_template_library',
        NULL,
        jsonb_build_object(
            'catalog_count', v_catalog,
            'inserted', v_inserted,
            'published', v_published,
            'notes', v_notes
        )
    );

    RETURN jsonb_build_object(
        'catalog_count', v_catalog,
        'inserted', v_inserted,
        'published', v_published,
        'library_count', (
            SELECT COUNT(*)::int
            FROM admin.global_template_library g
            WHERE g.domain = 'industry_plan'
              AND g.record_status NOT IN ('history', 'archived')
        )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION admin.industry_plan_catalog_sync_status(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.sync_industry_plan_templates_from_catalog(UUID, TEXT) TO authenticated, service_role;

COMMENT ON FUNCTION admin.sync_industry_plan_templates_from_catalog(UUID, TEXT) IS
    'Copy missing public.pmo_industry_templates into admin.global_template_library (industry_plan) and publish.';

-- One-shot catch-up when this migration is applied (uses first active super_admin)
DO $$
DECLARE
    v_admin UUID;
    v_result JSONB;
    v_status JSONB;
    v_missing INT;
BEGIN
    SELECT au.id INTO v_admin
    FROM admin.admin_users au
    WHERE au.role = 'super_admin' AND au.activation_status = 'active'
    ORDER BY au.created_at NULLS LAST, au.id
    LIMIT 1;

    IF v_admin IS NULL THEN
        RAISE WARNING 'v170: no active super_admin — skip auto sync; use UI Sync button later';
        RETURN;
    END IF;

    BEGIN
        v_status := admin.industry_plan_catalog_sync_status(v_admin);
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'v170: status check failed (%) — skip auto sync', SQLERRM;
        RETURN;
    END;

    v_missing := COALESCE((v_status->>'missing_count')::int, 0);
    RAISE NOTICE 'v170 pre-sync status: catalog=% library=% missing=%',
        v_status->>'catalog_count', v_status->>'library_count', v_missing;

    IF v_missing = 0 THEN
        RAISE NOTICE 'v170: Admin library already has every catalog industry_code — nothing to insert';
        RETURN;
    END IF;

    BEGIN
        v_result := admin.sync_industry_plan_templates_from_catalog(
            v_admin,
            'v170 migration auto-sync from Platform industry catalog'
        );
        RAISE NOTICE 'v170 sync result: %', v_result;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'v170: auto-sync failed (%) — apply v772b batches if catalog empty, then use UI Sync from Platform catalog', SQLERRM;
    END;
END $$;
