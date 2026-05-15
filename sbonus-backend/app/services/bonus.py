"""
Sbonus+ — Бонусный движок.
Вся бизнес-логика начисления, списания, уровней.
Все операции внутри PostgreSQL транзакции.
"""

import uuid
from decimal import Decimal
from typing import Optional

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models import (
    BonusAccount,
    Customer,
    PromoCode,
    Tier,
    Transaction,
    TransactionType,
)
from app.schemas import BonusResult

settings = get_settings()


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
            from fastapi import HTTPException, status
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
                from fastapi import HTTPException, status
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail={
                        "code": "BONUS_DUPLICATE_RECEIPT",
                        "message": "Этот чек уже обработан",
                        "message_kg": "Бул чек мурда иштетилген",
                    },
                )
        else:
            # Генерация UUID для ручного ввода
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

        tier_name = new_tier.name if tier_upgraded else tier.name

        # Отправка WhatsApp уведомления
        await self._notify_whatsapp(
            customer.phone, 
            "WHATSAPP_TEMPLATE_EARN", 
            amount=bonus_amount, 
            balance=account.balance
        )

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
        max_by_percent = (purchase_amount * settings.max_spend_percent / Decimal("100")).quantize(Decimal("0.01"))
        max_spend = min(account.balance, max_by_percent)

        # Проверки
        if spend_amount > account.balance:
            from fastapi import HTTPException, status
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
            from fastapi import HTTPException, status
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

        # Отправка WhatsApp уведомления
        await self._notify_whatsapp(
            customer.phone, 
            "WHATSAPP_TEMPLATE_SPEND", 
            amount=spend_amount, 
            balance=account.balance
        )

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
        max_by_percent = (purchase_amount * settings.max_spend_percent / Decimal("100")).quantize(Decimal("0.01"))
        max_spend = min(account.balance, max_by_percent)
        return {
            "customer_id": str(customer_id),
            "balance": account.balance,
            "purchase_amount": purchase_amount,
            "max_spend": max_spend,
            "max_spend_percent": settings.max_spend_percent,
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
            from fastapi import HTTPException, status
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

    # ─── REFERRAL ───

    async def apply_referral(
        self, customer_id: uuid.UUID, referral_code: str
    ) -> BonusResult:
        """Применить реферальный код."""
        # Найти пригласившего
        result = await self.db.execute(
            select(Customer).where(Customer.referral_code == referral_code)
        )
        inviter = result.scalar_one_or_none()
        if not inviter:
            from fastapi import HTTPException, status
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "REFERRAL_CODE_INVALID", "message": "Реферальный код не найден"},
            )

        customer = await self._get_customer(customer_id)
        if customer.referred_by:
            from fastapi import HTTPException, status
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "REFERRAL_ALREADY_USED", "message": "Реферальный код уже использован"},
            )

        # Обновить referred_by
        customer.referred_by = inviter.id

        # Бонус пригласившему
        inviter_account = await self._get_or_create_account(inviter.id)
        inviter_account.balance += settings.referral_bonus_inviter
        inviter_account.total_earned += settings.referral_bonus_inviter
        self.db.add(Transaction(
            customer_id=inviter.id,
            type=TransactionType.REFERRAL,
            amount=settings.referral_bonus_inviter,
            note=f"👥 Реферал: {customer.full_name} зарегистрирован",
        ))

        # Бонус новому клиенту
        account = await self._get_or_create_account(customer_id)
        account.balance += settings.referral_bonus_invitee
        account.total_earned += settings.referral_bonus_invitee
        txn = Transaction(
            customer_id=customer_id,
            type=TransactionType.REFERRAL,
            amount=settings.referral_bonus_invitee,
            note=f"👤 Приветственный бонус по реферальному коду",
        )
        self.db.add(txn)
        await self.db.flush()

        tier = await self._get_tier(customer.tier_id)

        return BonusResult(
            transaction_id=txn.id,
            type="referral",
            amount=settings.referral_bonus_invitee,
            new_balance=account.balance,
            tier_name=tier.name,
            message_ru=f"👥 Реферал применён! +{settings.referral_bonus_invitee} KGS",
            message_kg=f"👥 Реферал колдонулду! +{settings.referral_bonus_invitee} KGS",
        )

    # ─── PROMO CODE ───

    async def apply_promo(
        self, customer_id: uuid.UUID, promo_code: str
    ) -> BonusResult:
        """Применить промокод."""
        from datetime import datetime, timezone
        result = await self.db.execute(
            select(PromoCode).where(PromoCode.code == promo_code, PromoCode.is_active == True)
        )
        promo = result.scalar_one_or_none()

        if not promo:
            from fastapi import HTTPException, status
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "PROMO_CODE_INVALID", "message": "Промокод не найден или неактивен"},
            )

        if promo.expires_at and promo.expires_at < datetime.now(timezone.utc):
            from fastapi import HTTPException, status
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "PROMO_CODE_EXPIRED", "message": "Промокод истёк"},
            )

        if promo.used_count >= promo.max_uses:
            from fastapi import HTTPException, status
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
        result = await self.db.execute(select(Customer).where(Customer.id == customer_id))
        customer = result.scalar_one_or_none()
        if not customer:
            from fastapi import HTTPException, status
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "CUSTOMER_NOT_FOUND", "message": "Клиент не найден"},
            )
        return customer

    async def _get_or_create_account(self, customer_id: uuid.UUID) -> BonusAccount:
        """Получить или создать бонусный счёт."""
        result = await self.db.execute(
            select(BonusAccount).where(BonusAccount.customer_id == customer_id)
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

    async def _notify_whatsapp(self, phone: str, template_key: str, amount: Decimal, balance: Decimal):
        """Отправка WhatsApp уведомления, если включено."""
        from app.models import Setting
        from app.services.whatsapp import send_whatsapp_message
        import asyncio
        
        result = await self.db.execute(select(Setting).where(Setting.key.in_([
            "ENABLE_WHATSAPP_NOTIFICATIONS", 
            "GREENAPI_INSTANCE_ID", 
            "GREENAPI_API_TOKEN", 
            template_key
        ])))
        settings_dict = {s.key: s.value for s in result.scalars().all()}
        
        if settings_dict.get("ENABLE_WHATSAPP_NOTIFICATIONS") == "true":
            instance_id = settings_dict.get("GREENAPI_INSTANCE_ID")
            api_token = settings_dict.get("GREENAPI_API_TOKEN")
            template = settings_dict.get(template_key)
            
            if instance_id and api_token and template:
                msg = template.replace("{amount}", str(amount)).replace("{balance}", str(balance))
                # Запускаем отправку в фоне, чтобы не блокировать API
                asyncio.create_task(send_whatsapp_message(
                    phone=phone,
                    message=msg,
                    instance_id=instance_id,
                    api_token=api_token
                ))
