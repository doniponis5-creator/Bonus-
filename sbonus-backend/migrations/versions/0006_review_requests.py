"""Add review_requests table

Revision ID: 0006
Revises: 0005
Create Date: 2026-05-19
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "review_requests",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("customer_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("customers.id"), nullable=False),
        sa.Column("platform", sa.String(10), nullable=False),  # google / 2gis
        sa.Column("review_link", sa.Text, nullable=False),
        sa.Column("status", sa.String(10), nullable=False, server_default="pending"),  # pending/approved/rejected
        sa.Column("bonus_amount", sa.Numeric(12, 2), nullable=False, server_default="200"),
        sa.Column("reviewer_name", sa.String(100), nullable=True),
        sa.Column("admin_note", sa.Text, nullable=True),
        sa.Column("reviewed_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_review_requests_customer_id", "review_requests", ["customer_id"])
    op.create_index("ix_review_requests_status", "review_requests", ["status"])


def downgrade() -> None:
    op.drop_table("review_requests")
