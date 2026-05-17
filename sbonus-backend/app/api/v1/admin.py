"""
Sbonus+ — Админ-панель API.
GET  /api/v1/admin/dashboard/stats
POST /api/v1/admin/tiers
POST /api/v1/admin/promo-codes
GET  /api/v1/admin/reports/export
POST /api/v1/admin/cashiers
GET  /api/v1/admin/audit-logs
"""

import io
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import UserRole, hash_password, require_role, get_current_user
from app.models import (
    AuditLog,
    BonusAccount,
    Customer,
    PromoCode,
    Tier,
    Transaction,
    User,
    UserRoleEnum,
)
from app.schemas import (
    DashboardStatsResponse,
    PromoCodeCreateRequest,
    CashierCreateRequest,
    SuccessResponse,
    TierCreateRequest,
    SettingsUpdateRequest,
    AdminCustomerUpdateRequest,
    AdminCashierUpdateRequest,
    AdminBonusAdjustmentRequest,
    BonusResult,
)
from app.models import Setting
from app.services.whatsapp import send_whatsapp_message
from app.services.bonus import BonusService

router = APIRouter(prefix="/admin", tags=["Админ-панель"])


@router.get(
    "/dashboard/stats",
    response_model=DashboardStatsResponse,
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN))],
)
async def dashboard_stats(db: AsyncSession = Depends(get_db)) -> DashboardStatsResponse:
    """Общая статистика дашборда (KGS, клиенты, бонусы)."""
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    # Клиенты
    total_customers = (await db.execute(select(func.count()).select_from(Customer))).scalar() or 0
    active_customers = (await db.execute(
        select(func.count()).select_from(Customer).where(Customer.is_active == True)
    )).scalar() or 0

    # Бонусы
    total_earned = (await db.execute(
        select(func.coalesce(func.sum(BonusAccount.total_earned), 0))
    )).scalar() or 0
    total_spent = (await db.execute(
        select(func.coalesce(func.sum(BonusAccount.total_spent), 0))
    )).scalar() or 0
    total_balance = (await db.execute(
        select(func.coalesce(func.sum(BonusAccount.balance), 0))
    )).scalar() or 0

    # Транзакции
    txn_today = (await db.execute(
        select(func.count()).select_from(Transaction).where(Transaction.created_at >= today_start)
    )).scalar() or 0
    txn_month = (await db.execute(
        select(func.count()).select_from(Transaction).where(Transaction.created_at >= month_start)
    )).scalar() or 0

    # Распределение по уровням
    tier_dist_q = await db.execute(
        select(Tier.name, func.count(Customer.id))
        .outerjoin(Customer, Customer.tier_id == Tier.id)
        .group_by(Tier.name)
    )
    tier_distribution = {name: count for name, count in tier_dist_q.all()}

    return DashboardStatsResponse(
        total_customers=total_customers,
        active_customers=active_customers,
        total_bonus_issued=Decimal(str(total_earned)),
        total_bonus_spent=Decimal(str(total_spent)),
        total_balance=Decimal(str(total_balance)),
        transactions_today=txn_today,
        transactions_month=txn_month,
        tier_distribution=tier_distribution,
    )


@router.get(
    "/tiers",
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN))],
)
async def get_tiers(db: AsyncSession = Depends(get_db)):
    """Список всех уровней бонусной программы."""
    result = await db.execute(select(Tier).where(Tier.is_active == True).order_by(Tier.sort_order.asc()))
    tiers = result.scalars().all()
    return [
        {
            "id": str(t.id),
            "name": t.name,
            "min_total_kgs": float(t.min_total_kgs),
            "bonus_percent": float(t.bonus_percent),
            "max_spend_pct": float(t.max_spend_pct),
            "sort_order": t.sort_order,
        }
        for t in tiers
    ]


