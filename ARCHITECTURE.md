# Ultimate Homelab Dashboard (UHLD) — Architecture Document

> **For Claude Code:** This document defines the full architecture for UHLD. Start by scaffolding the project structure, core framework, and a single working plugin (Proxmox) end-to-end. All subsequent plugins follow the same pattern.

---

## Predecessor Project — apt-ui

UHLD is built by the same author as **apt-ui** (https://github.com/mzac/apt-ui), a self-hosted apt package management dashboard. apt-ui was entirely written via Claude Code and serves as the direct reference implementation for UHLD's tech stack, code style, and deployment patterns.

**When building UHLD, inherit the following directly from apt-ui:**
- Tech stack (FastAPI + React/TypeScript + SQLite + APScheduler + Zustand + Recharts + Tailwind)
- Auth pattern (JWT, httpOnly cookie, bcrypt via passlib)
- Credential encryption pattern (`ENCRYPTION_KEY` env var, Fernet symmetric encryption)
- Multi-stage Dockerfile structure (node:20-alpine build → python:3.12-slim runtime)
- Docker Compose layout (including Tailscale sidecar pattern)
- k8s manifest structure (`k8s/deployment.yaml`)
- GitHub Actions Docker publish workflow (`.github/workflows/docker-publish.yml`)
- CLI admin tool pattern (`backend/cli.py` — reset-password, create-user, list-users)
- Dark industrial UI aesthetic (dense, information-rich, ops-focused)
- WebSocket streaming pattern for live output (reuse for any plugin that needs live log streaming)
- Notification system structure (Telegram, SMTP, signed webhook)

Do not reinvent any of these — replicate the apt-ui approach and adapt as needed.

---

## Project Overview

UHLD is a self-hosted, plugin-driven homelab management dashboard. Think Home Assistant, but for infrastructure instead of home automation. Users deploy it as a Docker container, enable plugins for the services they run, and get a unified dashboard to monitor and interact with their entire homelab from one place.

**Design philosophy:**
- Plugin-first: every integration is a plugin, nothing is hardcoded
- Non-destructive by default: read/monitor operations always; write/action operations require explicit user intent
- Docker-first deployment, k8s-ready
- API-first backend: full REST API, UI is just a consumer
- Dark industrial UI (similar aesthetic to apt-ui)

---

## Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Backend | Python 3.12, FastAPI, Uvicorn | Async, fast, same as apt-ui |
| Plugin runtime | Python packages + plugin loader | Pip-installable or bundled |
| Database | SQLite (SQLAlchemy async + aiosqlite) | Zero-dependency, same as apt-ui |
| Scheduler | APScheduler 3.x (AsyncIOScheduler) | Same as apt-ui |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS | Same as apt-ui |
| State | Zustand | Same as apt-ui |
| Charts | Recharts | Same as apt-ui |
| Auth | passlib[bcrypt], PyJWT (httpOnly cookie) | Same as apt-ui |
| Container | Multi-stage Dockerfile (node:20-alpine → python:3.12-slim) | Same as apt-ui |

---

## Directory Structure

```
uhld/
├── backend/
│   ├── main.py                  # FastAPI app entrypoint
│   ├── auth.py                  # JWT auth, user management
│   ├── database.py              # SQLAlchemy setup, Base, get_db
│   ├── models.py                # Core DB models (User, PluginConfig, etc.)
│   ├── scheduler.py             # APScheduler setup
│   ├── cli.py                   # Admin CLI (reset-password, etc.)
│   ├── api/
│   │   ├── __init__.py
│   │   ├── auth.py              # /api/auth/* routes
│   │   ├── plugins.py           # /api/plugins/* routes (list, enable, config)
│   │   └── dashboard.py         # /api/dashboard/* routes (aggregated data)
│   └── plugins/
│       ├── __init__.py
│       ├── base.py              # PluginBase abstract class
│       ├── registry.py          # Plugin discovery and registry
│       └── builtin/
│           ├── __init__.py
│           ├── proxmox/         # First plugin (reference implementation)
│           │   ├── __init__.py
│           │   ├── plugin.py    # ProxmoxPlugin(PluginBase)
│           │   ├── api.py       # FastAPI router for /api/plugins/proxmox/*
│           │   ├── models.py    # Proxmox-specific DB models
│           │   └── schema.py    # Pydantic schemas
│           ├── adguard/
│           ├── docker/
│           ├── kubernetes/
│           ├── tailscale/
│           ├── plex/
│           ├── jellyfin/
│           ├── truenas/
│           ├── synology/
│           ├── grafana/
│           ├── pihole/
│           ├── radarr/
│           ├── sonarr/
│           ├── unifi/
│           └── ...              # All other plugins follow same structure
├── frontend/
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── store/
│   │   │   ├── authStore.ts
│   │   │   └── pluginStore.ts
│   │   ├── components/
│   │   │   ├── Layout/
│   │   │   │   ├── Sidebar.tsx        # Plugin nav list
│   │   │   │   ├── TopNav.tsx
│   │   │   │   └── DashboardGrid.tsx  # Main dashboard widget grid
│   │   │   ├── Dashboard/
│   │   │   │   ├── WidgetCard.tsx     # Generic plugin widget card
│   │   │   │   └── PluginWidget.tsx   # Renders plugin-specific widget
│   │   │   └── Settings/
│   │   │       ├── PluginManager.tsx  # Enable/disable/configure plugins
│   │   │       └── PluginConfigForm.tsx
│   │   └── plugins/                   # Frontend plugin views
│   │       ├── proxmox/
│   │       │   ├── Widget.tsx         # Dashboard widget (compact)
│   │       │   └── View.tsx           # Full plugin page
│   │       └── ...
│   ├── package.json
│   └── vite.config.ts
├── data/                        # Mounted volume — SQLite DB lives here
├── k8s/
│   └── deployment.yaml
├── .github/
│   └── workflows/
│       └── docker-publish.yml
├── Dockerfile
├── docker-compose.yml
├── docker-compose.ghcr.yml
├── docker-compose.tailscale.yml
├── tailscale-serve.json
├── build-run.sh
├── .env.example
├── CLAUDE.md
└── README.md
```

---

## Core Backend Architecture

### Plugin Base Class (`backend/plugins/base.py`)

Every plugin inherits from `PluginBase`. This is the contract all plugins must implement:

```python
from abc import ABC, abstractmethod
from typing import Any
from fastapi import APIRouter

class PluginBase(ABC):
    # Metadata — set as class attributes in each plugin
    plugin_id: str          # e.g. "proxmox"
    display_name: str       # e.g. "Proxmox VE"
    description: str        # short description
    version: str            # e.g. "1.0.0"
    icon: str               # lucide icon name or URL to SVG
    category: str           # "virtualization" | "monitoring" | "media" | "network" | "storage" | "automation" | "arr" | "security" | "power" | "hardware" | "developer" | "documents"
    config_schema: dict     # JSON Schema for plugin configuration fields
    
    @abstractmethod
    async def health_check(self) -> dict:
        """Return {"status": "ok"|"error", "message": str}"""
        pass

    @abstractmethod
    async def get_summary(self) -> dict:
        """Return compact data for dashboard widget card."""
        pass

    @abstractmethod
    def get_router(self) -> APIRouter:
        """Return a FastAPI APIRouter with all plugin-specific routes."""
        pass

    async def on_enable(self, config: dict) -> None:
        """Called when plugin is enabled. Validate config, init connections."""
        pass

    async def on_disable(self) -> None:
        """Called when plugin is disabled. Clean up connections."""
        pass

    async def scheduled_poll(self) -> None:
        """Optional: called on a schedule to refresh cached data."""
        pass
```

### Plugin Registry (`backend/plugins/registry.py`)

- Auto-discovers all plugins under `backend/plugins/builtin/`
- Stores enabled plugins and their configs in the DB
- Mounts each enabled plugin's router at `/api/plugins/{plugin_id}/`
- Exposes `/api/plugins/` to list all available plugins and their enabled state

### Core Database Models (`backend/models.py`)

```
User
  id, username, hashed_password, is_admin, created_at

PluginConfig
  id, plugin_id (unique), enabled (bool), config_json (encrypted JSON), 
  last_health_check, health_status, created_at, updated_at

Setting
  id, key (unique), value, updated_at
```

### Plugin config storage

Sensitive values in `config_json` (API keys, passwords, tokens) are encrypted at rest using the same `ENCRYPTION_KEY` pattern from apt-ui (Fernet symmetric encryption). The key is set via env var.

---

## Plugin Configuration Schema

Each plugin declares its config fields via `config_schema` (JSON Schema). The frontend renders this dynamically as a form — no per-plugin frontend code needed for configuration.

Example for Proxmox:

```python
config_schema = {
    "type": "object",
    "properties": {
        "host": {
            "type": "string",
            "title": "Proxmox Host",
            "description": "Hostname or IP of your Proxmox node or cluster",
            "placeholder": "192.168.1.100"
        },
        "port": {
            "type": "integer",
            "title": "Port",
            "default": 8006
        },
        "username": {
            "type": "string",
            "title": "Username",
            "description": "Usually root@pam or an API user",
            "placeholder": "root@pam"
        },
        "password": {
            "type": "string",
            "title": "Password / API Token Secret",
            "format": "password",
            "sensitive": True   # custom flag: encrypt this field
        },
        "verify_ssl": {
            "type": "boolean",
            "title": "Verify SSL",
            "default": False,
            "description": "Disable for self-signed certs (most homelabs)"
        }
    },
    "required": ["host", "username", "password"]
}
```

---

## API Design

### Core Routes

```
GET  /health                          # liveness probe
GET  /api/auth/me                     # current user
POST /api/auth/login                  # login
POST /api/auth/logout                 # logout
GET  /api/dashboard/summary           # aggregated summary from all enabled plugins
GET  /api/plugins/                    # list all plugins (id, name, enabled, category, health)
GET  /api/plugins/{id}                # plugin metadata + config schema
POST /api/plugins/{id}/enable         # enable plugin with config payload
POST /api/plugins/{id}/disable        # disable plugin
PUT  /api/plugins/{id}/config         # update plugin config
GET  /api/plugins/{id}/health         # run health check now
GET  /api/settings/                   # all settings
PUT  /api/settings/                   # update settings
```

### Plugin-specific Routes (mounted dynamically)

Each plugin mounts its own router at `/api/plugins/{plugin_id}/`. Examples:

```
# Proxmox
GET  /api/plugins/proxmox/nodes           # list nodes
GET  /api/plugins/proxmox/nodes/{node}/vms
POST /api/plugins/proxmox/nodes/{node}/vms/{vmid}/start
POST /api/plugins/proxmox/nodes/{node}/vms/{vmid}/stop
GET  /api/plugins/proxmox/storage
GET  /api/plugins/proxmox/tasks

# AdGuard Home
GET  /api/plugins/adguard/stats
GET  /api/plugins/adguard/query-log
POST /api/plugins/adguard/protection/enable
POST /api/plugins/adguard/protection/disable

# Docker
GET  /api/plugins/docker/containers
POST /api/plugins/docker/containers/{id}/start
POST /api/plugins/docker/containers/{id}/stop
GET  /api/plugins/docker/images

# Kubernetes
GET  /api/plugins/kubernetes/namespaces
GET  /api/plugins/kubernetes/pods
GET  /api/plugins/kubernetes/nodes

# Plex / Jellyfin
GET  /api/plugins/plex/sessions           # active streams
GET  /api/plugins/plex/libraries

# Tailscale
GET  /api/plugins/tailscale/devices
GET  /api/plugins/tailscale/status

# Radarr / Sonarr
GET  /api/plugins/radarr/queue
GET  /api/plugins/radarr/wanted

# TrueNAS
GET  /api/plugins/truenas/pools
GET  /api/plugins/truenas/disks
GET  /api/plugins/truenas/alerts

# Grafana
GET  /api/plugins/grafana/dashboards
GET  /api/plugins/grafana/alerts

# UniFi (Integration v1 API + session fallback)
GET  /api/plugins/unifi/clients
POST /api/plugins/unifi/clients/{client_id}/kick
GET  /api/plugins/unifi/devices
GET  /api/plugins/unifi/ports
GET  /api/plugins/unifi/networks
GET  /api/plugins/unifi/wlans
GET  /api/plugins/unifi/firewall

# UPS / NUT (Network UPS Tools)
GET  /api/plugins/nut/ups                     # list all UPS devices reported by NUT
GET  /api/plugins/nut/ups/{ups_name}          # detailed status: battery %, load %, runtime, voltage
GET  /api/plugins/nut/ups/{ups_name}/vars     # raw NUT variables for a UPS

# IPMI / BMC
GET  /api/plugins/ipmi/sensors                # fan speeds, temperatures, voltages
GET  /api/plugins/ipmi/power                  # power consumption, chassis status
GET  /api/plugins/ipmi/sel                    # system event log entries
```

---

## Frontend Architecture

### Dashboard Page

The main dashboard renders a responsive grid of **WidgetCard** components, one per enabled plugin. Each card shows the plugin's `get_summary()` data in a compact format. Layout is configurable (drag-to-reorder, resize — phase 2).

### Plugin Pages

Each enabled plugin appears in the sidebar. Clicking it renders the plugin's full **View** component, which has access to all plugin-specific API routes and can show detailed information, take actions, etc.

### Plugin Manager (Settings)

`Settings → Plugins` shows all available plugins in a grid with category filters. Each plugin card shows:
- Icon, name, category, description
- Status badge (enabled / disabled / error)
- Enable/Disable toggle
- Configure button (opens modal with auto-rendered config form from `config_schema`)

### Dynamic Config Form Rendering

The frontend reads `config_schema` from the API and renders the appropriate form controls:
- `string` → text input
- `string` with `format: "password"` → password input
- `integer` → number input
- `boolean` → toggle
- `array` → tag/chip input
- `enum` → select dropdown

This means no per-plugin frontend config code is ever needed.

---

## Plugin Catalog (MVP and Future)

### Phase 1 — MVP (launch with these)

| Plugin | Category | Status | Python Library |
|---|---|---|---|
| **Proxmox VE** | Virtualization | ✅ Complete | `proxmoxer` |
| **AdGuard Home** | Network/DNS | ✅ Complete | REST API (httpx) |
| **Pi-hole** | Network/DNS | ✅ Complete | Pi-hole API (httpx) |
| **Tailscale** | Network | ✅ Complete | Tailscale API (httpx) |
| **UniFi** | Network | ✅ Complete | UniFi Integration v1 API (httpx) |
| **Docker** | Containers | Planned | `docker` (Docker SDK) |
| **Grafana** | Monitoring | Planned | Grafana HTTP API (httpx) |

### Phase 2

| Plugin | Category | Library/API |
|---|---|---|
| **Kubernetes** | Containers | `kubernetes` (official client) |
| **Plex** | Media | `plexapi` |
| **Jellyfin** | Media | Jellyfin HTTP API (httpx) |
| **TrueNAS** | Storage | TrueNAS REST API (httpx) |
| **Synology DSM** | Storage | Synology API (httpx) |
| **Radarr** | Arr | direct REST |
| **Sonarr** | Arr | direct REST |
| **Prowlarr** | Arr | direct REST |
| **UPS / NUT** | Power | `nut2` (Network UPS Tools) — covers APC, Eaton, CyberPower, Tripplite, Vertiv |
| **IPMI / BMC** | Hardware | `pyghmi` — iDRAC, iLO, generic IPMI out-of-band management |
| **Scrutiny** | Storage | Scrutiny REST API — SMART disk health monitoring |
| **Immich** | Media | Immich REST API — self-hosted Google Photos alternative |
| **Nextcloud** | Storage | Nextcloud OCS/REST API |

### Phase 3

| Plugin | Category | Notes |
|---|---|---|
| **VMware vSphere** | Virtualization | `pyVmomi` |
| **XCP-ng / XenServer** | Virtualization | XenAPI |
| **Ansible AWX / Semaphore** | Automation | REST API |
| **qBittorrent / Deluge / Transmission** | Downloads | REST APIs |
| **Portainer** | Containers | Portainer API |
| **Netdata** | Monitoring | Netdata API |
| **Uptime Kuma** | Monitoring | WebSocket API |
| **Beszel** | Monitoring | Beszel REST API — lightweight server monitoring |
| **Authentik / Keycloak** | Security/Auth | REST APIs |
| **BIND9 / CoreDNS** | Network/DNS | DNS APIs / zone files |
| **Netbox** | IPAM | Netbox REST API |
| **phpIPAM** | IPAM | phpIPAM REST API |
| **Cert-Manager / ACME** | Certificates | REST API / kubectl |
| **Frigate / Scrypted** | Cameras | REST APIs |
| **Vaultwarden** | Security | Bitwarden REST API |
| **Wireguard** | Network | `wgconfig` / system |
| **OpenVPN** | Network | management socket |
| **OPNsense / pfSense** | Network | REST API |
| **Nginx Proxy Manager** | Network | NPM REST API |
| **Traefik** | Network | Traefik REST API |
| **Cloudflare** | Network/DNS | Cloudflare API — DNS records, tunnel status |
| **Speedtest Tracker** | Network | REST API — scheduled bandwidth testing |
| **Prometheus** | Monitoring | PromQL API |
| **Loki** | Monitoring | Loki API |
| **Home Assistant** | Automation | HA REST/WebSocket API |
| **Homebridge** | Automation | Homebridge REST API |
| **Gitea / Forgejo** | Developer | Gitea REST API — self-hosted git |
| **Paperless-ngx** | Documents | Paperless-ngx REST API |
| **Bazarr** | Arr | direct REST |
| **Lidarr** | Arr | direct REST |
| **Readarr** | Arr | direct REST |
| **Jellyseerr / Overseerr** | Arr/Media | direct REST |
| **Tdarr** | Media | Tdarr REST API — transcoding pipeline |

---

## Notifications

Same approach as apt-ui:
- Channels: Email (SMTP), Telegram, Webhook (HMAC-signed)
- Per-plugin notification events (e.g. "VM stopped unexpectedly", "Pool degraded", "New update available")
- Notification history stored in DB

---

## Discovery (Phase 2)

Optional auto-discovery via network scanning (mDNS / Bonjour, well-known ports) to suggest plugins the user might want to enable. Implemented as a background task, suggestions shown in the Plugin Manager as "Detected on your network."

---

## Scheduled Polling

Each plugin can define a poll interval. APScheduler runs `plugin.scheduled_poll()` on that interval to refresh cached data. Default intervals by category:
- Monitoring: 60s
- Containers/VMs: 60s
- Media: 30s (active sessions)
- Network/DNS: 120s
- Storage: 300s
- Power/UPS: 30s (battery status changes quickly during outages)

---

## Deployment

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `JWT_SECRET` | random | JWT signing secret |
| `ENCRYPTION_KEY` | — | Key for encrypting plugin credentials in DB |
| `DATABASE_PATH` | `/data/uhld.db` | SQLite path |
| `TZ` | `America/Montreal` | Timezone for scheduler |
| `LOG_LEVEL` | `INFO` | Python log level |
| `TS_AUTHKEY` | — | Optional Tailscale auth key for sidecar |
| `TS_HOSTNAME` | `uhld` | Tailscale node name |

### Docker Compose (minimum)

```yaml
services:
  uhld:
    image: ghcr.io/OWNER/uhld:latest
    ports:
      - "8222:8000"
    volumes:
      - ./data:/data
    environment:
      - JWT_SECRET=${JWT_SECRET}
      - ENCRYPTION_KEY=${ENCRYPTION_KEY}
      - TZ=America/Montreal
    restart: unless-stopped
```

### Kubernetes

Same pattern as apt-ui: Deployment + ClusterIP Service + PVC + Secret refs. Manifest at `k8s/deployment.yaml`.

---

## Container Architecture

```
Docker Container
┌─────────────────────────────────────────────────────┐
│  FastAPI (backend.main:app)  :8000                   │
│  ├── /api/auth/*        Authentication               │
│  ├── /api/plugins/*     Plugin management            │
│  ├── /api/dashboard/*   Aggregated dashboard data    │
│  ├── /api/settings/*    App settings                 │
│  ├── /api/plugins/{id}/* Dynamically mounted routes  │
│  ├── /health            Liveness probe               │
│  └── /*                 React SPA (static/)          │
│                                                      │
│  SQLite  ←→  /data/uhld.db                           │
│  APScheduler  (per-plugin polling jobs)              │
│                                                      │
│  Plugin Registry                                     │
│  ├── proxmox/  (proxmoxer)                           │
│  ├── docker/   (docker SDK)                          │
│  ├── adguard/  (httpx)                               │
│  ├── tailscale/ (httpx)                              │
│  └── ...                                             │
└──────────────────────────────────────────────────────┘
         │               │              │
    Proxmox API     Docker socket   AdGuard API
    :8006           /var/run/        :3000
                    docker.sock
```

---

## CLAUDE.md Instructions for Claude Code

When implementing UHLD, follow these rules:

1. **Always implement one plugin end-to-end first** (Proxmox). Validate the plugin contract, API routing, config form rendering, and widget card before writing any other plugin. All other plugins are just reimplementations of the same pattern.

2. **Plugin isolation:** Each plugin is a self-contained Python package under `backend/plugins/builtin/{plugin_id}/`. It must not import from other plugins. Core imports only from `backend.plugins.base`, `backend.database`, and `backend.models`.

3. **Error handling:** Plugin failures must never crash the main app. Wrap all plugin API calls in try/except. Return `{"status": "error", "message": "..."}` from `health_check()` and `get_summary()` when the plugin is unreachable. The dashboard continues to render other plugin widgets normally.

4. **Frontend widget contract:** Every plugin's `Widget.tsx` receives a `summary` prop typed as the return value of the plugin's `get_summary()`. It should render in a fixed-height card (approx 180px) with a compact representation. If `summary.status === "error"`, render an error state.

5. **Sensitive config fields:** Any field in `config_schema` with `"sensitive": true` must be encrypted before storing in `PluginConfig.config_json`. Never log these values. Never return them in plaintext from the API — mask them (e.g. return `"***"` for password fields on GET).

6. **No hardcoded credentials:** Never hardcode credentials or connection strings. All plugin config comes from the DB, populated via the settings UI.

7. **Same code style as apt-ui:** Black formatting, typed Python (use `from __future__ import annotations`), async everywhere, Pydantic v2 schemas.

8. **Start here:** Scaffold the full project structure, implement auth + core models + plugin registry + the Proxmox plugin (read-only: list nodes, VMs, storage). Get a working Docker build with the Proxmox widget visible on the dashboard. Then expand from there.

---

## Implementation Order (for Claude Code)

### Sprint 1: Core Framework ✅ Complete
- [x] Project scaffold (directory structure, pyproject.toml / requirements.txt, package.json)
- [x] FastAPI app with auth (JWT, httpOnly cookie, bcrypt)
- [x] Core DB models (User, PluginConfig, Setting)
- [x] Plugin base class and registry
- [x] Settings routes
- [x] Plugin list/enable/disable/config API routes
- [x] React app scaffold (Vite, Tailwind, Zustand)
- [x] Login page
- [x] Sidebar + layout with plugin nav
- [x] Settings → Plugin Manager page (list all plugins, enable/disable, config modal)
- [x] Docker build + docker-compose.yml

### Sprint 2: First Plugin (Proxmox) ✅ Complete
- [x] ProxmoxPlugin implementing PluginBase
- [x] Proxmox API routes (nodes, VMs, storage, start/stop/reboot/shutdown)
- [x] Proxmox Widget.tsx (dashboard card: node count, VM count, CPU/RAM summary)
- [x] Proxmox View.tsx (full page: node list, VM list with VM control actions, storage)
- [x] Health check integration
- [x] Scheduled polling

### Sprint 3: Network/DNS Plugins ✅ Complete
- [x] AdGuard Home plugin (stats widget, query log, protection toggle)
- [x] Pi-hole plugin (stats widget, query log, blocking toggle)
- [x] Tailscale plugin (device list, online/offline status, OS, last seen, tags)
- [x] UniFi plugin — full Integration v1 API (X-API-Key + session fallback)
  - Clients tab: filter by type (All/WiFi/Wired/VPN), sortable, bounce action
  - Devices tab: firmware update badges, online/offline state
  - Ports tab: PoE status, speed, connector, dynamic columns
  - Networks tab: VLAN IDs, subnets, DHCP info
  - WiFi tab: security type badges, client isolation
  - Firewall tab: policies (with zone resolution), groups, zones (system/custom)

### Sprint 4: Container Plugins
- [ ] Docker plugin (container list, start/stop, image list)
- [ ] Kubernetes plugin (pod list, node health, namespace overview)

### Sprint 5: Media & Storage
- [ ] Plex plugin (active sessions, library stats)
- [ ] Jellyfin plugin
- [ ] TrueNAS plugin (pool health, disk status, alerts)
- [ ] Synology plugin

### Sprint 6: Polish
- [ ] Notifications (Telegram, email, webhook)
- [ ] Dashboard widget grid (drag-to-reorder)
- [ ] Dark/light theme
- [ ] k8s manifests
- [ ] GitHub Actions Docker publish workflow