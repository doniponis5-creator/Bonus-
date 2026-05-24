"""
Sbonus+ — Товарная аналитика.

Endpoints:
  GET  /api/v1/product-analytics/summary          — общая сводка
  GET  /api/v1/product-analytics/products          — список товаров с фильтрами
  GET  /api/v1/product-analytics/top-sellers       — топ продаваемых товаров
  GET  /api/v1/product-analytics/low-stock         — алерты низкого остатка
  GET  /api/v1/product-analytics/dead-stock        — товары без продаж
  GET  /api/v1/product-analytics/abc               — ABC-анализ
  GET  /api/v1/product-analytics/margins           — маржинальность товаров
  GET  /api/v1/product-analytics/frequently-bought — часто покупают вместе
  POST /api/v1/product-analytics/recalculate-abc   — пересчитать ABC-классы
  GET  /api/v1/product-analytics/daily-digest      — дайджест для WhatsApp/TG
  PUT  /api/v1/product-analytics/settings          — настройки аналитики (admin)
  GET  /api/v1/product-analytics/settings          — получить настройки
"""

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, desc, func, select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user, require_role, UserRole
from app.models import Product, PurchaseItem, Setting

router = APIRouter(
    prefix="/product-analytics",
    tags=["Товарная аналитика"],
)


# ═══════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════

async def _get_setting(db: AsyncSession, key: str, default: str = "") -> str:
    """Получить настройку из БД."""
    result = await db.execute(select(Setting).where(Setting.key == key))
    s = result.scalar_one_or_none()
    return s.value if s else default


async def _get_product_velocity(db: AsyncSession, product_id, days: int = 30) -> float:
    """Средние продажи в день за последние N дней."""
    since = datetime.now(timezone.utc) - timedelta(days=days)
    result = await db.execute(
        select(func.coalesce(func.sum(PurchaseItem.quantity), 0))
        .where(
            PurchaseItem.product_id == product_id,
            PurchaseItem.created_at >= since,
        )
    )
    total_sold = float(result.scalar() or 0)
    return round(total_sold / days, 2)


async def _get_bulk_velocity(db: AsyncSession, product_ids: list, days: int = 30) -> dict:
    """Средние продажи в день для МНОЖЕСТВА товаров за 1 запрос (вместо N+1)."""
    if not product_ids:
        return {}
    since = datetime.now(timezone.utc) - timedelta(days=days)
    result = await db.execute(
        select(
            PurchaseItem.product_id,
            func.coalesce(func.sum(PurchaseItem.quantity), 0).label("total_sold"),
        )
        .where(
            PurchaseItem.product_id.in_(product_ids),
            PurchaseItem.created_at >= since,
        )
        .group_by(PurchaseItem.product_id)
    )
    rows = result.all()
    velocity_map = {}
    for r in rows:
        velocity_map[r.product_id] = round(float(r.total_sold) / days, 2)
    # Для товаров без продаж — velocity = 0
    for pid in product_ids:
        if pid not in velocity_map:
            velocity_map[pid] = 0.0
    return velocity_map


# ═══════════════════════════════════════════
# 1. SUMMARY — общая сводка
# ═══════════════════════════════════════════

