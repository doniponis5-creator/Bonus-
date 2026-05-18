#!/bin/bash
# ═══════════════════════════════════════════════════════════
# S Bonus — VPS Deploy Script
# Запуск на VPS: cd /opt/sbonus && bash deploy/deploy.sh
# ═══════════════════════════════════════════════════════════
set -e

COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env.production"
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}═══════════════════════════════════════${NC}"
echo -e "${GREEN}  S Bonus — Deploy${NC}"
echo -e "${GREEN}═══════════════════════════════════════${NC}"

# 1. Pull latest code
echo -e "\n${YELLOW}[1/5] Git pull...${NC}"
git pull origin main

# 2. Check .env.production exists
if [ ! -f .env.production ]; then
    echo -e "${RED}ERROR: .env.production not found!${NC}"
    echo "Copy from example: cp .env.production.example .env.production"
    exit 1
fi

# 3. Build images
echo -e "\n${YELLOW}[2/5] Building Docker images...${NC}"
$COMPOSE build --no-cache

# 4. Stop old containers and start new ones
echo -e "\n${YELLOW}[3/5] Restarting containers...${NC}"
$COMPOSE down
$COMPOSE up -d

# 5. Wait for health checks
echo -e "\n${YELLOW}[4/5] Waiting for services...${NC}"
sleep 10

# 6. Verify
echo -e "\n${YELLOW}[5/5] Verifying...${NC}"
$COMPOSE ps

echo ""
echo -e "${GREEN}═══════════════════════════════════════${NC}"

# Health check
API_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:18800/health 2>/dev/null || echo "000")
ADMIN_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:18801/ 2>/dev/null || echo "000")
CLIENT_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:18802/ 2>/dev/null || echo "000")
POS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:18803/ 2>/dev/null || echo "000")

echo -e "  API:     ${API_STATUS} $([ "$API_STATUS" = "200" ] && echo -e "${GREEN}OK${NC}" || echo -e "${RED}FAIL${NC}")"
echo -e "  Admin:   ${ADMIN_STATUS} $([ "$ADMIN_STATUS" = "200" ] && echo -e "${GREEN}OK${NC}" || echo -e "${RED}FAIL${NC}")"
echo -e "  Cabinet: ${CLIENT_STATUS} $([ "$CLIENT_STATUS" = "200" ] && echo -e "${GREEN}OK${NC}" || echo -e "${RED}FAIL${NC}")"
echo -e "  POS:     ${POS_STATUS} $([ "$POS_STATUS" = "200" ] && echo -e "${GREEN}OK${NC}" || echo -e "${RED}FAIL${NC}")"

echo -e "${GREEN}═══════════════════════════════════════${NC}"
echo -e "${GREEN}  Deploy complete!${NC}"
echo -e "${GREEN}═══════════════════════════════════════${NC}"
