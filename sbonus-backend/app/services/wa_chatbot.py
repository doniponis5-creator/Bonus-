"""
SBonus+ — WhatsApp AI Chatbot.

Полноценный бот для клиентов:
- Баланс и уровень
- История транзакций
- Активные акции и купоны
- Колесо удачи (статус спинов)
- Реферальный код
- Ближайший филиал
- Долги/рассрочки
- Помощь
"""

import logging
from datetime import datetime, timedelta
from decimal import Decimal

from sqlalchemy import select, func, and_, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    BonusAccount, Customer, Coupon, CustomerDebt,
    Setting, Tier, Transaction, TransactionType,
    BonusCampaign, PromoCode, Product,
)

logger = logging.getLogger(__name__)

# ─── Command patterns ───
COMMANDS = {
    "balance": ["БАЛАНС", "BALANCE", "БАЛАНСИМ", "БОНУС", "BONUS", "💰", "БАЛАНС?"],
    "history": ["ИСТОРИЯ", "HISTORY", "ТАРИХ", "ОПЕРАЦИИ", "ПОКУПКИ"],
    "promo": ["АКЦИИ", "АКЦИЯ", "PROMO", "ПРОМО", "СКИДКИ", "AKSIYA", "AKSIYALAR"],
    "coupon": ["КУПОНЫ", "КУПОН", "COUPON", "KUPON"],
    "wheel": ["КОЛЕСО", "WHEEL", "SPIN", "СПИН", "УДАЧА", "GILDIRAK"],
    "referral": ["РЕФЕРАЛ", "REFERRAL", "ДРУГ", "ПРИГЛАСИТЬ", "КОД", "TAKLIF"],
    "debt": ["ДОЛГ", "ДОЛГИ", "РАССРОЧКА", "QARZ", "DEBT", "NASIYA"],
    "help": ["ПОМОЩЬ", "HELP", "КОМАНДЫ", "МЕНЮ", "MENU", "YORDAM", "СТАРТ", "START", "ПРИВЕТ", "HI", "САЛОМ"],
    "contact": ["КОНТАКТ", "АДРЕС", "ТЕЛЕФОН", "ALOQA", "CONTACT", "МАНЗИЛ"],
    "tier": ["УРОВЕНЬ", "TIER", "СТАТУС", "STATUS", "DARAJA"],
    "products": ["ТОВАР", "ТОВАРЫ", "КАТАЛОГ", "ЦЕНА", "ЦЕНЫ", "PRODUCT", "CATALOG", "MAHSULOT", "NARX", "PRICE"],
    "search_product": ["НАЙТИ", "ПОИСК", "SEARCH", "QIDIRUV", "IZLASH"],
}


def detect_command(text: str) -> str | None:
    """Определить команду по тексту сообщения."""
    text_upper = text.upper().strip()
    for cmd, keywords in COMMANDS.items():
        for kw in keywords:
            if kw in text_upper:
                return cmd
    # Если просто число — может промокод
    if text.strip().isdigit() or (len(text.strip()) >= 4 and text.strip().isalnum()):
        return "promo_code_check"
    return None


async def handle_message(
    phone: str,
    text: str,
    db: AsyncSession,
) -> str | None:
    """
    Обработать входящее сообщение от клиента.
    Возвращает текст ответа или None, если команда не распознана.
    """
    command = detect_command(text)
    if not command:
        return _default_reply()

    # Находим клиента
    result = await db.execute(
        select(Customer)
        .options(selectinload(Customer.tier))
        .where(Customer.phone == phone)
    )
    customer = result.scalar_one_or_none()

    handlers = {
        "balance": _handle_balance,
        "history": _handle_history,
        "promo": _handle_promo,
        "coupon": _handle_coupons,
        "wheel": _handle_wheel,
        "referral": _handle_referral,
        "debt": _handle_debt,
        "help": _handle_help,
        "contact": _handle_contact,
        "tier": _handle_tier,
        "promo_code_check": _handle_promo_code_check,
        "products": _handle_products,
        "search_product": _handle_search_product,
    }

    handler = handlers.get(command, _handle_help)
    try:
        return await handler(phone, text, customer, db)
    except Exception as e:
        logger.error(f"Chatbot error for {phone}: {e}")
        return "⚠️ Произошла ошибка. Попробуйте позже или обратитесь к кассиру."


