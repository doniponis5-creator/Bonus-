"""
Калькулятор графика погашения рассрочки.
Поддерживает: равные платежи + первоначальный взнос + кастомный день месяца.
"""
from decimal import Decimal, ROUND_HALF_UP
from datetime import date, timedelta
from calendar import monthrange
from typing import List, Dict, Optional


def _round_money(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _add_months(d: date, months: int) -> date:
    """Прибавить N месяцев, корректно обрабатывая 28-31 числа."""
    month_total = d.month - 1 + months
    year = d.year + month_total // 12
    month = month_total % 12 + 1
    last_day = monthrange(year, month)[1]
    return date(year, month, min(d.day, last_day))


def build_schedule(
    total_amount,
    term_months: int,
    start_date: Optional[date] = None,
    initial_payment=0,
) -> List[Dict]:
    """
    Построить график равных платежей.

    :param total_amount: общая сумма договора (включая первоначальный взнос если он есть)
    :param term_months: количество месячных платежей
    :param start_date: дата первого платежа (по умолчанию сегодня)
    :param initial_payment: сумма первоначального взноса (вычитается из total, не входит в график)
    :return: [{n, date (ISO), amount, balance}]
    """
    if isinstance(total_amount, (int, float, str)):
        total_amount = Decimal(str(total_amount))
    if isinstance(initial_payment, (int, float, str)):
        initial_payment = Decimal(str(initial_payment))

    if term_months <= 0:
        raise ValueError("term_months должен быть > 0")

    financed = total_amount - initial_payment
    if financed <= 0:
        return []

    base = _round_money(financed / Decimal(term_months))
    # последний платёж — корректировка на копейки
    sum_of_base = base * (term_months - 1)
    last = _round_money(financed - sum_of_base)

    if start_date is None:
        start_date = date.today()

    rows = []
    balance = financed
    for i in range(term_months):
        amount = base if i < term_months - 1 else last
        balance_after = _round_money(balance - amount)
        if balance_after < 0:
            balance_after = Decimal("0.00")
        rows.append({
            "n": i + 1,
            "date": _add_months(start_date, i).isoformat(),
            "amount": float(amount),
            "balance": float(balance_after),
        })
        balance = balance_after

    return rows


if __name__ == "__main__":
    import json
    s = build_schedule(58200, 6, date(2026, 6, 20))
    print(json.dumps(s, indent=2, ensure_ascii=False))
    # Ожидаем 6 платежей по 9700
