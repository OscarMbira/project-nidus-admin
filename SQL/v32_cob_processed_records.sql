-- ============================================================================
-- v32: COB processed record drill-down metadata
-- PostgreSQL 15+ / Supabase
-- Plan: projectplans/v3.0_batch_processing_plan.md
-- Adds record_type + processed_records[] to COB step result summaries.
-- ============================================================================

CREATE OR REPLACE FUNCTION admin.cob_expire_subscriptions(
    p_business_date DATE,
    p_params JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public, sim
AS $$
DECLARE
    v_platform_count INTEGER := 0;
    v_simulator_count INTEGER := 0;
    v_platform_records JSONB := '[]'::JSONB;
    v_simulator_records JSONB := '[]'::JSONB;
BEGIN
    WITH platform_expired AS (
        UPDATE public.platform_subscriptions
        SET status = 'expired',
            updated_at = NOW()
        WHERE status IN ('active', 'trialing')
          AND COALESCE(is_lifetime, FALSE) = FALSE
          AND expires_at IS NOT NULL
          AND expires_at::DATE <= p_business_date
        RETURNING id, plan_type
    )
    SELECT
        COALESCE(jsonb_agg(
            jsonb_build_object(
                'id', id,
                'label', COALESCE(plan_type, 'subscription') || ' (platform)',
                'record_type', 'subscription',
                'record_type_label', 'Subscription',
                'system', 'platform',
                'status', 'expired',
                'detail_path', '/subscriptions/subscription-detail?id=' || id::TEXT || '&system=platform'
            )
        ), '[]'::JSONB),
        COUNT(*)::INTEGER
    INTO v_platform_records, v_platform_count
    FROM platform_expired;

    WITH simulator_expired AS (
        UPDATE sim.simulator_subscriptions
        SET status = 'expired',
            updated_at = NOW()
        WHERE status IN ('active', 'trialing')
          AND COALESCE(is_lifetime, FALSE) = FALSE
          AND expires_at IS NOT NULL
          AND expires_at::DATE <= p_business_date
        RETURNING id, plan_type
    )
    SELECT
        COALESCE(jsonb_agg(
            jsonb_build_object(
                'id', id,
                'label', COALESCE(plan_type, 'subscription') || ' (simulator)',
                'record_type', 'subscription',
                'record_type_label', 'Subscription',
                'system', 'simulator',
                'status', 'expired',
                'detail_path', '/subscriptions/subscription-detail?id=' || id::TEXT || '&system=simulator'
            )
        ), '[]'::JSONB),
        COUNT(*)::INTEGER
    INTO v_simulator_records, v_simulator_count
    FROM simulator_expired;

    RETURN jsonb_build_object(
        'process', 'expire_subscriptions',
        'business_date', p_business_date,
        'record_type', 'subscription',
        'record_type_label', 'Subscription',
        'platform_expired', v_platform_count,
        'simulator_expired', v_simulator_count,
        'records_processed', v_platform_count + v_simulator_count,
        'processed_records', v_platform_records || v_simulator_records
    );
END;
$$;

CREATE OR REPLACE FUNCTION admin.cob_close_resolved_tickets(
    p_business_date DATE,
    p_params JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_days INTEGER;
    v_count INTEGER := 0;
    v_records JSONB := '[]'::JSONB;
BEGIN
    v_days := GREATEST(COALESCE((p_params->>'days_threshold')::INTEGER, 7), 1);

    WITH closed AS (
        UPDATE admin.support_tickets
        SET status = 'closed',
            updated_at = NOW()
        WHERE status = 'resolved'
          AND resolved_at IS NOT NULL
          AND resolved_at < (p_business_date::TIMESTAMPTZ - make_interval(days => v_days))
        RETURNING id, ticket_number, subject
    )
    SELECT
        COALESCE(jsonb_agg(
            jsonb_build_object(
                'id', id,
                'label', 'TKT-' || ticket_number::TEXT || ' — ' || subject,
                'record_type', 'support_ticket',
                'record_type_label', 'Support Ticket',
                'system', 'admin',
                'status', 'closed',
                'detail_path', '/support/support-ticket-detail?id=' || id::TEXT
            )
        ), '[]'::JSONB),
        COUNT(*)::INTEGER
    INTO v_records, v_count
    FROM closed;

    RETURN jsonb_build_object(
        'process', 'close_resolved_tickets',
        'business_date', p_business_date,
        'record_type', 'support_ticket',
        'record_type_label', 'Support Ticket',
        'days_threshold', v_days,
        'closed_count', v_count,
        'records_processed', v_count,
        'processed_records', v_records
    );
END;
$$;

CREATE OR REPLACE FUNCTION admin.cob_archive_old_errors(
    p_business_date DATE,
    p_params JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_days INTEGER;
    v_count INTEGER := 0;
    v_records JSONB := '[]'::JSONB;
    v_table_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'admin'
          AND table_name = 'error_aggregations'
    ) INTO v_table_exists;

    IF NOT v_table_exists THEN
        RETURN jsonb_build_object(
            'process', 'archive_old_errors',
            'business_date', p_business_date,
            'record_type', 'error_aggregation',
            'record_type_label', 'Error Aggregation',
            'skipped', TRUE,
            'reason', 'admin.error_aggregations table not found',
            'records_processed', 0,
            'processed_records', '[]'::JSONB
        );
    END IF;

    v_days := GREATEST(COALESCE((p_params->>'days_threshold')::INTEGER, 30), 1);

    WITH archived AS (
        UPDATE admin.error_aggregations
        SET status = 'ignored',
            updated_at = NOW()
        WHERE status = 'resolved'
          AND resolved_at IS NOT NULL
          AND resolved_at < (p_business_date::TIMESTAMPTZ - make_interval(days => v_days))
        RETURNING id, error_type, left(error_message, 120) AS error_message
    )
    SELECT
        COALESCE(jsonb_agg(
            jsonb_build_object(
                'id', id,
                'label', COALESCE(error_type, 'error') || ' — ' || COALESCE(error_message, 'No message'),
                'record_type', 'error_aggregation',
                'record_type_label', 'Error Aggregation',
                'system', 'admin',
                'status', 'ignored',
                'detail_path', '/errors/error-detail?id=' || id::TEXT
            )
        ), '[]'::JSONB),
        COUNT(*)::INTEGER
    INTO v_records, v_count
    FROM archived;

    RETURN jsonb_build_object(
        'process', 'archive_old_errors',
        'business_date', p_business_date,
        'record_type', 'error_aggregation',
        'record_type_label', 'Error Aggregation',
        'days_threshold', v_days,
        'archived_count', v_count,
        'records_processed', v_count,
        'processed_records', v_records
    );
END;
$$;

CREATE OR REPLACE FUNCTION admin.cob_generate_daily_summary(
    p_business_date DATE,
    p_params JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public, sim
AS $$
DECLARE
    v_audit_count BIGINT := 0;
    v_ticket_open BIGINT := 0;
    v_ticket_created BIGINT := 0;
    v_platform_active BIGINT := 0;
    v_simulator_active BIGINT := 0;
    v_records JSONB := '[]'::JSONB;
BEGIN
    SELECT COUNT(*) INTO v_audit_count
    FROM admin.admin_audit_log
    WHERE created_at::DATE = p_business_date;

    SELECT COUNT(*) INTO v_ticket_open
    FROM admin.support_tickets
    WHERE status IN ('open', 'in_progress', 'waiting_user');

    SELECT COUNT(*) INTO v_ticket_created
    FROM admin.support_tickets
    WHERE created_at::DATE = p_business_date;

    SELECT COUNT(*) INTO v_platform_active
    FROM public.platform_subscriptions
    WHERE status IN ('active', 'trialing');

    SELECT COUNT(*) INTO v_simulator_active
    FROM sim.simulator_subscriptions
    WHERE status IN ('active', 'trialing');

    v_records := jsonb_build_array(
        jsonb_build_object(
            'id', 'audit_events',
            'label', v_audit_count::TEXT || ' audit events on ' || p_business_date::TEXT,
            'record_type', 'daily_summary',
            'record_type_label', 'Daily Summary',
            'detail_path', '/audit/admin-activity'
        ),
        jsonb_build_object(
            'id', 'open_support_tickets',
            'label', v_ticket_open::TEXT || ' open support tickets',
            'record_type', 'daily_summary',
            'record_type_label', 'Daily Summary',
            'detail_path', '/support/support-ticket-list'
        ),
        jsonb_build_object(
            'id', 'support_tickets_created',
            'label', v_ticket_created::TEXT || ' tickets created on ' || p_business_date::TEXT,
            'record_type', 'daily_summary',
            'record_type_label', 'Daily Summary',
            'detail_path', '/support/support-ticket-list'
        ),
        jsonb_build_object(
            'id', 'platform_active_subscriptions',
            'label', v_platform_active::TEXT || ' active platform subscriptions',
            'record_type', 'daily_summary',
            'record_type_label', 'Daily Summary',
            'detail_path', '/subscriptions/subscription-list'
        ),
        jsonb_build_object(
            'id', 'simulator_active_subscriptions',
            'label', v_simulator_active::TEXT || ' active simulator subscriptions',
            'record_type', 'daily_summary',
            'record_type_label', 'Daily Summary',
            'detail_path', '/subscriptions/subscription-list'
        )
    );

    RETURN jsonb_build_object(
        'process', 'generate_daily_summary',
        'business_date', p_business_date,
        'record_type', 'daily_summary',
        'record_type_label', 'Daily Summary',
        'audit_events', v_audit_count,
        'open_support_tickets', v_ticket_open,
        'support_tickets_created', v_ticket_created,
        'platform_active_subscriptions', v_platform_active,
        'simulator_active_subscriptions', v_simulator_active,
        'records_processed', jsonb_array_length(v_records),
        'processed_records', v_records
    );
END;
$$;

UPDATE admin.cob_run_steps
SET result_summary = jsonb_build_object(
    'process', 'expire_subscriptions',
    'record_type', 'subscription',
    'record_type_label', 'Subscription',
    'platform_expired', 1,
    'simulator_expired', 1,
    'records_processed', 2,
    'processed_records', jsonb_build_array(
        jsonb_build_object(
            'id', 'b7360001-0001-4000-8000-000000000001',
            'label', 'pro (platform)',
            'record_type', 'subscription',
            'record_type_label', 'Subscription',
            'system', 'platform',
            'status', 'expired',
            'detail_path', '/subscriptions/subscription-detail?id=b7360001-0001-4000-8000-000000000001&system=platform'
        ),
        jsonb_build_object(
            'id', 'b7360001-0001-4000-8000-000000000003',
            'label', 'trial (simulator)',
            'record_type', 'subscription',
            'record_type_label', 'Subscription',
            'system', 'simulator',
            'status', 'expired',
            'detail_path', '/subscriptions/subscription-detail?id=b7360001-0001-4000-8000-000000000003&system=simulator'
        )
    )
)
WHERE id = 'b7380028-0005-4000-8000-000000000001'::uuid;

UPDATE admin.cob_run_steps
SET result_summary = jsonb_build_object(
    'process', 'close_resolved_tickets',
    'record_type', 'support_ticket',
    'record_type_label', 'Support Ticket',
    'days_threshold', 7,
    'closed_count', 4,
    'records_processed', 4,
    'processed_records', jsonb_build_array(
        jsonb_build_object('id', 'b7380028-0006-4000-8000-000000000001', 'label', 'TKT-101 — Login issue (seed)', 'record_type', 'support_ticket', 'record_type_label', 'Support Ticket', 'status', 'closed', 'detail_path', '/support/support-ticket-detail?id=b7380028-0006-4000-8000-000000000001'),
        jsonb_build_object('id', 'b7380028-0006-4000-8000-000000000002', 'label', 'TKT-102 — Billing enquiry (seed)', 'record_type', 'support_ticket', 'record_type_label', 'Support Ticket', 'status', 'closed', 'detail_path', '/support/support-ticket-detail?id=b7380028-0006-4000-8000-000000000002'),
        jsonb_build_object('id', 'b7380028-0006-4000-8000-000000000003', 'label', 'TKT-103 — Export feature (seed)', 'record_type', 'support_ticket', 'record_type_label', 'Support Ticket', 'status', 'closed', 'detail_path', '/support/support-ticket-detail?id=b7380028-0006-4000-8000-000000000003'),
        jsonb_build_object('id', 'b7380028-0006-4000-8000-000000000004', 'label', 'TKT-104 — Password reset (seed)', 'record_type', 'support_ticket', 'record_type_label', 'Support Ticket', 'status', 'closed', 'detail_path', '/support/support-ticket-detail?id=b7380028-0006-4000-8000-000000000004')
    )
)
WHERE id = 'b7380028-0005-4000-8000-000000000002'::uuid;

UPDATE admin.cob_run_steps
SET result_summary = jsonb_build_object(
    'process', 'archive_old_errors',
    'record_type', 'error_aggregation',
    'record_type_label', 'Error Aggregation',
    'days_threshold', 30,
    'archived_count', 12,
    'records_processed', 12,
    'processed_records', (
        SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
                'id', format('b7380028-0007-4000-8000-%012s', gs::TEXT),
                'label', 'api_error — Archived error #' || gs::TEXT,
                'record_type', 'error_aggregation',
                'record_type_label', 'Error Aggregation',
                'status', 'ignored',
                'detail_path', '/errors/error-detail?id=' || format('b7380028-0007-4000-8000-%012s', gs::TEXT)
            )
        ), '[]'::JSONB)
        FROM generate_series(1, 12) AS gs
    )
)
WHERE id = 'b7380028-0005-4000-8000-000000000003'::uuid;

