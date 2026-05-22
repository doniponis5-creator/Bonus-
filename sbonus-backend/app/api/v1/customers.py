"""
Sbonus+ — API маршруты клиентов.
POST   /api/v1/customers/register
GET    /api/v1/customers/search?q=...
GET    /api/v1/customers/by-phone/{phone}
GET    /api/v1/customers/by-qr/{qr_code}
GET    /api/v1/customers/{id}/balance
GET    /api/v1/customers/{id}/transactions
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.redis import check_rate_limit
from app.core.security import UserRole, get_current_user, require_role
from app.models import BonusAccount, Customer, Tier, Transaction
from app.schemas import BalanceResponse, CustomerRegisterRequest, CustomerResponse
from app.utils import normalize_phone

router = APIRouter(prefix="/customers", tags=["Клиенты"])


def _generate_qr() -> str:
    """Генерация уникального QR кода."""
    return f"SB-{uuid.uuid4().hex[:10].upper()}"


def _generate_referral() -> str:
    """Генерация уникального реферального кода."""
    return f"REF-{uuid.uuid4().hex[:8].upper()}"



@router.post("/register", response_model=CustomerResponse, status_code=201)
async def register_customer(
    body: CustomerRegisterRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> CustomerResponse:
    """Регистрация нового клиента в бонусной программе."""
    normalized_phone = normalize_phone(body.phone)
    # Проверка дубликата телефона
    existing = await db.execute(select(Customer).where(Customer.phone == normalized_phone))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "CUSTOMER_PHONE_EXISTS", "message": "Номер телефона уже зарегистрирован"},
        )

    # Дефолтный tier (Bronze)
    tier_result = await db.execute(select(Tier).order_by(Tier.sort_order.asc()).limit(1))
    default_tier = tier_result.scalar_one_or_none()

    customer = Customer(
        phone=normalized_phone,
        full_name=body.full_name,
        qr_code=_generate_qr(),
        birth_date=body.birth_date,
        tier_id=default_tier.id if default_tier else None,
        referral_code=_generate_referral(),
        referred_by=None,  # apply_referral() sets this
    )
    db.add(customer)
    await db.flush()

    # Создаём бонусный счёт
    account = BonusAccount(customer_id=customer.id)
    db.add(account)
    await db.flush()

    # Автоматическое начисление реферального бонуса обеим сторонам
    if body.referred_by_code:
        try:
            from app.services.bonus import BonusService
            svc = BonusService(db)
            await svc.apply_referral(customer.id, body.referred_by_code)
        except Exception:
            pass  # Реферал необязателен — не блокируем регистрацию

    return CustomerResponse(
        id=customer.id,
        phone=customer.phone,
        full_name=customer.full_name,
        qr_code=customer.qr_code,
        birth_date=customer.birth_date,
        tier_name=default_tier.name if default_tier else "Bronze",
        tier_percent=default_tier.bonus_percent if default_tier else 3,
        referral_code=customer.referral_code,
        is_active=customer.is_active,
        created_at=customer.created_at,
    )


@router.get("/referrer-name/{referral_code}")
async def get_referrer_name(
    referral_code: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Публичный эндпоинт: получить имя пригласившего по реферальному коду (для /register страницы)."""
    ip = request.client.host if request.client else "unknown"
    if not await check_rate_limit(f"referrer_name:{ip}", max_attempts=10, window_seconds=60):
        raise HTTPException(status_code=429, detail={"message": "Слишком много запросов"})

    result = await db.execute(
        select(Customer.full_name).where(Customer.referral_code == referral_code.strip().upper())
    )
    name = result.scalar_one_or_none()
    if not name:
        raise HTTPException(status_code=404, detail={"message": "Код не найден"})
    # Маскируем: "Алишер Каримов" → "Ал*** Ка***"
    parts = name.split()
    masked = " ".join(p[:2] + "***" if len(p) > 2 else p[0] + "**" for p in parts)
    return {"name": masked}


