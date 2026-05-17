# 🧠 BONUS+ LOYIHA — TO'LIQ MEMORY HUJJATI
> Boshqa AI uchun. Bu hujjatni to'liq o'qib loyihaga qo'shilishdan oldin qat'iy qoidalarni o'rganish MAJBURIY.

---

## 📌 QATIY QOIDALAR (HECH QACHON BUZMANG)

1. **HECH QACHON** `.env` faylini o'zgartirmang, faqat `.env.example` ko'ring
2. **HECH QACHON** `app/models/__init__.py` dagi modellarni o'zgartirmang — faqat Alembic migration orqali
3. **HECH QACHON** `transactions` jadvaliga UPDATE yoki DELETE so'rovi yozmang — u IMMUTABLE (PostgreSQL trigger bilan himoyalangan)
4. **HECH QACHON** `requirements.txt` versiyalarini o'zgartirmang — production muhit bilan mos
5. **HECH QACHON** `lucide-react` o'rniga emoji ishlatmang (eski bugni qaytarmang)
6. **HECH QACHON** `setMsg()` ga JSX yozmang — string prefix: `success:...` yoki `error:...`
7. **HECH QACHON** `db.commit()` ni unutmang — har bir write operatsiyadan keyin MAJBURIY
8. **HECH QACHON** autentifikatsiyasiz endpoint ochma — hamma route `Depends(get_current_user)` yoki `Depends(require_role(...))` talab qiladi
9. **HECH QACHON** `node_modules/`, `.env`, `.next/`, `keys/` fayllarini commitlama
10. **DOIM** kassa ilovasida IP manzilni `EXPO_PUBLIC_API_URL` env orqali olish kerak — hardcode qilma

---

## 🏗️ LOYIHA TUZILMASI

```
/Users/doniyorabduganiev/Bonus+
├── sbonus-backend/          # FastAPI backend (Python)
├── sbonus-admin/            # Next.js Admin panel (TypeScript) — port 3000
├── sbonus-client/           # Next.js Личный кабинет клиента (TypeScript) — port 3001
├── sbonus-cashier-app/      # Expo React Native (TypeScript)
└── sbonus_plus_architecture.html
```

**GitHub:** `https://github.com/doniponis5-creator/Bonus-.git`  
**Branch:** `main`

---

## 🛒 BIZNES KONTEKST

- **Do'kon:** Смарт Центр (Ош, Кыргызстан)
- **Tizim:** S Bonus — loyallik bonus tizimi
- **Valyuta:** KGS (Кыргызский сом)
- **Til:** Interfeys Ruscha, bildirishnomalar Ruscha/Qirg'izcha
- **Adres:** Ошская обл., Аравандский р-н, ул. Ош-3000, 86
- **Telefon:** +996557100505

### Bonus Qoidalari
| Qoida | Qiymat |
|---|---|
| Minimum xarid bonusi uchun | 500 KGS |
| Maksimal yechish (xariddan %) | 30% |
| Tug'ilgan kun bonusi | 200 KGS |
| Referral — taklif qiluvchiga | 100 KGS |
| Referral — yangi mijozga | 50 KGS |

### Tier Tizimi
| Tier | Min. xaridlar | Bonus % |
|---|---|---|
| Bronze | 0 KGS | 3% |
| Silver | 15,000 KGS | 5% |
| Gold | 50,000 KGS | 7% |
| Platinum | 150,000 KGS | 10% |

---

## ⚙️ BACKEND — sbonus-backend

### Tech Stack
- **Framework:** FastAPI 0.115.0
- **DB:** PostgreSQL 15 (asyncpg + SQLAlchemy 2.0 async)
- **Cache/Sessions:** Redis 7
- **Auth:** JWT RS256 (python-jose) + bcrypt (passlib)
- **Migrations:** Alembic
- **Scheduler:** APScheduler (birthday cron 09:00)
- **WhatsApp:** GreenAPI (httpx)
- **Export:** openpyxl (Excel), CSV
- **Run:** Docker Compose (`docker compose up -d`)

