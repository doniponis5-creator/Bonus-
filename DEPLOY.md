# S Bonus — Production Deploy Guide

VPS'ga (Hostinger Ubuntu 22.04) deploy qilish bo'yicha qadamlar.

## Talablar

- Ubuntu 22.04+ VPS (sizda bor)
- Docker 20+ va Docker Compose v2 (sizda bor)
- Nginx (sizda bor)
- Certbot (sizda bor)
- 3 ta subdomen + DNS A records:
  - `api.smartcentr.store`
  - `admin.smartcentr.store`
  - `cabinet.smartcentr.store`

## Tanlangan portlar (boshqa loyihalar bilan kesishmaydi)

| Servis | Port | Bind |
|---|---|---|
| Backend (FastAPI) | `127.0.0.1:18800` | localhost only |
| Admin panel | `127.0.0.1:18801` | localhost only |
| Mijoz kabineti | `127.0.0.1:18802` | localhost only |
| PostgreSQL | Docker ichida | — |
| Redis | Docker ichida | — |

Hammasi **faqat localhost'da** ochiq — tashqaridan to'g'ridan-to'g'ri ulanishi mumkin emas. Hammasi Nginx orqali.

## Qadamlar

### 1. Clone

```bash
cd /opt
sudo git clone https://github.com/doniponis5-creator/Bonus-.git sbonus
sudo chown -R $USER:$USER sbonus
cd sbonus
```

### 2. Production .env

```bash
cp .env.production.example .env.production
nano .env.production
```

Quyidagilarni o'zgartiring:
- `POSTGRES_PASSWORD` — kuchli parol (~32 belgi)
- `WEBHOOK_1C_SECRET` — random 64 belgi (`openssl rand -hex 32`)
- `GREENAPI_INSTANCE_ID`, `GREENAPI_API_TOKEN` — Green API'dan
- `ENABLE_WHATSAPP_NOTIFICATIONS=true`

### 3. Build va run

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Birinchi build ~5-10 daqiqa. Statusni tekshirish:

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f api
```

### 4. Migration

Birinchi marta backend ko'tarilganda Alembic migration avtomatik o'tadi (`entrypoint.sh` orqali). Tekshirish:

```bash
docker compose -f docker-compose.prod.yml exec api alembic current
# 0002 chiqishi kerak
```

### 5. Nginx config

Quyidagi 3 ta server block'ni `/etc/nginx/sites-available/sbonus.conf` ga qo'shing va `/etc/nginx/sites-enabled/`ga symlink qiling:

```nginx
# API
server {
  listen 80;
  server_name api.smartcentr.store;
  location / {
    proxy_pass http://127.0.0.1:18800;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}

# Admin
server {
  listen 80;
  server_name admin.smartcentr.store;
  location / {
    proxy_pass http://127.0.0.1:18801;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}

# Cabinet
server {
  listen 80;
  server_name cabinet.smartcentr.store;
  location / {
    proxy_pass http://127.0.0.1:18802;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/sbonus.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 6. SSL (Let's Encrypt)

```bash
sudo certbot --nginx \
  -d api.smartcentr.store \
  -d admin.smartcentr.store \
  -d cabinet.smartcentr.store
```

### 7. Yangilanishlar (keyingi deploy)

```bash
cd /opt/sbonus
git pull
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

## Backup

Kunlik PostgreSQL dump:

```bash
echo "0 3 * * * docker exec sbonus_db pg_dump -U sbonus sbonus_db | gzip > /opt/sbonus-backups/db-\$(date +\%Y\%m\%d).sql.gz" | crontab -
```

## Foydali buyruqlar

```bash
# Loglar
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml logs -f admin
docker compose -f docker-compose.prod.yml logs -f client

# Restart
docker compose -f docker-compose.prod.yml restart api

# To'liq tushirish
docker compose -f docker-compose.prod.yml down

# Migration qo'lda
docker compose -f docker-compose.prod.yml exec api alembic upgrade head
```
