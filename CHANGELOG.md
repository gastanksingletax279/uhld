# Changelog

All notable changes to UHLD are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versions use `YYYY.MM.DD[-NN]` calendar-based tags.

---

## [2026.04.06-01] — 2026-04-06

### Added

#### HDHomeRun plugin (new)
- New **HDHomeRun** plugin under the Media category for live TV streaming and tuner monitoring
- **Device overview**: device name/model/firmware, tuner count, lineup status (source, scan state), and a live tuner status table showing active channels, signal strength (SS), signal quality (SNQ), symbol quality (SEQ), network rate, and target client IP
- **Single-channel player**: click any channel to open a draggable/resizable in-dashboard player overlay; streams via `ffmpeg` → fragmented MP4 over WebSocket → MSE; custom volume/mute/fullscreen/PiP controls; signal bars (SS/SNQ/SEQ) polled live in the header; **Stats for nerds** overlay (Activity button) showing resolution, FPS, bitrate, buffer depth, decoded/dropped frames, and tuner signal metrics
- **Multi-stream grid view** (the standout feature): select 2–4 channels and watch them simultaneously in a side-by-side grid. A single `ffmpeg` process handles all video tiles in one pass — no extra tuner slots consumed. Each grid cell uses a separate OS pipe for its audio track, all served from the same ffmpeg run. Switch audio between channels instantly (mute/unmute only — no reconnect, no stream restart). "Listen to All" button unmutes all channels simultaneously
- **Picture-in-Picture**: PiP button sends the video to the browser's native PiP window; the UHLD modal hides (stream stays alive); returning from PiP restores the full modal with the stream still running
- **Guide (EPG) tab**: 7-day programme guide with channel logos, programme titles, progress bars, and a programme detail panel with synopsis, episode title, duration, and a "Watch Now" shortcut
- **Scheduled recordings tab**: view current and upcoming HDHomeRun RECORD engine schedules with rule type and priority
- **Favorites**: star channels to float them to the top of the lineup
- **Channel search**: live filter across the full lineup
- **Signal bars widget**: `SignalMini` component renders SS/SNQ/SEQ as color-coded progress bars (green ≥ 80%, yellow ≥ 50%, red < 50%)
- **Scan**: trigger a lineup rescan directly from the UI
- **Plugin config**: host, port, stream format (ts/mp4), mute-by-default toggle, live streaming enable/disable guard (streams return `4403` close code when disabled)
- Backend uses `ffmpeg` with `frag_every_frame+empty_moov+default_base_moof` movflags for MSE-compatible fragmented MP4; audio uses AAC (`-c:a aac`) since `frag_keyframe` is meaningless for audio-only streams

#### UPS / NUT plugin (new)
- New **UPS / NUT** plugin under the Power category for monitoring UPS devices via the Network UPS Tools protocol
- Connects to a NUT server (upsd) over TCP using the NUT protocol: `USERNAME` → `PASSWORD` → `LOGIN <ups>` → queries
- **Device list**: all UPS devices reported by the NUT server with status badge (Online / On Battery / Low Battery / Unknown)
- **Device detail**: battery percentage, load percentage, runtime remaining, input/output voltage, and all raw NUT variables
- **Battery test**: trigger `test.battery.start` INSTCMD directly from the UI; requires `LOGIN <ups>` before INSTCMD (NUT protocol requirement enforced)
- **Power event notifications**: scheduled poll detects `OB` (on battery), `LB` (low battery), and `OL` (back on mains) transitions and fires alerts through the Notifications plugin

#### Dashboard — Sort controls
- Added **Sort A-Z** and **Sort by Type** buttons to the dashboard edit-layout toolbar, allowing quick reordering of all widgets

#### Settings — Sensitive field visibility toggle
- Password and API key fields in plugin config forms now have an **eye/eye-off toggle** to reveal the value while editing