UPDATE admin.cob_run_steps
SET result_summary = jsonb_build_object(
    'process', 'generate_daily_summary',
    'record_type', 'daily_summary',
    'record_type_label', 'Daily Summary',
    'audit_events', 156,
    'open_support_tickets', 8,
    'support_tickets_created', 3,
    'platform_active_subscriptions', 42,
    'simulator_active_subscriptions', 18,
    'records_processed', 5,
    'processed_records', jsonb_build_array(
        jsonb_build_object('id', 'audit_events', 'label', '156 audit events', 'record_type', 'daily_summary', 'record_type_label', 'Daily Summary', 'detail_path', '/audit/admin-activity'),
        jsonb_build_object('id', 'open_support_tickets', 'label', '8 open support tickets', 'record_type', 'daily_summary', 'record_type_label', 'Daily Summary', 'detail_path', '/support/support-ticket-list'),
        jsonb_build_object('id', 'support_tickets_created', 'label', '3 tickets created today', 'record_type', 'daily_summary', 'record_type_label', 'Daily Summary', 'detail_path', '/support/support-ticket-list'),
        jsonb_build_object('id', 'platform_active_subscriptions', 'label', '42 active platform subscriptions', 'record_type', 'daily_summary', 'record_type_label', 'Daily Summary', 'detail_path', '/subscriptions/subscription-list'),
        jsonb_build_object('id', 'simulator_active_subscriptions', 'label', '18 active simulator subscriptions', 'record_type', 'daily_summary', 'record_type_label', 'Daily Summary', 'detail_path', '/subscriptions/subscription-list')
    )
)
WHERE id = 'b7380028-0005-4000-8000-000000000004'::uuid;

