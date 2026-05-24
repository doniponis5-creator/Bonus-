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
    branch_name: Optional[str] = None


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
    category_slug: Optional[str] = Field(None, description="Tovar kategoriyasi (cashback uchun)")
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
    ENABLE_1C_WEBHOOK: Optional[str] = None
    GREENAPI_INSTANCE_ID: Optional[str] = None
    GREENAPI_API_TOKEN: Optional[str] = None
    ENABLE_WHATSAPP_NOTIFICATIONS: Optional[str] = None
    WHATSAPP_TEMPLATE_EARN: Optional[str] = None
    WHATSAPP_TEMPLATE_SPEND: Optional[str] = None
    WHATSAPP_TEMPLATE_EXPIRE: Optional[str] = None
    WHATSAPP_TEMPLATE_EXPIRE_WARNING: Optional[str] = None
    WHATSAPP_TEMPLATE_BALANCE_REMINDER: Optional[str] = None
    BALANCE_REMINDER_INACTIVE_DAYS: Optional[str] = None
    BALANCE_REMINDER_MIN_BALANCE: Optional[str] = None
    MIN_PURCHASE_FOR_BONUS: Optional[str] = None
    REFERRAL_BONUS_INVITER: Optional[str] = None
    REFERRAL_BONUS_INVITEE: Optional[str] = None
    WA_MESSAGE_INTERVAL: Optional[str] = None
    WHEEL_FREE_SPINS_ON_REGISTER: Optional[str] = None
    REFERRAL_DAILY_LIMIT: Optional[str] = None
    # ─── FCM Push Notifications ───
    ENABLE_PUSH_NOTIFICATIONS: Optional[str] = None
    FCM_PROJECT_ID: Optional[str] = None
    FCM_SERVICE_ACCOUNT_JSON: Optional[str] = None


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
    items: Optional[list["PurchaseItemInput"]] = Field(None, description="Позиции чека (товары)")


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


# ═══════════════════════════════════════════
# БОНУСНЫЕ КАМПАНИИ
# ═══════════════════════════════════════════

class BonusCampaignCreateRequest(BaseModel):
    """Создать бонусную кампанию."""
    name: str = Field(..., min_length=2, max_length=150, example="Новогодний бонус 2026")
    campaign_type: str = Field("bonus", description="bonus | wheel")
    bonus_date: date = Field(..., description="Дата начисления бонуса (YYYY-MM-DD)")
    amount: Decimal = Field(Decimal("0"), ge=0, description="Сумма бонуса в KGS (0 для wheel)")
    reason: Optional[str] = Field(None, max_length=500, description="Сабаб / Повод бонуса (для админ-инфо)")
    message_template: Optional[str] = Field(None, max_length=1000, description="WhatsApp шаблон ({amount}, {balance}, {name})")
    target_type: str = Field("all", description="all | individual")
    customer_ids: Optional[list[uuid.UUID]] = Field(None, description="UUID клиентов для individual")


class BonusCampaignResponse(BaseModel):
    """Бонусная кампания."""
    id: uuid.UUID
    name: str
    campaign_type: str = "bonus"
    bonus_date: date
    amount: Decimal
    reason: Optional[str] = None
    message_template: Optional[str] = None
    target_type: str
    status: str
    sent_count: int
    recipients_count: int = 0
    created_at: datetime
    sent_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class BonusCampaignRecipientResponse(BaseModel):
    """Получатель кампании."""
    customer_id: uuid.UUID
    customer_name: str
    customer_phone: str
    status: str
    sent_at: Optional[datetime] = None
    error: Optional[str] = None

    model_config = {"from_attributes": True}


class DebtScheduleItem(BaseModel):
    """Тўлов графиги элементи."""
    date: str = Field(..., description="Тўлов санаси yyyy-MM-dd")
    amount: Decimal = Field(..., ge=0)
    status: str = Field("pending", description="pending | overdue | paid")

class DebtPaymentItem(BaseModel):
    """Тўлов тарихи элементи."""
    date: str = Field(..., description="Тўлов санаси")
    amount: Decimal = Field(..., ge=0)
    document: Optional[str] = Field(None, description="1С ҳужжат рақами")

class DebtNextPayment(BaseModel):
    """Навбатдаги тўлов."""
    date: str
    amount: Decimal

