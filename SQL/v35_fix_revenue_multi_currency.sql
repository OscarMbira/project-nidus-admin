-- ============================================================================
-- v35: Fix ambiguous total_amount in get_revenue_summary_multi_currency
-- PostgreSQL 15+ / Supabase
-- Problem: RETURNS TABLE column names shadow query columns in PL/pgSQL,
--          causing "column reference total_amount is ambiguous" (HTTP 400).
-- ============================================================================

CREATE OR REPLACE FUNCTION admin.get_revenue_summary_multi_currency(
    p_date_from DATE,
    p_date_to DATE
)
RETURNS TABLE (
    currency TEXT,
    total_amount NUMERIC,
    total_amount_base NUMERIC,
    transaction_count BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = admin, public, sim
AS $function$
#variable_conflict use_column
DECLARE
    v_admin_user_id UUID;
    v_base VARCHAR(3);
    v_as_of TIMESTAMPTZ;
BEGIN
    v_admin_user_id := admin.current_admin_user_id();
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve current admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'subscriptions.view') THEN
        RAISE EXCEPTION 'Permission denied: subscriptions.view required';
    END IF;

    IF p_date_from IS NULL OR p_date_to IS NULL THEN
        RAISE EXCEPTION 'Both date_from and date_to are required';
    END IF;

    IF p_date_to < p_date_from THEN
        RAISE EXCEPTION 'date_to (%) cannot be before date_from (%)', p_date_to, p_date_from;
    END IF;

    SELECT c.currency_code
    INTO v_base
    FROM admin.currencies c
    WHERE c.is_base = TRUE
    LIMIT 1;

    v_base := COALESCE(v_base, 'USD');
    v_as_of := (p_date_to + 1)::TIMESTAMPTZ;

    RETURN QUERY
    WITH platform_rev AS (
        SELECT
            upper(trim(COALESCE(pt.currency, 'USD'))) AS currency_code,
            COALESCE(SUM(pt.amount), 0)::NUMERIC AS rev_amount,
            COUNT(*)::BIGINT AS rev_txn_count
        FROM public.payment_transactions pt
        WHERE pt.status = 'paid'
          AND (pt.created_at AT TIME ZONE 'UTC')::DATE BETWEEN p_date_from AND p_date_to
        GROUP BY upper(trim(COALESCE(pt.currency, 'USD')))
    ),
    simulator_rev AS (
        SELECT
            upper(trim(COALESCE(ss.currency, 'USD'))) AS currency_code,
            COALESCE(SUM(ss.amount_paid), 0)::NUMERIC AS rev_amount,
            COUNT(*)::BIGINT AS rev_txn_count
        FROM sim.simulator_subscriptions ss
        WHERE ss.status IN ('active', 'trialing')
          AND ss.amount_paid IS NOT NULL
          AND ss.amount_paid > 0
          AND (ss.started_at AT TIME ZONE 'UTC')::DATE BETWEEN p_date_from AND p_date_to
        GROUP BY upper(trim(COALESCE(ss.currency, 'USD')))
    ),
    combined AS (
        SELECT platform_rev.currency_code, platform_rev.rev_amount, platform_rev.rev_txn_count
        FROM platform_rev
        UNION ALL
        SELECT simulator_rev.currency_code, simulator_rev.rev_amount, simulator_rev.rev_txn_count
        FROM simulator_rev
    ),
    aggregated AS (
        SELECT
            combined.currency_code AS rev_currency_code,
            SUM(combined.rev_amount)::NUMERIC AS rev_amount,
            SUM(combined.rev_txn_count)::BIGINT AS rev_txn_count
        FROM combined
        GROUP BY combined.currency_code
    )
    SELECT
        aggregated.rev_currency_code::TEXT,
        aggregated.rev_amount,
        admin.convert_currency(aggregated.rev_amount, aggregated.rev_currency_code, v_base, v_as_of),
        aggregated.rev_txn_count
    FROM aggregated
    ORDER BY aggregated.rev_currency_code;
END;
$function$;

GRANT EXECUTE ON FUNCTION admin.get_revenue_summary_multi_currency(DATE, DATE) TO authenticated, service_role;
