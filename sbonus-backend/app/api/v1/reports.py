"""
Sbonus+ — Branded PDF Reports.
Генерация красивых PDF-отчётов с брендингом Смарт Центр.
"""

import io
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select, func, case, literal_column, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import require_role, UserRole
from app.models import (
    Customer, BonusAccount, Transaction, TransactionType,
    Branch, User, UserRoleEnum, Tier,
)

router = APIRouter(prefix="/reports", tags=["Reports"])


def _build_html_report(title: str, period: str, sections: list) -> str:
    """Сгенерировать HTML для PDF-отчёта."""
    sections_html = ""
    for section in sections:
        sections_html += f'<div class="section"><h2>{section["title"]}</h2>'
        if "kpis" in section:
            sections_html += '<div class="kpi-grid">'
            for kpi in section["kpis"]:
                change_class = "positive" if kpi.get("change", 0) >= 0 else "negative"
                change_str = f'<span class="{change_class}">{kpi.get("change", 0):+.1f}%</span>' if "change" in kpi else ""
                sections_html += f'''
                <div class="kpi-card">
                    <div class="kpi-label">{kpi["label"]}</div>
                    <div class="kpi-value">{kpi["value"]}</div>
                    {change_str}
                </div>'''
            sections_html += '</div>'
        if "table" in section:
            sections_html += '<table><thead><tr>'
            for col in section["table"]["columns"]:
                sections_html += f'<th>{col}</th>'
            sections_html += '</tr></thead><tbody>'
            for row in section["table"]["rows"]:
                sections_html += '<tr>'
                for cell in row:
                    sections_html += f'<td>{cell}</td>'
                sections_html += '</tr>'
            sections_html += '</tbody></table>'
        if "text" in section:
            sections_html += f'<p>{section["text"]}</p>'
        sections_html += '</div>'

    now = datetime.now(timezone(timedelta(hours=6)))

    html = f"""<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<style>
@page {{ size: A4; margin: 20mm; }}
* {{ margin: 0; padding: 0; box-sizing: border-box; }}
body {{ font-family: -apple-system, 'Segoe UI', Arial, sans-serif; color: #1a1a2e; font-size: 13px; line-height: 1.5; }}
.header {{ background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); color: white; padding: 30px; border-radius: 12px; margin-bottom: 24px; }}
.header h1 {{ font-size: 22px; font-weight: 600; margin-bottom: 4px; }}
.header .subtitle {{ font-size: 13px; opacity: 0.8; }}
.header .period {{ font-size: 14px; margin-top: 8px; color: #a3bffa; }}
.brand {{ display: flex; align-items: center; gap: 16px; }}
.brand-logo {{ width: 48px; height: 48px; background: #f59e0b; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: 700; color: white; }}
.section {{ margin-bottom: 24px; page-break-inside: avoid; }}
.section h2 {{ font-size: 16px; font-weight: 600; color: #1a1a2e; border-bottom: 2px solid #f59e0b; padding-bottom: 6px; margin-bottom: 12px; }}
.kpi-grid {{ display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px; }}
.kpi-card {{ background: #f8f9fc; border-radius: 8px; padding: 14px; text-align: center; }}
.kpi-label {{ font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; }}
.kpi-value {{ font-size: 20px; font-weight: 700; color: #1a1a2e; margin: 4px 0; }}
.positive {{ color: #10b981; font-size: 12px; font-weight: 600; }}
.negative {{ color: #ef4444; font-size: 12px; font-weight: 600; }}
table {{ width: 100%; border-collapse: collapse; font-size: 12px; }}
th {{ background: #1a1a2e; color: white; padding: 8px 12px; text-align: left; font-weight: 500; }}
td {{ padding: 7px 12px; border-bottom: 1px solid #e5e7eb; }}
tr:nth-child(even) {{ background: #f8f9fc; }}
.footer {{ text-align: center; font-size: 11px; color: #9ca3af; margin-top: 30px; padding-top: 12px; border-top: 1px solid #e5e7eb; }}
</style>
</head>
<body>
<div class="header">
    <div class="brand">
        <div class="brand-logo">S</div>
        <div>
            <h1>{title}</h1>
            <div class="subtitle">Смарт Центр — S Bonus+</div>
            <div class="period">📅 {period}</div>
        </div>
    </div>
</div>
{sections_html}
<div class="footer">
    Сгенерировано: {now.strftime('%d.%m.%Y %H:%M')} | S Bonus+ — Смарт Центр | Ош обл., Араван р-н, ул. Ош-3000, 86
</div>
</body>
</html>"""
    return html


