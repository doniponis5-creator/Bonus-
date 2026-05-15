"""
Sbonus+ — Green API (WhatsApp) сервис.
Отправка уведомлений клиентам через WhatsApp.
"""

from typing import Optional

import httpx

from app.core.config import get_settings

settings = get_settings()

GREENAPI_BASE = "https://api.green-api.com"


class GreenAPIService:
    """Клиент для Green API — WhatsApp Business API."""

    def __init__(self):
        self.instance_id = settings.greenapi_instance_id
        self.api_token = settings.greenapi_api_token
        self.enabled = settings.enable_whatsapp_notifications
        self.base_url = f"{GREENAPI_BASE}/waInstance{self.instance_id}"

    async def send_message(self, phone: str, message: str) -> Optional[dict]:
        """
        Отправить текстовое сообщение в WhatsApp.

        Args:
            phone: номер телефона (формат: 996XXXXXXXXX, без +)
            message: текст сообщения

        Returns:
            Ответ API или None если отключено
        """
        if not self.enabled or not self.instance_id:
            return None

        # Убираем + из номера
        chat_id = phone.lstrip("+") + "@c.us"

        url = f"{self.base_url}/sendMessage/{self.api_token}"
        payload = {
            "chatId": chat_id,
            "message": message,
        }

        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.post(url, json=payload)
                return response.json()
        except Exception as e:
            print(f"  ❌ WhatsApp ошибка для {phone}: {e}")
            return None

    async def send_purchase_notification(
        self,
        phone: str,
        branch_name: str,
        purchase_amount: float,
        earned: float,
        new_balance: float,
        tier_name: str,
    ) -> Optional[dict]:
        """Отправить уведомление о покупке."""
        message = (
            "✅ Покупка подтверждена!\n"
            "━━━━━━━━━━━━━━━━━━\n"
            f"🏪 Магазин: {branch_name}\n"
            f"🛒 Покупка: {purchase_amount:,.0f} KGS\n"
            f"💎 Бонус: +{earned:,.0f} KGS\n"
            f"💰 Баланс: {new_balance:,.0f} KGS\n"
            f"🏆 Уровень: {tier_name}\n"
            "━━━━━━━━━━━━━━━━━━\n"
            "Спасибо! Ждём вас снова 🎁"
        )
        return await self.send_message(phone, message)

    async def send_spend_notification(
        self, phone: str, spent: float, new_balance: float
    ) -> Optional[dict]:
        """Отправить уведомление о списании бонуса."""
        message = (
            "💳 Бонус использован!\n"
            "━━━━━━━━━━━━━━━━━━\n"
            f"➖ Списано: {spent:,.0f} KGS\n"
            f"💰 Остаток: {new_balance:,.0f} KGS"
        )
        return await self.send_message(phone, message)

    async def send_birthday_notification(
        self, phone: str, name: str, new_balance: float
    ) -> Optional[dict]:
        """Отправить поздравление с днём рождения."""
        message = (
            f"🎂 С днём рождения, {name}!\n"
            "━━━━━━━━━━━━━━━━━━\n"
            f"🎁 Специальный подарок: +200 KGS бонус!\n"
            f"💰 Новый баланс: {new_balance:,.0f} KGS\n"
            "Приходите к нам! 🛍"
        )
        return await self.send_message(phone, message)
