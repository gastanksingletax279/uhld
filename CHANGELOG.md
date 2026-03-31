# Changelog

All notable changes to UHLD are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versions use `YYYY.MM.DD[-NN]` calendar-based tags.

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