# ═══════════════════════════════════════════
# HANDLERS
# ═══════════════════════════════════════════

async def _handle_balance(phone: str, text: str, customer: Customer | None, db: AsyncSession) -> str:
    if not customer:
        return _not_registered(phone)

    acc = await db.execute(select(BonusAccount).where(BonusAccount.customer_id == customer.id))
    account = acc.scalar_one_or_none()
    balance = account.balance if account else Decimal("0")
    total_earned = account.total_earned if account else Decimal("0")
    total_spent = account.total_spent if account else Decimal("0")
    tier_name = customer.tier.name if customer.tier else "Bronze"
    bonus_pct = customer.tier.bonus_percent if customer.tier else Decimal("2")

    # Бонусы которые скоро истекают (30 дней)
    expiring = await _get_expiring_bonus(customer.id, db)
    expiry_note = f"\n⏰ Истекает в ближайшие 30 дней: *{expiring} сом*" if expiring > 0 else ""

    return (
        f"💳 *S Bonus — Ваш баланс*\n\n"
        f"👤 {customer.full_name}\n"
        f"🏆 Уровень: *{tier_name}* (кешбэк {bonus_pct}%)\n"
        f"━━━━━━━━━━━━━━━━━━\n"
        f"💰 Баланс: *{balance:,.0f} сом*\n"
        f"📈 Всего заработано: {total_earned:,.0f} сом\n"
        f"📉 Всего потрачено: {total_spent:,.0f} сом\n"
        f"{expiry_note}\n\n"
        f"Для списания бонусов — скажите кассиру при покупке."
    )


async def _handle_history(phone: str, text: str, customer: Customer | None, db: AsyncSession) -> str:
    if not customer:
        return _not_registered(phone)

    result = await db.execute(
        select(Transaction)
        .where(Transaction.customer_id == customer.id)
        .order_by(desc(Transaction.created_at))
        .limit(10)
    )
    txs = result.scalars().all()

    if not txs:
        return "📋 У вас пока нет транзакций.\nСовершите покупку в Смарт Центр и получите бонусы!"

    lines = ["📋 *Последние 10 операций:*\n"]
    type_icons = {
        TransactionType.EARN: "🟢 +",
        TransactionType.SPEND: "🔴 -",
        TransactionType.EXPIRE: "⏰ -",
        TransactionType.REFUND: "↩️ +",
        TransactionType.BIRTHDAY: "🎂 +",
        TransactionType.REFERRAL: "👥 +",
        TransactionType.PROMO: "🎁 +",
        TransactionType.CAMPAIGN: "📢 +",
    }
    type_labels = {
        TransactionType.EARN: "Покупка",
        TransactionType.SPEND: "Списание",
        TransactionType.EXPIRE: "Истёк",
        TransactionType.REFUND: "Возврат",
        TransactionType.BIRTHDAY: "День рождения",
        TransactionType.REFERRAL: "Реферал",
        TransactionType.PROMO: "Промокод",
        TransactionType.CAMPAIGN: "Кампания",
    }
    for tx in txs:
        icon = type_icons.get(tx.type, "⚪ ")
        label = type_labels.get(tx.type, str(tx.type.value))
        dt = tx.created_at.strftime("%d.%m %H:%M")
        purchase_note = f" (чек {tx.purchase_amount:,.0f})" if tx.purchase_amount and tx.type == TransactionType.EARN else ""
        lines.append(f"{icon}{tx.amount:,.0f} сом — {label}{purchase_note} • {dt}")

    return "\n".join(lines)