@router.get("/daily")
async def daily_report(
    date: str = Query(None, description="YYYY-MM-DD"),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN)),
):
    """Ежедневный отчёт в формате HTML (для PDF печати)."""
    tz = timezone(timedelta(hours=6))
    if date:
        report_date = datetime.strptime(date, "%Y-%m-%d").replace(tzinfo=tz)
    else:
        report_date = datetime.now(tz) - timedelta(days=1)

    day_start = report_date.replace(hour=0, minute=0, second=0, microsecond=0)
    day_end = day_start + timedelta(days=1)
    prev_start = day_start - timedelta(days=1)

    # Revenue today
    rev = await db.execute(
        select(
            func.coalesce(func.sum(Transaction.purchase_amount), 0).label("revenue"),
            func.count().label("tx_count"),
            func.count(func.distinct(Transaction.customer_id)).label("customers"),
            func.coalesce(func.sum(Transaction.amount), 0).label("bonus_earned"),
        ).where(
            Transaction.type == TransactionType.EARN,
            Transaction.created_at >= day_start,
            Transaction.created_at < day_end,
        )
    )
    today = rev.one()

    # Previous day
    prev = await db.execute(
        select(
            func.coalesce(func.sum(Transaction.purchase_amount), 0),
            func.count(),
        ).where(
            Transaction.type == TransactionType.EARN,
            Transaction.created_at >= prev_start,
            Transaction.created_at < day_start,
        )
    )
    prev_row = prev.one()
    prev_rev = float(prev_row[0])

    rev_change = ((float(today.revenue) - prev_rev) / prev_rev * 100) if prev_rev > 0 else 0
    avg_check = float(today.revenue) / today.tx_count if today.tx_count > 0 else 0

    # Spend stats
    spend = await db.execute(
        select(
            func.count().label("cnt"),
            func.coalesce(func.sum(Transaction.amount), 0).label("total"),
        ).where(
            Transaction.type == TransactionType.SPEND,
            Transaction.created_at >= day_start,
            Transaction.created_at < day_end,
        )
    )
    spend_row = spend.one()

    # New customers
    new_cust = await db.execute(
        select(func.count()).where(
            Customer.created_at >= day_start,
            Customer.created_at < day_end,
        )
    )

    # Top cashiers
    cashiers = await db.execute(
        select(
            Transaction.cashier_id,
            func.count().label("cnt"),
            func.sum(Transaction.purchase_amount).label("rev"),
        ).where(
            Transaction.type == TransactionType.EARN,
            Transaction.created_at >= day_start,
            Transaction.created_at < day_end,
            Transaction.cashier_id.isnot(None),
        ).group_by(Transaction.cashier_id).order_by(desc("rev")).limit(5)
    )
    cashier_rows = cashiers.all()
    cashier_table = {"columns": ["#", "Кассир", "Транзакции", "Выручка"], "rows": []}
    for i, c in enumerate(cashier_rows, 1):
        u = await db.execute(select(User.full_name).where(User.id == c.cashier_id))
        name = u.scalar_one_or_none() or "—"
        cashier_table["rows"].append([str(i), name, str(c.cnt), f"{int(c.rev):,} сом"])

    # Hourly breakdown
    hourly = await db.execute(
        select(
            func.extract("hour", Transaction.created_at).label("hour"),
            func.count().label("cnt"),
            func.coalesce(func.sum(Transaction.purchase_amount), 0).label("rev"),
        ).where(
            Transaction.type == TransactionType.EARN,
            Transaction.created_at >= day_start,
            Transaction.created_at < day_end,
        ).group_by("hour").order_by("hour")
    )
    hour_table = {"columns": ["Час", "Транзакции", "Выручка"], "rows": []}
    for h in hourly.all():
        hour_table["rows"].append([f"{int(h.hour):02d}:00", str(h.cnt), f"{int(h.rev):,} сом"])

    sections = [
        {
            "title": "Ключевые показатели",
            "kpis": [
                {"label": "Выручка", "value": f"{int(today.revenue):,} сом", "change": round(rev_change, 1)},
                {"label": "Транзакции", "value": str(today.tx_count)},
                {"label": "Клиенты", "value": str(today.customers)},
                {"label": "Средний чек", "value": f"{int(avg_check):,} сом"},
            ],
        },
        {
            "title": "Бонусы",
            "kpis": [
                {"label": "Начислено", "value": f"{int(today.bonus_earned):,}"},
                {"label": "Списано", "value": f"{int(spend_row.total):,}"},
                {"label": "Операций списания", "value": str(spend_row.cnt)},
                {"label": "Новых клиентов", "value": str(new_cust.scalar() or 0)},
            ],
        },
        {"title": "Топ кассиры", "table": cashier_table},
        {"title": "Почасовая активность", "table": hour_table},
    ]

    html = _build_html_report(
        title="Ежедневный отчёт",
        period=day_start.strftime("%d.%m.%Y"),
        sections=sections,
    )

    return StreamingResponse(
        io.BytesIO(html.encode("utf-8")),
        media_type="text/html",
        headers={"Content-Disposition": f'inline; filename="report-{day_start.strftime("%Y-%m-%d")}.html"'},
    )


