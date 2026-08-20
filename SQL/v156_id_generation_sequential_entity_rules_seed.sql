-- ============================================================================
-- v156: Sequential ID generation rules for migrated Platform/Simulator entities
-- Admin schema — Step A of v755 migration plan
-- Prerequisites: v155_id_generation_sequential_mode.sql
-- Companion: project-nidus SQL/v756* trigger migrations
-- ============================================================================

CREATE TEMP TABLE IF NOT EXISTS _v156_id_gen_rules (
    target_table TEXT PRIMARY KEY,
    table_abbreviation VARCHAR(4) NOT NULL,
    table_description TEXT NOT NULL,
    include_date BOOLEAN NOT NULL DEFAULT FALSE,
    date_format TEXT,
    scope_column TEXT,
    num_digits INTEGER NOT NULL DEFAULT 3,
    separator VARCHAR(2) NOT NULL DEFAULT '-'
);

TRUNCATE _v156_id_gen_rules;

INSERT INTO _v156_id_gen_rules (
    target_table, table_abbreviation, table_description,
    include_date, date_format, scope_column, num_digits, separator
) VALUES
    ('public.risk_registers', 'RR', 'Risk register header references', TRUE, 'YYYY', NULL, 3, '-'),
    ('public.risks', 'R', 'Risk identifiers', TRUE, 'YYYY', 'risk_register_id', 3, '-'),
    ('sim.practice_risk_register', 'RRS', 'Simulator practice risk register references', TRUE, 'YYYY', NULL, 3, '-'),
    ('sim.practice_risks', 'RSK', 'Simulator practice risk codes', TRUE, 'YYYY', 'practice_risk_register_id', 3, '-'),
    ('public.issue_registers', 'IR', 'Issue register header references', TRUE, 'YYYY', NULL, 3, '-'),
    ('public.issues', 'ISS', 'Issue identifiers', TRUE, 'YYYY', 'issue_register_id', 3, '-'),
    ('public.issue_reports', 'ISR', 'Issue report references', FALSE, NULL, 'issue_id', 3, '-'),
    ('sim.practice_issue_register', 'IRS', 'Simulator practice issue register references', TRUE, 'YYYY', NULL, 3, '-'),
    ('sim.practice_issues', 'ISU', 'Simulator practice issue identifiers', TRUE, 'YYYY', 'practice_issue_register_id', 3, '-'),
    ('sim.practice_issue_reports', 'IPR', 'Simulator practice issue report references', FALSE, NULL, 'practice_issue_id', 3, '-'),
    ('public.checkpoint_reports', 'CPR', 'Checkpoint report document references', FALSE, NULL, 'project_id', 3, '-'),
    ('public.highlight_reports', 'HLR', 'Highlight report references', FALSE, NULL, 'project_id', 3, '-'),
    ('public.exception_reports', 'EXR', 'Exception report document references', FALSE, NULL, 'project_id', 3, '-'),
    ('public.end_stage_reports', 'ESR', 'End stage report references', FALSE, NULL, 'project_id', 3, '-'),
    ('public.end_project_reports', 'EPR', 'End project report document references', FALSE, NULL, 'project_id', 3, '-'),
    ('sim.practice_checkpoint_reports', 'SCPR', 'Simulator checkpoint report references', FALSE, NULL, 'practice_project_id', 3, '-'),
    ('sim.practice_highlight_reports', 'SHLR', 'Simulator highlight report references', FALSE, NULL, 'practice_project_id', 3, '-'),
    ('sim.practice_exception_reports', 'SEXR', 'Simulator exception report references', FALSE, NULL, 'practice_project_id', 3, '-'),
    ('sim.practice_end_stage_reports', 'SESR', 'Simulator end stage report references', FALSE, NULL, 'practice_project_id', 3, '-'),
    ('sim.practice_end_project_reports', 'SEPR', 'Simulator end project report references', FALSE, NULL, 'practice_project_id', 3, '-'),
    ('public.risk_management_strategies', 'RMS', 'Risk management strategy references', TRUE, 'YYYY', NULL, 3, '-'),
    ('public.configuration_management_strategies', 'CFMG', 'Configuration management strategy references', TRUE, 'YYYY', NULL, 3, '-'),
    ('public.communication_management_strategies', 'CMS', 'Communication management strategy references', TRUE, 'YYYY', NULL, 3, '-'),
    ('public.quality_management_strategies', 'QMS', 'Quality management strategy references', TRUE, 'YYYY', NULL, 3, '-'),
    ('sim.practice_risk_management_strategies', 'SRMS', 'Simulator RMS references', TRUE, 'YYYY', NULL, 3, '-'),
    ('sim.practice_configuration_management_strategies', 'SCFM', 'Simulator configuration mgmt strategy references', TRUE, 'YYYY', NULL, 3, '-'),
    ('sim.practice_communication_management_strategies', 'SCMS', 'Simulator communication mgmt strategy references', TRUE, 'YYYY', NULL, 3, '-'),
    ('sim.practice_quality_management_strategies', 'SQMS', 'Simulator quality mgmt strategy references', TRUE, 'YYYY', NULL, 3, '-'),
    ('public.product_descriptions', 'PD', 'Product description references', TRUE, 'YYYY', NULL, 3, '-'),
    ('public.product_status_accounts', 'PSA', 'Product status account references', TRUE, 'YYYY', NULL, 3, '-'),
    ('public.project_product_descriptions', 'PPD', 'Project product description references', TRUE, 'YYYY', NULL, 3, '-'),
    ('public.configuration_items', 'CI', 'Configuration item identifiers', FALSE, NULL, 'project_id', 3, '-'),
    ('public.pd_acceptance_criteria', 'PAC', 'Product description acceptance criteria references', FALSE, NULL, 'product_description_id', 3, '-'),
    ('public.ppd_acceptance_criteria', 'PPAC', 'PPD acceptance criteria references', FALSE, NULL, 'ppd_id', 3, '-'),
    ('sim.practice_product_descriptions', 'SPD', 'Simulator product description references', TRUE, 'YYYY', NULL, 3, '-'),
    ('sim.practice_product_status_accounts', 'SPSA', 'Simulator product status account references', TRUE, 'YYYY', NULL, 3, '-'),
    ('sim.practice_project_product_descriptions', 'SPPD', 'Simulator project product description references', TRUE, 'YYYY', NULL, 3, '-'),
    ('sim.practice_configuration_item_records', 'SCI', 'Simulator configuration item identifiers', FALSE, NULL, 'practice_project_id', 3, '-'),
    ('public.project_initiation_documents', 'PID', 'Project initiation document references', TRUE, 'YYYY', NULL, 3, '-'),
    ('public.pid_objectives', 'OBJ', 'PID objective references', FALSE, NULL, 'pid_id', 3, '-'),
    ('public.project_plans', 'PP', 'Project plan references', TRUE, 'YYYY', NULL, 3, '-'),
    ('public.stage_plans', 'SP', 'Stage plan references', TRUE, 'YYYY', 'project_id', 3, '-'),
    ('public.work_packages', 'WP', 'Work package references', TRUE, 'YYYY', NULL, 3, '-'),
    ('public.wp_quality_criteria', 'WQC', 'Work package quality criteria references', FALSE, NULL, 'work_package_id', 3, '-'),
    ('public.wp_acceptance_criteria', 'WAC', 'Work package acceptance criteria references', FALSE, NULL, 'work_package_id', 3, '-'),
    ('public.project_mandates', 'MAN', 'Project mandate references', TRUE, 'YYYY', NULL, 3, '-'),
    ('public.project_briefs', 'PB', 'Project brief references', TRUE, 'YYYY', NULL, 3, '-'),
    ('sim.project_mandates', 'SMAN', 'Simulator mandate references', TRUE, 'YYYY', NULL, 3, '-'),
    ('sim.practice_project_initiation_documents', 'SPID', 'Simulator PID references', TRUE, 'YYYY', NULL, 3, '-'),
    ('sim.practice_project_plans', 'SPP', 'Simulator project plan references', TRUE, 'YYYY', NULL, 3, '-'),
    ('sim.practice_stage_plans', 'SSP', 'Simulator stage plan references', TRUE, 'YYYY', 'practice_project_id', 3, '-'),
    ('sim.practice_work_packages', 'SWP', 'Simulator work package codes', TRUE, 'YYYY', NULL, 3, '-'),
    ('sim.practice_project_briefs', 'SPB', 'Simulator project brief references', TRUE, 'YYYY', NULL, 3, '-'),
    ('public.daily_logs', 'DL', 'Daily log references', TRUE, 'YYYY', NULL, 3, '-'),
    ('public.lessons_logs', 'LL', 'Lessons log references', TRUE, 'YYYY', NULL, 3, '-'),
    ('public.lessons_learned', 'L', 'Lesson references', TRUE, 'YYYY', 'lessons_log_id', 3, '-'),
    ('public.lessons_reports', 'LSR', 'Lessons report references', FALSE, NULL, 'project_id', 3, '-'),
    ('public.quality_reviews', 'QARV', 'Quality review activity identifiers', TRUE, 'YYYY', NULL, 4, '-'),
    ('public.quality_inspections', 'QAIN', 'Quality inspection activity identifiers', TRUE, 'YYYY', NULL, 4, '-'),
    ('sim.practice_daily_logs', 'SDL', 'Simulator daily log references', TRUE, 'YYYY', NULL, 3, '-'),
    ('sim.practice_lessons_log', 'SLL', 'Simulator lessons log references', TRUE, 'YYYY', NULL, 3, '-'),
    ('sim.practice_lesson_entries', 'SL', 'Simulator lesson entry references', TRUE, 'YYYY', 'practice_lessons_log_id', 3, '-'),
    ('sim.practice_lessons_reports', 'SLSR', 'Simulator lessons report references', FALSE, NULL, 'practice_project_id', 3, '-'),
    ('sim.practice_quality_activities', 'SQAC', 'Simulator quality activity identifiers', TRUE, 'YYYY', NULL, 4, '-'),
    ('public.business_cases', 'BC', 'Business case references', TRUE, 'YYYY', NULL, 3, '-'),
    ('public.portfolios', 'PORT', 'Portfolio codes', FALSE, NULL, NULL, 4, '-'),
    ('public.support_tickets', 'TKT', 'Support ticket numbers', TRUE, 'YYYYMMDD', NULL, 5, '-'),
    ('public.accounts', 'ACC', 'Account codes', FALSE, NULL, NULL, 3, ''),
    ('sim.practice_business_cases', 'PBC', 'Simulator business case references', TRUE, 'YYYY', NULL, 3, '-'),
    ('sim.practice_portfolios', 'SPRT', 'Simulator portfolio codes', TRUE, 'YYYY', NULL, 3, '-'),
    ('public.form_instances', 'FI', 'Form instance references', TRUE, 'YYYY', 'project_id', 3, '-'),
    ('sim.form_instances', 'SFI', 'Simulator form instance references', TRUE, 'YYYY', 'project_id', 3, '-');