async def _handle_promo(phone: str, text: str, customer: Customer | None, db: AsyncSession) -> str:
    # Active campaigns
    now = datetime.utcnow()
    result = await db.execute(
        select(BonusCampaign)
        .where(
            BonusCampaign.status == "SENT",
            BonusCampaign.sent_at >= now - timedelta(days=30),
        )
        .order_by(desc(BonusCampaign.sent_at))
        .limit(5)
    )
    campaigns = result.scalars().all()

    # Active promo codes
    promos = await db.execute(
        select(PromoCode)
        .where(
            PromoCode.is_active == True,
            (PromoCode.expires_at == None) | (PromoCode.expires_at > now),
            PromoCode.used_count < PromoCode.max_uses,
        )
        .limit(5)
    )
    active_promos = promos.scalars().all()

    lines = ["🎉 *Акции и промокоды S Bonus*\n"]

    if campaigns:
        lines.append("📢 *Последние акции:*")
        for c in campaigns:
            dt = c.sent_at.strftime("%d.%m") if c.sent_at else ""
            lines.append(f"• {c.name} — {c.amount} сом ({dt})")
        lines.append("")

    if active_promos:
        lines.append("🎁 *Активные промокоды:*")
        for p in active_promos:
            exp = f" (до {p.expires_at.strftime('%d.%m')})" if p.expires_at else ""
            lines.append(f"• Код: *{p.code}* — {p.bonus_amount} сом{exp}")
        lines.append("")

    if not campaigns and not active_promos:
        lines.append("Сейчас нет активных акций. Следите за обновлениями!")

    lines.append("💡 Чтобы активировать промокод — скажите его кассиру.")
    return "\n".join(lines)


async def _handle_coupons(phone: str, text: str, customer: Customer | None, db: AsyncSession) -> str:
    if not customer:
        return _not_registered(phone)

    result = await db.execute(
        select(Coupon)
        .where(
            Coupon.customer_id == customer.id,
            Coupon.is_active == True,
            Coupon.is_used == False,
            (Coupon.expires_at == None) | (Coupon.expires_at > datetime.utcnow()),
        )
        .order_by(desc(Coupon.created_at))
        .limit(10)
    )
    coupons = result.scalars().all()

    if not coupons:
        return "🎫 У вас нет активных купонов.\nКупоны появляются после акций и кампаний."

    lines = ["🎫 *Ваши активные купоны:*\n"]
    for c in coupons:
        exp = f" (до {c.expires_at.strftime('%d.%m.%Y')})" if c.expires_at else ""
        min_p = f" от {c.min_purchase:,.0f} сом" if c.min_purchase else ""
        lines.append(f"• *{c.title}* — {c.bonus_amount} сом{min_p}{exp}")

    lines.append("\n💡 Покажите код купона кассиру при покупке.")
    return "\n".join(lines)


async def _handle_wheel(phone: str, text: str, customer: Customer | None, db: AsyncSession) -> str:
    if not customer:
        return _not_registered(phone)

    # Calculate spins: earn_count + free_spins - used_spins
    earn_count_result = await db.execute(
        select(func.count())
        .select_from(Transaction)
        .where(
            Transaction.customer_id == customer.id,
            Transaction.type == TransactionType.EARN,
        )
    )
    earn_count = earn_count_result.scalar() or 0

    # Free spins from settings
    free_key = f"WHEEL_FREE_SPINS_{customer.id}"
    free_result = await db.execute(select(Setting).where(Setting.key == free_key))
    free_setting = free_result.scalar_one_or_none()
    free_spins = int(free_setting.value) if free_setting else 0

    # Used spins (wheel transactions or similar marker)
    used_result = await db.execute(
        select(func.count())
        .select_from(Transaction)
        .where(
            Transaction.customer_id == customer.id,
            Transaction.note.ilike("%колесо%"),
        )
    )
    used_spins = used_result.scalar() or 0

    available = max(0, earn_count + free_spins - used_spins)

    # Generate magic link
    from app.models import CustomerAuthToken
    import secrets
    token_val = secrets.token_urlsafe(32)[:64]
    auth_token = CustomerAuthToken(
        customer_id=customer.id,
        token=token_val,
        expires_at=datetime.utcnow() + timedelta(days=7),
    )
    db.add(auth_token)
    await db.commit()

    wheel_link = f"https://cabinet.smartcentr.store/wheel?token={token_val}"

    return (
        f"🎡 *Колесо удачи S Bonus*\n\n"
        f"🎰 Доступно вращений: *{available}*\n"
        f"🛒 Покупок: {earn_count}\n"
        f"🎁 Бонусные спины: {free_spins}\n"
        f"✅ Использовано: {used_spins}\n\n"
        f"👉 Крутите колесо прямо сейчас:\n{wheel_link}\n\n"
        f"💡 Каждая покупка = 1 вращение!"
    )