@router.get("/monthly")
async def monthly_report(
    month: str = Query(None, description="YYYY-MM"),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN)),
):
    """Ежемесячный отчёт."""
    tz = timezone(timedelta(hours=6))
    now = datetime.now(tz)
    if month:
        year, mon = map(int, month.split("-"))
    else:
        year, mon = now.year, now.month - 1 if now.month > 1 else 12
        if mon == 12:
            year -= 1

    month_start = datetime(year, mon, 1, tzinfo=tz)
    if mon == 12:
        month_end = datetime(year + 1, 1, 1, tzinfo=tz)
    else:
        month_end = datetime(year, mon + 1, 1, tzinfo=tz)

    # Previous month
    if mon == 1:
        prev_start = datetime(year - 1, 12, 1, tzinfo=tz)
    else:
        prev_start = datetime(year, mon - 1, 1, tzinfo=tz)

    # Current month stats
    stats = await db.execute(
        select(
            func.coalesce(func.sum(Transaction.purchase_amount), 0).label("revenue"),
            func.count().label("tx_count"),
            func.count(func.distinct(Transaction.customer_id)).label("customers"),
            func.coalesce(func.sum(Transaction.amount), 0).label("bonus"),
        ).where(
            Transaction.type == TransactionType.EARN,
            Transaction.created_at >= month_start,
            Transaction.created_at < month_end,
        )
    )
    cur = stats.one()

    # Previous month stats
    prev_stats = await db.execute(
        select(
            func.coalesce(func.sum(Transaction.purchase_amount), 0),
            func.count(),
        ).where(
            Transaction.type == TransactionType.EARN,
            Transaction.created_at >= prev_start,
            Transaction.created_at < month_start,
        )
    )
    prev = prev_stats.one()
    prev_rev = float(prev[0])
    rev_change = ((float(cur.revenue) - prev_rev) / prev_rev * 100) if prev_rev > 0 else 0

    # Spend
    spend = await db.execute(
        select(func.coalesce(func.sum(Transaction.amount), 0)).where(
            Transaction.type == TransactionType.SPEND,
            Transaction.created_at >= month_start,
            Transaction.created_at < month_end,
        )
    )
    total_spent = float(spend.scalar() or 0)

    # New customers
    new_count = await db.execute(
        select(func.count()).where(
            Customer.created_at >= month_start,
            Customer.created_at < month_end,
        )
    )

    # Tier distribution
    tier_dist = await db.execute(
        select(Tier.name, func.count()).select_from(Customer).join(
            Tier, Customer.tier_id == Tier.id, isouter=True
        ).where(Customer.is_active == True).group_by(Tier.name)
    )
    tier_table = {"columns": ["Уровень", "Клиентов"], "rows": []}
    for t in tier_dist.all():
        tier_table["rows"].append([t[0] or "Bronze", str(t[1])])

    # Top 10 customers
    top_cust = await db.execute(
        select(
            Transaction.customer_id,
            func.sum(Transaction.purchase_amount).label("total"),
            func.count().label("cnt"),
        ).where(
            Transaction.type == TransactionType.EARN,
            Transaction.created_at >= month_start,
            Transaction.created_at < month_end,
        ).group_by(Transaction.customer_id).order_by(desc("total")).limit(10)
    )
    top_table = {"columns": ["#", "Клиент", "Покупок", "Сумма"], "rows": []}
    for i, c in enumerate(top_cust.all(), 1):
        cn = await db.execute(select(Customer.full_name).where(Customer.id == c.customer_id))
        name = cn.scalar_one_or_none() or "—"
        top_table["rows"].append([str(i), name, str(c.cnt), f"{int(c.total):,} сом"])

    avg_check = float(cur.revenue) / cur.tx_count if cur.tx_count > 0 else 0
    month_name = month_start.strftime("%B %Y")

    sections = [
        {
            "title": "Основные показатели",
            "kpis": [
                {"label": "Выручка", "value": f"{int(cur.revenue):,} сом", "change": round(rev_change, 1)},
                {"label": "Транзакции", "value": f"{cur.tx_count:,}"},
                {"label": "Уникальных клиентов", "value": f"{cur.customers:,}"},
                {"label": "Средний чек", "value": f"{int(avg_check):,} сом"},
            ],
        },
        {
            "title": "Бонусная программа",
            "kpis": [
                {"label": "Начислено бонусов", "value": f"{int(cur.bonus):,}"},
                {"label": "Списано бонусов", "value": f"{int(total_spent):,}"},
                {"label": "Новых клиентов", "value": str(new_count.scalar() or 0)},
                {"label": "Всего активных", "value": "—"},
            ],
        },
        {"title": "Распределение по уровням", "table": tier_table},
        {"title": "Топ-10 клиентов", "table": top_table},
    ]

    html = _build_html_report(
        title="Ежемесячный отчёт",
        period=month_name,
        sections=sections,
    )

    return StreamingResponse(
        io.BytesIO(html.encode("utf-8")),
        media_type="text/html",
        headers={"Content-Disposition": f'inline; filename="report-{year}-{mon:02d}.html"'},
    )
