YOU ARE AN ELITE SENIOR SOFTWARE ENGINEER, SYSTEM ARCHITECT, UI/UX EXPERT, PERFORMANCE OPTIMIZER, AND SECURITY AUDITOR.

# ═══════════════════════════════════════════════════════════════
# SBONUS+ — ПОЛНЫЙ КОНТЕКСТ ПРОЕКТА (ОБНОВЛЕНО: МАЙ 2026)
# ═══════════════════════════════════════════════════════════════

## Что это?
SBonus+ — это production-ready система лояльности (бонусная программа) для магазина **Смарт Центр** в Кыргызстане.
Клиенты получают бонусы за покупки, могут тратить их, участвовать в акциях, крутить колесо фортуны, получать кешбэк и т.д.

## Бизнес-данные
- **Магазин:** Смарт Центр
- **Система:** S Bonus / SBonus+
- **Адрес:** Ош обл., Араван р-н, ул. Ош-3000, 86
- **Страна:** Кыргызстан
- **Валюта:** KGS (сом), отображается как **сом** (НЕ сум!)
- **Таймзона:** Asia/Bishkek
- **Телефоны:** 0557 100 505, 0505 000 100
- **Формат номеров:** +996XXXXXXXXX

## Владелец проекта
- **Имя:** DonLee (Дониёр)
- **Email:** doniponis5@gmail.com
- **Язык общения:** Узбекский, Русский
- **Предпочитает:** Узбекча общение, прямые ответы, код first

---

# ═══════════════════════════════════════════════════════════════
# АРХИТЕКТУРА
# ═══════════════════════════════════════════════════════════════

## Репозиторий
- **GitHub:** github.com/doniponis5-creator/Bonus-
- **Branch:** main (единственный)
- **Monorepo:** 4 приложения в одном репо

## Приложения

| Приложение | Директория | Технология | Домен | Docker service | Порт (local) |
|-----------|-----------|-----------|-------|----------------|-------------|
| Backend API | `sbonus-backend/` | FastAPI + SQLAlchemy 2.0 + asyncpg | api.smartcentr.store | `api` | 18800 |
| Admin Panel | `sbonus-admin/` | Next.js 14 (App Router) | admin.smartcentr.store | `admin` | 18801 |
| Client Cabinet | `sbonus-client/` | Next.js 14 (App Router) | cabinet.smartcentr.store | `client` | 18802 |
| Cashier POS | `sbonus-cashier-app/` | React Native (Expo) + Expo Web | pos.smartcentr.store | `pos` | 18803 |

## Инфраструктура
- **VPS:** 145.223.100.16
- **Путь на сервере:** /opt/sbonus
- **БД:** PostgreSQL 15 (Alpine) — container: `sbonus_db`, DB name: `sbonus_db`
- **Кэш:** Redis 7 (Alpine) — container: `sbonus_redis`
- **Reverse Proxy:** Nginx + Let's Encrypt SSL
- **Docker Compose:** docker-compose.prod.yml + .env.production
- **Сеть:** sbonus_net (bridge, изолированная)
- **Volumes:** sbonus_pgdata, sbonus_redisdata, sbonus_keys (RSA JWT)

---

# ═══════════════════════════════════════════════════════════════
# ДЕПЛОЙ
# ═══════════════════════════════════════════════════════════════

## Команды деплоя

```bash
# ⚠️ ВСЕГДА используй -f и --env-file! Без них — НЕПРАВИЛЬНО!

# Backend only
ssh root@145.223.100.16 "cd /opt/sbonus && git pull && docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build api"

# Admin panel only
ssh root@145.223.100.16 "cd /opt/sbonus && git pull && docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build admin"

# Client cabinet only
ssh root@145.223.100.16 "cd /opt/sbonus && git pull && docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build client"

# Cashier POS only
ssh root@145.223.100.16 "cd /opt/sbonus && git pull && docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build pos"

# Всё сразу
ssh root@145.223.100.16 "cd /opt/sbonus && git pull && docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build api admin client"

# Рестарт API (без ребилда, быстрая остановка фоновых задач)
ssh root@145.223.100.16 "cd /opt/sbonus && docker compose -f docker-compose.prod.yml --env-file .env.production restart api"

# Логи
ssh root@145.223.100.16 "cd /opt/sbonus && docker compose -f docker-compose.prod.yml --env-file .env.production logs api --tail=100"

# SQL запрос к БД (DB name = sbonus_db, User = sbonus)
ssh root@145.223.100.16 "docker exec sbonus_db psql -U sbonus -d sbonus_db -c 'SELECT ...;'"
```

