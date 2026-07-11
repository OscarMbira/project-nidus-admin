-- ============================================================================
-- v119: Rename "User Pricing Preview" nav labels to "Subscription Preview"
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v106_subscription_history_nav_seed_data.sql
-- ============================================================================

UPDATE admin.nav_nodes
SET label = 'Subscription Preview', updated_at = NOW()
WHERE node_key = 'subscription-billing:user-pricing-preview';

UPDATE admin.nav_nodes
SET label = 'Subscription Preview', updated_at = NOW()
WHERE node_key = 'subscription-billing:user-pricing-preview:subscriptions:subscription-preview';
