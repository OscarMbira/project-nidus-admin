-- ============================================================================
-- v26: Supported languages, translation keys, and translations
-- PostgreSQL 15+ / Supabase
-- Plan: projectplans/v5.0_sidebar_completeness_plan.md (B6)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- admin.supported_languages
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin.supported_languages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    language_code VARCHAR(5) NOT NULL UNIQUE,
    language_name TEXT NOT NULL,
    native_name TEXT,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    completion_percentage INTEGER NOT NULL DEFAULT 0
        CHECK (completion_percentage >= 0 AND completion_percentage <= 100),
    target_system TEXT NOT NULL DEFAULT 'all'
        CHECK (target_system IN ('platform', 'simulator', 'all')),
    created_by UUID REFERENCES admin.admin_users(id),
    updated_by UUID REFERENCES admin.admin_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_supported_languages_single_default
    ON admin.supported_languages (is_default)
    WHERE is_default = TRUE;

CREATE INDEX IF NOT EXISTS idx_supported_languages_is_active
    ON admin.supported_languages (is_active);

CREATE INDEX IF NOT EXISTS idx_supported_languages_target_system
    ON admin.supported_languages (target_system);

COMMENT ON TABLE admin.supported_languages IS
    'Languages available for Platform and Simulator localization';

-- ---------------------------------------------------------------------------
-- admin.translation_keys
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin.translation_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    translation_key TEXT NOT NULL,
    default_value TEXT NOT NULL,
    context TEXT,
    category TEXT,
    target_system TEXT NOT NULL DEFAULT 'all'
        CHECK (target_system IN ('platform', 'simulator', 'all')),
    created_by UUID REFERENCES admin.admin_users(id),
    updated_by UUID REFERENCES admin.admin_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (translation_key, target_system)
);

CREATE INDEX IF NOT EXISTS idx_translation_keys_category
    ON admin.translation_keys (category);

CREATE INDEX IF NOT EXISTS idx_translation_keys_target_system
    ON admin.translation_keys (target_system);

COMMENT ON TABLE admin.translation_keys IS
    'Canonical translation keys with English default values';

-- ---------------------------------------------------------------------------
-- admin.translations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin.translations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    translation_key_id UUID NOT NULL REFERENCES admin.translation_keys(id) ON DELETE CASCADE,
    language_code VARCHAR(5) NOT NULL REFERENCES admin.supported_languages(language_code) ON DELETE CASCADE,
    translated_value TEXT NOT NULL,
    is_reviewed BOOLEAN NOT NULL DEFAULT FALSE,
    reviewed_by UUID REFERENCES admin.admin_users(id),
    created_by UUID REFERENCES admin.admin_users(id),
    updated_by UUID REFERENCES admin.admin_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (translation_key_id, language_code)
);

CREATE INDEX IF NOT EXISTS idx_translations_language_code
    ON admin.translations (language_code);

CREATE INDEX IF NOT EXISTS idx_translations_translation_key_id
    ON admin.translations (translation_key_id);

CREATE INDEX IF NOT EXISTS idx_translations_is_reviewed
    ON admin.translations (is_reviewed);

COMMENT ON TABLE admin.translations IS
    'Per-language translated values for translation keys';

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_supported_languages_updated_at ON admin.supported_languages;
CREATE TRIGGER trg_supported_languages_updated_at
    BEFORE UPDATE ON admin.supported_languages
    FOR EACH ROW
    EXECUTE FUNCTION admin.set_updated_at();

DROP TRIGGER IF EXISTS trg_translation_keys_updated_at ON admin.translation_keys;
CREATE TRIGGER trg_translation_keys_updated_at
    BEFORE UPDATE ON admin.translation_keys
    FOR EACH ROW
    EXECUTE FUNCTION admin.set_updated_at();

DROP TRIGGER IF EXISTS trg_translations_updated_at ON admin.translations;
CREATE TRIGGER trg_translations_updated_at
    BEFORE UPDATE ON admin.translations
    FOR EACH ROW
    EXECUTE FUNCTION admin.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — SELECT for active admins; mutations via SECURITY DEFINER RPCs
-- ---------------------------------------------------------------------------
ALTER TABLE admin.supported_languages ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.translation_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.translations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS supported_languages_select ON admin.supported_languages;
CREATE POLICY supported_languages_select ON admin.supported_languages
    FOR SELECT TO authenticated
    USING (admin.is_active_admin());

