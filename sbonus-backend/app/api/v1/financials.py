"""
SBonus+ — Финансовая аналитика (P&L).  [PRO / 1C-aware]

Доход:   purchase_items (товар сотувлари, 1С дан) → выручка + себестоимость (cost_price)
Расход:  expenses жадвали (қўлда + 1С), is_recurring = постоянные/разовые
Бонус:   Transaction (SPEND = реально потрачено клиентом = расход бизнеса) — ОТДЕЛЬНОЙ строкой
Прибыль: Доход − Себестоимость − Расходы − Бонусы(redeemed)

Период:  ?month=YYYY-MM  ИЛИ  ?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD (диапазон).
         Всё пересчитывается «живьём» из 1С — закрытия месяца нет.

Endpoints:
  GET  /api/v1/financials/summary         — обзор (месяц или диапазон)
  GET  /api/v1/financials/monthly         — помесячная динамика (до 12 мес)
  GET  /api/v1/financials/daily           — ПОДНЕВНАЯ динамика (месяц/диапазон)   ← НОВОЕ
  GET  /api/v1/financials/pnl             — P&L отчёт
  GET  /api/v1/financials/expenses        — список расходов
  POST /api/v1/financials/expenses        — добавить расход
  PUT  /api/v1/financials/expenses/{id}   — изменить расход
  DELETE /api/v1/financials/expenses/{id} — удалить расход
  GET  /api/v1/financials/by-cashier      — выручка по кассирам
  GET  /api/v1/financials/by-category     — расходы по категориям
  GET  /api/v1/financials/plan-fact       — план vs факт
"""

import uuid
import calendar
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import case, desc, func, select, and_, extract, literal_column
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user, require_role, UserRole
from app.models import (
    Expense, EXPENSE_CATEGORY_LABELS,
    Product, PurchaseItem, Transaction, TransactionType,
    User, Branch, Setting,
)

router = APIRouter(
    prefix="/financials",
    tags=["Финансовая аналитика"],
)


# ─── Schemas ───

class ExpenseCreate(BaseModel):
    category: str = Field(..., min_length=1, max_length=100, description="Категория расхода (произвольный текст)")
    amount: float = Field(..., gt=0, description="Сумма в сом")
    month: str = Field(..., pattern=r"^\d{4}-\d{2}$", description="Месяц: 2026-05")
    description: Optional[str] = None
    branch_id: Optional[str] = None
    is_recurring: bool = False

class ExpenseUpdate(BaseModel):
    category: Optional[str] = None
    amount: Optional[float] = Field(None, gt=0)
    month: Optional[str] = Field(None, pattern=r"^\d{4}-\d{2}$")
    description: Optional[str] = None
    is_recurring: Optional[bool] = None


# ─── Helpers: время / период ───

BISHKEK_TZ = timezone(timedelta(hours=6))  # Asia/Bishkek — границы по местному времени
CAT_MAXLEN = 30  # = длина колонки Expense.category (varchar(30))


def _month_range(month_str: str):
    """'2026-05' → (start_dt, end_dt) по времени магазина (+6)."""
    y, m = int(month_str[:4]), int(month_str[5:7])
    start = datetime(y, m, 1, tzinfo=BISHKEK_TZ)
    if m == 12:
        end = datetime(y + 1, 1, 1, tzinfo=BISHKEK_TZ)
    else:
        end = datetime(y, m + 1, 1, tzinfo=BISHKEK_TZ)
    return start, end

def _current_month() -> str:
    return datetime.now(BISHKEK_TZ).strftime("%Y-%m")

def _prev_month(month_str: str) -> str:
    y, m = int(month_str[:4]), int(month_str[5:7])
    if m == 1:
        return f"{y-1}-12"
    return f"{y}-{m-1:02d}"

def _days_in_month(month_str: str) -> int:
    y, m = int(month_str[:4]), int(month_str[5:7])
    return calendar.monthrange(y, m)[1]

def _parse_date(d: str) -> datetime:
    """'2026-06-19' → aware datetime (+6) на 00:00."""
    return datetime.strptime(d[:10], "%Y-%m-%d").replace(tzinfo=BISHKEK_TZ)

def _resolve_period(month: Optional[str], date_from: Optional[str], date_to: Optional[str]):
    """
    Возвращает (start, end, label, mode, month_key).
    mode = 'month' | 'range'. month_key = строка месяца для расходов (только в режиме month).
    Диапазон: [date_from 00:00 ; date_to+1день 00:00).
    """
    if date_from and date_to:
        start = _parse_date(date_from)
        end = _parse_date(date_to) + timedelta(days=1)
        if end <= start:
            raise HTTPException(400, "date_to должен быть ≥ date_from")
        if (end - start).days > 366:
            raise HTTPException(400, "Диапазон не больше 366 дней")
        label = f"{date_from} … {date_to}"
        return start, end, label, "range", None
    mk = month or _current_month()
    start, end = _month_range(mk)
    return start, end, mk, "month", mk


# Месяцы (постоянные) — авто-классификация, если 1С не прислала флаг is_recurring.
# Дублируется в webhook.py (там же создаются расходы из 1С).
RECURRING_CATS = {
    "rent", "arenda", "аренда", "salary", "salaries", "zarplata", "zp", "oklad", "зарплата", "оклад",
    "utilities", "kommunal", "kommunalka", "коммунальные", "коммуналка", "communal",
    "communication", "svyaz", "связь", "internet", "интернет",
    "insurance", "strahovanie", "страхование", "taxes", "nalogi", "налоги",
    "ipoteka", "ипотека", "credit", "kredit", "кредит", "leasing", "lizing", "лизинг",
    "amortizatsiya", "амортизация", "depreciation", "subscription", "podpiska", "подписка",
    "security", "ohrana", "охрана",
}

