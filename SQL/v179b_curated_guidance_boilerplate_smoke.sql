-- v179b: smoke — count leftover boilerplate help on Admin global form_templates
SELECT COUNT(*) AS boilerplate_help_fields
FROM admin.global_template_library g
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(g.payload->'schema'->'sections', '[]'::jsonb)) sec
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(sec->'fields', '[]'::jsonb)) fld
WHERE g.domain = 'form_template'
  AND g.record_status <> 'history'
  AND (
    COALESCE(fld->>'help', '') ILIKE 'Briefly complete %'
    OR COALESCE(fld->>'help', '') ILIKE '%understood offline without system context%'
  );
-- Expect 0 after v179 seed.
