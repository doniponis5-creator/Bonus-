"""
Sbonus+ — Агрегатор всех API v1 маршрутов.
"""

from fastapi import APIRouter

from app.api.v1.admin import router as admin_router
from app.api.v1.auth import router as auth_router
from app.api.v1.bonus import router as bonus_router
from app.api.v1.campaigns import router as campaigns_router
from app.api.v1.customer import router as customer_cabinet_router
from app.api.v1.customer_auth import router as customer_auth_router
from app.api.v1.customers import router as customers_router
from app.api.v1.cashier_bonus import router as cashier_bonus_router
from app.api.v1.telegram import router as telegram_router
from app.api.v1.telegram import customer_bot_router
from app.api.v1.wa_broadcast import router as wa_broadcast_router
from app.api.v1.webhook import router as webhook_router
from app.api.v1.wheel import router as wheel_router
from app.api.v1.push import router as push_router
from app.api.v1.analytics import router as analytics_router
from app.api.v1.cashback import router as cashback_router
from app.api.v1.referral import router as referral_router
from app.api.v1.branch import router as branch_router
from app.api.v1.customer_tg import router as customer_tg_router
from app.api.v1.ab_testing import router as ab_testing_router
from app.api.v1.qr_analytics import router as qr_analytics_router
from app.api.v1.analytics_pro import router as analytics_pro_router
from app.api.v1.product_analytics import router as product_analytics_router
from app.api.v1.cashier_products import router as cashier_products_router
from app.api.v1.financials import router as financials_router
from app.api.v1.business_intelligence import router as bi_router
from app.api.v1.customer360 import router as customer360_router
from app.api.v1.forecast import router as forecast_router
from app.api.v1.gamification import router as gamification_router
from app.api.v1.branch_analytics import router as branch_analytics_router
from app.api.v1.feedback import router as feedback_router
from app.api.v1.smart_campaigns import router as smart_campaigns_router
from app.api.v1.reports import router as reports_router

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(auth_router)
api_router.include_router(customers_router)
api_router.include_router(bonus_router)
api_router.include_router(webhook_router)
api_router.include_router(admin_router)
api_router.include_router(cashier_bonus_router)
api_router.include_router(campaigns_router)
api_router.include_router(customer_auth_router)
api_router.include_router(customer_cabinet_router)
api_router.include_router(telegram_router)
api_router.include_router(customer_bot_router)
api_router.include_router(wa_broadcast_router)
api_router.include_router(wheel_router)
api_router.include_router(push_router)
api_router.include_router(analytics_router)
api_router.include_router(cashback_router)
api_router.include_router(referral_router)
api_router.include_router(branch_router)
api_router.include_router(customer_tg_router)
api_router.include_router(ab_testing_router)
api_router.include_router(qr_analytics_router)
api_router.include_router(analytics_pro_router)
api_router.include_router(product_analytics_router)
api_router.include_router(cashier_products_router)
api_router.include_router(financials_router)
api_router.include_router(bi_router)
api_router.include_router(customer360_router)
api_router.include_router(forecast_router)
api_router.include_router(gamification_router)
api_router.include_router(branch_analytics_router)
api_router.include_router(feedback_router)
api_router.include_router(smart_campaigns_router)
api_router.include_router(reports_router)