@router.get("/summary")
async def product_analytics_summary(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN)),
) -> dict:
    """Общая сводка товарной аналитики."""
    now = datetime.now(timezone.utc)
    thirty_days_ago = now - timedelta(days=30)

    # Базовые подсчёты
    total = await db.execute(select(func.count()).select_from(Product))
    active = await db.execute(
        select(func.count()).select_from(Product).where(Product.is_active == True)
    )
    low_stock = await db.execute(
        select(func.count()).select_from(Product).where(
            Product.is_active == True,
            Product.current_stock > 0,
            Product.min_stock_level > 0,  # Только настроенные товары
            Product.current_stock <= Product.min_stock_level,
        )
    )
    out_of_stock = await db.execute(
        select(func.count()).select_from(Product).where(
            Product.is_active == True,
            Product.current_stock <= 0,
        )
    )

    # Dead stock: нет продаж 30+ дней
    dead_stock = await db.execute(
        select(func.count()).select_from(Product).where(
            Product.is_active == True,
            Product.current_stock > 0,
            (Product.last_sold_at == None) | (Product.last_sold_at < thirty_days_ago),
        )
    )

    # ABC подсчёт
    abc_a = await db.execute(
        select(func.count()).select_from(Product).where(Product.abc_class == "A", Product.is_active == True)
    )
    abc_b = await db.execute(
        select(func.count()).select_from(Product).where(Product.abc_class == "B", Product.is_active == True)
    )
    abc_c = await db.execute(
        select(func.count()).select_from(Product).where(Product.abc_class == "C", Product.is_active == True)
    )

    # Стоимость склада
    inv_value = await db.execute(
        select(func.coalesce(func.sum(Product.current_stock * Product.price), 0))
        .where(Product.is_active == True)
    )
    cost_value = await db.execute(
        select(func.coalesce(func.sum(Product.current_stock * Product.cost_price), 0))
        .where(Product.is_active == True, Product.cost_price != None)
    )

    return {
        "total_products": total.scalar() or 0,
        "active_products": active.scalar() or 0,
        "low_stock_count": low_stock.scalar() or 0,
        "out_of_stock_count": out_of_stock.scalar() or 0,
        "dead_stock_count": dead_stock.scalar() or 0,
        "abc_a_count": abc_a.scalar() or 0,
        "abc_b_count": abc_b.scalar() or 0,
        "abc_c_count": abc_c.scalar() or 0,
        "total_inventory_value": float(inv_value.scalar() or 0),
        "total_cost_value": float(cost_value.scalar() or 0),
    }


# ═══════════════════════════════════════════
# 2. PRODUCTS — список с фильтрами
# ═══════════════════════════════════════════

@router.get("/products")
async def product_list(
    category: Optional[str] = Query(None, description="Фильтр по категории"),
    abc_class: Optional[str] = Query(None, description="Фильтр по ABC-классу (A/B/C)"),
    low_stock_only: bool = Query(False, description="Только товары с низким остатком"),
    search: Optional[str] = Query(None, description="Поиск по названию/SKU"),
    sort_by: str = Query("name", description="Сортировка: name, stock, price, sales"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN)),
) -> dict:
    """Список товаров с фильтрами и сортировкой."""
    query = select(Product).where(Product.is_active == True)

    if category:
        query = query.where(Product.category == category)
    if abc_class:
        query = query.where(Product.abc_class == abc_class.upper())
    if low_stock_only:
        query = query.where(Product.min_stock_level > 0, Product.current_stock <= Product.min_stock_level)
    if search:
        query = query.where(
            (Product.name.ilike(f"%{search}%")) | (Product.sku.ilike(f"%{search}%"))
        )

    # Сортировка
    sort_map = {
        "name": Product.name.asc(),
        "stock": Product.current_stock.asc(),
        "price": Product.price.desc(),
        "-stock": Product.current_stock.desc(),
    }
    query = query.order_by(sort_map.get(sort_by, Product.name.asc()))

    # Подсчёт
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Данные
    result = await db.execute(query.limit(limit).offset(offset))
    products = result.scalars().all()

    # Категории для фильтра
    cats_result = await db.execute(
        select(Product.category, func.count())
        .where(Product.is_active == True, Product.category != None)
        .group_by(Product.category)
        .order_by(func.count().desc())
    )
    categories = [{"name": r[0], "count": r[1]} for r in cats_result.all()]

    return {
        "total": total,
        "products": [
            {
                "id": str(p.id),
                "sku": p.sku,
                "name": p.name,
                "category": p.category,
                "unit": p.unit,
                "price": float(p.price),
                "cost_price": float(p.cost_price) if p.cost_price else None,
                "current_stock": float(p.current_stock),
                "min_stock_level": float(p.min_stock_level),
                "supplier": p.supplier,
                "abc_class": p.abc_class,
                "is_low_stock": p.current_stock <= p.min_stock_level,
                "last_sold_at": p.last_sold_at.isoformat() if p.last_sold_at else None,
                "last_synced_at": p.last_synced_at.isoformat() if p.last_synced_at else None,
            }
            for p in products
        ],
        "categories": categories,
    }


