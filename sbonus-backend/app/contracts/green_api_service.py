"""Green API WhatsApp client for SBonus+ — branded Smart Center messages."""
import logging
from typing import Dict
import httpx

logger = logging.getLogger("sbonus.contracts.greenapi")


class GreenAPIError(Exception):
    pass


def _normalize_phone(phone: str) -> str:
    p = phone.strip().replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
    if p.startswith("+"):
        p = p[1:]
    if not p.isdigit():
        raise ValueError(f"invalid phone: {phone}")
    return f"{p}@c.us"


def _settings():
    from app.core.config import get_settings
    return get_settings()


def _base_url() -> str:
    s = _settings()
    inst = getattr(s, "greenapi_instance_id", "")
    if not inst or not getattr(s, "greenapi_api_token", ""):
        raise GreenAPIError("Green API не настроен")
    host = getattr(s, "greenapi_host", "https://api.green-api.com")
    return f"{host}/waInstance{inst}"


def send_text(phone: str, message: str, timeout: float = 15.0) -> Dict:
    s = _settings()
    url = f"{_base_url()}/sendMessage/{s.greenapi_api_token}"
    payload = {"chatId": _normalize_phone(phone), "message": message}
    try:
        with httpx.Client(timeout=timeout) as client:
            resp = client.post(url, json=payload)
            resp.raise_for_status()
            data = resp.json()
            logger.info(f"GreenAPI sendMessage to {phone}: id={data.get('idMessage')}")
            return data
    except httpx.HTTPError as e:
        logger.error(f"GreenAPI error {phone}: {e}")
        raise GreenAPIError(str(e)) from e


def send_file_by_url(phone: str, file_url: str, file_name: str, caption: str = "", timeout: float = 30.0) -> Dict:
    s = _settings()
    url = f"{_base_url()}/sendFileByUrl/{s.greenapi_api_token}"
    payload = {"chatId": _normalize_phone(phone), "urlFile": file_url, "fileName": file_name, "caption": caption}
    try:
        with httpx.Client(timeout=timeout) as client:
            resp = client.post(url, json=payload)
            resp.raise_for_status()
            return resp.json()
    except httpx.HTTPError as e:
        logger.error(f"GreenAPI file err {phone}: {e}")
        raise GreenAPIError(str(e)) from e


def _first_name(full_name: str) -> str:
    if not full_name:
        return "клиент"
    parts = full_name.split()
    return parts[1] if len(parts) > 1 else parts[0]


def send_contract_link(phone: str, client_name: str, contract_url: str, contract_number: str) -> Dict:
    name = _first_name(client_name)
    message = (
        "🏪 *СМАРТ ЦЕНТР* — программа лояльности S Bonus\n"
        "━━━━━━━━━━━━━━━━━━━\n\n"
        f"Здравствуйте, *{name}*!\n\n"
        f"📋 Ваш договор рассрочки *№{contract_number}* готов к подписанию.\n\n"
        "🔗 Откройте ссылку, ознакомьтесь с условиями и подпишите онлайн:\n"
        f"{contract_url}\n\n"
        "✅ Подписание занимает 2 минуты:\n"
        "  1️⃣ Прочитайте договор\n"
        "  2️⃣ Поставьте подпись пальцем\n"
        "  3️⃣ Введите код из WhatsApp\n\n"
        "⚠️ Ссылка персональная и действительна 7 дней.\n\n"
        "💚 Спасибо, что выбираете Смарт Центр!"
    )
    return send_text(phone, message)


def send_otp(phone: str, code: str) -> Dict:
    message = (
        "🔐 *Код подтверждения подписи*\n\n"
        f"*{code}*\n\n"
        "Введите этот код на странице подписания договора.\n\n"
        "⏱ Код действителен 5 минут.\n"
        "⚠️ Никому не сообщайте этот код.\n\n"
        "— Смарт Центр"
    )
    return send_text(phone, message)


def send_signed_pdf(phone: str, pdf_url: str, contract_number: str) -> Dict:
    return send_file_by_url(
        phone=phone,
        file_url=pdf_url,
        file_name=f"Dogovor_SmartCentr_{contract_number}.pdf",
        caption=(
            f"✅ *Договор №{contract_number} успешно подписан!*\n\n"
            "📎 Сохраните этот PDF как ваш экземпляр договора.\n\n"
            "💚 Спасибо, что выбираете *Смарт Центр*!"
        ),
    )
