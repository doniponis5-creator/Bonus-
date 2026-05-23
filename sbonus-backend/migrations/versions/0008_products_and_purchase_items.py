"""Add products and purchase_items tables for 1C product analytics

Revision ID: 0008
Revises: 0007
Create Date: 2026-05-23
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Products table ──
    op.create_table(
        "products",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("sku", sa.String(50), unique=True, nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("category", sa.String(100), nullable=True),
        sa.Column("barcode", sa.String(50), nullable=True),
        sa.Column("unit", sa.String(20), nullable=False, server_default="шт"),
        sa.Column("price", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("cost_price", sa.Numeric(12, 2), nullable=True),
        sa.Column("current_stock", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("min_stock_level", sa.Numeric(12, 2), nullable=False, server_default="5"),
        sa.Column("supplier", sa.String(200), nullable=True),
        sa.Column("abc_class", sa.String(1), nullable=True),
        sa.Column("last_sold_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default="true"),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_products_sku", "products", ["sku"], unique=True)
    op.create_index("ix_products_category", "products", ["category"])
    op.create_index("ix_products_is_active", "products", ["is_active"])

    # ── Purchase Items table ──
    op.create_table(
        "purchase_items",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("transaction_id", UUID(as_uuid=True), sa.ForeignKey("transactions.id"), nullable=True),
        sa.Column("product_id", UUID(as_uuid=True), sa.ForeignKey("products.id"), nullable=False),
        sa.Column("receipt_number", sa.String(50), nullable=True),
        sa.Column("quantity", sa.Numeric(12, 3), nullable=False),
        sa.Column("price", sa.Numeric(12, 2), nullable=False),
        sa.Column("total", sa.Numeric(12, 2), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_purchase_items_transaction_id", "purchase_items", ["transaction_id"])
    op.create_index("ix_purchase_items_product_id", "purchase_items", ["product_id"])
    op.create_index("ix_purchase_items_created_at", "purchase_items", ["created_at"])


def downgrade() -> None:
    op.drop_table("purchase_items")
    op.drop_table("products")
