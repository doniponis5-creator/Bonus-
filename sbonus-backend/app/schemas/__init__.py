"""
Sbonus+ — Pydantic схемы (request / response).
Магазин: Смарт Центр | Валюта: KGS
"""

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, EmailStr, Field, field_validator


# ═══════════════════════════════════════════
# ОБЩИЕ
# ═══════════════════════════════════════════

class SuccessResponse(BaseModel):
    """Универсальный ответ об успехе."""
    success: bool = True
    message: str


# ═══════════════════════════════════════════
# AUTH
# ═══════════════════════════════════════════

class CashierLoginRequest(BaseModel):
    """Вход кассира: телефон + PIN."""
    phone: str = Field(..., example="+996700123456")
    pin: str = Field(..., min_length=4, max_length=8, example="1234")


class AdminLoginRequest(BaseModel):
    """Вход администратора: email + пароль."""
    email: EmailStr = Field(..., example="admin@sbonus.kg")
    password: str = Field(..., min_length=6, example="secret123")


class RefreshRequest(BaseModel):
    """Обновление access токена."""
    refresh_token: str


class TokenResponse(BaseModel):
    """JWT токены после успешного входа."""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int = Field(..., description="Время жизни access токена в секундах")
    user_id: str
    role: str
    branch_id: Optional[str] = None


# ═══════════════════════════════════════════
# КЛИЕНТЫ
# ═══════════════════════════════════════════

class CustomerRegisterRequest(BaseModel):
    """Регистрация нового клиента."""
    phone: str = Field(..., example="+996700123456")
    full_name: str = Field(..., min_length=2, max_length=100, example="Азамат Бакытбеков")
    birth_date: Optional[date] = Field(None, example="1990-05-15")
    referred_by_code: Optional[str] = Field(None, example="REF-ABC12345")

    @field_validator("phone")
    @classmethod
    def phone_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Телефон не может быть пустым")
        return v

    @field_validator("full_name")
    @classmethod
    def full_name_stripped(cls, v: str) -> str:
        return v.strip()


class CustomerResponse(BaseModel):
    """Данные клиента для ответа API."""
    id: uuid.UUID
    phone: str
    full_name: str
    qr_code: str
    birth_date: Optional[date] = None
    tier_name: Optional[str] = None
    tier_percent: Optional[Decimal] = None
    referral_code: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class BalanceResponse(BaseModel):
    """Бонусный баланс и уровень клиента."""
    customer_id: uuid.UUID
    full_name: str
    phone: str
    qr_code: str
    balance: Decimal
    total_earned: Decimal
    total_spent: Decimal
    tier_name: str
    tier_percent: Decimal
    next_tier_name: Optional[str] = None
    next_tier_remaining: Optional[Decimal] = None

    model_config = {"from_attributes": True}


# ═══════════════════════════════════════════
# БОНУСНЫЕ ОПЕРАЦИИ
# ═══════════════════════════════════════════

class BonusEarnRequest(BaseModel):
    """Начислить бонус за покупку."""
    customer_id: uuid.UUID
    purchase_amount: Decimal = Field(..., gt=0, description="Сумма покупки в KGS")
    branch_id: uuid.UUID
    receipt_number: Optional[str] = Field(None, max_length=50, description="Номер чека из 1С")
    note: Optional[str] = Field(None, max_length=255)


class BonusSpendRequest(BaseModel):
    """Списать бонус при оплате."""
    customer_id: uuid.UUID
    spend_amount: Decimal = Field(..., gt=0, description="Сумма списания")
    purchase_amount: Decimal = Field(..., gt=0, description="Сумма покупки в KGS")
    branch_id: uuid.UUID
    note: Optional[str] = Field(None, max_length=255)


class BonusCheckSpendRequest(BaseModel):
    """Проверка максимальной суммы списания (preview)."""
    customer_id: uuid.UUID
    purchase_amount: Decimal = Field(..., gt=0)


class ReferralApplyRequest(BaseModel):
    """Применить реферальный код."""
    customer_id: uuid.UUID
    referral_code: str = Field(..., min_length=3, max_length=20, example="REF-ABC12345")


class PromoApplyRequest(BaseModel):
    """Применить промокод."""
    customer_id: uuid.UUID
    promo_code: str = Field(..., min_length=2, max_length=30, example="SUMMER50")


