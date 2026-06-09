"""
E-Commerce / Интернет-магазин API.
Каталог товаров, корзина, заказы — для клиентов (cabinet.smartcentr.store).
"""

import uuid
import secrets
from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func, case, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.security import get_current_customer
from app.models import (
    Product, Customer, BonusAccount, Order, OrderItem, Transaction,
    TransactionType, Setting,
)

router = APIRouter(prefix="/shop", tags=["shop"])


# ═══════════════════════════════════════════
# SCHEMAS
# ═══════════════════════════════════════════

class ProductOut(BaseModel):
    id: str
    sku: str
    name: str
    category: str | None = None
    price: float
    image_url: str | None = None
    description: str | None = None
    unit: str = "шт"
    in_stock: bool = True

class CategoryOut(BaseModel):
    name: str
    count: int

class CartItem(BaseModel):
    product_id: str
    quantity: float = Field(gt=0)

class CreateOrderRequest(BaseModel):
    items: list[CartItem] = Field(min_length=1)
    delivery_type: str = "pickup"       # "pickup" | "delivery"
    payment_method: str = "cash"        # "cash" | "card" | "bonus" | "bonus_cash" | "bonus_card"
    bonus_amount: float = 0             # Сумма бонусов для оплаты
    delivery_address: str | None = None
    delivery_phone: str | None = None
    delivery_note: str | None = None

class OrderItemOut(BaseModel):
    product_name: str
    product_sku: str
    quantity: float
    price: float
    total: float
    image_url: str | None = None

class OrderOut(BaseModel):
    id: str
    order_number: str
    status: str
    subtotal: float
    bonus_used: float
    delivery_fee: float
    total: float
    payment_method: str
    is_paid: bool
    delivery_type: str
    delivery_address: str | None
    items: list[OrderItemOut]
    created_at: str
    status_note: str | None = None


# ═══════════════════════════════════════════
# КАТАЛОГ
# ═══════════════════════════════════════════

