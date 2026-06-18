-- ═══════════════════════════════════════════════════════════════
-- NASIYA DAFTAR — jadvallar (PostgreSQL 15). Idempotent (IF NOT EXISTS).
-- Ishga tushirish (serverda):
--   docker exec -i sbonus_db psql -U sbonus -d sbonus_db < 02_create_tables.sql
-- yoki bitta qatorda:
--   docker exec sbonus_db psql -U sbonus -d sbonus_db -c "..."
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS nasiya_debts (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    debtor_name      VARCHAR(255)  NOT NULL,
    debtor_phone     VARCHAR(20)   NOT NULL,
    principal_amount NUMERIC(12,2) NOT NULL,
    paid_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
    lent_date        DATE          NOT NULL DEFAULT CURRENT_DATE,
    due_date         DATE          NOT NULL,
    status           VARCHAR(20)   NOT NULL DEFAULT 'active',
    note             TEXT,
    reminder_log     JSONB         NOT NULL DEFAULT '[]'::jsonb,
    last_reminder_at TIMESTAMPTZ,
    created_by       UUID REFERENCES users(id),
    created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_nasiya_debts_status   ON nasiya_debts (status);
CREATE INDEX IF NOT EXISTS ix_nasiya_debts_due_date ON nasiya_debts (due_date);
CREATE INDEX IF NOT EXISTS ix_nasiya_debts_phone    ON nasiya_debts (debtor_phone);

CREATE TABLE IF NOT EXISTS nasiya_payments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    debt_id     UUID NOT NULL REFERENCES nasiya_debts(id) ON DELETE CASCADE,
    amount      NUMERIC(12,2) NOT NULL,
    paid_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
    note        TEXT,
    created_by  UUID REFERENCES users(id),
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_nasiya_payments_debt_id ON nasiya_payments (debt_id);