# ═══════════════════════════════════════════
# 3. TOP SELLERS — топ продаваемых
# ═══════════════════════════════════════════

@router.get("/top-sellers")
async def top_sellers(
    days: int = Query(30, ge=1, le=365, description="Период в днях"),
    limit: int = Query(20, ge=1, le=100),
    category: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN)),
) -> dict:
    """Топ продаваемых товаров за период."""
    since = datetime.now(timezone.utc) - timedelta(days=days)

    query = (
        select(
            Product.sku,
            Product.name,
            Product.category,
            Product.current_stock,
            Product.price,
            func.coalesce(func.sum(PurchaseItem.quantity), 0).label("total_sold"),
            func.coalesce(func.sum(PurchaseItem.total), 0).label("total_revenue"),
        )
        .join(PurchaseItem, PurchaseItem.product_id == Product.id)
        .where(PurchaseItem.created_at >= since, Product.is_active == True)
    )

    if category:
        query = query.where(Product.category == category)

    query = (
        query
        .group_by(Product.id, Product.sku, Product.name, Product.category, Product.current_stock, Product.price)
        .order_by(desc("total_revenue"))
        .limit(limit)
    )

    result = await db.execute(query)
    rows = result.all()

    items = []
    for r in rows:
        avg_daily = round(float(r.total_sold) / days, 2) if days > 0 else 0
        days_until = int(float(r.current_stock) / avg_daily) if avg_daily > 0 else None
        items.append({
            "sku": r.sku,
            "name": r.name,
            "category": r.category,
            "total_sold": float(r.total_sold),
            "total_revenue": float(r.total_revenue),
            "avg_daily_sales": avg_daily,
            "current_stock": float(r.current_stock),
            "days_until_stockout": days_until,
        })

    return {"period_days": days, "top_sellers": items}


# ═══════════════════════════════════════════
# 4. LOW STOCK — алерты низкого остатка
# ═══════════════════════════════════════════

