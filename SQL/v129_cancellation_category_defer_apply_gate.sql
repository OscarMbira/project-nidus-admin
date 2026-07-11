-- ============================================================================
-- v129: Cancellation category defer-apply gate
-- PostgreSQL 15+ / Supabase
-- Plan: projectplans/v18.0_record_lifecycle_defer_apply_plan.md
-- Prerequisites: v125_record_lifecycle_authoriser_strictness.sql
-- ============================================================================

CREATE OR REPLACE FUNCTION admin.admin_upsert_cancellation_category(
    p_id          UUID DEFAULT NULL,
    p_code        TEXT DEFAULT NULL,
    p_label       TEXT DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_sort_order  INT DEFAULT 0,
    p_is_active   BOOLEAN DEFAULT TRUE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin UUID;
    v_id    UUID;
    v_prev  admin.cancellation_reason_categories%ROWTYPE;
    v_new   admin.cancellation_reason_categories%ROWTYPE;
    v_code  TEXT;
    v_lifecycle_config JSONB;
    v_authoriser_count INTEGER := 0;
    v_governance_active BOOLEAN := FALSE;
    v_has_changes BOOLEAN := FALSE;
    v_proposed_changes JSONB := '{}'::jsonb;
    v_submission_batch_id UUID;
    v_label TEXT;
    v_description TEXT;
BEGIN
    v_admin := admin.current_admin_user_id();
    IF v_admin IS NULL OR NOT admin.check_admin_permission(v_admin, 'cancellation:manage_categories') THEN
        RAISE EXCEPTION 'Permission denied: cancellation:manage_categories required';
    END IF;

    v_code := lower(trim(regexp_replace(COALESCE(p_code, ''), '[^a-z0-9_]+', '_', 'g'), '_'));
    IF v_code = '' OR trim(COALESCE(p_label, '')) = '' THEN
        RAISE EXCEPTION 'code and label are required';
    END IF;

    v_label := trim(p_label);
    v_description := NULLIF(trim(COALESCE(p_description, '')), '');

    IF p_id IS NULL THEN
        INSERT INTO admin.cancellation_reason_categories (
            code, label, description, sort_order, is_active
        )
        VALUES (
            v_code, v_label, v_description,
            COALESCE(p_sort_order, 0), COALESCE(p_is_active, TRUE)
        )
        RETURNING id INTO v_id;
    ELSE
        SELECT * INTO v_prev FROM admin.cancellation_reason_categories WHERE id = p_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Category not found: %', p_id;
        END IF;

        v_lifecycle_config := admin.get_lifecycle_config('cancellation_reason_categories', v_admin);
        SELECT COUNT(*)::INTEGER
        INTO v_authoriser_count
        FROM admin.record_authorisers ra
        WHERE ra.table_name = 'cancellation_reason_categories'
          AND ra.is_active = TRUE;

        v_governance_active := COALESCE((v_lifecycle_config->>'approval_enabled')::BOOLEAN, FALSE)
            AND v_authoriser_count > 0;

        v_has_changes := (
            v_code IS DISTINCT FROM v_prev.code
            OR v_label IS DISTINCT FROM v_prev.label
            OR v_description IS DISTINCT FROM v_prev.description
            OR COALESCE(p_sort_order, v_prev.sort_order) IS DISTINCT FROM v_prev.sort_order
            OR COALESCE(p_is_active, v_prev.is_active) IS DISTINCT FROM v_prev.is_active
        );

        IF v_governance_active AND v_has_changes THEN
            IF v_code IS DISTINCT FROM v_prev.code THEN
                v_proposed_changes := v_proposed_changes || jsonb_build_object('code', v_code);
            END IF;
            IF v_label IS DISTINCT FROM v_prev.label THEN
                v_proposed_changes := v_proposed_changes || jsonb_build_object('label', v_label);
            END IF;
            IF v_description IS DISTINCT FROM v_prev.description THEN
                v_proposed_changes := v_proposed_changes || jsonb_build_object('description', v_description);
            END IF;
            IF COALESCE(p_sort_order, v_prev.sort_order) IS DISTINCT FROM v_prev.sort_order THEN
                v_proposed_changes := v_proposed_changes || jsonb_build_object('sort_order', COALESCE(p_sort_order, v_prev.sort_order));
            END IF;
            IF COALESCE(p_is_active, v_prev.is_active) IS DISTINCT FROM v_prev.is_active THEN
                v_proposed_changes := v_proposed_changes || jsonb_build_object('is_active', COALESCE(p_is_active, v_prev.is_active));
            END IF;

            v_submission_batch_id := admin.submit_for_authorisation(
                'cancellation_reason_categories',
                v_prev.id,
                COALESCE(v_prev.root_record_id, v_prev.id),
                v_admin,
                'Cancellation category change submitted for authorisation',
                v_proposed_changes
            );

            PERFORM admin.log_admin_action(
                v_admin,
                'cancellation_category.update',
                'cancellation_reason_category',
                p_id,
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

            RETURN p_id;
        END IF;

        UPDATE admin.cancellation_reason_categories
        SET code = v_code,
            label = v_label,
            description = v_description,
            sort_order = COALESCE(p_sort_order, sort_order),
            is_active = COALESCE(p_is_active, is_active),
            updated_at = NOW()
        WHERE id = p_id
        RETURNING id INTO v_id;
    END IF;

    SELECT * INTO v_new FROM admin.cancellation_reason_categories WHERE id = v_id;

    PERFORM admin.log_admin_action(
        v_admin,
        CASE WHEN p_id IS NULL THEN 'cancellation_category.create' ELSE 'cancellation_category.update' END,
        'cancellation_reason_category',
        v_id,
        jsonb_build_object('code', v_new.code),
        CASE WHEN p_id IS NULL THEN NULL ELSE to_jsonb(v_prev) END,
        to_jsonb(v_new)
    );

    RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION admin.admin_upsert_cancellation_category(UUID, TEXT, TEXT, TEXT, INT, BOOLEAN) TO authenticated, service_role;
