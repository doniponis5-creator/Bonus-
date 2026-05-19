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

from fastapi import APIRouter, Body, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import UserRole, hash_password, require_role, get_current_user, verify_password
from app.models import (
    AuditLog,
    BonusAccount,
    Coupon,
    Customer,
    PromoCode,
    ReviewRequest,
    ReviewStatus,
    Tier,
    Transaction,
    TransactionType,
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
from app.api.v1.wheel import DEFAULT_SEGMENTS

router = APIRouter(prefix="/admin", tags=["Админ-панель"])


# ═══════════════════════════════════════════
# PIN VERIFICATION (2FA)
# ═══════════════════════════════════════════

class VerifyPinRequest(BaseModel):
    pin: str


@router.post(
    "/verify-pin",
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN))],
)
async def verify_admin_pin(
    body: VerifyPinRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Проверка PIN-кода администратора для критических действий."""
    user = (await db.execute(
        select(User).where(User.id == current_user["sub"])
    )).scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail={"message": "Пользователь не найден"})

    # Check password_hash (admin uses password, not pin)
    if user.password_hash and verify_password(body.pin, user.password_hash):
        return {"verified": True, "message": "PIN подтверждён"}

    # Also check pin_hash if set
    if user.pin_hash and verify_password(body.pin, user.pin_hash):
        return {"verified": True, "message": "PIN подтверждён"}

    raise HTTPException(status_code=403, detail={"message": "Неверный PIN-код"})


@router.get(
    "/integration/1c-status",
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN))],
)
async def get_1c_status(
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Статус 1C интеграции: последние операции, ошибки, синхронизация."""
    from app.models import CustomerDebt

    # Check if 1C webhook enabled
    enabled_setting = (await db.execute(
        select(Setting).where(Setting.key == "ENABLE_1C_WEBHOOK")
    )).scalar_one_or_none()
    is_enabled = enabled_setting and enabled_setting.value == "true"

    # Last 1C transaction (with receipt_number)
    last_txn = (await db.execute(
        select(Transaction)
        .where(Transaction.receipt_number.isnot(None))
        .order_by(Transaction.created_at.desc())
        .limit(1)
    )).scalar_one_or_none()

    # Count 1C transactions today
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    txn_today = (await db.execute(
        select(func.count(Transaction.id))
        .where(Transaction.receipt_number.isnot(None), Transaction.created_at >= today_start)
    )).scalar() or 0

    # Last debt sync
    last_debt = (await db.execute(
        select(CustomerDebt).order_by(CustomerDebt.created_at.desc()).limit(1)
    )).scalar_one_or_none()

    # Total debts
    total_debts = (await db.execute(
        select(func.count(CustomerDebt.id))
    )).scalar() or 0

    return {
        "webhook_enabled": is_enabled,
        "last_transaction_at": last_txn.created_at.isoformat() if last_txn else None,
        "last_receipt": last_txn.receipt_number if last_txn else None,
        "transactions_today": txn_today,
        "last_debt_sync_at": last_debt.created_at.isoformat() if last_debt else None,
        "total_debt_records": total_debts,
    }


@router.get(
    "/dashboard/stats",
    response_model=DashboardStatsResponse,
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN))],
)
async def dashboard_stats(db: AsyncSession = Depends(get_db)) -> DashboardStatsResponse:
    """Общая статистика дашборда — оптимизированная версия."""
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    # Single query for all customer + bonus stats
    stats_q = await db.execute(
        select(
            func.count(Customer.id).label("total"),
            func.count(Customer.id).filter(Customer.is_active == True).label("active"),
            func.coalesce(func.sum(BonusAccount.total_earned), 0).label("earned"),
            func.coalesce(func.sum(BonusAccount.total_spent), 0).label("spent"),
            func.coalesce(func.sum(BonusAccount.balance), 0).label("balance"),
        ).outerjoin(BonusAccount, Customer.id == BonusAccount.customer_id)
    )
    row = stats_q.one()

    # Single query for transaction counts
    txn_q = await db.execute(
        select(
            func.count(Transaction.id).filter(Transaction.created_at >= today_start).label("today"),
            func.count(Transaction.id).filter(Transaction.created_at >= month_start).label("month"),
        )
    )
    txn_row = txn_q.one()

    # Распределение по уровням
    tier_dist_q = await db.execute(
        select(Tier.name, func.count(Customer.id))
        .outerjoin(Customer, Customer.tier_id == Tier.id)
        .group_by(Tier.name)
    )
    tier_distribution = {name: count for name, count in tier_dist_q.all()}

    return DashboardStatsResponse(
        total_customers=row.total,
        active_customers=row.active,
        total_bonus_issued=Decimal(str(row.earned)),
        total_bonus_spent=Decimal(str(row.spent)),
        total_balance=Decimal(str(row.balance)),
        transactions_today=txn_row.today,
        transactions_month=txn_row.month,
        tier_distribution=tier_distribution,
    )


