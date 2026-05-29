"""
SBonus+ — Revenue Forecast API.

Прогнозирование выручки на основе исторических данных:
- Линейная регрессия по ежедневной/ежемесячной выручке
- Сезонность (день недели)
- Средний чек × кол-во транзакций
- Прогноз на 7/14/30 дней

GET /api/v1/forecast/revenue     — прогноз выручки
GET /api/v1/forecast/customers   — прогноз роста клиентов
GET /api/v1/forecast/summary     — сводный прогноз
"""

import logging
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from statistics import mean, stdev

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, and_, case, extract
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import UserRole, require_role
from app.models import (
    Customer, Transaction, TransactionType,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/forecast",
    tags=["Forecast"],
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN))],
)


def _linear_regression(x_vals: list, y_vals: list) -> tuple:
    """Simple linear regression: y = mx + b."""
    n = len(x_vals)
    if n < 2:
        return (0, mean(y_vals) if y_vals else 0)
    x_mean = mean(x_vals)
    y_mean = mean(y_vals)
    numerator = sum((x_vals[i] - x_mean) * (y_vals[i] - y_mean) for i in range(n))
    denominator = sum((x_vals[i] - x_mean) ** 2 for i in range(n))
    if denominator == 0:
        return (0, y_mean)
    m = numerator / denominator
    b = y_mean - m * x_mean
    return (m, b)


@router.get("/revenue")
async def forecast_revenue(
    history_days: int = Query(default=90, ge=30, le=365),
    forecast_days: int = Query(default=30, ge=7, le=90),
    db: AsyncSession = Depends(get_db),
):
    """
    Прогноз выручки на основе исторических данных.

    Метод: линейная регрессия + поправка на день недели (сезонность).
    """
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=history_days)

    # Daily revenue history
    daily_result = await db.execute(
        select(
            func.date_trunc(func.literal_column("'day'"), Transaction.created_at).label("day"),
            func.sum(Transaction.purchase_amount).label("revenue"),
            func.count(Transaction.id).label("tx_count"),
            func.count(func.distinct(Transaction.customer_id)).label("customers"),
        ).where(
            and_(
                Transaction.type == TransactionType.EARN,
                Transaction.created_at >= since,
            )
        ).group_by(func.date_trunc(func.literal_column("'day'"), Transaction.created_at))
        .order_by(func.date_trunc(func.literal_column("'day'"), Transaction.created_at))
    )

    daily_data = []
    for r in daily_result.all():
        daily_data.append({
            "date": r.day.strftime("%Y-%m-%d"),
            "dow": r.day.weekday(),  # 0=Mon, 6=Sun
            "revenue": float(r.revenue or 0),
            "tx_count": r.tx_count,
            "customers": r.customers,
        })

    if len(daily_data) < 7:
        return {
            "error": "Недостаточно данных для прогноза",
            "history": daily_data,
            "forecast": [],
        }

    # Day-of-week seasonality factors
    dow_revenues: dict = {i: [] for i in range(7)}
    for d in daily_data:
        dow_revenues[d["dow"]].append(d["revenue"])

    overall_avg = mean([d["revenue"] for d in daily_data]) or 1
    dow_factors = {}
    for dow, revs in dow_revenues.items():
        if revs:
            dow_factors[dow] = mean(revs) / overall_avg
        else:
            dow_factors[dow] = 1.0

    # Linear regression on de-seasonalized data
    x_vals = list(range(len(daily_data)))
    y_vals = [d["revenue"] / max(dow_factors.get(d["dow"], 1), 0.1) for d in daily_data]

    slope, intercept = _linear_regression(x_vals, y_vals)

    # Generate forecast
    forecast = []
    last_idx = len(daily_data) - 1
    for i in range(1, forecast_days + 1):
        future_date = now + timedelta(days=i)
        dow = future_date.weekday()
        base = slope * (last_idx + i) + intercept
        seasonal = base * dow_factors.get(dow, 1.0)
        forecast.append({
            "date": future_date.strftime("%Y-%m-%d"),
            "predicted_revenue": max(round(seasonal, 0), 0),
            "confidence_low": max(round(seasonal * 0.8, 0), 0),
            "confidence_high": round(seasonal * 1.2, 0),
        })

    # Summary
    hist_total = sum(d["revenue"] for d in daily_data)
    hist_avg = hist_total / len(daily_data)
    forecast_total = sum(f["predicted_revenue"] for f in forecast)
    forecast_avg = forecast_total / len(forecast) if forecast else 0

    trend_pct = ((slope * 30) / max(hist_avg, 1)) * 100  # monthly trend

    return {
        "history": daily_data,
        "forecast": forecast,
        "summary": {
            "history_days": history_days,
            "forecast_days": forecast_days,
            "history_total": round(hist_total, 0),
            "history_daily_avg": round(hist_avg, 0),
            "forecast_total": round(forecast_total, 0),
            "forecast_daily_avg": round(forecast_avg, 0),
            "trend_pct": round(trend_pct, 1),
            "trend_direction": "up" if slope > 0 else "down",
        },
        "seasonality": {
            "Пн": round(dow_factors.get(0, 1), 2),
            "Вт": round(dow_factors.get(1, 1), 2),
            "Ср": round(dow_factors.get(2, 1), 2),
            "Чт": round(dow_factors.get(3, 1), 2),
            "Пт": round(dow_factors.get(4, 1), 2),
            "Сб": round(dow_factors.get(5, 1), 2),
            "Вс": round(dow_factors.get(6, 1), 2),
        },
    }


