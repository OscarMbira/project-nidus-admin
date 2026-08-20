-- =============================================================================
-- v174b: Author F001–F068 as Global Template Library form_template rows
-- Plan: projectplans/v173_global_template_library_domain_coverage_plan.md Part C
-- Prerequisites: public.form_templates seeded (monorepo v506); Admin v174; v777 sync
-- Idempotent: skips existing payload.template_code; optional publish of new rows
-- =============================================================================

DO $$
DECLARE
    v_admin UUID;
    v_rec RECORD;
    v_id UUID;
    v_payload JSONB;
    v_category TEXT;
    v_schema JSONB;
    v_inserted INT := 0;
    v_published INT := 0;
    v_sync JSONB;
BEGIN
    SELECT au.id INTO v_admin
    FROM admin.admin_users au
    WHERE au.role = 'super_admin' AND au.activation_status = 'active'
    ORDER BY au.created_at NULLS LAST, au.id
    LIMIT 1;

    IF v_admin IS NULL THEN
        RAISE EXCEPTION 'v174b: no active super_admin';
    END IF;

    FOR v_rec IN
        SELECT
            t.template_code,
            t.name,
            t.process_group,
            t.is_active,
            COALESCE(v.schema, '{}'::jsonb) AS schema
        FROM public.form_templates t
        LEFT JOIN LATERAL (
            SELECT fv.schema
            FROM public.form_template_versions fv
            WHERE fv.template_id = t.id AND fv.is_current = TRUE
            ORDER BY fv.version_number DESC
            LIMIT 1
        ) v ON TRUE
        WHERE COALESCE(t.is_active, TRUE) = TRUE
        ORDER BY t.template_code
    LOOP
        IF EXISTS (
            SELECT 1
            FROM admin.global_template_library g
            WHERE g.domain = 'form_template'
              AND g.record_status <> 'history'
              AND g.payload->>'template_code' = v_rec.template_code
        ) THEN
            CONTINUE;
        END IF;

        v_category := CASE v_rec.process_group
            WHEN 'initiating' THEN 'Initiating'
            WHEN 'planning' THEN 'Planning'
            WHEN 'executing' THEN 'Executing'
            WHEN 'monitoring_controlling' THEN 'Monitoring & Controlling'
            WHEN 'closing' THEN 'Closing'
            WHEN 'agile' THEN 'Agile'
            ELSE initcap(replace(v_rec.process_group, '_', ' '))
        END;

        v_schema := COALESCE(v_rec.schema, jsonb_build_object(
            'title', v_rec.name,
            'sections', jsonb_build_array(
                jsonb_build_object(
                    'key', 'general',
                    'title', 'General',
                    'fields', jsonb_build_array(
                        jsonb_build_object('key', 'title', 'label', 'Title', 'type', 'text'),
                        jsonb_build_object('key', 'description', 'label', 'Description', 'type', 'textarea')
                    )
                )
            )
        ));

        v_payload := jsonb_build_object(
            'template_code', v_rec.template_code,
            'name', v_rec.name,
            'process_group', v_rec.process_group,
            'is_active', COALESCE(v_rec.is_active, TRUE),
            'schema', v_schema
        );

        v_id := admin.create_global_template(
            'form_template',
            v_rec.name,
            'Global form template ' || v_rec.template_code,
            v_category,
            v_payload,
            v_admin
        );
        v_inserted := v_inserted + 1;

        BEGIN
            v_sync := admin.publish_global_template(
                v_id,
                v_admin,
                'v174b seed publish ' || v_rec.template_code
            );
            v_published := v_published + 1;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'v174b: created % but publish failed: %', v_rec.template_code, SQLERRM;
        END;
    END LOOP;

    RAISE NOTICE 'v174b complete: inserted=%, published=%', v_inserted, v_published;
END $$;
