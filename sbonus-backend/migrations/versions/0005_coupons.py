"""Add coupons table

Revision ID: 0005
Revises: 0004
Create Date: 2026-05-18
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "coupons",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("customer_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("customers.id"), nullable=True),
        sa.Column("code", sa.String(30), unique=True, nullable=False),
        sa.Column("title", sa.String(100), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("bonus_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("min_purchase", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("is_used", sa.Boolean, server_default="false"),
        sa.Column("is_active", sa.Boolean, server_default="true"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_coupons_customer_id", "coupons", ["customer_id"])
    op.create_index("ix_coupons_code", "coupons", ["code"], unique=True)


def downgrade() -> None:
    op.drop_table("coupons")
