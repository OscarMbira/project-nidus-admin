-- =============================================================================
-- v188b: Process Template seeds — at least 10 records per methodology category
-- Plan: projectplans/v188_global_templates_level_first_menu_plan.md (follow-up)
-- Prerequisites: v185 (methodology column); optional v188 (partial Agile/Structured)
-- Idempotent: tops up to 10 per (methodology, category); fixed UUIDs; re-run safe
-- document_type values must remain in sync RPC allow-list (v777/v783).
-- =============================================================================

DO $$
DECLARE
    v_rec RECORD;
    v_have INT;
    v_need INT;
    v_i INT;
    v_id UUID;
    v_name TEXT;
    v_seed_key TEXT;
    v_doc_type TEXT;
    v_inserted INT := 0;
    v_methodology_label TEXT;
BEGIN
    FOR v_rec IN
        SELECT * FROM (VALUES
            -- Agile ceremonies (5)
            ('agile', 'Backlog', 'requirements_documentation', 101),
            ('agile', 'Sprint Planning', 'project_management_plans', 102),
            ('agile', 'Sprint Execution', 'team_performance_assessments', 103),
            ('agile', 'Review & Retrospective', 'scope_acceptance_forms', 104),
            ('agile', 'Release', 'project_closure_checklists', 105),
            -- Structured stages (7)
            ('structured', 'Starting Up', 'project_charters', 201),
            ('structured', 'Directing', 'make_or_buy_decisions', 202),
            ('structured', 'Initiating', 'project_management_plans', 203),
            ('structured', 'Controlling a Stage', 'evm_status_reports', 204),
            ('structured', 'Managing Product Delivery', 'activity_attributes', 205),
            ('structured', 'Managing a Stage Boundary', 'scope_acceptance_forms', 206),
            ('structured', 'Closing', 'project_closure_checklists', 207),
            -- Standards-Based phases — top up thin categories (Planning already has many from v176)
            -- Rule 26/27: never write the PMBOK trademark into methodology/name/description.
            ('standards_based', 'Initiating', 'project_charters', 301),
            ('standards_based', 'Planning', 'assumption_logs', 302),
            ('standards_based', 'Executing', 'team_performance_assessments', 303),
            ('standards_based', 'Monitoring & Controlling', 'variance_analysis_reports', 304),
            ('standards_based', 'Closing', 'project_closure_checklists', 305)
        ) AS t(methodology, category, document_type, uuid_group)
    LOOP
        -- Display label decoupled from the internal enum value — initcap() on the raw
        -- enum would render 'standards_based' as 'Standards_based' (and previously
        -- rendered the old 'pmbok' value as the trademarked 'Pmbok').
        v_methodology_label := CASE v_rec.methodology
            WHEN 'standards_based' THEN 'Standards-Based'
            WHEN 'structured' THEN 'Structured'
            WHEN 'agile' THEN 'Agile'
            ELSE initcap(v_rec.methodology)
        END;

        SELECT COUNT(*) INTO v_have
        FROM admin.global_template_library g
        WHERE g.domain = 'process_template'
          AND g.record_status <> 'history'
          AND g.methodology = v_rec.methodology
          AND g.category = v_rec.category;

        v_need := GREATEST(0, 10 - v_have);
        IF v_need = 0 THEN
            CONTINUE;
        END IF;

        FOR v_i IN 1..v_need LOOP
            -- Fixed UUID: a188b000-0000-4000-8000-{uuid_group:03}{seq:09}
            v_id := (
                'a188b000-0000-4000-8000-'
                || lpad((v_rec.uuid_group * 1000 + v_i)::text, 12, '0')
            )::uuid;

            v_seed_key := format(
                'seed_pt_%s_%s_%s',
                v_rec.methodology,
                lower(regexp_replace(v_rec.category, '[^a-zA-Z0-9]+', '_', 'g')),
                lpad(v_i::text, 2, '0')
            );
            -- Prefer unique seed_key if this slot already used a different id
            IF EXISTS (
                SELECT 1 FROM admin.global_template_library g
                WHERE g.domain = 'process_template'
                  AND g.record_status <> 'history'
                  AND g.payload->>'seed_key' = v_seed_key
                  AND g.id <> v_id
            ) THEN
                v_seed_key := v_seed_key || '_' || replace(v_id::text, '-', '');
            END IF;

            v_name := format(
                '%s Process Master %s (%s)',
                v_rec.category,
                lpad(v_i::text, 2, '0'),
                v_methodology_label
            );

            -- Rotate document_type slightly within the allow-list for variety
            v_doc_type := CASE (v_i % 5)
                WHEN 1 THEN v_rec.document_type
                WHEN 2 THEN 'quality_checklists'
                WHEN 3 THEN 'stakeholder_engagement_plans'
                WHEN 4 THEN 'activity_duration_estimates'
                ELSE 'resource_management_plans'
            END;
            -- Keep first slot on the category’s primary type
            IF v_i = 1 THEN
                v_doc_type := v_rec.document_type;
            END IF;

            INSERT INTO admin.global_template_library (
                id, domain, name, description, category, methodology, payload,
                record_status, record_version
            ) VALUES (
                v_id,
                'process_template',
                v_name,
                format(
                    'Seeded %s / %s process master (%s of set).',
                    v_methodology_label,
                    v_rec.category,
                    v_i
                ),
                v_rec.category,
                v_rec.methodology,
                jsonb_build_object(
                    'seed_key', v_seed_key,
                    'document_type', v_doc_type,
                    'title', v_name,
                    'description', format(
                        'Seeded %s / %s process master.',
                        v_methodology_label,
                        v_rec.category
                    ),
                    'status', 'active',
                    'document_data', jsonb_build_object(
                        'purpose', format('Support %s work under the %s track.', v_rec.category, v_rec.methodology),
                        'owner_role', CASE v_rec.methodology
                            WHEN 'agile' THEN 'Scrum Master / Product Owner'
                            WHEN 'structured' THEN 'Project Manager'
                            ELSE 'PMO / Project Manager'
                        END,
                        'review_cadence', CASE v_rec.methodology
                            WHEN 'agile' THEN 'Per sprint / ceremony'
                            WHEN 'structured' THEN 'Per stage / checkpoint'
                            ELSE 'Per process group gate'
                        END,
                        'sample_notes', 'Global seed process master — edit after create.'
                    )
                ),
                'live',
                1
            )
            ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                description = EXCLUDED.description,
                category = EXCLUDED.category,
                methodology = EXCLUDED.methodology,
                payload = EXCLUDED.payload,
                updated_at = NOW()
            WHERE admin.global_template_library.domain = 'process_template';

            v_inserted := v_inserted + 1;
        END LOOP;
    END LOOP;

    RAISE NOTICE 'v188b: inserted/updated % process_template top-up row(s)', v_inserted;
END $$;

-- Verification: every Agile / Structured / Standards-Based process category should be >= 10
DO $$
DECLARE
    v_rec RECORD;
    v_bad INT := 0;
BEGIN
    FOR v_rec IN
        SELECT methodology, category, COUNT(*) AS cnt
        FROM admin.global_template_library
        WHERE domain = 'process_template'
          AND record_status <> 'history'
          AND methodology IN ('agile', 'structured', 'standards_based')
          AND category IS NOT NULL
        GROUP BY methodology, category
        ORDER BY methodology, category
    LOOP
        RAISE NOTICE 'v188b check: % / % → %', v_rec.methodology, v_rec.category, v_rec.cnt;
        IF v_rec.cnt < 10 THEN
            v_bad := v_bad + 1;
        END IF;
    END LOOP;

    IF v_bad > 0 THEN
        RAISE WARNING 'v188b: % categor(y/ies) still below 10 — re-run after v185 or inspect filters', v_bad;
    ELSE
        RAISE NOTICE 'v188b: all listed methodology categories have >= 10 process templates';
    END IF;
END $$;
