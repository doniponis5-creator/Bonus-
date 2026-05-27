"""
SBonus+ — Финансовая аналитика (P&L).

Доход:   purchase_items (товар сотувлари, 1С дан)
Расход:  expenses жадвали (қўлда + 1С)
Прибыль: Доход - Себестоимость - Расходы

Endpoints:
  GET  /api/v1/financials/summary         — текущий месяц обзор
  GET  /api/v1/financials/monthly         — помесячная динамика (до 12 мес)
  GET  /api/v1/financials/pnl             — P&L отчёт (месяц/квартал)
  GET  /api/v1/financials/expenses        — список расходов
  POST /api/v1/financials/expenses        — добавить расход
  PUT  /api/v1/financials/expenses/{id}   — изменить расход
  DELETE /api/v1/financials/expenses/{id} — удалить расход
  GET  /api/v1/financials/by-cashier      — выручка по кассирам
  GET  /api/v1/financials/by-category     — расходы по категориям
  GET  /api/v1/financials/plan-fact       — план vs факт
"""

import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import case, desc, func, select, and_, extract
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


# ─── Helpers ───

def _month_range(month_str: str):
    """'2026-05' → (start_dt, end_dt) UTC."""
    y, m = int(month_str[:4]), int(month_str[5:7])
    start = datetime(y, m, 1, tzinfo=timezone.utc)
    if m == 12:
        end = datetime(y + 1, 1, 1, tzinfo=timezone.utc)
    else:
        end = datetime(y, m + 1, 1, tzinfo=timezone.utc)
    return start, end

def _current_month() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")

def _prev_month(month_str: str) -> str:
    y, m = int(month_str[:4]), int(month_str[5:7])
    if m == 1:
        return f"{y-1}-12"
    return f"{y}-{m-1:02d}"

MONTH_NAMES_RU = {
    1: "Янв", 2: "Фев", 3: "Мар", 4: "Апр", 5: "Май", 6: "Июн",
    7: "Июл", 8: "Авг", 9: "Сен", 10: "Окт", 11: "Ноя", 12: "Дек",
}


async def _get_revenue_data(db: AsyncSession, start: datetime, end: datetime) -> dict:
    """Выручка и себестоимость из purchase_items за период."""
    result = await db.execute(
        select(
            func.coalesce(func.sum(PurchaseItem.total), 0).label("revenue"),
            func.coalesce(func.sum(PurchaseItem.quantity * Product.cost_price), 0).label("cost"),
            func.coalesce(func.sum(PurchaseItem.quantity), 0).label("items_sold"),
            func.count(func.distinct(PurchaseItem.receipt_number)).label("receipts"),
        )
        .join(Product, Product.id == PurchaseItem.product_id)
        .where(
            PurchaseItem.created_at >= start,
            PurchaseItem.created_at < end,
            Product.cost_price != None,
            Product.cost_price > 0,
        )
    )
    row = result.one()
    revenue = float(row.revenue or 0)
    cost = float(row.cost or 0)

    # Также считаем выручку БЕЗ фильтра cost_price (полная выручка)
    full_rev = await db.execute(
        select(func.coalesce(func.sum(PurchaseItem.total), 0))
        .where(PurchaseItem.created_at >= start, PurchaseItem.created_at < end)
    )
    full_revenue = float(full_rev.scalar() or 0)

    return {
        "revenue": full_revenue,
        "cost_of_goods": cost,
        "gross_profit": full_revenue - cost,
        "items_sold": float(row.items_sold or 0),
        "receipts": row.receipts or 0,
        "avg_receipt": round(full_revenue / row.receipts, 0) if row.receipts else 0,
    }


async def _get_expenses_total(db: AsyncSession, month: str) -> float:
    """Сумма расходов за месяц."""
    result = await db.execute(
        select(func.coalesce(func.sum(Expense.amount), 0))
        .where(Expense.month == month)
    )
    return float(result.scalar() or 0)


async def _get_bonus_expense(db: AsyncSession, start: datetime, end: datetime) -> float:
    """Расходы на бонусы (выданные бонусы = расход для бизнеса)."""
    result = await db.execute(
        select(func.coalesce(func.sum(Transaction.amount), 0))
        .where(
            Transaction.created_at >= start,
            Transaction.created_at < end,
            Transaction.type.in_([
                TransactionType.EARN,
                TransactionType.BIRTHDAY,
                TransactionType.REFERRAL,
                TransactionType.PROMO,
                TransactionType.CAMPAIGN,
            ]),
        )
    )
    return float(result.scalar() or 0)


