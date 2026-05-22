"""
Sbonus+ — Бонусный движок.
Вся бизнес-логика начисления, списания, уровней.
Все операции внутри PostgreSQL транзакции.
"""

import asyncio
import time
import uuid
from decimal import Decimal
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.models import (
    BonusAccount,
    Customer,
    PromoCode,
    Setting,
    Tier,
    Transaction,
    TransactionType,
)
from app.schemas import BonusResult

settings = get_settings()

# Simple TTL cache for WhatsApp settings
_wa_cache: dict = {}
_wa_cache_ttl: float = 0
_WA_CACHE_SECONDS = 60


class BonusService:
    """Ядро бонусного движка Sbonus+."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # ─── EARN (Начисление) ───

    async def earn(
        self,
        customer_id: uuid.UUID,
        purchase_amount: Decimal,
        branch_id: uuid.UUID,
        cashier_id: Optional[uuid.UUID] = None,
        receipt_number: Optional[str] = None,
        note: Optional[str] = None,
    ) -> BonusResult:
        """
        Начислить бонус за покупку.

        Логика:
        1. Проверка минимальной покупки (500 KGS)
        2. Получение tier клиента → расчёт бонуса
        3. Обновление баланса + total_earned
        4. Запись транзакции (иммутабельная)
        5. Проверка повышения уровня

        Args:
            customer_id: UUID клиента
            purchase_amount: сумма покупки в KGS
            branch_id: UUID филиала
            cashier_id: UUID кассира (опционально)
            receipt_number: номер чека 1С (опционально, генерируется UUID)
            note: комментарий

        Returns:
            BonusResult с деталями операции
        """
        # Проверка минимальной покупки
        if purchase_amount < settings.min_purchase_for_bonus:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "BONUS_BELOW_MIN_PURCHASE",
                    "message": f"Сумма покупки ниже минимума ({settings.min_purchase_for_bonus} KGS)",
                    "message_kg": f"Сатып алуу суммасы минимумдан аз ({settings.min_purchase_for_bonus} KGS)",
                },
            )

        # Проверка дубликата чека
        if receipt_number:
            existing = await self.db.execute(
                select(Transaction).where(Transaction.receipt_number == receipt_number)
            )
            if existing.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail={
                        "code": "BONUS_DUPLICATE_RECEIPT",
                        "message": "Этот чек уже обработан",
                        "message_kg": "Бул чек мурда иштетилген",
                    },
                )
        else:
            # Manual entry — cap at 5 per day per customer to prevent abuse
            from datetime import datetime, timezone, timedelta
            today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
            manual_count = (await self.db.execute(
                select(func.count(Transaction.id)).where(
                    Transaction.customer_id == customer_id,
                    Transaction.type == TransactionType.EARN,
                    Transaction.receipt_number.like("MANUAL-%"),
                    Transaction.created_at >= today_start,
                )
            )).scalar() or 0
            if manual_count >= 5:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={
                        "code": "MANUAL_EARN_LIMIT",
                        "message": "Достигнут дневной лимит ручных начислений (5) для этого клиента",
                    },
                )
            receipt_number = f"MANUAL-{uuid.uuid4().hex[:12].upper()}"

        # Получение клиента + аккаунта + tier
        customer = await self._get_customer(customer_id)
        account = await self._get_or_create_account(customer_id)
        tier = await self._get_tier(customer.tier_id)

        # Расчёт бонуса
        bonus_amount = (purchase_amount * tier.bonus_percent / Decimal("100")).quantize(Decimal("0.01"))

        # Обновление баланса
        account.balance += bonus_amount
        account.total_earned += bonus_amount

        # Запись транзакции
        txn = Transaction(
            customer_id=customer_id,
            type=TransactionType.EARN,
            amount=bonus_amount,
            purchase_amount=purchase_amount,
            branch_id=branch_id,
            cashier_id=cashier_id,
            receipt_number=receipt_number,
            note=note,
        )
        self.db.add(txn)

        # Проверка повышения уровня
        tier_upgraded, new_tier = await self._check_tier_upgrade(customer, account)

        await self.db.flush()

        # Проверка вех кассира (дневные/месячные/стрик)
        if cashier_id:
            from app.services.cashier_bonus import check_cashier_milestones
            await check_cashier_milestones(self.db, cashier_id, purchase_amount)

        tier_name = new_tier.name if tier_upgraded else tier.name

        # Отправка WhatsApp уведомления (с трекингом)
        await self._notify_whatsapp(
            customer.phone,
            "WHATSAPP_TEMPLATE_EARN",
            amount=bonus_amount,
            balance=account.balance,
            customer_id=customer_id,
            event_type="earn",
            customer_name=customer.full_name,
        )

        # Telegram алерт: крупная покупка
        if purchase_amount >= 50000:
            from app.services.telegram_bot import notify_large_earn
            asyncio.ensure_future(notify_large_earn(customer.full_name, float(purchase_amount), float(bonus_amount)))

        return BonusResult(
            transaction_id=txn.id,
            type="earn",
            amount=bonus_amount,
            new_balance=account.balance,
            tier_name=tier_name,
            tier_upgraded=tier_upgraded,
            message_ru=f"✅ Начислено +{bonus_amount} KGS бонус ({tier_name} {tier.bonus_percent}%)",
            message_kg=f"✅ +{bonus_amount} KGS бонус кошулду ({tier_name} {tier.bonus_percent}%)",
        )

    # ─── SPEND (Списание) ───

    async def spend(
        self,
        customer_id: uuid.UUID,
        spend_amount: Decimal,
        purchase_amount: Decimal,
        branch_id: uuid.UUID,
        cashier_id: Optional[uuid.UUID] = None,
        note: Optional[str] = None,
    ) -> BonusResult:
        """
        Списать бонус при оплате.

        Логика:
        1. max_spend = MIN(balance, purchase_amount × 30%)
        2. Проверка что spend_amount <= max_spend
        3. Уменьшение баланса + total_spent
        4. Запись транзакции

        Args:
            customer_id: UUID клиента
            spend_amount: сумма списания
            purchase_amount: сумма покупки
            branch_id: UUID филиала
        """
        account = await self._get_or_create_account(customer_id)
        customer = await self._get_customer(customer_id)
        tier = await self._get_tier(customer.tier_id)

        # Расчёт максимума
        max_spend_pct = tier.max_spend_pct if hasattr(tier, 'max_spend_pct') and tier.max_spend_pct else settings.max_spend_percent
        max_by_percent = (purchase_amount * max_spend_pct / Decimal("100")).quantize(Decimal("0.01"))
        max_spend = min(account.balance, max_by_percent)

        # Проверки
        if spend_amount > account.balance:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "BONUS_INSUFFICIENT_BALANCE",
                    "message": f"Недостаточно бонусов. Баланс: {account.balance} KGS",
                    "message_kg": f"Бонус жетишсиз. Баланс: {account.balance} KGS",
                    "details": {"balance": float(account.balance), "requested": float(spend_amount)},
                },
            )

        if spend_amount > max_spend:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "BONUS_EXCEED_MAX_SPEND",
                    "message": f"Максимум списания: {max_spend} KGS (30% от покупки)",
                    "message_kg": f"Максимум: {max_spend} KGS (сатып алуунун 30%)",
                },
            )

        # Списание
        account.balance -= spend_amount
        account.total_spent += spend_amount

        txn = Transaction(
            customer_id=customer_id,
            type=TransactionType.SPEND,
            amount=spend_amount,
            purchase_amount=purchase_amount,
            branch_id=branch_id,
            cashier_id=cashier_id,
            receipt_number=f"SPEND-{uuid.uuid4().hex[:12].upper()}",
            note=note,
        )
        self.db.add(txn)
        await self.db.flush()

        # Отправка WhatsApp уведомления (с трекингом)
        await self._notify_whatsapp(
            customer.phone,
            "WHATSAPP_TEMPLATE_SPEND",
            amount=spend_amount,
            balance=account.balance,
            customer_id=customer_id,
            event_type="spend",
            customer_name=customer.full_name,
        )

        # Telegram алерт: крупное списание
        if spend_amount >= 5000:
            from app.services.telegram_bot import notify_large_spend
            asyncio.ensure_future(notify_large_spend(customer.full_name, float(spend_amount), float(account.balance)))

        return BonusResult(
            transaction_id=txn.id,
            type="spend",
            amount=spend_amount,
            new_balance=account.balance,
            tier_name=tier.name,
            message_ru=f"💳 Списано {spend_amount} KGS. Остаток: {account.balance} KGS",
            message_kg=f"💳 {spend_amount} KGS чыгарылды. Калган: {account.balance} KGS",
        )

    # ─── CHECK SPEND ───

    async def check_spend(
        self, customer_id: uuid.UUID, purchase_amount: Decimal
    ) -> dict:
        """Проверка максимальной суммы списания (preview)."""
        account = await self._get_or_create_account(customer_id)
        customer = await self._get_customer(customer_id)
        tier = await self._get_tier(customer.tier_id)
        max_spend_pct = tier.max_spend_pct if hasattr(tier, 'max_spend_pct') and tier.max_spend_pct else settings.max_spend_percent
        max_by_percent = (purchase_amount * max_spend_pct / Decimal("100")).quantize(Decimal("0.01"))
        max_spend = min(account.balance, max_by_percent)
        return {
            "customer_id": str(customer_id),
            "balance": account.balance,
            "purchase_amount": purchase_amount,
            "max_spend": max_spend,
            "max_spend_percent": max_spend_pct,
        }

    async def admin_adjustment(
        self,
        customer_id: uuid.UUID,
        type: TransactionType,
        amount: Decimal,
        admin_id: uuid.UUID,
        note: str,
    ) -> BonusResult:
        """Ручное начисление или списание администратором."""
        account = await self._get_or_create_account(customer_id)
        customer = await self._get_customer(customer_id)

        if type == TransactionType.SPEND and amount > account.balance:
            raise HTTPException(status_code=400, detail={"message": "Недостаточно бонусов"})

        if type == TransactionType.EARN:
            account.balance += amount
            account.total_earned += amount
        else:
            account.balance -= amount
            account.total_spent += amount

        txn = Transaction(
            customer_id=customer_id,
            type=type,
            amount=amount,
            cashier_id=admin_id,
            receipt_number=f"ADJ-{uuid.uuid4().hex[:10].upper()}",
            note=note,
        )
        self.db.add(txn)
        await self.db.flush()

        return BonusResult(
            transaction_id=txn.id,
            type=type.value,
            amount=amount,
            new_balance=account.balance,
            tier_name=customer.tier.name if customer.tier else "Bronze",
            message_ru=f"✅ Ручная корректировка: {'+' if type == TransactionType.EARN else '-'}{amount} KGS",
            message_kg=f"✅ Кол менен оңдоо: {'+' if type == TransactionType.EARN else '-'}{amount} KGS",
        )

    # ─── BIRTHDAY BONUS ───

    async def birthday_bonus(self, customer_id: uuid.UUID) -> BonusResult:
        """Начислить бонус ко дню рождения (+200 KGS)."""
        account = await self._get_or_create_account(customer_id)
        customer = await self._get_customer(customer_id)
        tier = await self._get_tier(customer.tier_id)
        bonus = settings.birthday_bonus

        account.balance += bonus
        account.total_earned += bonus

        txn = Transaction(
            customer_id=customer_id,
            type=TransactionType.BIRTHDAY,
            amount=bonus,
            note="🎂 Бонус ко дню рождения",
        )
        self.db.add(txn)
        await self.db.flush()

        return BonusResult(
            transaction_id=txn.id,
            type="birthday",
            amount=bonus,
            new_balance=account.balance,
            tier_name=tier.name,
            message_ru=f"🎂 С днём рождения! +{bonus} KGS подарок!",
            message_kg=f"🎂 Туулган күнүңүз менен! +{bonus} KGS белек!",
        )

    # ─── helpers: read referral config from DB Settings ───

    async def _get_referral_settings(self) -> dict:
        """Читает REFERRAL_BONUS_INVITER/INVITEE/DAILY_LIMIT из DB Settings (fallback на env)."""
        result = await self.db.execute(
            select(Setting).where(Setting.key.in_([
                "REFERRAL_BONUS_INVITER",
                "REFERRAL_BONUS_INVITEE",
                "REFERRAL_DAILY_LIMIT",
            ]))
        )
        db_settings = {s.key: s.value for s in result.scalars().all()}
        return {
            "inviter_bonus": Decimal(db_settings["REFERRAL_BONUS_INVITER"]) if db_settings.get("REFERRAL_BONUS_INVITER") else settings.referral_bonus_inviter,
            "invitee_bonus": Decimal(db_settings["REFERRAL_BONUS_INVITEE"]) if db_settings.get("REFERRAL_BONUS_INVITEE") else settings.referral_bonus_invitee,
            "daily_limit": int(db_settings.get("REFERRAL_DAILY_LIMIT") or "5"),
        }

    # ─── REFERRAL ───

    async def apply_referral(
        self, customer_id: uuid.UUID, referral_code: str
    ) -> BonusResult:
        """Применить реферальный код. Бонусы читаются из DB Settings."""
        # Найти пригласившего
        result = await self.db.execute(
            select(Customer).where(Customer.referral_code == referral_code)
        )
        inviter = result.scalar_one_or_none()
        if not inviter:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "REFERRAL_CODE_INVALID", "message": "Реферальный код не найден"},
            )

        # Блокируем самореферал
        if inviter.id == customer_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "REFERRAL_SELF_NOT_ALLOWED", "message": "Нельзя использовать собственный реферальный код"},
            )

        customer = await self._get_customer(customer_id)
        if customer.referred_by:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "REFERRAL_ALREADY_USED", "message": "Реферальный код уже использован"},
            )

        # Читаем настройки из DB
        ref_cfg = await self._get_referral_settings()
        inviter_bonus = ref_cfg["inviter_bonus"]
        invitee_bonus = ref_cfg["invitee_bonus"]
        daily_limit = ref_cfg["daily_limit"]

        # Проверка дневного лимита ПЕРЕД мутацией данных
        from datetime import datetime, timezone
        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        daily_refs = (await self.db.execute(
            select(func.count(Transaction.id)).where(
                Transaction.customer_id == inviter.id,
                Transaction.type == TransactionType.REFERRAL,
                Transaction.created_at >= today_start,
            )
        )).scalar() or 0
        if daily_refs >= daily_limit:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "REFERRAL_DAILY_LIMIT", "message": "Дневной лимит реферальных бонусов достигнут"},
            )

        # Обновить referred_by (после всех проверок)
        customer.referred_by = inviter.id

        # Бонус пригласившему
        inviter_account = await self._get_or_create_account(inviter.id)
        inviter_account.balance += inviter_bonus
        inviter_account.total_earned += inviter_bonus
        self.db.add(Transaction(
            customer_id=inviter.id,
            type=TransactionType.REFERRAL,
            amount=inviter_bonus,
            note=f"👥 Реферал: {customer.full_name} зарегистрирован",
        ))

        # Бонус новому клиенту
        account = await self._get_or_create_account(customer_id)
        account.balance += invitee_bonus
        account.total_earned += invitee_bonus
        txn = Transaction(
            customer_id=customer_id,
            type=TransactionType.REFERRAL,
            amount=invitee_bonus,
            note=f"👤 Приветственный бонус по реферальному коду",
        )
        self.db.add(txn)
        await self.db.flush()

        tier = await self._get_tier(customer.tier_id)

        # WhatsApp уведомления обеим сторонам (await — нужен DB session для credentials)
        await self._notify_referral_whatsapp(
            inviter=inviter,
            invitee=customer,
            inviter_bonus=inviter_bonus,
            invitee_bonus=invitee_bonus,
            inviter_balance=inviter_account.balance,
            invitee_balance=account.balance,
        )

        return BonusResult(
            transaction_id=txn.id,
            type="referral",
            amount=invitee_bonus,
            new_balance=account.balance,
            tier_name=tier.name,
            message_ru=f"👥 Реферал применён! +{invitee_bonus} KGS",
            message_kg=f"👥 Реферал колдонулду! +{invitee_bonus} KGS",
        )

    async def _notify_referral_whatsapp(
        self, inviter: Customer, invitee: Customer,
        inviter_bonus: Decimal, invitee_bonus: Decimal,
        inviter_balance: Decimal, invitee_balance: Decimal,
    ):
        """Отправить WhatsApp уведомления обеим сторонам реферала."""
        from app.services.whatsapp import send_whatsapp_message
        global _wa_cache, _wa_cache_ttl
        import time as _time

        now = _time.monotonic()
        if now > _wa_cache_ttl:
            result = await self.db.execute(select(Setting).where(Setting.key.in_([
                "ENABLE_WHATSAPP_NOTIFICATIONS",
                "GREENAPI_INSTANCE_ID",
                "GREENAPI_API_TOKEN",
            ])))
            _wa_cache = {s.key: s.value for s in result.scalars().all()}
            _wa_cache_ttl = now + _WA_CACHE_SECONDS

        if _wa_cache.get("ENABLE_WHATSAPP_NOTIFICATIONS") != "true":
            return
        instance_id = _wa_cache.get("GREENAPI_INSTANCE_ID")
        api_token = _wa_cache.get("GREENAPI_API_TOKEN")
        if not instance_id or not api_token:
            return

        # Сообщение пригласившему
        inviter_msg = (
            f"🎉 *{settings.shop_bonus_name}*\n\n"
            f"Ваш друг *{invitee.full_name}* присоединился по вашему реферальному коду!\n"
            f"💰 Вам начислено *+{inviter_bonus} KGS*\n"
            f"📊 Ваш баланс: *{inviter_balance} KGS*\n\n"
            f"Продолжайте приглашать друзей и зарабатывать бонусы! 🚀"
        )
        asyncio.create_task(send_whatsapp_message(
            phone=inviter.phone, message=inviter_msg,
            instance_id=instance_id, api_token=api_token,
        ))

        # Сообщение новому клиенту
        invitee_msg = (
            f"🎉 *Добро пожаловать в {settings.shop_bonus_name}!*\n\n"
            f"Вы присоединились по приглашению *{inviter.full_name}*\n"
            f"🎁 Ваш приветственный бонус: *+{invitee_bonus} KGS*\n"
            f"📊 Ваш баланс: *{invitee_balance} KGS*\n\n"
            f"📱 Личный кабинет: {settings.customer_cabinet_base_url}"
        )
        asyncio.create_task(send_whatsapp_message(
            phone=invitee.phone, message=invitee_msg,
            instance_id=instance_id, api_token=api_token,
        ))

    # ─── PROMO CODE ───

    async def apply_promo(
        self, customer_id: uuid.UUID, promo_code: str
    ) -> BonusResult:
        """Применить промокод."""
        from datetime import datetime, timezone
        # FOR UPDATE — предотвращает двойное использование при параллельных запросах
        result = await self.db.execute(
            select(PromoCode)
            .where(PromoCode.code == promo_code, PromoCode.is_active == True)
            .with_for_update()
        )
        promo = result.scalar_one_or_none()

        if not promo:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "PROMO_CODE_INVALID", "message": "Промокод не найден или неактивен"},
            )

        # Check if customer already used this promo code (exact note match)
        promo_note = f"🎟 Промокод: {promo_code}"
        used_check = await self.db.execute(
            select(Transaction).where(
                Transaction.customer_id == customer_id,
                Transaction.type == TransactionType.PROMO,
                Transaction.note == promo_note,
            )
        )
        if used_check.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "PROMO_ALREADY_USED", "message": "Вы уже использовали этот промокод"},
            )

        if promo.expires_at and promo.expires_at < datetime.now(timezone.utc):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "PROMO_CODE_EXPIRED", "message": "Промокод истёк"},
            )

        if promo.used_count >= promo.max_uses:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "PROMO_CODE_EXHAUSTED", "message": "Лимит промокода исчерпан"},
            )

        # Начисление
        account = await self._get_or_create_account(customer_id)
        customer = await self._get_customer(customer_id)
        tier = await self._get_tier(customer.tier_id)

        account.balance += promo.bonus_amount
        account.total_earned += promo.bonus_amount
        promo.used_count += 1

        txn = Transaction(
            customer_id=customer_id,
            type=TransactionType.PROMO,
            amount=promo.bonus_amount,
            note=f"🎟 Промокод: {promo_code}",
        )
        self.db.add(txn)
        await self.db.flush()

        return BonusResult(
            transaction_id=txn.id,
            type="promo",
            amount=promo.bonus_amount,
            new_balance=account.balance,
            tier_name=tier.name,
            message_ru=f"🎟 Промокод применён! +{promo.bonus_amount} KGS",
            message_kg=f"🎟 Промокод колдонулду! +{promo.bonus_amount} KGS",
        )

    # ═══════════════════════════════════════
    # ВНУТРЕННИЕ МЕТОДЫ
    # ═══════════════════════════════════════

    async def _get_customer(self, customer_id: uuid.UUID) -> Customer:
        """Получить клиента или 404."""
        result = await self.db.execute(
            select(Customer)
            .options(selectinload(Customer.tier))
            .where(Customer.id == customer_id)
        )
        customer = result.scalar_one_or_none()
        if not customer:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "CUSTOMER_NOT_FOUND", "message": "Клиент не найден"},
            )
        return customer

    async def _get_or_create_account(self, customer_id: uuid.UUID) -> BonusAccount:
        """Получить или создать бонусный счёт."""
        result = await self.db.execute(
            select(BonusAccount)
            .where(BonusAccount.customer_id == customer_id)
            .with_for_update()
        )
        account = result.scalar_one_or_none()
        if not account:
            account = BonusAccount(customer_id=customer_id)
            self.db.add(account)
            await self.db.flush()
        return account

    async def _get_tier(self, tier_id: Optional[uuid.UUID]) -> Tier:
        """Получить tier или дефолтный Bronze."""
        if tier_id:
            result = await self.db.execute(select(Tier).where(Tier.id == tier_id))
            tier = result.scalar_one_or_none()
            if tier:
                return tier
        # Дефолт — Bronze
        result = await self.db.execute(select(Tier).order_by(Tier.sort_order.asc()).limit(1))
        return result.scalar_one()

    async def _check_tier_upgrade(
        self, customer: Customer, account: BonusAccount
    ) -> tuple[bool, Optional[Tier]]:
        """Проверить и выполнить повышение уровня."""
        result = await self.db.execute(
            select(Tier)
            .where(Tier.min_total_kgs <= account.total_earned, Tier.is_active == True)
            .order_by(Tier.min_total_kgs.desc())
            .limit(1)
        )
        best_tier = result.scalar_one_or_none()

        if best_tier and best_tier.id != customer.tier_id:
            customer.tier_id = best_tier.id
            return True, best_tier

        return False, None

    async def _notify_whatsapp(
        self, phone: str, template_key: str, amount: Decimal, balance: Decimal,
        customer_id: uuid.UUID | None = None, event_type: str = "bonus",
        customer_name: str = "",
    ):
        """Отправка WhatsApp уведомления с трекингом и кешированием настроек."""
        from app.models import Setting
        from app.services.whatsapp import send_tracked_whatsapp, send_whatsapp_message
        global _wa_cache, _wa_cache_ttl

        now = time.monotonic()
        if now > _wa_cache_ttl:
            result = await self.db.execute(select(Setting).where(Setting.key.in_([
                "ENABLE_WHATSAPP_NOTIFICATIONS",
                "GREENAPI_INSTANCE_ID",
                "GREENAPI_API_TOKEN",
            ])))
            _wa_cache = {s.key: s.value for s in result.scalars().all()}
            _wa_cache_ttl = now + _WA_CACHE_SECONDS

        if _wa_cache.get("ENABLE_WHATSAPP_NOTIFICATIONS") != "true":
            return

        instance_id = _wa_cache.get("GREENAPI_INSTANCE_ID")
        api_token = _wa_cache.get("GREENAPI_API_TOKEN")
        if not instance_id or not api_token:
            return

        # Fetch template (not cached - may change often)
        result = await self.db.execute(select(Setting).where(Setting.key == template_key))
        tmpl_row = result.scalar_one_or_none()
        if not tmpl_row or not tmpl_row.value:
            return

        msg = (
            tmpl_row.value
            .replace("{amount}", str(amount))
            .replace("{balance}", str(balance))
            .replace("{name}", customer_name or "")
            .replace("{link}", "https://cabinet.smartcentr.store")
        )

        # Используем tracked отправку если есть customer_id
        if customer_id:
            await send_tracked_whatsapp(
                db=self.db,
                customer_id=customer_id,
                phone=phone,
                message=msg,
                event_type=event_type,
                instance_id=instance_id,
                api_token=api_token,
            )
        else:
            import asyncio
            asyncio.create_task(send_whatsapp_message(
                phone=phone, message=msg, instance_id=instance_id, api_token=api_token
            ))