DROP POLICY IF EXISTS translation_keys_select ON admin.translation_keys;
CREATE POLICY translation_keys_select ON admin.translation_keys
    FOR SELECT TO authenticated
    USING (admin.is_active_admin());

DROP POLICY IF EXISTS translations_select ON admin.translations;
CREATE POLICY translations_select ON admin.translations
    FOR SELECT TO authenticated
    USING (admin.is_active_admin());

GRANT SELECT ON admin.supported_languages TO authenticated;
GRANT SELECT ON admin.translation_keys TO authenticated;
GRANT SELECT ON admin.translations TO authenticated;
GRANT ALL ON admin.supported_languages TO service_role;
GRANT ALL ON admin.translation_keys TO service_role;
GRANT ALL ON admin.translations TO service_role;

-- ---------------------------------------------------------------------------
-- admin._localization_recalc_completion
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin._localization_recalc_completion(p_language_code VARCHAR(5))
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_lang admin.supported_languages%ROWTYPE;
    v_total_keys INTEGER;
    v_translated_keys INTEGER;
    v_pct INTEGER;
BEGIN
    SELECT * INTO v_lang
    FROM admin.supported_languages
    WHERE language_code = p_language_code;

    IF NOT FOUND THEN
        RETURN 0;
    END IF;

    IF v_lang.is_default THEN
        v_pct := 100;
    ELSE
        SELECT COUNT(*)::INTEGER INTO v_total_keys
        FROM admin.translation_keys tk
        WHERE tk.target_system = 'all'
           OR tk.target_system = v_lang.target_system
           OR v_lang.target_system = 'all';

        IF COALESCE(v_total_keys, 0) = 0 THEN
            v_pct := 0;
        ELSE
            SELECT COUNT(DISTINCT t.translation_key_id)::INTEGER INTO v_translated_keys
            FROM admin.translations t
            JOIN admin.translation_keys tk ON tk.id = t.translation_key_id
            WHERE t.language_code = p_language_code
              AND trim(t.translated_value) <> ''
              AND (
                  tk.target_system = 'all'
                  OR tk.target_system = v_lang.target_system
                  OR v_lang.target_system = 'all'
              );

            v_pct := LEAST(100, GREATEST(0, round((v_translated_keys::NUMERIC / v_total_keys) * 100)::INTEGER));
        END IF;
    END IF;

    UPDATE admin.supported_languages
    SET completion_percentage = v_pct,
        updated_at = NOW()
    WHERE language_code = p_language_code;

    RETURN v_pct;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.create_supported_language
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.create_supported_language(
    p_language_code VARCHAR(5),
    p_language_name TEXT,
    p_native_name TEXT DEFAULT NULL,
    p_is_default BOOLEAN DEFAULT FALSE,
    p_is_active BOOLEAN DEFAULT TRUE,
    p_target_system TEXT DEFAULT 'all',
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_code VARCHAR(5);
    v_id UUID;
    v_new admin.supported_languages%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'content.localization.edit') THEN
        RAISE EXCEPTION 'Permission denied: content.localization.edit required';
    END IF;

    v_code := lower(trim(COALESCE(p_language_code, '')));
    IF v_code = '' OR length(v_code) > 5 THEN
        RAISE EXCEPTION 'language_code is required (max 5 characters)';
    END IF;

    IF trim(COALESCE(p_language_name, '')) = '' THEN
        RAISE EXCEPTION 'language_name is required';
    END IF;

    IF COALESCE(p_target_system, 'all') NOT IN ('platform', 'simulator', 'all') THEN
        RAISE EXCEPTION 'Invalid target_system: %', p_target_system;
    END IF;

    IF COALESCE(p_is_default, FALSE) THEN
        UPDATE admin.supported_languages
        SET is_default = FALSE,
            updated_by = v_admin_user_id,
            updated_at = NOW()
        WHERE is_default = TRUE;
    END IF;

    INSERT INTO admin.supported_languages (
        language_code,
        language_name,
        native_name,
        is_default,
        is_active,
        completion_percentage,
        target_system,
        created_by,
        updated_by
    )
    VALUES (
        v_code,
        trim(p_language_name),
        NULLIF(trim(COALESCE(p_native_name, '')), ''),
        COALESCE(p_is_default, FALSE),
        COALESCE(p_is_active, TRUE),
        CASE WHEN COALESCE(p_is_default, FALSE) THEN 100 ELSE 0 END,
        COALESCE(p_target_system, 'all'),
        v_admin_user_id,
        v_admin_user_id
    )
    RETURNING id INTO v_id;

    PERFORM admin._localization_recalc_completion(v_code);

    SELECT * INTO v_new FROM admin.supported_languages WHERE id = v_id;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'supported_language.create',
        'supported_language',
        v_id,
        jsonb_build_object('language_code', v_code),
        NULL,
        to_jsonb(v_new)
    );

    RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.update_supported_language
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.update_supported_language(
    p_language_id UUID,
    p_language_name TEXT DEFAULT NULL,
    p_native_name TEXT DEFAULT NULL,
    p_is_default BOOLEAN DEFAULT NULL,
    p_is_active BOOLEAN DEFAULT NULL,
    p_target_system TEXT DEFAULT NULL,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_prev admin.supported_languages%ROWTYPE;
    v_new admin.supported_languages%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'content.localization.edit') THEN
        RAISE EXCEPTION 'Permission denied: content.localization.edit required';
    END IF;

    SELECT * INTO v_prev
    FROM admin.supported_languages
    WHERE id = p_language_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Supported language not found: %', p_language_id;
    END IF;

    IF p_target_system IS NOT NULL AND p_target_system NOT IN ('platform', 'simulator', 'all') THEN
        RAISE EXCEPTION 'Invalid target_system: %', p_target_system;
    END IF;

    IF COALESCE(p_is_default, FALSE) AND NOT COALESCE(p_is_active, v_prev.is_active) THEN
        RAISE EXCEPTION 'Default language must be active';
    END IF;

    IF COALESCE(p_is_default, FALSE) THEN
        UPDATE admin.supported_languages
        SET is_default = FALSE,
            updated_by = v_admin_user_id,
            updated_at = NOW()
        WHERE is_default = TRUE
          AND id <> p_language_id;
    END IF;

    UPDATE admin.supported_languages
    SET language_name = COALESCE(NULLIF(trim(p_language_name), ''), language_name),
        native_name = CASE
            WHEN p_native_name IS NULL THEN native_name
            ELSE NULLIF(trim(p_native_name), '')
        END,
        is_default = COALESCE(p_is_default, is_default),
        is_active = COALESCE(p_is_active, is_active),
        target_system = COALESCE(p_target_system, target_system),
        updated_by = v_admin_user_id,
        updated_at = NOW()
    WHERE id = p_language_id
    RETURNING * INTO v_new;

    PERFORM admin._localization_recalc_completion(v_new.language_code);

    SELECT * INTO v_new FROM admin.supported_languages WHERE id = p_language_id;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'supported_language.update',
        'supported_language',
        p_language_id,
        jsonb_build_object('language_code', v_new.language_code),
        to_jsonb(v_prev),
        to_jsonb(v_new)
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.delete_supported_language
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.delete_supported_language(
    p_language_id UUID,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_prev admin.supported_languages%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'content.localization.edit') THEN
        RAISE EXCEPTION 'Permission denied: content.localization.edit required';
    END IF;

    SELECT * INTO v_prev
    FROM admin.supported_languages
    WHERE id = p_language_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Supported language not found: %', p_language_id;
    END IF;

    IF v_prev.is_default THEN
        RAISE EXCEPTION 'Cannot delete the default language';
    END IF;

    DELETE FROM admin.supported_languages
    WHERE id = p_language_id;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'supported_language.delete',
        'supported_language',
        p_language_id,
        jsonb_build_object('language_code', v_prev.language_code),
        to_jsonb(v_prev),
        NULL
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.create_translation_key
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.create_translation_key(
    p_translation_key TEXT,
    p_default_value TEXT,
    p_context TEXT DEFAULT NULL,
    p_category TEXT DEFAULT NULL,
    p_target_system TEXT DEFAULT 'all',
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_key TEXT;
    v_id UUID;
    v_new admin.translation_keys%ROWTYPE;
    v_lang RECORD;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'content.localization.edit') THEN
        RAISE EXCEPTION 'Permission denied: content.localization.edit required';
    END IF;

    v_key := trim(COALESCE(p_translation_key, ''));
    IF v_key = '' THEN
        RAISE EXCEPTION 'translation_key is required';
    END IF;

    IF trim(COALESCE(p_default_value, '')) = '' THEN
        RAISE EXCEPTION 'default_value is required';
    END IF;

    IF COALESCE(p_target_system, 'all') NOT IN ('platform', 'simulator', 'all') THEN
        RAISE EXCEPTION 'Invalid target_system: %', p_target_system;
    END IF;

    INSERT INTO admin.translation_keys (
        translation_key,
        default_value,
        context,
        category,
        target_system,
        created_by,
        updated_by
    )
    VALUES (
        v_key,
        trim(p_default_value),
        NULLIF(trim(COALESCE(p_context, '')), ''),
        NULLIF(trim(COALESCE(p_category, '')), ''),
        COALESCE(p_target_system, 'all'),
        v_admin_user_id,
        v_admin_user_id
    )
    RETURNING id INTO v_id;

    FOR v_lang IN
        SELECT language_code
        FROM admin.supported_languages
        WHERE is_active = TRUE
          AND is_default = FALSE
    LOOP
        PERFORM admin._localization_recalc_completion(v_lang.language_code);
    END LOOP;

    SELECT * INTO v_new FROM admin.translation_keys WHERE id = v_id;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'translation_key.create',
        'translation_key',
        v_id,
        jsonb_build_object('translation_key', v_key),
        NULL,
        to_jsonb(v_new)
    );

    RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.update_translation_key
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.update_translation_key(
    p_translation_key_id UUID,
    p_default_value TEXT DEFAULT NULL,
    p_context TEXT DEFAULT NULL,
    p_category TEXT DEFAULT NULL,
    p_target_system TEXT DEFAULT NULL,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_prev admin.translation_keys%ROWTYPE;
    v_new admin.translation_keys%ROWTYPE;
    v_lang RECORD;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'content.localization.edit') THEN
        RAISE EXCEPTION 'Permission denied: content.localization.edit required';
    END IF;

    SELECT * INTO v_prev
    FROM admin.translation_keys
    WHERE id = p_translation_key_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Translation key not found: %', p_translation_key_id;
    END IF;

    IF p_target_system IS NOT NULL AND p_target_system NOT IN ('platform', 'simulator', 'all') THEN
        RAISE EXCEPTION 'Invalid target_system: %', p_target_system;
    END IF;

    UPDATE admin.translation_keys
    SET default_value = COALESCE(NULLIF(trim(p_default_value), ''), default_value),
        context = CASE
            WHEN p_context IS NULL THEN context
            ELSE NULLIF(trim(p_context), '')
        END,
        category = CASE
            WHEN p_category IS NULL THEN category
            ELSE NULLIF(trim(p_category), '')
        END,
        target_system = COALESCE(p_target_system, target_system),
        updated_by = v_admin_user_id,
        updated_at = NOW()
    WHERE id = p_translation_key_id
    RETURNING * INTO v_new;

    FOR v_lang IN
        SELECT language_code
        FROM admin.supported_languages
        WHERE is_active = TRUE
          AND is_default = FALSE
    LOOP
        PERFORM admin._localization_recalc_completion(v_lang.language_code);
    END LOOP;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'translation_key.update',
        'translation_key',
        p_translation_key_id,
        jsonb_build_object('translation_key', v_new.translation_key),
        to_jsonb(v_prev),
        to_jsonb(v_new)
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.delete_translation_key
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.delete_translation_key(
    p_translation_key_id UUID,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_prev admin.translation_keys%ROWTYPE;
    v_lang RECORD;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'content.localization.edit') THEN
        RAISE EXCEPTION 'Permission denied: content.localization.edit required';
    END IF;

    SELECT * INTO v_prev
    FROM admin.translation_keys
    WHERE id = p_translation_key_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Translation key not found: %', p_translation_key_id;
    END IF;

    DELETE FROM admin.translation_keys
    WHERE id = p_translation_key_id;

    FOR v_lang IN
        SELECT language_code
        FROM admin.supported_languages
        WHERE is_active = TRUE
          AND is_default = FALSE
    LOOP
        PERFORM admin._localization_recalc_completion(v_lang.language_code);
    END LOOP;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'translation_key.delete',
        'translation_key',
        p_translation_key_id,
        jsonb_build_object('translation_key', v_prev.translation_key),
        to_jsonb(v_prev),
        NULL
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.upsert_translation
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.upsert_translation(
    p_translation_key_id UUID,
    p_language_code VARCHAR(5),
    p_translated_value TEXT,
    p_is_reviewed BOOLEAN DEFAULT FALSE,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_code VARCHAR(5);
    v_id UUID;
    v_prev admin.translations%ROWTYPE;
    v_new admin.translations%ROWTYPE;
    v_found BOOLEAN := FALSE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'content.localization.edit') THEN
        RAISE EXCEPTION 'Permission denied: content.localization.edit required';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM admin.translation_keys WHERE id = p_translation_key_id) THEN
        RAISE EXCEPTION 'Translation key not found: %', p_translation_key_id;
    END IF;

    v_code := lower(trim(COALESCE(p_language_code, '')));
    IF v_code = '' THEN
        RAISE EXCEPTION 'language_code is required';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM admin.supported_languages WHERE language_code = v_code) THEN
        RAISE EXCEPTION 'Supported language not found: %', v_code;
    END IF;

    IF trim(COALESCE(p_translated_value, '')) = '' THEN
        RAISE EXCEPTION 'translated_value is required';
    END IF;

    SELECT * INTO v_prev
    FROM admin.translations
    WHERE translation_key_id = p_translation_key_id
      AND language_code = v_code;

    v_found := FOUND;

    INSERT INTO admin.translations (
        translation_key_id,
        language_code,
        translated_value,
        is_reviewed,
        reviewed_by,
        created_by,
        updated_by
    )
    VALUES (
        p_translation_key_id,
        v_code,
        trim(p_translated_value),
        COALESCE(p_is_reviewed, FALSE),
        CASE WHEN COALESCE(p_is_reviewed, FALSE) THEN v_admin_user_id ELSE NULL END,
        v_admin_user_id,
        v_admin_user_id
    )
    ON CONFLICT (translation_key_id, language_code) DO UPDATE
    SET translated_value = EXCLUDED.translated_value,
        is_reviewed = EXCLUDED.is_reviewed,
        reviewed_by = CASE
            WHEN EXCLUDED.is_reviewed THEN v_admin_user_id
            ELSE admin.translations.reviewed_by
        END,
        updated_by = v_admin_user_id,
        updated_at = NOW()
    RETURNING id INTO v_id;

    SELECT * INTO v_new FROM admin.translations WHERE id = v_id;

    PERFORM admin._localization_recalc_completion(v_code);

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        CASE WHEN v_found THEN 'translation.update' ELSE 'translation.create' END,
        'translation',
        v_id,
        jsonb_build_object(
            'translation_key_id', p_translation_key_id,
            'language_code', v_code
        ),
        CASE WHEN v_found THEN to_jsonb(v_prev) ELSE NULL END,
        to_jsonb(v_new)
    );

    RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.delete_translation
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.delete_translation(
    p_translation_id UUID,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_prev admin.translations%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'content.localization.edit') THEN
        RAISE EXCEPTION 'Permission denied: content.localization.edit required';
    END IF;

    SELECT * INTO v_prev
    FROM admin.translations
    WHERE id = p_translation_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Translation not found: %', p_translation_id;
    END IF;

    DELETE FROM admin.translations
    WHERE id = p_translation_id;

    PERFORM admin._localization_recalc_completion(v_prev.language_code);

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'translation.delete',
        'translation',
        p_translation_id,
        jsonb_build_object(
            'translation_key_id', v_prev.translation_key_id,
            'language_code', v_prev.language_code
        ),
        to_jsonb(v_prev),
        NULL
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.get_translation_coverage
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.get_translation_coverage(
    p_language_code VARCHAR(5) DEFAULT NULL,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS TABLE(
    language_code VARCHAR(5),
    language_name TEXT,
    total_keys INTEGER,
    translated_keys INTEGER,
    completion_percentage INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_lang RECORD;
    v_total INTEGER;
    v_translated INTEGER;
    v_pct INTEGER;
    v_code VARCHAR(5);
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'content.localization.view') THEN
        RAISE EXCEPTION 'Permission denied: content.localization.view required';
    END IF;

    FOR v_lang IN
        SELECT sl.language_code, sl.language_name, sl.target_system, sl.is_default
        FROM admin.supported_languages sl
        WHERE sl.is_active = TRUE
          AND (p_language_code IS NULL OR sl.language_code = lower(trim(p_language_code)))
        ORDER BY sl.language_code
    LOOP
        v_pct := admin._localization_recalc_completion(v_lang.language_code);

        SELECT COUNT(*)::INTEGER INTO v_total
        FROM admin.translation_keys tk
        WHERE tk.target_system = 'all'
           OR tk.target_system = v_lang.target_system
           OR v_lang.target_system = 'all';

        IF v_lang.is_default THEN
            v_translated := v_total;
            v_pct := 100;
        ELSE
            SELECT COUNT(DISTINCT t.translation_key_id)::INTEGER INTO v_translated
            FROM admin.translations t
            JOIN admin.translation_keys tk ON tk.id = t.translation_key_id
            WHERE t.language_code = v_lang.language_code
              AND trim(t.translated_value) <> ''
              AND (
                  tk.target_system = 'all'
                  OR tk.target_system = v_lang.target_system
                  OR v_lang.target_system = 'all'
              );
        END IF;

        language_code := v_lang.language_code;
        language_name := v_lang.language_name;
        total_keys := COALESCE(v_total, 0);
        translated_keys := COALESCE(v_translated, 0);
        completion_percentage := v_pct;
        RETURN NEXT;
    END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- Seed default language
-- ---------------------------------------------------------------------------
INSERT INTO admin.supported_languages (
    language_code,
    language_name,
    native_name,
    is_default,
    is_active,
    completion_percentage,
    target_system
)
VALUES (
    'en',
    'English',
    'English',
    TRUE,
    TRUE,
    100,
    'all'
)
ON CONFLICT (language_code) DO UPDATE SET
    language_name = EXCLUDED.language_name,
    native_name = EXCLUDED.native_name,
    is_default = TRUE,
    is_active = TRUE,
    completion_percentage = 100,
    target_system = EXCLUDED.target_system,
    updated_at = NOW();

-- Ensure only English remains default
UPDATE admin.supported_languages
SET is_default = FALSE,
    updated_at = NOW()
WHERE language_code <> 'en'
  AND is_default = TRUE;

-- ---------------------------------------------------------------------------
-- Permission keys
-- ---------------------------------------------------------------------------
INSERT INTO admin.admin_permissions (permission_key, permission_name, category, description)
VALUES
    ('content.localization.view', 'View Localization', 'content', 'View supported languages, keys, and translations'),
    ('content.localization.edit', 'Edit Localization', 'content', 'Manage languages, keys, and translations')
ON CONFLICT (permission_key) DO UPDATE SET
    permission_name = EXCLUDED.permission_name,
    category = EXCLUDED.category,
    description = EXCLUDED.description;

INSERT INTO admin.role_permissions (role, permission_key)
SELECT 'super_admin', permission_key
FROM admin.admin_permissions
WHERE permission_key IN ('content.localization.view', 'content.localization.edit')
ON CONFLICT (role, permission_key) DO NOTHING;

INSERT INTO admin.role_permissions (role, permission_key)
VALUES
    ('system_admin', 'content.localization.view'),
    ('system_admin', 'content.localization.edit'),
    ('content_admin', 'content.localization.view'),
    ('content_admin', 'content.localization.edit')
ON CONFLICT (role, permission_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- GRANT EXECUTE on RPCs
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION admin._localization_recalc_completion(VARCHAR) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.create_supported_language(VARCHAR, TEXT, TEXT, BOOLEAN, BOOLEAN, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.update_supported_language(UUID, TEXT, TEXT, BOOLEAN, BOOLEAN, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.delete_supported_language(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.create_translation_key(TEXT, TEXT, TEXT, TEXT, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.update_translation_key(UUID, TEXT, TEXT, TEXT, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.delete_translation_key(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.upsert_translation(UUID, VARCHAR, TEXT, BOOLEAN, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.delete_translation(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.get_translation_coverage(VARCHAR, UUID) TO authenticated, service_role;

DO $$
BEGIN
    RAISE NOTICE 'v26: Supported languages, translation keys, and translations applied.';
END $$;
