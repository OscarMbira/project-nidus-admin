-- ============================================================================
-- v153: Error release readiness documentation guide seed
-- PostgreSQL 15+ / Supabase
-- Run: pnpm run admin:seed-error-readiness-docs
-- ============================================================================

INSERT INTO admin.documentation_guides (
    id, guide_id, title, file_name, category, module, description, target_roles, sort_order
)
VALUES (
    'b8030001-0001-4001-8222-000000000001'::uuid,
    'error-release-readiness-guide',
    'Error Release Readiness',
    'Error_Release_Readiness_Guide.md',
    'Reference',
    'errors',
    'Release readiness banner, blocking severities, and threshold configuration',
    ARRAY['super_admin', 'system_admin', 'support_admin']::text[],
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

DO $$
BEGIN
    RAISE NOTICE 'v153: Error release readiness documentation guide seed applied.';
END $$;
