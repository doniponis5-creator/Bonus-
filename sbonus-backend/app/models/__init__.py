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
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID, INET, JSON, JSONB
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
    BIRTHDAY = "birthday"  # deprecated — kept for historical records
    REFERRAL = "referral"
    PROMO = "promo"
    CAMPAIGN = "campaign"


class CampaignTargetType(str, enum.Enum):
    """Тип целевой аудитории кампании."""
    ALL = "all"
    INDIVIDUAL = "individual"


class CampaignType(str, enum.Enum):
    """Тип кампании: бонусы или колесо удачи."""
    BONUS = "bonus"
    WHEEL = "wheel"


class CampaignStatus(str, enum.Enum):
    """Статус бонусной кампании."""
    PENDING = "pending"
    PROCESSING = "processing"
    SENT = "sent"
    CANCELLED = "cancelled"


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


class ReviewStatus(str, enum.Enum):
    """Статус заявки на бонус за отзыв."""
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class ReviewPlatform(str, enum.Enum):
    """Платформа отзыва."""
    GOOGLE = "google"
    TWOGIS = "2gis"


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
    debts: Mapped[list["CustomerDebt"]] = relationship(back_populates="customer")


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


class Coupon(Base):
    """Персональные купоны для клиентов."""
    __tablename__ = "coupons"
    __table_args__ = (
        Index("ix_coupons_customer_id", "customer_id"),
        Index("ix_coupons_code", "code", unique=True),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("customers.id"), nullable=True)
    code: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    title: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    bonus_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    min_purchase: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0"))
    is_used: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    customer: Mapped["Customer | None"] = relationship("Customer", foreign_keys=[customer_id])


