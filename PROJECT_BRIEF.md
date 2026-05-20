# S BONUS+ — ПОЛНЫЙ ТЕХНИЧЕСКИЙ БРИФ
## Для продолжения разработки в новом чате

---

## 1. ЧТО ЭТО ТАКОЕ

**S Bonus** — бонусная система лояльности для магазина **Смарт Центр** (Кыргызстан, KGS).
Полный стек: FastAPI backend + 3 Next.js/Expo фронтенда + PostgreSQL + Redis.
VPS deploy через Docker Compose, Nginx reverse proxy.

**Домены (prod):**
- API: `api.smartcentr.store` → 127.0.0.1:18800
- Admin: `admin.smartcentr.store` → 127.0.0.1:18801
- Client cabinet: `bonus.smartcentr.store` → 127.0.0.1:18802
- POS/Cashier: `pos.smartcentr.store` → 127.0.0.1:18803

**Git:** `https://github.com/doniponis5-creator/Bonus-` (ветка main)

---

## 2. АРХИТЕКТУРА

```
Bonus+/
├── sbonus-backend/          # FastAPI (Python 3.11)
├── sbonus-admin/            # Next.js 14 Admin panel
├── sbonus-client/           # Next.js 14 Client cabinet  
├── sbonus-cashier-app/      # Expo (React Native) → Web build
├── docker-compose.prod.yml  # Production Docker stack
└── .env.production          # ТОЛЬКО НА VPS (/opt/sbonus)
```

### Docker Services (docker-compose.prod.yml):
| Service | Container | Port (127.0.0.1) |
|---------|-----------|-------------------|
| db | sbonus_db | PostgreSQL 15 (internal) |
| redis | sbonus_redis | Redis 7 (internal, password) |
| api | sbonus_api | :18800 → :8000 |
| admin | sbonus_admin | :18801 → :3000 |
| client | sbonus_client | :18802 → :3000 |
| pos | sbonus_pos | :18803 → :3000 |

### Volumes:
- `sbonus_pgdata` — PostgreSQL data
- `sbonus_redisdata` — Redis data
- `sbonus_keys` — RSA JWT keys (private.pem, public.pem)

---

## 3. BACKEND СТРУКТУРА

### Файлы:
```
sbonus-backend/app/
├── main.py                    # FastAPI entry + APScheduler (11 cron jobs)
├── api/v1/
│   ├── __init__.py            # Router aggregation (13 sub-routers)
│   ├── auth.py                # JWT login/refresh (admin + cashier)
│   ├── bonus.py               # Earn/spend/check
│   ├── customer.py            # Single customer ops
│   ├── customers.py           # Admin customer CRUD + bulk
│   ├── customer_auth.py       # Client magic-link auth
│   ├── campaigns.py           # Bonus campaigns
│   ├── cashier_bonus.py       # Cashier milestone bonuses
│   ├── admin.py               # Dashboard, settings, tiers, promo, branches
│   ├── webhook.py             # 1C webhook (HMAC protected)
│   ├── wheel.py               # Fortune wheel spin + admin config
│   ├── telegram.py            # Telegram bot settings API
│   └── wa_broadcast.py        # WhatsApp broadcast API
├── services/
│   ├── bonus.py               # Core bonus logic (earn/spend/refund)
│   ├── cashier_bonus.py       # Cashier milestone calculation
│   ├── campaign_runner.py     # Campaign execution
│   ├── whatsapp.py            # WhatsApp Green API wrapper
│   ├── greenapi.py            # Low-level Green API client
│   ├── wa_broadcast.py        # WA broadcast + auto-triggers
│   ├── audit.py               # Audit logging
│   └── telegram_bot.py        # Telegram bot (commands, reports, polling)
├── models/__init__.py         # All SQLAlchemy models (19 моделей)
├── schemas/__init__.py        # All Pydantic schemas
├── core/
│   ├── config.py              # Pydantic Settings (env vars)
│   ├── database.py            # AsyncPG engine + sessions
│   ├── redis.py               # Redis client
│   ├── security.py            # JWT RSA + password hashing
│   └── logging.py             # Structured logging
├── tasks/                     # Cron jobs
│   ├── campaigns.py           # 09:00 daily
│   ├── expiration.py          # 02:00 expire, 10:00 warn
│   ├── notification_retry.py  # every 15 min
│   ├── weekly_report.py       # Mon 08:00
│   ├── balance_reminder.py    # 12:00 daily
│   └── birthday.py
└── seeds/
    ├── tiers.py               # Bronze/Silver/Gold/Platinum
    └── defaults.py
```