### Muhim Fayllar
```
sbonus-backend/
├── app/
│   ├── main.py              # FastAPI entry, lifespan, CORS, scheduler
│   ├── models/__init__.py   # BARCHA DB modellari (o'zgartirmang!)
│   ├── schemas/__init__.py  # Pydantic schemalar
│   ├── api/v1/
│   │   ├── admin.py         # Admin endpoints
│   │   ├── auth.py          # Login/logout/refresh
│   │   ├── bonus.py         # Earn/spend/promo/referral
│   │   ├── customers.py     # Register/search/balance
│   │   └── webhook.py       # 1C integratsiya
│   ├── core/
│   │   ├── config.py        # Settings (pydantic-settings)
│   │   ├── database.py      # AsyncSession, Base
│   │   ├── redis.py         # Redis client, blacklist, rate limit
│   │   └── security.py      # JWT, RBAC, hash_password
│   ├── services/
│   │   ├── bonus.py         # BonusService — barcha bonus logika
│   │   └── whatsapp.py      # GreenAPI integratsiya
│   ├── seeds/
│   │   ├── defaults.py      # Default admin + filial yaratadi
│   │   └── tiers.py         # Bronze/Silver/Gold/Platinum yaratadi
│   └── tasks/
│       └── birthday.py      # Cron: tug'ilgan kun bonuslari
├── migrations/              # Alembic migrations
├── docker-compose.yml       # PostgreSQL + Redis + FastAPI
├── Dockerfile
├── entrypoint.sh            # RSA keys generate + alembic migrate + uvicorn
└── requirements.txt
```

### Default Admin (birinchi ishga tushganda avtomatik yaratiladi)
```
Email:    admin@smartcenter.kg
Parol:    admin123
Rol:      SUPER_ADMIN
```

### Rollar (RBAC)
- `super_admin` — hamma narsa
- `branch_admin` — filial boshqarish
- `cashier` — faqat kassa operatsiyalari (Kassa ilovasiga kiradi)

### Barcha API Endpointlar

#### Auth
```
POST /api/v1/auth/admin/login      # email + password → JWT
POST /api/v1/auth/cashier/login    # phone + PIN → JWT
POST /api/v1/auth/refresh          # refresh_token → yangi access_token
POST /api/v1/auth/logout           # blacklist token
```

#### Admin
```
GET  /api/v1/admin/dashboard/stats
GET  /api/v1/admin/tiers
POST /api/v1/admin/tiers
GET  /api/v1/admin/promo-codes?page=1&limit=50
POST /api/v1/admin/promo-codes
GET  /api/v1/admin/branches
POST /api/v1/admin/branches
GET  /api/v1/admin/cashiers
POST /api/v1/admin/cashiers
GET  /api/v1/admin/customers?search=&page=1&limit=50
PUT  /api/v1/admin/customers/{id}
POST /api/v1/admin/customers/{id}/bonus/earn
POST /api/v1/admin/customers/{id}/bonus/spend
GET  /api/v1/admin/transactions?page=1&per_page=50&tx_type=
GET  /api/v1/admin/audit-logs?page=1
GET  /api/v1/admin/reports/export?format=csv|xlsx&days=30
GET  /api/v1/admin/settings
POST /api/v1/admin/settings
POST /api/v1/admin/settings/test-whatsapp?phone=996...
```

#### Customers (Kassa uchun ham)
```
POST /api/v1/customers/register
GET  /api/v1/customers/by-phone/{phone}
GET  /api/v1/customers/by-qr/{qr_code}
GET  /api/v1/customers/{id}/balance
GET  /api/v1/customers/{id}/transactions?page=1&per_page=20
```

#### Bonus (faqat autentifikatsiyalangan)
```
POST /api/v1/bonus/earn        # {customer_id, purchase_amount, branch_id}
POST /api/v1/bonus/spend       # {customer_id, spend_amount, purchase_amount, branch_id}
POST /api/v1/bonus/check-spend # {customer_id, purchase_amount}
POST /api/v1/bonus/birthday    # customer_id (query param)
POST /api/v1/bonus/referral/apply
POST /api/v1/bonus/promo/apply
```

#### Webhook (1C)
```
POST /api/v1/webhook/1c/purchase
POST /api/v1/webhook/1c/spend
POST /api/v1/webhook/1c/refund
POST /api/v1/webhook/1c/register
POST /api/v1/webhook/1c/debt-update   # Обновление задолженности из 1С
POST /api/v1/webhook/greenapi         # WhatsApp webhook
```

