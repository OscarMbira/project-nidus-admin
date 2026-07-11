-- ============================================================================
-- v53: Report Builder seed data (custom report definitions)
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v24 (report_definitions), admin super_admin user
-- Idempotent: fixed UUIDs + ON CONFLICT (report_key). Safe to re-run.
-- ============================================================================

INSERT INTO admin.report_definitions (
    id,
    report_name,
    report_key,
    description,
    report_type,
    query_config,
    chart_type,
    target_system,
    is_system_report,
    created_by,
    updated_by,
    created_at,
    updated_at
)
SELECT
    seed.id,
    seed.report_name,
    seed.report_key,
    seed.description,
    seed.report_type,
    seed.query_config,
    seed.chart_type,
    seed.target_system,
    FALSE,
    (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1),
    (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1),
    seed.created_at,
    seed.updated_at
FROM (
    VALUES
        (
            'b7530001-0001-4001-8001-000000000001'::uuid,
            'Monthly Platform Revenue by Plan',
            'monthly_platform_revenue_by_plan',
            'MRR and total revenue grouped by subscription plan for the Platform system',
            'revenue',
            '{"date_range": "last_12_months", "group_by": ["plan_name", "currency"], "metrics": ["mrr", "total_revenue"], "filters": {"target_system": "platform"}}'::jsonb,
            'bar',
            'platform',
            NOW() - INTERVAL '45 days',
            NOW() - INTERVAL '3 days'
        ),
        (
            'b7530001-0001-4001-8001-000000000002'::uuid,
            'Simulator Registration Funnel',
            'simulator_registration_funnel',
            'Daily sign-ups, email verifications, and first-session completions in Simulator',
            'user_growth',
            '{"date_granularity": "daily", "metrics": ["signups", "email_verified", "first_session_completed"], "filters": {"target_system": "simulator"}}'::jsonb,
            'line',
            'simulator',
            NOW() - INTERVAL '30 days',
            NOW() - INTERVAL '5 days'
        ),
        (
            'b7530001-0001-4001-8001-000000000003'::uuid,
            'Support Ticket SLA Breaches',
            'support_sla_breaches',
            'Open and recently closed tickets that missed first-response or resolution SLA targets',
            'support_volume',
            '{"group_by": ["priority", "category", "assigned_team"], "metrics": ["breach_count", "avg_hours_over_sla"], "filters": {"status": ["open", "pending"], "sla_breached": true}}'::jsonb,
            'table',
            'all',
            NOW() - INTERVAL '20 days',
            NOW() - INTERVAL '1 day'
        ),
        (
            'b7530001-0001-4001-8001-000000000004'::uuid,
            'Critical Error Spikes (24h)',
            'critical_error_spikes_24h',
            'Hourly error counts for critical and fatal severities on Platform over the last 24 hours',
            'error_trends',
            '{"date_granularity": "hourly", "group_by": ["severity", "error_code"], "metrics": ["error_count"], "filters": {"severity": ["critical", "fatal"], "target_system": "platform", "lookback_hours": 24}}'::jsonb,
            'line',
            'platform',
            NOW() - INTERVAL '14 days',
            NOW() - INTERVAL '2 hours'
        ),
        (
            'b7530001-0001-4001-8001-000000000005'::uuid,
            'Enterprise Churn by Reason',
            'enterprise_churn_by_reason',
            'Cancellation reasons and counts for enterprise-tier Platform subscriptions',
            'churn',
            '{"group_by": ["cancellation_reason", "plan_tier"], "metrics": ["cancelled_subscriptions", "lost_mrr"], "filters": {"plan_tier": "enterprise", "target_system": "platform"}}'::jsonb,
            'pie',
            'platform',
            NOW() - INTERVAL '60 days',
            NOW() - INTERVAL '7 days'
        ),
        (
            'b7530001-0001-4001-8001-000000000006'::uuid,
            'Weekly Active Users Comparison',
            'weekly_active_users_comparison',
            'Side-by-side weekly active users for Platform vs Simulator with week-over-week delta',
            'system_usage',
            '{"date_granularity": "weekly", "metrics": ["active_users", "wow_change_pct"], "compare_systems": ["platform", "simulator"]}'::jsonb,
            'bar',
            'all',
            NOW() - INTERVAL '10 days',
            NOW() - INTERVAL '12 hours'
        ),
        (
            'b7530001-0001-4001-8001-000000000007'::uuid,
            'Retention Cohort — Q2 Sign-ups',
            'retention_cohort_q2_signups',
            'Monthly retention rates for users who registered in Q2, split by acquisition channel',
            'retention',
            '{"cohort_period": "monthly", "cohort_start": "2026-04-01", "cohort_end": "2026-06-30", "group_by": ["acquisition_channel"], "metrics": ["retention_rate", "cohort_size"]}'::jsonb,
            'table',
            'all',
            NOW() - INTERVAL '8 days',
            NOW() - INTERVAL '4 days'
        ),
        (
            'b7530001-0001-4001-8001-000000000008'::uuid,
            'Ad-hoc Payment Failure Summary',
            'ad_hoc_payment_failure_summary',
            'Custom cross-gateway view of failed payment attempts for finance review',
            'custom',
            '{"date_range": "last_30_days", "group_by": ["gateway", "failure_code", "country_code"], "metrics": ["failure_count", "failure_amount"], "include_retry_outcomes": true}'::jsonb,
            'table',
            'platform',
            NOW() - INTERVAL '5 days',
            NOW() - INTERVAL '1 hour'
        )
) AS seed(id, report_name, report_key, description, report_type, query_config, chart_type, target_system, created_at, updated_at)
ON CONFLICT (report_key) DO UPDATE SET
    report_name = EXCLUDED.report_name,
    description = EXCLUDED.description,
    report_type = EXCLUDED.report_type,
    query_config = EXCLUDED.query_config,
    chart_type = EXCLUDED.chart_type,
    target_system = EXCLUDED.target_system,
    is_system_report = FALSE,
    updated_by = EXCLUDED.updated_by,
    updated_at = EXCLUDED.updated_at;

DO $$
BEGIN
    RAISE NOTICE 'v53: Report Builder custom report seed data applied.';
END $$;