@router.get(
    "/dashboard/trends",
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN))],
)
async def dashboard_trends(
    days: int = Query(30, ge=7, le=365),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Тренды для графиков: ежедневная статистика за указанный период.
    Возвращает массивы для recharts: earn/spend/customers по дням.
    """
    from app.models import TransactionType
    since = datetime.now(timezone.utc) - timedelta(days=days)

    # Ежедневные транзакции по типам
    daily_txn = await db.execute(
        select(
            func.date_trunc("day", Transaction.created_at).label("day"),
            Transaction.type,
            func.count(Transaction.id).label("count"),
            func.coalesce(func.sum(Transaction.amount), 0).label("total"),
        )
        .where(Transaction.created_at >= since)
        .group_by("day", Transaction.type)
        .order_by("day")
    )
    txn_rows = daily_txn.all()

    # Ежедневные новые клиенты
    daily_cust = await db.execute(
        select(
            func.date_trunc("day", Customer.created_at).label("day"),
            func.count(Customer.id).label("count"),
        )
        .where(Customer.created_at >= since)
        .group_by("day")
        .order_by("day")
    )
    cust_rows = daily_cust.all()

    # Собираем в dict по дням
    days_map: dict = {}
    for row in txn_rows:
        d = row.day.strftime("%Y-%m-%d")
        if d not in days_map:
            days_map[d] = {"date": d, "earn": 0, "spend": 0, "earn_count": 0, "spend_count": 0, "new_customers": 0}
        if row.type == TransactionType.EARN:
            days_map[d]["earn"] = float(row.total)
            days_map[d]["earn_count"] = row.count
        elif row.type == TransactionType.SPEND:
            days_map[d]["spend"] = float(row.total)
            days_map[d]["spend_count"] = row.count

    for row in cust_rows:
        d = row.day.strftime("%Y-%m-%d")
        if d not in days_map:
            days_map[d] = {"date": d, "earn": 0, "spend": 0, "earn_count": 0, "spend_count": 0, "new_customers": 0}
        days_map[d]["new_customers"] = row.count

    # Топ-5 клиентов по покупкам за период
    top_customers = await db.execute(
        select(
            Customer.full_name,
            Customer.phone,
            func.coalesce(func.sum(Transaction.purchase_amount), 0).label("total_purchase"),
            func.count(Transaction.id).label("txn_count"),
        )
        .join(Transaction, Transaction.customer_id == Customer.id)
        .where(
            Transaction.created_at >= since,
            Transaction.type == TransactionType.EARN,
        )
        .group_by(Customer.id, Customer.full_name, Customer.phone)
        .order_by(func.sum(Transaction.purchase_amount).desc())
        .limit(5)
    )
    top_rows = top_customers.all()

    # Средний чек за период
    avg_check = await db.execute(
        select(func.avg(Transaction.purchase_amount))
        .where(
            Transaction.created_at >= since,
            Transaction.type == TransactionType.EARN,
            Transaction.purchase_amount.isnot(None),
        )
    )
    avg_val = avg_check.scalar()

    return {
        "daily": sorted(days_map.values(), key=lambda x: x["date"]),
        "top_customers": [
            {
                "name": r.full_name,
                "phone": r.phone,
                "total_purchase": float(r.total_purchase),
                "transactions": r.txn_count,
            }
            for r in top_rows
        ],
        "average_check": round(float(avg_val), 2) if avg_val else 0,
        "period_days": days,
    }


@router.get(
    "/dashboard/notifications",
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN))],
)
async def dashboard_notifications(
    days: int = Query(7, ge=1, le=90),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Статистика уведомлений: отправлено, failed, retry."""
    from app.models import Notification, NotificationStatus

    since = datetime.now(timezone.utc) - timedelta(days=days)

    stats = await db.execute(
        select(
            Notification.status,
            func.count(Notification.id).label("count"),
        )
        .where(Notification.created_at >= since)
        .group_by(Notification.status)
    )
    status_map = {row.status.value: row.count for row in stats.all()}

    return {
        "sent": status_map.get("sent", 0),
        "failed": status_map.get("failed", 0),
        "pending": status_map.get("pending", 0),
        "total": sum(status_map.values()),
        "period_days": days,
    }


@router.get(
    "/dashboard/analytics",
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN))],
)
async def dashboard_analytics(
    days: int = Query(30, ge=7, le=365),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Детальная аналитика: по часам, retention, конверсия, сравнение периодов."""
    since = datetime.now(timezone.utc) - timedelta(days=days)
    prev_since = since - timedelta(days=days)

    # Выручка по часам (для текущего периода)
    hourly = await db.execute(
        select(
            func.extract("hour", Transaction.created_at).label("hour"),
            func.count(Transaction.id).label("count"),
            func.coalesce(func.sum(Transaction.purchase_amount), 0).label("revenue"),
        )
        .where(
            Transaction.created_at >= since,
            Transaction.type == TransactionType.EARN,
        )
        .group_by("hour")
        .order_by("hour")
    )
    hourly_data = [
        {"hour": int(r.hour), "count": r.count, "revenue": float(r.revenue)}
        for r in hourly.all()
    ]

    # Текущий vs предыдущий период
    curr_rev = (await db.execute(
        select(func.coalesce(func.sum(Transaction.purchase_amount), 0))
        .where(Transaction.created_at >= since, Transaction.type == TransactionType.EARN)
    )).scalar() or 0
    prev_rev = (await db.execute(
        select(func.coalesce(func.sum(Transaction.purchase_amount), 0))
        .where(
            Transaction.created_at >= prev_since,
            Transaction.created_at < since,
            Transaction.type == TransactionType.EARN,
        )
    )).scalar() or 0

    curr_customers = (await db.execute(
        select(func.count(Customer.id)).where(Customer.created_at >= since)
    )).scalar() or 0
    prev_customers = (await db.execute(
        select(func.count(Customer.id)).where(
            Customer.created_at >= prev_since, Customer.created_at < since
        )
    )).scalar() or 0

    # Retention: клиенты с >1 покупкой за период
    active_buyers = (await db.execute(
        select(func.count())
        .select_from(
            select(Transaction.customer_id)
            .where(Transaction.created_at >= since, Transaction.type == TransactionType.EARN)
            .group_by(Transaction.customer_id)
            .having(func.count(Transaction.id) > 1)
            .subquery()
        )
    )).scalar() or 0
    total_buyers = (await db.execute(
        select(func.count(func.distinct(Transaction.customer_id)))
        .where(Transaction.created_at >= since, Transaction.type == TransactionType.EARN)
    )).scalar() or 0

    # Распределение по типам транзакций
    type_dist = await db.execute(
        select(
            Transaction.type,
            func.count(Transaction.id).label("count"),
            func.coalesce(func.sum(Transaction.amount), 0).label("total"),
        )
        .where(Transaction.created_at >= since)
        .group_by(Transaction.type)
    )
    type_data = [
        {"type": r.type.value, "count": r.count, "total": float(r.total)}
        for r in type_dist.all()
    ]

    # Средний LTV (total_earned на клиента)
    avg_ltv = (await db.execute(
        select(func.avg(BonusAccount.total_earned))
    )).scalar() or 0

    return {
        "hourly_activity": hourly_data,
        "revenue_current": float(curr_rev),
        "revenue_previous": float(prev_rev),
        "revenue_change_pct": round((float(curr_rev) - float(prev_rev)) / float(prev_rev) * 100, 1) if prev_rev else 0,
        "new_customers_current": curr_customers,
        "new_customers_previous": prev_customers,
        "retention_rate": round(active_buyers / total_buyers * 100, 1) if total_buyers else 0,
        "repeat_buyers": active_buyers,
        "total_buyers": total_buyers,
        "transaction_types": type_data,
        "average_ltv": round(float(avg_ltv), 2),
        "period_days": days,
    }


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


class BranchCreateRequest(BaseModel):
    name: str
    address: str | None = None
    city: str | None = None
    phone: str | None = None


@router.post(
    "/branches",
    response_model=SuccessResponse,
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN))],
)
async def create_branch(
    body: BranchCreateRequest,
    db: AsyncSession = Depends(get_db),
) -> SuccessResponse:
    """Добавить новый филиал."""
    from app.models import Branch
    branch = Branch(name=body.name, address=body.address, city=body.city, phone=body.phone)
    db.add(branch)
    await db.flush()
    return SuccessResponse(message=f"Филиал '{body.name}' добавлен")


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
    """Скачать отчёт по транзакциям в CSV (стриминг) или Excel."""
    since = datetime.now(timezone.utc) - timedelta(days=days)

    if format == "csv":
        async def csv_generator():
            yield "id,customer_id,type,amount,purchase_amount,receipt_number,created_at\n"
            # Use server-side cursor with streaming to avoid loading all into memory
            result = await db.stream(
                select(Transaction)
                .where(Transaction.created_at >= since)
                .order_by(Transaction.created_at.desc())
            )
            async for t in result.scalars():
                yield (
                    f"{t.id},{t.customer_id},{t.type.value},{t.amount},"
                    f"{t.purchase_amount or ''},{t.receipt_number or ''},{t.created_at.isoformat()}\n"
                )
        return StreamingResponse(
            csv_generator(),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=sbonus_report_{days}d.csv"},
        )
    else:
        # Excel export — limited to 10 000 rows to prevent OOM
        import openpyxl
        result = await db.execute(
            select(Transaction)
            .where(Transaction.created_at >= since)
            .order_by(Transaction.created_at.desc())
            .limit(10000)
        )
        txns = result.scalars().all()

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
    tier_name: str = Query(None, description="Фильтр по уровню: Bronze/Silver/Gold/Platinum"),
    is_active: bool = Query(None, description="Фильтр по статусу: true/false"),
    min_balance: float = Query(None, ge=0, description="Минимальный баланс"),
    max_balance: float = Query(None, ge=0, description="Максимальный баланс"),
    sort_by: str = Query("created_at", description="Сортировка: created_at/balance/full_name"),
    sort_dir: str = Query("desc", description="Направление: asc/desc"),
    db: AsyncSession = Depends(get_db),
):
    """Список клиентов с сегментацией, пагинацией и фильтрами."""
    from sqlalchemy import func as sqlfunc
    from app.models import BonusAccount, Customer, Tier

    # Base query with joins
    stmt = (
        select(Customer, BonusAccount, Tier)
        .outerjoin(BonusAccount, Customer.id == BonusAccount.customer_id)
        .outerjoin(Tier, Customer.tier_id == Tier.id)
    )

    # Filters
    if search:
        search_term = f"%{search}%"
        stmt = stmt.where(
            (Customer.phone.ilike(search_term)) |
            (Customer.full_name.ilike(search_term))
        )
    if tier_name:
        stmt = stmt.where(Tier.name == tier_name)
    if is_active is not None:
        stmt = stmt.where(Customer.is_active == is_active)
    if min_balance is not None:
        stmt = stmt.where(BonusAccount.balance >= Decimal(str(min_balance)))
    if max_balance is not None:
        stmt = stmt.where(BonusAccount.balance <= Decimal(str(max_balance)))

    # Count
    count_sub = stmt.subquery()
    total = (await db.execute(select(sqlfunc.count()).select_from(count_sub))).scalar() or 0

    # Sort
    sort_map = {
        "created_at": Customer.created_at,
        "balance": BonusAccount.balance,
        "full_name": Customer.full_name,
    }
    sort_col = sort_map.get(sort_by, Customer.created_at)
    stmt = stmt.order_by(sort_col.desc() if sort_dir == "desc" else sort_col.asc())
    stmt = stmt.offset((page - 1) * limit).limit(limit)

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
            "total_earned": float(account.total_earned) if account else 0.0,
            "total_spent": float(account.total_spent) if account else 0.0,
            "is_active": customer.is_active,
            "created_at": customer.created_at.isoformat(),
        })

    return {
        "items": items,
        "total": total,
        "page": page,
        "limit": limit,
    }


class BulkBonusRequest(BaseModel):
    customer_ids: list[str]
    type: str  # "earn" or "spend"
    amount: Decimal
    note: str


@router.post(
    "/customers/bulk-bonus",
    response_model=SuccessResponse,
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN))],
)
async def bulk_bonus(
    body: BulkBonusRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> SuccessResponse:
    """Массовое начисление/списание бонусов для выбранных клиентов."""
    from app.models import TransactionType

    if body.type not in ("earn", "spend"):
        raise HTTPException(status_code=400, detail={"message": "Тип должен быть earn или spend"})
    if body.amount <= 0:
        raise HTTPException(status_code=400, detail={"message": "Сумма должна быть больше 0"})
    if not body.customer_ids:
        raise HTTPException(status_code=400, detail={"message": "Выберите клиентов"})

    tx_type = TransactionType.EARN if body.type == "earn" else TransactionType.SPEND
    admin_id = uuid.UUID(current_user["sub"])
    svc = BonusService(db)

    success = 0
    errors = []
    for cid in body.customer_ids:
        try:
            await svc.admin_adjustment(
                customer_id=uuid.UUID(cid),
                type=tx_type,
                amount=body.amount,
                admin_id=admin_id,
                note=f"[BULK] {body.note}",
            )
            success += 1
        except Exception as e:
            errors.append(f"{cid}: {str(e)[:100]}")

    await db.commit()
    msg = f"Обработано: {success}/{len(body.customer_ids)}"
    if errors:
        msg += f". Ошибки: {len(errors)}"
    return SuccessResponse(message=msg)

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

class TransactionReversalRequest(BaseModel):
    reason: str


@router.post(
    "/transactions/{txn_id}/reverse",
    response_model=SuccessResponse,
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN))],
)
async def reverse_transaction(
    txn_id: uuid.UUID,
    body: TransactionReversalRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> SuccessResponse:
    """
    Отмена транзакции (REFUND). Таблица transactions иммутабельна,
    поэтому создаём обратную REFUND транзакцию.
    Только EARN-type транзакции можно отменять.
    """
    from app.models import TransactionType, BonusAccount

    result = await db.execute(select(Transaction).where(Transaction.id == txn_id))
    txn = result.scalar_one_or_none()
    if not txn:
        raise HTTPException(status_code=404, detail={"message": "Транзакция не найдена"})

    # Проверяем что не REFUND и не SPEND (нельзя вернуть списание)
    if txn.type in (TransactionType.REFUND, TransactionType.EXPIRE):
        raise HTTPException(status_code=400, detail={"message": "Нельзя отменить REFUND/EXPIRE транзакцию"})

    # Проверяем что ещё не отменена
    existing_refund = await db.execute(
        select(Transaction).where(
            Transaction.customer_id == txn.customer_id,
            Transaction.type == TransactionType.REFUND,
            Transaction.note.contains(str(txn_id)),
        )
    )
    if existing_refund.scalar_one_or_none():
        raise HTTPException(status_code=400, detail={"message": "Эта транзакция уже была отменена"})

    # Получаем аккаунт
    acc_result = await db.execute(
        select(BonusAccount)
        .where(BonusAccount.customer_id == txn.customer_id)
        .with_for_update()
    )
    account = acc_result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=400, detail={"message": "Бонусный аккаунт не найден"})

    # Для EARN-type: списываем обратно
    is_earn_type = txn.type in (
        TransactionType.EARN, TransactionType.BIRTHDAY,
        TransactionType.REFERRAL, TransactionType.PROMO, TransactionType.CAMPAIGN,
    )

    if is_earn_type:
        if txn.amount > account.balance:
            raise HTTPException(
                status_code=400,
                detail={"message": f"Недостаточно бонусов для отмены. Баланс: {account.balance} KGS, нужно: {txn.amount} KGS"},
            )
        account.balance -= txn.amount
        account.total_earned -= txn.amount
    elif txn.type == TransactionType.SPEND:
        # Возврат списания — бонусы возвращаются
        account.balance += txn.amount
        account.total_spent -= txn.amount

    # Создаём REFUND
    refund = Transaction(
        customer_id=txn.customer_id,
        type=TransactionType.REFUND,
        amount=txn.amount,
        branch_id=txn.branch_id,
        cashier_id=uuid.UUID(current_user["sub"]),
        receipt_number=f"REFUND-{uuid.uuid4().hex[:10].upper()}",
        note=f"↩ Отмена #{str(txn_id)[:8]}... | {body.reason}",
    )
    db.add(refund)
    await db.commit()

    return SuccessResponse(
        message=f"Транзакция отменена. {'Списано' if is_earn_type else 'Возвращено'} {txn.amount} KGS"
    )


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
    """Получить глобальные настройки. Значение 'None' (из бага старых сохранений) → пустая строка."""
    result = await db.execute(select(Setting))
    settings = result.scalars().all()
    return {s.key: ("" if s.value == "None" else (s.value or "")) for s in settings}


@router.post(
    "/settings",
    response_model=SuccessResponse,
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN))],
)
async def update_settings(
    body: SettingsUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Обновить глобальные настройки (None — поле пропускается, существующее значение остаётся)."""
    updates = body.model_dump(exclude_none=True)
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


# ═══════════════════════════════════════
# SMART COUPONS (Персональные купоны)
# ═══════════════════════════════════════

class CouponCreateRequest(BaseModel):
    customer_id: str | None = None  # None = доступен всем
    title: str
    description: str | None = None
    bonus_amount: float
    min_purchase: float = 0
    expires_at: str | None = None  # ISO datetime


@router.get(
    "/coupons",
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN))],
)
async def list_coupons(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    customer_id: str = Query(None),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Список всех купонов с фильтром по клиенту."""
    from sqlalchemy.orm import selectinload

    q = select(Coupon).options(selectinload(Coupon.customer))
    if customer_id:
        q = q.where(Coupon.customer_id == customer_id)

    total = (await db.execute(
        select(func.count()).select_from(q.subquery())
    )).scalar() or 0

    result = await db.execute(
        q.order_by(Coupon.created_at.desc())
        .offset((page - 1) * limit).limit(limit)
    )
    coupons = result.scalars().all()

    return {
        "items": [
            {
                "id": str(c.id),
                "code": c.code,
                "title": c.title,
                "description": c.description,
                "bonus_amount": float(c.bonus_amount),
                "min_purchase": float(c.min_purchase),
                "customer_id": str(c.customer_id) if c.customer_id else None,
                "customer_name": c.customer.full_name if c.customer else "Все клиенты",
                "is_used": c.is_used,
                "is_active": c.is_active,
                "expires_at": c.expires_at.isoformat() if c.expires_at else None,
                "used_at": c.used_at.isoformat() if c.used_at else None,
                "created_at": c.created_at.isoformat(),
            }
            for c in coupons
        ],
        "total": total,
        "page": page,
    }


@router.post(
    "/coupons",
    response_model=SuccessResponse,
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN))],
)
async def create_coupon(
    body: CouponCreateRequest,
    db: AsyncSession = Depends(get_db),
) -> SuccessResponse:
    """Создать персональный или общий купон."""
    import secrets

    code = f"SC-{secrets.token_hex(4).upper()}"

    expires = None
    if body.expires_at:
        expires = datetime.fromisoformat(body.expires_at)

    coupon = Coupon(
        customer_id=uuid.UUID(body.customer_id) if body.customer_id else None,
        code=code,
        title=body.title,
        description=body.description,
        bonus_amount=Decimal(str(body.bonus_amount)),
        min_purchase=Decimal(str(body.min_purchase)),
        expires_at=expires,
    )
    db.add(coupon)
    await db.commit()

    # Отправить WhatsApp если персональный купон
    if body.customer_id:
        customer = (await db.execute(
            select(Customer).where(Customer.id == body.customer_id)
        )).scalar_one_or_none()
        if customer:
            wa_settings = await db.execute(
                select(Setting).where(Setting.key.in_([
                    "ENABLE_WHATSAPP_NOTIFICATIONS", "GREENAPI_INSTANCE_ID", "GREENAPI_API_TOKEN",
                ]))
            )
            s_map = {s.key: s.value for s in wa_settings.scalars().all()}
            if s_map.get("ENABLE_WHATSAPP_NOTIFICATIONS") == "true":
                iid = s_map.get("GREENAPI_INSTANCE_ID")
                tok = s_map.get("GREENAPI_API_TOKEN")
                if iid and tok:
                    msg = (
                        f"🎟 {customer.full_name}, у вас новый купон!\n"
                        f"*{body.title}*\n"
                        f"Бонус: +{int(body.bonus_amount)} KGS\n"
                        f"Код: {code}\n\n"
                        f"📱 Активируйте: https://cabinet.smartcentr.store\n"
                        f"🛒 Смарт Центр"
                    )
                    await send_whatsapp_message(
                        phone=customer.phone, message=msg,
                        instance_id=iid, api_token=tok,
                    )

    return SuccessResponse(message=f"Купон создан: {code}")


@router.delete(
    "/coupons/{coupon_id}",
    response_model=SuccessResponse,
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN))],
)
async def delete_coupon(
    coupon_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> SuccessResponse:
    """Деактивировать купон."""
    result = await db.execute(select(Coupon).where(Coupon.id == coupon_id))
    coupon = result.scalar_one_or_none()
    if not coupon:
        raise HTTPException(status_code=404, detail={"message": "Купон не найден"})
    coupon.is_active = False
    await db.commit()
    return SuccessResponse(message="Купон деактивирован")


# ═══════════════════════════════════════════
# REVIEW BONUS MANAGEMENT
# ═══════════════════════════════════════════

@router.get(
    "/reviews",
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN))],
)
async def list_reviews(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    status_filter: str = Query(None, alias="status"),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Список заявок на бонус за отзыв."""
    from sqlalchemy.orm import selectinload

    q = select(ReviewRequest).options(selectinload(ReviewRequest.customer))
    if status_filter:
        try:
            q = q.where(ReviewRequest.status == ReviewStatus(status_filter))
        except ValueError:
            pass

    total = (await db.execute(
        select(func.count()).select_from(q.subquery())
    )).scalar() or 0

    result = await db.execute(
        q.order_by(ReviewRequest.created_at.desc())
        .offset((page - 1) * limit).limit(limit)
    )
    reviews = result.scalars().all()

    return {
        "items": [
            {
                "id": str(r.id),
                "customer_id": str(r.customer_id),
                "customer_name": r.customer.full_name if r.customer else "—",
                "customer_phone": r.customer.phone if r.customer else "—",
                "platform": r.platform.value,
                "review_link": r.review_link,
                "status": r.status.value,
                "bonus_amount": float(r.bonus_amount),
                "admin_note": r.admin_note,
                "created_at": r.created_at.isoformat(),
                "reviewed_at": r.reviewed_at.isoformat() if r.reviewed_at else None,
            }
            for r in reviews
        ],
        "total": total,
        "page": page,
    }


class ReviewActionRequest(BaseModel):
    action: str  # "approve" or "reject"
    note: str | None = None


@router.post(
    "/reviews/{review_id}",
    response_model=SuccessResponse,
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN))],
)
async def action_review(
    review_id: uuid.UUID,
    body: ReviewActionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> SuccessResponse:
    """Одобрить или отклонить заявку на бонус за отзыв."""
    from sqlalchemy.orm import selectinload

    result = await db.execute(
        select(ReviewRequest).options(selectinload(ReviewRequest.customer))
        .where(ReviewRequest.id == review_id)
    )
    review = result.scalar_one_or_none()
    if not review:
        raise HTTPException(status_code=404, detail={"message": "Заявка не найдена"})
    if review.status != ReviewStatus.PENDING:
        raise HTTPException(status_code=400, detail={"message": "Заявка уже обработана"})

    review.reviewed_by = uuid.UUID(current_user["sub"])
    review.reviewed_at = datetime.now(timezone.utc)
    review.admin_note = body.note

    if body.action == "approve":
        review.status = ReviewStatus.APPROVED

        # Credit bonus
        account = (await db.execute(
            select(BonusAccount).where(BonusAccount.customer_id == review.customer_id).with_for_update()
        )).scalar_one_or_none()
        if account:
            account.balance += review.bonus_amount
            account.total_earned += review.bonus_amount

            platform_name = "Google Maps" if review.platform.value == "google" else "2GIS"
            txn = Transaction(
                customer_id=review.customer_id,
                type=TransactionType.PROMO,
                amount=review.bonus_amount,
                note=f"⭐ Бонус за отзыв на {platform_name}",
            )
            db.add(txn)

            # WhatsApp notification
            wa_settings = await db.execute(
                select(Setting).where(Setting.key.in_([
                    "ENABLE_WHATSAPP_NOTIFICATIONS", "GREENAPI_INSTANCE_ID", "GREENAPI_API_TOKEN",
                ]))
            )
            s_map = {s.key: s.value for s in wa_settings.scalars().all()}
            if s_map.get("ENABLE_WHATSAPP_NOTIFICATIONS") == "true" and review.customer:
                iid = s_map.get("GREENAPI_INSTANCE_ID")
                tok = s_map.get("GREENAPI_API_TOKEN")
                if iid and tok:
                    msg = (
                        f"⭐ {review.customer.full_name}, спасибо за отзыв!\n"
                        f"Вам начислено +{int(review.bonus_amount)} KGS бонусов.\n"
                        f"Баланс: {float(account.balance):.0f} KGS\n\n"
                        f"📱 https://cabinet.smartcentr.store\n"
                        f"🛒 Смарт Центр"
                    )
                    await send_whatsapp_message(
                        phone=review.customer.phone, message=msg,
                        instance_id=iid, api_token=tok,
                    )

        await db.commit()
        return SuccessResponse(message=f"Отзыв одобрен, +{int(review.bonus_amount)} KGS начислено")

    elif body.action == "reject":
        review.status = ReviewStatus.REJECTED
        await db.commit()
        return SuccessResponse(message="Заявка отклонена")

    else:
        raise HTTPException(status_code=400, detail={"message": "Действие: approve или reject"})


# ═══════════════════════════════════════════
# WHEEL CONFIGURATION (Колесо удачи)
# ═══════════════════════════════════════════

class WheelSegmentInput(BaseModel):
    id: int
    label: str
    value: int  # bonus amount (0 = no prize)
    color: str
    probability: float  # 0.0 - 1.0


class WheelConfigUpdateRequest(BaseModel):
    segments: list[WheelSegmentInput]


@router.get(
    "/wheel/config",
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN))],
)
async def get_wheel_config(db: AsyncSession = Depends(get_db)) -> dict:
    """Получить текущую конфигурацию колеса удачи."""
    import json
    result = await db.execute(
        select(Setting).where(Setting.key == "WHEEL_SEGMENTS")
    )
    setting = result.scalar_one_or_none()
    if setting and setting.value:
        try:
            segments = json.loads(setting.value)
            return {"segments": segments, "source": "database"}
        except Exception:
            pass
    return {"segments": DEFAULT_SEGMENTS, "source": "default"}


