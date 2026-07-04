-- V39: budget categories/rules + installment plans (PayPal 4x style)

CREATE TABLE budget_category (
    id          BIGSERIAL PRIMARY KEY,
    member_id   BIGINT       NOT NULL REFERENCES family_member(id) ON DELETE CASCADE,
    name        VARCHAR(50)  NOT NULL,
    scope       VARCHAR(10)  NOT NULL CONSTRAINT ck_budget_category_scope CHECK (scope IN ('PERSONAL', 'BUSINESS')),
    color       VARCHAR(7)   NOT NULL DEFAULT '#6366f1',
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uk_budget_category_member_scope_name UNIQUE (member_id, scope, name)
);

CREATE TABLE budget_rule (
    id            BIGSERIAL PRIMARY KEY,
    member_id     BIGINT       NOT NULL REFERENCES family_member(id) ON DELETE CASCADE,
    keyword       VARCHAR(100) NOT NULL,
    category_name VARCHAR(50)  NOT NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uk_budget_rule_member_keyword UNIQUE (member_id, keyword)
);

CREATE TABLE installment_plan (
    id             BIGSERIAL PRIMARY KEY,
    member_id      BIGINT        NOT NULL REFERENCES family_member(id) ON DELETE CASCADE,
    label          VARCHAR(100)  NOT NULL,
    total_amount   NUMERIC(20,8) NOT NULL,
    start_date     DATE          NOT NULL,
    installments   INT           NOT NULL DEFAULT 4,
    interval_days  INT           NOT NULL DEFAULT 30,
    scope          VARCHAR(10)   NOT NULL DEFAULT 'PERSONAL' CONSTRAINT ck_installment_plan_scope CHECK (scope IN ('PERSONAL', 'BUSINESS')),
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_budget_rule_member ON budget_rule(member_id);
CREATE INDEX idx_installment_plan_member ON installment_plan(member_id);
