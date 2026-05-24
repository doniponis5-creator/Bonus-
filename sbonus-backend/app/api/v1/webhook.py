"""
Sbonus+ — Webhook 1С интеграция.

Endpoints:
  POST /api/v1/webhook/1c/purchase          — начисление бонуса (покупка)
  POST /api/v1/webhook/1c/spend             — списание бонуса (оплата бонусами)
  POST /api/v1/webhook/1c/refund            — возврат бонуса (возврат товара)
  POST /api/v1/webhook/1c/register          — регистрация клиента из 1С
  GET  /api/v1/webhook/1c/customer/{phone}  — баланс клиента
  GET  /api/v1/webhook/1c/check-spend/{phone} — доступная сумма списания
  POST /api/v1/webhook/greenapi             — входящие сообщения WhatsApp

Безопасность:
  - ENABLE_1C_WEBHOOK=true (глобальный флаг)
  - IP whitelist (webhook_1c_allowed_ips)
  - HMAC-SHA256 подпись (X-Signature header, опционально)
  - Idempotency через receipt_number (уникальный индекс в БД)
"""

import hashlib
import hmac
import ipaddress
import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.core.database import get_db
from app.models import BonusAccount, Customer, CustomerDebt, Product, PurchaseItem, Setting, Tier, Transaction, TransactionType
from app.schemas import (
    Webhook1CPurchaseRequest,
    Webhook1CSpendRequest,
    Webhook1CRefundRequest,
    Webhook1CRegisterRequest,
    Webhook1CDebtUpdateRequest,
    Webhook1CProductsSyncRequest,
    Webhook1CStockUpdateRequest,
    PurchaseItemInput,
)
from app.services.bonus import BonusService
from app.utils import normalize_phone

settings = get_settings()
router = APIRouter(prefix="/webhook", tags=["Вебхуки 1С"])


# ═══════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════

def _verify_hmac_signature(body: bytes, signature: str, secret: str) -> bool:
    """Проверить HMAC-SHA256 подпись запроса от 1С."""
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


def _check_ip_whitelist(client_ip: str) -> bool:
    """Проверить IP в белом списке для 1С webhook."""
    allowed = settings.webhook_1c_ip_list
    if not allowed or allowed == [""]:
        return True
    try:
        ip = ipaddress.ip_address(client_ip)
    except ValueError:
        return False
    for allowed_ip in allowed:
        try:
            if "/" in allowed_ip:
                if ip in ipaddress.ip_network(allowed_ip, strict=False):
                    return True
            elif client_ip == allowed_ip:
                return True
        except ValueError:
            continue
    return False


async def _security_check(request: Request, x_signature: str | None, db: AsyncSession = None) -> None:
    """Общая проверка безопасности: флаг, IP, HMAC."""
    # Читаем флаг из DB Settings (а не из .env) — чтобы toggle в админке работал в реальном времени
    is_enabled = settings.enable_1c_webhook  # fallback на .env
    if db:
        result = await db.execute(select(Setting).where(Setting.key == "ENABLE_1C_WEBHOOK"))
        db_setting = result.scalar_one_or_none()
        if db_setting is not None:
            is_enabled = db_setting.value.lower() in ("true", "1", "yes")
    if not is_enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "WEBHOOK_DISABLED", "message": "1С webhook отключён. Включите в Настройках → Интеграция 1С"},
        )

    client_ip = request.client.host if request.client else "0.0.0.0"
    if not _check_ip_whitelist(client_ip):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "WEBHOOK_IP_BLOCKED", "message": f"IP {client_ip} не в белом списке"},
        )

    # HMAC-SHA256 обязателен — без валидного секрета webhook не работает
    if not settings.webhook_1c_secret or settings.webhook_1c_secret == "your_hmac_secret_here":
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "WEBHOOK_NOT_CONFIGURED", "message": "HMAC секрет не настроен. Установите WEBHOOK_1C_SECRET в .env"},
        )

    if not x_signature:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "WEBHOOK_MISSING_SIGNATURE", "message": "Требуется HMAC-SHA256 подпись (X-Signature)"},
        )
    raw_body = await request.body()
    if not _verify_hmac_signature(raw_body, x_signature, settings.webhook_1c_secret):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "WEBHOOK_INVALID_SIGNATURE", "message": "Неверная HMAC-SHA256 подпись"},
        )


