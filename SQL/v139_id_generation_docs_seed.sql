-- ============================================================================
-- v139: ID generation capacity documentation guide seed
-- PostgreSQL 15+ / Supabase
-- ============================================================================

INSERT INTO admin.documentation_guides (
    id, guide_id, title, file_name, category, module, description, target_roles, sort_order
)
VALUES (
    'b8030001-0001-4001-8139-000000000001'::uuid,
    'id-generation-capacity-guide',
    'ID Generation: Capacity & Uniqueness',
    'ID_Generation_Capacity_Guide.md',
    'Reference',
    'system',
    'Keyspace sizing, usage indicators, concurrency guarantees, and remediation when ID formats exhaust',
    ARRAY['super_admin', 'system_admin']::text[],
    3
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
    RAISE NOTICE 'v139: ID generation capacity documentation guide seed applied.';
END $$;