class BonusResult(BaseModel):
    """Результат бонусной операции."""
    transaction_id: uuid.UUID
    type: str
    amount: Decimal
    new_balance: Decimal
    tier_name: str
    tier_upgraded: bool = False
    message_ru: str
    message_kg: str

    model_config = {"from_attributes": True}


# ═══════════════════════════════════════════
# АДМИН-ПАНЕЛЬ
# ═══════════════════════════════════════════

class TierCreateRequest(BaseModel):
    """Создать / обновить уровень бонусной программы."""
    name: str = Field(..., min_length=2, max_length=50, example="Gold")
    min_total_kgs: Decimal = Field(..., ge=0, description="Минимум накопленных бонусов для уровня")
    bonus_percent: Decimal = Field(..., gt=0, le=100, description="Процент начисления бонуса")
    max_spend_pct: Decimal = Field(Decimal("30"), gt=0, le=100, description="Макс % списания от покупки")


class PromoCodeCreateRequest(BaseModel):
    """Создать промокод."""
    code: str = Field(..., min_length=2, max_length=30, example="SUMMER50")
    bonus_amount: Decimal = Field(..., gt=0, description="Сумма бонуса в KGS")
    max_uses: int = Field(100, gt=0, description="Максимальное кол-во использований")
    expires_at: Optional[datetime] = Field(None, description="Дата истечения (UTC)")


class CashierCreateRequest(BaseModel):
    """Добавить кассира."""
    phone: str = Field(..., example="+996700123456")
    full_name: str = Field(..., min_length=2, max_length=100, example="Айгуль Асанова")
    pin: str = Field(..., min_length=4, max_length=8, example="4321", description="PIN для входа")
    branch_id: Optional[uuid.UUID] = Field(None, description="UUID филиала")


class DashboardStatsResponse(BaseModel):
    """Статистика главного дашборда."""
    total_customers: int
    active_customers: int
    total_bonus_issued: Decimal
    total_bonus_spent: Decimal
    total_balance: Decimal
    transactions_today: int
    transactions_month: int
    tier_distribution: dict[str, int]

    model_config = {"from_attributes": True}


class SettingsUpdateRequest(BaseModel):
    """Обновление глобальных настроек системы."""
    GREENAPI_INSTANCE_ID: Optional[str] = None
    GREENAPI_API_TOKEN: Optional[str] = None
    ENABLE_WHATSAPP_NOTIFICATIONS: Optional[str] = None
    WHATSAPP_TEMPLATE_EARN: Optional[str] = None
    WHATSAPP_TEMPLATE_SPEND: Optional[str] = None
    MIN_PURCHASE_FOR_BONUS: Optional[str] = None
    BIRTHDAY_BONUS: Optional[str] = None
    REFERRAL_BONUS_INVITER: Optional[str] = None
    REFERRAL_BONUS_INVITEE: Optional[str] = None


class AdminCustomerUpdateRequest(BaseModel):
    """Обновление данных клиента администратором."""
    full_name: Optional[str] = Field(None, min_length=2, max_length=100)
    phone: Optional[str] = Field(None)
    birth_date: Optional[date] = None
    is_active: Optional[bool] = None


class AdminCashierUpdateRequest(BaseModel):
    """Обновление данных кассира администратором (блокировка / разблокировка / переименование)."""
    full_name: Optional[str] = Field(None, min_length=2, max_length=100)
    branch_id: Optional[uuid.UUID] = None
    is_active: Optional[bool] = None
    pin: Optional[str] = Field(None, min_length=4, max_length=8, description="Новый PIN (если нужно сбросить)")


class AdminBonusAdjustmentRequest(BaseModel):
    """Ручная корректировка бонуса администратором."""
    amount: Decimal = Field(..., gt=0, description="Сумма корректировки в KGS")
    note: str = Field(..., min_length=2, max_length=255, description="Причина корректировки")


# ═══════════════════════════════════════════
# 1С WEBHOOK
# ═══════════════════════════════════════════

class Webhook1CPurchaseRequest(BaseModel):
    """Покупка из 1С — начислить бонус."""
    customer_phone: str = Field(..., description="Телефон покупателя")
    purchase_amount: Decimal = Field(..., gt=0, description="Сумма покупки в KGS")
    branch_id: uuid.UUID = Field(..., description="UUID филиала")
    cashier_id: Optional[uuid.UUID] = Field(None, description="UUID кассира")
    receipt_number: str = Field(..., max_length=50, description="Номер чека из 1С")