#### Kubernetes — additional resource detail
- Added `ResourceDetail` component for clicking into individual Kubernetes resources (namespaces, CRDs, Helm charts, etc.)

### Fixed

- **`LOG_LEVEL=debug` crash**: `logging.basicConfig` requires uppercase level strings; added `.upper()` normalization so `LOG_LEVEL=debug` no longer crashes the backend on startup
- **NUT battery test "ERR USERNAME-REQUIRED"**: NUT protocol requires `LOGIN <upsname>` after `USERNAME`+`PASSWORD` before `INSTCMD` is accepted; added the missing `LOGIN` step
- **Kubernetes etcd/node health notifications**: wired etcd and node health change detection into the Notifications plugin during scheduled polling
- **Multi-stream audio race condition**: rewrote audio management to keep all N WebSocket connections open for the full session lifetime; channel switching now only mutes/unmutes audio elements — no SourceBuffer surgery or WS reconnects, eliminating the race that caused audio to stop working after the first switch

---

## [2026.04.04-01] — 2026-04-04

### Added

#### Proxmox — sidebar tree + Datacenter summary view
- Redesigned the Proxmox plugin to use a **left-sidebar tree** layout (Datacenter → Nodes → VMs/CTs), matching the native Proxmox GUI layout
- Added **Datacenter summary view** as the default landing page: cluster name, node online badge, 4 stat cards (nodes, CPU%, RAM, guests), and a full "All Guests" table with tag chips
- Added `GET /cluster/status` backend endpoint to fetch cluster name and per-node online state
- Added **VM/CT detail view**: clicking any VM or container in the tree navigates to a full detail page with stats, RRD performance charts (CPU, RAM, network I/O), network interfaces table, disk table, and configuration key/values
- Added `GET /nodes/{node}/qemu/{vmid}/config` and `GET /nodes/{node}/lxc/{vmid}/config` backend endpoints
- Added **VM tag support** — Proxmox tags (semicolon-separated) are parsed and rendered as accent-colored chips in the sidebar, VM detail header, and the Datacenter guest table
- RRD chart time axis now correctly differentiates `hour` (time only), `day` (date + time), and `week/month` (date) tick formats

#### LLM Assistant — Infrastructure Status button
- Added **📊 Infrastructure Status** button to the LLM Assistant header that fetches the current dashboard summary and sends it as a prompt, letting users ask questions about their live infrastructure state

#### Remote Packet Capture — comprehensive overhaul
- **Remote (SSH) mode is now the default** — the UI leads with remote-first since that is the primary use case
- Added **SSH host badge** in the header showing the configured capture target (`user@host`) at a glance
- Added **GET /info** endpoint returning non-sensitive SSH connection info for the UI
- Replaced packet count-only termination with a **Packets / Duration toggle** — capture for N packets or N seconds, or both simultaneously
- Added **36 presets** organized into 7 groups: Web, DNS/DHCP, Infrastructure, Remote Access, Routing, Mail/File, Utilities (including DHCP, mDNS, LLDP, STP, BGP, OSPF, RDP, SMB, NetFlow, sFlow, TACACS+, and more)
- Added **MAC address filter field** in the simple filter builder → generates `ether host AA:BB:CC:DD:EE:FF` BPF syntax
- Added **Output Options panel** (collapsible): snaplen (`-s`), payload display (none / ASCII `-A` / Hex+ASCII `-X`), verbosity (default / `-v` / `-vv` / `-vvv`), timestamp format (5 options), print Ethernet headers (`-e`)
- Added **live command preview** — shows the exact `ssh user@host "tcpdump …"` command that will execute, updating in real-time as settings change
- Added **live streaming capture** — packets stream line-by-line via SSE as they are captured; packet lines in green, tcpdump stderr in yellow; animated cursor while running
- Added **in-output search** with match highlighting — filter and highlight text within the live capture output
- Added **Download PCAP** button — runs a fresh capture with `-w -` and downloads a binary `.pcap` file (open in Wireshark)
- Added `GET /interfaces?remote=true/false` endpoint — reads `/proc/net/dev` locally or via SSH; interface field becomes a dropdown populated with real interfaces
- Added **stop button** to abort an in-progress streaming capture
- Added **delete button** with inline confirmation on each history entry
- Added `DELETE /captures/{id}` backend endpoint