def _is_recurring_category(cat: str) -> bool:
    return (cat or "").strip().lower() in RECURRING_CATS


MONTH_NAMES_RU = {
    1: "Янв", 2: "Фев", 3: "Мар", 4: "Апр", 5: "Май", 6: "Июн",
    7: "Июл", 8: "Авг", 9: "Сен", 10: "Окт", 11: "Ноя", 12: "Дек",
}


# ─── Helpers: данные ───

async def _get_revenue_data(db: AsyncSession, start: datetime, end: datetime) -> dict:
    """
    Выручка и себестоимость из purchase_items за период.
    COGS = quantity × COALESCE(item.cost_price, product.cost_price) — LEFT join,
    позиции без себестоимости остаются в выручке (считаем «покрытие себестоимостью»).
    Если строк чека за период нет (1С их не синхронил) — выручка берётся из
    транзакций (Transaction.purchase_amount), себестоимость неизвестна.
    """
    cost_price_expr = func.coalesce(PurchaseItem.cost_price, Product.cost_price)
    result = await db.execute(
        select(
            func.coalesce(func.sum(PurchaseItem.total), 0).label("revenue"),
            func.coalesce(func.sum(PurchaseItem.quantity * func.coalesce(cost_price_expr, 0)), 0).label("cost"),
            func.coalesce(func.sum(case((cost_price_expr.isnot(None), PurchaseItem.total), else_=0)), 0).label("revenue_with_cost"),
            func.coalesce(func.sum(PurchaseItem.quantity), 0).label("items_sold"),
            func.count(func.distinct(PurchaseItem.receipt_number)).label("receipts"),
        )
        .select_from(PurchaseItem)
        .join(Product, Product.id == PurchaseItem.product_id, isouter=True)
        .where(PurchaseItem.created_at >= start, PurchaseItem.created_at < end)
    )
    row = result.one()
    revenue = float(row.revenue or 0)
    cost = float(row.cost or 0)
    revenue_with_cost = float(row.revenue_with_cost or 0)
    items_sold = float(row.items_sold or 0)
    receipts = row.receipts or 0
    source = "items"

    if revenue <= 0:
        tx = await db.execute(
            select(
                func.coalesce(func.sum(Transaction.purchase_amount), 0).label("revenue"),
                func.count(Transaction.id).label("receipts"),
            ).where(
                Transaction.type == TransactionType.EARN,
                Transaction.created_at >= start,
                Transaction.created_at < end,
                Transaction.purchase_amount > 0,
            )
        )
        trow = tx.one()
        revenue = float(trow.revenue or 0)
        receipts = trow.receipts or 0
        cost = 0.0
        revenue_with_cost = 0.0
        if revenue > 0:
            source = "transactions"

    if source == "transactions":
        cost_coverage_pct = 0.0
    elif revenue > 0:
        cost_coverage_pct = round(revenue_with_cost / revenue * 100, 1)
    else:
        cost_coverage_pct = 0.0

    return {
        "revenue": revenue,
        "cost_of_goods": cost,
        "gross_profit": revenue - cost,
        "items_sold": items_sold,
        "receipts": receipts,
        "avg_receipt": round(revenue / receipts, 0) if receipts else 0,
        "revenue_source": source,
        "cost_coverage_pct": cost_coverage_pct,
    }


async def _get_expenses_split(db: AsyncSession, month: str) -> dict:
    """Расходы за месяц: постоянные (is_recurring=True) и разовые (False)."""
    result = await db.execute(
        select(Expense.is_recurring, func.coalesce(func.sum(Expense.amount), 0))
        .where(Expense.month == month)
        .group_by(Expense.is_recurring)
    )
    recurring = 0.0
    one_off = 0.0
    for is_rec, amt in result.all():
        if is_rec:
            recurring += float(amt)
        else:
            one_off += float(amt)
    return {"recurring": recurring, "one_off": one_off, "total": recurring + one_off}


async def _get_expenses_total(db: AsyncSession, month: str) -> float:
    sp = await _get_expenses_split(db, month)
    return sp["total"]


async def _get_expenses_split_period(db: AsyncSession, start: datetime, end: datetime, month_key: Optional[str]) -> dict:
    """
    Расходы за период. Месяц → точный split. Диапазон → пропорционально дням
    каждого затронутого месяца (чтобы суммы сходились с месячными)..
    """
    if month_key:
        return await _get_expenses_split(db, month_key)

    recurring = 0.0
    one_off = 0.0
    cur = datetime(start.year, start.month, 1, tzinfo=BISHKEK_TZ)
    while cur < end:
        m_str = cur.strftime("%Y-%m")
        m_start, m_end = _month_range(m_str)
        dim = (m_end - m_start).days or 1
        ov_start = max(start, m_start)
        ov_end = min(end, m_end)
        ov_days = max(0, (ov_end - ov_start).days)
        frac = ov_days / dim
        sp = await _get_expenses_split(db, m_str)
        recurring += sp["recurring"] * frac
        one_off += sp["one_off"] * frac
        cur = m_end
    return {"recurring": round(recurring, 2), "one_off": round(one_off, 2), "total": round(recurring + one_off, 2)}


async def _get_bonus_issued(db: AsyncSession, start: datetime, end: datetime) -> float:
    """Начисленные бонусы (обязательство бизнеса) — справочно."""
    result = await db.execute(
        select(func.coalesce(func.sum(Transaction.amount), 0))
        .where(
            Transaction.created_at >= start,
            Transaction.created_at < end,
            Transaction.type.in_([
                TransactionType.EARN, TransactionType.BIRTHDAY, TransactionType.REFERRAL,
                TransactionType.PROMO, TransactionType.CAMPAIGN,
            ]),
        )
    )
    return float(result.scalar() or 0)