@router.put(
    "/wheel/config",
    response_model=SuccessResponse,
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN))],
)
async def update_wheel_config(
    body: WheelConfigUpdateRequest,
    db: AsyncSession = Depends(get_db),
) -> SuccessResponse:
    """Обновить конфигурацию колеса удачи (сегменты, вероятности, бонусы)."""
    import json

    if len(body.segments) < 2:
        raise HTTPException(status_code=400, detail={"message": "Минимум 2 сегмента"})
    if len(body.segments) > 12:
        raise HTTPException(status_code=400, detail={"message": "Максимум 12 сегментов"})

    # Validate probabilities
    total_prob = sum(s.probability for s in body.segments)
    if abs(total_prob - 1.0) > 0.01:
        raise HTTPException(
            status_code=400,
            detail={"message": f"Сумма вероятностей должна быть 1.0 (сейчас: {total_prob:.4f})"},
        )

    # Validate each segment
    for s in body.segments:
        if s.probability < 0 or s.probability > 1:
            raise HTTPException(status_code=400, detail={"message": f"Вероятность сегмента '{s.label}' вне диапазона 0-1"})
        if s.value < 0:
            raise HTTPException(status_code=400, detail={"message": f"Бонус сегмента '{s.label}' не может быть отрицательным"})
        if not s.label.strip():
            raise HTTPException(status_code=400, detail={"message": "Название сегмента не может быть пустым"})
        if not s.color.strip():
            raise HTTPException(status_code=400, detail={"message": "Цвет сегмента обязателен"})

    # Re-assign sequential IDs
    segments_data = []
    for i, s in enumerate(body.segments, 1):
        segments_data.append({
            "id": i,
            "label": s.label.strip(),
            "value": s.value,
            "color": s.color.strip(),
            "probability": round(s.probability, 4),
        })

    # Save to DB
    result = await db.execute(
        select(Setting).where(Setting.key == "WHEEL_SEGMENTS")
    )
    setting = result.scalar_one_or_none()
    json_value = json.dumps(segments_data, ensure_ascii=False)

    if setting:
        setting.value = json_value
    else:
        db.add(Setting(key="WHEEL_SEGMENTS", value=json_value))

    await db.commit()
    return SuccessResponse(message=f"Конфигурация колеса сохранена: {len(segments_data)} сегментов")


