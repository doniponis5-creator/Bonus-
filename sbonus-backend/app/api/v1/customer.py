"""
Sbonus+ — API личного кабинета клиента.
GET  /api/v1/customer/me — дашборд
GET  /api/v1/customer/transactions — полная история
PATCH /api/v1/customer/profile — редактирование профиля
POST /api/v1/customer/promo — ввод промокода
GET  /api/v1/customer/referral — реферальная информация
"""

import uuid
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.redis import blacklist_token, check_rate_limit
from app.core.security import get_current_customer
from app.models import (
    BonusAccount, Coupon, Customer, CustomerDebt, ReviewRequest, ReviewPlatform, ReviewStatus,
    Setting, Tier, Transaction, TransactionType,
)
from app.schemas import (
    CustomerCabinetMe,
    CustomerCabinetTransaction,
)

router = APIRouter(prefix="/customer", tags=["Клиент: Кабинет"])


@router.get("/me", response_model=CustomerCabinetMe)
async def get_me(
    db: AsyncSession = Depends(get_db),
    current: dict = Depends(get_current_customer),
) -> CustomerCabinetMe:
    """Полный дашборд клиента: баланс, уровень, задолженность из 1C, последние 5 операций."""
    customer_id = current["sub"]

    result = await db.execute(
        select(Customer)
        .options(selectinload(Customer.tier), selectinload(Customer.bonus_account))
        .where(Customer.id == customer_id)
    )
    customer = result.scalar_one_or_none()
    if not customer or not customer.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "CUSTOMER_NOT_FOUND", "message": "Клиент не найден"},
        )

    account = customer.bonus_account
    tier = customer.tier

    # ── Следующий уровень и прогресс ──
    next_tier_name = None
    next_remaining: Decimal | None = None
    progress_percent = Decimal("0")

    total_earned = account.total_earned if account else Decimal("0")

    if tier:
        nt_result = await db.execute(
            select(Tier)
            .where(Tier.min_total_kgs > tier.min_total_kgs, Tier.is_active == True)
            .order_by(Tier.min_total_kgs.asc())
            .limit(1)
        )
        next_tier_obj = nt_result.scalar_one_or_none()
        if next_tier_obj:
            next_tier_name = next_tier_obj.name
            gap = next_tier_obj.min_total_kgs - tier.min_total_kgs
            done = total_earned - tier.min_total_kgs
            next_remaining = max(next_tier_obj.min_total_kgs - total_earned, Decimal("0"))
            if gap > 0:
                progress_percent = max(
                    Decimal("0"), min(Decimal("100"), (done / gap * Decimal("100")).quantize(Decimal("0.01")))
                )

    # ── Жами долг (барча актив рассрочкалар суммаси) ──
    debt_result = await db.execute(
        select(
            func.coalesce(func.sum(CustomerDebt.amount), Decimal("0")),
            func.count(CustomerDebt.id),
            func.max(CustomerDebt.synced_at),
        )
        .where(
            CustomerDebt.customer_id == customer.id,
            CustomerDebt.status.in_(["active", "overdue"]),
        )
    )
    debt_row = debt_result.one()
    debt_amount = debt_row[0]
    debt_count = debt_row[1]
    debt_updated_at = debt_row[2]

    # ── Сгорающие бонусы (для карточки-предупреждения) ──
    expiring_amount = Decimal("0")
    expiring_date = None
    if account and account.balance > 0:
        try:
            from datetime import datetime as _dt, timedelta, timezone as _tz
            from app.tasks.expiration import _calculate_expirable, _get_expiration_settings, _EARN_TYPES
            exp_days, warn_days = await _get_expiration_settings(db)
            now_utc = _dt.now(_tz.utc)
            warning_cutoff = now_utc - timedelta(days=exp_days - warn_days)
            expire_cutoff = now_utc - timedelta(days=exp_days)
            will_expire = await _calculate_expirable(db, customer.id, warning_cutoff)
            already = await _calculate_expirable(db, customer.id, expire_cutoff)
            about = min(will_expire - already, account.balance)
            if about > 0:
                oldest_result = await db.execute(
                    select(func.min(Transaction.created_at)).where(
                        Transaction.customer_id == customer.id,
                        Transaction.type.in_(_EARN_TYPES),
                        Transaction.created_at > expire_cutoff,
                        Transaction.created_at <= warning_cutoff,
                    )
                )
                oldest = oldest_result.scalar()
                if oldest:
                    expiring_amount = about
                    expiring_date = (oldest + timedelta(days=exp_days)).date()
        except Exception:
            pass  # карточка не критична — не ломаем /me

    # ── Последние 5 транзакций ──
    tx_result = await db.execute(
        select(Transaction)
        .where(Transaction.customer_id == customer.id)
        .order_by(Transaction.created_at.desc())
        .limit(5)
    )
    transactions = [
        CustomerCabinetTransaction(
            id=t.id,
            type=t.type.value if hasattr(t.type, "value") else str(t.type),
            amount=t.amount,
            purchase_amount=t.purchase_amount,
            note=t.note,
            created_at=t.created_at,
        )
        for t in tx_result.scalars().all()
    ]

    return CustomerCabinetMe(
        customer_id=customer.id,
        full_name=customer.full_name,
        phone=customer.phone,
        qr_code=customer.qr_code,
        referral_code=customer.referral_code,
        birth_date=customer.birth_date,
        balance=account.balance if account else Decimal("0"),
        total_earned=total_earned,
        total_spent=account.total_spent if account else Decimal("0"),
        tier_name=tier.name if tier else "Bronze",
        tier_percent=tier.bonus_percent if tier else Decimal("3"),
        next_tier_name=next_tier_name,
        next_tier_remaining=next_remaining,
        tier_progress_percent=progress_percent,
        debt_amount=debt_amount,
        debt_updated_at=debt_updated_at,
        expiring_amount=expiring_amount,
        expiring_date=expiring_date,
        recent_transactions=transactions,
    )