async def _get_bonus_redeemed(db: AsyncSession, start: datetime, end: datetime) -> float:
    """Списанные бонусы (SPEND) — реальный расход бизнеса (клиент заплатил бонусами)."""
    result = await db.execute(
        select(func.coalesce(func.sum(Transaction.amount), 0))
        .where(
            Transaction.created_at >= start,
            Transaction.created_at < end,
            Transaction.type == TransactionType.SPEND,
        )
    )
    return float(result.scalar() or 0)


async def _get_bonus_mode(db: AsyncSession) -> str:
    """Какой бонус вычитать из прибыли: 'redeemed' (по умолчанию) | 'issued' | 'none'."""
    result = await db.execute(select(Setting).where(Setting.key == "PNL_BONUS_MODE"))
    s = result.scalar_one_or_none()
    v = (s.value if s and s.value else "redeemed").strip().lower()
    return v if v in ("redeemed", "issued", "none") else "redeemed"


def _bonus_deduction(mode: str, issued: float, redeemed: float) -> float:
    if mode == "issued":
        return issued
    if mode == "none":
        return 0.0
    return redeemed


# ═══════════════════════════════════════════
# 1. SUMMARY — месяц ИЛИ диапазон
# ═══════════════════════════════════════════

@router.get("/summary")
async def financials_summary(
    month: Optional[str] = Query(None, pattern=r"^\d{4}-\d{2}$", description="Месяц (default: текущий)"),
    date_from: Optional[str] = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$", description="Начало диапазона"),
    date_to: Optional[str] = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$", description="Конец диапазона"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN)),
) -> dict:
    """Финансовая сводка за месяц или произвольный диапазон дат."""
    start, end, label, mode, month_key = _resolve_period(month, date_from, date_to)

    rev_data = await _get_revenue_data(db, start, end)
    exp = await _get_expenses_split_period(db, start, end, month_key)
    expenses_total = exp["total"]

    bonus_issued = await _get_bonus_issued(db, start, end)
    bonus_redeemed = await _get_bonus_redeemed(db, start, end)
    bonus_mode = await _get_bonus_mode(db)
    bonus_deducted = _bonus_deduction(bonus_mode, bonus_issued, bonus_redeemed)

    # Расходы по категориям (только режим месяца — у категорий нет дневной гранулярности)
    expense_categories = []
    if month_key:
        cat_result = await db.execute(
            select(Expense.category, func.sum(Expense.amount).label("total"))
            .where(Expense.month == month_key)
            .group_by(Expense.category)
            .order_by(desc("total"))
        )
        expense_categories = [
            {"category": r.category, "label": EXPENSE_CATEGORY_LABELS.get(r.category, r.category), "amount": float(r.total)}
            for r in cat_result.all()
        ]

    gross = rev_data["gross_profit"]
    revenue = rev_data["revenue"]

    net_before_bonus = gross - expenses_total                 # без бонусов (операционная полная)
    net_after_bonus = net_before_bonus - bonus_deducted       # ИТОГ (бонус отдельной строкой)
    operating_net_profit = gross - exp["recurring"]           # без разовых

    margin_pct = round(net_after_bonus / revenue * 100, 1) if revenue > 0 else 0
    operating_margin_pct = round(operating_net_profit / revenue * 100, 1) if revenue > 0 else 0

    # Сравнение с прошлым месяцем — только в режиме месяца
    rev_change = profit_change = None
    prev_revenue = prev_net = None
    if mode == "month":
        prev = _prev_month(month_key)
        prev_start, prev_end = _month_range(prev)
        prev_rev = await _get_revenue_data(db, prev_start, prev_end)
        prev_exp = await _get_expenses_split(db, prev)
        p_issued = await _get_bonus_issued(db, prev_start, prev_end)
        p_redeemed = await _get_bonus_redeemed(db, prev_start, prev_end)
        prev_net = prev_rev["gross_profit"] - prev_exp["total"] - _bonus_deduction(bonus_mode, p_issued, p_redeemed)
        prev_revenue = prev_rev["revenue"]
        rev_change = round((revenue - prev_revenue) / prev_revenue * 100, 1) if prev_revenue > 0 else None
        # % прибыли корректен только при положительной базе прошлого месяца
        profit_change = round((net_after_bonus - prev_net) / abs(prev_net) * 100, 1) if prev_net and prev_net > 0 else None

    return {
        "month": month_key,
        "period": {"mode": mode, "label": label, "date_from": date_from, "date_to": date_to,
                   "start": start.isoformat(), "end": end.isoformat()},
        "revenue": revenue,
        "cost_of_goods": rev_data["cost_of_goods"],
        "gross_profit": gross,
        "gross_margin_pct": round(gross / revenue * 100, 1) if revenue > 0 else 0,
        "operating_expenses": expenses_total,
        "recurring_expenses": exp["recurring"],
        "one_off_expenses": exp["one_off"],
        "total_expenses": expenses_total,
        # Бонусы — ОТДЕЛЬНОЙ строкой
        "bonus_issued": bonus_issued,
        "bonus_redeemed": bonus_redeemed,
        "bonus_mode": bonus_mode,
        "bonus_deducted": bonus_deducted,
        "bonus_expenses": bonus_issued,  # backward-compat
        # Прибыль
        "net_before_bonus": net_before_bonus,
        "net_after_bonus": net_after_bonus,
        "net_profit": net_after_bonus,            # ИТОГ (бонус включён)
        "net_margin_pct": margin_pct,
        "operating_net_profit": operating_net_profit,
        "operating_margin_pct": operating_margin_pct,
        # 1С-качество
        "revenue_source": rev_data["revenue_source"],
        "cost_coverage_pct": rev_data["cost_coverage_pct"],
        "receipts": rev_data["receipts"],
        "avg_receipt": rev_data["avg_receipt"],
        "items_sold": rev_data["items_sold"],
        "expense_categories": expense_categories,
        "vs_prev_month": {
            "revenue_change_pct": rev_change,
            "profit_change_pct": profit_change,
            "prev_revenue": prev_revenue,
            "prev_net_profit": prev_net,
        },
    }


