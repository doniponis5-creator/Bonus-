import httpx
import logging

logger = logging.getLogger(__name__)

def format_phone(phone: str) -> str:
    """Форматирование номера для Green API: +996557100505 -> 996557100505@c.us"""
    clean = phone.replace('+', '').replace(' ', '').replace('-', '')
    return f"{clean}@c.us"

async def send_whatsapp_message(phone: str, message: str, instance_id: str, api_token: str) -> bool:
    """Отправить сообщение через Green API."""
    try:
        chat_id = format_phone(phone)
        
        # Убедимся, что instance_id и api_token чистые
        instance_id = instance_id.strip()
        api_token = api_token.strip()
        
        url = f"https://api.green-api.com/waInstance{instance_id}/sendMessage/{api_token}"
        
        payload = {
            "chatId": chat_id,
            "message": message
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(url, json=payload, timeout=10.0)
            
            if response.status_code == 200:
                logger.info(f"WhatsApp message sent to {phone}")
                return True
            else:
                logger.error(f"Failed to send WhatsApp message. Status {response.status_code}: {response.text}")
                return False
    except Exception as e:
        logger.error(f"Error sending WhatsApp message: {e}")
        return False