class ReviewRequest(Base):
    """Заявки на бонус за отзыв в Google / 2GIS."""
    __tablename__ = "review_requests"
    __table_args__ = (
        Index("ix_review_requests_customer_id", "customer_id"),
        Index("ix_review_requests_status", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("customers.id"), nullable=False)
    platform: Mapped[ReviewPlatform] = mapped_column(
        SAEnum(ReviewPlatform, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
    )
    review_link: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[ReviewStatus] = mapped_column(
        SAEnum(ReviewStatus, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        default=ReviewStatus.PENDING,
    )
    bonus_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("200"))
    reviewer_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    admin_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    customer: Mapped["Customer"] = relationship("Customer", foreign_keys=[customer_id])
    reviewer: Mapped["User | None"] = relationship("User", foreign_keys=[reviewed_by])


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


class CustomerAuthToken(Base):
    """Magic-link токены для входа клиента в личный кабинет (15 минут, одноразовые)."""
    __tablename__ = "customer_auth_tokens"
    __table_args__ = (
        Index("ix_customer_auth_tokens_token", "token", unique=True),
        Index("ix_customer_auth_tokens_customer_id", "customer_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("customers.id"), nullable=False)
    token: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class BonusCampaign(Base):
    """Бонусная кампания — отправка бонусов по выбранной дате."""
    __tablename__ = "bonus_campaigns"
    __table_args__ = (
        Index("ix_bonus_campaigns_bonus_date", "bonus_date"),
        Index("ix_bonus_campaigns_status", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    campaign_type: Mapped[str] = mapped_column(String(20), nullable=False, default="bonus", server_default="bonus")
    bonus_date: Mapped[date] = mapped_column(Date, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    message_template: Mapped[str | None] = mapped_column(Text, nullable=True)
    target_type: Mapped[CampaignTargetType] = mapped_column(
        SAEnum(CampaignTargetType, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        default=CampaignTargetType.ALL,
    )
    status: Mapped[CampaignStatus] = mapped_column(
        SAEnum(CampaignStatus, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        default=CampaignStatus.PENDING,
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sent_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    recipients: Mapped[list["BonusCampaignRecipient"]] = relationship(
        back_populates="campaign", cascade="all, delete-orphan"
    )


class BonusCampaignRecipient(Base):
    """Получатель бонусной кампании (для individual или для отслеживания общей рассылки)."""
    __tablename__ = "bonus_campaign_recipients"
    __table_args__ = (
        Index("ix_bonus_campaign_recipients_campaign_id", "campaign_id"),
        Index("ix_bonus_campaign_recipients_customer_id", "customer_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    campaign_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("bonus_campaigns.id", ondelete="CASCADE"), nullable=False
    )
    customer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("customers.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    campaign: Mapped["BonusCampaign"] = relationship(back_populates="recipients")
    customer: Mapped["Customer"] = relationship()


class Notification(Base):
    """Трекинг уведомлений (WhatsApp, SMS)."""
    __tablename__ = "notifications"
    __table_args__ = (
        Index("ix_notifications_customer_id", "customer_id"),
        Index("ix_notifications_status", "status"),
        Index("ix_notifications_created_at", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("customers.id"), nullable=False)
    channel: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default=NotificationChannel.WHATSAPP.value,
    )
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default=NotificationStatus.PENDING.value,
    )
    message: Mapped[str] = mapped_column(Text, nullable=False)
    phone: Mapped[str] = mapped_column(String(20), nullable=False)
    event_type: Mapped[str] = mapped_column(String(50), nullable=False)  # earn, spend, expire, campaign, etc.
    external_id: Mapped[str | None] = mapped_column(String(100), nullable=True)  # Green API message ID
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    max_retries: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    customer: Mapped["Customer"] = relationship()


class CustomerDebt(Base):
    """
    Рассрочка/долг клиента (синхронизация с 1С).
    Ҳар бир рассрочка = алоҳида ёзув.
    reference бўйича upsert (янгиланади ёки яратилади).
    """
    __tablename__ = "customer_debts"
    __table_args__ = (
        Index("ix_customer_debts_customer_id", "customer_id"),
        Index("ix_customer_debts_created_at", "created_at"),
        Index("ix_customer_debts_status", "status"),
        UniqueConstraint("customer_id", "reference", name="uq_customer_debt_reference"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("customers.id"), nullable=False)

    # Суммалар
    total_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0"))
    paid_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0"))
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0"))

    # Просрочка
    overdue_days: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # График ва тарих (JSON)
    schedule: Mapped[dict | None] = mapped_column(JSON, nullable=True, default=list)
    payments_history: Mapped[dict | None] = mapped_column(JSON, nullable=True, default=list)
    next_payment: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # Мета
    source: Mapped[str] = mapped_column(String(20), nullable=False, default="1c")
    reference: Mapped[str] = mapped_column(String(255), nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")

    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    customer: Mapped["Customer"] = relationship(back_populates="debts")


class Product(Base):
    """
    Товарлар каталоги (1С'дан sync).
    SKU — уникальный идентификатор товара в 1С.
    """
    __tablename__ = "products"
    __table_args__ = (
        Index("ix_products_sku", "sku", unique=True),
        Index("ix_products_category", "category"),
        Index("ix_products_is_active", "is_active"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sku: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    category: Mapped[str | None] = mapped_column(String(100), nullable=True)
    barcode: Mapped[str | None] = mapped_column(String(50), nullable=True)
    unit: Mapped[str] = mapped_column(String(20), nullable=False, default="шт")
    price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0"))
    cost_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    current_stock: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0"))
    min_stock_level: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0"))
    supplier: Mapped[str | None] = mapped_column(String(200), nullable=True)
    # E-commerce fields
    image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_visible: Mapped[bool] = mapped_column(Boolean, default=False)  # Показывать в интернет-магазине
    abc_class: Mapped[str | None] = mapped_column(String(1), nullable=True)  # A/B/C classification
    last_sold_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    purchase_items: Mapped[list["PurchaseItem"]] = relationship(back_populates="product")


class PurchaseItem(Base):
    """
    Товарлар в чеке — каждая позиция покупки.
    Связан с Transaction (EARN) и Product.
    """
    __tablename__ = "purchase_items"
    __table_args__ = (
        Index("ix_purchase_items_transaction_id", "transaction_id"),
        Index("ix_purchase_items_product_id", "product_id"),
        Index("ix_purchase_items_created_at", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    transaction_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("transactions.id"), nullable=True
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id"), nullable=False
    )
    receipt_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    quantity: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)
    price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    total: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    cost_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    product: Mapped["Product"] = relationship(back_populates="purchase_items")


# ═══════════════════════════════════════════
# SQL для иммутабельности transactions
# ═══════════════════════════════════════════

IMMUTABLE_TRANSACTIONS_TRIGGER = """
CREATE OR REPLACE FUNCTION prevent_transaction_modification()
RETURNS TRIGGER AS $$
BEGIN
    -- Allow cashier_id updates (admin reassignment)
    IF TG_OP = 'UPDATE' THEN
        IF OLD.id = NEW.id
           AND OLD.customer_id IS NOT DISTINCT FROM NEW.customer_id
           AND OLD.type = NEW.type
           AND OLD.amount = NEW.amount
           AND OLD.purchase_amount IS NOT DISTINCT FROM NEW.purchase_amount
           AND OLD.branch_id IS NOT DISTINCT FROM NEW.branch_id
           AND OLD.receipt_number IS NOT DISTINCT FROM NEW.receipt_number
           AND OLD.note IS NOT DISTINCT FROM NEW.note
           AND OLD.created_at = NEW.created_at
        THEN
            -- Only cashier_id changed — allow
            RETURN NEW;
        END IF;
    END IF;
    RAISE EXCEPTION 'Таблица transactions иммутабельна: разрешено только изменение cashier_id';
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_immutable_transactions ON transactions;
CREATE TRIGGER trg_immutable_transactions
    BEFORE UPDATE OR DELETE ON transactions
    FOR EACH ROW
    EXECUTE FUNCTION prevent_transaction_modification();
"""


# ═══════════════════════════════════════════
# Expense — Расходы (для P&L отчёта)
# ═══════════════════════════════════════════

class ExpenseCategory(str, enum.Enum):
    """Категории расходов."""
    RENT = "rent"                   # Аренда
    SALARY = "salary"               # Зарплата
    UTILITIES = "utilities"         # Коммунальные
    TRANSPORT = "transport"         # Транспорт/Доставка
    MARKETING = "marketing"         # Маркетинг/Реклама
    EQUIPMENT = "equipment"         # Оборудование
    SUPPLIES = "supplies"           # Расходные материалы
    TAXES = "taxes"                 # Налоги
    INSURANCE = "insurance"         # Страхование
    COMMUNICATION = "communication" # Связь/Интернет
    MAINTENANCE = "maintenance"     # Ремонт/Обслуживание
    OTHER = "other"                 # Прочие

EXPENSE_CATEGORY_LABELS = {
    "rent": "Аренда",
    "salary": "Зарплата",
    "utilities": "Коммунальные",
    "transport": "Транспорт",
    "marketing": "Маркетинг",
    "equipment": "Оборудование",
    "supplies": "Расходные материалы",
    "taxes": "Налоги",
    "insurance": "Страхование",
    "communication": "Связь/Интернет",
    "maintenance": "Ремонт/Обслуживание",
    "other": "Прочие",
    # Русские названия → сами себя (для free-text ввода)
    "Аренда": "Аренда",
    "Зарплата": "Зарплата",
    "Коммунальные": "Коммунальные",
    "Транспорт": "Транспорт",
    "Маркетинг": "Маркетинг",
    "Оборудование": "Оборудование",
    "Расходные материалы": "Расходные материалы",
    "Налоги": "Налоги",
    "Страхование": "Страхование",
    "Связь/Интернет": "Связь/Интернет",
    "Ремонт": "Ремонт/Обслуживание",
    "Прочие": "Прочие",
}


class Expense(Base):
    """Расходы магазина (для P&L отчёта)."""
    __tablename__ = "expenses"
    __table_args__ = (
        Index("ix_expenses_month", "month"),
        Index("ix_expenses_category", "category"),
        Index("ix_expenses_created_at", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    category: Mapped[str] = mapped_column(String(30), nullable=False, default="other")
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    month: Mapped[str] = mapped_column(String(7), nullable=False)  # "2026-05" format
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    branch_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("branches.id"), nullable=True
    )
    source: Mapped[str] = mapped_column(String(10), nullable=False, default="manual")  # "manual" | "1c"
    reference: Mapped[str | None] = mapped_column(String(100), nullable=True)  # 1C document ref
    is_recurring: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


# ═══════════════════════════════════════════
# E-COMMERCE — Интернет-магазин
# ═══════════════════════════════════════════

class OrderStatus(str, enum.Enum):
    """Статусы заказа."""
    PENDING = "pending"           # Новый заказ
    CONFIRMED = "confirmed"       # Подтверждён
    PREPARING = "preparing"       # Собирается
    READY = "ready"               # Готов к выдаче / отправке
    DELIVERING = "delivering"     # В доставке
    COMPLETED = "completed"       # Завершён
    CANCELLED = "cancelled"       # Отменён


class PaymentMethod(str, enum.Enum):
    """Способы оплаты."""
    BONUS = "bonus"               # Только бонусами
    CASH = "cash"                 # Наличные при получении
    CARD = "card"                 # Карта при получении (Элкарт/Visa)
    BONUS_CASH = "bonus_cash"     # Бонусы + наличные
    BONUS_CARD = "bonus_card"     # Бонусы + карта


class DeliveryType(str, enum.Enum):
    """Тип доставки."""
    PICKUP = "pickup"             # Самовывоз
    DELIVERY = "delivery"         # Доставка


class Order(Base):
    """Заказ клиента в интернет-магазине."""
    __tablename__ = "orders"
    __table_args__ = (
        Index("ix_orders_customer_id", "customer_id"),
        Index("ix_orders_status", "status"),
        Index("ix_orders_created_at", "created_at"),
        Index("ix_orders_order_number", "order_number", unique=True),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    order_number: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    customer_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("customers.id"), nullable=False)

    # Суммы
    subtotal: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)          # Сумма товаров
    bonus_used: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0"))
    delivery_fee: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0"))
    total: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)             # Итого к оплате (после бонуса)

    # Оплата
    payment_method: Mapped[str] = mapped_column(String(20), nullable=False, default="cash")
    is_paid: Mapped[bool] = mapped_column(Boolean, default=False)

    # Доставка
    delivery_type: Mapped[str] = mapped_column(String(20), nullable=False, default="pickup")
    delivery_address: Mapped[str | None] = mapped_column(Text, nullable=True)
    delivery_phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    delivery_note: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Статус
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    status_note: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Мета
    confirmed_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancel_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    customer: Mapped["Customer"] = relationship()
    items: Mapped[list["OrderItem"]] = relationship(back_populates="order", cascade="all, delete-orphan")
    confirmer: Mapped["User | None"] = relationship(foreign_keys=[confirmed_by])


class OrderItem(Base):
    """Позиция в заказе."""
    __tablename__ = "order_items"
    __table_args__ = (
        Index("ix_order_items_order_id", "order_id"),
        Index("ix_order_items_product_id", "product_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    order_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("orders.id", ondelete="CASCADE"), nullable=False)
    product_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("products.id"), nullable=False)
    product_name: Mapped[str] = mapped_column(String(200), nullable=False)       # Snapshot
    product_sku: Mapped[str] = mapped_column(String(50), nullable=False)          # Snapshot
    quantity: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)
    price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)        # Цена на момент заказа
    total: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    order: Mapped["Order"] = relationship(back_populates="items")
    product: Mapped["Product"] = relationship()


# ═══════════════════════════════════════════
# GAMIFICATION 2.0 — Квесты, Достижения, Серии, XP/Уровни
# ═══════════════════════════════════════════

class QuestType(str, enum.Enum):
    """Тип квеста — какое действие отслеживаем."""
    PURCHASE_COUNT = "purchase_count"      # N покупок за период
    PURCHASE_AMOUNT = "purchase_amount"    # единичная покупка на сумму X
    SPEND_SUM = "spend_sum"                # сумма покупок за период
    SPEND_BONUS = "spend_bonus"            # списать бонусы
    REFERRAL = "referral"                  # пригласить друга
    REVIEW = "review"                      # оставить отзыв
    WHEEL_SPIN = "wheel_spin"              # крутить колесо
    STREAK = "streak"                      # серия дней подряд
    VISIT = "visit"                        # покупка сегодня (заход)


class QuestPeriod(str, enum.Enum):
    """Период повторения квеста."""
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    ONCE = "once"


class RewardType(str, enum.Enum):
    """Тип награды за квест."""
    BONUS = "bonus"      # бонусы на счёт
    XP = "xp"            # только опыт
    SPIN = "spin"        # бесплатный спин колеса
    COUPON = "coupon"    # купон


class QuestStatus(str, enum.Enum):
    """Статус прогресса квеста у клиента."""
    ACTIVE = "active"
    COMPLETED = "completed"   # цель достигнута, награда не получена
    CLAIMED = "claimed"       # награда получена


class Quest(Base):
    """Квест/миссия — конфигурация задания (управляется админом)."""
    __tablename__ = "quests"
    __table_args__ = (
        Index("ix_quests_is_active", "is_active"),
        Index("ix_quests_period", "period"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    title: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    icon: Mapped[str] = mapped_column(String(40), nullable=False, default="Target")  # Lucide icon name
    type: Mapped[str] = mapped_column(String(30), nullable=False, default="purchase_count")
    target_value: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("1"))
    reward_type: Mapped[str] = mapped_column(String(20), nullable=False, default="bonus")
    reward_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0"))
    xp_reward: Mapped[int] = mapped_column(Integer, nullable=False, default=10)
    period: Mapped[str] = mapped_column(String(20), nullable=False, default="daily")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    progress: Mapped[list["QuestProgress"]] = relationship(back_populates="quest", cascade="all, delete-orphan")


class QuestProgress(Base):
    """Прогресс клиента по квесту за конкретный период."""
    __tablename__ = "quest_progress"
    __table_args__ = (
        Index("ix_quest_progress_customer_id", "customer_id"),
        Index("ix_quest_progress_quest_id", "quest_id"),
        Index("ix_quest_progress_status", "status"),
        UniqueConstraint("customer_id", "quest_id", "period_key", name="uq_quest_progress_period"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("customers.id", ondelete="CASCADE"), nullable=False
    )
    quest_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("quests.id", ondelete="CASCADE"), nullable=False
    )
    period_key: Mapped[str] = mapped_column(String(20), nullable=False, default="once")  # "2026-06-05" / "2026-W23" / "2026-06" / "once"
    current_value: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0"))
    target_value: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("1"))  # snapshot
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    claimed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    quest: Mapped["Quest"] = relationship(back_populates="progress")
    customer: Mapped["Customer"] = relationship()


class CustomerGameStats(Base):
    """Игровая статистика клиента: XP, уровень, серия дней."""
    __tablename__ = "customer_game_stats"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("customers.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    xp: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    level: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    current_streak: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    longest_streak: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_activity_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    freeze_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_quests_completed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_achievements: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    customer: Mapped["Customer"] = relationship()


class Achievement(Base):
    """Достижение/бейдж — конфигурация (управляется админом)."""
    __tablename__ = "achievements"
    __table_args__ = (
        Index("ix_achievements_is_active", "is_active"),
        Index("ix_achievements_category", "category"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    title: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    icon: Mapped[str] = mapped_column(String(40), nullable=False, default="Award")  # Lucide icon name
    category: Mapped[str] = mapped_column(String(30), nullable=False, default="purchases")
    grade: Mapped[str] = mapped_column(String(20), nullable=False, default="bronze")  # bronze/silver/gold/platinum (visual)
    metric: Mapped[str] = mapped_column(String(30), nullable=False, default="purchases")  # purchases/total_earned/ltv/referrals/streak/...
    threshold: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("1"))
    xp_reward: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    bonus_reward: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0"))
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    unlocks: Mapped[list["CustomerAchievement"]] = relationship(back_populates="achievement", cascade="all, delete-orphan")


class CustomerAchievement(Base):
    """Разблокированное достижение клиента."""
    __tablename__ = "customer_achievements"
    __table_args__ = (
        Index("ix_customer_achievements_customer_id", "customer_id"),
        UniqueConstraint("customer_id", "achievement_id", name="uq_customer_achievement"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("customers.id", ondelete="CASCADE"), nullable=False
    )
    achievement_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("achievements.id", ondelete="CASCADE"), nullable=False
    )
    unlocked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    notified: Mapped[bool] = mapped_column(Boolean, default=False)  # отправлено ли WA-уведомление

    # Relationships
    achievement: Mapped["Achievement"] = relationship(back_populates="unlocks")
    customer: Mapped["Customer"] = relationship()
