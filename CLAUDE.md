# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# UHLD — Ultimate Homelab Dashboard

UHLD is a self-hosted, plugin-driven homelab management dashboard. Think Home Assistant, but for infrastructure. Deploy as a Docker container, enable plugins for services you run, and get a unified dashboard for your entire homelab.

**Project status:** Sprint 1 (core framework) complete, Sprint 2 (Proxmox plugin) complete, Sprint 3 (network/DNS plugins) complete, Sprint 4 (container plugins) complete. Sprint 5 is in progress with Plex and Cloudflare now implemented.

---

## Tech Stack

- **Backend:** Python 3.12, FastAPI, SQLAlchemy async + aiosqlite, APScheduler, passlib[bcrypt], PyJWT, Fernet encryption
- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, Zustand, Recharts, lucide-react, dnd-kit
- **Database:** SQLite (aiosqlite) — zero external dependencies
- **Deployment:** Multi-stage Docker (node:20-alpine → python:3.12-slim), Docker Compose, k8s manifests

---

## Commands

### Development

```bash
# Backend (dev)
pip install -r requirements.txt
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000

# Frontend (dev)
cd frontend && npm install && npm run dev
# Vite proxies /api/* to localhost:8000

# Full stack with Docker
docker compose up
```

### Linting and Type Checking

```bash
# Python formatting
black backend/

# TypeScript type check (same as build)
cd frontend && npx tsc --noEmit
```

### Build

```bash
# Local Docker build
./build-run.sh                    # copies .env.example → .env on first run
./build-run.sh --no-cache         # fresh build

# Docker Compose
docker compose up -d              # start
docker compose down               # stop
```

### Admin CLI

```bash
# Create first user (auto-creates admin/admin on first run)
python -m backend.cli create-user admin yourpassword

# Reset admin password
python -m backend.cli reset-password admin newpassword

# List users
python -m backend.cli list-users

# Set setup required flag (for testing first-launch behavior)
python -m backend.cli set-setting setup_required true
```

### Keys

```bash
python -c "import secrets; print(secrets.token_hex(32))"          # JWT_SECRET
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"  # ENCRYPTION_KEY
```

### Tests

```bash
# Run pytest (when test suite exists)
pytest backend/tests/

# Run single test file
pytest backend/tests/test_auth.py::test_login -v
```

---

## Architecture Overview

### Backend Structure

```
backend/
├── main.py              # FastAPI app + lifespan (startup/shutdown)
├── auth.py              # JWT helpers, get_current_user, require_admin
├── database.py          # SQLAlchemy async engine, Base, get_db, init_db, migrate_db
├── models.py            # User, PluginConfig, Setting ORM models
├── encryption.py        # Fernet encrypt/decrypt for plugin config
├── scheduler.py         # APScheduler helpers: schedule_job, get_jobs, cancel_job
├── cli.py               # Admin CLI (typer): create-user, reset-password, list-users, set-setting
├── api/
│   ├── auth.py          # POST /api/auth/login|logout, GET /api/auth/me
│   ├── plugins.py       # GET|POST|PUT /api/plugins/* (list, enable, config, health)
│   ├── dashboard.py     # GET /api/dashboard/summary
│   └── settings.py      # GET|PUT /api/settings/
└── plugins/
    ├── base.py          # PluginBase abstract class
    ├── registry.py      # Plugin discovery, enable/disable, router mounting
    └── builtin/         # All plugins live here as packages
```

### Frontend Structure

```
frontend/src/
├── api/
│   └── client.ts        # Typed API client (fetch-based) with api.proxmox(), api.docker(), etc.
├── store/
│   ├── authStore.ts     # Zustand auth state
│   └── pluginStore.ts   # Zustand plugin state (enabled plugins, configs, instances)
├── components/
│   ├── Layout/
│   │   ├── Sidebar.tsx        # Plugin nav list (dynamic)
│   │   ├── TopNav.tsx         # Theme toggle, user menu
│   │   ├── AppLayout.tsx      # Main layout shell
│   │   └── DashboardGrid.tsx  # Main dashboard widget grid (dnd-kit)
│   ├── Dashboard/
│   │   ├── WidgetCard.tsx     # Generic plugin widget card
│   │   └── PluginWidget.tsx   # Renders plugin-specific widget
│   └── Settings/
│       ├── PluginManager.tsx  # List all plugins, enable/disable/configure
│       └── PluginConfigForm.tsx  # Dynamic form from config_schema
├── plugins/              # Per-plugin Widget.tsx and View.tsx
│   ├── proxmox/
│   ├── adguard/
│   ├── pihole/
│   ├── tailscale/
│   ├── unifi/
│   ├── docker/
│   └── kubernetes/
└── pages/
    ├── LoginPage.tsx           # Auth + theme toggle + first-launch setup
    ├── DashboardPage.tsx       # Dashboard grid
    └── SettingsPage.tsx        # Plugin manager
```