@router.get("/catalog")
async def get_catalog(
    category: str | None = None,
    search: str | None = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    sort: str = "name",  # name, price_asc, price_desc, popular
    db: AsyncSession = Depends(get_db),
):
    """Каталог товаров для интернет-магазина."""
    q = select(Product).where(
        Product.is_active == True,
        Product.is_visible == True,
        Product.price > 0,
    )

    if category:
        q = q.where(Product.category == category)

    if search:
        search_term = f"%{search.strip()}%"
        q = q.where(
            or_(
                Product.name.ilike(search_term),
                Product.sku.ilike(search_term),
                Product.barcode.ilike(search_term),
            )
        )

    # Sorting
    if sort == "price_asc":
        q = q.order_by(Product.price.asc())
    elif sort == "price_desc":
        q = q.order_by(Product.price.desc())
    elif sort == "popular":
        q = q.order_by(Product.last_sold_at.desc().nullslast())
    else:
        q = q.order_by(Product.name)

    # Count
    count_q = select(func.count()).select_from(q.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    # Paginate
    offset = (page - 1) * limit
    rows = (await db.execute(q.offset(offset).limit(limit))).scalars().all()

    products = [
        ProductOut(
            id=str(p.id),
            sku=p.sku,
            name=p.name,
            category=p.category,
            price=float(p.price),
            image_url=p.image_url,
            description=p.description,
            unit=p.unit,
            in_stock=p.current_stock > 0,
        )
        for p in rows
    ]

    return {
        "products": [p.model_dump() for p in products],
        "total": total,
        "page": page,
        "pages": max(1, -(-total // limit)),
    }


@router.get("/categories")
async def get_categories(db: AsyncSession = Depends(get_db)):
    """Список категорий с количеством видимых товаров."""
    q = (
        select(Product.category, func.count(Product.id))
        .where(
            Product.is_active == True,
            Product.is_visible == True,
            Product.price > 0,
            Product.category.isnot(None),
        )
        .group_by(Product.category)
        .order_by(func.count(Product.id).desc())
    )
    rows = (await db.execute(q)).all()
    return {
        "categories": [
            {"name": r[0], "count": r[1]} for r in rows
        ]
    }


@router.get("/product/{product_id}")
async def get_product(product_id: str, db: AsyncSession = Depends(get_db)):
    """Детали одного товара."""
    p = (await db.execute(
        select(Product).where(Product.id == uuid.UUID(product_id), Product.is_active == True)
    )).scalar_one_or_none()

    if not p:
        raise HTTPException(404, "Товар не найден")

    return {
        "id": str(p.id),
        "sku": p.sku,
        "name": p.name,
        "category": p.category,
        "price": float(p.price),
        "image_url": p.image_url,
        "description": p.description,
        "unit": p.unit,
        "in_stock": p.current_stock > 0,
        "current_stock": float(p.current_stock),
    }


# ═══════════════════════════════════════════
# ЗАКАЗЫ
# ═══════════════════════════════════════════

def _gen_order_number() -> str:
    """Генерация номера заказа: SC-XXXXXX."""
    return f"SC-{secrets.token_hex(3).upper()}"


@router.post("/orders")
async def create_order(
    body: CreateOrderRequest,
    customer: dict = Depends(get_current_customer),
    db: AsyncSession = Depends(get_db),
):
    """Создание заказа клиентом."""
    customer_id = uuid.UUID(customer["sub"])

    # 1. Загрузить товары
    product_ids = [uuid.UUID(item.product_id) for item in body.items]
    products_result = await db.execute(
        select(Product).where(Product.id.in_(product_ids), Product.is_active == True)
    )
    products_map: dict[uuid.UUID, Product] = {p.id: p for p in products_result.scalars().all()}

    # Проверить все товары существуют
    for item in body.items:
        pid = uuid.UUID(item.product_id)
        if pid not in products_map:
            raise HTTPException(400, f"Товар не найден: {item.product_id}")
        product = products_map[pid]
        if product.current_stock < Decimal(str(item.quantity)):
            raise HTTPException(400, f"Недостаточно на складе: {product.name} (есть {product.current_stock})")

    # 2. Рассчитать суммы
    subtotal = Decimal("0")
    order_items: list[OrderItem] = []
    for item in body.items:
        product = products_map[uuid.UUID(item.product_id)]
        qty = Decimal(str(item.quantity))
        item_total = product.price * qty
        subtotal += item_total
        order_items.append(OrderItem(
            product_id=product.id,
            product_name=product.name,
            product_sku=product.sku,
            quantity=qty,
            price=product.price,
            total=item_total,
        ))

    # 3. Доставка
    delivery_fee = Decimal("0")
    if body.delivery_type == "delivery":
        # Бесплатная доставка от 5000 сом
        delivery_setting = (await db.execute(
            select(Setting.value).where(Setting.key == "SHOP_FREE_DELIVERY_MIN")
        )).scalar_one_or_none()
        free_min = Decimal(delivery_setting or "5000")

        fee_setting = (await db.execute(
            select(Setting.value).where(Setting.key == "SHOP_DELIVERY_FEE")
        )).scalar_one_or_none()
        delivery_fee = Decimal(fee_setting or "200") if subtotal < free_min else Decimal("0")

    # 4. Бонусы
    bonus_used = Decimal("0")
    if body.bonus_amount > 0 and body.payment_method in ("bonus", "bonus_cash", "bonus_card"):
        account = (await db.execute(
            select(BonusAccount).where(BonusAccount.customer_id == customer_id)
        )).scalar_one_or_none()

        if not account:
            raise HTTPException(400, "Бонусный счёт не найден")

        max_bonus = min(
            Decimal(str(body.bonus_amount)),
            account.balance,
            subtotal * Decimal("0.30"),  # макс 30%
        )
        bonus_used = max(Decimal("0"), max_bonus).quantize(Decimal("0.01"))

    total = subtotal + delivery_fee - bonus_used

    # 5. Если полностью бонусами — проверить
    if body.payment_method == "bonus" and total > 0:
        raise HTTPException(400, f"Недостаточно бонусов. Нужно ещё {total} сом")

    # 6. Создать заказ
    order_number = _gen_order_number()
    # Ensure unique
    while (await db.execute(select(Order.id).where(Order.order_number == order_number))).scalar_one_or_none():
        order_number = _gen_order_number()

    order = Order(
        order_number=order_number,
        customer_id=customer_id,
        subtotal=subtotal,
        bonus_used=bonus_used,
        delivery_fee=delivery_fee,
        total=total,
        payment_method=body.payment_method,
        is_paid=(body.payment_method == "bonus" and total == 0),
        delivery_type=body.delivery_type,
        delivery_address=body.delivery_address,
        delivery_phone=body.delivery_phone or customer.get("phone"),
        delivery_note=body.delivery_note,
        status="pending",
    )
    db.add(order)
    await db.flush()

    for oi in order_items:
        oi.order_id = order.id
        db.add(oi)

    # 7. Списать бонусы
    if bonus_used > 0:
        account = (await db.execute(
            select(BonusAccount).where(BonusAccount.customer_id == customer_id)
        )).scalar_one_or_none()
        account.balance -= bonus_used
        account.total_spent += bonus_used

        txn = Transaction(
            customer_id=customer_id,
            type=TransactionType.SPEND,
            amount=bonus_used,
            purchase_amount=subtotal,
            note=f"Оплата заказа #{order_number}",
        )
        db.add(txn)

    await db.commit()

    # 8. WhatsApp уведомление (fire-and-forget)
    try:
        from app.services.whatsapp import send_whatsapp_message
        cust = (await db.execute(select(Customer).where(Customer.id == customer_id))).scalar_one_or_none()
        if cust:
            msg = (
                f"✅ Заказ #{order_number} принят!\n\n"
                f"💰 Сумма: {float(subtotal):,.0f} сом\n"
            )
            if bonus_used > 0:
                msg += f"🎁 Бонусы: -{float(bonus_used):,.0f} сом\n"
            if delivery_fee > 0:
                msg += f"🚗 Доставка: {float(delivery_fee):,.0f} сом\n"
            msg += f"💵 К оплате: {float(total):,.0f} сом\n\n"
            msg += "📞 Мы свяжемся для подтверждения!"
            await send_whatsapp_message(cust.phone, msg)
    except Exception:
        pass

    return {
        "order_id": str(order.id),
        "order_number": order_number,
        "subtotal": float(subtotal),
        "bonus_used": float(bonus_used),
        "delivery_fee": float(delivery_fee),
        "total": float(total),
        "status": "pending",
        "message": f"Заказ #{order_number} создан!",
    }


@router.get("/orders")
async def my_orders(
    customer: dict = Depends(get_current_customer),
    db: AsyncSession = Depends(get_db),
):
    """Мои заказы."""
    customer_id = uuid.UUID(customer["sub"])
    q = (
        select(Order)
        .where(Order.customer_id == customer_id)
        .options(selectinload(Order.items))
        .order_by(Order.created_at.desc())
        .limit(50)
    )
    orders = (await db.execute(q)).scalars().all()

    # Get product images
    all_pids = set()
    for o in orders:
        for item in o.items:
            all_pids.add(item.product_id)
    images = {}
    if all_pids:
        rows = (await db.execute(
            select(Product.id, Product.image_url).where(Product.id.in_(all_pids))
        )).all()
        images = {r[0]: r[1] for r in rows}

    result = []
    for o in orders:
        result.append(OrderOut(
            id=str(o.id),
            order_number=o.order_number,
            status=o.status,
            subtotal=float(o.subtotal),
            bonus_used=float(o.bonus_used),
            delivery_fee=float(o.delivery_fee),
            total=float(o.total),
            payment_method=o.payment_method,
            is_paid=o.is_paid,
            delivery_type=o.delivery_type,
            delivery_address=o.delivery_address,
            items=[
                OrderItemOut(
                    product_name=item.product_name,
                    product_sku=item.product_sku,
                    quantity=float(item.quantity),
                    price=float(item.price),
                    total=float(item.total),
                    image_url=images.get(item.product_id),
                )
                for item in o.items
            ],
            created_at=o.created_at.isoformat(),
            status_note=o.status_note,
        ).model_dump())

    return {"orders": result}


@router.get("/orders/{order_id}")
async def get_order(
    order_id: str,
    customer: dict = Depends(get_current_customer),
    db: AsyncSession = Depends(get_db),
):
    """Детали заказа."""
    customer_id = uuid.UUID(customer["sub"])
    o = (await db.execute(
        select(Order)
        .where(Order.id == uuid.UUID(order_id), Order.customer_id == customer_id)
        .options(selectinload(Order.items))
    )).scalar_one_or_none()

    if not o:
        raise HTTPException(404, "Заказ не найден")

    # Product images
    pids = [item.product_id for item in o.items]
    images = {}
    if pids:
        rows = (await db.execute(
            select(Product.id, Product.image_url).where(Product.id.in_(pids))
        )).all()
        images = {r[0]: r[1] for r in rows}

    return OrderOut(
        id=str(o.id),
        order_number=o.order_number,
        status=o.status,
        subtotal=float(o.subtotal),
        bonus_used=float(o.bonus_used),
        delivery_fee=float(o.delivery_fee),
        total=float(o.total),
        payment_method=o.payment_method,
        is_paid=o.is_paid,
        delivery_type=o.delivery_type,
        delivery_address=o.delivery_address,
        items=[
            OrderItemOut(
                product_name=item.product_name,
                product_sku=item.product_sku,
                quantity=float(item.quantity),
                price=float(item.price),
                total=float(item.total),
                image_url=images.get(item.product_id),
            )
            for item in o.items
        ],
        created_at=o.created_at.isoformat(),
        status_note=o.status_note,
    ).model_dump()


@router.post("/orders/{order_id}/cancel")
async def cancel_order(
    order_id: str,
    customer: dict = Depends(get_current_customer),
    db: AsyncSession = Depends(get_db),
):
    """Отмена заказа клиентом (только pending/confirmed)."""
    customer_id = uuid.UUID(customer["sub"])
    o = (await db.execute(
        select(Order).where(
            Order.id == uuid.UUID(order_id),
            Order.customer_id == customer_id,
        )
    )).scalar_one_or_none()

    if not o:
        raise HTTPException(404, "Заказ не найден")

    if o.status not in ("pending", "confirmed"):
        raise HTTPException(400, "Заказ уже нельзя отменить")

    o.status = "cancelled"
    o.cancelled_at = datetime.utcnow()
    o.cancel_reason = "Отменён клиентом"

    # Вернуть бонусы
    if o.bonus_used > 0:
        account = (await db.execute(
            select(BonusAccount).where(BonusAccount.customer_id == customer_id)
        )).scalar_one_or_none()
        if account:
            account.balance += o.bonus_used
            account.total_spent -= o.bonus_used

            txn = Transaction(
                customer_id=customer_id,
                type=TransactionType.REFUND,
                amount=o.bonus_used,
                note=f"Возврат бонусов за отменённый заказ #{o.order_number}",
            )
            db.add(txn)

    await db.commit()
    return {"message": f"Заказ #{o.order_number} отменён", "bonus_refunded": float(o.bonus_used)}
