"""Кассовые смены (открытие/закрытие, пересчёт наличных).

Создаёт таблицу shifts. Идемпотентно (IF NOT EXISTS) — безопасно
для повторного применения и для prod, где часть может быть создана вручную.

Revision ID: 0011
Revises: 0010
Create Date: 2026-06-14
"""
from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS shifts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            branch_id UUID REFERENCES branches(id),
            cashier_id UUID NOT NULL REFERENCES users(id),
            status VARCHAR(20) NOT NULL DEFAULT 'open',
            opening_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
            opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            denominations JSONB,
            total_counted NUMERIC(12,2),
            cash_sales NUMERIC(12,2) NOT NULL DEFAULT 0,
            total_expected NUMERIC(12,2),
            difference NUMERIC(12,2),
            usd_rate NUMERIC(12,4),
            usd_equivalent NUMERIC(12,2),
            note TEXT,
            closed_at TIMESTAMPTZ,
            edited_by UUID REFERENCES users(id),
            edited_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_shifts_branch_id ON shifts (branch_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_shifts_cashier_id ON shifts (cashier_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_shifts_status ON shifts (status)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_shifts_opened_at ON shifts (opened_at)")

    # Дефолтные настройки смены (если ещё не заданы)
    op.execute(
        """
        INSERT INTO settings (key, value) VALUES
            ('USD_RATE', '87.45'),
            ('SHIFT_DISCREPANCY_ALERT_THRESHOLD', '1000')
        ON CONFLICT (key) DO NOTHING
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS shifts")
