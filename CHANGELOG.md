# Changelog

All notable changes to UHLD are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versions use `YYYY.MM.DD[-NN]` calendar-based tags.

---

## [Unreleased] — 2026-03-31

### Added

#### Docker — major overhaul
- **Overview tab** (new default): Docker host info card (version, OS, kernel, arch, CPUs, RAM, storage driver), container state tiles (running / paused / stopped / images), and a recent-events table showing the last hour of Docker events
- **Container detail modal**: click any container name to open a panel showing image, ID, command, created time, live CPU/memory/network stats with progress bars, and a 50-line log preview — with a "Full Logs" shortcut button
- **Improved logs modal**: keyword filter bar with live match count, error lines highlighted red, warning lines highlighted yellow, **live tail** toggle that streams logs over WebSocket in real-time (auto-scrolls, capped at 2000 lines)
- New backend endpoints: `GET /info`, `GET /events`, `GET /containers/{id}/stats`, `WS /containers/{id}/logs/stream`
- New API client types: `DockerInfo`, `DockerEvent`, `DockerStats`

#### Tailscale
- **ACL tag selector**: opening "Edit ACL Tags" on a device now silently fetches the tailnet policy and parses all `tag:*` entries — a **Policy tags** chip row appears below the input, filtered live as you type, so you can click to add existing tags instead of typing them manually

#### Kubernetes
- **Auto-refresh unhealthy pods**: the Pods list polls every 10 seconds when any pod is in `Pending`, `Unknown`, `Failed`, or a `BackOff` state, automatically stopping when all pods return to Running
- **Shift-select bulk operations**: hold Shift to range-select pods in the list
- **Sticky action bar**: multi-select action toolbar sticks to the bottom of the viewport when scrolling
- **Bulk restart confirmation**: confirm dialog before restarting multiple pods at once

### Fixed
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