# ═══════════════════════════════════════════
# 2. MONTHLY — помесячная динамика
# ═══════════════════════════════════════════

@router.get("/monthly")
async def monthly_breakdown(
    months: int = Query(6, ge=1, le=12, description="Количество месяцев"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN)),
) -> dict:
    """Помесячная динамика: доход, расход, бонусы, прибыль."""
    data = []
    bonus_mode = await _get_bonus_mode(db)

    month_list = [_current_month()]
    for _ in range(months - 1):
        month_list.append(_prev_month(month_list[-1]))
    month_list.reverse()  # от старых к новым

    for m_str in month_list:
        start, end = _month_range(m_str)
        rev = await _get_revenue_data(db, start, end)
        exp = await _get_expenses_split(db, m_str)
        issued = await _get_bonus_issued(db, start, end)
        redeemed = await _get_bonus_redeemed(db, start, end)
        deducted = _bonus_deduction(bonus_mode, issued, redeemed)
        total_exp = exp["total"]
        net_before_bonus = rev["gross_profit"] - total_exp
        net_after_bonus = net_before_bonus - deducted
        operating_net = rev["gross_profit"] - exp["recurring"]

        y, m = int(m_str[:4]), int(m_str[5:7])
        data.append({
            "month": m_str,
            "month_label": f"{MONTH_NAMES_RU.get(m, m_str)} {y}",
            "revenue": rev["revenue"],
            "cost_of_goods": rev["cost_of_goods"],
            "gross_profit": rev["gross_profit"],
            "operating_expenses": total_exp,
            "recurring_expenses": exp["recurring"],
            "one_off_expenses": exp["one_off"],
            "bonus_issued": issued,
            "bonus_redeemed": redeemed,
            "bonus_expenses": issued,  # backward-compat
            "total_expenses": total_exp,
            "net_before_bonus": net_before_bonus,
            "net_after_bonus": net_after_bonus,
            "net_profit": net_after_bonus,
            "operating_net_profit": operating_net,
            "revenue_source": rev["revenue_source"],
            "cost_coverage_pct": rev["cost_coverage_pct"],
            "receipts": rev["receipts"],
            "avg_receipt": rev["avg_receipt"],
        })

    if len(data) >= 2 and data[0]["revenue"] > 0:
        trend = round(((data[-1]["revenue"] - data[0]["revenue"]) / data[0]["revenue"]) * 100, 1)
    else:
        trend = 0

    return {
        "months": data,
        "bonus_mode": bonus_mode,
        "trend_pct": trend,
        "total_revenue": sum(d["revenue"] for d in data),
        "total_net_profit": sum(d["net_profit"] for d in data),
    }


# ═══════════════════════════════════════════
# 3. DAILY — подневная динамика (НОВОЕ)
# ═══════════════════════════════════════════

def _bishkek_day(col):
    """date_trunc('day', col + 6h) — день по времени магазина (Asia/Bishkek)."""
    return func.date_trunc(literal_column("'day'"), col + literal_column("interval '6 hours'"))