async def _get_customer_or_404(phone: str, db: AsyncSession) -> Customer:
    """Найти клиента по телефону или 404."""
    result = await db.execute(
        select(Customer).options(selectinload(Customer.tier)).where(Customer.phone == phone)
    )
    customer = result.scalar_one_or_none()
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "CUSTOMER_NOT_FOUND", "message": f"Клиент {phone} не найден в системе S Bonus"},
        )
    return customer



# ═══════════════════════════════════════════
# 1. PURCHASE — начисление бонуса
# ═══════════════════════════════════════════

@router.post("/1c/purchase", status_code=201)
async def webhook_1c_purchase(
    body: Webhook1CPurchaseRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    x_signature: str = Header(None, alias="X-Signature"),
) -> dict:
    """
    **Покупка из 1С** — автоматически начислить бонус клиенту.

    Вызывается кассовым ПО 1С при каждой продаже.
    Бонус рассчитывается по tier клиента (Bronze=3%, Silver=5%, Gold=7%, Platinum=10%).

    Idempotency: повторный запрос с тем же receipt_number вернёт ошибку 409.
    """
    await _security_check(request, x_signature, db)

    phone = normalize_phone(body.customer_phone)
    customer = await _get_customer_or_404(phone, db)

    svc = BonusService(db)
    result = await svc.earn(
        customer_id=customer.id,
        purchase_amount=body.purchase_amount,
        branch_id=body.branch_id,
        cashier_id=body.cashier_id,
        receipt_number=body.receipt_number,
        note=f"1С: чек #{body.receipt_number}",
    )
    await db.flush()

    # ── Сохранить позиции чека (товары) если переданы ──
    items_saved = 0
    if body.items:
        for item in body.items:
            prod_result = await db.execute(
                select(Product).where(Product.sku == item.sku)
            )
            product = prod_result.scalar_one_or_none()
            if product:
                pi = PurchaseItem(
                    transaction_id=result.transaction_id if hasattr(result, "transaction_id") else None,
                    product_id=product.id,
                    receipt_number=body.receipt_number,
                    quantity=item.quantity,
                    price=item.price,
                    total=(item.quantity * item.price).quantize(Decimal("0.01")),
                )
                db.add(pi)
                # Обновить остаток и дату последней продажи
                product.current_stock = max(Decimal("0"), product.current_stock - item.quantity)
                product.last_sold_at = func.now()
                items_saved += 1

    await db.commit()

    return {
        "success": True,
        "event": "purchase",
        "receipt_number": body.receipt_number,
        "customer_id": str(customer.id),
        "customer_name": customer.full_name,
        "purchase_amount": float(body.purchase_amount),
        "bonus_earned": float(result.amount),
        "new_balance": float(result.new_balance),
        "tier": result.tier_name,
        "tier_upgraded": result.tier_upgraded,
        "items_saved": items_saved,
        "message": result.message_ru,
    }


# ═══════════════════════════════════════════
# 2. SPEND — списание бонуса
# ═══════════════════════════════════════════

@router.post("/1c/spend", status_code=201)
async def webhook_1c_spend(
    body: Webhook1CSpendRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    x_signature: str = Header(None, alias="X-Signature"),
) -> dict:
    """
    **Оплата бонусами из 1С** — списать бонусы покупателя.

    1С вызывает этот endpoint, когда покупатель хочет оплатить часть покупки бонусами.
    Ограничение: максимум 30% от суммы покупки.

    Перед вызовом рекомендуется сначала запросить GET /check-spend/{phone}.
    """
    await _security_check(request, x_signature, db)

    phone = normalize_phone(body.customer_phone)
    customer = await _get_customer_or_404(phone, db)

    svc = BonusService(db)
    result = await svc.spend(
        customer_id=customer.id,
        spend_amount=body.spend_amount,
        purchase_amount=body.purchase_amount,
        branch_id=body.branch_id,
        cashier_id=body.cashier_id,
        note=f"1С: оплата бонусами, чек #{body.receipt_number}",
    )
    await db.commit()

    return {
        "success": True,
        "event": "spend",
        "receipt_number": body.receipt_number,
        "customer_id": str(customer.id),
        "customer_name": customer.full_name,
        "purchase_amount": float(body.purchase_amount),
        "bonus_spent": float(result.amount),
        "new_balance": float(result.new_balance),
        "tier": result.tier_name,
        "message": result.message_ru,
    }