### 11 Cron Jobs (APScheduler):
| Job | Schedule | Description |
|-----|----------|-------------|
| bonus_campaigns | 09:00 daily | Process due campaigns |
| bonus_expiration | 02:00 daily | Expire old bonuses (365 days) |
| bonus_expiration_warning | 10:00 daily | Warn expiring bonuses |
| notification_retry | every 15 min | Retry failed WA notifications |
| weekly_report | Mon 08:00 | Weekly WA report |
| balance_reminder | 12:00 daily | WA reminder to inactive |
| wa_sleeping_trigger | 11:00 daily | Auto WA to sleeping customers |
| wa_birthday_trigger | 09:30 daily | Auto WA birthday greetings |
| tg_morning_report | 09:00 daily | Telegram stats for owner |
| tg_evening_report | 21:00 daily | Telegram day summary |
| tg_polling | background task | Process /commands via long polling |

### Key Models:
- **Customer** — phone, full_name, birth_date, referral_code, tier_id
- **BonusAccount** — balance, total_earned, total_spent, free_spins
- **Transaction** — type (earn/spend/refund/expire/admin/promo/referral), amount, purchase_amount
- **Tier** — name, min_total_earned, earn_percent (Bronze 3%, Silver 5%, Gold 7%, Platinum 10%)
- **BonusCampaign** — name, campaign_type (bonus/wheel), target_type (all/individual)
- **Coupon** — title, bonus_amount, min_purchase, customer_id, expires_at
- **ReviewRequest** — platform (google/2gis), status (pending/approved/rejected)
- **AuditLog** — action, entity_type, entity_id, user_id, details (JSONB), ip_address
- **Setting** — key/value store for dynamic config (telegram_bot, wa_auto_triggers, etc.)
- **Notification** — channel (whatsapp), status (sent/failed), retry_count

### Auth:
- **JWT RS256** (RSA keys in Docker volume)
- Admin: email + password → access_token (15 min) + refresh_token (30 days)
- Cashier: username + password
- Client: magic link via WhatsApp (token in URL)
- **2FA PIN** for admin (sensitive operations)
- Cookie `admin_token` + localStorage for persistence
- Next.js middleware checks cookie, redirects to /login if missing

---

## 4. ADMIN PANEL СТРУКТУРА

### Страницы (18 routes):
```
sbonus-admin/app/(dashboard)/
├── page.tsx              # Dashboard (stats + charts)
├── analytics/page.tsx    # Deep analytics
├── customers/page.tsx    # Customer management + bulk actions
├── transactions/page.tsx # Transaction history + reversal
├── cashiers/page.tsx     # Cashier CRUD
├── branches/page.tsx     # Branch CRUD
├── tiers/page.tsx        # Tier config
├── promo-codes/page.tsx  # Promo codes
├── coupons/page.tsx      # Smart coupons
├── campaigns/page.tsx    # Bonus campaigns
├── campaigns/[id]/page.tsx
├── cashier-bonuses/page.tsx # Cashier motivation
├── wheel-settings/page.tsx  # Fortune wheel config
├── reviews/page.tsx      # Review bonus management
├── audit-logs/page.tsx   # Audit journal (premium UI)
├── settings/page.tsx     # System settings
├── telegram/page.tsx     # Telegram bot settings
├── wa-broadcast/page.tsx # WhatsApp broadcast
└── layout.tsx            # Sidebar layout
```

