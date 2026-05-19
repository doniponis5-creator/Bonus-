FROM python:3.11-slim

WORKDIR /app

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev curl openssl \
    && rm -rf /var/lib/apt/lists/*

# Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Keys directory (will be populated by entrypoint if empty)
RUN mkdir -p /app/keys

# Copy app
COPY . .

# Entrypoint permissions (before switching to non-root)
RUN chmod +x /app/entrypoint.sh

# Non-root user for security
RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser \
    && chown -R appuser:appgroup /app
USER appuser

EXPOSE 8000

ENTRYPOINT ["sh", "/app/entrypoint.sh"]
