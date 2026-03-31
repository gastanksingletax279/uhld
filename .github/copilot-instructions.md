# UHLD — GitHub Copilot Instructions

UHLD is a self-hosted, plugin-driven homelab management dashboard.
Full architecture: [CLAUDE.md](../CLAUDE.md) | Feature backlog: [TODO.md](../TODO.md) | Deep architecture: [ARCHITECTURE.md](../ARCHITECTURE.md)

---

## Build & Dev Commands

```bash
# Backend dev (run from repo root)
pip install -r requirements.txt
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000

# Frontend dev (Vite proxies /api/* → :8000)
cd frontend && npm install && npm run dev

# Type check + build frontend
cd frontend && npm run build   # runs tsc --noEmit + vite build → outputs to ../static/

# Docker local build (requires .env.local — see below)
./build-run-local.sh

# Python formatting
black backend/

# Admin CLI
python -m backend.cli create-user admin yourpassword
python -m backend.cli reset-password admin newpassword
```

> **Note:** No test suite exists yet (`backend/tests/` is absent).

### Local Docker requires `.env.local`

`./build-run-local.sh` exits immediately if `.env.local` is missing. Create it:

```bash
JWT_SECRET=$(python -c "import secrets; print(secrets.token_hex(32))")
ENCRYPTION_KEY=$(python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")
TS_AUTHKEY=tskey-client-...   # required even when not using Tailscale sidecar
TS_HOSTNAME=uhld-dev
```

---

## Architecture

- **Backend:** FastAPI + SQLAlchemy async (aiosqlite) + APScheduler. See [backend/](../backend/).
- **Frontend:** React 18 + TypeScript + Vite + Tailwind + Zustand. Vite `outDir` = `../static/` — do not change.
- **Plugins:** self-contained packages under [backend/plugins/builtin/](../backend/plugins/builtin/). Each plugin has `plugin.py`, `api.py`, optional `schema.py`.
- **Multi-instance:** plugins support multiple independent instances; instance state lives entirely on the plugin object — no module-level globals.

---

## Adding a New Plugin

### Backend — three files

**`backend/plugins/builtin/{id}/plugin.py`** — inherits `PluginBase`:
```python
from __future__ import annotations
from fastapi import APIRouter
from backend.plugins.base import PluginBase

class FooPlugin(PluginBase):
    plugin_id = "foo"
    display_name = "Foo"
    description = "..."
    version = "1.0.0"
    icon = "server"           # lucide-react icon name
    category = "network"      # see CLAUDE.md for valid categories
    poll_interval = 60        # seconds; 0 = no polling

    config_schema = {
        "type": "object",
        "properties": {
            "host": {"type": "string", "title": "Host"},
            "api_key": {"type": "string", "title": "API Key", "format": "password", "sensitive": True},
        },
        "required": ["host", "api_key"],
    }

    async def on_enable(self, config: dict) -> None:
        await super().on_enable(config)   # stores config in self._config
        # init connections

    async def on_disable(self) -> None:
        # cleanup connections

    async def health_check(self) -> dict:
        return {"status": "ok", "message": "Healthy"}  # or {"status": "error", ...}

    async def get_summary(self) -> dict:
        return {"status": "ok"}  # returned to dashboard widget

    async def scheduled_poll(self) -> None:
        pass  # called every poll_interval seconds

    def get_router(self) -> APIRouter:
        from backend.plugins.builtin.foo.api import make_router
        return make_router(self)  # lazy import — avoids circular deps
```

**`backend/plugins/builtin/{id}/api.py`** — router closure:
```python
from __future__ import annotations
from typing import TYPE_CHECKING
from fastapi import APIRouter, HTTPException
if TYPE_CHECKING:
    from backend.plugins.builtin.foo.plugin import FooPlugin

def make_router(plugin: FooPlugin) -> APIRouter:
    router = APIRouter()

    @router.get("/data")
    async def get_data():
        try:
            return await plugin._fetch_something()
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    return router
```

### Frontend — two files + registration

**`frontend/src/plugins/foo/Widget.tsx`** — compact card (~180px):
```tsx
import type { PluginSummary } from '../../api/client'
export function FooWidget({ summary }: { summary: PluginSummary }) {
  // check summary.status === 'error' first
}
```

**`frontend/src/plugins/foo/View.tsx`** — full page, must accept `instanceId?`:
```tsx
import { api } from '../../api/client'
import { getViewState, setViewState } from '../../store/viewStateStore'
export function FooView({ instanceId = 'default' }: { instanceId?: string }) {
  const foo = api.foo(instanceId)
  // use getViewState/setViewState for tab persistence
}
```

**Register** in [frontend/src/plugins/registry.tsx](../frontend/src/plugins/registry.tsx):
```typescript
import { FooWidget } from './foo/Widget'
import { FooView } from './foo/View'
// add to PLUGIN_WIDGETS and PLUGIN_VIEWS records
```

**Add API factory** in [frontend/src/api/client.ts](../frontend/src/api/client.ts):
```typescript
foo: (instanceId = 'default') => {
  const p = instanceId === 'default' ? '/api/plugins/foo' : `/api/plugins/foo/${instanceId}`
  return {
    getData: () => request<FooData>(`${p}/data`),
  }
},
```

---

## Key Conventions

- **`from __future__ import annotations`** at the top of every Python file
- Config is at **`self._config`** (set by `super().on_enable(config)`) — not `self.config`
- **`"sensitive": true`** in `config_schema` → auto-encrypted in DB, masked as `"***"` in GET responses
- **All state on the plugin instance** — no module-level globals or singletons
- Plugin routes **stay mounted after disable** until container restart (known limitation)
- Reserved instance IDs you cannot use: `enable`, `disable`, `config`, `health`, `clear`, `instances`
- After write operations, set `self._summary_cache = None` to force dashboard refresh
- Wrap all external calls in `try/except`; return `{"status": "error", "message": "..."}` — never let plugin failures crash the main app

---

## Auth

- JWT in httpOnly cookie (`access_token`)
- `Depends(get_current_user)` — read routes
- `Depends(require_admin)` — write/mutating routes
- First run auto-creates `admin/admin` and sets `setup_required=true`
