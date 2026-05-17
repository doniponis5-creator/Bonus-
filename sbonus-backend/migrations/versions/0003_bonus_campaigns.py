"""Bonus campaigns: scheduled bonus events + per-customer recipients

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-17
"""

from alembic import op


revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── TransactionType: add CAMPAIGN value ──────────────────────────────
    op.execute("ALTER TYPE transactiontype ADD VALUE IF NOT EXISTS 'campaign';")

    # ── Enums for campaigns ──────────────────────────────────────────────
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE campaigntargettype AS ENUM ('all', 'individual');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE campaignstatus AS ENUM ('pending', 'processing', 'sent', 'cancelled');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)

    # ── bonus_campaigns ──────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS bonus_campaigns (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(150) NOT NULL,
            bonus_date DATE NOT NULL,
            amount NUMERIC(12, 2) NOT NULL,
            reason TEXT NULL,
            message_template TEXT NULL,
            target_type campaigntargettype NOT NULL DEFAULT 'all',
            status campaignstatus NOT NULL DEFAULT 'pending',
            created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            sent_at TIMESTAMPTZ NULL,
            sent_count INTEGER NOT NULL DEFAULT 0
        );
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_bonus_campaigns_bonus_date ON bonus_campaigns(bonus_date);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_bonus_campaigns_status ON bonus_campaigns(status);")

    # ── bonus_campaign_recipients ────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS bonus_campaign_recipients (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            campaign_id UUID NOT NULL REFERENCES bonus_campaigns(id) ON DELETE CASCADE,
            customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
            status VARCHAR(20) NOT NULL DEFAULT 'pending',
            sent_at TIMESTAMPTZ NULL,
            error TEXT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_bonus_campaign_recipients_campaign_id ON bonus_campaign_recipients(campaign_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_bonus_campaign_recipients_customer_id ON bonus_campaign_recipients(customer_id);")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS bonus_campaign_recipients CASCADE;")
    op.execute("DROP TABLE IF EXISTS bonus_campaigns CASCADE;")
    op.execute("DROP TYPE IF EXISTS campaignstatus;")
    op.execute("DROP TYPE IF EXISTS campaigntargettype;")
    # transactiontype.CAMPAIGN — qoldiramiz (enum value'ni o'chirib bo'lmaydi)
