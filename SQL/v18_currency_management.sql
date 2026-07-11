-- ============================================================================
-- v18: Currency, exchange rate, and country management
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v735_01 admin schema, v735_02 auth functions
-- Plan: projectplans/v4.0_currency_management_plan.md
-- ============================================================================

-- ---------------------------------------------------------------------------
-- admin.currencies
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin.currencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    currency_code VARCHAR(3) NOT NULL UNIQUE,
    currency_name TEXT NOT NULL,
    symbol VARCHAR(10) NOT NULL,
    symbol_position VARCHAR(6) NOT NULL DEFAULT 'prefix'
        CHECK (symbol_position IN ('prefix', 'suffix')),
    decimal_places SMALLINT NOT NULL DEFAULT 2
        CHECK (decimal_places BETWEEN 0 AND 6),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_base BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_by UUID REFERENCES admin.admin_users(id),
    updated_by UUID REFERENCES admin.admin_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_currencies_single_base
    ON admin.currencies (is_base)
    WHERE is_base = TRUE;

CREATE INDEX IF NOT EXISTS idx_currencies_is_active
    ON admin.currencies (is_active);

COMMENT ON TABLE admin.currencies IS
    'Admin-managed ISO 4217 currencies with a single base currency for reporting';

-- ---------------------------------------------------------------------------
-- admin.exchange_rates
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin.exchange_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_currency VARCHAR(3) NOT NULL REFERENCES admin.currencies(currency_code),
    to_currency VARCHAR(3) NOT NULL REFERENCES admin.currencies(currency_code),
    rate NUMERIC(20, 10) NOT NULL CHECK (rate > 0),
    inverse_rate NUMERIC(20, 10),
    effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    effective_to TIMESTAMPTZ,
    source VARCHAR(20) NOT NULL DEFAULT 'manual'
        CHECK (source IN ('manual', 'api')),
    source_detail TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES admin.admin_users(id),
    CHECK (from_currency <> to_currency)
);

CREATE INDEX IF NOT EXISTS idx_exchange_rates_pair_effective
    ON admin.exchange_rates (from_currency, to_currency, effective_from DESC);

COMMENT ON TABLE admin.exchange_rates IS
    'Historical FX rates; current rate is the latest active row with effective_to IS NULL';

-- ---------------------------------------------------------------------------
-- admin.countries
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin.countries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    country_code VARCHAR(2) NOT NULL UNIQUE,
    country_name TEXT NOT NULL,
    iso3_code VARCHAR(3),
    phone_code VARCHAR(10),
    default_currency VARCHAR(3) REFERENCES admin.currencies(currency_code),
    region TEXT,
    platform_allowed BOOLEAN NOT NULL DEFAULT TRUE,
    simulator_allowed BOOLEAN NOT NULL DEFAULT TRUE,
    platform_reason TEXT,
    simulator_reason TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID REFERENCES admin.admin_users(id),
    updated_by UUID REFERENCES admin.admin_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_countries_platform_allowed
    ON admin.countries (platform_allowed);

CREATE INDEX IF NOT EXISTS idx_countries_simulator_allowed
    ON admin.countries (simulator_allowed);

CREATE INDEX IF NOT EXISTS idx_countries_region
    ON admin.countries (region);

COMMENT ON TABLE admin.countries IS
    'Country registry with per-system allowed/disallowed flags and default currency';

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_currencies_updated_at ON admin.currencies;
CREATE TRIGGER trg_currencies_updated_at
    BEFORE UPDATE ON admin.currencies
    FOR EACH ROW
    EXECUTE FUNCTION admin.set_updated_at();

DROP TRIGGER IF EXISTS trg_countries_updated_at ON admin.countries;
CREATE TRIGGER trg_countries_updated_at
    BEFORE UPDATE ON admin.countries
    FOR EACH ROW
    EXECUTE FUNCTION admin.set_updated_at();

-- ---------------------------------------------------------------------------
-- Seed currencies (17 — USD base)
-- ---------------------------------------------------------------------------
INSERT INTO admin.currencies (
    id, currency_code, currency_name, symbol, symbol_position,
    decimal_places, is_active, is_base, sort_order
)
VALUES
    ('b7380001-0001-4000-8000-000000000001', 'USD', 'US Dollar', '$', 'prefix', 2, TRUE, TRUE, 1),
    ('b7380001-0001-4000-8000-000000000002', 'EUR', 'Euro', '€', 'prefix', 2, TRUE, FALSE, 2),
    ('b7380001-0001-4000-8000-000000000003', 'GBP', 'British Pound', '£', 'prefix', 2, TRUE, FALSE, 3),
    ('b7380001-0001-4000-8000-000000000004', 'ZAR', 'South African Rand', 'R', 'prefix', 2, TRUE, FALSE, 4),
    ('b7380001-0001-4000-8000-000000000005', 'ZWL', 'Zimbabwe Dollar', 'Z$', 'prefix', 2, TRUE, FALSE, 5),
    ('b7380001-0001-4000-8000-000000000006', 'AED', 'UAE Dirham', 'د.إ', 'prefix', 2, TRUE, FALSE, 6),
    ('b7380001-0001-4000-8000-000000000007', 'AUD', 'Australian Dollar', 'A$', 'prefix', 2, TRUE, FALSE, 7),
    ('b7380001-0001-4000-8000-000000000008', 'CAD', 'Canadian Dollar', 'C$', 'prefix', 2, TRUE, FALSE, 8),
    ('b7380001-0001-4000-8000-000000000009', 'JPY', 'Japanese Yen', '¥', 'prefix', 0, TRUE, FALSE, 9),
    ('b7380001-0001-4000-8000-000000000010', 'CHF', 'Swiss Franc', 'CHF', 'prefix', 2, TRUE, FALSE, 10),
    ('b7380001-0001-4000-8000-000000000011', 'CNY', 'Chinese Yuan', '¥', 'prefix', 2, TRUE, FALSE, 11),
    ('b7380001-0001-4000-8000-000000000012', 'INR', 'Indian Rupee', '₹', 'prefix', 2, TRUE, FALSE, 12),
    ('b7380001-0001-4000-8000-000000000013', 'BHD', 'Bahraini Dinar', 'BD', 'prefix', 3, TRUE, FALSE, 13),
    ('b7380001-0001-4000-8000-000000000014', 'KWD', 'Kuwaiti Dinar', 'KD', 'prefix', 3, TRUE, FALSE, 14),
    ('b7380001-0001-4000-8000-000000000015', 'NGN', 'Nigerian Naira', '₦', 'prefix', 2, TRUE, FALSE, 15),
    ('b7380001-0001-4000-8000-000000000016', 'BWP', 'Botswana Pula', 'P', 'prefix', 2, TRUE, FALSE, 16),
    ('b7380001-0001-4000-8000-000000000017', 'KES', 'Kenyan Shilling', 'KSh', 'prefix', 2, TRUE, FALSE, 17)