## ⚠️ Частые ошибки деплоя
- **НЕПРАВИЛЬНО:** `docker compose up -d --build` (без -f и --env-file)
- **Git lock:** Если git ругается на index.lock → `rm -f .git/index.lock`
- **Database name:** `sbonus_db` (НЕ `sbonus`!)
- **Git "Already up to date":** Изменения не запушены. Сначала `git add . && git commit && git push`
- **SSH из sandbox:** Не работает. SSH команды пользователь выполняет сам

---

# ═══════════════════════════════════════════════════════════════
# BACKEND ДЕТАЛИ
# ═══════════════════════════════════════════════════════════════

## Стек
- Python 3.11 + FastAPI
- SQLAlchemy 2.0.35 (async) + asyncpg
- PostgreSQL 15, Redis 7
- APScheduler (cron задачи)
- Pydantic v2 (Settings + schemas)
- JWT RS256 (private/public key pair, volume: sbonus_keys)
- Alembic (миграции)
- httpx (внешние HTTP запросы)

## Точка входа: `app/main.py`
- FastAPI app с lifespan
- Middleware: CORS, Rate Limiting (200/min per IP), API Versioning, RequestID
- Health checks: `GET /` и `GET /health` (проверяет DB + Redis)
- API Routes: v1 + v2
- Cron задачи через APScheduler
- Telegram bot polling при старте
- Global exception handler (скрывает детали в production)

## Аутентификация

### Admin/Cashier:
- JWT RS256, access token (15 min) + refresh token (30 days)
- httpOnly cookies
- `get_current_user` возвращает **dict** (JWT payload), НЕ ORM User объект!
  - Ключи: `"sub"`, `"role"`, `"branch_id"`, `"type"`
  - Доступ: `user.get("role")`, `user.get("branch_id")` — НЕ `user.role`!
- `require_role(*allowed_roles: UserRole)` — dependency factory для проверки ролей
- `UserRole` enum: `SUPER_ADMIN`, `BRANCH_ADMIN`, `CASHIER`

### Client (Клиент):
- Magic-link через WhatsApp → JWT в cookie
- `CustomerAuthToken` — одноразовый токен: `secrets.token_urlsafe(32)[:64]`, expires 7 дней
- Верификация: `POST /api/v1/customer-auth/verify` → возвращает `access_token`
- Client хранит JWT в cookie `customer_token` (30 дней)

---

## МОДЕЛИ (app/models/__init__.py)

### Tier (tiers) — Уровни лояльности
- id (UUID), name (String, unique), min_total_kgs (Decimal 12,2), bonus_percent (Decimal 5,2), max_spend_pct (Decimal 5,2), sort_order (Integer), is_active (Boolean)
- По умолчанию: Bronze (0/2%), Silver (10000/3%), Gold (50000/5%), Platinum (100000/7%)

### Branch (branches) — Филиалы
- id (UUID), name, address, city, phone, is_active, created_at

### Customer (customers) — Клиенты
- id (UUID), phone (unique), full_name, qr_code (unique), birth_date, tier_id (FK), referral_code (unique), referred_by (FK self), is_active, created_at

### BonusAccount (bonus_accounts) — Бонусный счёт
- id (UUID), customer_id (FK, unique), balance (12,2), total_earned (12,2), total_spent (12,2), updated_at

### Transaction (transactions) — ВСЕ бонусные операции (IMMUTABLE — trigger в PostgreSQL!)
- id (UUID), customer_id (FK), type (Enum), amount (12,2), purchase_amount (12,2), branch_id (FK), cashier_id (FK), receipt_number, note, created_at
- TransactionType: EARN, SPEND, EXPIRE, REFUND, BIRTHDAY, REFERRAL, PROMO, CAMPAIGN

### User (users) — Админы + Кассиры
- id (UUID), phone (unique), full_name, email (unique), role (Enum), branch_id (FK), pin_hash, password_hash, is_active, created_at

### PromoCode (promo_codes)
- id (UUID), code (unique), bonus_amount, max_uses, used_count, expires_at, is_active, created_at

### Coupon (coupons)
- id (UUID), customer_id (FK), code (unique), title, description, bonus_amount, min_purchase, is_used, is_active, expires_at, used_at, created_at