async def _handle_referral(phone: str, text: str, customer: Customer | None, db: AsyncSession) -> str:
    if not customer:
        return _not_registered(phone)

    ref_code = customer.referral_code or "—"

    # Count referrals
    ref_count = await db.execute(
        select(func.count()).select_from(Customer).where(Customer.referred_by == customer.id)
    )
    total_refs = ref_count.scalar() or 0

    # Get referral bonuses from settings
    inviter_result = await db.execute(select(Setting).where(Setting.key == "REFERRAL_BONUS_INVITER"))
    inviter_bonus = inviter_result.scalar_one_or_none()
    bonus_amount = inviter_bonus.value if inviter_bonus else "100"

    # Magic link for cabinet
    from app.models import CustomerAuthToken
    import secrets
    token_val = secrets.token_urlsafe(32)[:64]
    auth_token = CustomerAuthToken(
        customer_id=customer.id,
        token=token_val,
        expires_at=datetime.utcnow() + timedelta(days=7),
    )
    db.add(auth_token)
    await db.commit()

    cabinet_link = f"https://cabinet.smartcentr.store?token={token_val}"

    return (
        f"👥 *Реферальная программа S Bonus*\n\n"
        f"🔑 Ваш код: *{ref_code}*\n"
        f"👫 Приглашено друзей: *{total_refs}*\n"
        f"💰 Бонус за друга: *{bonus_amount} сом*\n\n"
        f"📲 Поделитесь ссылкой с друзьями:\n{cabinet_link}\n\n"
        f"Друг называет ваш код при регистрации — вы оба получаете бонус!"
    )


async def _handle_debt(phone: str, text: str, customer: Customer | None, db: AsyncSession) -> str:
    if not customer:
        return _not_registered(phone)

    result = await db.execute(
        select(CustomerDebt)
        .where(
            CustomerDebt.customer_id == customer.id,
            CustomerDebt.status.in_(["active", "overdue"]),
        )
        .order_by(desc(CustomerDebt.created_at))
    )
    debts = result.scalars().all()

    if not debts:
        return "✅ У вас нет активных долгов или рассрочек. Всё чисто!"

    total = sum(d.amount for d in debts)
    lines = [f"📊 *Ваши долги и рассрочки*\n"]
    lines.append(f"💳 Общая сумма: *{total:,.0f} сом*\n")

    for d in debts:
        status_icon = "🔴" if d.status == "overdue" else "🟡"
        overdue = f" (просрочено {d.overdue_days} дн.)" if d.overdue_days and d.overdue_days > 0 else ""
        lines.append(
            f"{status_icon} {d.amount:,.0f} сом{overdue}\n"
            f"   Оплачено: {d.paid_amount:,.0f} из {d.total_amount:,.0f}"
        )

    lines.append("\n📍 Для оплаты обратитесь в магазин Смарт Центр.")
    return "\n".join(lines)


