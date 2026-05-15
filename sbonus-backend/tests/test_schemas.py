"""
Тесты Pydantic схем — валидация входных данных.
"""
import pytest
from decimal import Decimal
from pydantic import ValidationError

from app.schemas import (
    BonusEarnRequest,
    BonusSpendRequest,
    CashierLoginRequest,
    CustomerRegisterRequest,
    PromoCodeCreateRequest,
    TierCreateRequest,
    Webhook1CPurchaseRequest,
    Webhook1CSpendRequest,
    Webhook1CRefundRequest,
)
import uuid


# ─── Auth schemas ─────────────────────────────────────────

def test_cashier_login_valid():
    r = CashierLoginRequest(phone="+996700111222", pin="1234")
    assert r.phone == "+996700111222"
    assert r.pin == "1234"


def test_cashier_login_short_pin():
    with pytest.raises(ValidationError):
        CashierLoginRequest(phone="+996700111222", pin="12")


def test_cashier_login_long_pin():
    with pytest.raises(ValidationError):
        CashierLoginRequest(phone="+996700111222", pin="123456789")


# ─── Customer schemas ─────────────────────────────────────

def test_customer_register_valid():
    r = CustomerRegisterRequest(phone="+996700111222", full_name="Иван Иванов")
    assert r.phone == "+996700111222"
    assert r.full_name == "Иван Иванов"


def test_customer_register_short_name():
    with pytest.raises(ValidationError):
        CustomerRegisterRequest(phone="+996700111222", full_name="А")


def test_customer_register_strips_name():
    r = CustomerRegisterRequest(phone="+996700111222", full_name="  Иван Иванов  ")
    assert r.full_name == "Иван Иванов"


def test_customer_register_empty_phone():
    with pytest.raises(ValidationError):
        CustomerRegisterRequest(phone="   ", full_name="Иван Иванов")


# ─── Bonus schemas ────────────────────────────────────────

def test_bonus_earn_valid():
    r = BonusEarnRequest(
        customer_id=uuid.uuid4(),
        purchase_amount=Decimal("1000"),
        branch_id=uuid.uuid4(),
    )
    assert r.purchase_amount == Decimal("1000")


def test_bonus_earn_zero_amount():
    with pytest.raises(ValidationError):
        BonusEarnRequest(
            customer_id=uuid.uuid4(),
            purchase_amount=Decimal("0"),
            branch_id=uuid.uuid4(),
        )


def test_bonus_earn_negative_amount():
    with pytest.raises(ValidationError):
        BonusEarnRequest(
            customer_id=uuid.uuid4(),
            purchase_amount=Decimal("-100"),
            branch_id=uuid.uuid4(),
        )


def test_bonus_spend_valid():
    r = BonusSpendRequest(
        customer_id=uuid.uuid4(),
        spend_amount=Decimal("100"),
        purchase_amount=Decimal("500"),
        branch_id=uuid.uuid4(),
    )
    assert r.spend_amount == Decimal("100")


# ─── Admin schemas ────────────────────────────────────────

def test_tier_create_valid():
    r = TierCreateRequest(
        name="Bronze",
        min_total_kgs=Decimal("0"),
        bonus_percent=Decimal("3"),
    )
    assert r.bonus_percent == Decimal("3")
    assert r.max_spend_pct == Decimal("30")  # default


def test_tier_create_invalid_percent():
    with pytest.raises(ValidationError):
        TierCreateRequest(
            name="Broken",
            min_total_kgs=Decimal("0"),
            bonus_percent=Decimal("150"),  # > 100
        )


def test_promo_code_valid():
    r = PromoCodeCreateRequest(code="SUMMER50", bonus_amount=Decimal("500"))
    assert r.code == "SUMMER50"
    assert r.max_uses == 100  # default


# ─── Webhook schemas ──────────────────────────────────────

def test_webhook_purchase_valid():
    r = Webhook1CPurchaseRequest(
        customer_phone="+996700111222",
        purchase_amount=Decimal("5000"),
        branch_id=uuid.uuid4(),
        receipt_number="RECEIPT-001",
    )
    assert r.purchase_amount == Decimal("5000")


def test_webhook_spend_valid():
    r = Webhook1CSpendRequest(
        customer_phone="+996700111222",
        spend_amount=Decimal("200"),
        purchase_amount=Decimal("1000"),
        branch_id=uuid.uuid4(),
        receipt_number="SPEND-001",
    )
    assert r.spend_amount == Decimal("200")


def test_webhook_refund_valid():
    r = Webhook1CRefundRequest(
        customer_phone="+996700111222",
        refund_amount=Decimal("500"),
        original_receipt_number="RECEIPT-001",
        branch_id=uuid.uuid4(),
    )
    assert r.refund_amount == Decimal("500")
