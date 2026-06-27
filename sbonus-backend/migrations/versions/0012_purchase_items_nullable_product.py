"""Allow purchase_items without matched products

Revision ID: 0012
Revises: 0011
Create Date: 2026-06-27
"""
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "purchase_items",
        "product_id",
        existing_type=UUID(as_uuid=True),
        nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "purchase_items",
        "product_id",
        existing_type=UUID(as_uuid=True),
        nullable=False,
    )
