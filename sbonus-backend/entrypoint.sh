#!/bin/sh
set -e

echo "================================================"
echo "  S Bonus+ — Запуск сервера"
echo "================================================"

# RSA ключи: если не существуют — генерируем
if [ ! -f /app/keys/private.pem ]; then
    echo "  🔑 Генерация RSA ключей..."
    mkdir -p /app/keys
    openssl genrsa -out /app/keys/private.pem 2048
    openssl rsa -in /app/keys/private.pem -pubout -out /app/keys/public.pem
    echo "  ✅ RSA ключи сгенерированы"
else
    echo "  🔑 RSA ключи уже существуют"
fi

# Миграции
echo "  📦 Применение Alembic миграций..."
alembic upgrade head
echo "  ✅ Миграции применены"

# Запуск сервера
if [ "$APP_ENV" = "production" ]; then
    echo "  🚀 Production режим (без --reload)"
    exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2
else
    echo "  🔧 Development режим (с --reload)"
    exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
fi