@router.post(
    "/tiers",
    response_model=SuccessResponse,
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN))],
)
async def create_or_update_tier(
    body: TierCreateRequest,
    db: AsyncSession = Depends(get_db),
) -> SuccessResponse:
    """Добавить или обновить уровень бонусной программы."""
    result = await db.execute(select(Tier).where(Tier.name == body.name))
    existing = result.scalar_one_or_none()

    if existing:
        existing.min_total_kgs = body.min_total_kgs
        existing.bonus_percent = body.bonus_percent
        existing.max_spend_pct = body.max_spend_pct
        return SuccessResponse(message=f"Уровень '{body.name}' обновлён")
    else:
        max_order = (await db.execute(select(func.max(Tier.sort_order)))).scalar() or 0
        tier = Tier(
            name=body.name,
            min_total_kgs=body.min_total_kgs,
            bonus_percent=body.bonus_percent,
            max_spend_pct=body.max_spend_pct,
            sort_order=max_order + 1,
        )
        db.add(tier)
        return SuccessResponse(message=f"Уровень '{body.name}' создан")


@router.get(
    "/promo-codes",
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN))],
)
async def get_promo_codes(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    """Список промокодов с пагинацией."""
    total = (await db.execute(select(func.count()).select_from(PromoCode))).scalar() or 0
    result = await db.execute(
        select(PromoCode).order_by(PromoCode.created_at.desc()).offset((page - 1) * limit).limit(limit)
    )
    promos = result.scalars().all()
    return {
        "items": [
            {
                "id": str(p.id),
                "code": p.code,
                "bonus_amount": float(p.bonus_amount),
                "max_uses": p.max_uses,
                "used_count": p.used_count,
                "expires_at": p.expires_at.isoformat() if p.expires_at else None,
                "is_active": p.is_active,
                "created_at": p.created_at.isoformat(),
            }
            for p in promos
        ],
        "total": total,
        "page": page,
        "limit": limit,
    }


@router.post(
    "/promo-codes",
    response_model=SuccessResponse,
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN))],
)
async def create_promo_code(
    body: PromoCodeCreateRequest,
    db: AsyncSession = Depends(get_db),
) -> SuccessResponse:
    """Создать промокод (сумма, срок, лимит)."""
    existing = await db.execute(select(PromoCode).where(PromoCode.code == body.code))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail={"code": "PROMO_CODE_EXISTS", "message": "Промокод уже существует"})

    promo = PromoCode(
        code=body.code.upper(),
        bonus_amount=body.bonus_amount,
        max_uses=body.max_uses,
        expires_at=body.expires_at,
    )
    db.add(promo)
    return SuccessResponse(message=f"Промокод '{body.code}' создан: +{body.bonus_amount} KGS")


@router.get(
    "/branches",
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN))],
)
async def get_branches(db: AsyncSession = Depends(get_db)):
    """Получить список филиалов."""
    from app.models import Branch
    result = await db.execute(select(Branch).order_by(Branch.created_at.asc()))
    branches = result.scalars().all()
    return [
        {
            "id": str(b.id),
            "name": b.name,
            "address": b.address,
            "city": b.city,
            "phone": b.phone,
            "is_active": b.is_active,
            "created_at": b.created_at.isoformat(),
        }
        for b in branches
    ]


@router.post(
    "/branches",
    response_model=SuccessResponse,
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN))],
)
async def create_branch(
    name: str = Query(..., min_length=2, max_length=100),
    address: str = Query(None),
    city: str = Query(None),
    phone: str = Query(None),
    db: AsyncSession = Depends(get_db),
) -> SuccessResponse:
    """Добавить новый филиал."""
    from app.models import Branch
    branch = Branch(name=name, address=address, city=city, phone=phone)
    db.add(branch)
    await db.flush()
    return SuccessResponse(message=f"Филиал '{name}' добавлен")