@router.get("/tiers")
async def get_tiers(
    db: AsyncSession = Depends(get_db),
    current: dict = Depends(get_current_customer),
) -> dict:
    """Все активные уровни лояльности (для экрана сравнения уровней)."""
    result = await db.execute(
        select(Tier).where(Tier.is_active == True).order_by(Tier.min_total_kgs.asc())
    )
    tiers = result.scalars().all()
    return {
        "tiers": [
            {
                "name": t.name,
                "min_total": float(t.min_total_kgs),
                "bonus_percent": float(t.bonus_percent),
                "max_spend_pct": float(t.max_spend_pct),
            }
            for t in tiers
        ]
    }


def _retail_markup_percent(price: float, category: str | None, cfg: dict) -> float:
    """
    Наценка для отображения клиенту (цена из 1С = закупочная).
    Крупная бытовая техника +20%, средняя +25%, мелкая +30%.
    Сначала по названию категории, иначе по ценовому классу.
    Настройки: RECO_MARKUP_LARGE / RECO_MARKUP_MEDIUM / RECO_MARKUP_SMALL.
    """
    large = float(cfg.get("RECO_MARKUP_LARGE") or 20)
    medium = float(cfg.get("RECO_MARKUP_MEDIUM") or 25)
    small = float(cfg.get("RECO_MARKUP_SMALL") or 30)
    cat = (category or "").lower()
    if "крупн" in cat:
        return large
    if "средн" in cat:
        return medium
    if "мелк" in cat:
        return small
    # Fallback по цене: дорогое = крупная техника
    if price >= 30000:
        return large
    if price >= 10000:
        return medium
    return small