@router.get("/daily")
async def daily_breakdown(
    month: Optional[str] = Query(None, pattern=r"^\d{4}-\d{2}$", description="Месяц (default: текущий)"),
    date_from: Optional[str] = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    date_to: Optional[str] = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN)),
) -> dict:
    """
    Подневная разбивка: выручка, себестоимость, валовая прибыль, бонусы и чистая прибыль по дням.
    Постоянные/разовые расходы хранятся помесячно → распределяются равномерно по дням месяца
    (opex_день = opex_месяца / число_дней_месяца), поэтому сумма дней = месячной прибыли.
    """
    start, end, label, mode, month_key = _resolve_period(month, date_from, date_to)
    bonus_mode = await _get_bonus_mode(db)

    # — Выручка/себестоимость по дням (из purchase_items) —
    cost_price_expr = func.coalesce(PurchaseItem.cost_price, Product.cost_price)
    day_i = _bishkek_day(PurchaseItem.created_at)
    rows = await db.execute(
        select(
            day_i.label("d"),
            func.coalesce(func.sum(PurchaseItem.total), 0).label("revenue"),
            func.coalesce(func.sum(PurchaseItem.quantity * func.coalesce(cost_price_expr, 0)), 0).label("cost"),
            func.coalesce(func.sum(case((cost_price_expr.isnot(None), PurchaseItem.total), else_=0)), 0).label("rev_cost"),
            func.count(func.distinct(PurchaseItem.receipt_number)).label("receipts"),
        )
        .select_from(PurchaseItem)
        .join(Product, Product.id == PurchaseItem.product_id, isouter=True)
        .where(PurchaseItem.created_at >= start, PurchaseItem.created_at < end)
        .group_by(day_i)
    )
    by_day: dict = {}
    total_items_rev = 0.0
    for r in rows.all():
        key = (r.d.strftime("%Y-%m-%d") if hasattr(r.d, "strftime") else str(r.d)[:10])
        rev = float(r.revenue or 0)
        total_items_rev += rev
        by_day[key] = {
            "revenue": rev, "cost": float(r.cost or 0),
            "rev_cost": float(r.rev_cost or 0), "receipts": int(r.receipts or 0),
            "source": "items",
        }

    # — Fallback: если строк чека нет вообще, берём выручку из транзакций —
    if total_items_rev <= 0:
        by_day = {}
        day_t = _bishkek_day(Transaction.created_at)
        trows = await db.execute(
            select(
                day_t.label("d"),
                func.coalesce(func.sum(Transaction.purchase_amount), 0).label("revenue"),
                func.count(Transaction.id).label("receipts"),
            )
            .where(
                Transaction.type == TransactionType.EARN,
                Transaction.created_at >= start, Transaction.created_at < end,
                Transaction.purchase_amount > 0,
            )
            .group_by(day_t)
        )
        for r in trows.all():
            key = (r.d.strftime("%Y-%m-%d") if hasattr(r.d, "strftime") else str(r.d)[:10])
            by_day[key] = {"revenue": float(r.revenue or 0), "cost": 0.0, "rev_cost": 0.0,
                           "receipts": int(r.receipts or 0), "source": "transactions"}

    # — Бонусы по дням (issued + redeemed) —
    day_b = _bishkek_day(Transaction.created_at)
    issued_types = [TransactionType.EARN, TransactionType.BIRTHDAY, TransactionType.REFERRAL,
                    TransactionType.PROMO, TransactionType.CAMPAIGN]
    brows = await db.execute(
        select(
            day_b.label("d"),
            func.coalesce(func.sum(case((Transaction.type == TransactionType.SPEND, Transaction.amount), else_=0)), 0).label("redeemed"),
            func.coalesce(func.sum(case((Transaction.type.in_(issued_types), Transaction.amount), else_=0)), 0).label("issued"),
        )
        .where(Transaction.created_at >= start, Transaction.created_at < end)
        .group_by(day_b)
    )
    bonus_by_day: dict = {}
    for r in brows.all():
        key = (r.d.strftime("%Y-%m-%d") if hasattr(r.d, "strftime") else str(r.d)[:10])
        bonus_by_day[key] = {"redeemed": float(r.redeemed or 0), "issued": float(r.issued or 0)}

    # — opex по дням (помесячно / дней в месяце), кэш по месяцам —
    opex_cache: dict = {}
    async def _opex_day(d: datetime) -> dict:
        mk = d.strftime("%Y-%m")
        if mk not in opex_cache:
            sp = await _get_expenses_split(db, mk)
            dim = _days_in_month(mk)
            opex_cache[mk] = {
                "recurring": sp["recurring"] / dim, "one_off": sp["one_off"] / dim, "total": sp["total"] / dim,
            }
        return opex_cache[mk]

    # — Собираем все дни периода —
    days = []
    totals = {"revenue": 0.0, "cost": 0.0, "gross": 0.0, "opex": 0.0,
              "bonus_redeemed": 0.0, "bonus_issued": 0.0, "net": 0.0, "receipts": 0}
    cur = start
    while cur < end:
        key = cur.strftime("%Y-%m-%d")
        d = by_day.get(key, {"revenue": 0.0, "cost": 0.0, "rev_cost": 0.0, "receipts": 0, "source": "items"})
        b = bonus_by_day.get(key, {"redeemed": 0.0, "issued": 0.0})
        opx = await _opex_day(cur)

        revenue = d["revenue"]
        cost = d["cost"]
        gross = revenue - cost
        deducted = _bonus_deduction(bonus_mode, b["issued"], b["redeemed"])
        net = gross - opx["total"] - deducted
        cov = round(d["rev_cost"] / revenue * 100, 1) if revenue > 0 else 0.0

        days.append({
            "date": key,
            "label": cur.strftime("%d.%m"),
            "weekday": cur.weekday(),  # 0=Пн
            "revenue": round(revenue, 2),
            "cost_of_goods": round(cost, 2),
            "gross_profit": round(gross, 2),
            "opex": round(opx["total"], 2),
            "bonus_redeemed": round(b["redeemed"], 2),
            "bonus_issued": round(b["issued"], 2),
            "net_profit": round(net, 2),
            "receipts": d["receipts"],
            "cost_coverage_pct": cov,
            "revenue_source": d.get("source", "items"),
        })
        totals["revenue"] += revenue
        totals["cost"] += cost
        totals["gross"] += gross
        totals["opex"] += opx["total"]
        totals["bonus_redeemed"] += b["redeemed"]
        totals["bonus_issued"] += b["issued"]
        totals["net"] += net
        totals["receipts"] += d["receipts"]
        cur += timedelta(days=1)

    best = max(days, key=lambda x: x["revenue"], default=None)
    active = [x for x in days if x["revenue"] > 0]

    return {
        "period": {"mode": mode, "label": label, "month": month_key,
                   "date_from": date_from, "date_to": date_to},
        "bonus_mode": bonus_mode,
        "days": days,
        "totals": {
            "revenue": round(totals["revenue"], 2),
            "cost_of_goods": round(totals["cost"], 2),
            "gross_profit": round(totals["gross"], 2),
            "opex": round(totals["opex"], 2),
            "bonus_redeemed": round(totals["bonus_redeemed"], 2),
            "bonus_issued": round(totals["bonus_issued"], 2),
            "net_profit": round(totals["net"], 2),
            "receipts": totals["receipts"],
            "days_count": len(days),
            "active_days": len(active),
            "avg_daily_revenue": round(totals["revenue"] / len(active), 2) if active else 0,
            "best_day": best["date"] if best and best["revenue"] > 0 else None,
            "best_day_revenue": best["revenue"] if best else 0,
        },
    }