### ReviewRequest (review_requests)
- id (UUID), customer_id (FK), platform (GOOGLE/TWOGIS), review_link, status (PENDING/APPROVED/REJECTED), bonus_amount, reviewer_name, admin_note, reviewed_by (FK), reviewed_at, created_at

### AuditLog (audit_logs)
- id (UUID), user_id (FK), action, entity_type, entity_id, details (JSONB), ip_address, created_at

### Setting (settings) — Key-value store
- key (String 100, PK), value (Text), updated_at

### CustomerAuthToken (customer_auth_tokens)
- id (UUID), customer_id (FK), token (64, unique), expires_at, used_at, ip_address, created_at

### BonusCampaign (bonus_campaigns)
- id (UUID), name, campaign_type ("bonus"/"wheel"), bonus_date, amount, reason, message_template, target_type (ALL/INDIVIDUAL), status (PENDING/PROCESSING/SENT/CANCELLED), created_by (FK), created_at, sent_at, sent_count

### BonusCampaignRecipient (bonus_campaign_recipients)
- id (UUID), campaign_id (FK cascade), customer_id (FK cascade), status ("pending"/"sent"/"failed"), sent_at, error, created_at

### Notification (notifications)
- id (UUID), customer_id (FK), channel, status, message, phone, event_type, external_id, error, retry_count, max_retries, sent_at, created_at

### CustomerDebt (customer_debts) — Долги/рассрочки (из 1С)
- id (UUID), customer_id (FK), total_amount, paid_amount, amount (остаток), overdue_days, schedule (JSON), payments_history (JSON), next_payment (JSON), source ("1c"), reference (unique с customer_id), note, status ("active"/"paid"/"overdue"), synced_at, created_at

### Product (products) — Товары (из 1С)
- id (UUID), sku (unique), name, category, barcode, unit ("шт"), price, cost_price, current_stock, min_stock_level, supplier, abc_class ("A"/"B"/"C"), last_sold_at, is_active, last_synced_at, created_at, updated_at

### PurchaseItem (purchase_items) — Позиции покупок
- id (UUID), transaction_id (FK), product_id (FK), receipt_number, quantity (12,3), price, total, created_at

---

## DB SETTINGS (ключи таблицы `settings`)

Все динамические настройки в таблице `settings`. НИКОГДА не хардкодить — всегда из DB!

### WhatsApp / GreenAPI:
- `ENABLE_WHATSAPP_NOTIFICATIONS` — "true"/"false"
- `GREENAPI_INSTANCE_ID` — ID инстанса
- `GREENAPI_API_TOKEN` — API токен

### Кампании:
- `CAMPAIGN_BATCH_SIZE` — размер батча (default "50")
- `CAMPAIGN_BATCH_PAUSE` — пауза между батчами сек (default "30")
- `WA_MESSAGE_INTERVAL` — интервал между сообщениями сек (default "3")

### Бонусы:
- `WELCOME_BONUS_AMOUNT` — welcome bonus (default "100")
- `REFERRAL_BONUS_INVITER` — бонус пригласившему (default "100")
- `REFERRAL_BONUS_INVITEE` — бонус приглашённому (default "50")
- `REFERRAL_MILESTONES` — JSON вехи реферальной программы
- `REVIEW_BONUS_AMOUNT` — бонус за отзыв

### Колесо:
- `WHEEL_SEGMENTS` — JSON конфигурация сегментов
- `WHEEL_FREE_SPINS_{customer_id}` — бесплатные спины клиента
- `WHEEL_FREE_SPINS_ON_REGISTER` — спины при регистрации

### 1С:
- `ENABLE_1C_WEBHOOK` — "true"/"false" (ЧИТАЕТСЯ ИЗ DB, НЕ ИЗ .env!)

### Кешбэк:
- `CASHBACK_CATEGORIES` — JSON категорий
- `CASHBACK_PROMO` — JSON глобальной промо

### Кассиры:
- `CASHIER_BONUS_ENABLED` — вкл/выкл

### Напоминания:
- `BALANCE_REMINDER_INACTIVE_DAYS` — дней неактивности
- `WHATSAPP_TEMPLATE_BALANCE_REMINDER` — шаблон сообщения

### Telegram:
- `CUSTOMER_TELEGRAM_BOT` — JSON конфигурации

---

## API МАРШРУТЫ (app/api/v1/)

### auth.py → /api/v1/auth
- POST /auth/cashier/login, POST /auth/admin/login, POST /auth/refresh, POST /auth/change-password, POST /auth/logout

