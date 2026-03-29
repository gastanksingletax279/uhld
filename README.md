# UHLD — Ultimate Homelab Dashboard

> **Work in progress — under heavy development. Expect breaking changes.**

A self-hosted, plugin-driven dashboard for your homelab. Monitor and manage Proxmox, Docker, Kubernetes, AdGuard, TrueNAS, Plex, and more from a single unified interface.

> This project is built entirely using [Claude Code](https://claude.ai/code), Anthropic's agentic coding tool.

---

## What it is

UHLD is the homelab equivalent of Home Assistant — but for infrastructure instead of home automation. Deploy it as a single Docker container, enable plugins for the services you run, and get a unified dashboard to monitor and interact with your entire homelab from one place.

- **Plugin-first** — every integration is a plugin, nothing is hardcoded
- **Read/monitor by default** — write and action operations always require explicit intent
- **Single container** — FastAPI backend + React frontend, one Docker image
- **Credential encryption** — all plugin secrets are encrypted at rest

---

## Current Status

| Sprint | Status |
|--------|--------|
| Core framework (auth, plugin registry, settings) | Complete |
| Proxmox VE plugin (nodes, VMs, storage, start/stop/reboot) | Complete |
| AdGuard Home plugin (stats, query log, protection toggle) | Complete |
| Pi-hole plugin (stats, query log, blocking toggle) | Complete |
| Tailscale plugin (device list, online status) | Complete |
| UniFi plugin (clients, devices, ports, networks, WiFi, firewall) | Complete |
| Docker / Kubernetes | Planned |
| Plex / Jellyfin / TrueNAS / Synology | Planned |
| Notifications, widget grid, k8s manifests | Planned |

---

## Tech Stack

- **Backend:** Python 3.12, FastAPI, SQLAlchemy async + aiosqlite, APScheduler
- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, Zustand, Recharts
- **Auth:** JWT (httpOnly cookie), bcrypt
- **Storage:** SQLite — zero external dependencies
- **Deployment:** Multi-stage Docker (node:20-alpine → python:3.12-slim)

---

## Quick Start

### Requirements

- Docker and Docker Compose

### Generate secrets

```bash
python -c "import secrets; print(secrets.token_hex(32))"          # JWT_SECRET
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"  # ENCRYPTION_KEY
```

### docker-compose.yml

```yaml
services:
  uhld:
    image: ghcr.io/mzac/uhld:latest
    ports:
      - "8222:8000"
    volumes:
      - ./data:/data
    environment:
      - JWT_SECRET=your_jwt_secret_here
      - ENCRYPTION_KEY=your_fernet_key_here
      - TZ=America/New_York
    restart: unless-stopped
```

```bash
docker compose up -d
```

Then open `http://localhost:8222`.

### Create your first user

```bash
docker exec -it uhld python -m backend.cli create-user admin yourpassword
```

> **Default credentials:** No default credentials are set. You must create your first user via the CLI before logging in.

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `JWT_SECRET` | Yes | JWT signing secret |
| `ENCRYPTION_KEY` | Yes | Fernet key for encrypting plugin credentials |
| `DATABASE_PATH` | No | SQLite path (default: `/data/uhld.db`) |
| `TZ` | No | Timezone (default: `America/Montreal`) |
| `LOG_LEVEL` | No | Python log level (default: `INFO`) |

---

## Plugin Configuration

Plugins are enabled and configured through the Settings → Plugins page. Each plugin's configuration form is rendered dynamically from its schema — no manual config files required. Sensitive fields (API keys, passwords, tokens) are encrypted before being stored.

---

## Development

```bash
# Backend
pip install -r requirements.txt
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000

# Frontend
cd frontend && npm install && npm run dev
# Vite proxies /api/* to localhost:8000

# Docker build
./build-run.sh
```

---

## Related Projects

This project shares its architecture and code style with [apt-ui](https://github.com/mzac/apt-ui), a self-hosted apt package management dashboard — also built entirely with Claude Code.

---

## License

MIT