@router.get(
    "/cashiers",
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN))],
)
async def get_cashiers(db: AsyncSession = Depends(get_db)):
    """Список всех кассиров."""
    from app.models import Branch
    result = await db.execute(
        select(User, Branch)
        .outerjoin(Branch, User.branch_id == Branch.id)
        .where(User.role == UserRoleEnum.CASHIER)
        .order_by(User.created_at.desc())
    )
    rows = result.all()
    return [
        {
            "id": str(u.id),
            "full_name": u.full_name,
            "phone": u.phone,
            "branch_id": str(u.branch_id) if u.branch_id else None,
            "branch_name": b.name if b else "—",
            "is_active": u.is_active,
            "created_at": u.created_at.isoformat(),
        }
        for u, b in rows
    ]


@router.post(
    "/cashiers",
    response_model=SuccessResponse,
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN))],
)
async def create_cashier(
    body: CashierCreateRequest,
    db: AsyncSession = Depends(get_db),
) -> SuccessResponse:
    """Добавить кассира (имя, телефон, PIN, филиал)."""
    existing = await db.execute(select(User).where(User.phone == body.phone))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail={"message": "Кассир с таким телефоном уже существует"})

    cashier = User(
        phone=body.phone,
        full_name=body.full_name,
        role=UserRoleEnum.CASHIER,
        branch_id=body.branch_id,
        pin_hash=hash_password(body.pin),
    )
    db.add(cashier)
    await db.commit()
    return SuccessResponse(message=f"Кассир '{body.full_name}' добавлен")


@router.patch(
    "/cashiers/{cashier_id}",
    response_model=SuccessResponse,
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN))],
)
async def update_cashier(
    cashier_id: uuid.UUID,
    body: AdminCashierUpdateRequest,
    db: AsyncSession = Depends(get_db),
) -> SuccessResponse:
    """Обновить кассира (блокировка, переименование, сброс PIN, перевод в другой филиал)."""
    result = await db.execute(
        select(User).where(User.id == cashier_id, User.role == UserRoleEnum.CASHIER)
    )
    cashier = result.scalar_one_or_none()
    if not cashier:
        raise HTTPException(status_code=404, detail={"message": "Кассир не найден"})

    if body.full_name is not None:
        cashier.full_name = body.full_name
    if body.branch_id is not None:
        cashier.branch_id = body.branch_id
    if body.is_active is not None:
        cashier.is_active = body.is_active
    if body.pin is not None:
        cashier.pin_hash = hash_password(body.pin)

    await db.commit()
    return SuccessResponse(message="Данные кассира обновлены")


@router.get(
    "/reports/export",
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN))],
)
async def export_report(
    format: str = Query("csv", regex="^(csv|xlsx)$"),
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """Скачать отчёт по транзакциям в CSV или Excel."""
    since = datetime.now(timezone.utc) - timedelta(days=days)

    result = await db.execute(
        select(Transaction)
        .where(Transaction.created_at >= since)
        .order_by(Transaction.created_at.desc())
    )
    txns = result.scalars().all()

    if format == "csv":
        lines = ["id,customer_id,type,amount,purchase_amount,receipt_number,created_at"]
        for t in txns:
            lines.append(
                f"{t.id},{t.customer_id},{t.type.value},{t.amount},"
                f"{t.purchase_amount or ''},{t.receipt_number or ''},{t.created_at.isoformat()}"
            )
        content = "\n".join(lines)
        return StreamingResponse(
            io.BytesIO(content.encode("utf-8")),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=sbonus_report_{days}d.csv"},
        )
    else:
        # Excel export
        import openpyxl
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Транзакции"
        ws.append(["ID", "Клиент", "Тип", "Сумма", "Покупка", "Чек", "Дата"])
        for t in txns:
            ws.append([str(t.id), str(t.customer_id), t.type.value,
                       float(t.amount), float(t.purchase_amount) if t.purchase_amount else None,
                       t.receipt_number, t.created_at.isoformat()])
        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)
        return StreamingResponse(
            buf,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename=sbonus_report_{days}d.xlsx"},
        )