ON CONFLICT (currency_code) DO UPDATE SET
    currency_name = EXCLUDED.currency_name,
    symbol = EXCLUDED.symbol,
    symbol_position = EXCLUDED.symbol_position,
    decimal_places = EXCLUDED.decimal_places,
    is_base = EXCLUDED.is_base,
    sort_order = EXCLUDED.sort_order,
    updated_at = NOW();

-- ---------------------------------------------------------------------------
-- Seed exchange rates (USD base — 8 pairs)
-- ---------------------------------------------------------------------------
INSERT INTO admin.exchange_rates (
    id, from_currency, to_currency, rate, inverse_rate,
    effective_from, source, source_detail, is_active
)
VALUES
    ('b7380002-0001-4000-8000-000000000001', 'USD', 'EUR', 0.9200000000, 1.0869565217, NOW(), 'manual', 'Seed rate v18', TRUE),
    ('b7380002-0001-4000-8000-000000000002', 'USD', 'GBP', 0.7900000000, 1.2658227848, NOW(), 'manual', 'Seed rate v18', TRUE),
    ('b7380002-0001-4000-8000-000000000003', 'USD', 'ZAR', 18.5000000000, 0.0540540541, NOW(), 'manual', 'Seed rate v18', TRUE),
    ('b7380002-0001-4000-8000-000000000004', 'USD', 'ZWL', 322.0000000000, 0.0031055901, NOW(), 'manual', 'Seed rate v18', TRUE),
    ('b7380002-0001-4000-8000-000000000005', 'USD', 'AED', 3.6700000000, 0.2724795640, NOW(), 'manual', 'Seed rate v18', TRUE),
    ('b7380002-0001-4000-8000-000000000006', 'USD', 'AUD', 1.5300000000, 0.6535947712, NOW(), 'manual', 'Seed rate v18', TRUE),
    ('b7380002-0001-4000-8000-000000000007', 'USD', 'CAD', 1.3600000000, 0.7352941176, NOW(), 'manual', 'Seed rate v18', TRUE),
    ('b7380002-0001-4000-8000-000000000008', 'USD', 'JPY', 149.5000000000, 0.0066889632, NOW(), 'manual', 'Seed rate v18', TRUE)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Seed countries (~50)
