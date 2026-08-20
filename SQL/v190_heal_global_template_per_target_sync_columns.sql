-- =============================================================================
-- v190: Heal per-target sync columns for Global Template publish
--
-- Live symptom: Publish to Platform / Publish to Simulator → HTTP 400
--   ERROR: column "platform_synced_at" does not exist (42703)
--
-- Cause: admin.publish_global_template (v175+) UPDATEs platform_synced_* /
--   sim_synced_* columns, but the v175 ALTER TABLE was never applied in this
--   environment (methodology from v185 is present; per-target sync cols are not).
--
-- Also drops the stale 3-arg publish overload that makes PostgREST ambiguous
-- when p_target is omitted.
--
-- Idempotent. Safe to re-run.
-- Prerequisites: admin.global_template_library exists; publish RPC already
--   references these columns (v175 / v184 / v185).
-- =============================================================================

ALTER TABLE admin.global_template_library
  ADD COLUMN IF NOT EXISTS platform_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS platform_synced_version INTEGER,
  ADD COLUMN IF NOT EXISTS sim_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sim_synced_version INTEGER;

COMMENT ON COLUMN admin.global_template_library.platform_synced_at IS
  'When this live row was last published to Platform (public schema).';
COMMENT ON COLUMN admin.global_template_library.platform_synced_version IS
  'record_version that was last published to Platform.';
COMMENT ON COLUMN admin.global_template_library.sim_synced_at IS
  'When this live row was last published to Simulator (sim schema).';
COMMENT ON COLUMN admin.global_template_library.sim_synced_version IS
  'record_version that was last published to Simulator.';

-- Backfill from legacy single sync stamp (treat past publishes as both targets)
UPDATE admin.global_template_library
SET
  platform_synced_at = COALESCE(platform_synced_at, synced_at),
  platform_synced_version = COALESCE(platform_synced_version, synced_version),
  sim_synced_at = COALESCE(sim_synced_at, synced_at),
  sim_synced_version = COALESCE(sim_synced_version, synced_version)
WHERE synced_at IS NOT NULL
  AND (
    platform_synced_at IS NULL
    OR sim_synced_at IS NULL
    OR platform_synced_version IS NULL
    OR sim_synced_version IS NULL
  );

-- Remove 3-arg overload left alongside the 4-arg (p_target) function
DROP FUNCTION IF EXISTS admin.publish_global_template(UUID, UUID, TEXT);

GRANT EXECUTE ON FUNCTION admin.publish_global_template(UUID, UUID, TEXT, TEXT)
  TO authenticated, service_role;

DO $$
BEGIN
  RAISE NOTICE 'v190_heal_global_template_per_target_sync_columns.sql applied';
END $$;