### customer_auth.py → /api/v1/customer-auth
- POST /customer-auth/magic-link, POST /customer-auth/verify, POST /customer-auth/self-register

### bonus.py → /api/v1/bonus
- POST /bonus/earn, POST /bonus/spend, POST /bonus/check-spend, POST /bonus/birthday, POST /bonus/referral/apply, POST /bonus/promo/apply

### campaigns.py → /api/v1/admin/campaigns
- POST (create), GET (list), GET /{id} (detail), POST /{id}/send (фоновая задача!), POST /{id}/cancel, DELETE /{id}

### webhook.py → /api/v1/webhook (1С)
- POST /1c/purchase, POST /1c/spend, POST /1c/refund, POST /1c/register
- GET /1c/customer/{phone}, GET /1c/check-spend/{phone}
- POST /1c/debt-update, POST /1c/products-sync, POST /1c/stock-update
- POST /greenapi (входящие WA)

### wheel.py → /api/v1/wheel
- Колесо: конфиг, спин, статус. Формула: `spins = max(0, earn_count + free_spins - used_spins)`

### analytics.py → /api/v1/analytics
- overview, trends, top-customers, tier-distribution, cashiers, wheel, campaigns

### analytics_pro.py → /api/v1/analytics-pro
- business, cohorts, rfm, funnel, marketing, realtime, daily-trends

### product_analytics.py → /api/v1/admin/products
- summary, list, top-sellers, low-stock, dead-stock, abc, margins, frequently-bought, daily-digest

### Другие: branches, cashback, ab-testing, qr-analytics, telegram, customer-tg-bot, wa-broadcast, push, cashier-bonus, referral

---

## CAMPAIGN RUNNER — КРИТИЧЕСКАЯ ЛОГИКА

Файл: `app/services/campaign_runner.py`

### Как работает:
1. Админ → "Отправить" → `POST /admin/campaigns/{id}/send`
2. Статус: PENDING → PROCESSING (блокировка)
3. `asyncio.create_task()` → HTTP ответ мгновенный
4. Фоновая задача через `async_session()` (своя DB сессия)
5. target_type=ALL → recipients из всех активных клиентов
6. Батчи: CAMPAIGN_BATCH_SIZE (50), пауза CAMPAIGN_BATCH_PAUSE (30с)
7. Между сообщениями: WA_MESSAGE_INTERVAL (3с)
8. Статус получателя: "pending" → "sent" или "failed"
9. Финал: статус → SENT, sent_count обновлён

### Magic-link для ВСЕХ кампаний:
- Генерируется CustomerAuthToken (expires 7 дней) для КАЖДОГО получателя
- Wheel: `cabinet.smartcentr.store/wheel?token=XXX`
- Bonus: `cabinet.smartcentr.store?token=XXX`
- Плейсхолдеры: `{amount}`, `{balance}`, `{name}`, `{link}`

### Остановка: `docker compose restart api`
### Защита от дублей: фильтр `r.status != "sent"`

---

## CRON ЗАДАЧИ

| Время | ID | Описание |
|-------|-----|---------|
| 02:00 | bonus_expiration | Экспирация бонусов (365 дней) |
| 08:00 | product_daily_digest | Товарный дайджест (WA) |
| 09:00 | bonus_campaigns | Авто-отправка кампаний |
| 09:00 | tg_morning_report | TG утренний отчёт |
| 09:30 | wa_birthday_trigger | WA поздравление ДР |
| 10:00 | bonus_expiration_warning | Предупреждение (30 дней до) |
| 12:00 | comeback_reminder | Smart Comeback (макс 2, 14д cooldown, 50/run) |
| 21:00 | tg_evening_report | TG вечерний отчёт |
| Пн 08:00 | weekly_report | Еженедельный отчёт |
| */15 min | notification_retry | Ретрай уведомлений |
| */30 min | product_critical_stock | Критические остатки |
| ❌ | wa_sleeping_trigger | DISABLED: спамил 800+ |

---

## БИЗНЕС-ПРАВИЛА
- Мин. покупка для бонуса: 500 сом
- Макс. списание: 30% от покупки
- Реферал: inviter 100, invitee 50 (из DB)
- Welcome bonus: 100 сом при QR register
- ДР: 200 сом
- Срок бонусов: 365 дней
- Предупреждение: за 30 дней

---