-- ---------------------------------------------------------------------------
INSERT INTO admin.countries (
    country_code, country_name, iso3_code, phone_code,
    default_currency, region, platform_allowed, simulator_allowed, sort_order
)
VALUES
    ('US', 'United States', 'USA', '+1', 'USD', 'Americas', TRUE, TRUE, 1),
    ('CA', 'Canada', 'CAN', '+1', 'CAD', 'Americas', TRUE, TRUE, 2),
    ('MX', 'Mexico', 'MEX', '+52', 'USD', 'Americas', TRUE, TRUE, 3),
    ('BR', 'Brazil', 'BRA', '+55', 'USD', 'Americas', TRUE, TRUE, 4),
    ('AR', 'Argentina', 'ARG', '+54', 'USD', 'Americas', TRUE, TRUE, 5),
    ('CL', 'Chile', 'CHL', '+56', 'USD', 'Americas', TRUE, TRUE, 6),
    ('CO', 'Colombia', 'COL', '+57', 'USD', 'Americas', TRUE, TRUE, 7),
    ('GB', 'United Kingdom', 'GBR', '+44', 'GBP', 'Europe', TRUE, TRUE, 10),
    ('DE', 'Germany', 'DEU', '+49', 'EUR', 'Europe', TRUE, TRUE, 11),
    ('FR', 'France', 'FRA', '+33', 'EUR', 'Europe', TRUE, TRUE, 12),
    ('IT', 'Italy', 'ITA', '+39', 'EUR', 'Europe', TRUE, TRUE, 13),
    ('ES', 'Spain', 'ESP', '+34', 'EUR', 'Europe', TRUE, TRUE, 14),
    ('NL', 'Netherlands', 'NLD', '+31', 'EUR', 'Europe', TRUE, TRUE, 15),
    ('BE', 'Belgium', 'BEL', '+32', 'EUR', 'Europe', TRUE, TRUE, 16),
    ('CH', 'Switzerland', 'CHE', '+41', 'CHF', 'Europe', TRUE, TRUE, 17),
    ('AT', 'Austria', 'AUT', '+43', 'EUR', 'Europe', TRUE, TRUE, 18),
    ('PT', 'Portugal', 'PRT', '+351', 'EUR', 'Europe', TRUE, TRUE, 19),
    ('IE', 'Ireland', 'IRL', '+353', 'EUR', 'Europe', TRUE, TRUE, 20),
    ('SE', 'Sweden', 'SWE', '+46', 'EUR', 'Europe', TRUE, TRUE, 21),
    ('NO', 'Norway', 'NOR', '+47', 'EUR', 'Europe', TRUE, TRUE, 22),
    ('DK', 'Denmark', 'DNK', '+45', 'EUR', 'Europe', TRUE, TRUE, 23),
    ('FI', 'Finland', 'FIN', '+358', 'EUR', 'Europe', TRUE, TRUE, 24),
    ('PL', 'Poland', 'POL', '+48', 'EUR', 'Europe', TRUE, TRUE, 25),
    ('RO', 'Romania', 'ROU', '+40', 'EUR', 'Europe', TRUE, TRUE, 26),
    ('UA', 'Ukraine', 'UKR', '+380', 'USD', 'Europe', TRUE, TRUE, 27),
    ('ZA', 'South Africa', 'ZAF', '+27', 'ZAR', 'Africa', TRUE, TRUE, 30),
    ('ZW', 'Zimbabwe', 'ZWE', '+263', 'ZWL', 'Africa', TRUE, TRUE, 31),
    ('NG', 'Nigeria', 'NGA', '+234', 'NGN', 'Africa', TRUE, TRUE, 32),
    ('BW', 'Botswana', 'BWA', '+267', 'BWP', 'Africa', TRUE, TRUE, 33),
    ('KE', 'Kenya', 'KEN', '+254', 'KES', 'Africa', TRUE, TRUE, 34),
    ('GH', 'Ghana', 'GHA', '+233', 'USD', 'Africa', TRUE, TRUE, 35),
    ('EG', 'Egypt', 'EGY', '+20', 'USD', 'Africa', TRUE, TRUE, 36),
    ('TZ', 'Tanzania', 'TZA', '+255', 'KES', 'Africa', TRUE, TRUE, 37),
    ('UG', 'Uganda', 'UGA', '+256', 'KES', 'Africa', TRUE, TRUE, 38),
    ('AE', 'United Arab Emirates', 'ARE', '+971', 'AED', 'Asia', TRUE, TRUE, 40),
    ('SA', 'Saudi Arabia', 'SAU', '+966', 'AED', 'Asia', TRUE, TRUE, 41),
    ('QA', 'Qatar', 'QAT', '+974', 'AED', 'Asia', TRUE, TRUE, 42),
    ('KW', 'Kuwait', 'KWT', '+965', 'KWD', 'Asia', TRUE, TRUE, 43),
    ('BH', 'Bahrain', 'BHR', '+973', 'BHD', 'Asia', TRUE, TRUE, 44),
    ('IN', 'India', 'IND', '+91', 'INR', 'Asia', TRUE, TRUE, 45),
    ('CN', 'China', 'CHN', '+86', 'CNY', 'Asia', TRUE, TRUE, 46),
    ('JP', 'Japan', 'JPN', '+81', 'JPY', 'Asia', TRUE, TRUE, 47),
    ('KR', 'South Korea', 'KOR', '+82', 'USD', 'Asia', TRUE, TRUE, 48),
    ('SG', 'Singapore', 'SGP', '+65', 'USD', 'Asia', TRUE, TRUE, 49),
    ('HK', 'Hong Kong', 'HKG', '+852', 'USD', 'Asia', TRUE, TRUE, 50),
    ('MY', 'Malaysia', 'MYS', '+60', 'USD', 'Asia', TRUE, TRUE, 51),
    ('TH', 'Thailand', 'THA', '+66', 'USD', 'Asia', TRUE, TRUE, 52),
    ('PH', 'Philippines', 'PHL', '+63', 'USD', 'Asia', TRUE, TRUE, 53),
    ('ID', 'Indonesia', 'IDN', '+62', 'USD', 'Asia', TRUE, TRUE, 54),
    ('PK', 'Pakistan', 'PAK', '+92', 'USD', 'Asia', TRUE, TRUE, 55),
    ('IL', 'Israel', 'ISR', '+972', 'USD', 'Asia', TRUE, TRUE, 56),
    ('TR', 'Turkey', 'TUR', '+90', 'USD', 'Asia', TRUE, TRUE, 57),
    ('AU', 'Australia', 'AUS', '+61', 'AUD', 'Oceania', TRUE, TRUE, 60),
    ('NZ', 'New Zealand', 'NZL', '+64', 'AUD', 'Oceania', TRUE, TRUE, 61)
ON CONFLICT (country_code) DO UPDATE SET
    country_name = EXCLUDED.country_name,
    iso3_code = EXCLUDED.iso3_code,
    phone_code = EXCLUDED.phone_code,
    default_currency = EXCLUDED.default_currency,
    region = EXCLUDED.region,
    updated_at = NOW();

-- ---------------------------------------------------------------------------
-- RLS — SELECT for active admins; mutations via SECURITY DEFINER RPCs
-- ---------------------------------------------------------------------------
ALTER TABLE admin.currencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.exchange_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.countries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS currencies_select ON admin.currencies;
CREATE POLICY currencies_select ON admin.currencies
    FOR SELECT TO authenticated
    USING (admin.is_active_admin());

DROP POLICY IF EXISTS exchange_rates_select ON admin.exchange_rates;
CREATE POLICY exchange_rates_select ON admin.exchange_rates
    FOR SELECT TO authenticated
    USING (admin.is_active_admin());

DROP POLICY IF EXISTS countries_select ON admin.countries;
CREATE POLICY countries_select ON admin.countries
    FOR SELECT TO authenticated
    USING (admin.is_active_admin());

GRANT SELECT ON admin.currencies TO authenticated;
GRANT SELECT ON admin.exchange_rates TO authenticated;
GRANT SELECT ON admin.countries TO authenticated;
GRANT ALL ON admin.currencies TO service_role;
GRANT ALL ON admin.exchange_rates TO service_role;
GRANT ALL ON admin.countries TO service_role;

-- ---------------------------------------------------------------------------
-- Internal helper: FX multiplier from -> to at a point in time
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin._lookup_exchange_rate(
    p_from VARCHAR(3),
    p_to VARCHAR(3),
    p_as_of TIMESTAMPTZ
)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_as_of TIMESTAMPTZ := COALESCE(p_as_of, NOW());
    v_rate NUMERIC;
