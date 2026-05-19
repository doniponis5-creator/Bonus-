"""
Sbonus+ — Cron задача: истечение бонусов (FIFO).
Запускается каждый день в 02:00 (Asia/Bishkek).

Логика:
1. Для каждого клиента с балансом > 0:
   - Суммируем все EARN-type транзакции старше bonus_expiration_days
   - Вычитаем все SPEND + EXPIRE транзакции (они «потребляют» старые EARN)
   - Остаток = сумма для expire, но не больше текущего баланса
2. Создаём EXPIRE транзакцию и уменьшаем баланс
3. Отправляем WhatsApp уведомление

Предупреждение:
- За 30 дней до expire отправляем предупреждение (без списания)
"""

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select, func as sa_func

from app.core.config import get_settings
from app.core.database import async_session
from app.models import (
    BonusAccount,
    Customer,
    Transaction,
    TransactionType,
)

settings = get_settings()

# Типы транзакций, которые "зарабатывают" бонусы
_EARN_TYPES = (
    TransactionType.EARN,
    TransactionType.BIRTHDAY,
    TransactionType.REFERRAL,
    TransactionType.PROMO,
    TransactionType.CAMPAIGN,
)

# Типы транзакций, которые "потребляют" бонусы
_CONSUME_TYPES = (
    TransactionType.SPEND,
    TransactionType.EXPIRE,
    TransactionType.REFUND,
)


async def _get_expiration_settings(db) -> tuple[int, int]:
    """Получить настройки срока из БД (fallback на config)."""
    from app.models import Setting
    result = await db.execute(
        select(Setting).where(Setting.key.in_([
            "BONUS_EXPIRATION_DAYS",
            "BONUS_EXPIRATION_WARNING_DAYS",
        ]))
    )
    s_map = {s.key: s.value for s in result.scalars().all()}
    exp_days = int(s_map.get("BONUS_EXPIRATION_DAYS", settings.bonus_expiration_days))
    warn_days = int(s_map.get("BONUS_EXPIRATION_WARNING_DAYS", settings.bonus_expiration_warning_days))
    return exp_days, warn_days


async def expire_old_bonuses() -> None:
    """
    Основная cron-задача: списание просроченных бонусов.
    Запускается ежедневно в 02:00.
    """
    async with async_session() as db:
        exp_days, _ = await _get_expiration_settings(db)
        cutoff = datetime.now(timezone.utc) - timedelta(days=exp_days)
        # Все клиенты с балансом > 0
        accounts_result = await db.execute(
            select(BonusAccount).where(BonusAccount.balance > Decimal("0"))
        )
        accounts = accounts_result.scalars().all()

        expired_count = 0
        total_expired = Decimal("0")

        for account in accounts:
            try:
                expire_amount = await _calculate_expirable(db, account.customer_id, cutoff)

                if expire_amount <= Decimal("0"):
                    continue

                # Не больше текущего баланса
                expire_amount = min(expire_amount, account.balance)

                # Создаём EXPIRE транзакцию
                txn = Transaction(
                    customer_id=account.customer_id,
                    type=TransactionType.EXPIRE,
                    amount=expire_amount,
                    note=f"Автоматическое истечение бонусов (>{exp_days} дней)",
                )
                db.add(txn)

                # Уменьшаем баланс
                account.balance -= expire_amount

                expired_count += 1
                total_expired += expire_amount

                # WhatsApp уведомление
                await _notify_expiration(db, account.customer_id, expire_amount, account.balance)

            except Exception as e:
                print(f"  ❌ Ошибка expire для клиента {account.customer_id}: {e}")

        await db.commit()
        print(f"  📊 Expire: {expired_count} клиентов, {total_expired} KGS списано")


async def warn_expiring_bonuses() -> None:
    """
    Предупреждение: бонусы скоро истекут.
    Запускается ежедневно в 10:00.
    """
    async with async_session() as db:
        exp_days, warn_days = await _get_expiration_settings(db)
        warning_cutoff = datetime.now(timezone.utc) - timedelta(days=exp_days - warn_days)
        expire_cutoff = datetime.now(timezone.utc) - timedelta(days=exp_days)
        accounts_result = await db.execute(
            select(BonusAccount).where(BonusAccount.balance > Decimal("0"))
        )
        accounts = accounts_result.scalars().all()

        warned_count = 0

        for account in accounts:
            try:
                # Сумма бонусов, которые истекут через 30 дней
                will_expire = await _calculate_expirable(db, account.customer_id, warning_cutoff)
                already_expired = await _calculate_expirable(db, account.customer_id, expire_cutoff)
                about_to_expire = will_expire - already_expired

                if about_to_expire <= Decimal("0"):
                    continue

                about_to_expire = min(about_to_expire, account.balance)

                await _notify_expiration_warning(
                    db, account.customer_id, about_to_expire, account.balance, warn_days
                )
                warned_count += 1

            except Exception as e:
                print(f"  ❌ Ошибка предупреждения для клиента {account.customer_id}: {e}")

        print(f"  📢 Предупреждения: {warned_count} клиентов уведомлены")


