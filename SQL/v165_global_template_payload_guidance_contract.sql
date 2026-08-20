-- =============================================================================
-- v165: Global Template payload contract — guidance_text + sample default_value
-- Plan: projectplans/v165_global_template_guidance_sample_plan.md
-- No structural ALTER — payload is JSONB. Documents dual-content keys.
-- Prerequisites: v160
-- =============================================================================

COMMENT ON COLUMN admin.global_template_library.payload IS
    'For domain=fields: ordered array of {
       field_code, label, field_type, validation_rules, required,
       guidance_text (instructions), default_value (sample / sync override), display_order
     }.';

DO $$
BEGIN
  RAISE NOTICE 'v165_global_template_payload_guidance_contract.sql applied';
END $$;