async def _handle_tier(phone: str, text: str, customer: Customer | None, db: AsyncSession) -> str:
    if not customer:
        return _not_registered(phone)

    # Get all tiers
    tiers_result = await db.execute(
        select(Tier).where(Tier.is_active == True).order_by(Tier.sort_order)
    )
    all_tiers = tiers_result.scalars().all()

    acc = await db.execute(select(BonusAccount).where(BonusAccount.customer_id == customer.id))
    account = acc.scalar_one_or_none()

    current_tier = customer.tier.name if customer.tier else "Bronze"
    total_purchase = float(account.total_earned if account else 0) * 50  # Approximate

    # Get actual total from transactions
    total_result = await db.execute(
        select(func.coalesce(func.sum(Transaction.purchase_amount), 0))
        .where(
            Transaction.customer_id == customer.id,
            Transaction.type == TransactionType.EARN,
        )
    )
    total_purchase = float(total_result.scalar() or 0)

    tier_icons = {"Bronze": "🥉", "Silver": "🥈", "Gold": "🥇", "Platinum": "💎"}

    lines = [f"🏆 *Ваш уровень в S Bonus*\n"]
    lines.append(f"📊 Общая сумма покупок: *{total_purchase:,.0f} сом*\n")

    for t in all_tiers:
        icon = tier_icons.get(t.name, "⭐")
        is_current = t.name == current_tier
        marker = " ← *ВЫ ЗДЕСЬ*" if is_current else ""
        lines.append(
            f"{icon} *{t.name}* — от {t.min_total_kgs:,.0f} сом (кешбэк {t.bonus_percent}%){marker}"
        )

    # Next tier
    current_sort = customer.tier.sort_order if customer.tier else 0
    next_tier = None
    for t in all_tiers:
        if t.sort_order > current_sort:
            next_tier = t
            break

    if next_tier:
        remaining = max(0, float(next_tier.min_total_kgs) - total_purchase)
        lines.append(f"\n🎯 До *{next_tier.name}*: осталось *{remaining:,.0f} сом* покупок")

    return "\n".join(lines)


async def _handle_contact(phone: str, text: str, customer: Customer | None, db: AsyncSession) -> str:
    return (
        "📍 *Смарт Центр*\n\n"
        "🏪 Адрес: Ош обл., Араван р-н, ул. Ош-3000, 86\n"
        "📞 Тел: 0557 100 505, 0505 000 100\n"
        "🕐 Режим: 09:00 — 21:00 (без выходных)\n\n"
        "💬 Мы всегда рады вас видеть!"
    )


async def _handle_promo_code_check(phone: str, text: str, customer: Customer | None, db: AsyncSession) -> str:
    """Если пользователь отправил просто текст — возможно это промокод."""
    code = text.strip().upper()
    result = await db.execute(
        select(PromoCode).where(PromoCode.code == code, PromoCode.is_active == True)
    )
    promo = result.scalar_one_or_none()

    if promo:
        return (
            f"✅ Промокод *{promo.code}* найден!\n"
            f"💰 Бонус: *{promo.bonus_amount} сом*\n\n"
            f"Назовите этот код кассиру при покупке для активации."
        )
    return _default_reply()


async def _handle_help(phone: str, text: str, customer: Customer | None, db: AsyncSession) -> str:
    name = customer.full_name if customer else "клиент"
    return (
        f"👋 Привет, *{name}*!\n\n"
        f"🤖 Я — бот *S Bonus* магазина Смарт Центр.\n"
        f"Вот что я умею:\n\n"
        f"💰 *БАЛАНС* — узнать бонусный баланс\n"
        f"📋 *ИСТОРИЯ* — последние 10 операций\n"
        f"🏆 *УРОВЕНЬ* — ваш статус и прогресс\n"
        f"🎉 *АКЦИИ* — текущие акции и промокоды\n"
        f"🎫 *КУПОНЫ* — ваши активные купоны\n"
        f"🎡 *КОЛЕСО* — крутить колесо удачи\n"
        f"👥 *РЕФЕРАЛ* — пригласить друга\n"
        f"💳 *ДОЛГ* — рассрочки и задолженности\n"
        f"🛍️ *ТОВАРЫ* — каталог и цены\n"
        f"🔍 *НАЙТИ [название]* — поиск товара\n"
        f"📍 *КОНТАКТ* — адрес и телефон магазина\n\n"
        f"Просто напишите одно из слов выше! ☝️"
    )




# ═══════════════════════════════════════════
# PRODUCT CATALOG HANDLERS
# ═══════════════════════════════════════════