async def _calculate_expirable(
    db, customer_id, cutoff: datetime
) -> Decimal:
    """
    FIFO расчёт: сколько бонусов можно списать.

    expirable = sum(old_earns) - sum(all_consumes)

    Логика: старые начисления (до cutoff) "расходуются" первыми
    при списании/expire. Если потребление покрывает все старые —
    ничего не истекает.
    """
    # Сумма всех EARN-type до cutoff
    old_earns_result = await db.execute(
        select(sa_func.coalesce(sa_func.sum(Transaction.amount), Decimal("0"))).where(
            Transaction.customer_id == customer_id,
            Transaction.type.in_(_EARN_TYPES),
            Transaction.created_at < cutoff,
        )
    )
    old_earns = old_earns_result.scalar() or Decimal("0")

    if old_earns <= Decimal("0"):
        return Decimal("0")

    # Сумма всех потреблений (SPEND + EXPIRE + REFUND)
    consumes_result = await db.execute(
        select(sa_func.coalesce(sa_func.sum(Transaction.amount), Decimal("0"))).where(
            Transaction.customer_id == customer_id,
            Transaction.type.in_(_CONSUME_TYPES),
        )
    )
    total_consumed = consumes_result.scalar() or Decimal("0")

    # FIFO: потребление сначала покрывает самые старые начисления
    expirable = old_earns - total_consumed

    return max(expirable, Decimal("0"))


async def _notify_expiration(db, customer_id, expired_amount: Decimal, new_balance: Decimal):
    """Уведомление о списании просроченных бонусов."""
    import asyncio
    from app.models import Customer, Setting
    from app.services.whatsapp import send_whatsapp_message

    result = await db.execute(select(Customer).where(Customer.id == customer_id))
    customer = result.scalar_one_or_none()
    if not customer:
        return

    result = await db.execute(
        select(Setting).where(Setting.key.in_([
            "ENABLE_WHATSAPP_NOTIFICATIONS",
            "GREENAPI_INSTANCE_ID",
            "GREENAPI_API_TOKEN",
            "WHATSAPP_TEMPLATE_EXPIRE",
        ]))
    )
    settings_map = {s.key: s.value for s in result.scalars().all()}

    if settings_map.get("ENABLE_WHATSAPP_NOTIFICATIONS") != "true":
        return

    instance_id = settings_map.get("GREENAPI_INSTANCE_ID")
    api_token = settings_map.get("GREENAPI_API_TOKEN")
    template = settings_map.get("WHATSAPP_TEMPLATE_EXPIRE")
    if not instance_id or not api_token or not template:
        return

    msg = (
        template
        .replace("{amount}", str(expired_amount))
        .replace("{balance}", str(new_balance))
        .replace("{name}", customer.full_name)
    )
    asyncio.create_task(send_whatsapp_message(
        phone=customer.phone, message=msg,
        instance_id=instance_id, api_token=api_token
    ))


async def _notify_expiration_warning(db, customer_id, amount: Decimal, balance: Decimal, warn_days: int = 30):
    """Уведомление: бонусы скоро истекут."""
    import asyncio
    from app.models import Customer, Setting
    from app.services.whatsapp import send_whatsapp_message

    result = await db.execute(select(Customer).where(Customer.id == customer_id))
    customer = result.scalar_one_or_none()
    if not customer:
        return

    result = await db.execute(
        select(Setting).where(Setting.key.in_([
            "ENABLE_WHATSAPP_NOTIFICATIONS",
            "GREENAPI_INSTANCE_ID",
            "GREENAPI_API_TOKEN",
            "WHATSAPP_TEMPLATE_EXPIRE_WARNING",
        ]))
    )
    settings_map = {s.key: s.value for s in result.scalars().all()}

    if settings_map.get("ENABLE_WHATSAPP_NOTIFICATIONS") != "true":
        return

    instance_id = settings_map.get("GREENAPI_INSTANCE_ID")
    api_token = settings_map.get("GREENAPI_API_TOKEN")
    template = settings_map.get("WHATSAPP_TEMPLATE_EXPIRE_WARNING")
    if not instance_id or not api_token or not template:
        return

    msg = (
        template
        .replace("{amount}", str(amount))
        .replace("{balance}", str(balance))
        .replace("{name}", customer.full_name)
        .replace("{days}", str(warn_days))
    )
    asyncio.create_task(send_whatsapp_message(
        phone=customer.phone, message=msg,
        instance_id=instance_id, api_token=api_token
    ))
