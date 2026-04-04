# ── Stage 1: Build React frontend ──────────────────────────────────────────────
FROM node:20-alpine AS frontend-build

WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install

COPY frontend/ ./
RUN npm run build

# ── Stage 2: Python runtime ─────────────────────────────────────────────────────
FROM python:3.12-slim AS runtime

ARG VERSION=dev
ENV UHLD_VERSION=${VERSION}

WORKDIR /app

# Install network tools for diagnostics
RUN apt-get update \
    && apt-get install -y \
    dnsutils \
    iputils-ping \
    speedtest-cli \
    ssh \
    tcpdump \
    traceroute \
    whois \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend
COPY backend/ ./backend/

# Copy built frontend into static/
COPY --from=frontend-build /app/static ./static/

# Data volume mount point
RUN mkdir -p /data

ENV DATABASE_PATH=/data/uhld.db \
    LOG_LEVEL=INFO \
    TZ=America/Montreal \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

EXPOSE 8000

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
