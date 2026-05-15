"""
Sbonus+ — Все модели базы данных.
Магазин: Смарт Центр | Валюта: KGS | DECIMAL(12,2)
"""

import enum
import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import UUID, INET, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.core.database import Base


# ═══════════════════════════════════════════
# ENUMS
# ═══════════════════════════════════════════

class TransactionType(str, enum.Enum):
    """Типы бонусных операций."""
    EARN = "earn"
    SPEND = "spend"
    EXPIRE = "expire"
    REFUND = "refund"
    BIRTHDAY = "birthday"
    REFERRAL = "referral"
    PROMO = "promo"


class UserRoleEnum(str, enum.Enum):
    """Роли пользователей."""
    SUPER_ADMIN = "super_admin"
    BRANCH_ADMIN = "branch_admin"
    CASHIER = "cashier"


class NotificationChannel(str, enum.Enum):
    """Каналы уведомлений."""
    WHATSAPP = "whatsapp"
    SMS = "sms"


class NotificationStatus(str, enum.Enum):
    """Статусы уведомлений."""
    PENDING = "pending"
    SENT = "sent"
    FAILED = "failed"


# ═══════════════════════════════════════════
# МОДЕЛИ
# ═══════════════════════════════════════════

class Tier(Base):
    """Уровни бонусной программы (Bronze/Silver/Gold/Platinum)."""
    __tablename__ = "tiers"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    min_total_kgs: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0"))
    bonus_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    max_spend_pct: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=Decimal("30"))
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Relationships
    customers: Mapped[list["Customer"]] = relationship(back_populates="tier")


class Branch(Base):
    """Филиалы магазина."""
    __tablename__ = "branches"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    address: Mapped[str] = mapped_column(Text, nullable=True)
    city: Mapped[str] = mapped_column(String(50), nullable=True)
    phone: Mapped[str] = mapped_column(String(20), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    users: Mapped[list["User"]] = relationship(back_populates="branch")
    transactions: Mapped[list["Transaction"]] = relationship(back_populates="branch")


class Customer(Base):
    """Клиенты бонусной программы."""
    __tablename__ = "customers"
    __table_args__ = (
        Index("ix_customers_phone", "phone", unique=True),
        Index("ix_customers_qr_code", "qr_code", unique=True),
        Index("ix_customers_referral_code", "referral_code", unique=True),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    phone: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(100), nullable=False)
    qr_code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    birth_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    tier_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("tiers.id"), nullable=True)
    referral_code: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    referred_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("customers.id"), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    tier: Mapped["Tier | None"] = relationship(back_populates="customers")
    bonus_account: Mapped["BonusAccount | None"] = relationship(back_populates="customer", uselist=False)
    transactions: Mapped[list["Transaction"]] = relationship(back_populates="customer")
    referrer: Mapped["Customer | None"] = relationship(remote_side=[id], foreign_keys=[referred_by])


class BonusAccount(Base):
    """Бонусный счёт клиента (1-к-1 с Customer)."""
    __tablename__ = "bonus_accounts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("customers.id"), unique=True, nullable=False
    )
    balance: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0"))
    total_earned: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0"))
    total_spent: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0"))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    customer: Mapped["Customer"] = relationship(back_populates="bonus_account")


class Transaction(Base):
    """
    Бонусные операции — ИММУТАБЕЛЬНАЯ таблица.
    Защищена триггером PostgreSQL от UPDATE и DELETE.
    """
    __tablename__ = "transactions"
    __table_args__ = (
        Index("ix_transactions_customer_id", "customer_id"),
        Index("ix_transactions_receipt_number", "receipt_number", unique=True, postgresql_where=text("receipt_number IS NOT NULL")),
        Index("ix_transactions_created_at", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("customers.id"), nullable=False)
    type: Mapped[TransactionType] = mapped_column(
        SAEnum(TransactionType, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    purchase_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    branch_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("branches.id"), nullable=True)
    cashier_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    receipt_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    customer: Mapped["Customer"] = relationship(back_populates="transactions")
    branch: Mapped["Branch | None"] = relationship(back_populates="transactions")
    cashier: Mapped["User | None"] = relationship(back_populates="transactions")


class User(Base):
    """Пользователи системы (админы + кассиры)."""
    __tablename__ = "users"
    __table_args__ = (
        Index("ix_users_phone", "phone", unique=True),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    phone: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str | None] = mapped_column(String(100), unique=True, nullable=True)
    role: Mapped[UserRoleEnum] = mapped_column(
        SAEnum(UserRoleEnum, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
    )
    branch_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("branches.id"), nullable=True)
    pin_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    branch: Mapped["Branch | None"] = relationship(back_populates="users")
    transactions: Mapped[list["Transaction"]] = relationship(back_populates="cashier")


class PromoCode(Base):
    """Промокоды."""
    __tablename__ = "promo_codes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    bonus_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    max_uses: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    used_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AuditLog(Base):
    """Журнал аудита всех действий."""
    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    action: Mapped[str] = mapped_column(String(50), nullable=False)
    entity_type: Mapped[str | None] = mapped_column(String(30), nullable=True)
    entity_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    details: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

class Setting(Base):
    """Глобальные настройки системы (1C, GreenAPI и т.д.)."""
    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


# ═══════════════════════════════════════════
# SQL для иммутабельности transactions
# ═══════════════════════════════════════════

IMMUTABLE_TRANSACTIONS_TRIGGER = """
CREATE OR REPLACE FUNCTION prevent_transaction_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Таблица transactions иммутабельна: UPDATE и DELETE запрещены';
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_immutable_transactions ON transactions;
CREATE TRIGGER trg_immutable_transactions
    BEFORE UPDATE OR DELETE ON transactions
    FOR EACH ROW
    EXECUTE FUNCTION prevent_transaction_modification();
"""
