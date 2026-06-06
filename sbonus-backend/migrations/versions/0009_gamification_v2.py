"""Gamification 2.0 — quests, achievements, streaks, XP/levels

Revision ID: 0009
Revises: 0008
Create Date: 2026-06-05
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Quests (конфигурация миссий) ──
    op.create_table(
        "quests",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("code", sa.String(50), unique=True, nullable=False),
        sa.Column("title", sa.String(150), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("icon", sa.String(40), nullable=False, server_default="Target"),
        sa.Column("type", sa.String(30), nullable=False, server_default="purchase_count"),
        sa.Column("target_value", sa.Numeric(12, 2), nullable=False, server_default="1"),
        sa.Column("reward_type", sa.String(20), nullable=False, server_default="bonus"),
        sa.Column("reward_amount", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("xp_reward", sa.Integer(), nullable=False, server_default="10"),
        sa.Column("period", sa.String(20), nullable=False, server_default="daily"),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), server_default="true"),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_quests_is_active", "quests", ["is_active"])
    op.create_index("ix_quests_period", "quests", ["period"])

    # ── Quest Progress (прогресс клиента) ──
    op.create_table(
        "quest_progress",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("customer_id", UUID(as_uuid=True), sa.ForeignKey("customers.id", ondelete="CASCADE"), nullable=False),
        sa.Column("quest_id", UUID(as_uuid=True), sa.ForeignKey("quests.id", ondelete="CASCADE"), nullable=False),
        sa.Column("period_key", sa.String(20), nullable=False, server_default="once"),
        sa.Column("current_value", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("target_value", sa.Numeric(12, 2), nullable=False, server_default="1"),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("claimed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("customer_id", "quest_id", "period_key", name="uq_quest_progress_period"),
    )
    op.create_index("ix_quest_progress_customer_id", "quest_progress", ["customer_id"])
    op.create_index("ix_quest_progress_quest_id", "quest_progress", ["quest_id"])
    op.create_index("ix_quest_progress_status", "quest_progress", ["status"])

    # ── Customer Game Stats (XP, уровень, серия) ──
    op.create_table(
        "customer_game_stats",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("customer_id", UUID(as_uuid=True), sa.ForeignKey("customers.id", ondelete="CASCADE"), unique=True, nullable=False),
        sa.Column("xp", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("level", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("current_streak", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("longest_streak", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_activity_date", sa.Date(), nullable=True),
        sa.Column("freeze_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_quests_completed", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_achievements", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── Achievements (конфигурация бейджей) ──
    op.create_table(
        "achievements",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("code", sa.String(50), unique=True, nullable=False),
        sa.Column("title", sa.String(150), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("icon", sa.String(40), nullable=False, server_default="Award"),
        sa.Column("category", sa.String(30), nullable=False, server_default="purchases"),
        sa.Column("grade", sa.String(20), nullable=False, server_default="bronze"),
        sa.Column("metric", sa.String(30), nullable=False, server_default="purchases"),
        sa.Column("threshold", sa.Numeric(12, 2), nullable=False, server_default="1"),
        sa.Column("xp_reward", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("bonus_reward", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_achievements_is_active", "achievements", ["is_active"])
    op.create_index("ix_achievements_category", "achievements", ["category"])

    # ── Customer Achievements (разблокированные бейджи) ──
    op.create_table(
        "customer_achievements",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("customer_id", UUID(as_uuid=True), sa.ForeignKey("customers.id", ondelete="CASCADE"), nullable=False),
        sa.Column("achievement_id", UUID(as_uuid=True), sa.ForeignKey("achievements.id", ondelete="CASCADE"), nullable=False),
        sa.Column("unlocked_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("notified", sa.Boolean(), server_default="false"),
        sa.UniqueConstraint("customer_id", "achievement_id", name="uq_customer_achievement"),
    )
    op.create_index("ix_customer_achievements_customer_id", "customer_achievements", ["customer_id"])


def downgrade() -> None:
    op.drop_table("customer_achievements")
    op.drop_table("achievements")
    op.drop_table("customer_game_stats")
    op.drop_table("quest_progress")
    op.drop_table("quests")