# ═══════════════════════════════════════════
# 3. REFUND — возврат бонусов
# ═══════════════════════════════════════════

@router.post("/1c/refund", status_code=201)
async def webhook_1c_refund(
    body: Webhook1CRefundRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    x_signature: str = Header(None, alias="X-Signature"),
) -> dict:
    """
    **Возврат товара из 1С** — вернуть бонусы покупателю.

    При возврате товара 1С вызывает этот endpoint.
    Система ищет оригинальную транзакцию по receipt_number и делает REFUND.

    Если оригинальная транзакция не найдена — создаёт прямой возврат на refund_amount.
    """
    await _security_check(request, x_signature, db)

    phone = normalize_phone(body.customer_phone)
    customer = await _get_customer_or_404(phone, db)

    # Находим оригинальную earn транзакцию
    orig_result = await db.execute(
        select(Transaction).where(
            Transaction.receipt_number == body.original_receipt_number,
            Transaction.customer_id == customer.id,
            Transaction.type == TransactionType.EARN,
        )
    )
    original_txn = orig_result.scalar_one_or_none()

    # Вычисляем сумму возврата бонусов
    if original_txn:
        # Возврат пропорционально сумме возврата
        refund_ratio = body.refund_amount / (original_txn.purchase_amount or body.refund_amount)
        refund_bonus = (original_txn.amount * refund_ratio).quantize(Decimal("0.01"))
    else:
        # Прямой возврат если оригинал не найден
        refund_bonus = body.refund_amount

    # Найти бонусный счёт с блокировкой (предотвращает double-spend)
    acc_result = await db.execute(
        select(BonusAccount)
        .where(BonusAccount.customer_id == customer.id)
        .with_for_update()
    )
    account = acc_result.scalar_one_or_none()
    if not account:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "ACCOUNT_NOT_FOUND", "message": "Бонусный счёт не найден"},
        )

    # Списать ранее начисленные бонусы (или уменьшить баланс)
    actual_deduct = min(refund_bonus, account.balance)
    account.balance -= actual_deduct
    account.total_earned -= actual_deduct

    # Записать REFUND транзакцию
    refund_txn = Transaction(
        customer_id=customer.id,
        type=TransactionType.REFUND,
        amount=actual_deduct,
        purchase_amount=body.refund_amount,
        branch_id=body.branch_id,
        cashier_id=body.cashier_id,
        receipt_number=f"REFUND-{body.original_receipt_number}",
        note=body.note or f"1С: возврат чека #{body.original_receipt_number}",
    )
    db.add(refund_txn)
    await db.flush()
    await db.commit()

    return {
        "success": True,
        "event": "refund",
        "original_receipt": body.original_receipt_number,
        "refund_receipt": refund_txn.receipt_number,
        "customer_id": str(customer.id),
        "customer_name": customer.full_name,
        "refund_amount": float(body.refund_amount),
        "bonus_deducted": float(actual_deduct),
        "new_balance": float(account.balance),
        "message": f"↩️ Возврат чека #{body.original_receipt_number}: -{actual_deduct} KGS бонусов",
    }


# ═══════════════════════════════════════════
# 4. REGISTER — регистрация из 1С
# ═══════════════════════════════════════════

