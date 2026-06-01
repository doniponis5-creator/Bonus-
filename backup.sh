#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# SBonus+ — Full VPS Backup Script
# Сервер: 145.223.100.16
# Автор: DonLee
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

# ── Config ──────────────────────────────────────────────────────
BACKUP_DIR="/opt/backups/sbonus"
PROJECT_DIR="/opt/sbonus"
DB_CONTAINER="sbonus_db"
DB_NAME="sbonus_db"
DB_USER="sbonus"
REDIS_CONTAINER="sbonus_redis"
KEEP_DAYS=7          # Хранить бэкапов (дней)
DATE=$(date +%Y-%m-%d_%H-%M)
CURRENT_BACKUP="$BACKUP_DIR/$DATE"

# ── Colors ──────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; }

echo ""
echo "═══════════════════════════════════════════════════"
echo "  SBonus+ Backup — $DATE"
echo "═══════════════════════════════════════════════════"
echo ""

# ── 1. Create backup directory ──────────────────────────────────
mkdir -p "$CURRENT_BACKUP"
log "Папка: $CURRENT_BACKUP"

# ── 2. PostgreSQL full dump ─────────────────────────────────────
log "PostgreSQL дамп начат..."
docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" \
  --format=custom --compress=9 \
  > "$CURRENT_BACKUP/sbonus_db.dump" 2>/dev/null

# Also plain SQL for emergency restore
docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" \
  --format=plain --no-owner --no-acl \
  | gzip > "$CURRENT_BACKUP/sbonus_db.sql.gz" 2>/dev/null

DB_SIZE=$(du -sh "$CURRENT_BACKUP/sbonus_db.dump" | cut -f1)
log "PostgreSQL дамп: $DB_SIZE"

# ── 3. Redis dump ───────────────────────────────────────────────
log "Redis дамп..."
docker exec "$REDIS_CONTAINER" redis-cli BGSAVE > /dev/null 2>&1 || true
sleep 2
docker cp "$REDIS_CONTAINER:/data/dump.rdb" "$CURRENT_BACKUP/redis_dump.rdb" 2>/dev/null || warn "Redis dump.rdb не найден (возможно пустой)"
log "Redis дамп завершён"

# ── 4. Environment files ────────────────────────────────────────
log "Конфиг файлы..."
cp "$PROJECT_DIR/.env.production" "$CURRENT_BACKUP/.env.production" 2>/dev/null || warn ".env.production не найден"
cp "$PROJECT_DIR/docker-compose.prod.yml" "$CURRENT_BACKUP/docker-compose.prod.yml" 2>/dev/null || true
log "Конфиги скопированы"

# ── 5. Nginx config + SSL ──────────────────────────────────────
log "Nginx + SSL..."
if [ -d /etc/nginx ]; then
  tar czf "$CURRENT_BACKUP/nginx_config.tar.gz" -C /etc nginx 2>/dev/null || warn "Nginx конфиг не скопирован"
fi
if [ -d /etc/letsencrypt ]; then
  tar czf "$CURRENT_BACKUP/letsencrypt.tar.gz" -C /etc letsencrypt 2>/dev/null || warn "SSL сертификаты не скопированы"
fi
log "Nginx + SSL завершён"

# ── 6. JWT RSA keys (Docker volume) ────────────────────────────
log "JWT ключи..."
KEYS_MOUNT=$(docker volume inspect sbonus_keys --format '{{.Mountpoint}}' 2>/dev/null || echo "")
if [ -n "$KEYS_MOUNT" ] && [ -d "$KEYS_MOUNT" ]; then
  tar czf "$CURRENT_BACKUP/jwt_keys.tar.gz" -C "$KEYS_MOUNT" . 2>/dev/null || warn "JWT ключи не скопированы"
  log "JWT ключи скопированы"
else
  warn "Volume sbonus_keys не найден"
fi

# ── 7. Custom DB settings snapshot ──────────────────────────────
log "DB Settings snapshot..."
docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" \
  -c "COPY (SELECT key, value, updated_at FROM settings ORDER BY key) TO STDOUT WITH CSV HEADER" \
  > "$CURRENT_BACKUP/settings_snapshot.csv" 2>/dev/null || warn "Settings snapshot не создан"
log "Settings snapshot сохранён"

# ── 8. Customer count snapshot (for verification) ──────────────
CUST_COUNT=$(docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -t \
  -c "SELECT count(*) FROM customers" 2>/dev/null | xargs || echo "?")
TXN_COUNT=$(docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -t \
  -c "SELECT count(*) FROM transactions" 2>/dev/null | xargs || echo "?")
echo "customers=$CUST_COUNT, transactions=$TXN_COUNT, date=$DATE" \
  > "$CURRENT_BACKUP/counts.txt"
log "Snapshot: $CUST_COUNT клиентов, $TXN_COUNT транзакций"

# ── 9. Archive everything ──────────────────────────────────────
log "Архивация..."
ARCHIVE="$BACKUP_DIR/sbonus_backup_$DATE.tar.gz"
tar czf "$ARCHIVE" -C "$BACKUP_DIR" "$DATE"
ARCHIVE_SIZE=$(du -sh "$ARCHIVE" | cut -f1)
log "Архив: $ARCHIVE ($ARCHIVE_SIZE)"

# Remove uncompressed folder
rm -rf "$CURRENT_BACKUP"

# ── 10. Cleanup old backups ─────────────────────────────────────
DELETED=$(find "$BACKUP_DIR" -name "sbonus_backup_*.tar.gz" -mtime +$KEEP_DAYS -delete -print | wc -l)
if [ "$DELETED" -gt 0 ]; then
  log "Удалено старых бэкапов: $DELETED"
fi

# ── Summary ─────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════"
echo -e "  ${GREEN}Backup завершён!${NC}"
echo "  Файл: $ARCHIVE"
echo "  Размер: $ARCHIVE_SIZE"
echo "  Клиентов: $CUST_COUNT"
echo "  Транзакций: $TXN_COUNT"
echo "  Хранение: $KEEP_DAYS дней"
echo "═══════════════════════════════════════════════════"
echo ""