BEGIN
    IF p_from IS NULL OR p_to IS NULL OR p_from = p_to THEN
        RETURN 1;
    END IF;

    SELECT er.rate
    INTO v_rate
    FROM admin.exchange_rates er
    WHERE er.from_currency = upper(trim(p_from))
      AND er.to_currency = upper(trim(p_to))
      AND er.is_active = TRUE
      AND er.effective_from <= v_as_of
      AND (er.effective_to IS NULL OR er.effective_to > v_as_of)
    ORDER BY er.effective_from DESC
    LIMIT 1;

    IF FOUND THEN
        RETURN v_rate;
    END IF;

    SELECT er.rate
    INTO v_rate
    FROM admin.exchange_rates er
    WHERE er.from_currency = upper(trim(p_to))
      AND er.to_currency = upper(trim(p_from))
      AND er.is_active = TRUE
      AND er.effective_from <= v_as_of
      AND (er.effective_to IS NULL OR er.effective_to > v_as_of)
    ORDER BY er.effective_from DESC
    LIMIT 1;

    IF FOUND AND v_rate <> 0 THEN
        RETURN 1.0 / v_rate;
    END IF;

    RETURN NULL;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.get_base_currency
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.get_base_currency()
RETURNS TABLE (
    id UUID,
    currency_code VARCHAR(3),
    currency_name TEXT,
    symbol VARCHAR(10),
    symbol_position VARCHAR(6),
    decimal_places SMALLINT,
    is_active BOOLEAN,
    is_base BOOLEAN,
    sort_order INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = admin, public
AS $$
    SELECT
        c.id,
        c.currency_code,
        c.currency_name,
        c.symbol,
        c.symbol_position,
        c.decimal_places,
        c.is_active,
        c.is_base,
        c.sort_order
    FROM admin.currencies c
    WHERE c.is_base = TRUE
    LIMIT 1;
$$;

-- ---------------------------------------------------------------------------
-- admin.convert_currency
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.convert_currency(
    p_amount NUMERIC,
    p_from VARCHAR(3),
    p_to VARCHAR(3),
    p_as_of_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = admin, public, sim
AS $$
DECLARE
    v_from VARCHAR(3);
    v_to VARCHAR(3);
    v_as_of TIMESTAMPTZ := COALESCE(p_as_of_date, NOW());
    v_decimals SMALLINT := 2;
    v_base VARCHAR(3);
    v_direct NUMERIC;
    v_to_base NUMERIC;
    v_base_to NUMERIC;
    v_amount_base NUMERIC;
BEGIN
    IF p_amount IS NULL THEN
        RETURN NULL;
    END IF;

    v_from := upper(trim(p_from));
    v_to := upper(trim(p_to));

    IF v_from IS NULL OR v_to IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT c.decimal_places
    INTO v_decimals
    FROM admin.currencies c
    WHERE c.currency_code = v_to;

    v_decimals := COALESCE(v_decimals, 2);

    IF v_from = v_to THEN
        RETURN round(p_amount, v_decimals);
    END IF;

    v_direct := admin._lookup_exchange_rate(v_from, v_to, v_as_of);
    IF v_direct IS NOT NULL THEN
        RETURN round(p_amount * v_direct, v_decimals);
    END IF;

    SELECT c.currency_code
    INTO v_base
    FROM admin.currencies c
    WHERE c.is_base = TRUE
    LIMIT 1;

    IF v_base IS NULL THEN
        RETURN NULL;
    END IF;

    IF v_from = v_base THEN
        v_amount_base := p_amount;
    ELSE
        v_to_base := admin._lookup_exchange_rate(v_from, v_base, v_as_of);
        IF v_to_base IS NULL THEN
            RETURN NULL;
        END IF;
        v_amount_base := p_amount * v_to_base;
    END IF;

    IF v_to = v_base THEN
        RETURN round(v_amount_base, v_decimals);
    END IF;

    v_base_to := admin._lookup_exchange_rate(v_base, v_to, v_as_of);
    IF v_base_to IS NULL THEN
        RETURN NULL;
    END IF;

    RETURN round(v_amount_base * v_base_to, v_decimals);
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.create_currency
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.create_currency(
    p_currency_code VARCHAR(3),
    p_currency_name TEXT,
    p_symbol VARCHAR(10),
    p_symbol_position VARCHAR(6) DEFAULT 'prefix',
    p_decimal_places SMALLINT DEFAULT 2,
    p_is_active BOOLEAN DEFAULT TRUE,
    p_is_base BOOLEAN DEFAULT FALSE,
    p_sort_order INTEGER DEFAULT 0,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_code VARCHAR(3);
    v_id UUID;
    v_new admin.currencies%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'system.currencies.edit') THEN
        RAISE EXCEPTION 'Permission denied: system.currencies.edit required';
    END IF;

    v_code := upper(trim(p_currency_code));
    IF v_code IS NULL OR length(v_code) <> 3 THEN
        RAISE EXCEPTION 'currency_code must be a 3-character ISO 4217 code';
    END IF;

    IF trim(COALESCE(p_currency_name, '')) = '' OR trim(COALESCE(p_symbol, '')) = '' THEN
        RAISE EXCEPTION 'currency_name and symbol are required';
    END IF;

    IF COALESCE(p_symbol_position, 'prefix') NOT IN ('prefix', 'suffix') THEN
        RAISE EXCEPTION 'symbol_position must be prefix or suffix';
    END IF;

    IF p_is_base THEN
        UPDATE admin.currencies
        SET is_base = FALSE,
            updated_by = v_admin_user_id,
            updated_at = NOW()
        WHERE is_base = TRUE;
    END IF;

    INSERT INTO admin.currencies (
        currency_code,
        currency_name,
        symbol,
        symbol_position,
        decimal_places,
        is_active,
        is_base,
        sort_order,
        created_by,
        updated_by
    )
    VALUES (
        v_code,
        trim(p_currency_name),
        trim(p_symbol),
        COALESCE(p_symbol_position, 'prefix'),
        COALESCE(p_decimal_places, 2),
        COALESCE(p_is_active, TRUE),
        COALESCE(p_is_base, FALSE),
        COALESCE(p_sort_order, 0),
        v_admin_user_id,
        v_admin_user_id
    )
    RETURNING id INTO v_id;

    SELECT * INTO v_new FROM admin.currencies WHERE id = v_id;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'currency.create',
        'currency',
        v_id,
        NULL,
        NULL,
        to_jsonb(v_new)
    );

    RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.update_currency
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.update_currency(
    p_currency_id UUID,
    p_currency_name TEXT DEFAULT NULL,
    p_symbol VARCHAR(10) DEFAULT NULL,
    p_symbol_position VARCHAR(6) DEFAULT NULL,
    p_decimal_places SMALLINT DEFAULT NULL,
    p_is_active BOOLEAN DEFAULT NULL,
    p_is_base BOOLEAN DEFAULT NULL,
    p_sort_order INTEGER DEFAULT NULL,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_prev admin.currencies%ROWTYPE;
    v_new admin.currencies%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'system.currencies.edit') THEN
        RAISE EXCEPTION 'Permission denied: system.currencies.edit required';
    END IF;

    SELECT * INTO v_prev
    FROM admin.currencies
    WHERE id = p_currency_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Currency not found: %', p_currency_id;
    END IF;

    IF p_is_active IS FALSE AND v_prev.is_base THEN
        RAISE EXCEPTION 'Cannot deactivate the base currency; set another currency as base first';
    END IF;

    IF COALESCE(p_is_base, FALSE) AND NOT v_prev.is_base THEN
        UPDATE admin.currencies
        SET is_base = FALSE,
            updated_by = v_admin_user_id,
            updated_at = NOW()
        WHERE is_base = TRUE
          AND id <> p_currency_id;
    END IF;

    UPDATE admin.currencies
    SET currency_name = COALESCE(NULLIF(trim(p_currency_name), ''), currency_name),
        symbol = COALESCE(NULLIF(trim(p_symbol), ''), symbol),
        symbol_position = COALESCE(p_symbol_position, symbol_position),
        decimal_places = COALESCE(p_decimal_places, decimal_places),
        is_active = COALESCE(p_is_active, is_active),
        is_base = CASE
            WHEN p_is_base IS NOT NULL THEN p_is_base
            ELSE is_base
        END,
        sort_order = COALESCE(p_sort_order, sort_order),
        updated_by = v_admin_user_id,
        updated_at = NOW()
    WHERE id = p_currency_id
    RETURNING * INTO v_new;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'currency.update',
        'currency',
        p_currency_id,
        NULL,
        to_jsonb(v_prev),
        to_jsonb(v_new)
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.delete_currency
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.delete_currency(
    p_currency_id UUID,
    p_reason TEXT DEFAULT NULL,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public, sim
AS $$
DECLARE
    v_admin_user_id UUID;
    v_prev admin.currencies%ROWTYPE;
    v_new admin.currencies%ROWTYPE;
    v_referenced BOOLEAN := FALSE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'system.currencies.edit') THEN
        RAISE EXCEPTION 'Permission denied: system.currencies.edit required';
    END IF;

    IF p_reason IS NULL OR trim(p_reason) = '' THEN
        RAISE EXCEPTION 'Deletion reason is required';
    END IF;

    SELECT * INTO v_prev
    FROM admin.currencies
    WHERE id = p_currency_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Currency not found: %', p_currency_id;
    END IF;

    IF v_prev.is_base THEN
        RAISE EXCEPTION 'Cannot delete the base currency; set another currency as base first';
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.platform_subscriptions ps
        WHERE upper(trim(ps.currency)) = v_prev.currency_code
        UNION ALL
        SELECT 1 FROM sim.simulator_subscriptions ss
        WHERE upper(trim(ss.currency)) = v_prev.currency_code
        UNION ALL
        SELECT 1 FROM public.payment_transactions pt
        WHERE upper(trim(pt.currency)) = v_prev.currency_code
    )
    INTO v_referenced;

    IF v_referenced THEN
        UPDATE admin.currencies
        SET is_active = FALSE,
            updated_by = v_admin_user_id,
            updated_at = NOW()
        WHERE id = p_currency_id
        RETURNING * INTO v_new;

        PERFORM admin.log_admin_action(
            v_admin_user_id,
            'currency.delete',
            'currency',
            p_currency_id,
            jsonb_build_object('reason', trim(p_reason), 'soft_delete', TRUE),
            to_jsonb(v_prev),
            to_jsonb(v_new)
        );
    ELSE
        DELETE FROM admin.currencies
        WHERE id = p_currency_id;

        PERFORM admin.log_admin_action(
            v_admin_user_id,
            'currency.delete',
            'currency',
            p_currency_id,
            jsonb_build_object('reason', trim(p_reason), 'soft_delete', FALSE),
            to_jsonb(v_prev),
            NULL
        );
    END IF;

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.create_exchange_rate
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.create_exchange_rate(
    p_from_currency VARCHAR(3),
    p_to_currency VARCHAR(3),
    p_rate NUMERIC,
    p_effective_from TIMESTAMPTZ DEFAULT NOW(),
    p_source VARCHAR(20) DEFAULT 'manual',
    p_source_detail TEXT DEFAULT NULL,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_from VARCHAR(3);
    v_to VARCHAR(3);
    v_effective TIMESTAMPTZ;
    v_id UUID;
    v_new admin.exchange_rates%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'system.exchange_rates.edit') THEN
        RAISE EXCEPTION 'Permission denied: system.exchange_rates.edit required';
    END IF;

    v_from := upper(trim(p_from_currency));
    v_to := upper(trim(p_to_currency));

    IF v_from IS NULL OR v_to IS NULL OR v_from = v_to THEN
        RAISE EXCEPTION 'from_currency and to_currency must differ';
    END IF;

    IF p_rate IS NULL OR p_rate <= 0 THEN
        RAISE EXCEPTION 'rate must be greater than zero';
    END IF;

    IF COALESCE(p_source, 'manual') NOT IN ('manual', 'api') THEN
        RAISE EXCEPTION 'source must be manual or api';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM admin.currencies c WHERE c.currency_code = v_from) THEN
        RAISE EXCEPTION 'Unknown from_currency: %', v_from;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM admin.currencies c WHERE c.currency_code = v_to) THEN
        RAISE EXCEPTION 'Unknown to_currency: %', v_to;
    END IF;

    v_effective := COALESCE(p_effective_from, NOW());

    UPDATE admin.exchange_rates er
    SET effective_to = v_effective
    WHERE er.from_currency = v_from
      AND er.to_currency = v_to
      AND er.is_active = TRUE
      AND er.effective_to IS NULL;

    INSERT INTO admin.exchange_rates (
        from_currency,
        to_currency,
        rate,
        inverse_rate,
        effective_from,
        source,
        source_detail,
        is_active,
        created_by
    )
    VALUES (
        v_from,
        v_to,
        p_rate,
        1.0 / p_rate,
        v_effective,
        COALESCE(p_source, 'manual'),
        p_source_detail,
        TRUE,
        v_admin_user_id
    )
    RETURNING id INTO v_id;

    SELECT * INTO v_new FROM admin.exchange_rates WHERE id = v_id;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'exchange_rate.create',
        'exchange_rate',
        v_id,
        NULL,
        NULL,
        to_jsonb(v_new)
    );

    RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.update_exchange_rate
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.update_exchange_rate(
    p_rate_id UUID,
    p_rate NUMERIC DEFAULT NULL,
    p_effective_from TIMESTAMPTZ DEFAULT NULL,
    p_source VARCHAR(20) DEFAULT NULL,
    p_source_detail TEXT DEFAULT NULL,
    p_is_active BOOLEAN DEFAULT NULL,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_prev admin.exchange_rates%ROWTYPE;
    v_new admin.exchange_rates%ROWTYPE;
    v_rate NUMERIC;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'system.exchange_rates.edit') THEN
        RAISE EXCEPTION 'Permission denied: system.exchange_rates.edit required';
    END IF;

    SELECT * INTO v_prev
    FROM admin.exchange_rates
    WHERE id = p_rate_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Exchange rate not found: %', p_rate_id;
    END IF;

    v_rate := COALESCE(p_rate, v_prev.rate);
    IF v_rate <= 0 THEN
        RAISE EXCEPTION 'rate must be greater than zero';
    END IF;

    IF p_source IS NOT NULL AND p_source NOT IN ('manual', 'api') THEN
        RAISE EXCEPTION 'source must be manual or api';
    END IF;

    UPDATE admin.exchange_rates
    SET rate = v_rate,
        inverse_rate = 1.0 / v_rate,
        effective_from = COALESCE(p_effective_from, effective_from),
        source = COALESCE(p_source, source),
        source_detail = COALESCE(p_source_detail, source_detail),
        is_active = COALESCE(p_is_active, is_active)
    WHERE id = p_rate_id
    RETURNING * INTO v_new;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'exchange_rate.update',
        'exchange_rate',
        p_rate_id,
        NULL,
        to_jsonb(v_prev),
        to_jsonb(v_new)
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.get_current_exchange_rates
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.get_current_exchange_rates()
RETURNS TABLE (
    id UUID,
    from_currency VARCHAR(3),
    to_currency VARCHAR(3),
    rate NUMERIC,
    inverse_rate NUMERIC,
    effective_from TIMESTAMPTZ,
    effective_to TIMESTAMPTZ,
    source VARCHAR(20),
    source_detail TEXT,
    is_active BOOLEAN,
    created_at TIMESTAMPTZ,
    created_by UUID
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
BEGIN
    v_admin_user_id := admin.current_admin_user_id();
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve current admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'system.exchange_rates.view') THEN
        RAISE EXCEPTION 'Permission denied: system.exchange_rates.view required';
    END IF;

    RETURN QUERY
    SELECT DISTINCT ON (er.from_currency, er.to_currency)
        er.id,
        er.from_currency,
        er.to_currency,
        er.rate,
        er.inverse_rate,
        er.effective_from,
        er.effective_to,
        er.source,
        er.source_detail,
        er.is_active,
        er.created_at,
        er.created_by
    FROM admin.exchange_rates er
    WHERE er.is_active = TRUE
      AND er.effective_to IS NULL
    ORDER BY er.from_currency, er.to_currency, er.effective_from DESC;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.list_exchange_rates
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.list_exchange_rates(
    p_from_currency VARCHAR(3) DEFAULT NULL,
    p_to_currency VARCHAR(3) DEFAULT NULL,
    p_active_only BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
    id UUID,
    from_currency VARCHAR(3),
    to_currency VARCHAR(3),
    rate NUMERIC,
    inverse_rate NUMERIC,
    effective_from TIMESTAMPTZ,
    effective_to TIMESTAMPTZ,
    source VARCHAR(20),
    source_detail TEXT,
    is_active BOOLEAN,
    created_at TIMESTAMPTZ,
    created_by UUID
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_from VARCHAR(3);
    v_to VARCHAR(3);
BEGIN
    v_admin_user_id := admin.current_admin_user_id();
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve current admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'system.exchange_rates.view') THEN
        RAISE EXCEPTION 'Permission denied: system.exchange_rates.view required';
    END IF;

    v_from := NULLIF(upper(trim(p_from_currency)), '');
    v_to := NULLIF(upper(trim(p_to_currency)), '');

    RETURN QUERY
    SELECT
        er.id,
        er.from_currency,
        er.to_currency,
        er.rate,
        er.inverse_rate,
        er.effective_from,
        er.effective_to,
        er.source,
        er.source_detail,
        er.is_active,
        er.created_at,
        er.created_by
    FROM admin.exchange_rates er
    WHERE (v_from IS NULL OR er.from_currency = v_from)
      AND (v_to IS NULL OR er.to_currency = v_to)
      AND (NOT COALESCE(p_active_only, FALSE) OR (er.is_active = TRUE AND er.effective_to IS NULL))
    ORDER BY er.from_currency, er.to_currency, er.effective_from DESC;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.get_revenue_summary_multi_currency
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- admin.create_country
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.create_country(
    p_country_code VARCHAR(2),
    p_country_name TEXT,
    p_iso3_code VARCHAR(3) DEFAULT NULL,
    p_phone_code VARCHAR(10) DEFAULT NULL,
    p_default_currency VARCHAR(3) DEFAULT NULL,
    p_region TEXT DEFAULT NULL,
    p_platform_allowed BOOLEAN DEFAULT TRUE,
    p_simulator_allowed BOOLEAN DEFAULT TRUE,
    p_platform_reason TEXT DEFAULT NULL,
    p_simulator_reason TEXT DEFAULT NULL,
    p_sort_order INTEGER DEFAULT 0,
    p_is_active BOOLEAN DEFAULT TRUE,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_code VARCHAR(2);
    v_id UUID;
    v_new admin.countries%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'system.countries.edit') THEN
        RAISE EXCEPTION 'Permission denied: system.countries.edit required';
    END IF;

    v_code := upper(trim(p_country_code));
    IF v_code IS NULL OR length(v_code) <> 2 THEN
        RAISE EXCEPTION 'country_code must be a 2-character ISO 3166-1 alpha-2 code';
    END IF;

    IF trim(COALESCE(p_country_name, '')) = '' THEN
        RAISE EXCEPTION 'country_name is required';
    END IF;

    IF p_default_currency IS NOT NULL
       AND NOT EXISTS (
           SELECT 1 FROM admin.currencies c
           WHERE c.currency_code = upper(trim(p_default_currency))
       ) THEN
        RAISE EXCEPTION 'Unknown default_currency: %', p_default_currency;
    END IF;

    INSERT INTO admin.countries (
        country_code,
        country_name,
        iso3_code,
        phone_code,
        default_currency,
        region,
        platform_allowed,
        simulator_allowed,
        platform_reason,
        simulator_reason,
        sort_order,
        is_active,
        created_by,
        updated_by
    )
    VALUES (
        v_code,
        trim(p_country_name),
        NULLIF(upper(trim(p_iso3_code)), ''),
        p_phone_code,
        NULLIF(upper(trim(p_default_currency)), ''),
        p_region,
        COALESCE(p_platform_allowed, TRUE),
        COALESCE(p_simulator_allowed, TRUE),
        p_platform_reason,
        p_simulator_reason,
        COALESCE(p_sort_order, 0),
        COALESCE(p_is_active, TRUE),
        v_admin_user_id,
        v_admin_user_id
    )
    RETURNING id INTO v_id;

    SELECT * INTO v_new FROM admin.countries WHERE id = v_id;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'country.create',
        'country',
        v_id,
        NULL,
        NULL,
        to_jsonb(v_new)
    );

    RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.update_country
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.update_country(
    p_country_id UUID,
    p_country_name TEXT DEFAULT NULL,
    p_iso3_code VARCHAR(3) DEFAULT NULL,
    p_phone_code VARCHAR(10) DEFAULT NULL,
    p_default_currency VARCHAR(3) DEFAULT NULL,
    p_region TEXT DEFAULT NULL,
    p_platform_allowed BOOLEAN DEFAULT NULL,
    p_simulator_allowed BOOLEAN DEFAULT NULL,
    p_platform_reason TEXT DEFAULT NULL,
    p_simulator_reason TEXT DEFAULT NULL,
    p_sort_order INTEGER DEFAULT NULL,
    p_is_active BOOLEAN DEFAULT NULL,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_prev admin.countries%ROWTYPE;
    v_new admin.countries%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'system.countries.edit') THEN
        RAISE EXCEPTION 'Permission denied: system.countries.edit required';
    END IF;

    SELECT * INTO v_prev
    FROM admin.countries
    WHERE id = p_country_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Country not found: %', p_country_id;
    END IF;

    IF p_default_currency IS NOT NULL
       AND NOT EXISTS (
           SELECT 1 FROM admin.currencies c
           WHERE c.currency_code = upper(trim(p_default_currency))
       ) THEN
        RAISE EXCEPTION 'Unknown default_currency: %', p_default_currency;
    END IF;

    UPDATE admin.countries
    SET country_name = COALESCE(NULLIF(trim(p_country_name), ''), country_name),
        iso3_code = COALESCE(NULLIF(upper(trim(p_iso3_code)), ''), iso3_code),
        phone_code = COALESCE(p_phone_code, phone_code),
        default_currency = CASE
            WHEN p_default_currency IS NOT NULL THEN NULLIF(upper(trim(p_default_currency)), '')
            ELSE default_currency
        END,
        region = COALESCE(p_region, region),
        platform_allowed = COALESCE(p_platform_allowed, platform_allowed),
        simulator_allowed = COALESCE(p_simulator_allowed, simulator_allowed),
        platform_reason = COALESCE(p_platform_reason, platform_reason),
        simulator_reason = COALESCE(p_simulator_reason, simulator_reason),
        sort_order = COALESCE(p_sort_order, sort_order),
        is_active = COALESCE(p_is_active, is_active),
        updated_by = v_admin_user_id,
        updated_at = NOW()
    WHERE id = p_country_id
    RETURNING * INTO v_new;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'country.update',
        'country',
        p_country_id,
        NULL,
        to_jsonb(v_prev),
        to_jsonb(v_new)
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.delete_country
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.delete_country(
    p_country_id UUID,
    p_reason TEXT DEFAULT NULL,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_prev admin.countries%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'system.countries.edit') THEN
        RAISE EXCEPTION 'Permission denied: system.countries.edit required';
    END IF;

    IF p_reason IS NULL OR trim(p_reason) = '' THEN
        RAISE EXCEPTION 'Deletion reason is required';
    END IF;

    SELECT * INTO v_prev
    FROM admin.countries
    WHERE id = p_country_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Country not found: %', p_country_id;
    END IF;

    DELETE FROM admin.countries
    WHERE id = p_country_id;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'country.delete',
        'country',
        p_country_id,
        jsonb_build_object('reason', trim(p_reason)),
        to_jsonb(v_prev),
        NULL
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.toggle_country_system
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.toggle_country_system(
    p_country_id UUID,
    p_system TEXT,
    p_allowed BOOLEAN,
    p_reason TEXT DEFAULT NULL,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_prev admin.countries%ROWTYPE;
    v_new admin.countries%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'system.countries.edit') THEN
        RAISE EXCEPTION 'Permission denied: system.countries.edit required';
    END IF;

    IF p_system NOT IN ('platform', 'simulator') THEN
        RAISE EXCEPTION 'system must be platform or simulator';
    END IF;

    SELECT * INTO v_prev
    FROM admin.countries
    WHERE id = p_country_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Country not found: %', p_country_id;
    END IF;

    IF p_system = 'platform' THEN
        UPDATE admin.countries
        SET platform_allowed = COALESCE(p_allowed, platform_allowed),
            platform_reason = CASE
                WHEN COALESCE(p_allowed, platform_allowed) THEN NULL
                ELSE COALESCE(p_reason, platform_reason)
            END,
            updated_by = v_admin_user_id,
            updated_at = NOW()
        WHERE id = p_country_id
        RETURNING * INTO v_new;
    ELSE
        UPDATE admin.countries
        SET simulator_allowed = COALESCE(p_allowed, simulator_allowed),
            simulator_reason = CASE
                WHEN COALESCE(p_allowed, simulator_allowed) THEN NULL
                ELSE COALESCE(p_reason, simulator_reason)
            END,
            updated_by = v_admin_user_id,
            updated_at = NOW()
        WHERE id = p_country_id
        RETURNING * INTO v_new;
    END IF;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'country.toggle_system',
        'country',
        p_country_id,
        jsonb_build_object('system', p_system, 'allowed', p_allowed, 'reason', p_reason),
        to_jsonb(v_prev),
        to_jsonb(v_new)
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.get_allowed_countries
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.get_allowed_countries(
    p_system TEXT
)
RETURNS TABLE (
    id UUID,
    country_code VARCHAR(2),
    country_name TEXT,
    iso3_code VARCHAR(3),
    phone_code VARCHAR(10),
    default_currency VARCHAR(3),
    region TEXT,
    sort_order INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = admin, public
AS $$
BEGIN
    IF p_system NOT IN ('platform', 'simulator') THEN
        RAISE EXCEPTION 'system must be platform or simulator';
    END IF;

    IF p_system = 'platform' THEN
        RETURN QUERY
        SELECT
            c.id,
            c.country_code,
            c.country_name,
            c.iso3_code,
            c.phone_code,
            c.default_currency,
            c.region,
            c.sort_order
        FROM admin.countries c
        WHERE c.is_active = TRUE
          AND c.platform_allowed = TRUE
        ORDER BY c.sort_order, c.country_name;
    ELSE
        RETURN QUERY
        SELECT
            c.id,
            c.country_code,
            c.country_name,
            c.iso3_code,
            c.phone_code,
            c.default_currency,
            c.region,
            c.sort_order
        FROM admin.countries c
        WHERE c.is_active = TRUE
          AND c.simulator_allowed = TRUE
        ORDER BY c.sort_order, c.country_name;
    END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Permission keys
-- ---------------------------------------------------------------------------
INSERT INTO admin.admin_permissions (permission_key, permission_name, category, description)
VALUES
    ('system.currencies.view', 'View Currencies', 'system', 'View admin-managed currency list'),
    ('system.currencies.edit', 'Edit Currencies', 'system', 'Create, update, and delete currencies'),
    ('system.exchange_rates.view', 'View Exchange Rates', 'system', 'View current and historical exchange rates'),
    ('system.exchange_rates.edit', 'Edit Exchange Rates', 'system', 'Create and update exchange rates'),
    ('system.countries.view', 'View Countries', 'system', 'View country registry and system allow flags'),
    ('system.countries.edit', 'Edit Countries', 'system', 'Create, update, delete countries and toggle system access')
ON CONFLICT (permission_key) DO UPDATE SET
    permission_name = EXCLUDED.permission_name,
    category = EXCLUDED.category,
    description = EXCLUDED.description;

INSERT INTO admin.role_permissions (role, permission_key)
SELECT 'super_admin', permission_key
FROM admin.admin_permissions
WHERE permission_key IN (
    'system.currencies.view',
    'system.currencies.edit',
    'system.exchange_rates.view',
    'system.exchange_rates.edit',
    'system.countries.view',
    'system.countries.edit'
)
ON CONFLICT (role, permission_key) DO NOTHING;

INSERT INTO admin.role_permissions (role, permission_key)
VALUES
    ('system_admin', 'system.currencies.view'),
    ('system_admin', 'system.currencies.edit'),
    ('system_admin', 'system.exchange_rates.view'),
    ('system_admin', 'system.exchange_rates.edit'),
    ('system_admin', 'system.countries.view'),
    ('system_admin', 'system.countries.edit')
ON CONFLICT (role, permission_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- GRANT EXECUTE on RPCs
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION admin._lookup_exchange_rate(VARCHAR, VARCHAR, TIMESTAMPTZ) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.get_base_currency() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.convert_currency(NUMERIC, VARCHAR, VARCHAR, TIMESTAMPTZ) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.create_currency(VARCHAR, TEXT, VARCHAR, VARCHAR, SMALLINT, BOOLEAN, BOOLEAN, INTEGER, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.update_currency(UUID, TEXT, VARCHAR, VARCHAR, SMALLINT, BOOLEAN, BOOLEAN, INTEGER, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.delete_currency(UUID, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.create_exchange_rate(VARCHAR, VARCHAR, NUMERIC, TIMESTAMPTZ, VARCHAR, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.update_exchange_rate(UUID, NUMERIC, TIMESTAMPTZ, VARCHAR, TEXT, BOOLEAN, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.get_current_exchange_rates() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.list_exchange_rates(VARCHAR, VARCHAR, BOOLEAN) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.get_revenue_summary_multi_currency(DATE, DATE) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.create_country(VARCHAR, TEXT, VARCHAR, VARCHAR, VARCHAR, TEXT, BOOLEAN, BOOLEAN, TEXT, TEXT, INTEGER, BOOLEAN, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.update_country(UUID, TEXT, VARCHAR, VARCHAR, VARCHAR, TEXT, BOOLEAN, BOOLEAN, TEXT, TEXT, INTEGER, BOOLEAN, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.delete_country(UUID, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.toggle_country_system(UUID, TEXT, BOOLEAN, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.get_allowed_countries(TEXT) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Register tables in database_tables
-- ---------------------------------------------------------------------------
INSERT INTO public.database_tables (table_name, table_description, schema_name, is_system_table, is_active, table_category)
VALUES
    ('currencies', 'Admin-managed ISO 4217 currencies with base currency flag', 'admin', TRUE, TRUE, 'admin'),
    ('exchange_rates', 'Historical FX rates for multi-currency reporting', 'admin', FALSE, TRUE, 'admin'),
    ('countries', 'Country registry with per-system allowed/disallowed flags', 'admin', FALSE, TRUE, 'admin')
ON CONFLICT (table_name) DO UPDATE SET
    table_description = EXCLUDED.table_description,
    schema_name = EXCLUDED.schema_name,
    is_system_table = EXCLUDED.is_system_table,
    is_active = EXCLUDED.is_active,
    table_category = EXCLUDED.table_category,
    updated_at = NOW();

DO $$
BEGIN
    RAISE NOTICE 'v18: Currency, exchange rate, and country management applied.';
END $$;