@router.post("/1c/register", status_code=201)
async def webhook_1c_register(
    body: Webhook1CRegisterRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    x_signature: str = Header(None, alias="X-Signature"),
) -> dict:
    """
    **Регистрация клиента из 1С** — создать нового участника бонусной программы.

    Кассир 1С может зарегистрировать покупателя прямо на кассе.
    Если клиент уже зарегистрирован — возвращает его данные (идемпотентно).

    После регистрации можно сразу начислить бонус через /purchase.
    """
    await _security_check(request, x_signature, db)

    phone = normalize_phone(body.phone)

    # Проверить дубликат
    existing = await db.execute(
        select(Customer).options(selectinload(Customer.tier)).where(Customer.phone == phone)
    )
    customer = existing.scalar_one_or_none()

    if customer:
        acc_result = await db.execute(
            select(BonusAccount).where(BonusAccount.customer_id == customer.id)
        )
        account = acc_result.scalar_one_or_none()
        return {
            "success": True,
            "event": "register",
            "already_exists": True,
            "customer_id": str(customer.id),
            "full_name": customer.full_name,
            "phone": customer.phone,
            "qr_code": customer.qr_code,
            "referral_code": customer.referral_code,
            "tier": customer.tier.name if customer.tier else "Bronze",
            "balance": float(account.balance) if account else 0,
            "message": f"Клиент уже зарегистрирован в S Bonus",
        }

    # Дефолтный tier (Bronze)
    tier_result = await db.execute(select(Tier).order_by(Tier.sort_order.asc()).limit(1))
    default_tier = tier_result.scalar_one_or_none()

    # Реферал
    referred_by_id = None
    if body.referred_by_code:
        ref_result = await db.execute(
            select(Customer).where(Customer.referral_code == body.referred_by_code)
        )
        referrer = ref_result.scalar_one_or_none()
        if referrer:
            referred_by_id = referrer.id

    # Создать клиента
    import uuid as uuid_lib
    customer = Customer(
        phone=phone,
        full_name=body.full_name,
        qr_code=f"SB-{uuid_lib.uuid4().hex[:10].upper()}",
        birth_date=body.birth_date,
        tier_id=default_tier.id if default_tier else None,
        referral_code=f"REF-{uuid_lib.uuid4().hex[:8].upper()}",
        referred_by=referred_by_id,
    )
    db.add(customer)
    await db.flush()

    account = BonusAccount(customer_id=customer.id)
    db.add(account)
    await db.flush()
    await db.commit()

    return {
        "success": True,
        "event": "register",
        "already_exists": False,
        "customer_id": str(customer.id),
        "full_name": customer.full_name,
        "phone": customer.phone,
        "qr_code": customer.qr_code,
        "referral_code": customer.referral_code,
        "tier": default_tier.name if default_tier else "Bronze",
        "balance": 0,
        "message": f"✅ {body.full_name} успешно зарегистрирован в S Bonus!",
    }


# ═══════════════════════════════════════════
# 5. CUSTOMER — баланс клиента
# ═══════════════════════════════════════════

@router.get("/1c/customer/{phone}")
async def webhook_1c_get_customer(
    phone: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    x_api_key: str = Header(None, alias="X-Api-Key"),
) -> dict:
    """
    **Баланс клиента из 1С** — проверить регистрацию и баланс перед продажей.

    1С вызывает при начале продажи для отображения бонусного баланса кассиру.
    Возвращает: баланс, уровень, максимальную сумму для списания.
    """
    if not settings.enable_1c_webhook:
        raise HTTPException(status_code=503, detail={"code": "WEBHOOK_DISABLED"})

    client_ip = request.client.host if request.client else "0.0.0.0"
    if not _check_ip_whitelist(client_ip):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "WEBHOOK_IP_BLOCKED", "message": f"IP {client_ip} не в белом списке"},
        )

    # Проверка API-ключа для GET endpoints (HMAC нет для GET — нет body)
    if settings.webhook_1c_secret and settings.webhook_1c_secret != "your_hmac_secret_here":
        if x_api_key != settings.webhook_1c_secret:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"code": "WEBHOOK_INVALID_API_KEY", "message": "Неверный X-Api-Key"},
            )

    phone = normalize_phone(phone)
    customer = await _get_customer_or_404(phone, db)

    acc_result = await db.execute(
        select(BonusAccount).where(BonusAccount.customer_id == customer.id)
    )
    account = acc_result.scalar_one_or_none()
    balance = account.balance if account else Decimal("0")
    tier = customer.tier

    return {
        "registered": True,
        "customer_id": str(customer.id),
        "full_name": customer.full_name,
        "phone": customer.phone,
        "qr_code": customer.qr_code,
        "balance": float(balance),
        "total_earned": float(account.total_earned) if account else 0,
        "total_spent": float(account.total_spent) if account else 0,
        "tier": tier.name if tier else "Bronze",
        "tier_percent": float(tier.bonus_percent) if tier else 3.0,
        "max_spend_pct": float(tier.max_spend_pct) if tier else 30.0,
    }