#### Личный кабинет клиента (magic-link auth)
```
POST /api/v1/customer-auth/request-link             # phone → magic link через WhatsApp
POST /api/v1/customer-auth/verify                   # token → JWT (30 дней, role=customer)
POST /api/v1/customer-auth/send-link-by-cashier/{id}  # кассир инициирует отправку
GET  /api/v1/customer/me                            # дашборд: баланс, тиер, долг 1С, последние 5 операций
```

### DB Modellari (o'zgartirmang!)
- `Tier` — bonus darajalari
- `Branch` — filiallar
- `Customer` — mijozlar (phone unique, qr_code unique, referral_code unique)
- `BonusAccount` — 1-to-1 Customer bilan, balance/total_earned/total_spent
- `Transaction` — IMMUTABLE, bonus operatsiyalari
- `User` — adminlar + kassirlar (email unique, phone unique)
- `PromoCode` — promokodlar
- `AuditLog` — audit jurnal
- `Setting` — key-value sozlamalar (GreenAPI, 1C togglelar)
- `CustomerAuthToken` — magic-link tokenlar (15 daqiqa, bir martalik)
- `CustomerDebt` — 1C qarz tarixi (har push alohida yozuv)

### TransactionType enum
`earn | spend | expire | refund | birthday | referral | promo`

---

## 🖥️ ADMIN PANEL — sbonus-admin

### Tech Stack
- **Framework:** Next.js 14.2.5 (App Router)
- **Stil:** Vanilla CSS (globals.css) + inline styles
- **Ikonlar:** `lucide-react` ^0.400.0 (EMOJI ISHLATMANG!)
- **HTTP:** axios ^1.7.0
- **Port:** 3000
- **Run:** `npm run dev`

### Muhim Fayllar
```
sbonus-admin/
├── app/
│   ├── layout.tsx              # Root layout, Google Fonts Inter
│   ├── globals.css             # Design system (CSS variables)
│   ├── (auth)/login/page.tsx   # Login sahifasi
│   └── (dashboard)/
│       ├── layout.tsx          # Auth guard + Sidebar
│       ├── page.tsx            # Dashboard (statistika)
│       ├── customers/page.tsx  # Mijozlar + modal
│       ├── transactions/page.tsx
│       ├── branches/page.tsx
│       ├── cashiers/page.tsx
│       ├── tiers/page.tsx
│       ├── promo-codes/page.tsx
│       └── settings/page.tsx   # WhatsApp + 1C sozlamalar
├── components/
│   ├── Sidebar.tsx             # Nav (lucide-react ikonlar)
│   ├── StatsCard.tsx           # Dashboard kartochkasi
│   ├── ExportButton.tsx        # CSV/Excel yuklab olish
│   └── DataTable.tsx
├── lib/
│   └── api.ts                  # Axios instance + barcha API funksiyalar
└── .env.local                  # NEXT_PUBLIC_API_URL=http://localhost:8000
```

### Design System (globals.css CSS Variables)
```css
--bg: #0a0f1a      /* asosiy fon */
--bg2: #111827     /* ikkinchi fon */
--bg3: #1a2332
--card: #141c2b    /* karta foni */
--border: #1e293b
--accent: #00E5A0  /* yashil aksent */
--accent2: #00B8D4 /* ko'k aksent */
--accent3: #7C6FFF /* binafsha */
--text: #e2eaf6
--text2: #8899aa
--text3: #556677
--danger: #ef4444
--warn: #f59e0b
```

### CSS Klasslar
`.card`, `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.input`, `.table`, `.badge`, `.badge-green`, `.badge-red`, `.grid-4`, `.grid-3`, `.grid-2`

### Auth Oqimi
1. Token `localStorage.getItem('admin_token')`
2. 401 bo'lsa → `/login` ga redirect
3. Token JWT RS256 (15 daqiqa, refresh 30 kun)
4. Logout: `localStorage.removeItem('admin_token')`

### API Client (lib/api.ts)
```typescript
export const authAPI = { login }
export const adminAPI = { stats, tiers, createTier, promoCodes, createPromo,
  transactions, auditLogs, cashiers, createCashier, branches, createBranch, exportReport }
export const customersAPI = { byPhone, balance, transactions, list, update, adminEarn, adminSpend }
export default api  // axios instance
```

---

## 👤 МИJOZ KABINETI — sbonus-client