### Plugin Lifecycle

1. **Discovery:** Registry scans `backend/plugins/builtin/` for packages matching `{plugin_id}/`
2. **Init:** `Plugin.__init__(config)` receives decrypted config dict
3. **Enable:** Plugin calls `on_enable(config)` — validate, init connections, mount router
4. **Polling:** APScheduler runs `scheduled_poll()` on configured interval
5. **Disable:** Plugin calls `on_disable()` — cleanup connections, unmount routes (note: routes stay mounted until restart)
6. **Routes:** Each enabled plugin mounts its router at `/api/plugins/{plugin_id}/`

---

## Plugin Contract

Every plugin inherits from `PluginBase`:

```python
class FooPlugin(PluginBase):
    plugin_id = "foo"
    display_name = "Foo Service"
    description = "Short description"
    version = "1.0.0"
    icon = "server"
    category = "monitoring"
    poll_interval = 60  # seconds; 0 = no polling
    config_schema = { ... }

    async def health_check(self) -> dict:
        return {"status": "ok", "message": "Service is healthy"}

    async def get_summary(self) -> dict:
        return {
            "node_count": 1,
            "vm_count": 5,
            "status": "ok"
        }

    def get_router(self) -> APIRouter:
        router = APIRouter(prefix=f"/api/plugins/{self.plugin_id}")
        # define routes
        return router

    async def on_enable(self, config: dict) -> None:
        # validate config, init connections
        pass

    async def on_disable(self) -> None:
        # cleanup connections
        pass
```

**Plugin isolation rule:** Each plugin is self-contained. No module-level globals. All state lives on the plugin instance.

---

## Multi-Instance Support

Each plugin can have multiple independent instances:

- `PluginConfig` table has `instance_id` + `instance_label` columns; unique on `(plugin_id, instance_id)`
- Default instance routes: `/api/plugins/{plugin_id}/`
- Additional instances routes: `/api/plugins/{plugin_id}/{instance_id}/`
- All plugin API endpoints accept `?instance_id=` query param
- Reserved instance IDs: `enable`, `disable`, `config`, `health`, `clear`, `instances`

Frontend `View.tsx` must accept `{ instanceId?: string }` prop and call `api.{plugin}(instanceId)` factory.

---

## Sensitive Config Fields

Fields with `"sensitive": true` in `config_schema`:
- Encrypted before storing in `PluginConfig.config_json` (Fernet)
- Masked (`"***"`) when returned from GET endpoints
- Never logged

**Frontend:** Mask sensitive values in debug/tooling to prevent plaintext exposure.

---

## Error Handling

Plugin failures must never crash the main app:
- Wrap all external calls in `try/except`
- Return `{"status": "error", "message": "..."}` from `health_check()` and `get_summary()`
- Dashboard continues rendering other widgets

---

## Auth

- JWT in httpOnly cookie (`access_token`)
- `Depends(get_current_user)` for read routes
- `Depends(require_admin)` for write/mutating routes
- First run: auto-creates `admin/admin`, sets `setup_required=true`
- `GET /api/auth/me` returns `needs_setup: bool`
- Frontend shows `ChangePasswordModal` when `user.needs_setup` is true

---

## Categories

Plugins are organized by category:
- `virtualization` — Proxmox, Docker, Kubernetes, VMware, XCP-ng
- `monitoring` — Grafana, Netdata, Uptime Kuma, Beszel
- `media` — Plex, Jellyfin, Radarr, Sonarr, Tdarr
- `network` — AdGuard, Pi-hole, Tailscale, UniFi, Nginx Proxy Manager
- `storage` — TrueNAS, Synology, Nextcloud
- `automation` — Home Assistant, Homebridge, Ansible
- `arr` — Radarr, Sonarr, Bazarr, Lidarr, Readarr, Jellyseerr
- `security` — Vaultwarden, Authentik, Tailscale
- `power` — UPS/NUT, IPMI/BMC
- `hardware` — IPMI sensors, network tools
- `developer` — Gitea, GitLab

