-- =============================================================================
-- v167: Bulk-populate Global Template Library from Platform industry catalog
-- Plan: projectplans/v167_global_template_library_industry_bulk_populate_plan.md
-- Prerequisites:
--   Admin: v160–v166 (this script also self-heals the payload CHECK from v166)
--   Monorepo: SQL/v773_global_industry_template_sync.sql
--             (+ embeds monorepo v774 index fix so bulk publish works even if v774 was skipped)
-- Cross-schema read of public.pmo_industry_templates* (same Supabase project; migration only)
-- Idempotent: skips industry_code already present; publishes unsynced industry_plan rows
-- =============================================================================

-- v166 payload CHECK (array OR object). Safe if v166 was skipped / only partially applied.
ALTER TABLE admin.global_template_library
    DROP CONSTRAINT IF EXISTS chk_gtl_payload_array;

ALTER TABLE admin.global_template_library
    DROP CONSTRAINT IF EXISTS chk_gtl_payload_array_or_object;

ALTER TABLE admin.global_template_library
    ADD CONSTRAINT chk_gtl_payload_array_or_object
    CHECK (jsonb_typeof(payload) IN ('array', 'object'));

COMMENT ON COLUMN admin.global_template_library.payload IS
    'domain=fields: JSON array of field rows. domain=industry_plan: JSON object with industry_code + child arrays.';

-- ---------------------------------------------------------------------------
-- Monorepo v774 (embedded): many current industry_plan nodes per account/scope
-- Old index omitted domain_ref_id → 2nd publish always failed with 23505.
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS public.uq_pm_template_nodes_current_scope;
CREATE UNIQUE INDEX uq_pm_template_nodes_current_scope
    ON public.pm_template_nodes (
        account_id,
        tier,
        domain,
        COALESCE(scope_entity_type, ''),
        COALESCE(scope_entity_id, '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE(domain_ref_id, '00000000-0000-0000-0000-000000000000'::uuid)
    )
    WHERE is_current = TRUE;

DROP INDEX IF EXISTS sim.uq_sim_pm_template_nodes_current_scope;
CREATE UNIQUE INDEX uq_sim_pm_template_nodes_current_scope
    ON sim.pm_template_nodes (
        account_id,
        tier,
        domain,
        COALESCE(scope_entity_type, ''),
        COALESCE(scope_entity_id, '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE(domain_ref_id, '00000000-0000-0000-0000-000000000000'::uuid)
    )
    WHERE is_current = TRUE;

DO $$
DECLARE
    v_admin UUID;
    v_inserted INT := 0;
    v_published INT := 0;
    v_charter_id UUID := 'a1650000-1111-4000-8000-000000000001'::uuid;
    v_row RECORD;
    v_sync JSONB;
    v_publish_src TEXT;
    v_idxdef TEXT;
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'sync_global_template_node'
    ) THEN
        RAISE EXCEPTION
            'v167: public.sync_global_template_node missing — apply monorepo SQL/v773 before this script';
    END IF;

    SELECT pg_get_indexdef(i.indexrelid)
    INTO v_idxdef
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indexrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'uq_pm_template_nodes_current_scope'
    LIMIT 1;

    IF v_idxdef IS NULL OR position('domain_ref_id' IN v_idxdef) = 0 THEN
        RAISE EXCEPTION
            'v167: uq_pm_template_nodes_current_scope still lacks domain_ref_id after recreate — aborting';
    END IF;

    SELECT pg_get_functiondef(p.oid)
    INTO v_publish_src
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'admin'
      AND p.proname = 'publish_global_template'
    LIMIT 1;

    IF v_publish_src IS NULL OR position('industry_plan' IN v_publish_src) = 0 THEN
        RAISE EXCEPTION
            'v167: admin.publish_global_template does not support industry_plan — apply Admin SQL/v166 first';
    END IF;

    SELECT au.id
    INTO v_admin
    FROM admin.admin_users au
    WHERE au.role = 'super_admin'
      AND au.activation_status = 'active'
    ORDER BY au.created_at NULLS LAST, au.id
    LIMIT 1;

    IF v_admin IS NULL THEN
        RAISE EXCEPTION 'v167: no active super_admin in admin.admin_users — cannot attribute publish audit';
    END IF;

    -- -------------------------------------------------------------------------
    -- 1) Insert missing industry_plan Global Templates from Platform catalog
    -- -------------------------------------------------------------------------
    WITH industries AS (
        SELECT
            t.id,
            t.industry_code,
            t.industry_name,
            t.description,
            t.typical_duration,
            t.icon,
            t.tags
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
                    WHERE p.template_id = i.id
                      AND COALESCE(p.is_active, TRUE) = TRUE
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
                    WHERE a.template_id = i.id
                      AND COALESCE(a.is_active, TRUE) = TRUE
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
                    WHERE d.template_id = i.id
                      AND COALESCE(d.is_active, TRUE) = TRUE
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
                    WHERE r.template_id = i.id
                      AND COALESCE(r.is_active, TRUE) = TRUE
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
                    WHERE m.template_id = i.id
                      AND COALESCE(m.is_active, TRUE) = TRUE
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
                    WHERE rol.template_id = i.id
                      AND COALESCE(rol.is_active, TRUE) = TRUE
                ), '[]'::jsonb)
            ) AS payload
        FROM industries i
    ),
    inserted AS (
        INSERT INTO admin.global_template_library (
            domain,
            category,
            name,
            description,
            payload,
            record_status,
            record_version,
            created_by,
            updated_by
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

    -- -------------------------------------------------------------------------
    -- 2) Publish unsynced industry_plan rows (new + heal partial prior runs)
    -- -------------------------------------------------------------------------
    FOR v_row IN
        SELECT g.id, g.name, g.payload->>'industry_code' AS industry_code
        FROM admin.global_template_library g
        WHERE g.domain = 'industry_plan'
          AND g.record_status = 'live'
          AND g.synced_at IS NULL
        ORDER BY g.name, g.id
    LOOP
        v_sync := admin.publish_global_template(
            v_row.id,
            v_admin,
            'Bulk-populated from existing Platform industry catalog'
        );
        v_published := v_published + 1;
        RAISE NOTICE 'v167: published industry_plan % (%) → %',
            v_row.industry_code, v_row.name, v_sync;
    END LOOP;

    -- -------------------------------------------------------------------------
    -- 3) Publish Project Charter Core Fields if not yet synced (manual todo)
    -- -------------------------------------------------------------------------
    IF EXISTS (
        SELECT 1
        FROM admin.global_template_library g
        WHERE g.id = v_charter_id
          AND g.domain = 'fields'
          AND g.record_status = 'live'
          AND g.synced_at IS NULL
    ) THEN
        v_sync := admin.publish_global_template(
            v_charter_id,
            v_admin,
            'Bulk publish — Project Charter Core Fields (v167)'
        );
        RAISE NOTICE 'v167: published Project Charter Core Fields → %', v_sync;
    ELSE
        RAISE NOTICE 'v167: Project Charter Core Fields already synced or missing — skipped';
    END IF;

    RAISE NOTICE 'v167 complete: inserted=% published_industry_plan=% actor=%',
        v_inserted, v_published, v_admin;
END $$;