async def _handle_products(phone: str, text: str, customer: Customer | None, db: AsyncSession) -> str:
    """Каталог товаров — топ товары по категориям."""
    from sqlalchemy import select, func, desc

    # Get categories with product count
    cats = await db.execute(
        select(
            Product.category,
            func.count().label("cnt"),
        ).where(
            Product.is_active == True,
            Product.current_stock > 0,
        ).group_by(Product.category).order_by(desc("cnt")).limit(10)
    )
    categories = cats.all()

    if not categories:
        return "🛍️ Каталог товаров пока пуст. Загляните в магазин!"

    msg = "🛍️ *Каталог Смарт Центр*\n\n"
    msg += "📦 *Категории товаров:*\n"
    for i, cat in enumerate(categories, 1):
        name = cat.category or "Другое"
        msg += f"{i}. {name} ({cat.cnt} шт)\n"

    # Top 5 popular products
    top = await db.execute(
        select(Product.name, Product.price, Product.category)
        .where(Product.is_active == True, Product.current_stock > 0)
        .order_by(desc(Product.last_sold_at))
        .limit(5)
    )
    top_products = top.all()

    if top_products:
        msg += "\n🔥 *Популярные товары:*\n"
        for p in top_products:
            msg += f"• {p.name} — *{int(p.price)} сом*\n"

    msg += "\n🔍 Чтобы найти товар, напишите:\n*НАЙТИ [название]*\n"
    msg += "Например: *НАЙТИ iPhone* или *НАЙТИ наушники*"
    return msg


async def _handle_search_product(phone: str, text: str, customer: Customer | None, db: AsyncSession) -> str:
    """Поиск товара по названию."""
    # Extract search query
    query = text.strip()
    for prefix in ["НАЙТИ ", "ПОИСК ", "SEARCH ", "QIDIRUV ", "IZLASH "]:
        if query.upper().startswith(prefix):
            query = query[len(prefix):].strip()
            break

    if len(query) < 2:
        return "🔍 Напишите название товара после команды НАЙТИ.\nПример: *НАЙТИ iPhone*"

    # Search products
    search_pattern = f"%{query}%"
    results = await db.execute(
        select(Product)
        .where(
            Product.is_active == True,
            Product.name.ilike(search_pattern),
        )
        .order_by(desc(Product.current_stock))
        .limit(10)
    )
    products = results.scalars().all()

    if not products:
        return f"🔍 По запросу \"{query}\" ничего не найдено.\n\nПопробуйте другое название или загляните в магазин!"

    msg = f"🔍 *Результаты поиска: \"{query}\"*\n\n"
    for i, p in enumerate(products, 1):
        stock_icon = "✅" if p.current_stock > 5 else ("⚠️" if p.current_stock > 0 else "❌")
        stock_text = f"В наличии: {int(p.current_stock)}" if p.current_stock > 0 else "Нет в наличии"
        msg += f"{i}. *{p.name}*\n"
        msg += f"   💰 Цена: *{int(p.price)} сом*\n"
        msg += f"   {stock_icon} {stock_text}\n"
        if p.category:
            msg += f"   📦 Категория: {p.category}\n"
        msg += "\n"

    msg += f"Найдено: {len(products)} товар(ов)\n"
    msg += "📍 Подробнее — в магазине Смарт Центр!"
    return msg

# ═══════════════════════════════════════════
# UTILS
# ═══════════════════════════════════════════

def _not_registered(phone: str) -> str:
    return (
        f"❌ Номер {phone} не найден в S Bonus.\n\n"
        f"Зарегистрируйтесь у кассира магазина Смарт Центр:\n"
        f"📍 Ош обл., Араван р-н, ул. Ош-3000, 86\n"
        f"📞 0557 100 505"
    )


def _default_reply() -> str:
    return (
        "🤖 Я не понял команду.\n\n"
        "Напишите *ПОМОЩЬ* чтобы увидеть список доступных команд."
    )


async def _get_expiring_bonus(customer_id, db: AsyncSession) -> int:
    """Бонусы которые истекут в ближайшие 30 дней."""
    from datetime import datetime, timedelta
    threshold = datetime.utcnow() - timedelta(days=335)  # 365 - 30 = 335
    result = await db.execute(
        select(func.coalesce(func.sum(Transaction.amount), 0))
        .where(
            Transaction.customer_id == customer_id,
            Transaction.type == TransactionType.EARN,
            Transaction.created_at <= threshold,
            Transaction.created_at > datetime.utcnow() - timedelta(days=365),
        )
    )
    return int(result.scalar() or 0)
