-- Migration: Add expenses table for P&L reports
-- Run: docker exec sbonus_db psql -U sbonus -d sbonus_db -f /tmp/add_expenses_table.sql

CREATE TABLE IF NOT EXISTS expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category VARCHAR(30) NOT NULL DEFAULT 'other',
    amount NUMERIC(12,2) NOT NULL,
    month VARCHAR(7) NOT NULL,  -- "2026-05" format
    description VARCHAR(500),
    branch_id UUID REFERENCES branches(id),
    source VARCHAR(10) NOT NULL DEFAULT 'manual',
    reference VARCHAR(100),
    is_recurring BOOLEAN DEFAULT false,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_expenses_month ON expenses(month);
CREATE INDEX IF NOT EXISTS ix_expenses_category ON expenses(category);
CREATE INDEX IF NOT EXISTS ix_expenses_created_at ON expenses(created_at);

-- Comment
COMMENT ON TABLE expenses IS 'Расходы магазина для P&L отчёта (ручной ввод + 1С)';
