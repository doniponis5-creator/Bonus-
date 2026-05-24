-- Migration: CustomerDebt рассрочка тўлиқ модел
-- Run: docker exec -i sbonus_db psql -U sbonus -d sbonus_db < migrations/add_debt_fields.sql

ALTER TABLE customer_debts
    ADD COLUMN IF NOT EXISTS total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS overdue_days INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS schedule JSON DEFAULT '[]',
    ADD COLUMN IF NOT EXISTS payments_history JSON DEFAULT '[]',
    ADD COLUMN IF NOT EXISTS next_payment JSON,
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE customer_debts ALTER COLUMN reference TYPE VARCHAR(255);
ALTER TABLE customer_debts ALTER COLUMN reference SET NOT NULL;

DELETE FROM customer_debts a USING customer_debts b
WHERE a.id > b.id AND a.customer_id = b.customer_id AND a.reference = b.reference;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_customer_debt_reference') THEN
        ALTER TABLE customer_debts ADD CONSTRAINT uq_customer_debt_reference UNIQUE (customer_id, reference);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_customer_debts_status ON customer_debts(status);
UPDATE customer_debts SET total_amount = amount WHERE total_amount = 0 AND amount > 0;

SELECT 'Migration completed OK' as result;