### Tech Stack
- **Framework:** Next.js 14.2.5 (App Router)
- **Port:** 3001
- **Stil:** Admin design system reuse (dark theme, `#0a0f1a`, `#00E5A0`)
- **Ikonlar:** `lucide-react`
- **QR:** `qrcode.react` ^4.0.1
- **HTTP:** axios + JWT (localStorage `sbonus_client_token`)
- **PWA:** `manifest.json` mavjud (home screen'ga qo'shish mumkin)
- **Run:** `npm run dev` → `http://localhost:3001`

### Auth oqimi (magic-link)
1. Mijoz `/login` ga kiradi, telefon raqamini kiritadi
2. Backend `customer_auth_tokens` ga 15-daqiqalik token yozadi, WhatsApp'ga link yuboradi:
   `http://localhost:3001/auth?token=<urlsafe>`
3. Link bosilganda `/auth` sahifasi `POST /customer-auth/verify` chaqiradi
4. Backend JWT (30 kun, role=customer) qaytaradi, `localStorage`'ga saqlanadi
5. `/` dashboard'ga redirect

### Muhim Fayllar
```
sbonus-client/
├── app/
│   ├── layout.tsx              # Inter font, PWA metadata
│   ├── globals.css             # Mobile-first dark theme
│   ├── login/page.tsx          # Phone input → request-link
│   ├── auth/page.tsx           # ?token=xxx → verify → redirect
│   └── page.tsx                # Dashboard (auth guard)
├── components/
│   ├── BalanceCard.tsx         # Bonus balans + tier progress
│   ├── DebtCard.tsx            # 1C qarz (0 bo'lsa yashil ✓)
│   ├── QRModal.tsx             # Kassada ko'rsatish uchun QR
│   └── TransactionList.tsx     # Oxirgi 5 operatsiya
├── lib/
│   ├── api.ts                  # axios + JWT interceptor + 401 → /login
│   └── auth.ts                 # Token saqlash + isTokenValid(exp tekshiruvi)
├── public/manifest.json        # PWA
└── .env.example                # NEXT_PUBLIC_API_URL=http://localhost:8000
```

### Backend talab qiladigan Setting'lar
- `GREENAPI_INSTANCE_ID`, `GREENAPI_API_TOKEN`, `ENABLE_WHATSAPP_NOTIFICATIONS=true` — magic-link yuborish uchun
- Agar WhatsApp sozlanmagan bo'lsa, link console.log'da yoziladi (dev fallback)

### Config'ga qo'shilgan settings (app/core/config.py)
- `customer_cabinet_base_url: str = "http://localhost:3001"` — magic-link domeni
- `customer_token_expire_days: int = 30`
- `customer_magic_link_expire_minutes: int = 15`

---

## 📱 KASSA ILOVASI — sbonus-cashier-app

### Tech Stack
- **Framework:** Expo ~54.0.0 (React Native 0.81.5)
- **Navigation:** @react-navigation/native + native-stack
- **State:** Zustand ^4.5.0
- **HTTP:** axios ^1.7.0 + AsyncStorage token
- **Query:** @tanstack/react-query ^5.50.0
- **QR:** react-native-qrcode-svg, expo-camera
- **Run:** `npm start` (Expo Go yoki simulator)

### Muhim Fayllar
```
sbonus-cashier-app/
├── api/client.ts           # Axios + JWT interceptor + auto refresh
├── store/auth.ts           # Zustand auth store
├── constants/theme.ts      # COLORS, TIER_COLORS, formatKGS()
├── app/
│   ├── (auth)/login.tsx    # Telefon + 4 xonali PIN
│   └── (main)/
│       ├── dashboard.tsx   # Asosiy ekran: qidirish + ro'yxat
│       ├── search.tsx      # Telefon yoki QR bilan qidirish
│       ├── customer/[id].tsx # Mijoz kartasi + QR ko'rsatish
│       ├── earn.tsx        # Bonus yozish (min 500 KGS)
│       ├── spend.tsx       # Bonus yechish (max 30%)
│       ├── register.tsx    # Yangi mijoz ro'yxatga olish
│       └── history.tsx     # Tranzaksiya tarixi
└── components/
    ├── CustomerCard.tsx
    ├── QRScanner.tsx       # expo-camera bilan QR scan
    ├── SuccessModal.tsx
    └── TierBadge.tsx
```

### Kassa Login
- Kirish: telefon raqam + 4 xonali PIN
- Token `AsyncStorage`da saqlanadi (`access_token`, `refresh_token`)
- 401 bo'lsa → avtomatik refresh → muvaffaqiyatsiz bo'lsa Login ga