class Webhook1CSpendRequest(BaseModel):
    """Списание бонусов из 1С при оплате."""
    customer_phone: str = Field(..., description="Телефон покупателя")
    spend_amount: Decimal = Field(..., gt=0, description="Сумма списания в KGS")
    purchase_amount: Decimal = Field(..., gt=0, description="Сумма покупки в KGS")
    branch_id: uuid.UUID = Field(..., description="UUID филиала")
    cashier_id: Optional[uuid.UUID] = Field(None, description="UUID кассира")
    receipt_number: str = Field(..., max_length=50, description="Номер чека из 1С")


class Webhook1CRefundRequest(BaseModel):
    """Возврат товара из 1С — вернуть бонусы покупателю."""
    customer_phone: str = Field(..., description="Телефон покупателя")
    refund_amount: Decimal = Field(..., gt=0, description="Сумма возврата в KGS")
    original_receipt_number: str = Field(..., max_length=50, description="Номер оригинального чека")
    branch_id: uuid.UUID = Field(..., description="UUID филиала")
    cashier_id: Optional[uuid.UUID] = Field(None, description="UUID кассира")
    note: Optional[str] = Field(None, max_length=255)


class Webhook1CRegisterRequest(BaseModel):
    """Регистрация нового клиента прямо из 1С."""
    phone: str = Field(..., description="Телефон покупателя")
    full_name: str = Field(..., min_length=2, max_length=100, description="ФИО покупателя")
    birth_date: Optional[date] = Field(None, description="Дата рождения (YYYY-MM-DD)")
    referred_by_code: Optional[str] = Field(None, description="Реферальный код пригласителя")


# ═══════════════════════════════════════════
# ЛИЧНЫЙ КАБИНЕТ КЛИЕНТА
# ═══════════════════════════════════════════

class CustomerMagicLinkRequest(BaseModel):
    """Запрос magic-link для входа в кабинет."""
    phone: str = Field(..., example="+996700123456")

    @field_validator("phone")
    @classmethod
    def phone_stripped(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Телефон не может быть пустым")
        return v


class CustomerMagicLinkVerifyRequest(BaseModel):
    """Верификация magic-link токена."""
    token: str = Field(..., min_length=16, max_length=64)


class CustomerTokenResponse(BaseModel):
    """JWT клиента после успешной верификации."""
    access_token: str
    token_type: str = "bearer"
    expires_in: int = Field(..., description="Время жизни токена в секундах")
    customer_id: str


class CustomerDebtItem(BaseModel):
    """Запись задолженности из 1С."""
    amount: Decimal
    source: str
    reference: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class CustomerCabinetTransaction(BaseModel):
    """Транзакция для отображения в кабинете."""
    id: uuid.UUID
    type: str
    amount: Decimal
    purchase_amount: Optional[Decimal] = None
    note: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class CustomerCabinetMe(BaseModel):
    """Полные данные для дашборда личного кабинета."""
    customer_id: uuid.UUID
    full_name: str
    phone: str
    qr_code: str
    referral_code: str
    birth_date: Optional[date] = None

    balance: Decimal
    total_earned: Decimal
    total_spent: Decimal

    tier_name: str
    tier_percent: Decimal
    next_tier_name: Optional[str] = None
    next_tier_remaining: Optional[Decimal] = None
    tier_progress_percent: Decimal = Field(default=Decimal("0"), description="Прогресс до следующего уровня, %")

    debt_amount: Decimal = Field(default=Decimal("0"), description="Задолженность из 1С (0 если нет долга)")
    debt_updated_at: Optional[datetime] = None

    recent_transactions: list[CustomerCabinetTransaction] = []


class Webhook1CDebtUpdateRequest(BaseModel):
    """Обновление задолженности клиента из 1С."""
    phone: str = Field(..., description="Телефон клиента")
    amount: Decimal = Field(..., ge=0, description="Текущая задолженность в KGS (0 если погашена)")
    reference: Optional[str] = Field(None, max_length=100, description="Номер документа в 1С")
    note: Optional[str] = Field(None, max_length=255)