#### Cloudflare — graceful analytics degradation
- DNS Analytics (`/dns_analytics/report`) now degrades gracefully when the API token lacks `DNS Analytics Read` permission — returns empty metrics with `analytics_unavailable: true` flag instead of polluting logs with 403 warnings on every poll cycle
- Frontend Analytics tab shows a yellow notice banner explaining which token permission is missing

### Fixed
- **VM config load error** in Proxmox VM detail view now shows an error banner instead of silently rendering an empty config panel
- **Proxmox RRD day-view chart** axis ticks now show date + time instead of time-only (which was identical to the hour view)

---

## [2026.04.01-01] — 2026-04-01

### Added

#### Cloudflare plugin (new)
- Added a new **Cloudflare** plugin with zone-level monitoring and management.
- Added zone operations for pause/unpause and cache purge.
- Added DNS record workflows (list/get/create/update/delete).
- Added per-zone analytics and security/settings retrieval for dashboard and detail views.

#### Plex Media Server plugin (new)
- Added a new **Plex** plugin with server health and active session monitoring.
- Added session management actions including terminate, pause, resume, stop, and seek.
- Added library and media workflows, including library scan/refresh and item-level refresh/delete actions.

#### Kubernetes plugin — MetalLB and etcd visibility
- Added dedicated Kubernetes API routes and frontend tabs for **MetalLB** resources:
  - overview, IPAddressPools, L2Advertisements, BGPAdvertisements, BGPPeers, BFDProfiles, Communities
- Added **etcd cluster status** endpoint and UI view, including member readiness and restart visibility.
- Added Kubernetes summary metrics for MetalLB and etcd to the dashboard widget.

#### Kubernetes plugin — YAML validation and alerts
- Added `POST /api/plugins/kubernetes/{instance}/yaml/validate` for dry-run YAML validation before apply.
- Added optional Kubernetes plugin alert settings for etcd and node health changes, integrated with the Notifications system.

#### User-level UI persistence and version endpoint
- Added per-user backend persistence for sidebar menu structure:
  - `GET /api/users/me/menu-structure`
  - `PUT /api/users/me/menu-structure`
- Added application version endpoint:
  - `GET /api/version`

### Fixed

#### Sidebar menu persistence
- Sidebar structure now syncs to backend user preferences in addition to localStorage, improving cross-session and cross-device consistency.

#### Kubernetes resource editing UX
- Added pre-apply validation flow support in API/client to reduce YAML patch/apply failures at submission time.

#### Security hardening
- Removed exception-detail exposure from Network Tools SSE stream errors to avoid leaking internal traceback/context to clients.
- Updated frontend lockfile to `lodash@4.17.21` to remediate open high/medium Dependabot advisories.

## [2026.03.31-05] — 2026-03-31

### Added

#### Network Tools — real-time command streaming
- Added **Server-Sent Events (SSE)** streaming endpoints for live diagnostics:
  - `POST /api/plugins/network_tools/{instance}/ping/stream`
  - `POST /api/plugins/network_tools/{instance}/traceroute/stream`
- Frontend now consumes streamed output and renders ping/traceroute lines as they arrive instead of waiting for command completion.

#### Nginx Proxy Manager — in-app management workflows
- Added full **proxy host CRUD** support from UHLD UI:
  - list/get/create/update/delete hosts
  - explicit host enable/disable actions
- Added full **certificate CRUD** support from UHLD UI:
  - list/get/create/update/delete certificates
