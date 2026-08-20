-- =============================================================================
-- v185c: Backfill methodology=pmbok on existing Form / Process templates
-- Plan: projectplans/v188_global_templates_level_first_menu_plan.md
-- Why: F001–F068 (and process templates) were seeded with PMBOK phase categories
--       but methodology was NULL, so List filters
--       ?domain=form_template&methodology=pmbok&category=Initiating (etc.) were empty.
-- Prerequisites: v185 (methodology column)
-- Idempotent: only rows where methodology IS NULL
-- =============================================================================

-- Form templates: PMBOK process groups / phases
UPDATE admin.global_template_library
SET methodology = 'pmbok',
    updated_at = NOW()
WHERE domain = 'form_template'
  AND record_status <> 'history'
  AND methodology IS NULL
  AND (
    category IN (
      'Initiating',
      'Planning',
      'Executing',
      'Monitoring & Controlling',
      'Closing'
    )
    OR lower(COALESCE(payload->>'process_group', '')) IN (
      'initiating',
      'planning',
      'executing',
      'monitoring_controlling',
      'closing'
    )
  );

-- Form templates: legacy category "Agile" (pre–methodology column) → agile track
UPDATE admin.global_template_library
SET methodology = 'agile',
    updated_at = NOW()
WHERE domain = 'form_template'
  AND record_status <> 'history'
  AND methodology IS NULL
  AND (
    category = 'Agile'
    OR lower(COALESCE(payload->>'process_group', '')) = 'agile'
  );

-- Process templates: same PMBOK phase categories
UPDATE admin.global_template_library
SET methodology = 'pmbok',
    updated_at = NOW()
WHERE domain = 'process_template'
  AND record_status <> 'history'
  AND methodology IS NULL
  AND category IN (
    'Initiating',
    'Planning',
    'Executing',
    'Monitoring & Controlling',
    'Closing'
  );

-- Process templates: legacy Agile category
UPDATE admin.global_template_library
SET methodology = 'agile',
    updated_at = NOW()
WHERE domain = 'process_template'
  AND record_status <> 'history'
  AND methodology IS NULL
  AND category = 'Agile';

DO $$
DECLARE
  v_form_pmbok INT;
  v_form_agile INT;
  v_proc_pmbok INT;
BEGIN
  SELECT COUNT(*) INTO v_form_pmbok
  FROM admin.global_template_library
  WHERE domain = 'form_template'
    AND record_status <> 'history'
    AND methodology = 'pmbok';

  SELECT COUNT(*) INTO v_form_agile
  FROM admin.global_template_library
  WHERE domain = 'form_template'
    AND record_status <> 'history'
    AND methodology = 'agile';

  SELECT COUNT(*) INTO v_proc_pmbok
  FROM admin.global_template_library
  WHERE domain = 'process_template'
    AND record_status <> 'history'
    AND methodology = 'pmbok';

  RAISE NOTICE 'v185c backfill complete: form pmbok=%, form agile=%, process pmbok=%',
    v_form_pmbok, v_form_agile, v_proc_pmbok;
END $$;