# ═══════════════════════════════════════════
# 4. P&L REPORT
# ═══════════════════════════════════════════

@router.get("/pnl")
async def pnl_report(
    month: Optional[str] = Query(None, pattern=r"^\d{4}-\d{2}$"),
    date_from: Optional[str] = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    date_to: Optional[str] = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_role(UserRole.SUPER_ADMIN)),
) -> dict:
    """Полный P&L отчёт (Profit & Loss) с бонусами отдельной строкой."""
    start, end, label, mode, month_key = _resolve_period(month, date_from, date_to)

    rev = await _get_revenue_data(db, start, end)

    # Расходы по категориям (режим месяца)
    expense_lines = []
    total_opex = Decimal("0")
    if month_key:
        cat_result = await db.execute(
            select(Expense.category, func.sum(Expense.amount).label("total"))
            .where(Expense.month == month_key)
            .group_by(Expense.category)
            .order_by(desc("total"))
        )
        for r in cat_result.all():
            amt = float(r.total)
            total_opex += Decimal(str(amt))
            expense_lines.append({
                "category": r.category,
                "label": EXPENSE_CATEGORY_LABELS.get(r.category, r.category),
                "amount": amt,
            })
        exp_split = await _get_expenses_split(db, month_key)
    else:
        exp_split = await _get_expenses_split_period(db, start, end, None)
        total_opex = Decimal(str(exp_split["total"]))

    bonus_issued = await _get_bonus_issued(db, start, end)
    bonus_redeemed = await _get_bonus_redeemed(db, start, end)
    bonus_mode = await _get_bonus_mode(db)
    bonus_deducted = _bonus_deduction(bonus_mode, bonus_issued, bonus_redeemed)

    revenue = rev["revenue"]
    cogs = rev["cost_of_goods"]
    gross = revenue - cogs
    opex = float(total_opex)
    net_before_bonus = gross - opex
    net_after_bonus = net_before_bonus - bonus_deducted
    operating_net = gross - exp_split["recurring"]

    return {
        "month": month_key,
        "period": {"mode": mode, "label": label, "date_from": date_from, "date_to": date_to},
        "revenue_source": rev["revenue_source"],
        "cost_coverage_pct": rev["cost_coverage_pct"],
        "bonus_mode": bonus_mode,
        "report": {
            "revenue": {"label": "Выручка (продажи)", "amount": revenue},
            "cost_of_goods": {"label": "Себестоимость товаров", "amount": -cogs},
            "gross_profit": {
                "label": "Валовая прибыль",
                "amount": gross,
                "margin_pct": round(gross / revenue * 100, 1) if revenue > 0 else 0,
            },
            "operating_expenses": {
                "label": "Операционные расходы",
                "total": -opex,
                "lines": expense_lines,
            },
            "one_off_expenses": exp_split["one_off"],
            "recurring_expenses": exp_split["recurring"],
            "operating_net_profit": {
                "label": "Операционная прибыль (без разовых)",
                "amount": operating_net,
                "margin_pct": round(operating_net / revenue * 100, 1) if revenue > 0 else 0,
            },
            "net_before_bonus": {
                "label": "Прибыль до бонусов",
                "amount": net_before_bonus,
                "margin_pct": round(net_before_bonus / revenue * 100, 1) if revenue > 0 else 0,
            },
            "bonus": {
                "label": "Бонусы клиентам" + (" (списано)" if bonus_mode == "redeemed" else (" (начислено)" if bonus_mode == "issued" else " (справочно)")),
                "amount": -bonus_deducted,
                "issued": bonus_issued,
                "redeemed": bonus_redeemed,
            },
            "net_profit": {
                "label": "Чистая прибыль",
                "amount": net_after_bonus,
                "margin_pct": round(net_after_bonus / revenue * 100, 1) if revenue > 0 else 0,
            },
        },
    }


# ═══════════════════════════════════════════
# 5. EXPENSES CRUD
# ═══════════════════════════════════════════

@router.get("/expenses")
async def list_expenses(
    month: Optional[str] = Query(None, pattern=r"^\d{4}-\d{2}$"),
    category: Optional[str] = None,
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN)),
) -> dict:
    """Список расходов."""
    query = select(Expense).order_by(desc(Expense.created_at))
    if month:
        query = query.where(Expense.month == month)
    if category:
        query = query.where(Expense.category == category)
    query = query.limit(limit)

    result = await db.execute(query)
    expenses = result.scalars().all()

    return {
        "total": len(expenses),
        "expenses": [
            {
                "id": str(e.id),
                "category": e.category,
                "category_label": EXPENSE_CATEGORY_LABELS.get(e.category, e.category),
                "amount": float(e.amount),
                "month": e.month,
                "description": e.description,
                "source": e.source,
                "is_recurring": e.is_recurring,
                "created_at": e.created_at.isoformat() if e.created_at else None,
            }
            for e in expenses
        ],
        "categories": list(EXPENSE_CATEGORY_LABELS.items()),
    }


@router.post("/expenses")
async def create_expense(
    data: ExpenseCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_role(UserRole.SUPER_ADMIN)),
) -> dict:
    """Добавить расход."""
    expense = Expense(
        category=data.category.strip()[:CAT_MAXLEN],
        amount=Decimal(str(data.amount)),
        month=data.month,
        description=data.description,
        branch_id=uuid.UUID(data.branch_id) if data.branch_id else None,
        is_recurring=data.is_recurring,
        source="manual",
        created_by=uuid.UUID(current_user.get("sub")) if current_user.get("sub") else None,
    )
    db.add(expense)
    await db.commit()
    await db.refresh(expense)
    return {
        "success": True,
        "id": str(expense.id),
        "message": f"Расход {EXPENSE_CATEGORY_LABELS.get(expense.category, expense.category)} на {data.amount:,.0f} сом добавлен",
    }