# ═══════════════════════════════════════════
# 6. CHECK-SPEND — preview списания
# ═══════════════════════════════════════════

@router.get("/1c/check-spend/{phone}")
async def webhook_1c_check_spend(
    phone: str,
    purchase_amount: Decimal = Query(..., gt=0, description="Сумма покупки в KGS"),
    request: Request = None,
    db: AsyncSession = Depends(get_db),
    x_api_key: str = Header(None, alias="X-Api-Key"),
) -> dict:
    """
    **Проверка доступной суммы для списания** — вызывается 1С перед оплатой.

    1С отображает кассиру: сколько бонусов может использовать покупатель.
    Расчёт: min(balance, purchase_amount × 30%)

    Используйте перед вызовом /spend для корректного UX на кассе.
    """
    if not settings.enable_1c_webhook:
        raise HTTPException(status_code=503, detail={"code": "WEBHOOK_DISABLED"})

    client_ip = request.client.host if request.client else "0.0.0.0"
    if not _check_ip_whitelist(client_ip):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "WEBHOOK_IP_BLOCKED", "message": f"IP {client_ip} не в белом списке"},
        )

    # Проверка API-ключа для GET endpoints
    if settings.webhook_1c_secret and settings.webhook_1c_secret != "your_hmac_secret_here":
        if x_api_key != settings.webhook_1c_secret:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"code": "WEBHOOK_INVALID_API_KEY", "message": "Неверный X-Api-Key"},
            )

    phone = normalize_phone(phone)
    customer = await _get_customer_or_404(phone, db)

    acc_result = await db.execute(
        select(BonusAccount).where(BonusAccount.customer_id == customer.id)
    )
    account = acc_result.scalar_one_or_none()
    balance = account.balance if account else Decimal("0")

    tier = customer.tier
    max_pct = tier.max_spend_pct if tier else Decimal("30")
    max_by_percent = (purchase_amount * max_pct / Decimal("100")).quantize(Decimal("0.01"))
    max_spend = min(balance, max_by_percent)

    return {
        "customer_id": str(customer.id),
        "full_name": customer.full_name,
        "phone": customer.phone,
        "balance": float(balance),
        "purchase_amount": float(purchase_amount),
        "max_spend": float(max_spend),
        "max_spend_percent": float(max_pct),
        "can_spend": max_spend > 0,
        "message": (
            f"Можно списать до {max_spend} KGS ({max_pct}% от {purchase_amount} KGS)"
            if max_spend > 0
            else "Бонусов для списания недостаточно"
        ),
    }


# ═══════════════════════════════════════════
# 7. DEBT UPDATE — обновление задолженности из 1С
# ═══════════════════════════════════════════

@router.post("/1c/debt-update", status_code=201)
async def webhook_1c_debt_update(
    body: Webhook1CDebtUpdateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    x_signature: str = Header(None, alias="X-Signature"),
) -> dict:
    """
    **Обновление задолженности клиента из 1С.**

    Каждое обновление сохраняется как отдельная запись (история задолженности).
    Личный кабинет показывает самую свежую запись.

    Если `amount = 0` — это означает, что долг погашен.
    """
    await _security_check(request, x_signature, db)

    phone = normalize_phone(body.phone)
    customer = await _get_customer_or_404(phone, db)

    debt = CustomerDebt(
        customer_id=customer.id,
        amount=body.amount,
        source="1c",
        reference=body.reference,
        note=body.note,
    )
    db.add(debt)
    await db.commit()

    return {
        "success": True,
        "event": "debt_update",
        "customer_id": str(customer.id),
        "customer_name": customer.full_name,
        "debt_amount": float(body.amount),
        "reference": body.reference,
    }


