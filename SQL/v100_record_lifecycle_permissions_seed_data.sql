-- ============================================================================
-- v100: Record lifecycle permission seed data
-- PostgreSQL 15+ / Supabase
-- ============================================================================

INSERT INTO admin.admin_permissions (permission_key, permission_name, category, description)
VALUES
    ('lifecycle.configure', 'Configure Record Lifecycle', 'record_lifecycle', 'Manage lifecycle configuration, authorisers, and archive policies'),
    ('lifecycle.authorise', 'Authorise Record Changes', 'record_lifecycle', 'Approve or reject pending lifecycle authorisation requests'),
    ('lifecycle.view_all', 'View All Lifecycle States', 'record_lifecycle', 'View records across unauthorised, live, history, and archived states')
ON CONFLICT (permission_key) DO UPDATE SET
    permission_name = EXCLUDED.permission_name,
    category = EXCLUDED.category,
    description = EXCLUDED.description;

INSERT INTO admin.role_permissions (role, permission_key)
VALUES
    ('super_admin', 'lifecycle.configure'),
    ('super_admin', 'lifecycle.authorise'),
    ('super_admin', 'lifecycle.view_all'),
    ('system_admin', 'lifecycle.authorise'),
    ('system_admin', 'lifecycle.view_all')
ON CONFLICT (role, permission_key) DO NOTHING;