@router.put("/expenses/{expense_id}")
async def update_expense(
    expense_id: str,
    data: ExpenseUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_role(UserRole.SUPER_ADMIN)),
) -> dict:
    """Изменить расход."""
    result = await db.execute(select(Expense).where(Expense.id == uuid.UUID(expense_id)))
    expense = result.scalar_one_or_none()
    if not expense:
        raise HTTPException(status_code=404, detail="Расход не найден")

    if data.category is not None:
        expense.category = data.category.strip()[:CAT_MAXLEN]
    if data.amount is not None:
        expense.amount = Decimal(str(data.amount))
    if data.month is not None:
        expense.month = data.month
    if data.description is not None:
        expense.description = data.description
    if data.is_recurring is not None:
        expense.is_recurring = data.is_recurring

    await db.commit()
    return {"success": True, "message": "Расход обновлён"}


@router.delete("/expenses/{expense_id}")
async def delete_expense(
    expense_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_role(UserRole.SUPER_ADMIN)),
) -> dict:
    """Удалить расход."""
    result = await db.execute(select(Expense).where(Expense.id == uuid.UUID(expense_id)))
    expense = result.scalar_one_or_none()
    if not expense:
        raise HTTPException(status_code=404, detail="Расход не найден")

    await db.delete(expense)
    await db.commit()
    return {"success": True, "message": "Расход удалён"}


# ═══════════════════════════════════════════
# 6. BY CASHIER — выручка по кассирам
# ═══════════════════════════════════════════

@router.get("/by-cashier")
async def revenue_by_cashier(
    month: Optional[str] = Query(None, pattern=r"^\d{4}-\d{2}$"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN)),
) -> dict:
    """Выручка по кассирам за месяц."""
    target = month or _current_month()
    start, end = _month_range(target)

    result = await db.execute(
        select(
            Transaction.cashier_id,
            User.full_name.label("cashier_name"),
            func.count(Transaction.id).label("tx_count"),
            func.coalesce(func.sum(Transaction.purchase_amount), 0).label("total_revenue"),
            func.coalesce(func.sum(
                case(
                    (Transaction.type == TransactionType.EARN, Transaction.amount),
                    else_=Decimal("0"),
                )
            ), 0).label("bonuses_earned"),
            func.coalesce(func.sum(
                case(
                    (Transaction.type == TransactionType.SPEND, Transaction.amount),
                    else_=Decimal("0"),
                )
            ), 0).label("bonuses_spent"),
        )
        .outerjoin(User, User.id == Transaction.cashier_id)
        .where(
            Transaction.created_at >= start,
            Transaction.created_at < end,
            Transaction.cashier_id != None,
            Transaction.type.in_([TransactionType.EARN, TransactionType.SPEND]),
        )
        .group_by(Transaction.cashier_id, User.full_name)
        .order_by(desc("total_revenue"))
    )

    cashiers = []
    for r in result.all():
        cashiers.append({
            "cashier_id": str(r.cashier_id) if r.cashier_id else None,
            "cashier_name": r.cashier_name or "Неизвестный",
            "transactions": r.tx_count,
            "revenue": float(r.total_revenue),
            "bonuses_earned": float(r.bonuses_earned),
            "bonuses_spent": float(r.bonuses_spent),
        })

    return {"month": target, "cashiers": cashiers}


# ═══════════════════════════════════════════
# 7. BY CATEGORY — расходы по категориям (для PieChart)
# ═══════════════════════════════════════════

@router.get("/by-category")
async def expenses_by_category(
    month: Optional[str] = Query(None, pattern=r"^\d{4}-\d{2}$"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN)),
) -> dict:
    """Расходы по категориям за месяц."""
    target = month or _current_month()

    result = await db.execute(
        select(Expense.category, func.sum(Expense.amount).label("total"))
        .where(Expense.month == target)
        .group_by(Expense.category)
        .order_by(desc("total"))
    )

    categories = []
    total = Decimal("0")
    for r in result.all():
        amt = float(r.total)
        total += Decimal(str(amt))
        categories.append({
            "category": r.category,
            "label": EXPENSE_CATEGORY_LABELS.get(r.category, r.category),
            "amount": amt,
        })

    for c in categories:
        c["percent"] = round((c["amount"] / float(total)) * 100, 1) if total > 0 else 0

    return {"month": target, "total": float(total), "categories": categories}


# ═══════════════════════════════════════════
# 8. PLAN/FACT
# ═══════════════════════════════════════════

@router.get("/plan-fact")
async def plan_fact(
    month: Optional[str] = Query(None, pattern=r"^\d{4}-\d{2}$"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_role(UserRole.SUPER_ADMIN)),
) -> dict:
    """План vs Факт (план берётся из DB Settings)."""
    target = month or _current_month()
    start, end = _month_range(target)

    rev = await _get_revenue_data(db, start, end)
    expenses = await _get_expenses_total(db, target)
    issued = await _get_bonus_issued(db, start, end)
    redeemed = await _get_bonus_redeemed(db, start, end)
    bonus_mode = await _get_bonus_mode(db)
    net = rev["gross_profit"] - expenses - _bonus_deduction(bonus_mode, issued, redeemed)

    plan_revenue = await _get_plan_setting(db, f"PLAN_REVENUE_{target}", "0")
    plan_expenses = await _get_plan_setting(db, f"PLAN_EXPENSES_{target}", "0")
    plan_profit = await _get_plan_setting(db, f"PLAN_PROFIT_{target}", "0")

    def _pf(plan: float, fact: float) -> dict:
        return {
            "plan": plan,
            "fact": fact,
            "diff": fact - plan,
            "pct": round((fact / plan) * 100, 1) if plan > 0 else 0,
        }

    return {
        "month": target,
        "revenue": _pf(plan_revenue, rev["revenue"]),
        "expenses": _pf(plan_expenses, expenses),
        "net_profit": _pf(plan_profit, net),
    }


