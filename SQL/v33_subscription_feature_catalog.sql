-- ============================================================================
-- v33: Subscription feature catalog (searchable dropdown source)
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v735_01 admin schema, v16 subscription features
-- Idempotent: fixed UUIDs + ON CONFLICT. Safe to re-run.
-- ============================================================================

CREATE TABLE IF NOT EXISTS admin.subscription_feature_catalog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    feature_key VARCHAR(80) NOT NULL UNIQUE,
    feature_label TEXT NOT NULL,
    description TEXT,
    category TEXT,
    target_system TEXT NOT NULL DEFAULT 'both'
        CHECK (target_system IN ('platform', 'simulator', 'both')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (feature_label, target_system)
);

-- Fix deployments that created v33 with a global unique on feature_label only
ALTER TABLE admin.subscription_feature_catalog
    DROP CONSTRAINT IF EXISTS subscription_feature_catalog_feature_label_key;

DROP INDEX IF EXISTS uq_subscription_feature_catalog_label_system;
CREATE UNIQUE INDEX IF NOT EXISTS uq_subscription_feature_catalog_label_system
    ON admin.subscription_feature_catalog (feature_label, target_system);

CREATE INDEX IF NOT EXISTS idx_subscription_feature_catalog_target
    ON admin.subscription_feature_catalog (target_system, is_active, sort_order);

COMMENT ON TABLE admin.subscription_feature_catalog IS
    'Canonical subscription feature labels for admin subscription forms and billing views';

COMMENT ON COLUMN admin.subscription_feature_catalog.feature_label IS
    'Human-readable label stored in subscription features JSON arrays';

-- ---------------------------------------------------------------------------
-- RLS — read for active admins; mutations via future admin RPCs if needed
-- ---------------------------------------------------------------------------
ALTER TABLE admin.subscription_feature_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS subscription_feature_catalog_select ON admin.subscription_feature_catalog;
CREATE POLICY subscription_feature_catalog_select ON admin.subscription_feature_catalog
    FOR SELECT TO authenticated
    USING (admin.is_active_admin());

GRANT SELECT ON admin.subscription_feature_catalog TO authenticated;
GRANT ALL ON admin.subscription_feature_catalog TO service_role;