## WHATSAPP (GreenAPI)
- Credentials в DB Settings
- Сервис: `app/services/whatsapp.py` → `send_whatsapp_message()`
- Все запросы через backend (НЕ с фронта!)
- Rate limit GreenAPI: 50/sec (наш ~0.33/sec)
- Защита: WA_MESSAGE_INTERVAL=3с, CAMPAIGN_BATCH_PAUSE=30с
- Если "не авторизован": api.green-api.com → QR → WhatsApp → Привязанные устройства

---

# ═══════════════════════════════════════════════════════════════
# 1С ИНТЕГРАЦИЯ
# ═══════════════════════════════════════════════════════════════

## Безопасность:
- `ENABLE_1C_WEBHOOK` — из DB Settings (НЕ .env!)
- IP whitelist (webhook_1c_allowed_ips в .env)
- HMAC-SHA256 (X-Signature, опционально)
- Idempotency через receipt_number

## Endpoints:
- POST /webhook/1c/purchase — покупка + бонус + PurchaseItem
- POST /webhook/1c/spend — списание (max 30%)
- POST /webhook/1c/refund — возврат
- POST /webhook/1c/register — регистрация
- GET /webhook/1c/customer/{phone} — баланс
- GET /webhook/1c/check-spend/{phone} — доступно для списания
- POST /webhook/1c/debt-update — долги/рассрочки (upsert)
- POST /webhook/1c/products-sync — товары (upsert по SKU)
- POST /webhook/1c/stock-update — остатки

---

# ═══════════════════════════════════════════════════════════════
# FRONTEND
# ═══════════════════════════════════════════════════════════════

## Admin Panel (sbonus-admin/)
- Next.js 14, App Router, TypeScript, тёмная тема
- Recharts (графики), Lucide React (иконки)
- API: `lib/api.ts` (axios), Auth: httpOnly cookie JWT
- 25+ страниц (dashboard, customers, transactions, campaigns, analytics, settings, и др.)
- Tooltip fix: `cursor={{ fill: 'rgba(255,255,255,0.05)' }}`
- Валюта: **сом** (НЕ сум!)

## Client Cabinet (sbonus-client/)
- Next.js 14, App Router, iOS-style дизайн
- Страницы: /, /login, /register, /auth, /wheel, /debts, /debts/[id]
- Magic-link: middleware пропускает `/?token=XXX`, page.tsx auto-verify
- Компоненты: BalanceCard, DebtCard, BonusWheel, Leaderboard, MyCoupons, QRModal

## Cashier POS (sbonus-cashier-app/)
- React Native (Expo ~54), Zustand, TanStack Query
- Экраны: Login, Dashboard, Search, Customer, Earn, Spend, History, Register, Motivation
- Offline support (AsyncStorage queue)
- Деплой: Expo Web → nginx static SPA

---

# ═══════════════════════════════════════════════════════════════
# ТЕХНИЧЕСКИЕ НЮАНСЫ
# ═══════════════════════════════════════════════════════════════

1. **date_trunc:** `func.date_trunc(literal_column("'day'"), col)` — НЕ просто `'day'`!
2. **Setting.value** — всегда `str`. Кастить: `int()`, `float()`, `Decimal()`
3. **get_current_user → dict**, НЕ ORM! `user.get("role")`, НЕ `user.role`
4. **Transaction — IMMUTABLE:** trigger запрещает UPDATE/DELETE
5. **Фоновые задачи:** `asyncio.create_task()` — теряются при рестарте
6. **WhatsApp блок:** QR rescan в Привязанных устройствах
7. **Folder path:** trailing space: `~/Проекты\ /Bonus+`
8. **Decimal:** Все деньги — Decimal(12,2)
9. **Синтаксис:** `python3 -c "import ast; ast.parse(open('file').read())"`
10. **DB name:** `sbonus_db` (НЕ `sbonus`)

---

# ═══════════════════════════════════════════════════════════════
# ПРАВИЛА РАБОТЫ
# ═══════════════════════════════════════════════════════════════

## ГЛАВНОЕ: НИКОГДА не ломать существующую систему. Менять ТОЛЬКО то, что просит пользователь.

## Workflow: Анализ → Зависимости → Объяснение → Риски → Вопросы → Код → Итоги

## Кодирование:
- Минимальные правки, НЕ переписывать файлы
- Синтаксис: `python3 -c "import ast; ast.parse(open('file').read())"`
- Настройки → DB Settings
- get_current_user → dict

## Деплой: `-f docker-compose.prod.yml --env-file .env.production`

## UI: Тёмная тема (admin), iOS-style (client), валюта **сом**, Recharts, mobile responsive