class Webhook1CDebtUpdateRequest(BaseModel):
    """Рассрочка маълумотларини 1С дан қабул қилиш."""
    phone: str = Field(..., description="Телефон +996XXXXXXXXX")
    full_name: Optional[str] = Field(None, max_length=200)
    amount: Decimal = Field(..., ge=0, description="Қолган долг суммаси")
    total_amount: Decimal = Field(Decimal("0"), ge=0, description="Рассрочка жами суммаси")
    paid_amount: Decimal = Field(Decimal("0"), ge=0, description="Тўланган сумма")
    overdue_days: int = Field(0, ge=0, description="Кечикиш кунлари")
    reference: str = Field(..., max_length=255, description="1С ҳужжат рақами (upsert калит)")
    note: Optional[str] = Field(None, max_length=500)
    schedule: Optional[list[DebtScheduleItem]] = Field(None, description="Тўлов графиги")
    payments_history: Optional[list[DebtPaymentItem]] = Field(None, description="Тўлов тарихи")
    next_payment: Optional[DebtNextPayment] = Field(None, description="Навбатдаги тўлов")


# ═══════════════════════════════════════════
# ТОВАР АНАЛИТИКА (1С интеграция)
# ═══════════════════════════════════════════

class ProductSyncItem(BaseModel):
    """Один товар для синхронизации из 1С."""
    sku: str = Field(..., max_length=50, description="Артикул товара в 1С")
    name: str = Field(..., max_length=200, description="Наименование товара")
    category: Optional[str] = Field(None, max_length=100, description="Категория товара")
    barcode: Optional[str] = Field(None, max_length=50, description="Штрих-код")
    unit: str = Field("шт", max_length=20, description="Единица измерения")
    price: Decimal = Field(..., ge=0, description="Розничная цена в KGS")
    cost_price: Optional[Decimal] = Field(None, ge=0, description="Себестоимость в KGS")
    current_stock: Decimal = Field(..., ge=0, description="Текущий остаток")
    min_stock_level: Decimal = Field(Decimal("5"), ge=0, description="Минимальный остаток для алерта")
    supplier: Optional[str] = Field(None, max_length=200, description="Поставщик")


class Webhook1CProductsSyncRequest(BaseModel):
    """Пакетная синхронизация товаров из 1С."""
    products: list[ProductSyncItem] = Field(..., min_length=1, max_length=5000, description="Список товаров")
    branch_id: Optional[uuid.UUID] = Field(None, description="UUID филиала (необязательно)")


class StockUpdateItem(BaseModel):
    """Обновление остатка одного товара."""
    sku: str = Field(..., max_length=50, description="Артикул товара")
    current_stock: Decimal = Field(..., ge=0, description="Новый остаток")


class Webhook1CStockUpdateRequest(BaseModel):
    """Пакетное обновление остатков из 1С."""
    items: list[StockUpdateItem] = Field(..., min_length=1, max_length=5000, description="Список остатков")


class PurchaseItemInput(BaseModel):
    """Позиция в чеке (товар + кол-во + цена)."""
    sku: str = Field(..., max_length=50, description="Артикул товара")
    quantity: Decimal = Field(..., gt=0, description="Количество")
    price: Decimal = Field(..., ge=0, description="Цена за единицу в KGS")


class ProductResponse(BaseModel):
    """Ответ с информацией о товаре."""
    id: uuid.UUID
    sku: str
    name: str
    category: Optional[str] = None
    unit: str = "шт"
    price: float
    cost_price: Optional[float] = None
    current_stock: float
    min_stock_level: float
    supplier: Optional[str] = None
    abc_class: Optional[str] = None
    is_low_stock: bool = False
    is_active: bool = True

    model_config = {"from_attributes": True}


class ProductAnalyticsSummary(BaseModel):
    """Общая сводка товарной аналитики."""
    total_products: int
    active_products: int
    low_stock_count: int
    out_of_stock_count: int
    dead_stock_count: int
    abc_a_count: int
    abc_b_count: int
    abc_c_count: int
    total_inventory_value: float
    total_cost_value: Optional[float] = None


class TopSellerItem(BaseModel):
    """Топ продаваемый товар."""
    sku: str
    name: str
    category: Optional[str] = None
    total_sold: float
    total_revenue: float
    avg_daily_sales: float
    current_stock: float
    days_until_stockout: Optional[int] = None


class LowStockAlert(BaseModel):
    """Алерт: остаток ниже минимума."""
    sku: str
    name: str
    category: Optional[str] = None
    current_stock: float
    min_stock_level: float
    avg_daily_sales: float
    days_until_stockout: Optional[int] = None
    recommended_order: float
    urgency: str  # critical / warning / info


class DeadStockItem(BaseModel):
    """Товар без продаж (замороженный капитал)."""
    sku: str
    name: str
    category: Optional[str] = None
    current_stock: float
    price: float
    frozen_capital: float
    days_without_sale: int
    last_sold_at: Optional[datetime] = None


class FrequentlyBoughtTogether(BaseModel):
    """Пара товаров, которые часто покупают вместе."""
    product_a_sku: str
    product_a_name: str
    product_b_sku: str
    product_b_name: str
    times_bought_together: int
    confidence: float  # 0-1
