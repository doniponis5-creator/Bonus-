#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# SBonus+ — Restore from Backup
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

if [ -z "${1:-}" ]; then
  echo -e "${RED}Использование:${NC} ./restore.sh /opt/backups/sbonus/sbonus_backup_YYYY-MM-DD_HH-MM.tar.gz"
  echo ""
  echo "Доступные бэкапы:"
  ls -lh /opt/backups/sbonus/sbonus_backup_*.tar.gz 2>/dev/null || echo "  (нет бэкапов)"
  exit 1
fi

ARCHIVE="$1"
DB_CONTAINER="sbonus_db"
DB_NAME="sbonus_db"
DB_USER="sbonus"
TEMP_DIR=$(mktemp -d)

echo ""
echo "═══════════════════════════════════════════════════"
echo -e "  ${YELLOW}⚠️  ВОССТАНОВЛЕНИЕ ИЗ БЭКАПА${NC}"
echo "  Файл: $ARCHIVE"
echo "═══════════════════════════════════════════════════"
echo ""

read -p "Это ПЕРЕЗАПИШЕТ текущую базу! Продолжить? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "Отменено."
  exit 0
fi

# Unpack
echo -e "${GREEN}[1/4]${NC} Распаковка..."
tar xzf "$ARCHIVE" -C "$TEMP_DIR"
BACKUP_FOLDER=$(ls "$TEMP_DIR")
DATA="$TEMP_DIR/$BACKUP_FOLDER"

# Show counts from backup
if [ -f "$DATA/counts.txt" ]; then
  echo -e "${YELLOW}  Бэкап:${NC} $(cat "$DATA/counts.txt")"
fi

# Restore PostgreSQL
echo -e "${GREEN}[2/4]${NC} PostgreSQL восстановление..."
if [ -f "$DATA/sbonus_db.dump" ]; then
  # Drop and recreate
  docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d postgres \
    -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$DB_NAME' AND pid <> pg_backend_pid();" 2>/dev/null || true
  docker exec "$DB_CONTAINER" dropdb -U "$DB_USER" --if-exists "$DB_NAME" 2>/dev/null || true
  docker exec "$DB_CONTAINER" createdb -U "$DB_USER" "$DB_NAME" 2>/dev/null
  
  docker cp "$DATA/sbonus_db.dump" "$DB_CONTAINER:/tmp/restore.dump"
  docker exec "$DB_CONTAINER" pg_restore -U "$DB_USER" -d "$DB_NAME" \
    --no-owner --no-acl --clean --if-exists /tmp/restore.dump 2>/dev/null || true
  docker exec "$DB_CONTAINER" rm -f /tmp/restore.dump
  echo -e "  ${GREEN}✓${NC} PostgreSQL восстановлен"
else
  echo -e "  ${RED}✗${NC} sbonus_db.dump не найден!"
fi

# Restore Redis
echo -e "${GREEN}[3/4]${NC} Redis восстановление..."
if [ -f "$DATA/redis_dump.rdb" ]; then
  docker cp "$DATA/redis_dump.rdb" "sbonus_redis:/data/dump.rdb"
  docker restart sbonus_redis
  echo -e "  ${GREEN}✓${NC} Redis восстановлен"
else
  echo -e "  ${YELLOW}!${NC} Redis dump не найден (пропущен)"
fi

# Restart API
echo -e "${GREEN}[4/4]${NC} Перезапуск сервисов..."
cd /opt/sbonus
docker compose -f docker-compose.prod.yml --env-file .env.production restart api
echo -e "  ${GREEN}✓${NC} API перезапущен"

# Verify
CUST_COUNT=$(docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -t \
  -c "SELECT count(*) FROM customers" 2>/dev/null | xargs || echo "?")
TXN_COUNT=$(docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -t \
  -c "SELECT count(*) FROM transactions" 2>/dev/null | xargs || echo "?")

# Cleanup
rm -rf "$TEMP_DIR"

echo ""
echo "═══════════════════════════════════════════════════"
echo -e "  ${GREEN}Восстановление завершено!${NC}"
echo "  Клиентов: $CUST_COUNT"
echo "  Транзакций: $TXN_COUNT"
echo "═══════════════════════════════════════════════════"
echo ""
