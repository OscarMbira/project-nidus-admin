-- ============================================================================
-- v39: Display IDs for simulator subscription seed rows (v14)
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v19 id generation, v14 subscription seed, v20 id generation seed
-- Idempotent: ON CONFLICT (target_table, record_id). Safe to re-run.
--
-- Platform subscription display IDs are seeded in v20. Simulator rows use the
-- same ID generation rule (public.platform_subscriptions) per v20 rule comment.
-- ============================================================================

INSERT INTO admin.generated_ids (id, target_table, record_id, display_id, rule_id)
SELECT
    v.id,
    v.target_table,
    v.record_id,
    v.display_id,
    r.id
FROM (
    VALUES
        ('b2000002-0001-4001-8001-000000000001'::uuid, 'public.platform_subscriptions'::text, 'b7360002-0001-4000-8000-000000000001'::uuid, 'SUB-K3M7N89'::text),
        ('b2000002-0001-4001-8001-000000000002'::uuid, 'public.platform_subscriptions', 'b7360002-0001-4000-8000-000000000002', 'SUB-P2Q4R67'),
        ('b2000002-0001-4001-8001-000000000003'::uuid, 'public.platform_subscriptions', 'b7360002-0001-4000-8000-000000000003', 'SUB-T8U1V35'),
        ('b2000002-0001-4001-8001-000000000004'::uuid, 'public.platform_subscriptions', 'b7360002-0001-4000-8000-000000000004', 'SUB-W6X9Y24')
) AS v(id, target_table, record_id, display_id)
INNER JOIN admin.id_generation_rules r
    ON r.target_table = v.target_table
   AND r.is_active = TRUE
WHERE EXISTS (
    SELECT 1
    FROM sim.simulator_subscriptions ss
    WHERE ss.id = v.record_id
)
ON CONFLICT (target_table, record_id) DO UPDATE SET
    display_id = EXCLUDED.display_id,
    rule_id = EXCLUDED.rule_id;
