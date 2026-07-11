-- ============================================================================
-- v103: Record Lifecycle documentation guide seed
-- PostgreSQL 15+ / Supabase
-- ============================================================================

INSERT INTO admin.documentation_guides (
    id, guide_id, title, file_name, category, module, description, target_roles, sort_order
)
VALUES (
    'b8030001-0001-4001-8103-000000000001'::uuid,
    'record-lifecycle-guide',
    'Record Lifecycle Management',
    'Record_Lifecycle_Guide.md',
    'Reference',
    'admin-mgmt',
    'Configure authorisers and manage transitions across unauthorised, live, history, and archived states',
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
