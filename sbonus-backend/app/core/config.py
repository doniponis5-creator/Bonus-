"""
Sbonus+ — Конфигурация приложения.
Все настройки загружаются из .env файла через Pydantic Settings.
"""

from decimal import Decimal
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Центральная конфигурация Sbonus+ бэкенда."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # ─── Магазин ───
    shop_name: str = "Смарт Центр"
    shop_bonus_name: str = "S Bonus"
    shop_address: str = "Ошская обл., Аравандский р-н, ул. Ош-3000, 86"
    shop_phone: str = "+996557100505"
    shop_country: str = "Кыргызстан"
    shop_currency: str = "KGS"
    shop_timezone: str = "Asia/Bishkek"

    # ─── Бонусная логика ───
    min_purchase_for_bonus: Decimal = Decimal("500")
    max_spend_percent: Decimal = Decimal("30")
    birthday_bonus: Decimal = Decimal("200")
    referral_bonus_inviter: Decimal = Decimal("100")
    referral_bonus_invitee: Decimal = Decimal("50")
    bonus_expiration_days: int = 365
    bonus_expiration_warning_days: int = 30

    # ─── БД ───
    postgres_user: str = "sbonus"
    postgres_password: str = "sbonus_secret_2025"
    postgres_db: str = "sbonus_db"
    database_url: str = "postgresql+asyncpg://sbonus:sbonus_secret_2025@db:5432/sbonus_db"

    # ─── Redis ───
    redis_url: str = "redis://redis:6379/0"

    # ─── JWT ───
    jwt_private_key_path: str = "/app/keys/private.pem"
    jwt_public_key_path: str = "/app/keys/public.pem"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 30

    # ─── Rate Limiting ───
    login_rate_limit: str = "5/15min"
    api_rate_limit: str = "100/min"

    # ─── 1С ───
    enable_1c_webhook: bool = False
    webhook_1c_secret: str = "your_hmac_secret_here"
    webhook_1c_allowed_ips: str = "127.0.0.1,10.0.0.0/8"

    # ─── Green API ───
    greenapi_instance_id: str = ""
    greenapi_api_token: str = ""
    enable_whatsapp_notifications: bool = False

    # ─── Личный кабинет клиента ───
    customer_cabinet_base_url: str = "http://localhost:3001"
    customer_token_expire_days: int = 30
    customer_magic_link_expire_minutes: int = 15

    # ─── CORS ───
    cors_origins: str = "http://localhost:3000,http://localhost:3001,http://localhost:8080"

    # ─── Приложение ───
    app_env: str = "development"
    debug: bool = True
    log_level: str = "INFO"

    @property
    def cors_origins_list(self) -> list[str]:
        """Список разрешённых CORS доменов."""
        return [origin.strip() for origin in self.cors_origins.split(",")]

    @property
    def webhook_1c_ip_list(self) -> list[str]:
        """Список разрешённых IP для 1С webhook."""
        return [ip.strip() for ip in self.webhook_1c_allowed_ips.split(",")]


@lru_cache()
def get_settings() -> Settings:
    """Кешированный синглтон настроек."""
    return Settings()
