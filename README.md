# UHLD — Ultimate Homelab Dashboard

> **Work in progress — under active development.**

A self-hosted, plugin-driven dashboard for your homelab. Monitor and manage your entire infrastructure from a single unified interface.

> Built entirely using [Claude Code](https://claude.ai/code), Anthropic's agentic coding tool.

![UHLD Dashboard](images/dashboard.png)

---

## What it is

UHLD is the homelab equivalent of Home Assistant — but for **infrastructure** instead of home automation. Deploy it as a single Docker container, enable plugins for the services you already run, and get a unified dashboard to monitor and interact with your entire homelab from one place.

No agent installs, no external databases, no cloud dependencies. One container. SQLite. Done.

---

## Key Features

### 🔌 Plugin Architecture
Every integration is a self-contained plugin. Enable only what you need — each plugin has its own sidebar entry, dashboard widget, and full-page view. Any plugin can be enabled multiple times with independent configs (two Proxmox clusters, two UniFi controllers, etc.).

### 🔐 Authentication & Multi-User
Full multi-user support with admin and viewer roles. Multiple authentication methods available simultaneously:

| Method | Details |
|--------|---------|
| **Username + Password** | bcrypt-hashed; forced change on first login |
| **TOTP 2FA** | Google Authenticator, Authy, any TOTP app |
| **Passkeys / WebAuthn** | YubiKey, Touch ID, Face ID, Windows Hello — no password needed |
| **OAuth / OIDC** | Microsoft Entra ID (Azure AD), Google, GitHub |

### 📊 Dashboard
- Drag-to-reorder widget tiles, persisted per-browser
- Sort widgets A-Z or by type in one click
- Collapsible sidebar sections — group plugins however you like
- Per-plugin summary widgets with live status

### 🔔 Notifications
Email (SMTP), Telegram, and HMAC-signed webhooks. Alerts fire automatically when any plugin transitions between healthy and degraded states. Per-channel enable/disable and minimum severity filters. Full notification history with read/unread tracking.

### 🤖 LLM Assistant
Chat with your infrastructure. Connects to OpenAI, Anthropic (Claude), Ollama, OpenWebUI, or any OpenAI-compatible API. The **Infrastructure Status** button fetches a live snapshot of all enabled services and builds a detailed prompt — the LLM responds with a structured health report, identified issues, capacity observations, and prioritized action items.

### 🔒 Credential Security
All plugin secrets (API keys, passwords, tokens) are **Fernet-encrypted** before being stored in SQLite. Sensitive fields are masked in the UI and never logged. The encryption key never leaves your server.

### 💾 Config Backup & Restore
Full JSON export of all plugin configs, settings, and users. Restore from a backup file via the Settings UI. Scheduled automatic backups with rotation.

---

## Plugin Status

### ✅ Virtualization & Containers

| Plugin | What you can do |
|--------|----------------|
| **Proxmox VE** | Sidebar tree (Datacenter → Node → VM/CT), datacenter summary, VM/CT detail with RRD performance charts, start/stop/reboot, tag chips, topology tree view |
| **Docker** | Container list with live state, start/stop/restart, real-time log streaming with keyword filter, container stats (CPU/RAM/net), Docker host overview, event log |
| **Kubernetes** | Nodes (cordon/drain/delete), workloads, networking, storage, live log stream, **interactive pod shell**, YAML editor with dry-run validation, MetalLB CRDs, etcd health |

### ✅ Network & DNS

| Plugin | What you can do |
|--------|----------------|
| **UniFi** | Client list, device list, switch port detail (trunk/access/VLAN names), networks, WiFi, firewall rules — supports API key and session auth |
| **AdGuard Home** | Query stats, query log, enable/disable protection |
| **Pi-hole** | Query stats, query log, enable/disable blocking |
| **Tailscale** | Devices, users, DNS settings, HuJSON ACL editor, auth keys, sidecar local status |
| **Nginx Proxy Manager** | Full proxy host CRUD, certificate CRUD, enable/disable hosts — no need to open NPM |
| **Cloudflare** | Zone list, DNS record CRUD, analytics, zone settings, cache purge, zone pause/unpause |
| **Network Tools** | Live ping/traceroute/MTR streaming, port check, HTTP check, SSL certificate inspector, dig, iPerf3 bandwidth test, Wake-on-LAN, speedtest with history |
| **Remote Packet Capture** | tcpdump over SSH or local; live SSE output stream; PCAP binary download; 36 presets across 7 groups; interface discovery; output flags, MAC filter, duration cap |
| **Patch Panel** | Document patch panel ports, linked devices, and switch port mappings |

### ✅ Media

| Plugin | What you can do |
|--------|----------------|
| **Plex** | Active session monitoring, library list, media actions (pause/resume/terminate/seek), server health |
| **HDHomeRun** | Live TV single-channel player; **multi-stream grid** (2–4 channels simultaneously); 7-day EPG guide; signal bars; Picture-in-Picture; stats overlay |

### ✅ Storage

| Plugin | What you can do |
|--------|----------------|
| **Synology DSM** | System info (model/version/temperature), CPU & RAM utilisation, volume health, disk list with SMART test trigger, shared folder list, Download Station management (add/pause/resume/delete tasks), package start/stop, basic file browser |

### ✅ Power

| Plugin | What you can do |
|--------|----------------|
| **UPS / NUT** | Battery %, load %, runtime remaining, input/output voltage, all raw NUT vars; power event notifications (on-battery / low-battery / back-on-mains) via Notifications plugin |

### ✅ Utility & Automation

| Plugin | What you can do |
|--------|----------------|
| **LLM Assistant** | Chat interface for OpenAI / Anthropic / Ollama / OpenWebUI; infrastructure status analysis prompt |
| **Notifications** | Email, Telegram, HMAC webhook; auto-alerts on plugin health transitions; notification history |
| **Tasks & Incidents** | Infrastructure task queue and incident tracker |
| **Asset Inventory** | Lightweight CMDB — track servers, switches, VMs with hardware specs and notes |

### 🔜 Planned

| Plugin | Category |
|--------|----------|
| Jellyfin | Media |
| TrueNAS | Storage |
| Grafana | Monitoring |
| Radarr / Sonarr / arr stack | Media Automation |
| Home Assistant | Automation |
| IPMI / BMC | Hardware |
| ArgoCD | Developer |
| AWX / Semaphore | Automation |

---

## Spotlight: HDHomeRun Multi-Stream Grid

One of the most unique features in UHLD — watch **2–4 live TV channels simultaneously** in a side-by-side grid, all from the browser.

**How it works under the hood:** A single `ffmpeg` process encodes all channels into one video grid, using OS pipes to deliver per-channel audio streams in parallel. This means watching 4 channels consumes the same number of tuner slots as watching 1 — no wasted hardware resources.

**Audio control:** Each channel has a dedicated audio pipeline. Switch audio sources instantly — no stream restart, no reconnect, no buffering delay. Hit **"Listen to All"** to unmute every channel simultaneously (useful for monitoring).

**Picture-in-Picture:** Click the PiP button and the UHLD modal disappears entirely while the browser's native PiP window keeps playing. The full modal restores automatically when PiP exits — stream never stops.

**Stats overlay:** An Activity button shows a live stats panel over the video: resolution, FPS, bitrate, buffer depth, decoded/dropped frame counts, and live tuner signal metrics (SS/SNQ/SEQ).

---

## Tech Stack

- **Backend:** Python 3.12, FastAPI, SQLAlchemy async + aiosqlite, APScheduler
- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, Zustand, dnd-kit, Recharts, lucide-react
- **Auth:** JWT (httpOnly cookie), bcrypt, TOTP (`pyotp`), WebAuthn (`py-webauthn`), OAuth 2.0 / OIDC
- **Storage:** SQLite — zero external dependencies
- **Deployment:** Multi-stage Docker (node:20-alpine → python:3.12-slim)

---

## Quick Start

### Requirements

- Docker and Docker Compose

### 1. Generate secrets

```bash
python -c "import secrets; print(secrets.token_hex(32))"                                # JWT_SECRET
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"  # ENCRYPTION_KEY
```

### 2. docker-compose.yml

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

### 3. Start

```bash
docker compose up -d
```

Open `http://localhost:8222`. Default login is **`admin` / `admin`** — you'll be prompted to change the password immediately.

### 4. Enable plugins

Go to **Settings → Plugins**, find the services you run, click **Enable**, fill in the connection details, and save. Each enabled plugin appears in the sidebar and gets a dashboard widget automatically.

---

## ⚠️ Security

UHLD is an **administrative dashboard** with broad access to your infrastructure. Treat it accordingly.

**Minimum security baseline:**
- ✅ Change the default `admin/admin` password immediately
- ✅ Enable TOTP 2FA or register a passkey (Settings → Account)
- ✅ Keep UHLD on a private network — access remotely via **Tailscale VPN**
- ✅ Use HTTPS in production
- ✅ Use separate service-account credentials for each plugin (not your personal login)

**Never:**
- ❌ Expose UHLD directly to the public internet without TLS + strong auth
- ❌ Share or commit the `JWT_SECRET` or `ENCRYPTION_KEY`

> Kubernetes users: UHLD can exec into any running pod and apply arbitrary YAML to your cluster. This is equivalent to having full `kubectl` access. Restrict who can log in.

For security vulnerabilities, contact the maintainers privately — do not open a public issue.

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `JWT_SECRET` | **Yes** | — | JWT signing secret |
| `ENCRYPTION_KEY` | **Yes** | — | Fernet key for encrypting plugin credentials |
| `DATABASE_PATH` | No | `/data/uhld.db` | SQLite database path |
| `TZ` | No | `America/Montreal` | Timezone for scheduler |
| `LOG_LEVEL` | No | `INFO` | Python log level (`DEBUG`, `INFO`, `WARNING`) |
| `WEBAUTHN_RP_ID` | No | auto | Passkey relying-party ID — hostname only |
| `WEBAUTHN_RP_NAME` | No | `UHLD` | Display name shown in passkey prompts |
| `WEBAUTHN_ORIGIN` | No | auto | Full origin URL for WebAuthn |
| `OAUTH_BASE_URL` | No | — | Base URL of this UHLD instance (for OAuth redirects) |
| `OAUTH_AUTO_PROVISION` | No | `false` | Auto-create accounts on first OAuth login |
| `OAUTH_ENTRA_CLIENT_ID` | No | — | Microsoft Entra ID app client ID |
| `OAUTH_ENTRA_CLIENT_SECRET` | No | — | Microsoft Entra ID app client secret |
| `OAUTH_ENTRA_TENANT_ID` | No | — | Entra tenant ID or `common` |
| `OAUTH_GOOGLE_CLIENT_ID` | No | — | Google OAuth 2.0 client ID |
| `OAUTH_GOOGLE_CLIENT_SECRET` | No | — | Google OAuth 2.0 client secret |
| `OAUTH_GITHUB_CLIENT_ID` | No | — | GitHub OAuth app client ID |
| `OAUTH_GITHUB_CLIENT_SECRET` | No | — | GitHub OAuth app client secret |

---

## Plugin Configuration

All plugin setup is done through **Settings → Plugins** — no config files, no environment variables per plugin. Each plugin's form is generated dynamically from its JSON Schema. Sensitive fields are encrypted at rest and masked in the UI.

**Multi-instance:** Any plugin can run as multiple independent instances. Click **Add instance** in Settings → Plugins to add a second connection (e.g., a home lab Proxmox + a work Proxmox). Each instance gets its own sidebar link, dashboard tile, and isolated config.

---

## Tailscale Sidecar (optional)

Run UHLD as a Tailscale node for private HTTPS access over your tailnet. See `docker-compose.local.yml` for reference — requires `TS_AUTHKEY` in `.env.local`.

When the sidecar is active, the Tailscale plugin shows a live local status bar (node name, IP, connection state) in addition to the cloud API data.

---

## Development

```bash
# Backend (hot reload)
pip install -r requirements.txt
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000

# Frontend (Vite dev server — proxies /api/* to :8000)
cd frontend && npm install && npm run dev

# Docker build
./build-run.sh
```

---

## Related Projects

[apt-ui](https://github.com/mzac/apt-ui) — self-hosted apt package management dashboard. Same tech stack, same architecture, also built entirely with Claude Code.

---

## License

MIT
