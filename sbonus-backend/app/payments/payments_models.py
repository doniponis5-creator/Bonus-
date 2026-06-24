"""
SBonus+ Онлайн погашение рассрочки (O!Bank) — SQLAlchemy модели.

Один платёж клиента (один взнос по рассрочке) = одна запись InstallmentPayment.
Идемпотентность по payment_id: повторный callback/синхрон НЕ создаёт второй ПКО.
"""
from datetime import datetime
from uuid import uuid4

from sqlalchemy import (
    Column, String, Text, Integer, Numeric, Boolean, DateTime, ForeignKey, Index
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID, JSONB
from sqlalchemy.orm import relationship, declarative_base

Base = declarative_base()


class InstallmentPayment(Base):
    __tablename__ = "installment_payments"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    payment_id = Column(String(40), unique=True, nullable=False, index=True)   # ключ идемпотентности
    short_code = Column(String(12), unique=True, nullable=False, index=True)   # для /pay/{code}
    branch_uuid = Column(PG_UUID(as_uuid=True))

    # Привязка к рассрочке (РТУ)
    rtu_uuid_1c = Column(String(64), index=True)
    rtu_number = Column(String(32))
    rtu_date = Column(DateTime)
    installment_n = Column(Integer)

    # Клиент
    customer_phone = Column(String(20), nullable=False, index=True)
    customer_fio = Column(String(255))

    # Деньги
    amount = Column(Numeric(14, 2), nullable=False)
    currency = Column(String(8), default="сом")
    account = Column(String(16), default="obank")  # obank|online|bank|cash
    schedule_ctx = Column(JSONB)  # {remaining, next_date, next_amount, paid_count, total_count, overdue}

    # Статус
    status = Column(String(16), default="pending", index=True)
    confirmed = Column(Boolean, default=False, index=True)
    confirmed_by = Column(String(20))             # obank_callback|operator|screenshot
    confirmed_at = Column(DateTime)
    client_claimed_paid = Column(Boolean, default=False)

    # O!Bank
    obank_invoice_id = Column(String(64))
    obank_order_id = Column(String(64))
    obank_status = Column(String(32))
    obank_raw = Column(JSONB)
    pay_url = Column(Text)

    # Синхронизация с 1С
    onec_doc_number = Column(String(32))
    synced_at = Column(DateTime)
    sync_attempts = Column(Integer, default=0)
    note = Column(Text)

    paid_at = Column(DateTime)
    expires_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    events = relationship("PaymentEvent", back_populates="payment", cascade="all, delete-orphan")

    # ── Словари ────────────────────────────────────────────────────────────
    def to_public_dict(self) -> dict:
        """Безопасный словарь для публичной страницы клиента."""
        return {
            "payment_id": self.payment_id,
            "short_code": self.short_code,
            "rtu_number": self.rtu_number,
            "installment_n": self.installment_n,
            "customer_phone_masked": self._mask_phone(self.customer_phone),
            "customer_fio": self.customer_fio,
            "amount": float(self.amount),
            "currency": self.currency,
            "status": self.status,
            "confirmed": self.confirmed,
            "client_claimed_paid": self.client_claimed_paid,
            "pay_url": self.pay_url,
            "paid_at": self.paid_at.isoformat() if self.paid_at else None,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
        }

    def to_1c_dict(self) -> dict:
        """Словарь для 1С (создание ПКО). Только подтверждённые платежи."""
        return {
            "payment_id": self.payment_id,
            "rtu_uuid_1c": self.rtu_uuid_1c,
            "rtu_number": self.rtu_number,
            "installment_n": self.installment_n,
            "customer_phone": self.customer_phone,
            "customer_fio": self.customer_fio,
            "amount": float(self.amount),
            "currency": self.currency,
            "account": self.account,
            "confirmed_by": self.confirmed_by,
            "obank_order_id": self.obank_order_id,
            "paid_at": self.paid_at.isoformat() if self.paid_at else None,
        }

    @staticmethod
    def _mask_phone(phone: str | None) -> str | None:
        if not phone or len(phone) < 6:
            return phone
        return phone[:4] + "***" + phone[-2:]


class PaymentEvent(Base):
    __tablename__ = "payment_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    payment_uuid = Column(PG_UUID(as_uuid=True), ForeignKey("installment_payments.id", ondelete="CASCADE"), nullable=False, index=True)
    event_type = Column(String(32), nullable=False, index=True)
    event_data = Column(JSONB)
    ip_address = Column(String(45))
    created_at = Column(DateTime, default=datetime.utcnow)

    payment = relationship("InstallmentPayment", back_populates="events")
