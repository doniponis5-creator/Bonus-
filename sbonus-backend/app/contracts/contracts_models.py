"""
SBonus+ Онлайн Договор Рассрочки — SQLAlchemy модели
"""
from datetime import datetime, date
from uuid import UUID, uuid4
from sqlalchemy import (
    Column, String, Text, Integer, Numeric, Boolean,
    DateTime, Date, ForeignKey, Index
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID, JSONB
from sqlalchemy.orm import relationship, declarative_base

Base = declarative_base()


class Contract(Base):
    __tablename__ = "contracts"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    short_code = Column(String(12), unique=True, nullable=False, index=True)
    rtu_uuid_1c = Column(String(64), index=True)
    rtu_number = Column(String(32))
    rtu_date = Column(DateTime)
    branch_uuid = Column(PG_UUID(as_uuid=True), nullable=False)

    # Продавец
    seller_fio = Column(String(255), nullable=False)
    seller_inn = Column(String(32))
    seller_address = Column(Text)
    seller_account = Column(String(64))

    # Покупатель
    client_phone = Column(String(20), nullable=False, index=True)
    client_fio = Column(String(255), nullable=False)
    client_passport_serial = Column(String(32))
    client_passport_date = Column(Date)
    client_passport_issuer = Column(String(128))
    client_inn = Column(String(32))
    client_address = Column(Text)

    # Поручитель
    guarantor_fio = Column(String(255))
    guarantor_phone = Column(String(20))
    guarantor_passport = Column(String(64))
    guarantor_inn = Column(String(32))
    guarantor_address = Column(Text)

    # Финансы
    items_json = Column(JSONB, nullable=False)
    total_amount = Column(Numeric(14, 2), nullable=False)
    total_amount_words = Column(Text)
    initial_payment = Column(Numeric(14, 2), default=0)
    term_months = Column(Integer, nullable=False)
    schedule_json = Column(JSONB, nullable=False)
    currency = Column(String(8), default="сом")
    city = Column(String(64), default="с.Араван")

    # Подписание
    status = Column(String(16), default="pending", index=True)
    viewed_at = Column(DateTime)
    signed_at = Column(DateTime)
    signature_b64 = Column(Text)
    signature_ip = Column(String(45))
    signature_user_agent = Column(Text)
    otp_verified = Column(Boolean, default=False)

    # PDF
    pdf_unsigned_path = Column(Text)
    pdf_signed_path = Column(Text)
    pdf_sent_to_client = Column(Boolean, default=False)
    pdf_sent_to_1c = Column(Boolean, default=False)

    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    otps = relationship("ContractOTP", back_populates="contract", cascade="all, delete-orphan")
    events = relationship("ContractEvent", back_populates="contract", cascade="all, delete-orphan")

    def to_public_dict(self) -> dict:
        """Безопасный словарь для веб-страницы клиента (без чувствительных полей)."""
        return {
            "id": str(self.id),
            "short_code": self.short_code,
            "rtu_number": self.rtu_number,
            "city": self.city,
            "rtu_date": self.rtu_date.isoformat() if self.rtu_date else None,
            "seller_fio": self.seller_fio,
            "seller_inn": self.seller_inn,
            "seller_address": self.seller_address,
            "seller_account": self.seller_account,
            "client_phone_masked": self._mask_phone(self.client_phone),
            "client_fio": self.client_fio,
            "client_passport_serial": self.client_passport_serial,
            "client_passport_date": self.client_passport_date.isoformat() if self.client_passport_date else None,
            "client_passport_issuer": self.client_passport_issuer,
            "client_inn": self.client_inn,
            "client_address": self.client_address,
            "guarantor_fio": self.guarantor_fio,
            "guarantor_phone": self._mask_phone(self.guarantor_phone) if self.guarantor_phone else None,
            "guarantor_passport": self.guarantor_passport,
            "guarantor_inn": self.guarantor_inn,
            "guarantor_address": self.guarantor_address,
            "items": self.items_json,
            "total_amount": float(self.total_amount),
            "total_amount_words": self.total_amount_words,
            "initial_payment": float(self.initial_payment or 0),
            "term_months": self.term_months,
            "schedule": self.schedule_json,
            "currency": self.currency,
            "status": self.status,
            "signed_at": self.signed_at.isoformat() if self.signed_at else None,
        }

    @staticmethod
    def _mask_phone(phone: str | None) -> str | None:
        if not phone or len(phone) < 6:
            return phone
        return phone[:4] + "***" + phone[-2:]


class ContractOTP(Base):
    __tablename__ = "contract_otp"

    id = Column(Integer, primary_key=True, autoincrement=True)
    contract_id = Column(PG_UUID(as_uuid=True), ForeignKey("contracts.id", ondelete="CASCADE"), nullable=False, index=True)
    code = Column(String(8), nullable=False)
    expires_at = Column(DateTime, nullable=False, index=True)
    verified = Column(Boolean, default=False)
    attempts = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    contract = relationship("Contract", back_populates="otps")


class ContractEvent(Base):
    __tablename__ = "contract_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    contract_id = Column(PG_UUID(as_uuid=True), ForeignKey("contracts.id", ondelete="CASCADE"), nullable=False, index=True)
    event_type = Column(String(32), nullable=False, index=True)
    event_data = Column(JSONB)
    ip_address = Column(String(45))
    created_at = Column(DateTime, default=datetime.utcnow)

    contract = relationship("Contract", back_populates="events")
