# Changelog

All notable changes to UHLD are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versions use `YYYY.MM.DD[-NN]` calendar-based tags.

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
