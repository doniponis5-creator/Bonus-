"""
Sbonus+ — Cron задача: еженедельный отчёт для администратора.
Запускается каждый понедельник в 08:00 (Asia/Bishkek).

Генерирует сводку за прошедшую неделю и отправляет в WhatsApp.
"""

from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import func, select

from app.core.config import get_settings
from app.core.database import async_session
from app.models import (
    BonusAccount,
    Customer,
    Product,
    Setting,
    Transaction,
    TransactionType,
)

settings = get_settings()


async def send_weekly_report() -> None:
    """Генерация и отправка еженедельного отчёта."""
    async with async_session() as db:
        now = datetime.now(timezone.utc)
        week_start = now - timedelta(days=7)

        # ── Статистика за неделю ──

        # Новые клиенты
        new_customers = (await db.execute(
            select(func.count(Customer.id)).where(Customer.created_at >= week_start)
        )).scalar() or 0

        # Общее количество клиентов
        total_customers = (await db.execute(
            select(func.count(Customer.id))
        )).scalar() or 0

        # Транзакции за неделю
        earn_stats = await db.execute(
            select(
                func.count(Transaction.id).label("count"),
                func.coalesce(func.sum(Transaction.amount), 0).label("total"),
                func.coalesce(func.sum(Transaction.purchase_amount), 0).label("purchases"),
            ).where(
                Transaction.created_at >= week_start,
                Transaction.type == TransactionType.EARN,
            )
        )
        earn_row = earn_stats.one()

        spend_stats = await db.execute(
            select(
                func.count(Transaction.id).label("count"),
                func.coalesce(func.sum(Transaction.amount), 0).label("total"),
            ).where(
                Transaction.created_at >= week_start,
                Transaction.type == TransactionType.SPEND,
            )
        )
        spend_row = spend_stats.one()

        # Средний чек
        avg_check = (await db.execute(
            select(func.avg(Transaction.purchase_amount)).where(
                Transaction.created_at >= week_start,
                Transaction.type == TransactionType.EARN,
                Transaction.purchase_amount.isnot(None),
            )
        )).scalar()

        # Общий баланс на счетах
        total_balance = (await db.execute(
            select(func.coalesce(func.sum(BonusAccount.balance), 0))
        )).scalar() or 0

        # Топ-3 клиента за неделю
        top_customers = await db.execute(
            select(
                Customer.full_name,
                func.coalesce(func.sum(Transaction.purchase_amount), 0).label("total"),
            )
            .join(Transaction, Transaction.customer_id == Customer.id)
            .where(
                Transaction.created_at >= week_start,
                Transaction.type == TransactionType.EARN,
            )
            .group_by(Customer.id, Customer.full_name)
            .order_by(func.sum(Transaction.purchase_amount).desc())
            .limit(3)
        )
        top_rows = top_customers.all()

        # ── Формируем сообщение ──
        report_date = now.strftime("%d.%m.%Y")
        week_start_str = week_start.strftime("%d.%m.%Y")

        msg = (
            f"📊 *Еженедельный отчёт S Bonus*\n"
            f"📅 {week_start_str} — {report_date}\n"
            f"━━━━━━━━━━━━━━━━━━\n\n"
            f"👥 *Клиенты:*\n"
            f"   Всего: {total_customers}\n"
            f"   Новых за неделю: +{new_customers}\n\n"
            f"💰 *Покупки:*\n"
            f"   Транзакций: {earn_row.count}\n"
            f"   Сумма покупок: {int(earn_row.purchases):,} KGS\n"
            f"   Средний чек: {int(avg_check):,} KGS\n\n" if avg_check else ""
            f"🎁 *Бонусы:*\n"
            f"   Начислено: {int(earn_row.total):,} KGS ({earn_row.count} операций)\n"
            f"   Использовано: {int(spend_row.total):,} KGS ({spend_row.count} операций)\n"
            f"   Общий баланс: {int(total_balance):,} KGS\n\n"
        )

        if top_rows:
            msg += "🏆 *Топ-3 клиента:*\n"
            for i, row in enumerate(top_rows, 1):
                msg += f"   {i}. {row.full_name} — {int(row.total):,} KGS\n"
            msg += "\n"

        # ── План действий (товары) ──
        try:
            low_q = await db.execute(
                select(Product.name).where(
                    Product.is_active == True,  # noqa: E712
                    Product.current_stock <= Product.min_stock_level,
                ).limit(50)
            )
            low_names = [r[0] for r in low_q.all()]

            dead_cutoff = now - timedelta(days=30)
            frozen_q = await db.execute(
                select(func.coalesce(func.sum(
                    func.coalesce(Product.cost_price, Product.price) * Product.current_stock
                ), 0)).where(
                    Product.is_active == True,  # noqa: E712
                    Product.current_stock > 0,
                    (Product.last_sold_at.is_(None)) | (Product.last_sold_at < dead_cutoff),
                )
            )
            frozen = float(frozen_q.scalar() or 0)

            if low_names or frozen > 0:
                msg += "✅ *План действий:*\n"
                if low_names:
                    preview = ", ".join(low_names[:3])
                    more = f" и ещё {len(low_names) - 3}" if len(low_names) > 3 else ""
                    msg += f"   🛒 Закупить: {preview}{more}\n"
                if frozen > 0:
                    msg += f"   📦 Заморожено в неликвиде: {int(frozen):,} KGS — пора на распродажу\n"
                msg += "   Подробно: admin.smartcentr.store/biz-report\n\n"
        except Exception:
            pass

        msg += f"━━━━━━━━━━━━━━━━━━\n🛒 Смарт Центр • S Bonus"

        # ── Отправляем ──
        wa_settings = await db.execute(
            select(Setting).where(Setting.key.in_([
                "ENABLE_WHATSAPP_NOTIFICATIONS",
                "GREENAPI_INSTANCE_ID",
                "GREENAPI_API_TOKEN",
                "ADMIN_PHONE_FOR_REPORTS",
            ]))
        )
        settings_map = {s.key: s.value for s in wa_settings.scalars().all()}

        if settings_map.get("ENABLE_WHATSAPP_NOTIFICATIONS") != "true":
            print("  ℹ️ Weekly report: WhatsApp отключен")
            return

        instance_id = settings_map.get("GREENAPI_INSTANCE_ID")
        api_token = settings_map.get("GREENAPI_API_TOKEN")
        admin_phone = settings_map.get("ADMIN_PHONE_FOR_REPORTS", settings.shop_phone)

        if not instance_id or not api_token:
            print("  ℹ️ Weekly report: Green API не настроен")
            return

        from app.services.whatsapp import send_whatsapp_message
        success = await send_whatsapp_message(
            phone=admin_phone,
            message=msg,
            instance_id=instance_id,
            api_token=api_token,
        )

        if success:
            print(f"  ✅ Weekly report sent to {admin_phone}")
        else:
            print(f"  ❌ Weekly report failed for {admin_phone}")
