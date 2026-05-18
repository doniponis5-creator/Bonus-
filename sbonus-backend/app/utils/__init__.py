"""
Sbonus+ — Утилиты.
"""


def normalize_phone(phone: str) -> str:
    """
    Нормализация телефонного номера в международный формат +996XXXXXXXXX.

    Поддерживает форматы:
    - 0555123456 → +996555123456
    - 996555123456 → +996555123456
    - +996555123456 → +996555123456
    - с пробелами, скобками, дефисами
    """
    clean = phone.replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
    if clean.startswith("0"):
        clean = "+996" + clean[1:]
    elif clean.startswith("996") and not clean.startswith("+"):
        clean = "+" + clean
    elif not clean.startswith("+"):
        clean = "+" + clean
    return clean
