-- V38: PERSONAL/BUSINESS account scope + TCG collectibles support

-- New account type for TCG card collections (same pattern as V19)
ALTER TYPE account_type ADD VALUE IF NOT EXISTS 'COLLECTIBLE' BEFORE 'OTHER';

-- Personal vs business (auto-entreprise) tagging on every account
ALTER TABLE account
    ADD COLUMN scope VARCHAR(10) NOT NULL DEFAULT 'PERSONAL'
        CONSTRAINT ck_account_scope CHECK (scope IN ('PERSONAL', 'BUSINESS'));

-- Card thumbnail for collectible holdings (null for regular holdings)
ALTER TABLE account_holding
    ADD COLUMN image_url VARCHAR(300);