@router.get("/low-stock")
async def low_stock_alerts(
    include_out_of_stock: bool = Query(True, description="Включить товары с нулевым остатком"),
    search: Optional[str] = Query(None, description="Поиск по названию/SKU"),
    category: Optional[str] = Query(None, description="Фильтр по категории"),
    urgency_filter: Optional[str] = Query(None, description="critical / warning"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN)),
) -> dict:
    """Алерты: товары с остатком ниже минимума (только с настроенным min_stock_level)."""
    query = (
        select(Product)
        .where(
            Product.is_active == True,
            Product.min_stock_level > 0,  # Только настроенные товары (не default 5)
            Product.current_stock <= Product.min_stock_level,
        )
        .order_by(Product.current_stock.asc())
    )

    if not include_out_of_stock:
        query = query.where(Product.current_stock > 0)

    if search:
        search_term = f"%{search.strip()}%"
        query = query.where(
            (Product.name.ilike(search_term)) | (Product.sku.ilike(search_term))
        )
    if category:
        query = query.where(Product.category == category)

    result = await db.execute(query)
    products = result.scalars().all()

    # ── Batch velocity вместо N+1 (1 запрос вместо 2200!) ──
    product_ids = [p.id for p in products]
    velocity_map = await _get_bulk_velocity(db, product_ids)

    alerts = []
    reorder_days = int(await _get_setting(db, "PRODUCT_REORDER_DAYS", "14"))

    for p in products:
        velocity = velocity_map.get(p.id, 0.0)

        if p.current_stock <= 0:
            urgency = "critical"
        elif velocity > 0 and float(p.current_stock) / velocity <= 3:
            urgency = "critical"
        elif p.current_stock <= p.min_stock_level:
            urgency = "warning"
        else:
            urgency = "info"

        # Рекомендация: скорость * дней запаса
        recommended = round(velocity * reorder_days, 0) if velocity > 0 else float(p.min_stock_level * 2)
        days_until = int(float(p.current_stock) / velocity) if velocity > 0 else None

        alerts.append({
            "sku": p.sku,
            "name": p.name,
            "category": p.category,
            "current_stock": float(p.current_stock),
            "min_stock_level": float(p.min_stock_level),
            "avg_daily_sales": velocity,
            "days_until_stockout": days_until,
            "recommended_order": recommended,
            "urgency": urgency,
        })

    # Сортировка: critical → warning → info
    urgency_order = {"critical": 0, "warning": 1, "info": 2}
    alerts.sort(key=lambda a: urgency_order.get(a["urgency"], 3))

    # Фильтр по urgency (после расчёта, т.к. urgency вычисляется в Python)
    if urgency_filter:
        alerts = [a for a in alerts if a["urgency"] == urgency_filter]

    # Собрать уникальные категории для фильтра на фронте
    categories = sorted(set(a["category"] for a in alerts if a["category"]))

    return {
        "total_alerts": len(alerts),
        "critical": sum(1 for a in alerts if a["urgency"] == "critical"),
        "warning": sum(1 for a in alerts if a["urgency"] == "warning"),
        "categories": categories,
        "alerts": alerts,
    }


# ═══════════════════════════════════════════
# 5. DEAD STOCK — товары без продаж
# ═══════════════════════════════════════════

