-- =============================================================================
-- v176: Seed Global Template Library — OPA, process_template, legacy_document,
--       structured_list (domains that showed 0 until now)
-- Prerequisites: Admin v174 (domains), v173 (legacy domains); monorepo sync
--                v777/v778 recommended before publish
-- Idempotent: skips rows with the same domain + payload.seed_key
-- =============================================================================

DO $$
DECLARE
    v_admin UUID;
    v_id UUID;
    v_rec RECORD;
    v_inserted INT := 0;
    v_published INT := 0;
    v_skipped INT := 0;
BEGIN
    SELECT au.id INTO v_admin
    FROM admin.admin_users au
    WHERE au.role = 'super_admin' AND au.activation_status = 'active'
    ORDER BY au.created_at NULLS LAST, au.id
    LIMIT 1;

    IF v_admin IS NULL THEN
        RAISE EXCEPTION 'v176: no active super_admin';
    END IF;

    -- -------------------------------------------------------------------------
    -- OPA samples
    -- -------------------------------------------------------------------------
    FOR v_rec IN
        SELECT * FROM (VALUES
            (
                'seed_opa_change_control',
                'Change Control Procedure',
                'Sample organisational process asset for change control.',
                'Initiating',
                jsonb_build_object(
                    'seed_key', 'seed_opa_change_control',
                    'title', 'Change Control Procedure',
                    'description', 'Defines how project changes are raised, assessed, approved, and implemented.',
                    'opa_type', 'procedure',
                    'version', '1.0',
                    'status', 'active',
                    'tags', jsonb_build_array('change', 'governance'),
                    'notes', 'Global seed OPA — customise after publish.'
                )
            ),
            (
                'seed_opa_risk_policy',
                'Enterprise Risk Management Policy',
                'Sample risk policy OPA for Global library.',
                'Planning',
                jsonb_build_object(
                    'seed_key', 'seed_opa_risk_policy',
                    'title', 'Enterprise Risk Management Policy',
                    'description', 'Organisation-wide risk appetite, escalation thresholds, and reporting cadence.',
                    'opa_type', 'policy',
                    'version', '1.0',
                    'status', 'active',
                    'tags', jsonb_build_array('risk', 'policy'),
                    'notes', 'Global seed OPA.'
                )
            ),
            (
                'seed_opa_quality_standard',
                'Quality Management Standard',
                'Sample quality standard OPA.',
                'Planning',
                jsonb_build_object(
                    'seed_key', 'seed_opa_quality_standard',
                    'title', 'Quality Management Standard',
                    'description', 'Minimum quality gates, review checklists, and acceptance criteria standards.',
                    'opa_type', 'standard',
                    'version', '1.0',
                    'status', 'active',
                    'tags', jsonb_build_array('quality'),
                    'notes', 'Global seed OPA.'
                )
            ),
            (
                'seed_opa_comms_guideline',
                'Stakeholder Communications Guideline',
                'Sample communications guideline OPA.',
                'Executing',
                jsonb_build_object(
                    'seed_key', 'seed_opa_comms_guideline',
                    'title', 'Stakeholder Communications Guideline',
                    'description', 'Recommended channels, frequency, and tone for stakeholder updates.',
                    'opa_type', 'guideline',
                    'version', '1.0',
                    'status', 'active',
                    'tags', jsonb_build_array('communications', 'stakeholders'),
                    'notes', 'Global seed OPA.'
                )
            ),
            (
                'seed_opa_lessons_template',
                'Lessons Learned Capture Template',
                'Sample lessons-learned OPA template.',
                'Closing',
                jsonb_build_object(
                    'seed_key', 'seed_opa_lessons_template',
                    'title', 'Lessons Learned Capture Template',
                    'description', 'Structured prompts for capturing what worked, what failed, and actions for future projects.',
                    'opa_type', 'template',
                    'version', '1.0',
                    'status', 'active',
                    'tags', jsonb_build_array('lessons_learned', 'closing'),
                    'notes', 'Global seed OPA.'
                )
            ),
            (
                'seed_opa_historical_schedule',
                'Historical Schedule Benchmarks',
                'Sample historical information OPA.',
                'Planning',
                jsonb_build_object(
                    'seed_key', 'seed_opa_historical_schedule',
                    'title', 'Historical Schedule Benchmarks',
                    'description', 'Past project duration bands by delivery type for estimating reference.',
                    'opa_type', 'historical_info',
                    'version', '1.0',
                    'status', 'active',
                    'tags', jsonb_build_array('estimating', 'schedule'),
                    'notes', 'Global seed OPA.'
                )
            )
        ) AS t(seed_key, name, description, category, payload)
    LOOP
        IF EXISTS (
            SELECT 1 FROM admin.global_template_library g
            WHERE g.domain = 'opa'
              AND g.record_status <> 'history'
              AND g.payload->>'seed_key' = v_rec.seed_key
        ) THEN
            v_skipped := v_skipped + 1;
            CONTINUE;
        END IF;

        v_id := admin.create_global_template(
            'opa', v_rec.name, v_rec.description, v_rec.category, v_rec.payload, v_admin
        );
        v_inserted := v_inserted + 1;

        BEGIN
            PERFORM admin.publish_global_template(
                v_id, v_admin, 'v176 seed publish ' || v_rec.seed_key
            );
            v_published := v_published + 1;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'v176: OPA % created; publish failed: %', v_rec.seed_key, SQLERRM;
        END;
    END LOOP;

    -- -------------------------------------------------------------------------
    -- Process template masters (24 document types)
    -- -------------------------------------------------------------------------
    FOR v_rec IN
        SELECT * FROM (VALUES
            ('seed_pt_project_charters', 'project_charters', 'Project Charter (Master)', 'Initiating',
             'Authorising document defining purpose, objectives, and high-level requirements.'),
            ('seed_pt_assumption_logs', 'assumption_logs', 'Assumption Log (Master)', 'Planning',
             'Log of assumptions and constraints tracked through the project lifecycle.'),
            ('seed_pt_project_management_plans', 'project_management_plans', 'Project Management Plan (Master)', 'Planning',
             'Integrated plan describing how the project will be executed, monitored, and closed.'),
            ('seed_pt_requirements_management_plans', 'requirements_management_plans', 'Requirements Management Plan (Master)', 'Planning',
             'How requirements will be elicited, analysed, documented, and controlled.'),
            ('seed_pt_requirements_documentation', 'requirements_documentation', 'Requirements Documentation (Master)', 'Planning',
             'Detailed requirements catalogue for scope baseline.'),
            ('seed_pt_wbs_dictionary_entries', 'wbs_dictionary_entries', 'WBS Dictionary (Master)', 'Planning',
             'Detailed descriptions of WBS components.'),
            ('seed_pt_activity_attributes', 'activity_attributes', 'Activity Attributes (Master)', 'Planning',
             'Extended attributes supporting schedule activities.'),
            ('seed_pt_activity_resource_requirements', 'activity_resource_requirements', 'Activity Resource Requirements (Master)', 'Planning',
             'Types and quantities of resources required per activity.'),
            ('seed_pt_resource_breakdown_structure', 'resource_breakdown_structure', 'Resource Breakdown Structure (Master)', 'Planning',
             'Hierarchical representation of resources by category.'),
            ('seed_pt_activity_duration_estimates', 'activity_duration_estimates', 'Activity Duration Estimates (Master)', 'Planning',
             'Estimated work periods for schedule activities.'),
            ('seed_pt_cost_management_plans', 'cost_management_plans', 'Cost Management Plan (Master)', 'Planning',
             'How costs will be planned, structured, and controlled.'),
            ('seed_pt_activity_cost_estimates', 'activity_cost_estimates', 'Activity Cost Estimates (Master)', 'Planning',
             'Probable costs required to complete project work.'),
            ('seed_pt_cost_baselines', 'cost_baselines', 'Cost Baseline (Master)', 'Planning',
             'Approved time-phased budget used for measurement.'),
            ('seed_pt_resource_management_plans', 'resource_management_plans', 'Resource Management Plan (Master)', 'Planning',
             'How project resources are identified, acquired, and managed.'),
            ('seed_pt_stakeholder_engagement_plans', 'stakeholder_engagement_plans', 'Stakeholder Engagement Plan (Master)', 'Planning',
             'Strategies to engage stakeholders based on needs and interest.'),
            ('seed_pt_procurement_management_plans', 'procurement_management_plans', 'Procurement Management Plan (Master)', 'Planning',
             'How goods and services will be acquired from outside the project.'),
            ('seed_pt_quality_checklists', 'quality_checklists', 'Quality Checklist (Master)', 'Planning',
             'Structured checklist verifying required steps have been performed.'),
            ('seed_pt_team_performance_assessments', 'team_performance_assessments', 'Team Performance Assessment (Master)', 'Executing',
             'Evaluation of team effectiveness and development needs.'),
            ('seed_pt_make_or_buy_decisions', 'make_or_buy_decisions', 'Make or Buy Decision (Master)', 'Executing',
             'Analysis supporting whether work is performed in-house or procured.'),
            ('seed_pt_variance_analysis_reports', 'variance_analysis_reports', 'Variance Analysis Report (Master)', 'Monitoring & Controlling',
             'Explains differences between planned and actual performance.'),
            ('seed_pt_evm_status_reports', 'evm_status_reports', 'EVM Status Report (Master)', 'Monitoring & Controlling',
             'Earned value metrics snapshot for performance reporting.'),
            ('seed_pt_scope_acceptance_forms', 'scope_acceptance_forms', 'Scope Acceptance Form (Master)', 'Monitoring & Controlling',
             'Formal acceptance of completed deliverables / scope.'),
            ('seed_pt_project_closure_checklists', 'project_closure_checklists', 'Project Closure Checklist (Master)', 'Closing',
             'Steps to complete administrative and contractual project closure.'),
            ('seed_pt_contract_closure_documents', 'contract_closure_documents', 'Contract Closure Document (Master)', 'Closing',
             'Formal record that a contract has been completed or terminated.')
        ) AS t(seed_key, document_type, name, category, description)
    LOOP
        IF EXISTS (
            SELECT 1 FROM admin.global_template_library g
            WHERE g.domain = 'process_template'
              AND g.record_status <> 'history'
              AND g.payload->>'seed_key' = v_rec.seed_key
        ) THEN
            v_skipped := v_skipped + 1;
            CONTINUE;
        END IF;

        v_id := admin.create_global_template(
            'process_template',
            v_rec.name,
            v_rec.description,
            v_rec.category,
            jsonb_build_object(
                'seed_key', v_rec.seed_key,
                'document_type', v_rec.document_type,
                'title', v_rec.name,
                'description', v_rec.description,
                'status', 'active',
                'document_data', jsonb_build_object(
                    'purpose', v_rec.description,
                    'owner_role', 'PMO',
                    'review_cadence', 'Per stage gate',
                    'sample_notes', 'Global seed process master — edit content after create.'
                )
            ),
            v_admin
        );
        v_inserted := v_inserted + 1;

        BEGIN
            PERFORM admin.publish_global_template(
                v_id, v_admin, 'v176 seed publish ' || v_rec.seed_key
            );
            v_published := v_published + 1;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'v176: process % created; publish failed: %', v_rec.seed_key, SQLERRM;
        END;
    END LOOP;

    -- -------------------------------------------------------------------------
    -- Legacy document samples (placeholder storage paths — replace via Upload)
    -- -------------------------------------------------------------------------
    FOR v_rec IN
        SELECT * FROM (VALUES
            (
                'seed_legacy_sample_charter',
                'Sample Legacy Project Charter',
                'Reference charter PDF stub for Global library demos.',
                'charter',
                jsonb_build_object(
                    'seed_key', 'seed_legacy_sample_charter',
                    'doc_category', 'charter',
                    'original_filename', 'sample-project-charter.pdf',
                    'storage_bucket', 'legacy-templates',
                    'storage_path', 'seed/global/sample-project-charter.pdf',
                    'mime_type', 'application/pdf',
                    'file_size', 1024,
                    'extracted_text',
                      E'SAMPLE PROJECT CHARTER\n\nPurpose: Demonstrate legacy document global template seeding.\nObjectives: Provide a placeholder reference document for Admin library browsing.\nReplace this file via Upload legacy when a real document is available.'
                )
            ),
            (
                'seed_legacy_sample_brd',
                'Sample Legacy BRD',
                'Business requirements document stub for Global library demos.',
                'brd',
                jsonb_build_object(
                    'seed_key', 'seed_legacy_sample_brd',
                    'doc_category', 'brd',
                    'original_filename', 'sample-brd.docx',
                    'storage_bucket', 'legacy-templates',
                    'storage_path', 'seed/global/sample-brd.docx',
                    'mime_type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    'file_size', 2048,
                    'extracted_text',
                      E'SAMPLE BUSINESS REQUIREMENTS DOCUMENT\n\n1. Business need\n2. Stakeholders\n3. Functional requirements\n4. Non-functional requirements\n\nPlaceholder seed content.'
                )
            ),
            (
                'seed_legacy_sample_status',
                'Sample Legacy Status Report',
                'Status report stub for Global library demos.',
                'status_report',
                jsonb_build_object(
                    'seed_key', 'seed_legacy_sample_status',
                    'doc_category', 'status_report',
                    'original_filename', 'sample-status-report.pptx',
                    'storage_bucket', 'legacy-templates',
                    'storage_path', 'seed/global/sample-status-report.pptx',
                    'mime_type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                    'file_size', 3072,
                    'extracted_text',
                      E'SAMPLE STATUS REPORT\n\nPeriod: Sample week\nRAG: Green\nAccomplishments: Seed data created\nRisks: None\nNext steps: Replace with real upload.'
                )
            ),
            (
                'seed_legacy_sample_other',
                'Sample Legacy Lessons Pack',
                'Generic reference document stub.',
                'other',
                jsonb_build_object(
                    'seed_key', 'seed_legacy_sample_other',
                    'doc_category', 'other',
                    'original_filename', 'sample-lessons-pack.pdf',
                    'storage_bucket', 'legacy-templates',
                    'storage_path', 'seed/global/sample-lessons-pack.pdf',
                    'mime_type', 'application/pdf',
                    'file_size', 1536,
                    'extracted_text',
                      E'SAMPLE LESSONS PACK\n\nWhat went well\nWhat to improve\nActions for next programme'
                )
            )
        ) AS t(seed_key, name, description, category, payload)
    LOOP
        IF EXISTS (
            SELECT 1 FROM admin.global_template_library g
            WHERE g.domain = 'legacy_document'
              AND g.record_status <> 'history'
              AND g.payload->>'seed_key' = v_rec.seed_key
        ) THEN
            v_skipped := v_skipped + 1;
            CONTINUE;
        END IF;

        v_id := admin.create_global_template(
            'legacy_document', v_rec.name, v_rec.description, v_rec.category, v_rec.payload, v_admin
        );
        v_inserted := v_inserted + 1;

        BEGIN
            PERFORM admin.publish_global_template(
                v_id, v_admin, 'v176 seed publish ' || v_rec.seed_key
            );
            v_published := v_published + 1;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'v176: legacy % created; publish failed: %', v_rec.seed_key, SQLERRM;
        END;
    END LOOP;

    -- -------------------------------------------------------------------------
    -- Structured list samples (one per list_type)
    -- -------------------------------------------------------------------------
    FOR v_rec IN
        SELECT * FROM (VALUES
            (
                'seed_list_risk_register',
                'risk_register',
                'Sample Risk Register List',
                'Sample structured risk register for Global library demos.',
                jsonb_build_array(
                    jsonb_build_object(
                        'risk_id', 'R-001',
                        'title', 'Key supplier delay',
                        'category', 'External',
                        'likelihood', 'Medium',
                        'impact', 'High',
                        'owner', 'PMO',
                        'response', 'Mitigate — dual-source critical components'
                    ),
                    jsonb_build_object(
                        'risk_id', 'R-002',
                        'title', 'Scope creep in phase 2',
                        'category', 'Scope',
                        'likelihood', 'High',
                        'impact', 'Medium',
                        'owner', 'Project Manager',
                        'response', 'Control — change board gate'
                    )
                )
            ),
            (
                'seed_list_raid_log',
                'raid_log',
                'Sample RAID Log',
                'Sample Risks/Assumptions/Issues/Dependencies list.',
                jsonb_build_array(
                    jsonb_build_object('raid_id', 'A-001', 'type', 'Assumption', 'description', 'Business sponsor remains available weekly', 'owner', 'Sponsor', 'status', 'Open'),
                    jsonb_build_object('raid_id', 'I-001', 'type', 'Issue', 'description', 'UAT environment capacity shortfall', 'owner', 'IT Ops', 'status', 'In progress'),
                    jsonb_build_object('raid_id', 'D-001', 'type', 'Dependency', 'description', 'Data migration completion before cutover', 'owner', 'Data Lead', 'status', 'Open')
                )
            ),
            (
                'seed_list_stakeholder_register',
                'stakeholder_register',
                'Sample Stakeholder Register',
                'Sample stakeholder register structured list.',
                jsonb_build_array(
                    jsonb_build_object('name', 'Alex Sponsor', 'role', 'Executive Sponsor', 'influence', 'High', 'interest', 'High', 'engagement', 'Manage closely'),
                    jsonb_build_object('name', 'Jordan User Lead', 'role', 'Business Lead', 'influence', 'Medium', 'interest', 'High', 'engagement', 'Keep informed')
                )
            ),
            (
                'seed_list_budget',
                'budget',
                'Sample Budget List',
                'Sample budget line items structured list.',
                jsonb_build_array(
                    jsonb_build_object('line_id', 'B-100', 'category', 'Labour', 'description', 'Core delivery team', 'amount', 450000, 'currency', 'USD'),
                    jsonb_build_object('line_id', 'B-200', 'category', 'Software', 'description', 'Licences and tooling', 'amount', 75000, 'currency', 'USD'),
                    jsonb_build_object('line_id', 'B-300', 'category', 'Contingency', 'description', '10% contingency reserve', 'amount', 52500, 'currency', 'USD')
                )
            )
        ) AS t(seed_key, list_type, name, description, rows)
    LOOP
        IF EXISTS (
            SELECT 1 FROM admin.global_template_library g
            WHERE g.domain = 'structured_list'
              AND g.record_status <> 'history'
              AND g.payload->>'seed_key' = v_rec.seed_key
        ) THEN
            v_skipped := v_skipped + 1;
            CONTINUE;
        END IF;

        v_id := admin.create_global_template(
            'structured_list',
            v_rec.name,
            v_rec.description,
            v_rec.list_type,
            jsonb_build_object(
                'seed_key', v_rec.seed_key,
                'list_type', v_rec.list_type,
                'rows', v_rec.rows,
                'column_mapping', '{}'::jsonb
            ),
            v_admin
        );
        v_inserted := v_inserted + 1;

        BEGIN
            PERFORM admin.publish_global_template(
                v_id, v_admin, 'v176 seed publish ' || v_rec.seed_key
            );
            v_published := v_published + 1;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'v176: list % created; publish failed: %', v_rec.seed_key, SQLERRM;
        END;
    END LOOP;

    RAISE NOTICE 'v176 complete: inserted=%, published=%, skipped=%', v_inserted, v_published, v_skipped;
END $$;