- Added access-list fetch support for host forms where NPM exposes access lists.

#### LLM Assistant — multi-provider compatibility
- Added provider-aware support for **OpenAI**, **Ollama**, **Anthropic (Claude)**, **OpenWebUI**, and custom-compatible APIs.
- Added provider-specific model discovery and request formatting:
  - Ollama: `/api/tags`, `/api/chat`
  - Anthropic: `/v1/messages` with `x-api-key`
  - OpenAI/OpenWebUI-compatible: `/v1/models`, `/v1/chat/completions`
- Added model override and temperature controls in the UI with improved interaction flow.

### Fixed

#### Sidebar — menu order persistence
- Fixed a regression where customized sidebar order could reset after reload when plugin state refreshed.
- Sidebar now initializes from stored menu structure and performs non-destructive reconciliation on plugin list changes.

#### Network Tools — speedtest data consistency
- Normalized speedtest history storage/rendering so bandwidth values display consistently as Mbps/Gbps instead of raw byte-rate values.

---

## [2026.03.31-04] — 2026-03-31

### Added

#### Sidebar — menu customization with sections
- **Create sections (folders)** to organize plugins — perfect for grouping by function (e.g., "Home Automation", "Media", "Network")
- **Drag and drop** to reorder plugins within sections, move plugins between sections, or reorder sections themselves
- **Collapsible sections** with expand/collapse controls and visual folder icons (open/closed states)
- **Section management**: rename sections inline by clicking the label when editing, delete sections (items move back to unsectioned)
- **Sort alphabetically** button in edit mode — sorts all plugins and sections A-Z in one click
- **Persistent storage** — menu structure stored in localStorage, survives refreshes and restarts
- **Auto-sync** — new plugins automatically appear in the unsectioned area sorted by category
- Edit mode toolbar with dedicated "Sort A-Z" and "+ Section" buttons

### Fixed

#### Network Tools — speedtest display formatting
- **Backend**: Speedtest results now convert bytes/sec to Mbps when storing in history
  - Download/upload speeds properly calculated: `(bytes_per_second * 8) / 1_000_000`
  - History items store clean Mbps values instead of raw byte counts
- **Frontend**: Formatted speedtest display with human-readable units
  - Immediate results show formatted output with emojis (🚀 ⬇️ ⬆️ 📶) and proper units
  - Auto-converts to Gbps when speed exceeds 1000 Mbps (e.g., "1.2 Gbps" instead of "1200 Mbps")
  - History display enhanced with color-coded arrows (green ↓ download, blue ↑ upload)
  - Full timestamp (date + time) in history entries
  - Server sponsor information displayed where available
  - Speedtest history auto-loads on component mount
- **Example**: Raw `59493124.43` bytes/sec now displays as `475.9 Mbps`

---

## [2026.03.31-03] — 2026-03-31

### Added

#### Proxmox — host drill-down dashboard
- Proxmox node cards in the main Proxmox view are now clickable and open a dedicated host detail screen
- Host detail includes a timeframe selector (`hour`, `day`, `week`, `month`) and time-series charts for CPU, memory, network, and disk metrics
- Added new Proxmox backend endpoints for RRD data:
  - `GET /api/plugins/proxmox/nodes/{node}/rrddata`
  - `GET /api/plugins/proxmox/nodes/{node}/qemu/{vmid}/rrddata`
  - `GET /api/plugins/proxmox/nodes/{node}/lxc/{vmid}/rrddata`

#### Proxmox — cluster topology tree
- Added a new Tree View tab in the Proxmox frontend to display node → VM/CT hierarchy
- Added backend topology endpoint: `GET /api/plugins/proxmox/cluster/resources`
- Backend now aggregates cluster resources by type and deduplicates results for more consistent rendering across single-node and clustered Proxmox setups

