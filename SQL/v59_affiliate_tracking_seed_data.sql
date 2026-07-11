-- ============================================================================
-- v59: Affiliate tracking seed data (public schema)
-- Prerequisites: v58_affiliate_tracking.sql, v57_affiliate_program_seed_data.sql
-- Idempotent: fixed UUIDs + ON CONFLICT DO NOTHING
-- Run: pnpm run admin:seed-affiliate-tracking
-- Note: UUID suffixes must be hex-only (0-9, a-f).
-- ============================================================================

INSERT INTO public.affiliate_clicks (
    id, affiliate_code, target_system, referral_url, landing_path, created_at
)
VALUES
    ('c1000001-feed-4001-8001-c00100000001'::uuid, 'DEMOPLATFORM01', 'platform',
     'https://google.com', '/platform', NOW() - INTERVAL '45 days'),
    ('c1000001-feed-4001-8001-c00100000002'::uuid, 'DEMOPLATFORM01', 'platform',
     'https://linkedin.com', '/platform', NOW() - INTERVAL '30 days'),
    ('c1000001-feed-4001-8001-c00100000003'::uuid, 'DEMOPLATFORM01', 'platform',
     'https://twitter.com', '/platform', NOW() - INTERVAL '15 days'),
    ('c1000001-feed-4001-8001-c00100000004'::uuid, 'DEMOPLATFORM01', 'platform',
     'https://newsletter.com', '/platform', NOW() - INTERVAL '5 days'),
    ('c1000001-feed-4001-8001-c00100000005'::uuid, 'DEMOSIMULATOR01', 'simulator',
     'https://pm-blog.com', '/simulator', NOW() - INTERVAL '40 days'),
    ('c1000001-feed-4001-8001-c00100000006'::uuid, 'DEMOSIMULATOR01', 'simulator',
     'https://training-site.com', '/simulator', NOW() - INTERVAL '20 days'),
    ('c1000001-feed-4001-8001-c00100000007'::uuid, 'DEMOSIMULATOR01', 'simulator',
     'https://youtube.com', '/simulator', NOW() - INTERVAL '10 days'),
    ('c1000001-feed-4001-8001-c00100000008'::uuid, 'DEMOBOTH01', 'platform',
     'https://coaching-hub.com', '/platform', NOW() - INTERVAL '50 days'),
    ('c1000001-feed-4001-8001-c00100000009'::uuid, 'DEMOBOTH01', 'simulator',
     'https://coaching-hub.com', '/simulator', NOW() - INTERVAL '25 days'),
    ('c1000001-feed-4001-8001-c0010000000a'::uuid, 'DEMOBOTH01', 'platform',
     'https://coaching-hub.com', '/platform', NOW() - INTERVAL '8 days')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.affiliate_conversions (
    id, affiliate_code, click_id, target_system,
    conversion_type, gross_amount, currency,
    commission_amount, commission_rate_pct, created_at
)
VALUES
    ('d1000001-feed-4001-8001-d00100000001'::uuid, 'DEMOPLATFORM01',
     'c1000001-feed-4001-8001-c00100000001'::uuid,
     'platform', 'signup', NULL, 'USD', NULL, 10.00,
     NOW() - INTERVAL '44 days'),
    ('d1000001-feed-4001-8001-d00100000002'::uuid, 'DEMOPLATFORM01',
     'c1000001-feed-4001-8001-c00100000002'::uuid,
     'platform', 'subscription', 99.00, 'USD', 9.90, 10.00,
     NOW() - INTERVAL '29 days'),
    ('d1000001-feed-4001-8001-d00100000003'::uuid, 'DEMOSIMULATOR01',
     'c1000001-feed-4001-8001-c00100000005'::uuid,
     'simulator', 'signup', NULL, 'USD', NULL, 12.00,
     NOW() - INTERVAL '39 days'),
    ('d1000001-feed-4001-8001-d00100000004'::uuid, 'DEMOBOTH01',
     'c1000001-feed-4001-8001-c00100000008'::uuid,
     'platform', 'subscription', 149.00, 'USD', 11.92, 8.00,
     NOW() - INTERVAL '49 days')
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
    RAISE NOTICE 'v59: Affiliate tracking seed applied (10 clicks, 4 conversions).';
END $$;
