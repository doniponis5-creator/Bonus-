"""
Sbonus+ — Birthday bonus automated task.
Runs daily, checks for customers with birthdays today, and awards them bonus.
"""

from datetime import date, datetime, timezone

from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session
from app.core.logging import get_logger
from app.models import Customer, BonusAccount, Transaction, TransactionType
from app.core.config import get_settings

logger = get_logger("tasks.birthday")
settings = get_settings()


async def run_birthday_bonuses() -> dict:
    """
    Find all customers whose birthday is today and award them birthday bonus.
    Returns a summary of the operation.
    """
    today = date.today()
    sent = 0
    skipped = 0
    errors = 0

    async with async_session() as db:
        # Find customers with birthday today (match month and day)
        result = await db.execute(
            select(Customer).where(
                and_(
                    Customer.birth_date.isnot(None),
                    Customer.is_active == True,
                    func.extract('month', Customer.birth_date) == today.month,
                    func.extract('day', Customer.birth_date) == today.day,
                )
            )
        )
        birthday_customers = result.scalars().all()

        if not birthday_customers:
            logger.info("No birthdays today (%s)", today.isoformat())
            return {"date": today.isoformat(), "sent": 0, "skipped": 0, "errors": 0}

        logger.info("Found %d customers with birthdays today", len(birthday_customers))

        for customer in birthday_customers:
            try:
                # Check if birthday bonus was already given this year
                existing = await db.execute(
                    select(Transaction).where(
                        Transaction.customer_id == customer.id,
                        Transaction.type == TransactionType.BIRTHDAY,
                        Transaction.created_at >= datetime(today.year, 1, 1, tzinfo=timezone.utc),
                    )
                )
                if existing.scalar_one_or_none():
                    logger.info(
                        "Birthday bonus already sent to %s this year, skipping",
                        customer.phone,
                    )
                    skipped += 1
                    continue

                # Get or create bonus account
                acc_result = await db.execute(
                    select(BonusAccount)
                    .where(BonusAccount.customer_id == customer.id)
                    .with_for_update()
                )
                account = acc_result.scalar_one_or_none()
                if not account:
                    account = BonusAccount(customer_id=customer.id)
                    db.add(account)
                    await db.flush()

                # Award birthday bonus
                bonus = settings.birthday_bonus
                account.balance += bonus
                account.total_earned += bonus

                txn = Transaction(
                    customer_id=customer.id,
                    type=TransactionType.BIRTHDAY,
                    amount=bonus,
                    note=f"Birthday bonus {today.year} for {customer.full_name}",
                )
                db.add(txn)
                sent += 1
                logger.info(
                    "Birthday bonus +%s KGS sent to %s (%s)",
                    bonus,
                    customer.full_name,
                    customer.phone,
                )

            except Exception as e:
                errors += 1
                logger.error(
                    "Error sending birthday bonus to %s: %s",
                    customer.phone,
                    str(e),
                )

        await db.commit()

    summary = {
        "date": today.isoformat(),
        "sent": sent,
        "skipped": skipped,
        "errors": errors,
    }
    logger.info("Birthday bonus task completed: %s", summary)
    return summary