async def _get_plan_setting(db: AsyncSession, key: str, default: str) -> float:
    result = await db.execute(select(Setting).where(Setting.key == key))
    s = result.scalar_one_or_none()
    return float(s.value) if s else float(default)


@router.put("/plan")
async def set_plan(
    month: str = Query(..., pattern=r"^\d{4}-\d{2}$"),
    revenue: Optional[float] = None,
    expenses: Optional[float] = None,
    profit: Optional[float] = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_role(UserRole.SUPER_ADMIN)),
) -> dict:
    """Установить план на месяц."""
    updates = {}
    if revenue is not None:
        updates[f"PLAN_REVENUE_{month}"] = str(revenue)
    if expenses is not None:
        updates[f"PLAN_EXPENSES_{month}"] = str(expenses)
    if profit is not None:
        updates[f"PLAN_PROFIT_{month}"] = str(profit)

    for key, value in updates.items():
        result = await db.execute(select(Setting).where(Setting.key == key))
        setting = result.scalar_one_or_none()
        if setting:
            setting.value = value
        else:
            db.add(Setting(key=key, value=value))

    await db.commit()
    return {"success": True, "updated": list(updates.keys())}


# ─── PIN-защита P&L ───

import hashlib
import hmac
import os

# Соль из окружения (FINANCIALS_PIN_SALT). Фолбэк оставлен для обратной совместимости
# с уже установленными PIN. РЕКОМЕНДАЦИЯ: задать FINANCIALS_PIN_SALT в .env.production.
_PIN_SALT = os.getenv("FINANCIALS_PIN_SALT", "sbonus_pnl_salt_2026")


def _hash_pin(pin: str) -> str:
    """PBKDF2-HMAC-SHA256 (медленный) хэш пин-кода — стойкий к перебору."""
    dk = hashlib.pbkdf2_hmac("sha256", pin.encode(), _PIN_SALT.encode(), 200_000)
    return dk.hex()


_LEGACY_PIN_SALT = "sbonus_pnl_salt_2026"  # фикс. соль старого формата — чтобы ранее заданные PIN продолжали работать

def _hash_pin_legacy(pin: str) -> str:
    """Старый формат (одиночный SHA256, фиксированная соль) — для ранее установленных PIN."""
    return hashlib.sha256(f"{_LEGACY_PIN_SALT}:{pin}".encode()).hexdigest()


class PinVerify(BaseModel):
    pin: str = Field(..., min_length=4, max_length=8, description="PIN-код")


class PinSet(BaseModel):
    pin: str = Field(..., min_length=4, max_length=8, description="Новый PIN-код")
    current_pin: Optional[str] = Field(None, description="Текущий PIN (для смены)")


@router.post("/verify-pin")
async def verify_pin(
    body: PinVerify,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Проверить PIN-код для доступа к P&L (с авто-апгрейдом старого хэша)."""
    result = await db.execute(
        select(Setting).where(Setting.key == "FINANCIALS_PIN")
    )
    setting = result.scalar_one_or_none()

    if not setting:
        raise HTTPException(400, "PIN-код не установлен. Обратитесь к администратору.")

    ok = hmac.compare_digest(_hash_pin(body.pin), setting.value)
    if not ok and hmac.compare_digest(_hash_pin_legacy(body.pin), setting.value):
        # Старый PIN верный → апгрейдим на PBKDF2 «на лету»
        setting.value = _hash_pin(body.pin)
        await db.commit()
        ok = True

    if not ok:
        raise HTTPException(403, "Неверный PIN-код")

    return {"success": True, "message": "Доступ разрешён"}


@router.put("/pin")
async def set_pin(
    body: PinSet,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_role(UserRole.SUPER_ADMIN)),
) -> dict:
    """Установить / сменить PIN-код (только SUPER_ADMIN)."""
    result = await db.execute(
        select(Setting).where(Setting.key == "FINANCIALS_PIN")
    )
    existing = result.scalar_one_or_none()

    if existing and existing.value:
        if not body.current_pin:
            raise HTTPException(400, "Укажите текущий PIN для смены")
        valid = hmac.compare_digest(_hash_pin(body.current_pin), existing.value) or \
                hmac.compare_digest(_hash_pin_legacy(body.current_pin), existing.value)
        if not valid:
            raise HTTPException(403, "Текущий PIN неверный")
        existing.value = _hash_pin(body.pin)
    else:
        if existing:
            existing.value = _hash_pin(body.pin)
        else:
            db.add(Setting(key="FINANCIALS_PIN", value=_hash_pin(body.pin)))

    await db.commit()
    return {"success": True, "message": "PIN-код установлен"}


@router.get("/pin-status")
async def pin_status(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Проверить — установлен ли PIN."""
    result = await db.execute(
        select(Setting).where(Setting.key == "FINANCIALS_PIN")
    )
    setting = result.scalar_one_or_none()
    has_pin = bool(setting and setting.value)
    return {"has_pin": has_pin}