### Components:
- `Sidebar.tsx` — навигация (18 пунктов)
- `Toast.tsx` — `useToast()` возвращает `{ toast, confirm }`. ВАЖНО: `const { toast } = useToast()` (НЕ `const toast = useToast()`)
- `DataTable.tsx`, `StatsCard.tsx`, `ExportButton.tsx`, `PinConfirmModal.tsx`

### API Client (`lib/api.ts`):
- `authAPI.login(email, password)`
- `adminAPI.*` — все admin endpoints
- `customersAPI.*` — customer operations
- Axios interceptors: auto Bearer token, 401 → refresh → retry/logout
- Cookie sync: `admin_token` cookie обновляется при refresh

### Design Language:
- Dark theme: `#0d1117` background, `#1c2a3a` borders, `#e2eaf6` text
- Accent: `#ffd60a` (yellow/gold)
- Success: `#22c55e`, Danger: `#ef4444`, Info: `#60a5fa`
- Cards: `border-radius: 16px`, inline styles (no CSS modules)
- Icons: lucide-react (NO emojis в UI)

---

## 5. CLIENT CABINET

```
sbonus-client/
├── app/
│   ├── page.tsx          # Main dashboard
│   ├── auth/page.tsx     # Magic-link entry
│   └── login/page.tsx    # Login
├── components/
│   ├── BalanceCard.tsx    # Bonus balance
│   ├── QRModal.tsx       # QR for cashier scan
│   ├── TransactionList.tsx
│   ├── DebtCard.tsx      # 1C debts
│   ├── MyCoupons.tsx     # Personal coupons
│   ├── ReviewBonus.tsx   # Review for bonus
│   ├── Leaderboard.tsx   # TOP-10 monthly
│   ├── BonusWheel.tsx    # Fortune wheel
│   └── PWAInstall.tsx    # PWA install prompt
└── lib/
    ├── api.ts
    └── auth.ts
```

---

## 6. DEPLOY ПРОЦЕДУРА

### На VPS (/opt/sbonus):
```bash
cd /opt/sbonus

# ВАЖНО: .env.production ТОЛЬКО на VPS, не в git
# Содержит: DATABASE_URL, POSTGRES_PASSWORD, REDIS_PASSWORD, 
# GREENAPI_*, JWT пути, CORS origins, ADMIN_API_URL, CLIENT_API_URL, POS_API_URL

# Стандартный deploy:
git pull
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build api admin

# Если нужно перезапустить ВСЁ (ломается polling/duplicates):
docker compose -f docker-compose.prod.yml --env-file .env.production down
git pull
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build api admin

# Очистка old images:
docker image prune -f

# Логи:
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml logs -f admin
```

### КРИТИЧЕСКИ ВАЖНО:
- **ВСЕГДА** использовать `--env-file .env.production` — без него NEXT_PUBLIC_API_URL будет пустым и фронт сломается (CORS error, localhost:8000)
- Для фронтенда: `NEXT_PUBLIC_API_URL` передаётся как build arg, так что `--build` обязателен при изменении фронтенда
- `.env.production` **НЕ в git** — только на VPS

---

## 7. ЧТО БЫЛО СДЕЛАНО (последние сессии)

### Audit System (DONE):
- `log_audit()` вызывается во всех admin endpoints
- Premium audit-logs page с фильтрами, цветными badges, expandable JSON details

### Telegram Owner Bot (DONE, deployed):
- `services/telegram_bot.py` — чистый httpx (без зависимостей)
- Команды: /start, /stats, /today, /week, /top, /help
- Алерты: крупное списание (>5K), крупная покупка (>50K), возвраты, новые клиенты
- Cron: утренний (09:00) и вечерний (21:00) отчёты
- Polling с Redis lock (защита от дубликатов при нескольких контейнерах)
- Admin UI: telegram/page.tsx — настройки бота, тоглы уведомлений