# ═══════════════════════════════════════════
# 8. PRODUCTS SYNC — синхронизация товаров из 1С
# ═══════════════════════════════════════════

@router.post("/1c/products-sync", status_code=201)
async def webhook_1c_products_sync(
    body: Webhook1CProductsSyncRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    x_signature: str = Header(None, alias="X-Signature"),
) -> dict:
    """
    **Пакетная синхронизация товаров из 1С.**

    1С отправляет полный список товаров (до 5000 за раз).
    Если товар с таким SKU уже есть — обновляется, если нет — создаётся.

    Рекомендуется вызывать ежедневно или при изменении каталога.
    """
    await _security_check(request, x_signature, db)

    from datetime import datetime as dt, timezone

    created = 0
    updated = 0
    now = dt.now(timezone.utc)

    for item in body.products:
        result = await db.execute(
            select(Product).where(Product.sku == item.sku)
        )
        product = result.scalar_one_or_none()

        if product:
            # Обновить существующий товар
            product.name = item.name
            product.category = item.category
            product.barcode = item.barcode
            product.unit = item.unit
            product.price = item.price
            product.cost_price = item.cost_price
            product.current_stock = item.current_stock
            product.min_stock_level = item.min_stock_level
            product.supplier = item.supplier
            product.last_synced_at = now
            product.is_active = True
            updated += 1
        else:
            # Создать новый товар
            product = Product(
                sku=item.sku,
                name=item.name,
                category=item.category,
                barcode=item.barcode,
                unit=item.unit,
                price=item.price,
                cost_price=item.cost_price,
                current_stock=item.current_stock,
                min_stock_level=item.min_stock_level,
                supplier=item.supplier,
                last_synced_at=now,
            )
            db.add(product)
            created += 1

    await db.commit()

    # Подсчёт товаров с низким остатком
    low_stock_result = await db.execute(
        select(func.count()).select_from(Product).where(
            Product.is_active == True,
            Product.current_stock <= Product.min_stock_level,
            Product.current_stock > 0,
        )
    )
    low_stock_count = low_stock_result.scalar() or 0

    out_of_stock_result = await db.execute(
        select(func.count()).select_from(Product).where(
            Product.is_active == True,
            Product.current_stock <= 0,
        )
    )
    out_of_stock_count = out_of_stock_result.scalar() or 0

    return {
        "success": True,
        "event": "products_sync",
        "created": created,
        "updated": updated,
        "total_processed": len(body.products),
        "low_stock_count": low_stock_count,
        "out_of_stock_count": out_of_stock_count,
        "message": f"Синхронизация завершена: {created} новых, {updated} обновлённых товаров",
    }


# ═══════════════════════════════════════════
# 9. STOCK UPDATE — пакетное обновление остатков
# ═══════════════════════════════════════════

@router.post("/1c/stock-update", status_code=201)
async def webhook_1c_stock_update(
    body: Webhook1CStockUpdateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    x_signature: str = Header(None, alias="X-Signature"),
) -> dict:
    """
    **Пакетное обновление остатков из 1С.**

    Быстрый endpoint для обновления только остатков (без каталога).
    Используется при инвентаризации или после закрытия смены.
    """
    await _security_check(request, x_signature, db)

    from datetime import datetime as dt, timezone
    now = dt.now(timezone.utc)

    updated = 0
    not_found_skus = []

    for item in body.items:
        result = await db.execute(
            select(Product).where(Product.sku == item.sku)
        )
        product = result.scalar_one_or_none()

        if product:
            product.current_stock = item.current_stock
            product.last_synced_at = now
            updated += 1
        else:
            not_found_skus.append(item.sku)

    await db.commit()

    return {
        "success": True,
        "event": "stock_update",
        "updated": updated,
        "not_found": len(not_found_skus),
        "not_found_skus": not_found_skus[:20],  # Максимум 20 SKU в ответе
        "message": f"Остатки обновлены: {updated} товаров",
    }