@router.get("/search", response_model=list[CustomerResponse])
async def search_customers(
    q: str = Query(..., min_length=2, max_length=50),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> list[CustomerResponse]:
    """Умный поиск клиента по ФИО, телефону или QR коду."""
    term = q.strip()
    search_pattern = f"%{term}%"

    query = (
        select(Customer)
        .options(selectinload(Customer.tier))
        .where(
            Customer.is_active == True,
            or_(
                Customer.full_name.ilike(search_pattern),
                Customer.phone.ilike(search_pattern),
                Customer.qr_code.ilike(search_pattern),
            ),
        )
        .order_by(Customer.full_name.asc())
        .limit(10)
    )
    result = await db.execute(query)
    customers = result.scalars().all()

    return [
        CustomerResponse(
            id=c.id, phone=c.phone, full_name=c.full_name,
            qr_code=c.qr_code, birth_date=c.birth_date,
            tier_name=c.tier.name if c.tier else None,
            tier_percent=c.tier.bonus_percent if c.tier else None,
            referral_code=c.referral_code, is_active=c.is_active,
            created_at=c.created_at,
        )
        for c in customers
    ]


@router.get("/by-phone/{phone}", response_model=CustomerResponse)
async def get_by_phone(
    phone: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> CustomerResponse:
    """Поиск клиента по номеру телефона."""
    normalized_phone = normalize_phone(phone)
    result = await db.execute(
        select(Customer).options(selectinload(Customer.tier)).where(Customer.phone == normalized_phone)
    )
    customer = result.scalar_one_or_none()
    if not customer:
        raise HTTPException(status_code=404, detail={"code": "CUSTOMER_NOT_FOUND", "message": "Клиент не найден"})

    return CustomerResponse(
        id=customer.id, phone=customer.phone, full_name=customer.full_name,
        qr_code=customer.qr_code, birth_date=customer.birth_date,
        tier_name=customer.tier.name if customer.tier else None,
        tier_percent=customer.tier.bonus_percent if customer.tier else None,
        referral_code=customer.referral_code, is_active=customer.is_active,
        created_at=customer.created_at,
    )


@router.get("/by-qr/{qr_code}", response_model=CustomerResponse)
async def get_by_qr(
    qr_code: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> CustomerResponse:
    """Поиск клиента по QR коду (кассир сканирует)."""
    result = await db.execute(
        select(Customer).options(selectinload(Customer.tier)).where(Customer.qr_code == qr_code)
    )
    customer = result.scalar_one_or_none()
    if not customer:
        raise HTTPException(status_code=404, detail={"code": "CUSTOMER_NOT_FOUND", "message": "Клиент не найден"})

    return CustomerResponse(
        id=customer.id, phone=customer.phone, full_name=customer.full_name,
        qr_code=customer.qr_code, birth_date=customer.birth_date,
        tier_name=customer.tier.name if customer.tier else None,
        tier_percent=customer.tier.bonus_percent if customer.tier else None,
        referral_code=customer.referral_code, is_active=customer.is_active,
        created_at=customer.created_at,
    )


@router.get("/{customer_id}/balance", response_model=BalanceResponse)
async def get_balance(
    customer_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> BalanceResponse:
    """Текущий бонусный баланс клиента."""
    result = await db.execute(
        select(Customer).options(
            selectinload(Customer.tier),
            selectinload(Customer.bonus_account),
        ).where(Customer.id == customer_id)
    )
    customer = result.scalar_one_or_none()
    if not customer:
        raise HTTPException(status_code=404, detail={"code": "CUSTOMER_NOT_FOUND"})

    account = customer.bonus_account
    tier = customer.tier

    # Следующий уровень
    next_tier = None
    next_remaining = None
    if tier and account:
        nt_result = await db.execute(
            select(Tier).where(Tier.min_total_kgs > tier.min_total_kgs, Tier.is_active == True)
            .order_by(Tier.min_total_kgs.asc()).limit(1)
        )
        next_tier_obj = nt_result.scalar_one_or_none()
        if next_tier_obj:
            next_tier = next_tier_obj.name
            next_remaining = max(next_tier_obj.min_total_kgs - account.total_earned, 0)

    return BalanceResponse(
        customer_id=customer.id,
        full_name=customer.full_name,
        phone=customer.phone,
        qr_code=customer.qr_code,
        balance=account.balance if account else 0,
        total_earned=account.total_earned if account else 0,
        total_spent=account.total_spent if account else 0,
        tier_name=tier.name if tier else "Bronze",
        tier_percent=tier.bonus_percent if tier else 3,
        next_tier_name=next_tier,
        next_tier_remaining=next_remaining,
    )


@router.get("/{customer_id}/transactions")
async def get_transactions(
    customer_id: uuid.UUID,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """История транзакций клиента с пагинацией."""
    offset = (page - 1) * per_page

    # Подсчёт
    count_q = await db.execute(
        select(func.count()).select_from(Transaction).where(Transaction.customer_id == customer_id)
    )
    total = count_q.scalar() or 0

    # Выборка
    result = await db.execute(
        select(Transaction)
        .where(Transaction.customer_id == customer_id)
        .order_by(Transaction.created_at.desc())
        .offset(offset).limit(per_page)
    )
    txns = result.scalars().all()

    items = [
        {
            "id": str(t.id), "type": t.type.value, "amount": float(t.amount),
            "purchase_amount": float(t.purchase_amount) if t.purchase_amount else None,
            "receipt_number": t.receipt_number, "note": t.note,
            "created_at": t.created_at.isoformat(),
        }
        for t in txns
    ]

    return {"items": items, "total": total, "page": page, "per_page": per_page}
