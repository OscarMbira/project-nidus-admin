-- ============================================================================
-- v127: Affiliate defer-apply gate
-- PostgreSQL 15+ / Supabase
-- Plan: projectplans/v18.0_record_lifecycle_defer_apply_plan.md
-- Prerequisites: v125_record_lifecycle_authoriser_strictness.sql
-- ============================================================================

CREATE OR REPLACE FUNCTION admin.update_affiliate(
    p_affiliate_id UUID,
    p_name TEXT DEFAULT NULL,
    p_email TEXT DEFAULT NULL,
    p_phone TEXT DEFAULT NULL,
    p_website TEXT DEFAULT NULL,
    p_target_system TEXT DEFAULT NULL,
    p_commission_rate_pct NUMERIC DEFAULT NULL,
    p_application_notes TEXT DEFAULT NULL,
    p_payout_method TEXT DEFAULT NULL,
    p_payout_details JSONB DEFAULT NULL,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_prev admin.affiliates%ROWTYPE;
    v_new admin.affiliates%ROWTYPE;
    v_lifecycle_config JSONB;
    v_authoriser_count INTEGER := 0;
    v_governance_active BOOLEAN := FALSE;
    v_has_changes BOOLEAN := FALSE;
    v_proposed_changes JSONB := '{}'::jsonb;
    v_submission_batch_id UUID;
    v_name TEXT;
    v_email TEXT;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN RAISE EXCEPTION 'Unable to resolve acting admin user'; END IF;
    IF NOT admin.check_admin_permission(v_admin_user_id, 'affiliate:update') THEN
        RAISE EXCEPTION 'Permission denied: affiliate:update required';
    END IF;

    SELECT * INTO v_prev FROM admin.affiliates WHERE id = p_affiliate_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Affiliate not found: %', p_affiliate_id; END IF;
    IF p_target_system IS NOT NULL AND p_target_system NOT IN ('platform', 'simulator', 'both') THEN
        RAISE EXCEPTION 'Invalid target_system: %', p_target_system;
    END IF;

    v_name := COALESCE(NULLIF(trim(p_name), ''), v_prev.name);
    v_email := COALESCE(NULLIF(lower(trim(p_email)), ''), v_prev.email);

    v_lifecycle_config := admin.get_lifecycle_config('affiliates', v_admin_user_id);
    SELECT COUNT(*)::INTEGER
    INTO v_authoriser_count
    FROM admin.record_authorisers ra
    WHERE ra.table_name = 'affiliates'
      AND ra.is_active = TRUE;

    v_governance_active := COALESCE((v_lifecycle_config->>'approval_enabled')::BOOLEAN, FALSE)
        AND v_authoriser_count > 0;

    v_has_changes := (
        (p_name IS NOT NULL AND v_name IS DISTINCT FROM v_prev.name)
        OR (p_email IS NOT NULL AND v_email IS DISTINCT FROM v_prev.email)
        OR (p_phone IS NOT NULL AND NULLIF(trim(p_phone), '') IS DISTINCT FROM v_prev.phone)
        OR (p_website IS NOT NULL AND NULLIF(trim(p_website), '') IS DISTINCT FROM v_prev.website)
        OR (p_target_system IS NOT NULL AND p_target_system IS DISTINCT FROM v_prev.target_system)
        OR (p_commission_rate_pct IS NOT NULL AND p_commission_rate_pct IS DISTINCT FROM v_prev.commission_rate_pct)
        OR (p_application_notes IS NOT NULL AND NULLIF(trim(p_application_notes), '') IS DISTINCT FROM v_prev.application_notes)
        OR (p_payout_method IS NOT NULL AND p_payout_method IS DISTINCT FROM v_prev.payout_method)
        OR (p_payout_details IS NOT NULL AND p_payout_details IS DISTINCT FROM v_prev.payout_details)
    );

    IF v_governance_active AND v_has_changes THEN
        IF p_name IS NOT NULL AND v_name IS DISTINCT FROM v_prev.name THEN
            v_proposed_changes := v_proposed_changes || jsonb_build_object('name', v_name);
        END IF;
        IF p_email IS NOT NULL AND v_email IS DISTINCT FROM v_prev.email THEN
            v_proposed_changes := v_proposed_changes || jsonb_build_object('email', v_email);
        END IF;
        IF p_phone IS NOT NULL AND NULLIF(trim(p_phone), '') IS DISTINCT FROM v_prev.phone THEN
            v_proposed_changes := v_proposed_changes || jsonb_build_object('phone', NULLIF(trim(p_phone), ''));
        END IF;
        IF p_website IS NOT NULL AND NULLIF(trim(p_website), '') IS DISTINCT FROM v_prev.website THEN
            v_proposed_changes := v_proposed_changes || jsonb_build_object('website', NULLIF(trim(p_website), ''));
        END IF;
        IF p_target_system IS NOT NULL AND p_target_system IS DISTINCT FROM v_prev.target_system THEN
            v_proposed_changes := v_proposed_changes || jsonb_build_object('target_system', p_target_system);
        END IF;
        IF p_commission_rate_pct IS NOT NULL AND p_commission_rate_pct IS DISTINCT FROM v_prev.commission_rate_pct THEN
            v_proposed_changes := v_proposed_changes || jsonb_build_object('commission_rate_pct', p_commission_rate_pct);
        END IF;
        IF p_application_notes IS NOT NULL AND NULLIF(trim(p_application_notes), '') IS DISTINCT FROM v_prev.application_notes THEN
            v_proposed_changes := v_proposed_changes || jsonb_build_object('application_notes', NULLIF(trim(p_application_notes), ''));
        END IF;
        IF p_payout_method IS NOT NULL AND p_payout_method IS DISTINCT FROM v_prev.payout_method THEN
            v_proposed_changes := v_proposed_changes || jsonb_build_object('payout_method', p_payout_method);
        END IF;
        IF p_payout_details IS NOT NULL AND p_payout_details IS DISTINCT FROM v_prev.payout_details THEN
            v_proposed_changes := v_proposed_changes || jsonb_build_object('payout_details', p_payout_details);
        END IF;

        v_submission_batch_id := admin.submit_for_authorisation(
            'affiliates',
            v_prev.id,
            COALESCE(v_prev.root_record_id, v_prev.id),
            v_admin_user_id,
            'Affiliate change submitted for authorisation',
            v_proposed_changes
        );

        PERFORM admin.log_admin_action(
            v_admin_user_id,
            'affiliate.update',
            'affiliate',
            p_affiliate_id,
            jsonb_build_object(
                'code', v_prev.code,
                'governance_active', TRUE,
                'defer_apply', TRUE,
                'authorisation_batch_id', v_submission_batch_id,
                'proposed_changes', v_proposed_changes
            ),
            to_jsonb(v_prev),
            to_jsonb(v_prev)
        );
        RETURN TRUE;
    END IF;

    UPDATE admin.affiliates
    SET name = v_name,
        email = v_email,
        phone = CASE WHEN p_phone IS NULL THEN phone ELSE NULLIF(trim(p_phone), '') END,
        website = CASE WHEN p_website IS NULL THEN website ELSE NULLIF(trim(p_website), '') END,
        target_system = COALESCE(p_target_system, target_system),
        commission_rate_pct = COALESCE(p_commission_rate_pct, commission_rate_pct),
        application_notes = CASE WHEN p_application_notes IS NULL THEN application_notes ELSE NULLIF(trim(p_application_notes), '') END,
        payout_method = COALESCE(p_payout_method, payout_method),
        payout_details = COALESCE(p_payout_details, payout_details),
        updated_by = v_admin_user_id,
        updated_at = NOW()
    WHERE id = p_affiliate_id
    RETURNING * INTO v_new;

    PERFORM admin.log_admin_action(v_admin_user_id, 'affiliate.update', 'affiliate', p_affiliate_id,
        jsonb_build_object('code', v_new.code), to_jsonb(v_prev), to_jsonb(v_new));
    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION admin.update_affiliate(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, JSONB, UUID) TO authenticated, service_role;