---

## Code Style

- Python: Black formatting, `from __future__ import annotations`, typed everywhere, async throughout
- TypeScript: strict mode, no `any` in plugin code
- All plugin API calls wrapped in try/except with graceful error returns
- Pydantic v2 schemas

---

## Multi-Instance Plugin Support

**How it works:**
- `PluginConfig` table has `instance_id` + `instance_label` columns; unique on `(plugin_id, instance_id)`
- Registry maps `"{plugin_id}:{instance_id}"` → plugin instance
- Default instance routes: `/api/plugins/{plugin_id}/` (backward-compatible)
- Additional instances routes: `/api/plugins/{plugin_id}/{instance_id}/`
- All plugin API endpoints accept `?instance_id=` query param
- New instance management endpoints: `GET/POST /api/plugins/{id}/instances`, `DELETE /api/plugins/{id}/instances/{instance_id}`
- Frontend: plugin views accept `instanceId` prop; routes at `/plugins/{pluginId}` and `/plugins/{pluginId}/{instanceId}`
- Settings UI: lists all instances per plugin with Configure/Disable/Delete per instance + "Add instance" button
- `migrate_db()` in `database.py` safely adds `instance_id`/`instance_label` to existing databases

**Design rules when adding new plugins:**
- All state must live on the plugin instance (no module-level globals)
- Config is fully self-contained in the instance — no shared singleton state
- Frontend `View.tsx` must accept `{ instanceId?: string }` prop and call `api.{plugin}(instanceId)` factory
- Add a plugin factory function to `frontend/src/api/client.ts` following `api.proxmox(instanceId)` pattern

---

## API Design

### Core Routes

```
GET  /health                          # liveness probe
GET  /api/auth/me                     # current user
POST /api/auth/login                  # login
POST /api/auth/logout                 # logout
GET  /api/dashboard/summary           # aggregated summary from all enabled plugins
GET  /api/plugins/                    # list all plugins
GET  /api/plugins/{id}                # plugin metadata + config schema
POST /api/plugins/{id}/enable         # enable plugin with config payload
POST /api/plugins/{id}/disable        # disable plugin
PUT  /api/plugins/{id}/config         # update plugin config
GET  /api/plugins/{id}/health         # run health check now
GET  /api/settings/                   # all settings
PUT  /api/settings/                   # update settings
```

### Plugin Management Routes (multi-instance)

```
GET  /api/plugins/{plugin_id}/instances              # list all instances
POST /api/plugins/{plugin_id}/instances               # create new instance
DELETE /api/plugins/{plugin_id}/instances/{instance_id}  # delete instance
```

### Plugin Clear Settings

`POST /api/plugins/{id}/clear`:
1. Disables the plugin (stops scheduling)
2. Sets `config_json = None` in the DB

Routes stay mounted until restart — user must re-enable and re-enter config.

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `JWT_SECRET` | Yes | random | JWT signing secret |
| `ENCRYPTION_KEY` | Yes | — | Fernet key for plugin config encryption |
| `DATABASE_PATH` | No | `/data/uhld.db` | SQLite path |
| `TZ` | No | `America/Montreal` | Timezone for scheduler |
| `LOG_LEVEL` | No | `INFO` | Python log level |

---

## Deployment

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
      - TZ=America/New_York
    restart: unless-stopped