UPDATE admin.cob_run_steps
SET result_summary = jsonb_build_object(
    'process', 'advance_business_date',
    'record_type', 'business_date',
    'record_type_label', 'Business Date',
    'previous_date', to_char(CURRENT_DATE - INTERVAL '3 days', 'YYYY-MM-DD'),
    'next_date', to_char(CURRENT_DATE - INTERVAL '2 days', 'YYYY-MM-DD'),
    'records_processed', 1,
    'processed_records', jsonb_build_array(
        jsonb_build_object(
            'id', to_char(CURRENT_DATE - INTERVAL '2 days', 'YYYY-MM-DD'),
            'label', to_char(CURRENT_DATE - INTERVAL '3 days', 'YYYY-MM-DD') || ' → ' || to_char(CURRENT_DATE - INTERVAL '2 days', 'YYYY-MM-DD'),
            'record_type', 'business_date',
            'record_type_label', 'Business Date',
            'detail_path', '/batch-ops/business-calendar'
        )
    )
)
WHERE id = 'b7380028-0005-4000-8000-000000000007'::uuid;

UPDATE admin.cob_run_steps
SET result_summary = jsonb_build_object(
    'process', 'close_resolved_tickets',
    'record_type', 'support_ticket',
    'record_type_label', 'Support Ticket',
    'closed_count', 1,
    'records_processed', 1,
    'processed_records', jsonb_build_array(
        jsonb_build_object(
            'id', 'b7380028-0006-4000-8000-000000000010',
            'label', 'TKT-201 — Resolved billing ticket (seed)',
            'record_type', 'support_ticket',
            'record_type_label', 'Support Ticket',
            'status', 'closed',
            'detail_path', '/support/support-ticket-detail?id=b7380028-0006-4000-8000-000000000010'
        )
    )
)
WHERE id = 'b7380028-0005-4000-8000-000000000011'::uuid;

DO $$
BEGIN
    RAISE NOTICE 'v32: COB processed record metadata applied.';
END $$;
