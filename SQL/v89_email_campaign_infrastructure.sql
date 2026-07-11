-- ============================================================================
-- v89: Email campaign infrastructure
-- Plan: projectplans/v13.0_email_centre_plan.md (Phase 2)
-- Run: pnpm run admin:migrate-email-campaigns
-- Prerequisites: v88_email_dispatch_infrastructure.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS admin.email_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_name TEXT NOT NULL,
    description TEXT,
    template_id UUID REFERENCES admin.email_templates(id) ON DELETE SET NULL,
    subject_override TEXT,
    audience_filter JSONB NOT NULL DEFAULT '{}'::JSONB,
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'paused', 'cancelled')),
    scheduled_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    total_recipients INTEGER NOT NULL DEFAULT 0,
    sent_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,
    created_by UUID REFERENCES admin.admin_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin.email_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID REFERENCES admin.email_campaigns(id) ON DELETE CASCADE,
    recipient_email TEXT NOT NULL,
    recipient_name TEXT,
    variables JSONB NOT NULL DEFAULT '{}'::JSONB,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'cancelled')),
    scheduled_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    error_message TEXT,
    send_log_id UUID REFERENCES admin.email_send_log(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_queue_campaign ON admin.email_queue(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_queue_status ON admin.email_queue(status);
CREATE INDEX IF NOT EXISTS idx_email_queue_scheduled ON admin.email_queue(scheduled_at) WHERE status = 'pending';

DROP TRIGGER IF EXISTS trg_email_campaigns_updated_at ON admin.email_campaigns;
CREATE TRIGGER trg_email_campaigns_updated_at
    BEFORE UPDATE ON admin.email_campaigns
    FOR EACH ROW EXECUTE FUNCTION admin.set_updated_at();

ALTER TABLE admin.email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.email_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_campaigns_select ON admin.email_campaigns;
CREATE POLICY email_campaigns_select ON admin.email_campaigns
    FOR SELECT TO authenticated USING (admin.is_active_admin());

DROP POLICY IF EXISTS email_queue_select ON admin.email_queue;
CREATE POLICY email_queue_select ON admin.email_queue
    FOR SELECT TO authenticated USING (admin.is_active_admin());

GRANT SELECT ON admin.email_campaigns TO authenticated;
GRANT SELECT ON admin.email_queue TO authenticated;
GRANT ALL ON admin.email_campaigns TO service_role;
GRANT ALL ON admin.email_queue TO service_role;

-- ---------------------------------------------------------------------------
-- admin.build_campaign_audience
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.build_campaign_audience(
    p_audience_filter JSONB DEFAULT '{}'::JSONB,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS TABLE(email TEXT, name TEXT, user_id UUID)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = admin, public, sim
AS $$
DECLARE
    v_admin_id UUID;
    v_system TEXT;
    v_plan_type TEXT;
    v_sub_status TEXT;
    v_affiliate_only BOOLEAN;
    v_include_expired BOOLEAN;
BEGIN
    v_admin_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF NOT admin.check_admin_permission(v_admin_id, 'system.email.send') THEN
        RAISE EXCEPTION 'Permission denied: system.email.send required';
    END IF;

    v_system := NULLIF(p_audience_filter->>'system', '');
    v_plan_type := NULLIF(p_audience_filter->>'plan_type', '');
    v_sub_status := NULLIF(p_audience_filter->>'subscription_status', '');
    v_affiliate_only := COALESCE((p_audience_filter->>'is_affiliate')::BOOLEAN, FALSE);
    v_include_expired := COALESCE((p_audience_filter->>'include_expired')::BOOLEAN, FALSE);

    RETURN QUERY
    SELECT DISTINCT
        lower(trim(u.email))::TEXT,
        COALESCE(u.full_name, '')::TEXT,
        u.id
    FROM public.users u
    LEFT JOIN public.platform_subscriptions ps ON ps.user_id = u.auth_user_id
        AND COALESCE(ps.is_deleted, FALSE) = FALSE
    LEFT JOIN sim.simulator_subscriptions ss ON ss.user_id = u.id
        AND COALESCE(ss.is_deleted, FALSE) = FALSE
    LEFT JOIN admin.affiliates af ON lower(af.email) = lower(u.email) AND af.status = 'active'
    WHERE COALESCE(u.is_deleted, FALSE) = FALSE
      AND u.is_active = TRUE
      AND u.email IS NOT NULL
      AND trim(u.email) <> ''
      AND (
        v_system IS NULL OR v_system = 'all'
        OR (v_system = 'platform' AND ps.id IS NOT NULL)
        OR (v_system = 'simulator' AND ss.id IS NOT NULL)
      )
      AND (
        v_plan_type IS NULL
        OR ps.plan_type = v_plan_type
        OR ss.plan_type = v_plan_type
      )
      AND (
        v_sub_status IS NULL
        OR v_include_expired = TRUE
        OR (
            v_sub_status = 'active' AND (
                (ps.status = 'active' OR ps.status IS NULL)
                AND (ss.status = 'active' OR ss.id IS NULL)
            )
        )
        OR (
            v_sub_status = 'expired' AND (
                ps.status IN ('expired', 'cancelled')
                OR ss.status IN ('expired', 'cancelled')
            )
        )
      )
      AND (NOT v_affiliate_only OR af.id IS NOT NULL)
    ORDER BY 1;
END;
$$;

-- ---------------------------------------------------------------------------
-- Campaign RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.create_email_campaign(
    p_campaign_name TEXT,
    p_description TEXT DEFAULT NULL,
    p_template_id UUID DEFAULT NULL,
    p_subject_override TEXT DEFAULT NULL,
    p_audience_filter JSONB DEFAULT '{}'::JSONB,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = admin, public
AS $$
DECLARE v_admin_id UUID; v_id UUID;
BEGIN
    v_admin_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF NOT admin.check_admin_permission(v_admin_id, 'system.email.send') THEN
        RAISE EXCEPTION 'Permission denied: system.email.send required';
    END IF;
    INSERT INTO admin.email_campaigns (campaign_name, description, template_id, subject_override, audience_filter, created_by)
    VALUES (trim(p_campaign_name), p_description, p_template_id, p_subject_override, COALESCE(p_audience_filter, '{}'::JSONB), v_admin_id)
    RETURNING id INTO v_id;
    PERFORM admin.log_admin_action(v_admin_id, 'email_campaign.create', 'email_campaign', v_id, NULL, NULL,
        jsonb_build_object('campaign_name', trim(p_campaign_name)));
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION admin.update_email_campaign(
    p_campaign_id UUID,
    p_updates JSONB,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = admin, public
AS $$
DECLARE v_admin_id UUID;
BEGIN
    v_admin_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF NOT admin.check_admin_permission(v_admin_id, 'system.email.send') THEN
        RAISE EXCEPTION 'Permission denied: system.email.send required';
    END IF;
    UPDATE admin.email_campaigns
    SET campaign_name = COALESCE(p_updates->>'campaign_name', campaign_name),
        description = COALESCE(p_updates->>'description', description),
        template_id = COALESCE((p_updates->>'template_id')::UUID, template_id),
        subject_override = COALESCE(p_updates->>'subject_override', subject_override),
        audience_filter = COALESCE(p_updates->'audience_filter', audience_filter),
        status = COALESCE(p_updates->>'status', status),
        scheduled_at = COALESCE((p_updates->>'scheduled_at')::TIMESTAMPTZ, scheduled_at),
        updated_at = NOW()
    WHERE id = p_campaign_id AND status IN ('draft', 'scheduled', 'paused');
    IF NOT FOUND THEN RAISE EXCEPTION 'Campaign not found or not editable'; END IF;
    RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION admin.delete_email_campaign(
    p_campaign_id UUID,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = admin, public
AS $$
DECLARE v_admin_id UUID; v_status TEXT;
BEGIN
    v_admin_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF NOT admin.check_admin_permission(v_admin_id, 'system.email.send') THEN
        RAISE EXCEPTION 'Permission denied: system.email.send required';
    END IF;
    SELECT status INTO v_status FROM admin.email_campaigns WHERE id = p_campaign_id;
    IF v_status NOT IN ('draft', 'cancelled') THEN
        RAISE EXCEPTION 'Only draft or cancelled campaigns can be deleted';
    END IF;
    DELETE FROM admin.email_campaigns WHERE id = p_campaign_id;
    RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION admin.schedule_email_campaign(
    p_campaign_id UUID,
    p_scheduled_at TIMESTAMPTZ,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = admin, public
AS $$
DECLARE v_admin_id UUID;
BEGIN
    v_admin_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF NOT admin.check_admin_permission(v_admin_id, 'system.email.send') THEN
        RAISE EXCEPTION 'Permission denied: system.email.send required';
    END IF;
    UPDATE admin.email_campaigns
    SET status = 'scheduled', scheduled_at = p_scheduled_at, updated_at = NOW()
    WHERE id = p_campaign_id AND status = 'draft';
    RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION admin.cancel_email_campaign(
    p_campaign_id UUID,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = admin, public
AS $$
DECLARE v_admin_id UUID;
BEGIN
    v_admin_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF NOT admin.check_admin_permission(v_admin_id, 'system.email.send') THEN
        RAISE EXCEPTION 'Permission denied: system.email.send required';
    END IF;
    UPDATE admin.email_campaigns SET status = 'cancelled', updated_at = NOW()
    WHERE id = p_campaign_id AND status IN ('draft', 'scheduled', 'sending', 'paused');
    UPDATE admin.email_queue SET status = 'cancelled'
    WHERE campaign_id = p_campaign_id AND status IN ('pending', 'sending');
    RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION admin.enqueue_campaign(
    p_campaign_id UUID,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = admin, public
AS $$
DECLARE
    v_admin_id UUID;
    v_campaign admin.email_campaigns%ROWTYPE;
    v_count INTEGER := 0;
    v_row RECORD;
BEGIN
    v_admin_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF NOT admin.check_admin_permission(v_admin_id, 'system.email.send') THEN
        RAISE EXCEPTION 'Permission denied: system.email.send required';
    END IF;

    SELECT * INTO v_campaign FROM admin.email_campaigns WHERE id = p_campaign_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Campaign not found'; END IF;

    DELETE FROM admin.email_queue WHERE campaign_id = p_campaign_id AND status = 'pending';

    FOR v_row IN SELECT * FROM admin.build_campaign_audience(v_campaign.audience_filter, v_admin_id)
    LOOP
        INSERT INTO admin.email_queue (campaign_id, recipient_email, recipient_name, variables, status)
        VALUES (p_campaign_id, v_row.email, v_row.name, jsonb_build_object('first_name', split_part(v_row.name, ' ', 1)), 'pending');
        v_count := v_count + 1;
    END LOOP;

    UPDATE admin.email_campaigns
    SET status = 'sending', total_recipients = v_count, sent_count = 0, failed_count = 0, updated_at = NOW()
    WHERE id = p_campaign_id;

    RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION admin.get_email_analytics(p_days INTEGER DEFAULT 30)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = admin, public
AS $$
DECLARE
    v_admin_id UUID;
    v_since TIMESTAMPTZ;
    v_total_sent INTEGER;
    v_total_failed INTEGER;
    v_total_bounced INTEGER;
    v_total_delivered INTEGER;
BEGIN
    v_admin_id := admin.current_admin_user_id();
    IF NOT admin.check_admin_permission(v_admin_id, 'system.email.view') THEN
        RAISE EXCEPTION 'Permission denied: system.email.view required';
    END IF;

    v_since := NOW() - make_interval(days => GREATEST(COALESCE(p_days, 30), 1));

    SELECT
        COUNT(*) FILTER (WHERE status IN ('sent', 'delivered')),
        COUNT(*) FILTER (WHERE status = 'failed'),
        COUNT(*) FILTER (WHERE status = 'bounced'),
        COUNT(*) FILTER (WHERE status = 'delivered')
    INTO v_total_sent, v_total_failed, v_total_bounced, v_total_delivered
    FROM admin.email_send_log
    WHERE sent_at >= v_since;

    RETURN jsonb_build_object(
        'total_sent', v_total_sent,
        'total_failed', v_total_failed,
        'total_bounced', v_total_bounced,
        'total_delivered', v_total_delivered,
        'delivery_rate_pct', CASE WHEN v_total_sent > 0 THEN round(100.0 * v_total_delivered / v_total_sent, 1) ELSE 0 END,
        'bounce_rate_pct', CASE WHEN v_total_sent > 0 THEN round(100.0 * v_total_bounced / v_total_sent, 1) ELSE 0 END,
        'sends_by_day', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('date', d, 'count', c) ORDER BY d)
            FROM (
                SELECT date_trunc('day', sent_at)::DATE AS d, COUNT(*) AS c
                FROM admin.email_send_log
                WHERE sent_at >= v_since AND status IN ('sent', 'delivered', 'failed', 'bounced')
                GROUP BY 1
            ) sub
        ), '[]'::JSONB),
        'sends_by_template', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('template_key', template_key, 'count', c) ORDER BY c DESC)
            FROM (
                SELECT COALESCE(template_key, 'manual') AS template_key, COUNT(*) AS c
                FROM admin.email_send_log
                WHERE sent_at >= v_since
                GROUP BY 1
                LIMIT 10
            ) sub2
        ), '[]'::JSONB)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION admin.build_campaign_audience(JSONB, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.create_email_campaign(TEXT, TEXT, UUID, TEXT, JSONB, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.update_email_campaign(UUID, JSONB, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.delete_email_campaign(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.schedule_email_campaign(UUID, TIMESTAMPTZ, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.cancel_email_campaign(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.enqueue_campaign(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.get_email_analytics(INTEGER) TO authenticated, service_role;

DO $$ BEGIN RAISE NOTICE 'v89: Email campaign infrastructure applied.'; END $$;
