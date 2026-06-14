"""
Число прописью на русском с валютой "сом / тыйын" (Кыргызстан).
Не использует внешних библиотек — работает в любом окружении.
"""
from decimal import Decimal

_ONES = ("", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять",
         "десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать",
         "пятнадцать", "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать")
_ONES_F = ("", "одна", "две", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять",
           "десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать",
           "пятнадцать", "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать")
_TENS = ("", "", "двадцать", "тридцать", "сорок", "пятьдесят",
         "шестьдесят", "семьдесят", "восемьдесят", "девяносто")
_HUNDREDS = ("", "сто", "двести", "триста", "четыреста", "пятьсот",
             "шестьсот", "семьсот", "восемьсот", "девятьсот")


def _triple_to_words(num: int, feminine: bool = False) -> str:
    """Преобразовать трёхзначное число в слова."""
    out = []
    h = num // 100
    rest = num % 100
    if h:
        out.append(_HUNDREDS[h])
    if rest < 20:
        if rest:
            out.append((_ONES_F if feminine else _ONES)[rest])
    else:
        t = rest // 10
        o = rest % 10
        out.append(_TENS[t])
        if o:
            out.append((_ONES_F if feminine else _ONES)[o])
    return " ".join(out).strip()


def _plural(n: int, forms: tuple) -> str:
    """forms = (1, 2-4, 5+) — например ('сом','сома','сомов')."""
    n_mod = abs(n) % 100
    if 11 <= n_mod <= 19:
        return forms[2]
    last = n_mod % 10
    if last == 1:
        return forms[0]
    if 2 <= last <= 4:
        return forms[1]
    return forms[2]


def integer_to_words(num: int) -> str:
    """Целое число прописью (без валюты)."""
    if num == 0:
        return "ноль"
    if num < 0:
        return "минус " + integer_to_words(-num)

    parts = []
    # миллиарды
    bln = num // 1_000_000_000
    if bln:
        parts.append(_triple_to_words(bln) + " " + _plural(bln, ("миллиард", "миллиарда", "миллиардов")))
        num %= 1_000_000_000
    # миллионы
    mln = num // 1_000_000
    if mln:
        parts.append(_triple_to_words(mln) + " " + _plural(mln, ("миллион", "миллиона", "миллионов")))
        num %= 1_000_000
    # тысячи (женский род)
    thousands = num // 1_000
    if thousands:
        parts.append(_triple_to_words(thousands, feminine=True) + " " + _plural(thousands, ("тысяча", "тысячи", "тысяч")))
        num %= 1_000
    # сотни и единицы
    if num:
        parts.append(_triple_to_words(num))
    return " ".join(parts).strip()


def amount_to_words_kgs(amount) -> str:
    """
    Сумма прописью в формате 'Пятьдесят восемь тысяч двести сомов 00 тыйнов'.
    Принимает Decimal/float/int/str.
    """
    if isinstance(amount, str):
        amount = Decimal(amount.replace(",", ".").replace(" ", ""))
    elif isinstance(amount, (int, float)):
        amount = Decimal(str(amount))

    soms = int(amount)
    tyiyns = int((amount - Decimal(soms)) * 100)

    words = integer_to_words(soms).capitalize() if soms else "ноль"
    sum_word = _plural(soms, ("сом", "сома", "сомов"))
    return f"{words} {sum_word} {tyiyns:02d} тыйнов"


if __name__ == "__main__":
    # Самотест
    tests = [
        (28000, "Двадцать восемь тысяч сомов 00 тыйнов"),
        (58200, "Пятьдесят восемь тысяч двести сомов 00 тыйнов"),
        (1234567, "Один миллион двести тридцать четыре тысячи пятьсот шестьдесят семь сомов 00 тыйнов"),
        (100, "Сто сомов 00 тыйнов"),
        (1, "Один сом 00 тыйнов"),
        (Decimal("123.45"), "Сто двадцать три сома 45 тыйнов"),
    ]
    for n, expected in tests:
        got = amount_to_words_kgs(n)
        ok = "OK" if got.lower() == expected.lower() else "FAIL"
        print(f"{ok}: {n} → {got}")
