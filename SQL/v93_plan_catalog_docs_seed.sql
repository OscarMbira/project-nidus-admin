-- ============================================================================
-- v93: Plan Catalog documentation guide seed
-- Prerequisites: v84 documentation infrastructure, v92 plan catalog CRUD
-- Run: pnpm run admin:seed-plan-catalog-docs
-- ============================================================================

INSERT INTO admin.documentation_guides (
    id, guide_id, title, file_name, category, module, description, target_roles, sort_order
)
VALUES (
    'b7593001-0001-4001-8093-000000000001'::uuid,
    'plan-catalog-guide',
    'Plan Catalog',
    'Plan_Catalog_Guide.md',
    'Reference',
    'subscriptions',
    'Create, edit, activate, and delete subscription plan tiers',
    ARRAY['super_admin', 'system_admin']::text[],
    2
)
ON CONFLICT (guide_id) DO UPDATE SET
    title = EXCLUDED.title,
    file_name = EXCLUDED.file_name,
    module = EXCLUDED.module,
    category = EXCLUDED.category,
    description = EXCLUDED.description,
    target_roles = EXCLUDED.target_roles,
    sort_order = EXCLUDED.sort_order;
