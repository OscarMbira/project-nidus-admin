-- =============================================================================
-- v160: Global Template Library — admin tables
-- Plan: projectplans/v159_global_template_library_plan.md
-- Companion monorepo: SQL/v765_global_template_sync_rpc.sql (apply first for publish)
-- =============================================================================

CREATE TABLE IF NOT EXISTS admin.global_template_library (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain TEXT NOT NULL,
    category TEXT NULL,
    name TEXT NOT NULL,
    description TEXT NULL,
    payload JSONB NOT NULL DEFAULT '[]'::jsonb,
    record_status TEXT NOT NULL DEFAULT 'live',
    root_record_id UUID NULL,
    record_version INTEGER NOT NULL DEFAULT 1,
    parent_record_id UUID NULL,
    authorised_by UUID NULL REFERENCES admin.admin_users(id) ON DELETE SET NULL,
    authorised_at TIMESTAMPTZ NULL,
    archived_at TIMESTAMPTZ NULL,
    archived_by UUID NULL REFERENCES admin.admin_users(id) ON DELETE SET NULL,
    synced_at TIMESTAMPTZ NULL,
    synced_node_id UUID NULL,
    synced_version INTEGER NULL,
    created_by UUID NULL REFERENCES admin.admin_users(id) ON DELETE SET NULL,
    updated_by UUID NULL REFERENCES admin.admin_users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_gtl_domain CHECK (
        domain IN ('fields', 'form_template', 'industry_plan', 'opa', 'process_template')
    ),
    CONSTRAINT chk_gtl_record_status CHECK (
        record_status IN ('unauthorised', 'live', 'history', 'archived')
    ),
    CONSTRAINT chk_gtl_record_version CHECK (record_version >= 1),
    CONSTRAINT chk_gtl_payload_array CHECK (jsonb_typeof(payload) = 'array')
);

COMMENT ON TABLE admin.global_template_library IS
    'Nidus-staff Global Templates; published rows sync into public/sim.pm_template_nodes.';
COMMENT ON COLUMN admin.global_template_library.payload IS
    'For domain=fields: ordered array of {field_code,label,field_type,validation_rules,required,default_value}.';
COMMENT ON COLUMN admin.global_template_library.synced_node_id IS
    'Sample public.pm_template_nodes.id from last sync (one account); idempotent key is source_global_template_id.';

CREATE INDEX IF NOT EXISTS idx_gtl_domain_status
    ON admin.global_template_library (domain, record_status);
CREATE INDEX IF NOT EXISTS idx_gtl_category
    ON admin.global_template_library (category);
CREATE INDEX IF NOT EXISTS idx_gtl_updated
    ON admin.global_template_library (updated_at DESC);

CREATE TABLE IF NOT EXISTS admin.global_template_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES admin.global_template_library(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    change_description TEXT NULL,
    changed_by UUID NULL REFERENCES admin.admin_users(id) ON DELETE SET NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_gtl_versions UNIQUE (template_id, version_number),
    CONSTRAINT chk_gtl_versions_number CHECK (version_number >= 1)
);

CREATE INDEX IF NOT EXISTS idx_gtl_versions_template
    ON admin.global_template_versions (template_id, version_number DESC);

CREATE OR REPLACE FUNCTION admin.trg_gtl_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_gtl_updated ON admin.global_template_library;
CREATE TRIGGER trg_gtl_updated
    BEFORE UPDATE ON admin.global_template_library
    FOR EACH ROW
    EXECUTE FUNCTION admin.trg_gtl_touch_updated_at();

-- Permissions
INSERT INTO admin.admin_permissions (permission_key, permission_name, category, description)
VALUES
    ('content.global_templates.view', 'View Global Templates', 'content', 'View the Global Template Library'),
    ('content.global_templates.edit', 'Edit Global Templates', 'content', 'Create and edit Global Templates'),
    ('content.global_templates.publish', 'Publish Global Templates', 'content', 'Publish and sync Global Templates to Platform/Simulator')
ON CONFLICT (permission_key) DO UPDATE SET
    permission_name = EXCLUDED.permission_name,
    category = EXCLUDED.category,
    description = EXCLUDED.description;

INSERT INTO admin.role_permissions (role, permission_key)
VALUES
    ('super_admin', 'content.global_templates.view'),
    ('super_admin', 'content.global_templates.edit'),
    ('super_admin', 'content.global_templates.publish'),
    ('system_admin', 'content.global_templates.view'),
    ('system_admin', 'content.global_templates.edit'),
    ('system_admin', 'content.global_templates.publish'),
    ('content_admin', 'content.global_templates.view'),
    ('content_admin', 'content.global_templates.edit'),
    ('content_admin', 'content.global_templates.publish')
ON CONFLICT (role, permission_key) DO NOTHING;

DO $$
BEGIN
    RAISE NOTICE 'v160_global_template_library_tables.sql applied';
END $$;