@router.get("/customers")
async def forecast_customers(
    history_days: int = Query(default=90, ge=30, le=365),
    forecast_days: int = Query(default=30, ge=7, le=90),
    db: AsyncSession = Depends(get_db),
):
    """Прогноз роста клиентской базы."""
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=history_days)

    # Daily new registrations
    daily_result = await db.execute(
        select(
            func.date_trunc(func.literal_column("'day'"), Customer.created_at).label("day"),
            func.count(Customer.id).label("new_customers"),
        ).where(Customer.created_at >= since)
        .group_by(func.date_trunc(func.literal_column("'day'"), Customer.created_at))
        .order_by(func.date_trunc(func.literal_column("'day'"), Customer.created_at))
    )

    daily_data = []
    for r in daily_result.all():
        daily_data.append({
            "date": r.day.strftime("%Y-%m-%d"),
            "new_customers": r.new_customers,
        })

    if len(daily_data) < 7:
        return {"error": "Недостаточно данных", "history": daily_data, "forecast": []}

    # Linear regression
    x_vals = list(range(len(daily_data)))
    y_vals = [d["new_customers"] for d in daily_data]
    slope, intercept = _linear_regression(x_vals, y_vals)

    # Total customers now
    total_result = await db.execute(select(func.count(Customer.id)))
    total_now = total_result.scalar() or 0

    forecast = []
    cumulative = total_now
    last_idx = len(daily_data) - 1
    for i in range(1, forecast_days + 1):
        future_date = now + timedelta(days=i)
        predicted = max(round(slope * (last_idx + i) + intercept), 0)
        cumulative += predicted
        forecast.append({
            "date": future_date.strftime("%Y-%m-%d"),
            "predicted_new": predicted,
            "cumulative_total": cumulative,
        })

    hist_avg = mean(y_vals)
    forecast_avg = mean([f["predicted_new"] for f in forecast]) if forecast else 0

    return {
        "history": daily_data,
        "forecast": forecast,
        "summary": {
            "current_total": total_now,
            "predicted_total": cumulative,
            "growth": cumulative - total_now,
            "history_daily_avg": round(hist_avg, 1),
            "forecast_daily_avg": round(forecast_avg, 1),
        },
    }


@router.get("/summary")
async def forecast_summary(
    db: AsyncSession = Depends(get_db),
):
    """Сводный прогноз: выручка, клиенты, средний чек — на 30 дней."""
    now = datetime.now(timezone.utc)
    days_30_ago = now - timedelta(days=30)
    days_60_ago = now - timedelta(days=60)

    # Last 30 days
    last30 = await db.execute(
        select(
            func.sum(Transaction.purchase_amount).label("revenue"),
            func.count(Transaction.id).label("tx_count"),
            func.count(func.distinct(Transaction.customer_id)).label("active_customers"),
        ).where(
            and_(
                Transaction.type == TransactionType.EARN,
                Transaction.created_at >= days_30_ago,
            )
        )
    )
    r30 = last30.one()

    # Previous 30 days
    prev30 = await db.execute(
        select(
            func.sum(Transaction.purchase_amount).label("revenue"),
            func.count(Transaction.id).label("tx_count"),
        ).where(
            and_(
                Transaction.type == TransactionType.EARN,
                Transaction.created_at >= days_60_ago,
                Transaction.created_at < days_30_ago,
            )
        )
    )
    p30 = prev30.one()

    rev_now = float(r30.revenue or 0)
    rev_prev = float(p30.revenue or 0)
    tx_now = r30.tx_count or 0
    tx_prev = p30.tx_count or 0
    active = r30.active_customers or 0

    rev_change = ((rev_now - rev_prev) / max(rev_prev, 1)) * 100
    tx_change = ((tx_now - tx_prev) / max(tx_prev, 1)) * 100

    avg_check = rev_now / max(tx_now, 1)
    avg_check_prev = rev_prev / max(tx_prev, 1)
    check_change = ((avg_check - avg_check_prev) / max(avg_check_prev, 1)) * 100

    # Simple 30-day projection
    projected_revenue = rev_now * (1 + rev_change / 100)
    projected_tx = tx_now * (1 + tx_change / 100)

    # New customers growth
    new_cust_30 = await db.execute(
        select(func.count(Customer.id)).where(Customer.created_at >= days_30_ago)
    )
    new_cust_prev = await db.execute(
        select(func.count(Customer.id)).where(
            and_(Customer.created_at >= days_60_ago, Customer.created_at < days_30_ago)
        )
    )
    new_now = new_cust_30.scalar() or 0
    new_prev = new_cust_prev.scalar() or 0
    cust_growth = ((new_now - new_prev) / max(new_prev, 1)) * 100

    return {
        "current_period": {
            "revenue": round(rev_now, 0),
            "transactions": tx_now,
            "avg_check": round(avg_check, 0),
            "active_customers": active,
            "new_customers": new_now,
        },
        "previous_period": {
            "revenue": round(rev_prev, 0),
            "transactions": tx_prev,
            "avg_check": round(avg_check_prev, 0),
            "new_customers": new_prev,
        },
        "changes": {
            "revenue_pct": round(rev_change, 1),
            "transactions_pct": round(tx_change, 1),
            "avg_check_pct": round(check_change, 1),
            "customers_pct": round(cust_growth, 1),
        },
        "forecast_30d": {
            "projected_revenue": round(max(projected_revenue, 0), 0),
            "projected_transactions": round(max(projected_tx, 0)),
            "projected_avg_check": round(avg_check * (1 + check_change / 200), 0),
            "confidence": "medium" if abs(rev_change) < 20 else "low",
        },
    }
