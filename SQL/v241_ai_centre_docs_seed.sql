-- ============================================================================
-- v241: AI Centre documentation guide (monorepo v1272). Registers modules/ai/docs/AI_Centre_Guide.md
-- in the Documentation Centre index (Admin CLAUDE.md "Documentation & Testing", item 2).
-- Prerequisites: v235. Idempotent.
-- ============================================================================
INSERT INTO admin.documentation_guides (
    id, guide_id, title, file_name, category, module, description, target_roles, sort_order
)
VALUES (
    '7a1c2e00-1272-4a10-9a00-0000000d0c01'::uuid,
    'ai-centre-guide',
    'AI Centre',
    'AI_Centre_Guide.md',
    'Reference',
    'ai',
    'Kill switch, models, plan credits, organisation overrides, data catalogue, meaning search, Assessor calibration and stakeholder personas',
    ARRAY['super_admin', 'system_admin', 'support_admin']::text[],
    1
)
ON CONFLICT (guide_id) DO UPDATE SET
    title = EXCLUDED.title,
    file_name = EXCLUDED.file_name,
    category = EXCLUDED.category,
    module = EXCLUDED.module,
    description = EXCLUDED.description,
    target_roles = EXCLUDED.target_roles,
    sort_order = EXCLUDED.sort_order;

SELECT 'v241 applied' AS status;