### Fixed
- **Proxmox tree view empty state**: normalized resource type handling (`qemu`, `vm`, `lxc`) and node name derivation (`node`, `name`, `id`) so tree nodes and children attach correctly
- **Proxmox host charts with missing memory/disk series**: added fallback metric key handling for multiple RRD field variants (including memory and root disk usage fields) and automatic disk chart fallback from I/O to disk usage when I/O series are unavailable
- **Proxmox sorting consistency**: VM lists and tree children now use numeric-aware, case-insensitive alphabetical sorting with VMID numeric tie-breaks, preventing incorrect orders like `1000` before `100`

---

## [2026.03.31-02] — 2026-03-31

### Added

#### Authentication — TOTP 2FA
- Users can now enroll a **TOTP authenticator** (Google Authenticator, Authy, etc.) from **Settings → Account**
- Setup flow: generate secret → scan QR code or copy manual key → confirm with a live code to activate
- On login, users with TOTP enabled are prompted for their 6-digit code after entering their password (partial JWT prevents access until the second factor is verified)
- Disable TOTP by confirming with the current code — no accidental removal
- TOTP secrets are **Fernet-encrypted** in the database — never stored in plaintext

#### Authentication — Passkeys (WebAuthn / FIDO2)
- Register hardware security keys (YubiKey, etc.) or **platform authenticators** (Touch ID, Face ID, Windows Hello) from **Settings → Account**
- Name each passkey for easy management; rename or delete individual keys at any time
- Passkey login button on the login page — full passwordless sign-in flow
- `rp_id` and `expected_origin` are **automatically derived** from the incoming request's `Origin` header when `WEBAUTHN_RP_ID` / `WEBAUTHN_ORIGIN` env vars are not set — zero configuration needed for typical homelab use

#### Authentication — OAuth / OIDC social login
- Support for **Microsoft Entra ID** (Azure AD), **Google**, and **GitHub** as identity providers
- Configured entirely via environment variables — no code changes needed to add a provider
- Optional `OAUTH_AUTO_PROVISION=true` to automatically create local accounts on first OAuth login
- Existing accounts can be linked to an OAuth provider; callback redirects with a clear error when no account match is found and auto-provisioning is off

#### Multi-user with roles
- **Role-based access control**: `admin` and `viewer` roles
  - `admin` — full access including Settings, plugin configuration, user management, and all write operations
  - `viewer` — read-only dashboard and plugin views
- New **Settings → Users** tab (admin only): list all users with role badge, 2FA status, and active/disabled state; create/delete users; toggle role; toggle active; admin password reset
- New **Settings → Account** tab (all users): change password, manage TOTP, manage passkeys
- `is_active` flag — disabled accounts cannot log in
- Database migration adds `role`, `is_active`, `totp_secret`, `totp_enabled` columns to existing `users` tables on startup

#### Kubernetes — pod detail modal
- Click any pod name in the Pods list to open a **detail panel** showing: phase, node, IP, QoS class, all init and app containers (image, state, ready, restart count, resource requests/limits, ports), pod volumes (type, name/path), and the last 10 cluster events for that pod

#### Kubernetes — node actions
- **Cordon** — mark a node as unschedulable (new pods will not be scheduled there)
- **Uncordon** — restore a cordoned node to schedulable
- **Drain** — cordon + evict all non-DaemonSet pods; confirmation dialog explains the impact before proceeding
- **Delete** — remove the node object from the cluster; separate confirmation with drain reminder
- Node list shows a **SchedulingDisabled** badge on cordoned nodes

#### UniFi — trunk port network names
- Tagged VLANs on switch ports now display the **network name** alongside the VLAN ID (e.g. `IoT — VLAN 30`)
- The sentinel `"all"` tagged-networkconf ID is filtered out to prevent spurious empty entries