@router.post(
    "/wheel/config/reset",
    response_model=SuccessResponse,
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN))],
)
async def reset_wheel_config(db: AsyncSession = Depends(get_db)) -> SuccessResponse:
    """Сбросить конфигурацию колеса к значениям по умолчанию."""
    import json
    result = await db.execute(
        select(Setting).where(Setting.key == "WHEEL_SEGMENTS")
    )
    setting = result.scalar_one_or_none()
    if setting:
        setting.value = json.dumps(DEFAULT_SEGMENTS, ensure_ascii=False)
    else:
        db.add(Setting(key="WHEEL_SEGMENTS", value=json.dumps(DEFAULT_SEGMENTS, ensure_ascii=False)))

    await db.commit()
    return SuccessResponse(message="Конфигурация колеса сброшена к значениям по умолчанию")


# ─── Excel Bulk Import ──────────────────────────────────────────

@router.post(
    "/customers/import",
    summary="Импорт клиентов из Excel",
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN))],
)
async def import_customers_from_excel(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """
    Excel fayldan klientlarni bulk import qilish.
    Kutilgan ustunlar: FIO (ism-familiya) va telefon raqam.
    Har bir klient uchun QR kod, referral kod, Bronze tier va BonusAccount yaratiladi.
    Dublikatlar (telefon raqami mavjud) o'tkazib yuboriladi.
    """
    import openpyxl
    from app.utils import normalize_phone

    # Fayl turini tekshirish
    if not file.filename or not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(
            status_code=400,
            detail={"message": "Faqat .xlsx yoki .xls fayllar qabul qilinadi"},
        )

    # Faylni o'qish
    try:
        content = await file.read()
        wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True)
        ws = wb.active
    except Exception:
        raise HTTPException(
            status_code=400,
            detail={"message": "Excel faylni o'qib bo'lmadi. Format to'g'riligini tekshiring."},
        )

    # Default tier (Bronze — eng past sort_order)
    tier_result = await db.execute(
        select(Tier).order_by(Tier.sort_order.asc()).limit(1)
    )
    default_tier = tier_result.scalar_one_or_none()

    # Mavjud telefonlarni oldindan yuklash (tezlik uchun)
    existing_phones_result = await db.execute(select(Customer.phone))
    existing_phones = {row[0] for row in existing_phones_result.all()}

    created = 0
    skipped = 0
    errors = []
    row_num = 0

    for row in ws.iter_rows(min_row=1, values_only=True):
        row_num += 1

        # Bo'sh qatorlarni o'tkazish
        if not row or not any(row):
            continue

        # Ustunlarni aniqlash (2 yoki undan ko'p ustun)
        cells = [str(c).strip() if c is not None else "" for c in row]

        # Sarlavha qatorini o'tkazish
        lower_cells = [c.lower() for c in cells]
        if any(kw in lower_cells for kw in ["фио", "fio", "имя", "ism", "name", "телефон", "phone", "номер"]):
            continue

        # FIO va telefon topish
        fio = ""
        phone_raw = ""

        if len(cells) >= 2:
            # Birinchi ustunda raqam bo'lsa — bu tartib raqami, keyingisi FIO
            first_clean = cells[0].replace(" ", "").replace("+", "").replace("-", "")
            if first_clean.isdigit() and len(first_clean) <= 5 and len(cells) >= 3:
                # Tartib raqami | FIO | Telefon
                fio = cells[1]
                phone_raw = cells[2]
            else:
                # FIO | Telefon
                fio = cells[0]
                phone_raw = cells[1]

        if not fio or not phone_raw:
            if any(cells):
                errors.append({"row": row_num, "reason": "FIO yoki telefon topilmadi", "data": " | ".join(cells[:3])})
            continue

        # FIO validatsiya
        fio = fio.strip()
        if len(fio) < 2 or len(fio) > 100:
            errors.append({"row": row_num, "reason": f"FIO noto'g'ri uzunlik: {len(fio)}", "data": fio})
            continue

        # Telefon normalizatsiya
        try:
            phone = normalize_phone(phone_raw)
        except Exception:
            errors.append({"row": row_num, "reason": "Telefon raqami noto'g'ri", "data": phone_raw})
            continue

        if not phone or len(phone) < 10:
            errors.append({"row": row_num, "reason": "Telefon raqami noto'g'ri", "data": phone_raw})
            continue

        # Dublikat tekshirish
        if phone in existing_phones:
            skipped += 1
            continue

        # QR va referral kod generatsiya
        qr_code = f"SB-{uuid.uuid4().hex[:10].upper()}"
        referral_code = f"REF-{uuid.uuid4().hex[:8].upper()}"

        # Klient yaratish
        customer = Customer(
            phone=phone,
            full_name=fio,
            qr_code=qr_code,
            referral_code=referral_code,
            tier_id=default_tier.id if default_tier else None,
            is_active=True,
        )
        db.add(customer)
        await db.flush()  # ID olish uchun

        # Bonus account yaratish (0 balans)
        bonus_account = BonusAccount(
            customer_id=customer.id,
            balance=0,
            total_earned=0,
            total_spent=0,
        )
        db.add(bonus_account)

        existing_phones.add(phone)
        created += 1

    await db.commit()
    wb.close()

    return {
        "message": f"Import tugadi: {created} ta yangi klient qo'shildi",
        "created": created,
        "skipped": skipped,
        "errors_count": len(errors),
        "errors": errors[:50],  # Birinchi 50 ta xato
        "total_rows": row_num,
    }

