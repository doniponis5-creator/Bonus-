"""
Sbonus+ — Товар қидирув (кассир учун).

Endpoints:
  GET  /api/v1/cashier/products/search  — smart-search товаров (кассир+админ)
  GET  /api/v1/cashier/products/config  — настройки отображения
"""

import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, case, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.core.database import get_db
from app.core.security import get_current_user, require_role, UserRole
from app.models import Product, PurchaseItem, Setting, Transaction, TransactionType

router = APIRouter(
    prefix="/cashier/products",
    tags=["Кассир — Товары"],
)


async def _get_setting_bool(db: AsyncSession, key: str, default: bool = False) -> bool:
    result = await db.execute(select(Setting).where(Setting.key == key))
    s = result.scalar_one_or_none()
    if s is None:
        return default
    return s.value.lower() in ("true", "1", "yes")


@router.get("/search")
async def cashier_product_search(
    q: str = Query(..., min_length=1, max_length=100, description="Поиск: название, SKU или штрих-код"),
    category: Optional[str] = Query(None, description="Фильтр по категории"),
    limit: int = Query(30, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_role(
        UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN, UserRole.CASHIER
    )),
) -> dict:
    """
    Smart-поиск товаров для кассира.

    Ищет по: название (ilike), SKU (ilike), штрих-код (exact/prefix).
    Сортировка: точные совпадения наверху, потом по остатку desc.
    """
    search_term = q.strip()

    # Себестоимость — показывать ли кассиру?
    show_cost = await _get_setting_bool(db, "CASHIER_SHOW_COST_PRICE", False)

    # Если пользователь — админ, всегда показываем
    user_role = current_user.get("role", "")
    if user_role in ("super_admin", "branch_admin"):
        show_cost = True

    # ── Собираем запрос ──
    query = select(Product).where(Product.is_active == True)

    # Smart search: по названию, SKU, штрих-коду
    query = query.where(
        or_(
            Product.name.ilike(f"%{search_term}%"),
            Product.sku.ilike(f"%{search_term}%"),
            Product.barcode.ilike(f"{search_term}%"),  # prefix match для сканера
        )
    )

    # Фильтр по категории
    if category:
        query = query.where(Product.category == category)

    # Сортировка: сначала точные совпадения SKU/barcode, потом по остатку
    query = query.order_by(
        # Exact SKU match first
        case(
            (Product.sku.ilike(search_term), 0),
            (Product.barcode == search_term, 0),
            else_=1,
        ).asc(),
        Product.current_stock.desc(),
        Product.name.asc(),
    )

    result = await db.execute(query.limit(limit))
    products = result.scalars().all()

    # ── Категории для фильтра ──
    cats_result = await db.execute(
        select(Product.category, func.count())
        .where(Product.is_active == True, Product.category.isnot(None))
        .group_by(Product.category)
        .order_by(func.count().desc())
        .limit(20)
    )
    categories = [r[0] for r in cats_result.all() if r[0]]

    return {
        "total": len(products),
        "show_cost_price": show_cost,
        "products": [
            {
                "id": str(p.id),
                "name": p.name,
                "category": p.category,
                "price": float(p.price),
                "cost_price": float(p.cost_price) if (show_cost and p.cost_price) else None,
                "current_stock": float(p.current_stock),
                "unit": p.unit or "шт",
                "barcode": p.barcode,
                "is_low_stock": p.current_stock <= p.min_stock_level if p.min_stock_level else False,
            }
            for p in products
        ],
        "categories": categories,
    }


@router.get("/config")
async def cashier_product_config(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_role(
        UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN, UserRole.CASHIER
    )),
) -> dict:
    """Настройки отображения товаров для кассира."""
    show_cost = await _get_setting_bool(db, "CASHIER_SHOW_COST_PRICE", False)

    user_role = current_user.get("role", "")
    if user_role in ("super_admin", "branch_admin"):
        show_cost = True

    return {
        "show_cost_price": show_cost,
    }


# ═══════════════════════════════════════════
# UPSELL — подсказки кассиру (порог-бонусы + рекомендации)
# ═══════════════════════════════════════════

@router.get("/basket-tiers")
async def get_basket_tiers(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_role(
        UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN, UserRole.CASHIER
    )),
) -> dict:
    """Порог-бонусы за размер чека (для превью на экране начисления)."""
    from app.services.bonus import get_basket_bonus_tiers
    tiers = await get_basket_bonus_tiers(db)
    return {
        "tiers": [{"min": float(t["min"]), "bonus": float(t["bonus"])} for t in tiers],
    }


@router.get("/upsell/{customer_id}")
async def customer_upsell_suggestions(
    customer_id: uuid.UUID,
    days: int = Query(90, ge=30, le=365),
    limit: int = Query(3, ge=1, le=10),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_role(
        UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN, UserRole.CASHIER
    )),
) -> dict:
    """
    Рекомендации товаров для допродажи конкретному клиенту:
    товары, которые часто покупают вместе с тем, что клиент уже брал.
    Fallback: топ-продажи в наличии.
    """
    since = datetime.now(timezone.utc) - timedelta(days=days)

    # 1) Товары клиента за период
    cust_products_result = await db.execute(
        select(PurchaseItem.product_id)
        .join(Transaction, Transaction.id == PurchaseItem.transaction_id)
        .where(
            Transaction.customer_id == customer_id,
            PurchaseItem.created_at >= since,
            PurchaseItem.product_id != None,
        )
        .group_by(PurchaseItem.product_id)
    )
    cust_product_ids = [r[0] for r in cust_products_result.all()]

    suggestions = []
    source = "frequently_bought"

    if cust_product_ids:
        # 2) Co-occurrence: чеки с товарами клиента → другие товары в тех же чеках
        PI_A = aliased(PurchaseItem)
        PI_B = aliased(PurchaseItem)
        result = await db.execute(
            select(
                Product.id, Product.sku, Product.name, Product.price,
                Product.category, func.count().label("times"),
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
                PI_A.receipt_number != None,
                Product.is_active == True,
                Product.current_stock > 0,
            )
            .group_by(Product.id, Product.sku, Product.name, Product.price, Product.category)
            .order_by(desc("times"))
            .limit(limit)
        )
        suggestions = [
            {
                "product_id": str(r.id), "sku": r.sku, "name": r.name,
                "price": float(r.price or 0), "category": r.category,
                "times_bought_together": r.times,
            }
            for r in result.all()
        ]

    # 3) Fallback: топ-продажи в наличии
    if not suggestions:
        source = "top_sellers"
        result = await db.execute(
            select(
                Product.id, Product.sku, Product.name, Product.price,
                Product.category, func.count().label("times"),
            )
            .select_from(PurchaseItem)
            .join(Product, Product.id == PurchaseItem.product_id)
            .where(
                PurchaseItem.created_at >= since,
                Product.is_active == True,
                Product.current_stock > 0,
            )
            .group_by(Product.id, Product.sku, Product.name, Product.price, Product.category)
            .order_by(desc("times"))
            .limit(limit)
        )
        suggestions = [
            {
                "product_id": str(r.id), "sku": r.sku, "name": r.name,
                "price": float(r.price or 0), "category": r.category,
                "times_bought_together": r.times,
            }
            for r in result.all()
        ]

    return {"source": source, "suggestions": suggestions}