### Fixed
- **`migrate_db()` early return bug**: `return` statements inside the `plugin_configs` migration block were exiting the entire function, causing the `users` and `assets` table migrations to be silently skipped on databases that had already had the `instance_id` column applied. All three migration sections now run independently.
- **WebAuthn API compatibility** (`webauthn` 2.x): removed calls to non-existent `parse_registration_credential_json` / `parse_authentication_credential_json`; `bytes_to_base64url` and `base64url_to_bytes` moved to the correct `webauthn.helpers` path
- **WebAuthn `rp.id` origin mismatch**: hardcoded `localhost` default caused browser rejection when accessing UHLD via any other hostname or IP; now auto-derived from request `Origin` header

---

## [2026.03.31-01] — 2026-03-31

### Added

#### Notifications plugin (new)
- New **Notifications** plugin under the Automation category
- Supports three delivery channels: **Email** (SMTP with STARTTLS/SSL), **Telegram** (bot token + chat ID), and **Webhook** (HMAC-SHA256 signed HTTP POST)
- Per-channel enable/disable toggles and a minimum notification level filter (`info` / `warning` / `error`)
- Automatic health-check polling: periodically checks all enabled plugins and fires an alert when a plugin transitions between healthy and degraded states
- Notification history stored in the database — paginated table with level filter, unread-only toggle, mark-all-read, and clear-history actions
- **Channel test buttons**: send a live test notification to any configured channel directly from the Channels tab, with inline success/error feedback
- Integrates with the rest of the app: other plugins call `send_notification()` to route alerts through whichever channels are configured

#### Configuration backup & restore (new)
- New backup API (`/api/backup/`) for creating, listing, and downloading JSON exports of the full application config (plugin configs, settings, users)
- Restore from a previously downloaded backup file via the Settings UI
- Scheduled backup support: configure an interval and the system automatically creates rotating backups

#### Sidebar — drag-and-drop reorder
- Plugin nav items in the sidebar are now **reorderable**: click the **pencil icon** next to the Dashboard link to enter edit mode, drag items to any position, then click the checkmark to exit
- Drag handles are hidden when not in edit mode so normal navigation is unaffected
- Order is persisted in `localStorage` and survives page reloads; new plugins are appended at the bottom automatically

#### Dashboard — multi-instance widget labels
- When more than one instance of a plugin is enabled, **all** widget cards (including the default instance) now display their instance label below the plugin name, making it immediately clear which card is which (e.g. "Proxmox — Home Lab" vs "Proxmox — Work Cluster")

#### Docker — major overhaul
- **Overview tab** (new default): Docker host info card (version, OS, kernel, arch, CPUs, RAM, storage driver), container state tiles (running / paused / stopped / images), and a recent-events table showing the last hour of Docker events
- **Container detail modal**: click any container name to open a panel showing image, ID, command, created time, live CPU/memory/network stats with progress bars, and a 50-line log preview — with a "Full Logs" shortcut button
- **Improved logs modal**: keyword filter bar with live match count, error lines highlighted red, warning lines highlighted yellow, **live tail** toggle that streams logs over WebSocket in real-time (auto-scrolls, capped at 2000 lines)
- New backend endpoints: `GET /info`, `GET /events`, `GET /containers/{id}/stats`, `WS /containers/{id}/logs/stream`

#### Tailscale
- **ACL tag selector**: opening "Edit ACL Tags" on a device now silently fetches the tailnet policy and parses all `tag:*` entries — a **Policy tags** chip row appears below the input, filtered live as you type, so you can click to add existing tags instead of typing them manually

#### Kubernetes
- **Auto-refresh unhealthy pods**: the Pods list polls every 10 seconds when any pod is in `Pending`, `Unknown`, `Failed`, or a `BackOff` state, automatically stopping when all pods return to Running
- **Shift-select bulk operations**: hold Shift to range-select pods in the list
- **Sticky action bar**: multi-select action toolbar sticks to the bottom of the viewport when scrolling
- **Bulk restart confirmation**: confirm dialog before restarting multiple pods at once