-- ---------------------------------------------------------------------------
-- Seed — aligned with subscriptionPreviewCatalog plan feature lists
-- ---------------------------------------------------------------------------
INSERT INTO admin.subscription_feature_catalog (
    id, feature_key, feature_label, description, category, target_system, sort_order
) VALUES
    -- Platform — Projects & team
    ('c3300001-0001-4001-8001-000000000001'::uuid, 'platform_1_project', '1 project', 'Single active project workspace', 'Projects & team', 'platform', 10),
    ('c3300001-0001-4001-8001-000000000002'::uuid, 'platform_10_projects', '10 projects', 'Up to ten active projects', 'Projects & team', 'platform', 11),
    ('c3300001-0001-4001-8001-000000000003'::uuid, 'platform_unlimited_projects', 'Unlimited projects', 'No cap on active projects', 'Projects & team', 'platform', 12),
    ('c3300001-0001-4001-8001-000000000004'::uuid, 'platform_5_team_members', '5 team members', 'Invite up to five collaborators', 'Projects & team', 'platform', 20),
    ('c3300001-0001-4001-8001-000000000005'::uuid, 'platform_20_team_members', '20 team members', 'Invite up to twenty collaborators', 'Projects & team', 'platform', 21),
    ('c3300001-0001-4001-8001-000000000006'::uuid, 'platform_100_team_members', '100 team members', 'Invite up to one hundred collaborators', 'Projects & team', 'platform', 22),
    ('c3300001-0001-4001-8001-000000000007'::uuid, 'platform_unlimited_everything', 'Unlimited everything', 'No limits on projects, members, or storage', 'Projects & team', 'platform', 23),

    -- Platform — Task & project management
    ('c3300001-0001-4001-8001-000000000010'::uuid, 'platform_basic_task_mgmt', 'Basic task management', 'Create and assign tasks with due dates', 'Task management', 'platform', 30),
    ('c3300001-0001-4001-8001-000000000011'::uuid, 'platform_advanced_task_mgmt', 'Advanced task management', 'Dependencies, subtasks, and custom fields', 'Task management', 'platform', 31),
    ('c3300001-0001-4001-8001-000000000012'::uuid, 'platform_full_lifecycle', 'Full project lifecycle management', 'Initiation through closure with gates and approvals', 'Task management', 'platform', 32),
    ('c3300001-0001-4001-8001-000000000013'::uuid, 'platform_resource_mgmt', 'Resource management', 'Capacity planning and resource allocation', 'Task management', 'platform', 33),
    ('c3300001-0001-4001-8001-000000000014'::uuid, 'platform_simple_gantt', 'Simple Gantt charts', 'Timeline view for basic scheduling', 'Task management', 'platform', 34),
    ('c3300001-0001-4001-8001-000000000015'::uuid, 'platform_gantt_kanban', 'Gantt & Kanban boards', 'Dual board views for agile and waterfall teams', 'Task management', 'platform', 35),
    ('c3300001-0001-4001-8001-000000000016'::uuid, 'platform_custom_workflows', 'Custom workflows', 'Configurable status flows and automation rules', 'Task management', 'platform', 36),

    -- Platform — Analytics & integrations
    ('c3300001-0001-4001-8001-000000000020'::uuid, 'platform_basic_analytics', 'Basic analytics', 'Dashboards for task and project progress', 'Analytics & integrations', 'platform', 40),
    ('c3300001-0001-4001-8001-000000000021'::uuid, 'platform_advanced_analytics', 'Advanced analytics & reporting', 'Custom reports, exports, and trend analysis', 'Analytics & integrations', 'platform', 41),
    ('c3300001-0001-4001-8001-000000000022'::uuid, 'platform_api_access', 'API access', 'REST API for integrations and automation', 'Analytics & integrations', 'platform', 42),
    ('c3300001-0001-4001-8001-000000000023'::uuid, 'platform_custom_integrations', 'Custom integrations', 'Bespoke connectors and webhook pipelines', 'Analytics & integrations', 'platform', 43),
    ('c3300001-0001-4001-8001-000000000024'::uuid, 'platform_sso', 'SSO integration', 'SAML/OIDC single sign-on for enterprise IdPs', 'Analytics & integrations', 'platform', 44),
    ('c3300001-0001-4001-8001-000000000025'::uuid, 'platform_white_label', 'White-label option', 'Branded experience with custom domain support', 'Analytics & integrations', 'platform', 45),

    -- Platform — Support & enterprise
    ('c3300001-0001-4001-8001-000000000030'::uuid, 'platform_community_support', 'Community support', 'Forum and knowledge-base access', 'Support', 'platform', 50),
    ('c3300001-0001-4001-8001-000000000031'::uuid, 'platform_email_support', 'Email support', 'Business-hours email assistance', 'Support', 'platform', 51),
    ('c3300001-0001-4001-8001-000000000032'::uuid, 'platform_priority_email', 'Priority email support', 'Faster response SLAs for email tickets', 'Support', 'platform', 52),
    ('c3300001-0001-4001-8001-000000000033'::uuid, 'platform_dedicated_support', 'Dedicated support', 'Named customer success manager', 'Support', 'platform', 53),
    ('c3300001-0001-4001-8001-000000000034'::uuid, 'platform_sla', 'SLA guarantee', 'Contractual uptime and response commitments', 'Support', 'platform', 54),

    -- Platform — Lifetime bundles
    ('c3300001-0001-4001-8001-000000000040'::uuid, 'platform_all_starter', 'All Starter features', 'Everything included in the Starter plan', 'Lifetime', 'platform', 60),
    ('c3300001-0001-4001-8001-000000000041'::uuid, 'platform_all_professional', 'All Professional features', 'Everything included in the Professional plan', 'Lifetime', 'platform', 61),
    ('c3300001-0001-4001-8001-000000000042'::uuid, 'platform_lifetime_access', 'Lifetime access', 'One-time purchase with perpetual entitlement', 'Lifetime', 'platform', 62),
    ('c3300001-0001-4001-8001-000000000043'::uuid, 'platform_no_recurring', 'No recurring fees', 'No monthly or annual renewal charges', 'Lifetime', 'platform', 63),

    -- Simulator — Scenarios & learning
    ('c3300002-0002-4002-8002-000000000001'::uuid, 'sim_5_beginner', '5 beginner scenarios', 'Entry-level training scenarios', 'Scenarios', 'simulator', 110),
    ('c3300002-0002-4002-8002-000000000002'::uuid, 'sim_beginner_intermediate', 'All beginner & intermediate scenarios', 'Full beginner and intermediate catalog', 'Scenarios', 'simulator', 111),
    ('c3300002-0002-4002-8002-000000000003'::uuid, 'sim_all_scenarios', 'All scenarios (including expert)', 'Complete scenario library including expert tier', 'Scenarios', 'simulator', 112),
    ('c3300002-0002-4002-8002-000000000004'::uuid, 'sim_all_scenarios_forever', 'All scenarios (forever)', 'Permanent access to every scenario', 'Scenarios', 'simulator', 113),
    ('c3300002-0002-4002-8002-000000000005'::uuid, 'sim_custom_scenarios', 'Custom scenarios', 'Author organisation-specific training paths', 'Scenarios', 'simulator', 114),

    -- Simulator — Feedback & progress
    ('c3300002-0002-4002-8002-000000000010'::uuid, 'sim_basic_scoring', 'Basic scoring and feedback', 'Automated score with summary feedback', 'Progress & feedback', 'simulator', 120),
    ('c3300002-0002-4002-8002-000000000011'::uuid, 'sim_advanced_scoring', 'Advanced scoring and feedback', 'Detailed rubric-based scoring breakdown', 'Progress & feedback', 'simulator', 121),
    ('c3300002-0002-4002-8002-000000000012'::uuid, 'sim_advanced_ai_feedback', 'Advanced AI feedback', 'AI-generated coaching and improvement tips', 'Progress & feedback', 'simulator', 122),
    ('c3300002-0002-4002-8002-000000000013'::uuid, 'sim_progress_tracking', 'Progress tracking', 'Track completion across assigned scenarios', 'Progress & feedback', 'simulator', 123),
    ('c3300002-0002-4002-8002-000000000014'::uuid, 'sim_progress_analytics', 'Progress tracking & analytics', 'Dashboards for learner progress and trends', 'Progress & feedback', 'simulator', 124),
    ('c3300002-0002-4002-8002-000000000015'::uuid, 'sim_full_progress_analytics', 'Full progress tracking & analytics', 'Advanced learner analytics and cohort views', 'Progress & feedback', 'simulator', 125),

    -- Simulator — Certificates & community
    ('c3300002-0002-4002-8002-000000000020'::uuid, 'sim_community_access', 'Community access', 'Peer forums and shared learning resources', 'Community & certificates', 'simulator', 130),
    ('c3300002-0002-4002-8002-000000000021'::uuid, 'sim_basic_certificates', 'Basic certificates', 'Completion certificates for finished scenarios', 'Community & certificates', 'simulator', 131),
    ('c3300002-0002-4002-8002-000000000022'::uuid, 'sim_all_certificates_discounted', 'All certificates (discounted)', 'Reduced-price certificates across tiers', 'Community & certificates', 'simulator', 132),

    -- Simulator — Lifetime & support
    ('c3300002-0002-4002-8002-000000000030'::uuid, 'sim_all_professional_features', 'All Professional features', 'Everything included in the Professional plan', 'Lifetime & support', 'simulator', 140),
    ('c3300002-0002-4002-8002-000000000031'::uuid, 'sim_all_future_updates', 'All future updates', 'Includes new scenarios and platform updates', 'Lifetime & support', 'simulator', 141),
    ('c3300002-0002-4002-8002-000000000032'::uuid, 'sim_no_recurring_fees', 'No recurring fees', 'No monthly or annual renewal charges', 'Lifetime & support', 'simulator', 142),
    ('c3300002-0002-4002-8002-000000000033'::uuid, 'sim_priority_support', 'Priority support', 'Faster response for simulator support tickets', 'Lifetime & support', 'simulator', 143)
ON CONFLICT (feature_key) DO UPDATE SET
    feature_label = EXCLUDED.feature_label,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    target_system = EXCLUDED.target_system,
    sort_order = EXCLUDED.sort_order,
    is_active = TRUE,
    updated_at = NOW();