@router.get("/recommendations")
async def get_recommendations(
    db: AsyncSession = Depends(get_db),
    current: dict = Depends(get_current_customer),
) -> dict:
    """
    «Подобрано для вас» — персональные товарные рекомендации:
    co-occurrence по чекам клиента (что покупают вместе с его товарами).
    Fallback: топ-продажи в наличии. Только активные товары с остатком.
    """
    from datetime import datetime, timedelta, timezone
    from sqlalchemy import and_, desc
    from sqlalchemy.orm import aliased
    from app.models import Product, PurchaseItem

    customer_id = uuid.UUID(current["sub"])
    since = datetime.now(timezone.utc) - timedelta(days=90)
    limit = 4

    cust_products_result = await db.execute(
        select(PurchaseItem.product_id)
        .join(Transaction, Transaction.id == PurchaseItem.transaction_id)
        .where(
            Transaction.customer_id == customer_id,
            PurchaseItem.created_at >= since,
            PurchaseItem.product_id != None,  # noqa: E711
        )
        .group_by(PurchaseItem.product_id)
    )
    cust_product_ids = [r[0] for r in cust_products_result.all()]

    suggestions = []
    source = "personal"

    if cust_product_ids:
        PI_A = aliased(PurchaseItem)
        PI_B = aliased(PurchaseItem)
        result = await db.execute(
            select(
                Product.id, Product.name, Product.price, Product.category,
                func.count().label("times"),
            )
            .select_from(PI_A)
            .join(PI_B, and_(
                PI_A.receipt_number == PI_B.receipt_number,
                PI_A.product_id != PI_B.product_id,
            ))
            .join(Product, Product.id == PI_B.product_id)
            .where(
                PI_A.product_id.in_(cust_product_ids),
                PI_B.product_id.notin_(cust_product_ids),
                PI_A.created_at >= since,
                PI_A.receipt_number != None,  # noqa: E711
                Product.is_active == True,  # noqa: E712
                Product.current_stock > 0,
            )
            .group_by(Product.id, Product.name, Product.price, Product.category)
            .order_by(desc("times"))
            .limit(limit)
        )
        suggestions = [
            {"name": r.name, "price": float(r.price or 0), "category": r.category}
            for r in result.all()
        ]

    if not suggestions:
        source = "popular"
        result = await db.execute(
            select(
                Product.id, Product.name, Product.price, Product.category,
                func.count().label("times"),
            )
            .select_from(PurchaseItem)
            .join(Product, Product.id == PurchaseItem.product_id)
            .where(
                PurchaseItem.created_at >= since,
                Product.is_active == True,  # noqa: E712
                Product.current_stock > 0,
            )
            .group_by(Product.id, Product.name, Product.price, Product.category)
            .order_by(desc("times"))
            .limit(limit)
        )
        suggestions = [
            {"name": r.name, "price": float(r.price or 0), "category": r.category}
            for r in result.all()
        ]

    # Розничная наценка для отображения (цена в 1С — закупочная)
    markup_cfg_result = await db.execute(
        select(Setting).where(Setting.key.in_([
            "RECO_MARKUP_LARGE", "RECO_MARKUP_MEDIUM", "RECO_MARKUP_SMALL",
        ]))
    )
    markup_cfg = {x.key: x.value for x in markup_cfg_result.scalars().all()}
    for item in suggestions:
        pct = _retail_markup_percent(item["price"], item.get("category"), markup_cfg)
        # округление до 10 сом вверх — красивая розничная цена
        item["price"] = float(int((item["price"] * (1 + pct / 100) + 9) // 10 * 10))

    return {"items": suggestions, "source": source}


@router.get("/transactions")
async def get_transactions(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    tx_type: str = Query(None, description="Фильтр: earn/spend/expire/referral/promo/campaign"),
    date_from: str = Query(None, description="Начало периода (YYYY-MM-DD)"),
    date_to: str = Query(None, description="Конец периода (YYYY-MM-DD)"),
    db: AsyncSession = Depends(get_db),
    current: dict = Depends(get_current_customer),
) -> dict:
    """Полная история транзакций с пагинацией и фильтром по типу."""
    customer_id = current["sub"]

    query = select(Transaction).where(Transaction.customer_id == customer_id)
    if tx_type:
        try:
            query = query.where(Transaction.type == TransactionType(tx_type))
        except ValueError:
            pass

    # Sana bo'yicha filter
    if date_from:
        try:
            from datetime import datetime, timezone
            df = datetime.strptime(date_from, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            query = query.where(Transaction.created_at >= df)
        except ValueError:
            pass
    if date_to:
        try:
            from datetime import datetime, timedelta, timezone
            dt = datetime.strptime(date_to, "%Y-%m-%d").replace(tzinfo=timezone.utc) + timedelta(days=1)
            query = query.where(Transaction.created_at < dt)
        except ValueError:
            pass

    total = (await db.execute(
        select(func.count()).select_from(query.subquery())
    )).scalar() or 0

    result = await db.execute(
        query.order_by(Transaction.created_at.desc())
        .offset((page - 1) * limit).limit(limit)
    )
    txns = result.scalars().all()

    items = [
        {
            "id": str(t.id),
            "type": t.type.value,
            "amount": float(t.amount),
            "purchase_amount": float(t.purchase_amount) if t.purchase_amount else None,
            "note": t.note,
            "created_at": t.created_at.isoformat(),
        }
        for t in txns
    ]

    # Davr uchun statistika
    total_earned_period = sum(i["amount"] for i in items if i["type"] in ("earn", "referral", "promo", "campaign", "birthday"))
    total_spent_period = sum(i["amount"] for i in items if i["type"] == "spend")

    return {
        "items": items,
        "total": total,
        "page": page,
        "limit": limit,
        "summary": {
            "earned_in_page": round(total_earned_period, 2),
            "spent_in_page": round(total_spent_period, 2),
        },
    }


class ProfileUpdateRequest(BaseModel):
    full_name: str | None = None
    birth_date: date | None = None


@router.patch("/profile")
async def update_profile(
    body: ProfileUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current: dict = Depends(get_current_customer),
) -> dict:
    """Клиент обновляет своё имя и дату рождения."""
    customer_id = current["sub"]
    result = await db.execute(select(Customer).where(Customer.id == customer_id))
    customer = result.scalar_one_or_none()
    if not customer:
        raise HTTPException(status_code=404, detail={"message": "Клиент не найден"})

    if body.full_name is not None:
        customer.full_name = body.full_name
    if body.birth_date is not None:
        customer.birth_date = body.birth_date

    await db.commit()
    return {"message": "Профиль обновлён"}


class PromoApplyRequest(BaseModel):
    code: str


@router.post("/promo")
async def apply_promo_code(
    body: PromoApplyRequest,
    db: AsyncSession = Depends(get_db),
    current: dict = Depends(get_current_customer),
) -> dict:
    """Клиент вводит промокод из кабинета."""
    customer_id = uuid.UUID(current["sub"])
    # Rate limit: 5 попыток промокода в 5 минут
    if not await check_rate_limit(f"promo:{customer_id}", max_attempts=5, window_seconds=300):
        raise HTTPException(status_code=429, detail={"code": "RATE_LIMIT", "message": "Слишком много попыток. Подождите 5 минут."})
    from app.services.bonus import BonusService
    svc = BonusService(db)
    result = await svc.apply_promo(customer_id, body.code.strip().upper())
    await db.commit()
    return {
        "message": result.message_ru,
        "amount": float(result.amount),
        "new_balance": float(result.new_balance),
    }


class ReferralApplyRequest(BaseModel):
    code: str


@router.post("/referral")
async def apply_referral_code(
    body: ReferralApplyRequest,
    db: AsyncSession = Depends(get_db),
    current: dict = Depends(get_current_customer),
) -> dict:
    """Клиент вводит реферальный код друга."""
    customer_id = uuid.UUID(current["sub"])
    # Rate limit: 3 попытки реферала в 5 минут
    if not await check_rate_limit(f"referral:{customer_id}", max_attempts=3, window_seconds=300):
        raise HTTPException(status_code=429, detail={"code": "RATE_LIMIT", "message": "Слишком много попыток. Подождите 5 минут."})
    from app.services.bonus import BonusService
    svc = BonusService(db)
    result = await svc.apply_referral(customer_id, body.code.strip().upper())
    await db.commit()
    return {
        "message": result.message_ru,
        "amount": float(result.amount),
        "new_balance": float(result.new_balance),
    }


@router.get("/referral")
async def get_referral_info(
    db: AsyncSession = Depends(get_db),
    current: dict = Depends(get_current_customer),
) -> dict:
    """Информация о реферальной программе клиента — все данные из DB Settings."""
    customer_id = current["sub"]
    result = await db.execute(select(Customer).where(Customer.id == customer_id))
    customer = result.scalar_one_or_none()
    if not customer:
        raise HTTPException(status_code=404, detail={"message": "Клиент не найден"})

    # Читаем бонусы из DB Settings
    from app.core.config import get_settings
    env_settings = get_settings()
    ref_settings = await db.execute(
        select(Setting).where(Setting.key.in_([
            "REFERRAL_BONUS_INVITER", "REFERRAL_BONUS_INVITEE", "REFERRAL_DAILY_LIMIT",
        ]))
    )
    db_ref = {s.key: s.value for s in ref_settings.scalars().all()}
    inviter_bonus = Decimal(db_ref["REFERRAL_BONUS_INVITER"]) if db_ref.get("REFERRAL_BONUS_INVITER") else env_settings.referral_bonus_inviter
    invitee_bonus = Decimal(db_ref["REFERRAL_BONUS_INVITEE"]) if db_ref.get("REFERRAL_BONUS_INVITEE") else env_settings.referral_bonus_invitee

    # Приглашённые
    invited_result = await db.execute(
        select(Customer.id, Customer.full_name, Customer.created_at)
        .where(Customer.referred_by == customer.id)
        .order_by(Customer.created_at.desc())
    )
    invites = invited_result.all()

    # Реальные заработки из транзакций
    total_earned = (await db.execute(
        select(func.coalesce(func.sum(Transaction.amount), 0))
        .where(
            Transaction.customer_id == customer.id,
            Transaction.type == TransactionType.REFERRAL,
        )
    )).scalar() or Decimal("0")

    # Кто пригласил меня
    referred_by_name = None
    if customer.referred_by:
        referrer = (await db.execute(
            select(Customer.full_name).where(Customer.id == customer.referred_by)
        )).scalar_one_or_none()
        referred_by_name = referrer

    return {
        "referral_code": customer.referral_code,
        "invited_count": len(invites),
        "bonus_per_invite": float(inviter_bonus),
        "invitee_bonus": float(invitee_bonus),
        "total_earned": float(total_earned),
        "referred_by_name": referred_by_name,
        "invites": [
            {
                "name": inv.full_name or "Клиент",
                "date": inv.created_at.isoformat() if inv.created_at else None,
            }
            for inv in invites
        ],
    }


# ─── LEADERBOARD ───

@router.get("/leaderboard")
async def get_leaderboard(
    period: str = Query("month", regex="^(week|month|all)$"),
    db: AsyncSession = Depends(get_db),
    current: dict = Depends(get_current_customer),
) -> dict:
    """
    Рейтинг TOP-10 клиентов по покупкам за период.
    period: week | month | all
    """
    from datetime import datetime, timedelta, timezone

    now = datetime.now(timezone.utc)
    if period == "week":
        cutoff = now - timedelta(days=7)
    elif period == "month":
        cutoff = now - timedelta(days=30)
    else:
        cutoff = None

    # TOP-10 по сумме покупок
    q = (
        select(
            Customer.id,
            Customer.full_name,
            func.coalesce(func.sum(Transaction.purchase_amount), 0).label("total_purchases"),
            func.count(Transaction.id).label("txn_count"),
        )
        .join(Transaction, Transaction.customer_id == Customer.id)
        .where(
            Transaction.type == TransactionType.EARN,
            Customer.is_active == True,
        )
    )
    if cutoff:
        q = q.where(Transaction.created_at >= cutoff)

    q = (
        q.group_by(Customer.id, Customer.full_name)
        # coalesce → NULL-суммы (покупки без purchase_amount) идут ВНИЗ, а не вверх
        # (в PostgreSQL обычный DESC ставит NULL первыми)
        .order_by(func.coalesce(func.sum(Transaction.purchase_amount), 0).desc())
        .limit(10)
    )
    result = await db.execute(q)
    rows = result.all()

    # Текущий клиент — его позиция
    customer_id = current["sub"]
    my_q = (
        select(
            func.coalesce(func.sum(Transaction.purchase_amount), 0).label("total"),
        )
        .where(
            Transaction.customer_id == customer_id,
            Transaction.type == TransactionType.EARN,
        )
    )
    if cutoff:
        my_q = my_q.where(Transaction.created_at >= cutoff)
    my_total = (await db.execute(my_q)).scalar() or 0

    # Подсчёт моей позиции
    rank_q = (
        select(func.count())
        .select_from(
            select(
                Transaction.customer_id,
                func.sum(Transaction.purchase_amount).label("s"),
            )
            .where(Transaction.type == TransactionType.EARN)
            .group_by(Transaction.customer_id)
            .having(func.sum(Transaction.purchase_amount) > my_total)
            .subquery()
        )
    )
    if cutoff:
        rank_q = (
            select(func.count())
            .select_from(
                select(
                    Transaction.customer_id,
                    func.sum(Transaction.purchase_amount).label("s"),
                )
                .where(
                    Transaction.type == TransactionType.EARN,
                    Transaction.created_at >= cutoff,
                )
                .group_by(Transaction.customer_id)
                .having(func.sum(Transaction.purchase_amount) > my_total)
                .subquery()
            )
        )
    my_rank = ((await db.execute(rank_q)).scalar() or 0) + 1

    leaders = []
    for i, row in enumerate(rows, 1):
        name = row.full_name or "Клиент"
        # Маскировка имени для приватности (Гулола → Гул***)
        masked = name[:3] + "***" if len(name) > 3 else name
        leaders.append({
            "rank": i,
            "name": masked,
            "total_purchases": int(row.total_purchases),
            "txn_count": row.txn_count,
            "is_me": str(row.id) == str(customer_id),
        })

    return {
        "period": period,
        "leaders": leaders,
        "my_rank": my_rank,
        "my_total": int(my_total),
    }


# ─── MY COUPONS ───

@router.get("/coupons")
async def my_coupons(
    db: AsyncSession = Depends(get_db),
    current: dict = Depends(get_current_customer),
) -> dict:
    """Купоны текущего клиента (персональные + общие неиспользованные)."""
    from datetime import datetime, timezone

    customer_id = current["sub"]
    now = datetime.now(timezone.utc)

    result = await db.execute(
        select(Coupon).where(
            Coupon.is_active == True,
            Coupon.is_used == False,
            (Coupon.expires_at.is_(None)) | (Coupon.expires_at > now),
            (Coupon.customer_id == customer_id) | (Coupon.customer_id.is_(None)),
        ).order_by(Coupon.bonus_amount.desc())
    )
    coupons = result.scalars().all()

    return {
        "coupons": [
            {
                "id": str(c.id),
                "code": c.code,
                "title": c.title,
                "description": c.description,
                "bonus_amount": float(c.bonus_amount),
                "min_purchase": float(c.min_purchase),
                "is_personal": c.customer_id is not None,
                "expires_at": c.expires_at.isoformat() if c.expires_at else None,
            }
            for c in coupons
        ],
    }


@router.post("/coupons/{code}/activate")
async def activate_coupon(
    code: str,
    db: AsyncSession = Depends(get_db),
    current: dict = Depends(get_current_customer),
) -> dict:
    """Активировать купон — начислить бонус."""
    from datetime import datetime, timezone

    customer_id = uuid.UUID(current["sub"])
    # Rate limit: 5 попыток активации в 5 минут
    if not await check_rate_limit(f"coupon:{customer_id}", max_attempts=5, window_seconds=300):
        raise HTTPException(status_code=429, detail={"code": "RATE_LIMIT", "message": "Слишком много попыток. Подождите 5 минут."})
    now = datetime.now(timezone.utc)

    # FOR UPDATE — предотвращает двойную активацию при параллельных запросах
    result = await db.execute(
        select(Coupon).where(
            Coupon.code == code,
            Coupon.is_active == True,
            Coupon.is_used == False,
        ).with_for_update()
    )
    coupon = result.scalar_one_or_none()
    if not coupon:
        raise HTTPException(status_code=404, detail={"message": "Купон не найден или уже использован"})

    # Проверка — персональный купон другому клиенту
    if coupon.customer_id and coupon.customer_id != customer_id:
        raise HTTPException(status_code=403, detail={"message": "Этот купон предназначен другому клиенту"})

    # Проверка срока
    if coupon.expires_at and coupon.expires_at < now:
        raise HTTPException(status_code=400, detail={"message": "Купон истёк"})

    # Проверка порога покупки: купон активируется только после покупки >= min_purchase
    # (покупка должна быть СОВЕРШЕНА ПОСЛЕ выдачи купона)
    if coupon.min_purchase and coupon.min_purchase > 0:
        qualifying = await db.execute(
            select(func.count(Transaction.id)).where(
                Transaction.customer_id == customer_id,
                Transaction.type == TransactionType.EARN,
                Transaction.purchase_amount >= coupon.min_purchase,
                Transaction.created_at >= coupon.created_at,
            )
        )
        if (qualifying.scalar() or 0) == 0:
            raise HTTPException(
                status_code=400,
                detail={
                    "code": "COUPON_MIN_PURCHASE",
                    "message": f"Купон активируется после покупки от {int(coupon.min_purchase)} сом",
                    "min_purchase": float(coupon.min_purchase),
                },
            )

    # Начислить бонус
    account = (await db.execute(
        select(BonusAccount).where(BonusAccount.customer_id == customer_id).with_for_update()
    )).scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail={"message": "Бонусный аккаунт не найден"})

    account.balance += coupon.bonus_amount
    account.total_earned += coupon.bonus_amount

    txn = Transaction(
        customer_id=customer_id,
        type=TransactionType.PROMO,
        amount=coupon.bonus_amount,
        note=f"🎟 Купон: {coupon.title} ({coupon.code})",
    )
    db.add(txn)

    coupon.is_used = True
    coupon.used_at = now

    await db.commit()

    return {
        "message": f"🎟 Купон активирован! +{int(coupon.bonus_amount)} KGS",
        "bonus_amount": float(coupon.bonus_amount),
        "new_balance": float(account.balance),
    }


# ─── REVIEW BONUS ───

class ReviewSubmitRequest(BaseModel):
    platform: str  # "google" or "2gis"
    review_link: str


@router.post("/review")
async def submit_review(
    body: ReviewSubmitRequest,
    db: AsyncSession = Depends(get_db),
    current: dict = Depends(get_current_customer),
) -> dict:
    """Клиент отправляет ссылку на отзыв для получения бонуса."""
    customer_id = uuid.UUID(current["sub"])

    # Validate platform
    try:
        platform = ReviewPlatform(body.platform.lower())
    except ValueError:
        raise HTTPException(status_code=400, detail={"message": "Укажите платформу: google или 2gis"})

    # Validate link
    link = body.review_link.strip()
    if not link.startswith("http"):
        raise HTTPException(status_code=400, detail={"message": "Укажите корректную ссылку на отзыв"})

    # Check: no duplicate pending/approved for same platform
    existing = await db.execute(
        select(ReviewRequest).where(
            ReviewRequest.customer_id == customer_id,
            ReviewRequest.platform == platform,
            ReviewRequest.status.in_([ReviewStatus.PENDING, ReviewStatus.APPROVED]),
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail={
            "message": "Вы уже отправили отзыв для этой платформы"
        })

    # Get bonus amount from settings
    bonus_setting = (await db.execute(
        select(Setting).where(Setting.key == "REVIEW_BONUS_AMOUNT")
    )).scalar_one_or_none()
    bonus_amount = Decimal(bonus_setting.value) if bonus_setting else Decimal("200")

    # Get customer name for reviewer_name
    customer = (await db.execute(
        select(Customer).where(Customer.id == customer_id)
    )).scalar_one_or_none()

    review = ReviewRequest(
        customer_id=customer_id,
        platform=platform,
        review_link=link,
        bonus_amount=bonus_amount,
        reviewer_name=customer.full_name if customer else None,
    )
    db.add(review)
    await db.commit()

    platform_name = "Google Maps" if platform == ReviewPlatform.GOOGLE else "2GIS"
    return {
        "message": f"Отзыв на {platform_name} отправлен на проверку! После одобрения вы получите +{int(bonus_amount)} KGS",
        "bonus_amount": float(bonus_amount),
    }


@router.get("/reviews")
async def my_reviews(
    db: AsyncSession = Depends(get_db),
    current: dict = Depends(get_current_customer),
) -> dict:
    """Мои заявки на бонус за отзыв."""
    customer_id = current["sub"]

    result = await db.execute(
        select(ReviewRequest)
        .where(ReviewRequest.customer_id == customer_id)
        .order_by(ReviewRequest.created_at.desc())
    )
    reviews = result.scalars().all()

    return {
        "reviews": [
            {
                "id": str(r.id),
                "platform": r.platform.value if hasattr(r.platform, "value") else str(r.platform),
                "review_link": r.review_link,
                "status": r.status.value if hasattr(r.status, "value") else str(r.status),
                "bonus_amount": float(r.bonus_amount),
                "admin_note": r.admin_note,
                "created_at": r.created_at.isoformat(),
            }
            for r in reviews
        ],
        "can_submit_google": not any(
            r.platform == ReviewPlatform.GOOGLE and r.status in (ReviewStatus.PENDING, ReviewStatus.APPROVED)
            for r in reviews
        ),
        "can_submit_2gis": not any(
            r.platform == ReviewPlatform.TWOGIS and r.status in (ReviewStatus.PENDING, ReviewStatus.APPROVED)
            for r in reviews
        ),
    }


# ═══════════════════════════════════════════
# РАССРОЧКА / ДОЛГЛАР
# ═══════════════════════════════════════════

@router.get("/debts")
async def get_debts(
    db: AsyncSession = Depends(get_db),
    current: dict = Depends(get_current_customer),
) -> dict:
    """Все рассрочки клиента (активные + просроченные + погашенные)."""
    customer_id = current["sub"]

    result = await db.execute(
        select(CustomerDebt)
        .where(
            CustomerDebt.customer_id == customer_id,
            CustomerDebt.status.in_(["active", "overdue", "paid"]),
        )
        .order_by(CustomerDebt.overdue_days.desc(), CustomerDebt.created_at.desc())
    )
    debts = result.scalars().all()

    # Общие суммы (только активные для total_debt)
    total_debt = sum(d.amount for d in debts if d.status != "paid")
    total_sum = sum(d.total_amount for d in debts)
    total_paid = sum(d.paid_amount for d in debts)

    return {
        "total_debt": float(total_debt),
        "total_original": float(total_sum),
        "total_paid": float(total_paid),
        "count": len(debts),
        "debts": [
            {
                "id": str(d.id),
                "reference": d.reference,
                "total_amount": float(d.total_amount),
                "paid_amount": float(d.paid_amount),
                "amount": float(d.amount),
                "overdue_days": d.overdue_days,
                "status": d.status,
                "percent_paid": round(float(d.paid_amount) / float(d.total_amount) * 100, 1) if d.total_amount > 0 else 0,
                "next_payment": d.next_payment,
                "note": d.note,
                "created_at": d.created_at.isoformat() if d.created_at else None,
                "synced_at": d.synced_at.isoformat() if d.synced_at else None,
            }
            for d in debts
        ],
    }


@router.get("/debts/{debt_id}")
async def get_debt_detail(
    debt_id: str,
    db: AsyncSession = Depends(get_db),
    current: dict = Depends(get_current_customer),
) -> dict:
    """Рассрочка тафсилоти — график, тўловлар тарихи."""
    customer_id = current["sub"]

    result = await db.execute(
        select(CustomerDebt).where(
            CustomerDebt.id == debt_id,
            CustomerDebt.customer_id == customer_id,
        )
    )
    debt = result.scalar_one_or_none()
    if not debt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "DEBT_NOT_FOUND", "message": "Рассрочка топилмади"},
        )

    return {
        "id": str(debt.id),
        "reference": debt.reference,
        "total_amount": float(debt.total_amount),
        "paid_amount": float(debt.paid_amount),
        "amount": float(debt.amount),
        "overdue_days": debt.overdue_days,
        "status": debt.status,
        "percent_paid": round(float(debt.paid_amount) / float(debt.total_amount) * 100, 1) if debt.total_amount > 0 else 0,
        "schedule": debt.schedule or [],
        "payments_history": debt.payments_history or [],
        "next_payment": debt.next_payment,
        "note": debt.note,
        "created_at": debt.created_at.isoformat() if debt.created_at else None,
        "synced_at": debt.synced_at.isoformat() if debt.synced_at else None,
    }


# ──────────────────────────────────────────────────────────────────────────
# Удаление аккаунта (требование Google Play / App Store)
# ──────────────────────────────────────────────────────────────────────────
class AccountDeleteRequest(BaseModel):
    confirm: bool = False


@router.delete("/account")
async def delete_account(
    confirm: bool = Query(False, description="Подтверждение удаления"),
    body: AccountDeleteRequest | None = None,
    db: AsyncSession = Depends(get_db),
    current: dict = Depends(get_current_customer),
) -> dict:
    """
    Клиент удаляет свой аккаунт (требование магазинов приложений).

    Soft-delete + анонимизация PII. История бонусов (Transaction) IMMUTABLE —
    не удаляется, но обезличивается через отвязку персональных данных клиента.
    После удаления текущий токен заносится в blacklist, телефон/QR/реферал
    освобождаются для повторной регистрации.

    Подтверждение принимается из query (?confirm=true) или из тела {"confirm": true} —
    чтобы работать даже если прокси отбрасывает тело DELETE-запроса.
    """
    confirmed = confirm or (body.confirm if body else False)
    if not confirmed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "CONFIRM_REQUIRED", "message": "Требуется подтверждение удаления"},
        )

    customer_id = current["sub"]
    result = await db.execute(select(Customer).where(Customer.id == customer_id))
    customer = result.scalar_one_or_none()
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "CUSTOMER_NOT_FOUND", "message": "Клиент не найден"},
        )

    if not customer.is_active:
        return {"message": "Аккаунт уже удалён"}

    # Анонимизация уникальных PII-полей (nullable=False → подставляем уникальные заглушки)
    short_id = str(customer.id).replace("-", "")[:12]
    customer.full_name = "Удалённый пользователь"
    customer.phone = f"deleted_{short_id}"
    customer.qr_code = f"deleted_{short_id}"
    customer.referral_code = f"del_{short_id}"
    customer.birth_date = None
    customer.is_active = False

    await db.commit()

    # Отзываем текущий токен (если есть jti + exp)
    jti = current.get("jti")
    exp = current.get("exp")
    if jti:
        ttl = 30 * 24 * 3600
        if isinstance(exp, (int, float)):
            from datetime import datetime, timezone
            remaining = int(exp - datetime.now(timezone.utc).timestamp())
            if remaining > 0:
                ttl = remaining
        try:
            await blacklist_token(jti, ttl)
        except Exception:
            pass

    return {"message": "Аккаунт удалён", "deleted": True}