### Fixed
- **Plugin enable/configure modal overflow**: the Enable and Configure modals are now capped at 90% of the viewport height with a scrollable body, so plugins with many config fields (e.g. Notifications, Kubernetes) no longer extend beyond the screen boundaries
- **Assets plugin 500 errors**: the `Asset` SQLAlchemy model was missing all columns except `id` and `name` — the fields had been accidentally placed on `Notification` instead. Moved all asset fields (`asset_type`, `role`, `manufacturer`, `model`, `cpu`, `cpu_cores`, `ram_gb`, `storage`, `gpu`, `os`, `ip_address`, `notes`, `created_at`, `updated_at`) to the correct model. A `migrate_db()` step adds the missing columns to existing databases on startup.
- **Sidebar multi-instance highlight**: plugin nav links now use exact path matching — clicking "Docker (prod)" no longer keeps "Docker (dev)" highlighted at the same time
- **Instance content switching**: navigating between two instances of the same plugin (e.g. two Docker or Kubernetes instances) now correctly remounts the view and reloads data for the selected instance

---

## [2026.03.30-02] — 2026-03-30

### Added
- **Asset Inventory plugin**: track hardware, VMs, and services with custom fields, tags, and status tracking (closes #5)

---

## [2026.03.30-01] — 2026-03-30

### Added
- Kubernetes pod shell exec (interactive terminal via WebSocket)
- Kubernetes YAML editor (view and apply resource YAML)
- Kubernetes Longhorn and HTTPRoute custom resource support
- Tailscale subnet/exit-node routes display per device
- Sidebar instance labels always shown when multiple instances of the same plugin are enabled

### Fixed
- Kubernetes WebSocket shell RSV protocol errors (`_read_loop` bypasses `peek_stdout/stderr`)
- Tab state persisted per plugin instance across navigation

---

## [2026.03.28] — 2026-03-28

### Added
- Multi-instance support: any plugin can be enabled multiple times with independent configs
- Instance management UI in Settings (add/configure/delete instances per plugin)
- Plugin routes scoped per instance: `/api/plugins/{id}/` (default) and `/api/plugins/{id}/{instance_id}/`
- Reserved instance ID validation: `enable`, `disable`, `config`, `health`, `clear`, `instances`
- Kubernetes plugin: nodes, workloads (pods, deployments, statefulsets, daemonsets, jobs, cronjobs), networking (services, ingresses, network policies), storage (PVCs, storage classes), real-time log streaming, interactive shell

### Fixed
- `migrate_db()` safely adds `instance_id`/`instance_label` columns to existing databases without data loss

---

## [2026.03.25] — 2026-03-25

### Added
- Docker plugin: container list, images, start/stop/restart, log viewer, interactive shell via xterm.js
- UniFi plugin: clients, devices, port management, networks, WiFi, firewall rules (API-key and session auth)
- Tailscale plugin: devices, users, DNS, ACL editor (HuJSON), auth keys, tailnet settings, device actions (rename, set IP, routes, tags, key expiry)
- Pi-hole plugin: stats, query log, blocking toggle
- AdGuard Home plugin: stats, query log, protection toggle

---

## [2026.03.20] — 2026-03-20

### Added
- Proxmox VE plugin: nodes, VMs/LXC, storage, start/stop/reboot, task log, scheduled polling
- Core plugin framework: `PluginBase`, registry, enable/disable lifecycle, APScheduler polling
- JWT authentication (httpOnly cookie), first-run `admin/admin` setup flow, change-password modal
- Settings page: plugin manager with dynamic JSON schema config forms
- Dashboard grid with per-plugin summary widgets
- Dark industrial UI (Tailwind, Zustand, Recharts, lucide-react)
- Multi-stage Docker build, Docker Compose, Kubernetes manifests
- Admin CLI: `create-user`, `reset-password`, `list-users`, `set-setting`
- Fernet encryption for sensitive plugin config fields