### WhatsApp Broadcast (BACKEND DONE, UI НАПИСАН):
- `services/wa_broadcast.py` — 7 сегментов (all, sleeping, vip, new, birthday, high_balance, low_balance)
- `api/v1/wa_broadcast.py` — segments, preview, send, triggers CRUD
- Auto-triggers: sleeping (11:00) + birthday (09:30) cron jobs
- Admin UI: `wa-broadcast/page.tsx` — две вкладки (Рассылка + Авто-триггеры)
- API в `lib/api.ts`: waBroadcastSegments, waBroadcastPreview, waBroadcastSend, waTriggersConfig, updateWaTriggersConfig

### Cashier Motivation (DONE):
- Milestone bonuses для кассиров
- Admin: настройка milestone порогов + дашборд прогресса

### Fortune Wheel (DONE):
- Admin-configurable segments (amounts, probabilities)
- Free spins для новых клиентов
- Campaign type "wheel" для массовой раздачи спинов
- Race condition protection (Redis lock)

---

## 8. ЧТО НУЖНО СДЕЛАТЬ (PENDING)

### 1. PUSH + DEPLOY текущих изменений
Локальные файлы изменены но НЕ в git:
- `telegram/page.tsx` — fix `const { toast } = useToast()`
- `wa-broadcast/page.tsx` — новая страница
- `telegram_bot.py` — long polling + Redis lock

```bash
# На локальной машине:
cd ~/Bonus+
git add -A
git commit -m "fix: useToast, wa-broadcast page, tg bot Redis lock"
git push

# На VPS:
cd /opt/sbonus
docker compose -f docker-compose.prod.yml --env-file .env.production down
git pull
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build api admin
```

### 2. Telegram бот — /top и /today не отвечают
После deploy с Redis lock нужно протестировать все команды.
Баг дубликатов (два сообщения) должен быть пофикшен Redis lock-ом.

### 3. Client Telegram Bot (НЕ НАЧАТ)
Полный клиентский кабинет через Telegram бот:
- Баланс, история транзакций
- Мои купоны
- Колесо удачи (спин через бот)
- Реферальная ссылка

### 4. Тест WhatsApp рассылки в админке
После deploy открыть admin.smartcentr.store/wa-broadcast и протестировать:
- Загрузка сегментов
- Предпросмотр
- Отправка (осторожно — реальные сообщения)
- Авто-триггеры: сохранение настроек

---

## 9. ЧАСТЫЕ ОШИБКИ И РЕШЕНИЯ

| Проблема | Причина | Решение |
|----------|---------|---------|
| CORS error (localhost:8000) | Нет `--env-file .env.production` | Добавить флаг в docker compose |
| `useToast()` type error | `const toast = useToast()` | Нужно `const { toast } = useToast()` |
| Telegram дубликаты | Два API контейнера | `docker compose down` + `up` |
| Admin белый экран | Build failed | Проверить `docker compose logs admin` |
| Audit logs пусто | Таблица новая | Сделать действие в админке — запись появится |
| Git index.lock | Прерванная операция | `rm .git/index.lock` |

---

## 10. СТИЛЬ КОДА И ПРАВИЛА

### Backend:
- Python 3.11, FastAPI, SQLAlchemy 2.0 (async), Pydantic v2
- Все модели в одном файле `models/__init__.py`
- Audit logging: `await log_audit(db, action, entity_type, entity_id, user_id, details, ip)`
- Settings: key-value в таблице `Setting` (JSON в value)
- WhatsApp: Green API через `greenapi.py`

### Frontend:
- Next.js 14 App Router, TypeScript
- Inline styles (НЕ CSS modules, НЕ Tailwind)
- Icons: lucide-react (НЕ emojis)
- Toast: `const { toast } = useToast()` → `toast('success', 'message')` или `toast('error', 'msg')`
- API: axios instance в `lib/api.ts` с interceptors
- Dark theme цвета: bg `#0d1117`, border `#1c2a3a`, text `#e2eaf6`, accent `#ffd60a`

### Принципы:
- Минимальные правки, не ломать существующее
- Prefer native solutions перед зависимостями
- Production-grade, не demo код
- Русский язык в UI (все тексты на русском)
- NO emojis в UI — только lucide-react icons
