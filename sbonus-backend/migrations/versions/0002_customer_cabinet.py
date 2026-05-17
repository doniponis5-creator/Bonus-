"""Customer cabinet: magic-link auth tokens + 1C debt history

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-17
"""

from alembic import op


revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── customer_auth_tokens ──────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS customer_auth_tokens (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
            token VARCHAR(64) NOT NULL UNIQUE,
            expires_at TIMESTAMPTZ NOT NULL,
            used_at TIMESTAMPTZ NULL,
            ip_address VARCHAR(45) NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_customer_auth_tokens_token ON customer_auth_tokens(token);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_customer_auth_tokens_customer_id ON customer_auth_tokens(customer_id);")

    # ── customer_debts ────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS customer_debts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
            amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
            source VARCHAR(20) NOT NULL DEFAULT '1c',
            reference VARCHAR(100) NULL,
            note TEXT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_customer_debts_customer_id ON customer_debts(customer_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_customer_debts_created_at ON customer_debts(created_at);")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS customer_debts CASCADE;")
    op.execute("DROP TABLE IF EXISTS customer_auth_tokens CASCADE;")