### .env fayl (YARATISH KERAK!)
```env
EXPO_PUBLIC_API_URL=http://192.168.0.121:8000
```
> ⚠️ Hozir IP hardcoded — `api/client.ts` 14-qatorda `http://192.168.0.121:8000`

---

## 🐛 BUGLAR (TUZATILGAN — 2026-05-17)

### 🔴 KRITIK — Tuzatildi ✅

**Bug 1 ✅:** `transactions/page.tsx` — TYPE_LABELS dan JSX matn olib tashlandi, `Icon` field qo'shildi, jadval cellida ikon + matn alohida render qilinadi.

**Bug 2 ✅:** `cashiers/page.tsx:48` va `promo-codes/page.tsx:118` — `setMsg()` ga JSX yozish o'rniga `success:` / `error:` prefiks ishlatiladi, ikon `startsWith` orqali alohida render. Bonus: `promo-codes/page.tsx:122` quote escape syntax error ham tuzatildi.

**Bug 3 ✅:** `app/api/v1/admin.py` `update_settings` — `await db.commit()` qo'shildi, sozlamalar endi saqlanadi.

### 🟡 O'RTA — Tuzatildi ✅

**Bug 4 ✅:** Kassa `api/client.ts` — hardcoded `192.168.0.121` IP fallback olib tashlandi, `__DEV__` da `localhost:8000`, env yo'qligida `console.warn`. `.env.example` yaratildi.

**Bug 5 ✅:** `customers/page.tsx` — `loadCustomers(p, q)` parametrli, `goToPage(p)` helper, prev/next va search ham shu helper orqali ishlaydi. Bonus: 3 ta emoji (✏️➕➖) `lucide-react` ikonlariga (`Pencil`, `PlusCircle`, `MinusCircle`) almashtirildi, modal title'dagi JSX-in-string ham tozalandi.

**Bug 6 ✅:** `(dashboard)/layout.tsx` — `isTokenValid()` funksiyasi qo'shildi: JWT payload'ni base64 decode qilib `exp` ni tekshiradi, eskirgan token bo'lsa `localStorage` tozalanib login'ga yo'naltiradi.

### 🟢 BONUS (memory'da yo'q edi, lekin topildi va tuzatildi)

