-- V40: pro suite (micro-entreprise bookkeeping, UwUTCG invoices, Japan resale simulator)
-- Ported from the standalone pokecalc app. Historical data is imported at
-- runtime via POST /api/pro/import (kept out of git: the repo is public and
-- the invoices contain client PII).

CREATE TABLE resale_sale (
    id                  BIGSERIAL PRIMARY KEY,
    member_id           BIGINT        NOT NULL REFERENCES family_member(id) ON DELETE CASCADE,
    sale_date           DATE          NOT NULL,
    name                VARCHAR(255)  NOT NULL DEFAULT '',
    reference           VARCHAR(100)  NOT NULL DEFAULT '',
    item_type           VARCHAR(30)   NOT NULL DEFAULT 'carte',
    platform            VARCHAR(30)   NOT NULL DEFAULT 'cardmarket',
    sale_price          NUMERIC(14,2) NOT NULL DEFAULT 0,
    purchase_price      NUMERIC(14,2) NOT NULL DEFAULT 0,
    shipping_cost       NUMERIC(14,2) NOT NULL DEFAULT 0,
    platform_commission NUMERIC(14,2) NOT NULL DEFAULT 0,
    packaging_cost      NUMERIC(14,2) NOT NULL DEFAULT 0,
    notes               VARCHAR(500)  NOT NULL DEFAULT '',
    created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_resale_sale_member_date ON resale_sale(member_id, sale_date);

CREATE TABLE pro_invoice (
    id             BIGSERIAL PRIMARY KEY,
    member_id      BIGINT        NOT NULL REFERENCES family_member(id) ON DELETE CASCADE,
    invoice_number VARCHAR(30)   NOT NULL,
    invoice_date   DATE          NOT NULL,
    client_name    VARCHAR(200)  NOT NULL DEFAULT '',
    client_address VARCHAR(500)  NOT NULL DEFAULT '',
    client_email   VARCHAR(200)  NOT NULL DEFAULT '',
    items          TEXT          NOT NULL DEFAULT '[]',
    shipping_cost  NUMERIC(14,2) NOT NULL DEFAULT 0,
    subtotal       NUMERIC(14,2) NOT NULL DEFAULT 0,
    total          NUMERIC(14,2) NOT NULL DEFAULT 0,
    notes          VARCHAR(500)  NOT NULL DEFAULT '',
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    CONSTRAINT uk_pro_invoice_member_number UNIQUE (member_id, invoice_number)
);

CREATE TABLE urssaf_declaration (
    id            BIGSERIAL PRIMARY KEY,
    member_id     BIGINT        NOT NULL REFERENCES family_member(id) ON DELETE CASCADE,
    decl_year     INT           NOT NULL,
    decl_month    INT           NOT NULL,
    total_ca      NUMERIC(14,2) NOT NULL DEFAULT 0,
    urssaf_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    cfp_amount    NUMERIC(14,2) NOT NULL DEFAULT 0,
    vfl_amount    NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_due     NUMERIC(14,2) NOT NULL DEFAULT 0,
    declared      BOOLEAN       NOT NULL DEFAULT FALSE,
    declared_at   TIMESTAMPTZ,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    CONSTRAINT uk_urssaf_declaration_member_period UNIQUE (member_id, decl_year, decl_month)
);

CREATE TABLE pro_setting (
    id            BIGSERIAL PRIMARY KEY,
    member_id     BIGINT       NOT NULL REFERENCES family_member(id) ON DELETE CASCADE,
    setting_key   VARCHAR(50)  NOT NULL,
    setting_value TEXT         NOT NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uk_pro_setting_member_key UNIQUE (member_id, setting_key)
);

CREATE TABLE resale_simulation (
    id         BIGSERIAL PRIMARY KEY,
    member_id  BIGINT       NOT NULL REFERENCES family_member(id) ON DELETE CASCADE,
    sim_type   VARCHAR(20)  NOT NULL CONSTRAINT ck_resale_simulation_type CHECK (sim_type IN ('cards', 'accessories')),
    name       VARCHAR(100) NOT NULL,
    data       TEXT         NOT NULL,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_resale_simulation_member ON resale_simulation(member_id);