@router.get(
    "/customers",
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN))],
)
async def get_customers(
    search: str = Query("", max_length=50),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """Список всех клиентов с пагинацией и поиском."""
    from sqlalchemy import func
    from app.models import BonusAccount, Customer, Tier
    
    query = select(Customer).outerjoin(BonusAccount).outerjoin(Tier)
    
    if search:
        search_term = f"%{search}%"
        query = query.where(
            (Customer.phone.ilike(search_term)) |
            (Customer.full_name.ilike(search_term))
        )
        
    # Count total
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar() or 0
    
    # Fetch data
    offset = (page - 1) * limit
    stmt = (
        select(Customer, BonusAccount, Tier)
        .outerjoin(BonusAccount, Customer.id == BonusAccount.customer_id)
        .outerjoin(Tier, Customer.tier_id == Tier.id)
        .order_by(Customer.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    result = await db.execute(stmt)
    rows = result.all()
    
    items = []
    for customer, account, tier in rows:
        items.append({
            "id": str(customer.id),
            "full_name": customer.full_name,
            "phone": customer.phone,
            "tier_name": tier.name if tier else "Bronze",
            "balance": float(account.balance) if account else 0.0,
            "is_active": customer.is_active,
            "created_at": customer.created_at.isoformat()
        })
        
    return {
        "items": items,
        "total": total,
        "page": page,
        "limit": limit
    }

@router.put(
    "/customers/{id}",
    response_model=SuccessResponse,
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN))],
)
async def update_customer(
    id: uuid.UUID,
    body: AdminCustomerUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Обновить данные клиента."""
    from app.models import Customer
    stmt = select(Customer).where(Customer.id == id)
    customer = (await db.execute(stmt)).scalar_one_or_none()
    if not customer:
        raise HTTPException(status_code=404, detail={"message": "Клиент не найден"})

    if body.full_name is not None: customer.full_name = body.full_name
    if body.phone is not None: customer.phone = body.phone
    if body.birth_date is not None: customer.birth_date = body.birth_date
    if body.is_active is not None: customer.is_active = body.is_active

    await db.commit()
    return SuccessResponse(message="Данные клиента обновлены")

@router.post(
    "/customers/{id}/bonus/earn",
    response_model=BonusResult,
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN))],
)
async def earn_admin(
    id: uuid.UUID,
    body: AdminBonusAdjustmentRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Ручное начисление бонуса."""
    from app.models import TransactionType
    svc = BonusService(db)
    res = await svc.admin_adjustment(
        customer_id=id,
        type=TransactionType.EARN,
        amount=body.amount,
        admin_id=uuid.UUID(current_user["sub"]),
        note=body.note
    )
    await db.commit()
    return res

@router.post(
    "/customers/{id}/bonus/spend",
    response_model=BonusResult,
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN))],
)
async def spend_admin(
    id: uuid.UUID,
    body: AdminBonusAdjustmentRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Ручное списание бонуса."""
    from app.models import TransactionType
    svc = BonusService(db)
    res = await svc.admin_adjustment(
        customer_id=id,
        type=TransactionType.SPEND,
        amount=body.amount,
        admin_id=uuid.UUID(current_user["sub"]),
        note=body.note
    )
    await db.commit()
    return res

@router.get(
    "/transactions",
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN))],
)
async def get_all_transactions(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    tx_type: str = Query(None, description="Фильтр по типу: earn/spend/referral/birthday/promo"),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Все транзакции системы с пагинацией и фильтром по типу."""
    from app.models import Branch, User as UserModel
    from sqlalchemy.orm import selectinload

    query = (
        select(Transaction, Customer, UserModel, Branch)
        .outerjoin(Customer, Transaction.customer_id == Customer.id)
        .outerjoin(UserModel, Transaction.cashier_id == UserModel.id)
        .outerjoin(Branch, Transaction.branch_id == Branch.id)
    )
    if tx_type:
        from app.models import TransactionType
        try:
            query = query.where(Transaction.type == TransactionType(tx_type))
        except ValueError:
            pass

    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    result = await db.execute(
        query.order_by(Transaction.created_at.desc())
        .offset((page - 1) * per_page).limit(per_page)
    )
    rows = result.all()

    return {
        "items": [
            {
                "id": str(t.id),
                "type": t.type.value,
                "amount": float(t.amount),
                "purchase_amount": float(t.purchase_amount) if t.purchase_amount else None,
                "receipt_number": t.receipt_number,
                "note": t.note,
                "customer_name": c.full_name if c else "—",
                "customer_phone": c.phone if c else "—",
                "cashier_name": u.full_name if u else "—",
                "branch_name": b.name if b else "—",
                "created_at": t.created_at.isoformat(),
            }
            for t, c, u, b in rows
        ],
        "total": total,
        "page": page,
        "per_page": per_page,
    }


@router.get(
    "/audit-logs",
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN))],
)
async def get_audit_logs(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    action: str = Query(None),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Журнал аудита с фильтрами и пагинацией."""
    query = select(AuditLog)
    if action:
        query = query.where(AuditLog.action == action)

    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    result = await db.execute(
        query.order_by(AuditLog.created_at.desc())
        .offset((page - 1) * per_page).limit(per_page)
    )
    logs = result.scalars().all()

    return {
        "items": [
            {
                "id": str(l.id), "user_id": str(l.user_id) if l.user_id else None,
                "action": l.action, "entity_type": l.entity_type,
                "entity_id": str(l.entity_id) if l.entity_id else None,
                "details": l.details, "ip_address": l.ip_address,
                "created_at": l.created_at.isoformat(),
            }
            for l in logs
        ],
        "total": total, "page": page, "per_page": per_page,
    }


@router.get(
    "/settings",
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN))],
)
async def get_settings(db: AsyncSession = Depends(get_db)):
    """Получить глобальные настройки."""
    result = await db.execute(select(Setting))
    settings = result.scalars().all()
    return {s.key: s.value for s in settings}


@router.post(
    "/settings",
    response_model=SuccessResponse,
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN))],
)
async def update_settings(
    body: SettingsUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Обновить глобальные настройки."""
    updates = body.dict()
    for key, value in updates.items():
        result = await db.execute(select(Setting).where(Setting.key == key))
        setting = result.scalar_one_or_none()
        if setting:
            setting.value = str(value)
        else:
            db.add(Setting(key=key, value=str(value)))

    await db.commit()
    return SuccessResponse(message="Настройки успешно сохранены")


@router.post(
    "/settings/test-whatsapp",
    response_model=SuccessResponse,
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN))],
)
async def test_whatsapp(
    phone: str = Query(..., description="Номер телефона в международном формате, например 996557100505"),
    db: AsyncSession = Depends(get_db)
):
    """Отправить тестовое сообщение в WhatsApp."""
    # Получаем настройки
    result = await db.execute(select(Setting).where(Setting.key.in_(["GREENAPI_INSTANCE_ID", "GREENAPI_API_TOKEN", "ENABLE_WHATSAPP_NOTIFICATIONS"])))
    settings_dict = {s.key: s.value for s in result.scalars().all()}
    
    if settings_dict.get("ENABLE_WHATSAPP_NOTIFICATIONS") != "true":
        raise HTTPException(status_code=400, detail={"message": "Уведомления WhatsApp отключены в настройках"})
        
    instance_id = settings_dict.get("GREENAPI_INSTANCE_ID")
    api_token = settings_dict.get("GREENAPI_API_TOKEN")
    
    if not instance_id or not api_token:
        raise HTTPException(status_code=400, detail={"message": "Учетные данные Green API не настроены"})
        
    success = await send_whatsapp_message(
        phone=phone,
        message="✅ Тестовое сообщение от S Bonus+!\nИнтеграция работает успешно.",
        instance_id=instance_id,
        api_token=api_token
    )
    
    if success:
        return SuccessResponse(message="Тестовое сообщение отправлено")
    else:
        raise HTTPException(status_code=500, detail={"message": "Не удалось отправить сообщение. Проверьте консоль для деталей."})

