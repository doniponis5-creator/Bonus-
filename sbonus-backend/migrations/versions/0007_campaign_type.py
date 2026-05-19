"""Add campaign_type column to bonus_campaigns

Revision ID: 0007
Revises: 0006
Create Date: 2026-05-19
"""
from alembic import op
import sqlalchemy as sa

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "bonus_campaigns",
        sa.Column("campaign_type", sa.String(20), nullable=False, server_default="bonus"),
    )


def downgrade() -> None:
    op.drop_column("bonus_campaigns", "campaign_type")
