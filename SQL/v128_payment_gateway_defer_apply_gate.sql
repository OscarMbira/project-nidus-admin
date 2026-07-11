-- ============================================================================
-- v128: Payment gateway defer-apply gate
-- PostgreSQL 15+ / Supabase
-- Plan: projectplans/v18.0_record_lifecycle_defer_apply_plan.md
-- Prerequisites: v125_record_lifecycle_authoriser_strictness.sql
-- ============================================================================

CREATE OR REPLACE FUNCTION admin.update_payment_gateway(
    p_gateway_id UUID,
    p_name TEXT DEFAULT NULL,
    p_display_name TEXT DEFAULT NULL,
    p_environment TEXT DEFAULT NULL,
    p_api_key TEXT DEFAULT NULL,
    p_api_secret TEXT DEFAULT NULL,
    p_webhook_secret TEXT DEFAULT NULL,
    p_is_active BOOLEAN DEFAULT NULL,
    p_is_default BOOLEAN DEFAULT NULL,
    p_metadata JSONB DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_prev admin.payment_gateways%ROWTYPE;
    v_new admin.payment_gateways%ROWTYPE;
    v_lifecycle_config JSONB;
    v_authoriser_count INTEGER := 0;
    v_governance_active BOOLEAN := FALSE;
    v_has_changes BOOLEAN := FALSE;
    v_proposed_changes JSONB := '{}'::jsonb;
    v_submission_batch_id UUID;
    v_name TEXT;
    v_display_name TEXT;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'billing.payment_config.edit') THEN
        RAISE EXCEPTION 'Permission denied: billing.payment_config.edit required';
    END IF;

    SELECT * INTO v_prev
    FROM admin.payment_gateways
    WHERE id = p_gateway_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payment gateway not found: %', p_gateway_id;
    END IF;

    IF p_environment IS NOT NULL AND p_environment NOT IN ('sandbox', 'production') THEN
        RAISE EXCEPTION 'Invalid environment: %', p_environment;
    END IF;

    v_name := COALESCE(NULLIF(trim(p_name), ''), v_prev.name);
    v_display_name := COALESCE(NULLIF(trim(p_display_name), ''), v_prev.display_name);

    v_lifecycle_config := admin.get_lifecycle_config('payment_gateways', v_admin_user_id);
    SELECT COUNT(*)::INTEGER
    INTO v_authoriser_count
    FROM admin.record_authorisers ra
    WHERE ra.table_name = 'payment_gateways'
      AND ra.is_active = TRUE;

    v_governance_active := COALESCE((v_lifecycle_config->>'approval_enabled')::BOOLEAN, FALSE)
        AND v_authoriser_count > 0;

    v_has_changes := (
        (p_name IS NOT NULL AND v_name IS DISTINCT FROM v_prev.name)
        OR (p_display_name IS NOT NULL AND v_display_name IS DISTINCT FROM v_prev.display_name)
        OR (p_environment IS NOT NULL AND p_environment IS DISTINCT FROM v_prev.environment)
        OR (p_api_key IS NOT NULL AND trim(p_api_key) <> '' AND admin._mask_last_four(p_api_key) IS DISTINCT FROM v_prev.api_key_masked)
        OR (p_api_secret IS NOT NULL AND trim(p_api_secret) <> '')
        OR (p_webhook_secret IS NOT NULL AND trim(p_webhook_secret) <> '')
        OR (p_is_active IS NOT NULL AND p_is_active IS DISTINCT FROM v_prev.is_active)
        OR (p_is_default IS NOT NULL AND p_is_default IS DISTINCT FROM v_prev.is_default)
        OR (p_metadata IS NOT NULL AND p_metadata IS DISTINCT FROM v_prev.metadata)
        OR (p_notes IS NOT NULL AND NULLIF(trim(p_notes), '') IS DISTINCT FROM v_prev.notes)
    );

    IF v_governance_active AND v_has_changes THEN
        IF p_name IS NOT NULL AND v_name IS DISTINCT FROM v_prev.name THEN
            v_proposed_changes := v_proposed_changes || jsonb_build_object('name', v_name);
        END IF;
        IF p_display_name IS NOT NULL AND v_display_name IS DISTINCT FROM v_prev.display_name THEN
            v_proposed_changes := v_proposed_changes || jsonb_build_object('display_name', v_display_name);
        END IF;
        IF p_environment IS NOT NULL AND p_environment IS DISTINCT FROM v_prev.environment THEN
            v_proposed_changes := v_proposed_changes || jsonb_build_object('environment', p_environment);
        END IF;
        IF p_api_key IS NOT NULL AND trim(p_api_key) <> '' THEN
            v_proposed_changes := v_proposed_changes || jsonb_build_object('api_key_masked', admin._mask_last_four(p_api_key));
        END IF;
        IF p_api_secret IS NOT NULL AND trim(p_api_secret) <> '' THEN
            v_proposed_changes := v_proposed_changes || jsonb_build_object('api_secret_hash', admin._hash_sha256_secret(p_api_secret));
        END IF;
        IF p_webhook_secret IS NOT NULL AND trim(p_webhook_secret) <> '' THEN
            v_proposed_changes := v_proposed_changes || jsonb_build_object('webhook_secret_hash', admin._hash_sha256_secret(p_webhook_secret));
        END IF;
        IF p_is_active IS NOT NULL AND p_is_active IS DISTINCT FROM v_prev.is_active THEN
            v_proposed_changes := v_proposed_changes || jsonb_build_object('is_active', p_is_active);
        END IF;
        IF p_is_default IS NOT NULL AND p_is_default IS DISTINCT FROM v_prev.is_default THEN
            v_proposed_changes := v_proposed_changes || jsonb_build_object('is_default', p_is_default);
        END IF;
        IF p_metadata IS NOT NULL AND p_metadata IS DISTINCT FROM v_prev.metadata THEN
            v_proposed_changes := v_proposed_changes || jsonb_build_object('metadata', p_metadata);
        END IF;
        IF p_notes IS NOT NULL AND NULLIF(trim(p_notes), '') IS DISTINCT FROM v_prev.notes THEN
            v_proposed_changes := v_proposed_changes || jsonb_build_object('notes', NULLIF(trim(p_notes), ''));
        END IF;

        v_submission_batch_id := admin.submit_for_authorisation(
            'payment_gateways',
            v_prev.id,
            COALESCE(v_prev.root_record_id, v_prev.id),
            v_admin_user_id,
            'Payment gateway change submitted for authorisation',
            v_proposed_changes
        );

        PERFORM admin.log_admin_action(
            v_admin_user_id,
            'payment_gateway.update',
            'payment_gateway',
            p_gateway_id,
            jsonb_build_object(
                'name', v_prev.name,
                'provider_key', v_prev.provider_key,
                'governance_active', TRUE,
                'defer_apply', TRUE,
                'authorisation_batch_id', v_submission_batch_id,
                'proposed_changes', admin._payment_config_safe_row(v_proposed_changes)
            ),
            admin._payment_config_safe_row(to_jsonb(v_prev)),
            admin._payment_config_safe_row(to_jsonb(v_prev))
        );
        RETURN TRUE;
    END IF;

    IF COALESCE(p_is_default, FALSE) THEN
        UPDATE admin.payment_gateways
        SET is_default = FALSE,
            updated_by = v_admin_user_id,
            updated_at = NOW()
        WHERE is_default = TRUE
          AND id <> p_gateway_id;
    END IF;

    UPDATE admin.payment_gateways
    SET name = v_name,
        display_name = v_display_name,
        environment = COALESCE(p_environment, environment),
        api_key_masked = CASE
            WHEN p_api_key IS NULL OR trim(p_api_key) = '' THEN api_key_masked
            ELSE admin._mask_last_four(p_api_key)
        END,
        api_secret_hash = CASE
            WHEN p_api_secret IS NULL OR trim(p_api_secret) = '' THEN api_secret_hash
            ELSE admin._hash_sha256_secret(p_api_secret)
        END,
        webhook_secret_hash = CASE
            WHEN p_webhook_secret IS NULL OR trim(p_webhook_secret) = '' THEN webhook_secret_hash
            ELSE admin._hash_sha256_secret(p_webhook_secret)
        END,
        is_active = COALESCE(p_is_active, is_active),
        is_default = COALESCE(p_is_default, is_default),
        metadata = COALESCE(p_metadata, metadata),
        notes = CASE
            WHEN p_notes IS NULL THEN notes
            ELSE NULLIF(trim(p_notes), '')
        END,
        updated_by = v_admin_user_id,
        updated_at = NOW()
    WHERE id = p_gateway_id
    RETURNING * INTO v_new;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'payment_gateway.update',
        'payment_gateway',
        p_gateway_id,
        jsonb_build_object('name', v_new.name, 'provider_key', v_new.provider_key),
        admin._payment_config_safe_row(to_jsonb(v_prev)),
        admin._payment_config_safe_row(to_jsonb(v_new))
    );

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION admin.update_payment_gateway(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, JSONB, TEXT, UUID) TO authenticated, service_role;