# ═══════════════════════════════════════════
# 10. GREEN API — входящие WhatsApp
# ═══════════════════════════════════════════

@router.post("/greenapi")
async def webhook_greenapi(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    **Входящие сообщения Green API (WhatsApp).**

    Команды клиента в WhatsApp:
    - «БАЛАНС» — получить текущий бонусный баланс
    - «ПОМОЩЬ» — список доступных команд
    """
    # Rate limit по IP: 30 запросов в минуту (защита от спама)
    from app.core.redis import check_rate_limit
    client_ip = request.client.host if request.client else "0.0.0.0"
    if not await check_rate_limit(f"greenapi:{client_ip}", max_attempts=30, window_seconds=60):
        return {"success": False, "error": "rate_limit"}

    try:
        body = await request.json()
    except Exception:
        return {"success": False}

    if body.get("typeWebhook") != "incomingMessageReceived":
        return {"success": True}

    message_data = body.get("messageData", {})
    if message_data.get("typeMessage") != "textMessage":
        return {"success": True}

    text = message_data.get("textMessageData", {}).get("textMessage", "").strip().upper()
    sender = body.get("senderData", {}).get("sender", "")
    phone = "+" + sender.split("@")[0] if "@" in sender else sender

    # Загружаем настройки WhatsApp
    from app.models import Setting
    from app.services.whatsapp import send_whatsapp_message

    settings_result = await db.execute(
        select(Setting).where(Setting.key.in_([
            "GREENAPI_INSTANCE_ID", "GREENAPI_API_TOKEN", "ENABLE_WHATSAPP_NOTIFICATIONS"
        ]))
    )
    cfg = {s.key: s.value for s in settings_result.scalars().all()}

    if cfg.get("ENABLE_WHATSAPP_NOTIFICATIONS") != "true":
        return {"success": True}

    instance_id = cfg.get("GREENAPI_INSTANCE_ID")
    api_token = cfg.get("GREENAPI_API_TOKEN")
    if not instance_id or not api_token:
        return {"success": True}

    # ── Обработка команд ──────────────────
    reply = None

    if "БАЛАНС" in text or "BALANCE" in text:
        result = await db.execute(
            select(Customer).options(selectinload(Customer.tier)).where(Customer.phone == phone)
        )
        customer = result.scalar_one_or_none()

        if customer:
            acc = await db.execute(select(BonusAccount).where(BonusAccount.customer_id == customer.id))
            account = acc.scalar_one_or_none()
            balance = account.balance if account else 0
            tier_name = customer.tier.name if customer.tier else "Bronze"
            reply = (
                f"💳 *S Bonus — Ваш баланс*\n\n"
                f"👤 {customer.full_name}\n"
                f"🏆 Уровень: {tier_name}\n"
                f"💰 Баланс: *{balance} KGS*\n\n"
                f"Чтобы узнать историю — обратитесь к кассиру."
            )
        else:
            reply = (
                f"❌ Номер {phone} не найден в S Bonus.\n"
                f"Зарегистрируйтесь у кассира магазина Смарт Центр."
            )

    elif "ПОМОЩЬ" in text or "HELP" in text or "COMMANDS" in text:
        reply = (
            "🤖 *S Bonus — Команды WhatsApp*\n\n"
            "📋 Доступные команды:\n"
            "• *БАЛАНС* — узнать бонусный баланс\n"
            "• *ПОМОЩЬ* — список команд\n\n"
            "📍 Смарт Центр, ул. Ош-3000, 86\n"
            "📞 +996557100505"
        )

    if reply:
        import asyncio
        asyncio.create_task(send_whatsapp_message(
            phone=phone,
            message=reply,
            instance_id=instance_id,
            api_token=api_token,
        ))

    return {"success": True}