```

### Kubernetes

See `k8s/deployment.yaml` — Deployment + ClusterIP Service + PVC + Secret refs.

---

## Plugin Catalog

### Implemented Plugins

| Plugin | Category | Auth | Key Features |
|---|---|---|---|
| **Proxmox VE** | Virtualization | API token or user+password | Nodes, VMs/LXC, storage, start/stop/reboot, tasks |
| **AdGuard Home** | Network/DNS | Basic auth | Stats, query log, protection toggle |
| **Pi-hole** | Network/DNS | API key | Stats, query log, blocking toggle |
| **Tailscale** | Network | Bearer token + optional local socket | Devices, users, DNS, ACL editor, sidecar status |
| **UniFi** | Network | X-API-Key + session fallback | Clients, devices, ports, networks, WiFi, firewall |
| **Docker** | Containers | Unix socket or TCP | Containers, images, logs, start/stop/restart |
| **Kubernetes** | Containers | kubeconfig content/path or in-cluster | Nodes, workloads, networking, storage, logs, shell, YAML editor |
| **Nginx Proxy Manager** | Network | API token or username/password | Proxy host CRUD, certificate CRUD, enable/disable hosts |
| **Network Tools** | Hardware | Local command execution | Ping/traceroute live streaming (SSE), speedtest history |
| **LLM Assistant** | Developer | API key (provider dependent) | OpenAI/Ollama/Anthropic/OpenWebUI chat + model listing |
| **Cloudflare** | Network | API token | Zones, DNS records CRUD, analytics, and zone settings |
| **Plex Media Server** | Media | X-Plex-Token | Active sessions, libraries, media actions, and server health |

### Planned Plugins

- Jellyfin, TrueNAS, Synology
- Grafana, Netdata, Uptime Kuma
- UPS/NUT, IPMI/BMC
- Radarr, Sonarr, Bazarr, Lidarr, Readarr, Jellyseerr
- Home Assistant, Homebridge

---

## Discovery (Phase 2)

Auto-discovery via mDNS/Bonjour to suggest plugins. Implemented as background task, suggestions shown in Plugin Manager.

---

## Notifications

Channels: Email (SMTP), Telegram, Webhook (HMAC-signed). Per-plugin events (VM stopped, pool degraded, update available).

---

## Container Architecture

```
Docker Container
├── FastAPI (:8000)
│   ├── /api/auth/*      Authentication
│   ├── /api/plugins/*   Plugin management
│   ├── /api/dashboard/* Aggregated data
│   ├── /api/settings/*  Settings
│   ├── /health          Liveness probe
│   └── /*               React SPA
├── SQLite ←→ /data/uhld.db
├── APScheduler (per-plugin polling)
└── Plugin Registry
    ├── proxmox/
    ├── docker/
    ├── adguard/
    ├── tailscale/
    └── ...
```

---

## Security Considerations

**Treat UHLD as an administrative dashboard.** An attacker who gains access can:
- View sensitive data from all connected services
- Start/stop/reboot VMs and containers
- Modify network configurations
- **Execute interactive shell in any running Kubernetes pod**
- **Apply arbitrary YAML to Kubernetes cluster** (equivalent to `kubectl apply`)

**Security best practices:**
- Use strong, unique passwords
- Keep UHLD on private network or VPN (do not expose to public internet)
- Access only via HTTPS with valid certificates
- Use separate credentials for UHLD
- Regularly rotate credentials for service accounts
- Back up and encrypt database (`/data/uhld.db`)

---

## Frontend Patterns

### Widget Contract

Every plugin's `Widget.tsx` receives a `summary` prop typed as the return value of `get_summary()`:

```typescript
interface Summary {
  status: "ok" | "error";
  message?: string;
  // plugin-specific metrics
}
```

Render in a fixed-height card (~180px). If `summary.status === "error"`, render error state.

### API Client Factory Pattern

```typescript
// frontend/src/api/client.ts
export function apiProxmox(instanceId?: string) {
  const baseURL = `/api/plugins/proxmox${instanceId ? `/${instanceId}` : ""}`;
  return {
    nodes: get<NodesResponse>(`${baseURL}/nodes`),
    storage: get<StorageResponse>(`${baseURL}/storage`),
    // etc.
  };
}
```

---

## Kubernetes Plugin Notes

- **Kubeconfig:** `kubeconfig_content` (sensitive/textarea) takes priority over `kubeconfig_path`. When content is provided, written to `tempfile.mkstemp` on `on_enable`, cleaned up on `on_disable`.
- **Client API:** Uses official `kubernetes` Python client (sync), wrapped with `loop.run_in_executor(None, lambda: fn(...))`.
- **Shell exec:** WebSocket bridge at `/pods/{namespace}/{pod}/exec`. `_read_loop` thread calls `resp.update(timeout=1)` exactly once per iteration, then pops stdout/stderr directly from `resp._channels` dict — bypasses `peek_stdout()`/`peek_stderr()` which trigger RSV WebSocket protocol errors.
- **Frontend:** `ShellTerminal` auto-detects working shell by trying `/bin/bash`, `/bin/sh`, `/bin/ash` etc. with 1-second no-data timeout.
- **Longhorn / HTTPRoutes:** Fetched via `CustomObjectsApi`. Returns empty lists gracefully if CRDs not installed.
- **YAML editor:** `_get_resource_yaml` sanitizes via `api_client.sanitize_for_serialization()` and strips `managedFields`. `_apply_resource_yaml` uses strategic merge patch.
- **YAML dry-run validation:** `/yaml/validate` performs Kubernetes API dry-run patch validation before apply.
- **MetalLB visibility:** Added MetalLB overview and CRD tabs (IPAddressPools, L2/BGP advertisements, peers, BFD profiles, communities).
- **etcd health:** Added etcd status endpoint/tab and optional notification alerts for etcd/node health changes during scheduled polling.

---

## Docker Plugin Notes

Uses `httpx.AsyncHTTPTransport(uds=socket_path)` for Unix socket access — no extra Python dependency. Falls back to TCP `host:port` when `host` is configured. Log streaming strips 8-byte Docker multiplexed stream header before sending text to frontend.

---

## UniFi Plugin Notes

Supports two auth paths:
- **Integration v1 (recommended):** `api_key` → `X-API-Key` header against `/proxy/network/integration/v1/...`. Requires site UUID via `GET /v1/sites`.
- **Session auth (fallback):** `username`+`password` cookie login against `/api/s/{site}/...`

All `_fetch_*` methods check `self._api_key()` and dispatch to either code path.

---

## Tailscale Plugin Notes

Two data sources:
- **Cloud API (required):** Bearer token against `api.tailscale.com/api/v2`. Powers Devices, Users, DNS, ACL tabs.
- **Local sidecar (optional):** Reads `/var/run/tailscale/tailscaled.sock`. Returns `{ available: false }` when socket doesn't exist.

ACL endpoint returns/accepts HuJSON (`Content-Type: application/hujson`). Frontend ACL editor strips `//` comments for client-side validation.

---

## Nginx Proxy Manager Plugin Notes

- Hosts and certificates now support full CRUD from UHLD without opening NPM UI.
- Host actions include explicit enable/disable routes to match NPM behavior.
- Access lists are fetched when available and gracefully fallback to empty on older NPM responses.

---

## Network Tools Plugin Notes

- Ping and traceroute support live line-by-line output via SSE endpoints (`/ping/stream`, `/traceroute/stream`).
- Streaming timeout handling is per-line to avoid killing long traceroute hops prematurely.
- Speedtest history values are normalized to Mbps before storage for consistent UI rendering.

---

## LLM Assistant Plugin Notes

- Provider-aware API handling supports OpenAI, Ollama, Anthropic, OpenWebUI, and custom-compatible endpoints.
- Anthropic uses `x-api-key`/`anthropic-version`; OpenAI-compatible providers use Bearer auth.
- Ollama model listing uses `/api/tags`; OpenAI-compatible providers use `/v1/models`.

---

## Implementation Order

### Sprint 1: Core Framework ✅
- Project scaffold, FastAPI app with auth, core DB models
- Plugin base class and registry
- Settings routes, plugin list/enable/disable/config API
- React app scaffold, login page, sidebar layout
- Plugin manager page, Docker build

### Sprint 2: First Plugin (Proxmox) ✅
- ProxmoxPlugin implementing PluginBase
- Proxmox API routes, Widget, View
- Health check, scheduled polling

### Sprint 3: Network/DNS Plugins ✅
- AdGuard Home, Pi-hole
- Tailscale (devices, users, DNS, ACL)
- UniFi (clients, devices, ports, networks, WiFi, firewall)

### Sprint 4: Container Plugins ✅
- Docker (containers, images, logs)
- Kubernetes (nodes, workloads, networking, storage, logs, shell, YAML)

### Sprint 5: Media & Storage (in progress)
- Plex (implemented), Jellyfin, TrueNAS, Synology

### Sprint 6: Polish
- Notifications (Telegram, email, webhook)
- Theme polish, accessibility, error handling
- k8s manifests, GitHub Actions workflow

---

## Related Projects

- **apt-ui:** https://github.com/mzac/apt-ui — self-hosted apt package management dashboard. UHLD inherits tech stack, auth pattern, credential encryption, Dockerfile structure, k8s manifests, CLI admin tool, dark industrial UI aesthetic from apt-ui.