@router.get("/dead-stock")
async def dead_stock(
    days: int = Query(30, ge=7, le=365, description="Нет продаж за N дней"),
    search: Optional[str] = Query(None, description="Поиск по названию/SKU"),
    category: Optional[str] = Query(None, description="Фильтр по категории"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN)),
) -> dict:
    """Товары без продаж за указанный период (замороженный капитал)."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    query = (
        select(Product)
        .where(
            Product.is_active == True,
            Product.current_stock > 0,
            (Product.last_sold_at == None) | (Product.last_sold_at < cutoff),
        )
        .order_by(
            (Product.current_stock * Product.price).desc()
        )
    )

    if search:
        search_term = f"%{search.strip()}%"
        query = query.where(
            (Product.name.ilike(search_term)) | (Product.sku.ilike(search_term))
        )
    if category:
        query = query.where(Product.category == category)

    result = await db.execute(query)
    products = result.scalars().all()

    now = datetime.now(timezone.utc)
    items = []
    total_frozen = Decimal("0")

    for p in products:
        frozen = p.current_stock * p.price
        total_frozen += frozen
        if p.last_sold_at:
            days_without = (now - p.last_sold_at).days
        elif hasattr(p, 'created_at') and p.created_at:
            days_without = (now - p.created_at).days
        else:
            days_without = days  # Минимум = период фильтра

        items.append({
            "sku": p.sku,
            "name": p.name,
            "category": p.category,
            "current_stock": float(p.current_stock),
            "price": float(p.price),
            "frozen_capital": float(frozen),
            "days_without_sale": days_without,
            "last_sold_at": p.last_sold_at.isoformat() if p.last_sold_at else None,
        })

    categories = sorted(set(i["category"] for i in items if i["category"]))

    return {
        "period_days": days,
        "total_dead_stock": len(items),
        "total_frozen_capital": float(total_frozen),
        "categories": categories,
        "items": items,
    }


# ═══════════════════════════════════════════
# 6. ABC ANALYSIS — классификация товаров
# ═══════════════════════════════════════════

@router.get("/abc")
async def abc_analysis(
    days: int = Query(90, ge=30, le=365, description="Период для расчёта ABC"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN)),
) -> dict:
    """ABC-анализ: категоризация товаров по вкладу в выручку."""
    since = datetime.now(timezone.utc) - timedelta(days=days)

    # Выручка по каждому товару
    result = await db.execute(
        select(
            Product.id,
            Product.sku,
            Product.name,
            Product.category,
            Product.abc_class,
            func.coalesce(func.sum(PurchaseItem.total), 0).label("revenue"),
        )
        .outerjoin(PurchaseItem, and_(
            PurchaseItem.product_id == Product.id,
            PurchaseItem.created_at >= since,
        ))
        .where(Product.is_active == True)
        .group_by(Product.id, Product.sku, Product.name, Product.category, Product.abc_class)
        .order_by(desc("revenue"))
    )
    rows = result.all()

    total_revenue = sum(float(r.revenue) for r in rows)
    if total_revenue == 0:
        return {"period_days": days, "total_revenue": 0, "items": [], "summary": {}}

    # Расчёт ABC
    cumulative = 0
    items = []
    for r in rows:
        rev = float(r.revenue)
        cumulative += rev
        pct = (cumulative / total_revenue) * 100

        if pct <= 80:
            abc = "A"
        elif pct <= 95:
            abc = "B"
        else:
            abc = "C"

        items.append({
            "sku": r.sku,
            "name": r.name,
            "category": r.category,
            "revenue": rev,
            "revenue_percent": round((rev / total_revenue) * 100, 2),
            "cumulative_percent": round(pct, 2),
            "abc_class": abc,
            "current_class": r.abc_class,
        })

    summary = {
        "A": {"count": sum(1 for i in items if i["abc_class"] == "A"),
              "revenue": sum(i["revenue"] for i in items if i["abc_class"] == "A")},
        "B": {"count": sum(1 for i in items if i["abc_class"] == "B"),
              "revenue": sum(i["revenue"] for i in items if i["abc_class"] == "B")},
        "C": {"count": sum(1 for i in items if i["abc_class"] == "C"),
              "revenue": sum(i["revenue"] for i in items if i["abc_class"] == "C")},
    }

    return {
        "period_days": days,
        "total_revenue": total_revenue,
        "items": items,
        "summary": summary,
    }


# ═══════════════════════════════════════════
# 7. RECALCULATE ABC — пересчитать классы
# ═══════════════════════════════════════════

@router.post("/recalculate-abc")
async def recalculate_abc(
    days: int = Query(90, ge=30, le=365),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_role(UserRole.SUPER_ADMIN)),
) -> dict:
    """Пересчитать ABC-классы и сохранить в БД."""
    since = datetime.now(timezone.utc) - timedelta(days=days)

    result = await db.execute(
        select(
            Product.id,
            func.coalesce(func.sum(PurchaseItem.total), 0).label("revenue"),
        )
        .outerjoin(PurchaseItem, and_(
            PurchaseItem.product_id == Product.id,
            PurchaseItem.created_at >= since,
        ))
        .where(Product.is_active == True)
        .group_by(Product.id)
        .order_by(desc("revenue"))
    )
    rows = result.all()

    total_revenue = sum(float(r.revenue) for r in rows)
    if total_revenue == 0:
        return {"success": True, "message": "Нет данных для расчёта", "updated": 0}

    # Рассчитать ABC-классы
    cumulative = 0
    abc_assignments = {}  # product_id → new abc_class
    for r in rows:
        rev = float(r.revenue)
        cumulative += rev
        pct = (cumulative / total_revenue) * 100

        if pct <= 80:
            abc = "A"
        elif pct <= 95:
            abc = "B"
        else:
            abc = "C"

        abc_assignments[r.id] = abc

    # ── Batch update вместо N+1 (1 запрос на класс вместо N) ──
    updated = 0
    for abc_class in ("A", "B", "C"):
        ids = [pid for pid, cls in abc_assignments.items() if cls == abc_class]
        if not ids:
            continue
        result2 = await db.execute(
            select(Product).where(Product.id.in_(ids), Product.abc_class != abc_class)
        )
        products_to_update = result2.scalars().all()
        for p in products_to_update:
            p.abc_class = abc_class
            updated += 1

    await db.commit()
    return {"success": True, "period_days": days, "updated": updated, "total_products": len(rows)}


# ═══════════════════════════════════════════
# 8. MARGINS — маржинальность товаров
# ═══════════════════════════════════════════

@router.get("/margins")
async def product_margins(
    days: int = Query(30, ge=1, le=365),
    limit: int = Query(30, ge=1, le=100),
    sort: str = Query("margin_desc", description="margin_desc / margin_asc / revenue_desc"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN)),
) -> dict:
    """Маржинальность товаров: выручка vs себестоимость."""
    since = datetime.now(timezone.utc) - timedelta(days=days)

    result = await db.execute(
        select(
            Product.sku,
            Product.name,
            Product.category,
            Product.price,
            Product.cost_price,
            func.coalesce(func.sum(PurchaseItem.quantity), 0).label("total_sold"),
            func.coalesce(func.sum(PurchaseItem.total), 0).label("total_revenue"),
        )
        .join(PurchaseItem, PurchaseItem.product_id == Product.id)
        .where(
            PurchaseItem.created_at >= since,
            Product.is_active == True,
            Product.cost_price != None,
            Product.cost_price > 0,
        )
        .group_by(Product.id, Product.sku, Product.name, Product.category, Product.price, Product.cost_price)
        .order_by(desc("total_revenue"))
        .limit(limit * 2)  # Берём больше для сортировки
    )
    rows = result.all()

    items = []
    for r in rows:
        revenue = float(r.total_revenue)
        cost = float(r.total_sold) * float(r.cost_price) if r.cost_price else 0
        profit = revenue - cost
        margin_pct = round((profit / revenue) * 100, 1) if revenue > 0 else 0

        items.append({
            "sku": r.sku,
            "name": r.name,
            "category": r.category,
            "price": float(r.price),
            "cost_price": float(r.cost_price),
            "total_sold": float(r.total_sold),
            "total_revenue": revenue,
            "total_cost": round(cost, 2),
            "total_profit": round(profit, 2),
            "margin_percent": margin_pct,
        })

    # Сортировка
    if sort == "margin_desc":
        items.sort(key=lambda x: x["margin_percent"], reverse=True)
    elif sort == "margin_asc":
        items.sort(key=lambda x: x["margin_percent"])
    elif sort == "revenue_desc":
        items.sort(key=lambda x: x["total_revenue"], reverse=True)

    items = items[:limit]

    total_revenue = sum(i["total_revenue"] for i in items)
    total_profit = sum(i["total_profit"] for i in items)
    avg_margin = round((total_profit / total_revenue) * 100, 1) if total_revenue > 0 else 0

    return {
        "period_days": days,
        "total_revenue": total_revenue,
        "total_profit": total_profit,
        "avg_margin_percent": avg_margin,
        "items": items,
    }


# ═══════════════════════════════════════════
# 9. FREQUENTLY BOUGHT TOGETHER
# ═══════════════════════════════════════════

@router.get("/frequently-bought")
async def frequently_bought_together(
    days: int = Query(90, ge=30, le=365),
    min_count: int = Query(3, ge=2, description="Минимум совместных покупок"),
    limit: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN)),
) -> dict:
    """Пары товаров, которые часто покупают вместе (кросс-сейл)."""
    since = datetime.now(timezone.utc) - timedelta(days=days)

    # Алиасы для self-join
    from sqlalchemy.orm import aliased
    PI_A = aliased(PurchaseItem)
    PI_B = aliased(PurchaseItem)
    Prod_A = aliased(Product)
    Prod_B = aliased(Product)

    result = await db.execute(
        select(
            Prod_A.sku.label("sku_a"),
            Prod_A.name.label("name_a"),
            Prod_B.sku.label("sku_b"),
            Prod_B.name.label("name_b"),
            func.count().label("times"),
        )
        .select_from(PI_A)
        .join(PI_B, and_(
            PI_A.receipt_number == PI_B.receipt_number,
            PI_A.product_id < PI_B.product_id,  # Избежать дубликатов пар
        ))
        .join(Prod_A, Prod_A.id == PI_A.product_id)
        .join(Prod_B, Prod_B.id == PI_B.product_id)
        .where(
            PI_A.created_at >= since,
            PI_A.receipt_number != None,
        )
        .group_by(Prod_A.sku, Prod_A.name, Prod_B.sku, Prod_B.name)
        .having(func.count() >= min_count)
        .order_by(desc("times"))
        .limit(limit)
    )
    rows = result.all()

    # Подсчёт общего количества чеков для confidence
    total_receipts = await db.execute(
        select(func.count(func.distinct(PurchaseItem.receipt_number)))
        .where(PurchaseItem.created_at >= since, PurchaseItem.receipt_number != None)
    )
    total = total_receipts.scalar() or 1

    pairs = []
    for r in rows:
        pairs.append({
            "product_a_sku": r.sku_a,
            "product_a_name": r.name_a,
            "product_b_sku": r.sku_b,
            "product_b_name": r.name_b,
            "times_bought_together": r.times,
            "confidence": round(r.times / total, 4),
        })

    return {"period_days": days, "total_receipts": total, "pairs": pairs}


# ═══════════════════════════════════════════
# 10. SETTINGS — настройки товарной аналитики
# ═══════════════════════════════════════════

@router.get("/settings")
async def get_product_settings(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_role(UserRole.SUPER_ADMIN)),
) -> dict:
    """Получить настройки товарной аналитики."""
    keys = [
        "PRODUCT_LOW_STOCK_ALERT_ENABLED",
        "PRODUCT_REORDER_DAYS",
        "PRODUCT_DEAD_STOCK_DAYS",
        "PRODUCT_ALERT_PHONE",
        "PRODUCT_ALERT_CHANNEL",
        "PRODUCT_DAILY_DIGEST_ENABLED",
    ]
    result = await db.execute(select(Setting).where(Setting.key.in_(keys)))
    settings_map = {s.key: s.value for s in result.scalars().all()}

    return {
        "low_stock_alert_enabled": settings_map.get("PRODUCT_LOW_STOCK_ALERT_ENABLED", "true") == "true",
        "reorder_days": int(settings_map.get("PRODUCT_REORDER_DAYS", "14")),
        "dead_stock_days": int(settings_map.get("PRODUCT_DEAD_STOCK_DAYS", "30")),
        "alert_phone": settings_map.get("PRODUCT_ALERT_PHONE", ""),
        "alert_channel": settings_map.get("PRODUCT_ALERT_CHANNEL", "whatsapp"),
        "daily_digest_enabled": settings_map.get("PRODUCT_DAILY_DIGEST_ENABLED", "false") == "true",
    }


@router.put("/settings")
async def update_product_settings(
    low_stock_alert_enabled: Optional[bool] = None,
    reorder_days: Optional[int] = Query(None, ge=1, le=90),
    dead_stock_days: Optional[int] = Query(None, ge=7, le=365),
    alert_phone: Optional[str] = Query(None, max_length=20),
    alert_channel: Optional[str] = Query(None, description="whatsapp / telegram"),
    daily_digest_enabled: Optional[bool] = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_role(UserRole.SUPER_ADMIN)),
) -> dict:
    """Обновить настройки товарной аналитики."""
    updates = {}
    if low_stock_alert_enabled is not None:
        updates["PRODUCT_LOW_STOCK_ALERT_ENABLED"] = str(low_stock_alert_enabled).lower()
    if reorder_days is not None:
        updates["PRODUCT_REORDER_DAYS"] = str(reorder_days)
    if dead_stock_days is not None:
        updates["PRODUCT_DEAD_STOCK_DAYS"] = str(dead_stock_days)
    if alert_phone is not None:
        updates["PRODUCT_ALERT_PHONE"] = alert_phone
    if alert_channel is not None:
        updates["PRODUCT_ALERT_CHANNEL"] = alert_channel
    if daily_digest_enabled is not None:
        updates["PRODUCT_DAILY_DIGEST_ENABLED"] = str(daily_digest_enabled).lower()

    for key, value in updates.items():
        result = await db.execute(select(Setting).where(Setting.key == key))
        setting = result.scalar_one_or_none()
        if setting:
            setting.value = value
        else:
            db.add(Setting(key=key, value=value))

    await db.commit()
    return {"success": True, "updated": list(updates.keys())}


# ═══════════════════════════════════════════
# 11. DAILY DIGEST — дайджест для WhatsApp/TG
# ═══════════════════════════════════════════

@router.get("/daily-digest")
async def daily_digest(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN)),
) -> dict:
    """Генерация текста дневного дайджеста (для WhatsApp/Telegram)."""
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    # Продажи за сегодня
    today_sales = await db.execute(
        select(
            func.count(func.distinct(PurchaseItem.receipt_number)).label("receipts"),
            func.coalesce(func.sum(PurchaseItem.total), 0).label("revenue"),
            func.coalesce(func.sum(PurchaseItem.quantity), 0).label("items_sold"),
        )
        .where(PurchaseItem.created_at >= today_start)
    )
    ts = today_sales.one()

    # Критические алерты
    critical = await db.execute(
        select(func.count()).select_from(Product).where(
            Product.is_active == True,
            Product.current_stock <= 0,
        )
    )
    critical_count = critical.scalar() or 0

    low = await db.execute(
        select(func.count()).select_from(Product).where(
            Product.is_active == True,
            Product.current_stock > 0,
            Product.min_stock_level > 0,
            Product.current_stock <= Product.min_stock_level,
        )
    )
    low_count = low.scalar() or 0

    # Топ-5 продаж за сегодня
    top5 = await db.execute(
        select(
            Product.name,
            func.sum(PurchaseItem.quantity).label("qty"),
        )
        .join(PurchaseItem, PurchaseItem.product_id == Product.id)
        .where(PurchaseItem.created_at >= today_start)
        .group_by(Product.name)
        .order_by(desc("qty"))
        .limit(5)
    )
    top5_items = top5.all()

    # Формирование текста
    lines = [
        "📊 *ДАЙДЖЕСТ ТОВАРОВ — Смарт Центр*",
        f"📅 {now.strftime('%d.%m.%Y')}",
        "",
        f"🛒 Чеков сегодня: *{ts.receipts}*",
        f"💰 Выручка: *{float(ts.revenue):,.0f} сом*",
        f"📦 Продано позиций: *{float(ts.items_sold):,.0f}*",
        "",
    ]

    if critical_count > 0 or low_count > 0:
        lines.append("⚠️ *АЛЕРТЫ:*")
        if critical_count:
            lines.append(f"🔴 Нет в наличии: *{critical_count}* товаров")
        if low_count:
            lines.append(f"🟡 Низкий остаток: *{low_count}* товаров")
        lines.append("")

    if top5_items:
        lines.append("🏆 *ТОП-5 продаж сегодня:*")
        for i, item in enumerate(top5_items, 1):
            lines.append(f"{i}. {item.name} — {float(item.qty):.0f} шт")

    digest_text = "\n".join(lines)

    return {
        "digest_text": digest_text,
        "stats": {
            "receipts_today": ts.receipts,
            "revenue_today": float(ts.revenue),
            "items_sold_today": float(ts.items_sold),
            "critical_alerts": critical_count,
            "low_stock_alerts": low_count,
        },
    }