DO $$
DECLARE
    v_admin UUID;
    r RECORD;
    v_rule_id UUID;
BEGIN
    SELECT id INTO v_admin
    FROM admin.admin_users
    WHERE role = 'super_admin'
      AND activation_status = 'active'
    ORDER BY created_at
    LIMIT 1;

    FOR r IN SELECT * FROM _v156_id_gen_rules ORDER BY target_table LOOP
        SELECT id INTO v_rule_id
        FROM admin.id_generation_rules
        WHERE target_table = r.target_table
        LIMIT 1;

        IF v_rule_id IS NOT NULL THEN
            PERFORM admin.update_id_generation_rule(
                v_rule_id,
                r.target_table,
                r.table_abbreviation,
                r.table_description,
                r.separator,
                '',
                'uppercase',
                'numeric',
                0,
                r.num_digits,
                '',
                1,
                TRUE,
                v_admin,
                'sequential',
                r.include_date,
                r.date_format,
                r.scope_column
            );
        ELSE
            PERFORM admin.create_id_generation_rule(
                r.target_table,
                r.table_abbreviation,
                r.table_description,
                r.separator,
                '',
                'uppercase',
                'numeric',
                0,
                r.num_digits,
                '',
                1,
                TRUE,
                v_admin,
                'sequential',
                r.include_date,
                r.date_format,
                r.scope_column
            );
        END IF;
    END LOOP;
END $$;

DROP TABLE IF EXISTS _v156_id_gen_rules;

DO $$
BEGIN
    RAISE NOTICE 'v156_id_generation_sequential_entity_rules_seed.sql applied';
END $$;
