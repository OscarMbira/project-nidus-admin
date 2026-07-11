-- ============================================================================
-- v120: Rename "Plan Catalog" nav label to "Subscription Catalog"
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v106_subscription_history_nav_seed_data.sql
-- ============================================================================

UPDATE admin.nav_nodes
SET label = 'Subscription Catalog', updated_at = NOW()
WHERE node_key = 'subscription-billing:subscriptions-catalog:subscriptions:plan-catalog';