# ═══════════════════════════════════════════
# 1. SUMMARY — текущий месяц
# ═══════════════════════════════════════════

@router.get("/summary")
async def financials_summary(
    month: Optional[str] = Query(None, pattern=r"^\d{4}-\d{2}$", description="Месяц (default: текущий)"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN)),
) -> dict:
    """Финансовая сводка за месяц."""
    target_month = month or _current_month()
    start, end = _month_range(target_month)

    # Доход
    rev_data = await _get_revenue_data(db, start, end)

    # Расходы
    expenses_total = await _get_expenses_total(db, target_month)

    # Бонусы (тоже расход)
    bonus_expense = await _get_bonus_expense(db, start, end)

    # Расходы по категориям
    cat_result = await db.execute(
        select(Expense.category, func.sum(Expense.amount).label("total"))
        .where(Expense.month == target_month)
        .group_by(Expense.category)
        .order_by(desc("total"))
    )
    expense_categories = [
        {"category": r.category, "label": EXPENSE_CATEGORY_LABELS.get(r.category, r.category), "amount": float(r.total)}
        for r in cat_result.all()
    ]

    total_expenses = expenses_total  # Бонусы НЕ входят в расходы
    net_profit = rev_data["gross_profit"] - total_expenses
    margin_pct = round((net_profit / rev_data["revenue"]) * 100, 1) if rev_data["revenue"] > 0 else 0

    # Предыдущий месяц для сравнения
    prev = _prev_month(target_month)
    prev_start, prev_end = _month_range(prev)
    prev_rev = await _get_revenue_data(db, prev_start, prev_end)
    prev_expenses = await _get_expenses_total(db, prev)
    prev_bonus = await _get_bonus_expense(db, prev_start, prev_end)
    prev_net = prev_rev["gross_profit"] - prev_expenses  # Без бонусов

    rev_change = round(((rev_data["revenue"] - prev_rev["revenue"]) / prev_rev["revenue"]) * 100, 1) if prev_rev["revenue"] > 0 else 0
    profit_change = round(((net_profit - prev_net) / abs(prev_net)) * 100, 1) if prev_net != 0 else 0

    return {
        "month": target_month,
        "revenue": rev_data["revenue"],
        "cost_of_goods": rev_data["cost_of_goods"],
        "gross_profit": rev_data["gross_profit"],
        "gross_margin_pct": round((rev_data["gross_profit"] / rev_data["revenue"]) * 100, 1) if rev_data["revenue"] > 0 else 0,
        "operating_expenses": expenses_total,
        "bonus_expenses": bonus_expense,
        "total_expenses": total_expenses,
        "net_profit": net_profit,
        "net_margin_pct": margin_pct,
        "receipts": rev_data["receipts"],
        "avg_receipt": rev_data["avg_receipt"],
        "items_sold": rev_data["items_sold"],
        "expense_categories": expense_categories,
        "vs_prev_month": {
            "revenue_change_pct": rev_change,
            "profit_change_pct": profit_change,
            "prev_revenue": prev_rev["revenue"],
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
    """Помесячная динамика: доход, расход, прибыль."""
    now = datetime.now(timezone.utc)
    data = []

    for i in range(months - 1, -1, -1):
        # Вычисляем месяц
        target = now - timedelta(days=i * 30)
        m_str = target.strftime("%Y-%m")
        start, end = _month_range(m_str)

        rev = await _get_revenue_data(db, start, end)
        expenses = await _get_expenses_total(db, m_str)
        bonus = await _get_bonus_expense(db, start, end)
        total_exp = expenses  # Без бонусов
        net = rev["gross_profit"] - total_exp

        y, m = int(m_str[:4]), int(m_str[5:7])

        data.append({
            "month": m_str,
            "month_label": f"{MONTH_NAMES_RU.get(m, m_str)} {y}",
            "revenue": rev["revenue"],
            "cost_of_goods": rev["cost_of_goods"],
            "gross_profit": rev["gross_profit"],
            "operating_expenses": expenses,
            "bonus_expenses": bonus,
            "total_expenses": total_exp,
            "net_profit": net,
            "receipts": rev["receipts"],
            "avg_receipt": rev["avg_receipt"],
        })

    # Тренд
    if len(data) >= 2:
        first_rev = data[0]["revenue"]
        last_rev = data[-1]["revenue"]
        trend = round(((last_rev - first_rev) / first_rev) * 100, 1) if first_rev > 0 else 0
    else:
        trend = 0

    return {
        "months": data,
        "trend_pct": trend,
        "total_revenue": sum(d["revenue"] for d in data),
        "total_net_profit": sum(d["net_profit"] for d in data),
    }


# ═══════════════════════════════════════════
# 3. P&L REPORT
# ═══════════════════════════════════════════

@router.get("/pnl")
async def pnl_report(
    month: Optional[str] = Query(None, pattern=r"^\d{4}-\d{2}$"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_role(UserRole.SUPER_ADMIN)),
) -> dict:
    """Полный P&L отчёт (Profit & Loss)."""
    target = month or _current_month()
    start, end = _month_range(target)

    rev = await _get_revenue_data(db, start, end)

    # Расходы по категориям
    cat_result = await db.execute(
        select(Expense.category, func.sum(Expense.amount).label("total"))
        .where(Expense.month == target)
        .group_by(Expense.category)
        .order_by(desc("total"))
    )
    expense_lines = []
    total_opex = Decimal("0")
    for r in cat_result.all():
        amt = float(r.total)
        total_opex += Decimal(str(amt))
        expense_lines.append({
            "category": r.category,
            "label": EXPENSE_CATEGORY_LABELS.get(r.category, r.category),
            "amount": amt,
        })

    bonus = await _get_bonus_expense(db, start, end)

    # Бонусы, потраченные клиентами (это вычет из выручки)
    bonus_spent = await db.execute(
        select(func.coalesce(func.sum(Transaction.amount), 0))
        .where(
            Transaction.created_at >= start,
            Transaction.created_at < end,
            Transaction.type == TransactionType.SPEND,
        )
    )
    spent_val = float(bonus_spent.scalar() or 0)

    revenue = rev["revenue"]
    cogs = rev["cost_of_goods"]
    gross = revenue - cogs
    opex = float(total_opex)
    net = gross - opex  # Без бонусов

    return {
        "month": target,
        "report": {
            "revenue": {
                "label": "Выручка (продажи)",
                "amount": revenue,
            },
            "cost_of_goods": {
                "label": "Себестоимость товаров",
                "amount": -cogs,
            },
            "gross_profit": {
                "label": "Валовая прибыль",
                "amount": gross,
                "margin_pct": round((gross / revenue) * 100, 1) if revenue > 0 else 0,
            },
            "operating_expenses": {
                "label": "Операционные расходы",
                "total": -opex,
                "lines": expense_lines,
            },
            "net_profit": {
                "label": "Чистая прибыль",
                "amount": net,
                "margin_pct": round((net / revenue) * 100, 1) if revenue > 0 else 0,
            },
        },
    }


# ═══════════════════════════════════════════
# 4. EXPENSES CRUD
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
        category=data.category,
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
        "message": f"Расход {EXPENSE_CATEGORY_LABELS.get(data.category, data.category)} на {data.amount:,.0f} сом добавлен",
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
        expense.category = data.category
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
# 5. BY CASHIER — выручка по кассирам
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
# 6. BY CATEGORY — расходы по категориям (для PieChart)
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

    # Добавляем проценты
    for c in categories:
        c["percent"] = round((c["amount"] / float(total)) * 100, 1) if total > 0 else 0

    return {"month": target, "total": float(total), "categories": categories}


# ═══════════════════════════════════════════
# 7. PLAN/FACT
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

    # Факт
    rev = await _get_revenue_data(db, start, end)
    expenses = await _get_expenses_total(db, target)
    bonus = await _get_bonus_expense(db, start, end)
    net = rev["gross_profit"] - expenses  # Без бонусов

    # План из Settings
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

def _hash_pin(pin: str) -> str:
    """SHA256 хэш пин-кода с солью."""
    salt = "sbonus_pnl_salt_2026"
    return hashlib.sha256(f"{salt}:{pin}".encode()).hexdigest()


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
    """Проверить PIN-код для доступа к P&L."""
    result = await db.execute(
        select(Setting).where(Setting.key == "FINANCIALS_PIN")
    )
    setting = result.scalar_one_or_none()

    if not setting:
        raise HTTPException(400, "PIN-код не установлен. Обратитесь к администратору.")

    if _hash_pin(body.pin) != setting.value:
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

    # Если PIN уже есть — проверяем старый
    if existing and existing.value:
        if not body.current_pin:
            raise HTTPException(400, "Укажите текущий PIN для смены")
        if _hash_pin(body.current_pin) != existing.value:
            raise HTTPException(403, "Текущий PIN неверный")
        existing.value = _hash_pin(body.pin)
    else:
        # Первая установка
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
