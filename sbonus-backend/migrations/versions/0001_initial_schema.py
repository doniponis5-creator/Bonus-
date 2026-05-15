"""Initial schema — all tables

Revision ID: 0001
Revises: —
Create Date: 2026-05-01
"""

from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── ENUMs ─────────────────────────────────────────────────────────────
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE transactiontype AS ENUM (
                'earn','spend','expire','refund','birthday','referral','promo'
            );
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
    """)

    op.execute("""
        DO $$ BEGIN
            CREATE TYPE userroleenum AS ENUM (
                'super_admin','branch_admin','cashier'
            );
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
    """)

    op.execute("""
        DO $$ BEGIN
            CREATE TYPE notificationchannel AS ENUM ('whatsapp','sms');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
    """)

    op.execute("""
        DO $$ BEGIN
            CREATE TYPE notificationstatus AS ENUM ('pending','sent','failed');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
    """)

    # ── tiers ──────────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS tiers (
            id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
            name          VARCHAR(50) NOT NULL UNIQUE,
            min_total_kgs NUMERIC(12,2) NOT NULL DEFAULT 0,
            bonus_percent NUMERIC(5,2)  NOT NULL,
            max_spend_pct NUMERIC(5,2)  NOT NULL DEFAULT 30,
            sort_order    INTEGER      NOT NULL DEFAULT 0,
            is_active     BOOLEAN      DEFAULT TRUE
        )
    """)

    # ── branches ───────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS branches (
            id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
            name       VARCHAR(100) NOT NULL,
            address    TEXT,
            city       VARCHAR(50),
            phone      VARCHAR(20),
            is_active  BOOLEAN      DEFAULT TRUE,
            created_at TIMESTAMPTZ  DEFAULT NOW()
        )
    """)

    # ── users ──────────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
            phone         VARCHAR(20)  NOT NULL,
            full_name     VARCHAR(100) NOT NULL,
            email         VARCHAR(100) UNIQUE,
            role          userroleenum NOT NULL,
            branch_id     UUID         REFERENCES branches(id),
            pin_hash      VARCHAR(255),
            password_hash VARCHAR(255),
            is_active     BOOLEAN      DEFAULT TRUE,
            created_at    TIMESTAMPTZ  DEFAULT NOW()
        )
    """)

    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS ix_users_phone ON users(phone)
    """)

    # ── customers ──────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS customers (
            id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
            phone         VARCHAR(20) NOT NULL UNIQUE,
            full_name     VARCHAR(100) NOT NULL,
            qr_code       VARCHAR(50) NOT NULL UNIQUE,
            birth_date    DATE,
            tier_id       UUID        REFERENCES tiers(id),
            referral_code VARCHAR(20) NOT NULL UNIQUE,
            referred_by   UUID        REFERENCES customers(id),
            is_active     BOOLEAN     DEFAULT TRUE,
            created_at    TIMESTAMPTZ DEFAULT NOW()
        )
    """)

    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS ix_customers_phone ON customers(phone)
    """)

    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS ix_customers_qr_code ON customers(qr_code)
    """)

    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS ix_customers_referral_code ON customers(referral_code)
    """)

    # ── bonus_accounts ─────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS bonus_accounts (
            id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
            customer_id  UUID          NOT NULL UNIQUE REFERENCES customers(id),
            balance      NUMERIC(12,2) NOT NULL DEFAULT 0,
            total_earned NUMERIC(12,2) NOT NULL DEFAULT 0,
            total_spent  NUMERIC(12,2) NOT NULL DEFAULT 0,
            updated_at   TIMESTAMPTZ   DEFAULT NOW()
        )
    """)

    # ── transactions ───────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS transactions (
            id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
            customer_id     UUID            NOT NULL REFERENCES customers(id),
            type            transactiontype NOT NULL,
            amount          NUMERIC(12,2)   NOT NULL,
            purchase_amount NUMERIC(12,2),
            branch_id       UUID            REFERENCES branches(id),
            cashier_id      UUID            REFERENCES users(id),
            receipt_number  VARCHAR(50),
            note            TEXT,
            created_at      TIMESTAMPTZ     DEFAULT NOW()
        )
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_transactions_customer_id ON transactions(customer_id)
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_transactions_created_at ON transactions(created_at)
    """)

    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS ix_transactions_receipt_number
            ON transactions(receipt_number) WHERE receipt_number IS NOT NULL
    """)

    # ── immutable transactions trigger ─────────────────────────────────────
    op.execute("""
        CREATE OR REPLACE FUNCTION prevent_transaction_modification()
        RETURNS TRIGGER AS $$
        BEGIN
            RAISE EXCEPTION 'transactions таблицасы иммутабелдүү: UPDATE жана DELETE тыюу салынган';
            RETURN NULL;
        END;
        $$ LANGUAGE plpgsql
    """)

    op.execute("""
        DROP TRIGGER IF EXISTS trg_immutable_transactions ON transactions
    """)

    op.execute("""
        CREATE TRIGGER trg_immutable_transactions
            BEFORE UPDATE OR DELETE ON transactions
            FOR EACH ROW EXECUTE FUNCTION prevent_transaction_modification()
    """)

    # ── promo_codes ────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS promo_codes (
            id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
            code         VARCHAR(30)   NOT NULL UNIQUE,
            bonus_amount NUMERIC(12,2) NOT NULL,
            max_uses     INTEGER       NOT NULL DEFAULT 100,
            used_count   INTEGER       NOT NULL DEFAULT 0,
            expires_at   TIMESTAMPTZ,
            is_active    BOOLEAN       DEFAULT TRUE,
            created_at   TIMESTAMPTZ   DEFAULT NOW()
        )
    """)

    # ── audit_logs ─────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS audit_logs (
            id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id     UUID        REFERENCES users(id),
            action      VARCHAR(50) NOT NULL,
            entity_type VARCHAR(30),
            entity_id   UUID,
            details     JSONB,
            ip_address  VARCHAR(45),
            created_at  TIMESTAMPTZ DEFAULT NOW()
        )
    """)

    # ── settings ───────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            key        VARCHAR(100) PRIMARY KEY,
            value      TEXT,
            updated_at TIMESTAMPTZ  DEFAULT NOW()
        )
    """)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_immutable_transactions ON transactions")
    op.execute("DROP FUNCTION IF EXISTS prevent_transaction_modification()")

    op.execute("DROP TABLE IF EXISTS settings       CASCADE")
    op.execute("DROP TABLE IF EXISTS audit_logs     CASCADE")
    op.execute("DROP TABLE IF EXISTS promo_codes    CASCADE")
    op.execute("DROP TABLE IF EXISTS transactions   CASCADE")
    op.execute("DROP TABLE IF EXISTS bonus_accounts CASCADE")
    op.execute("DROP TABLE IF EXISTS customers      CASCADE")
    op.execute("DROP TABLE IF EXISTS users          CASCADE")
    op.execute("DROP TABLE IF EXISTS branches       CASCADE")
    op.execute("DROP TABLE IF EXISTS tiers          CASCADE")

    op.execute("DROP TYPE IF EXISTS notificationstatus  CASCADE")
    op.execute("DROP TYPE IF EXISTS notificationchannel CASCADE")
    op.execute("DROP TYPE IF EXISTS userroleenum        CASCADE")
    op.execute("DROP TYPE IF EXISTS transactiontype     CASCADE")
