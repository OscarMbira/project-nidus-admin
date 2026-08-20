-- =============================================================================
-- v182: Seed required_skills on Global Template Library industry_plan activities
-- Companion to v181 Industry Plan grid editor (Required skills / competencies)
-- Target: admin.global_template_library WHERE domain = 'industry_plan'
-- Idempotent:
--   - Only adds skills that are not already present on that activity (case-insensitive)
--   - Never clears or replaces an existing non-empty skill list with a shorter set
--   - Safe to re-run
-- =============================================================================

DO $$
DECLARE
    v_row RECORD;
    v_activities JSONB;
    v_activity JSONB;
    v_idx INT;
    v_name TEXT;
    v_type TEXT;
    v_resource TEXT;
    v_industry TEXT;
    v_existing JSONB;
    v_suggested TEXT[];
    v_merged TEXT[];
    v_skill TEXT;
    v_lower TEXT;
    v_have TEXT[];
    v_updated_acts INT := 0;
    v_updated_tpl INT := 0;
    v_new_skills INT := 0;
BEGIN
    FOR v_row IN
        SELECT id, name, payload
        FROM admin.global_template_library
        WHERE domain = 'industry_plan'
          AND jsonb_typeof(payload) = 'object'
          AND jsonb_typeof(payload -> 'activities') = 'array'
    LOOP
        v_industry := lower(trim(COALESCE(v_row.payload ->> 'industry_code', '')));
        v_activities := v_row.payload -> 'activities';

        FOR v_idx IN 0 .. GREATEST(jsonb_array_length(v_activities) - 1, -1)
        LOOP
            v_activity := v_activities -> v_idx;
            v_name := lower(trim(COALESCE(v_activity ->> 'activity_name', '')));
            v_type := lower(trim(COALESCE(v_activity ->> 'activity_type', '')));
            v_resource := lower(trim(COALESCE(v_activity ->> 'resource_type', '')));

            -- Existing skills on this activity (preserve as-is; only append missing)
            IF jsonb_typeof(v_activity -> 'required_skills') = 'array' THEN
                v_existing := v_activity -> 'required_skills';
            ELSE
                v_existing := '[]'::jsonb;
            END IF;

            v_have := ARRAY(
                SELECT lower(trim(x))
                FROM jsonb_array_elements_text(v_existing) AS t(x)
                WHERE trim(x) <> ''
            );

            -- Base suggestions by industry (construction is the screenshot case)
            IF v_industry = 'construction' THEN
                v_suggested := ARRAY[
                    'Construction programme management',
                    'Stakeholder communication',
                    'Health & safety compliance',
                    'Change control',
                    'Quality assurance review'
                ];
            ELSIF v_industry IN ('software_development', 'ict') THEN
                v_suggested := ARRAY[
                    'Requirements elicitation',
                    'Agile delivery facilitation',
                    'Stakeholder communication',
                    'Risk & issue management',
                    'Technical design review'
                ];
            ELSIF v_industry = 'financial_services' THEN
                v_suggested := ARRAY[
                    'Regulatory compliance awareness',
                    'Stakeholder communication',
                    'Change control',
                    'Risk & issue management',
                    'Business process mapping'
                ];
            ELSE
                v_suggested := ARRAY[
                    'Stakeholder communication',
                    'Risk & issue management',
                    'Change control',
                    'Schedule management',
                    'Quality assurance review'
                ];
            END IF;

            -- Activity-name / type heuristics (additive)
            IF v_name ~ 'close[- ]?out|handover|sign[- ]?off|completion' THEN
                v_suggested := v_suggested || ARRAY[
                    'Phase gate facilitation',
                    'Close-out documentation',
                    'Lessons learned facilitation',
                    'Handover coordination'
                ];
            END IF;

            IF v_name ~ 'foundation|groundwork|geotech' THEN
                v_suggested := v_suggested || ARRAY[
                    'Geotechnical hold-point review',
                    'Foundation inspection',
                    'Site supervision'
                ];
            END IF;

            IF v_name ~ 'structure|topping|steel|frame' THEN
                v_suggested := v_suggested || ARRAY[
                    'Structural engineering',
                    'Temporary works control',
                    'Site supervision'
                ];
            END IF;

            IF v_name ~ 'mep|fit[- ]?out|commission' THEN
                v_suggested := v_suggested || ARRAY[
                    'MEP coordination',
                    'Commissioning coordination',
                    'Snagging management'
                ];
            END IF;

            IF v_name ~ 'procurement|tender|supplier|contract' THEN
                v_suggested := v_suggested || ARRAY[
                    'Procurement governance',
                    'Contract administration',
                    'Commercial awareness'
                ];
            END IF;

            IF v_name ~ 'pre[- ]?construction|survey|planning permission|design' THEN
                v_suggested := v_suggested || ARRAY[
                    'Design coordination',
                    'Survey coordination',
                    'Planning permission coordination'
                ];
            END IF;

            IF v_name ~ 'finish|snag|defect' THEN
                v_suggested := v_suggested || ARRAY[
                    'Snagging management',
                    'Defects liability management',
                    'Soft landings facilitation'
                ];
            END IF;

            IF v_type IN ('deliverable', 'review', 'approval', 'milestone') THEN
                v_suggested := v_suggested || ARRAY[
                    'Document control',
                    'Acceptance criteria definition'
                ];
            END IF;

            IF v_resource ~ 'project manager|programme manager|pmo' THEN
                v_suggested := v_suggested || ARRAY[
                    'Project controls reporting',
                    'Cost reporting',
                    'Schedule baselining'
                ];
            END IF;

            IF v_resource ~ 'engineer|surveyor|consultant' THEN
                v_suggested := v_suggested || ARRAY[
                    'Technical design review',
                    'Site supervision'
                ];
            END IF;

            -- Merge: keep existing order, append novel skills only
            v_merged := ARRAY(
                SELECT trim(x)
                FROM jsonb_array_elements_text(v_existing) AS t(x)
                WHERE trim(x) <> ''
            );

            FOREACH v_skill IN ARRAY v_suggested
            LOOP
                v_skill := trim(v_skill);
                IF v_skill = '' THEN
                    CONTINUE;
                END IF;
                v_lower := lower(v_skill);
                IF v_lower = ANY (v_have) THEN
                    CONTINUE;
                END IF;
                -- Also skip if already queued in this merge (dedupe suggestions)
                IF EXISTS (
                    SELECT 1 FROM unnest(v_merged) AS m(s) WHERE lower(trim(s)) = v_lower
                ) THEN
                    CONTINUE;
                END IF;
                v_merged := array_append(v_merged, v_skill);
                v_have := array_append(v_have, v_lower);
                v_new_skills := v_new_skills + 1;
            END LOOP;

            -- Cap newly seeded length at 8; never truncate skills the admin already saved
            IF cardinality(v_merged) > 8 THEN
                IF cardinality(ARRAY(
                    SELECT trim(x)
                    FROM jsonb_array_elements_text(v_existing) AS t(x)
                    WHERE trim(x) <> ''
                )) >= 8 THEN
                    -- Keep existing list unchanged when already at/above cap
                    v_merged := ARRAY(
                        SELECT trim(x)
                        FROM jsonb_array_elements_text(v_existing) AS t(x)
                        WHERE trim(x) <> ''
                    );
                ELSE
                    v_merged := v_merged[1:8];
                END IF;
            END IF;

            IF to_jsonb(v_merged) IS DISTINCT FROM v_existing THEN
                v_activities := jsonb_set(
                    v_activities,
                    ARRAY[v_idx::text, 'required_skills'],
                    to_jsonb(v_merged),
                    true
                );
                v_updated_acts := v_updated_acts + 1;
            END IF;
        END LOOP;

        IF v_activities IS DISTINCT FROM (v_row.payload -> 'activities') THEN
            UPDATE admin.global_template_library
            SET
                payload = jsonb_set(payload, '{activities}', v_activities, true),
                updated_at = NOW()
            WHERE id = v_row.id;
            v_updated_tpl := v_updated_tpl + 1;
            RAISE NOTICE 'v182: updated % (%) — activities touched this pass',
                v_row.name, v_industry;
        END IF;
    END LOOP;

    RAISE NOTICE 'v182 complete: templates=%, activities_updated=%, skills_appended=%',
        v_updated_tpl, v_updated_acts, v_new_skills;
END $$;

-- Smoke: distinct skills now available for the Construction MultiSearchableSelect
-- SELECT
--     payload ->> 'industry_code' AS industry_code,
--     a ->> 'activity_name' AS activity_name,
--     a -> 'required_skills' AS required_skills
-- FROM admin.global_template_library g
-- CROSS JOIN LATERAL jsonb_array_elements(g.payload -> 'activities') AS a
-- WHERE g.domain = 'industry_plan'
--   AND g.payload ->> 'industry_code' = 'construction'
--   AND (a ->> 'activity_name') ILIKE '%close%out%'
-- ORDER BY a ->> 'activity_name';