- `sbonus-cashier-app/app/(main)/history.tsx` — react-query v5 mos kelmasligi: `keepPreviousData: true` → `placeholderData: keepPreviousData` (import o'zgartirildi).

### ⚠️ HALI TUZATILMAGAN (scope tashqarisi)

- Kassa `history.tsx` da `TYPE_LABELS` emoji ishlatadi (💰💳🎂👥🎟↩️⏳) — qoida #5 ni buzadi. Tuzatish uchun `lucide-react-native` ikonlariga ko'chirish kerak (alohida task).

---

## 🚫 MAVJUD BO'LMAGAN FUNKSIYALAR (BACKEND BOR, UI YO'Q)

| Funksiya | Backend endpoint |
|---|---|
| Audit log sahifasi | `GET /api/v1/admin/audit-logs` ✅ |
| Kassirni o'chirish | — |
| Mijozni bloklash | `is_active` field bor |
| Kassa: promokod qo'llash | `POST /api/v1/bonus/promo/apply` ✅ |
| Kassa: referral qo'llash | `POST /api/v1/bonus/referral/apply` ✅ |
| Tug'ilgan kun bonusi UI | `POST /api/v1/bonus/birthday` ✅ |

---

## 🔧 LOCAL ISHGA TUSHIRISH

### Backend (Docker)
```bash
cd /Users/doniyorabduganiev/Bonus+/sbonus-backend
docker compose up -d
# API: http://localhost:8000
# Swagger: http://localhost:8000/docs
```

### Admin Panel
```bash
cd /Users/doniyorabduganiev/Bonus+/sbonus-admin
npm run dev
# http://localhost:3000
# Login: admin@smartcenter.kg / admin123
```

### Mijoz Kabineti
```bash
cd /Users/doniyorabduganiev/Bonus+/sbonus-client
npm install   # birinchi marta
npm run dev
# http://localhost:3001
# Kirish: telefon raqam → WhatsApp orqali link (yoki dev'da console.log'dan token)
```

### Kassa Ilovasi
```bash
cd /Users/doniyorabduganiev/Bonus+/sbonus-cashier-app
npm start
# Expo Go yoki iOS/Android simulator
```

---

## 🎨 DIZAYN QOIDALARI

1. **Faqat Dark Mode** — `#0a0f1a` asosiy fon
2. **Aksent rang** — `#00E5A0` (yashil) — hamma tugma, link, aktiv holatlar
3. **Ikonlar** — FAQAT `lucide-react` (admin) va `lucide-react-native` (kassa ilovasi). EMOJI ISHLATMANG!
4. **Font** — Inter (Google Fonts)
5. **Border radius** — kartalar `16px`, tugmalar `10px`, inputlar `10px`
6. **CSS** — globals.css variable'larini ishlatish, inline style faqat dinamik qiymatlar uchun
7. **Rang kodlari** — CSS variable orqali: `var(--accent)`, `var(--danger)` va h.k.

---

## 📊 TIZIM ARXITEKTURASI (QISQACHA)

```
[Kassa Ilovasi (Expo)] ──────────┐
[Mijoz Kabineti (Next.js :3001)] ─┤
[Admin Panel (Next.js :3000)] ────┼──► [FastAPI Backend :8000]
                                  │            │
                                  │    ┌───────┴────────┐
                                  │ [PostgreSQL 15]  [Redis 7]
                                  │            │
                                  │  [GreenAPI (WhatsApp)] — magic-link + bildirishnoma
                                  │  [1C Webhook] — purchase/spend/refund/debt-update
                                  └─ [APScheduler] — BD bonus cron 09:00
```

---

## 📝 LOYIHA HOLATI (2026-may)

- ✅ Backend to'liq ishlab turibdi
- ✅ Admin panel asosiy sahifalar ishlamoqda
- ✅ Kassa ilovasi asosiy oqim ishlamoqda
- ✅ JWT autentifikatsiya, RBAC, token blacklist
- ✅ WhatsApp GreenAPI integratsiya
- ✅ 1C Webhook integratsiya
- ✅ Tier avtomatik yangilanish
- ✅ Tug'ilgan kun cron (09:00 har kuni)
- ✅ GitHub: `doniponis5-creator/Bonus-` main branch
- ✅ 6 ta bug (3 kritik + 3 o'rta) tuzatildi — 2026-05-17
- ✅ Bonus: history.tsx react-query v5 mosligi tuzatildi
- ✅ Mijoz kabineti (sbonus-client) qo'shildi: magic-link auth (WhatsApp) + 1C qarz UI — 2026-05-17
- ✅ Audit log UI qo'shildi (admin /audit-logs) — 2026-05-17
- ✅ Admin: mijoz va kassirni bloklash/blokdan chiqarish — 2026-05-17
- ✅ Kassa: BD bonus + promokod + referral + "Mijozga kabinet linkini yuborish" tugmalari — 2026-05-17
- ✅ Kassa history.tsx emoji'lari `lucide-react-native` ikonlariga ko'chirildi — 2026-05-17
- ✅ Yangi backend endpointlar:
  - `PATCH /api/v1/admin/cashiers/{id}` — kassirni yangilash (block/unblock/PIN reset)
  - `POST /api/v1/customer-auth/send-link-by-cashier/{customer_id}` — kassir tomonidan link yuborish
  - Customer update endpointga `is_active` qo'shildi
  - `create_cashier` ichida `db.commit()` qo'shildi (oldindan mavjud bug)
- ❌ 1C dan haqiqiy `debt-update` webhook integratsiyasi hali yo'q — endpoint tayyor, 1C tarafi qo'shilishi kerak
- ✅ Kassa SuccessModal.tsx emoji'lari `lucide-react-native` ikonlariga ko'chirildi (CheckCircle2, XCircle, Wallet) — 2026-05-17
- ✅ Loyihadagi BARCHA UI emoji'lari `lucide-react` / `lucide-react-native` ikonlariga ko'chirildi — 2026-05-17
  - `sbonus-cashier-app/`: dashboard.tsx, spend.tsx, register.tsx, search.tsx, earn.tsx, (auth)/login.tsx, CustomerCard.tsx, QRScanner.tsx
  - `sbonus-admin/`: (dashboard)/page.tsx, tiers/page.tsx (medal'lar: Medal/Award/Trophy/Gem/Star), settings/page.tsx
  - `grep -rln '[✅❌💰🎂...]' app/ components/` natijasi: 0 ta moslik
  - 3 mikroservisda tsc toza, xato yo'q
