from __future__ import annotations

"""OAuth 2.0 / OIDC social login for UHLD.

Supported providers (configured via environment variables):
  - Microsoft Entra ID (Azure AD): OAUTH_ENTRA_CLIENT_ID, OAUTH_ENTRA_CLIENT_SECRET, OAUTH_ENTRA_TENANT_ID
  - Google: OAUTH_GOOGLE_CLIENT_ID, OAUTH_GOOGLE_CLIENT_SECRET
  - GitHub: OAUTH_GITHUB_CLIENT_ID, OAUTH_GITHUB_CLIENT_SECRET

Common settings:
  - OAUTH_BASE_URL      — externally reachable base URL, e.g. https://dash.example.com (default http://localhost:8000)
  - OAUTH_AUTO_PROVISION— if "true", automatically create a local user on first OAuth login (default false)
"""

import os
import secrets
import threading
from typing import Literal
from datetime import UTC, datetime, timedelta
from urllib.parse import urlencode, urlparse

import httpx
from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth import JWT_EXPIRE_HOURS, create_access_token, hash_password
from backend.database import get_db
from backend.models import OAuthAccount, User

router = APIRouter(prefix="/api/auth/oauth", tags=["oauth"])

_STATE_TTL_SECONDS = 300
_state_store: dict[str, tuple[str, datetime]] = {}  # state → (provider, expires_at)
_state_lock = threading.Lock()

OAUTH_BASE_URL = os.getenv("OAUTH_BASE_URL", "http://localhost:8000").rstrip("/")
OAUTH_AUTO_PROVISION = os.getenv("OAUTH_AUTO_PROVISION", "false").lower() == "true"

_OAUTH_AUTHORIZE_HOSTS = {
    "entra": "login.microsoftonline.com",
    "google": "accounts.google.com",
    "github": "github.com",
}


def _authorize_url_for_provider(provider: str) -> str:
    """Return a strict, allowlisted authorize URL for the given provider."""
    if provider == "entra":
        tenant = os.getenv("OAUTH_ENTRA_TENANT_ID", "common")
        tenant = "".join(c for c in tenant if c.isalnum() or c in "-._") or "common"
        return f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize"
    if provider == "google":
        return "https://accounts.google.com/o/oauth2/v2/auth"
    if provider == "github":
        return "https://github.com/login/oauth/authorize"
    raise HTTPException(status_code=404, detail=f"Unknown OAuth provider: {provider}")

# ── Provider definitions ──────────────────────────────────────────────────────

def _provider_config(provider: str) -> dict:
    tenant = os.getenv("OAUTH_ENTRA_TENANT_ID", "common")
    configs = {
        "entra": {
            "client_id":     os.getenv("OAUTH_ENTRA_CLIENT_ID", ""),
            "client_secret": os.getenv("OAUTH_ENTRA_CLIENT_SECRET", ""),
            "authorize_url": f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize",
            "token_url":     f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token",
            "userinfo_url":  "https://graph.microsoft.com/v1.0/me",
            "scopes":        "openid profile email User.Read",
            "name":          "Microsoft",
        },
        "google": {
            "client_id":     os.getenv("OAUTH_GOOGLE_CLIENT_ID", ""),
            "client_secret": os.getenv("OAUTH_GOOGLE_CLIENT_SECRET", ""),
            "authorize_url": "https://accounts.google.com/o/oauth2/v2/auth",
            "token_url":     "https://oauth2.googleapis.com/token",
            "userinfo_url":  "https://openidconnect.googleapis.com/v1/userinfo",
            "scopes":        "openid email profile",
            "name":          "Google",
        },
        "github": {
            "client_id":     os.getenv("OAUTH_GITHUB_CLIENT_ID", ""),
            "client_secret": os.getenv("OAUTH_GITHUB_CLIENT_SECRET", ""),
            "authorize_url": "https://github.com/login/oauth/authorize",
            "token_url":     "https://github.com/login/oauth/access_token",
            "userinfo_url":  "https://api.github.com/user",
            "scopes":        "read:user user:email",
            "name":          "GitHub",
        },
    }
    cfg = configs.get(provider)
    if cfg is None:
        raise HTTPException(status_code=404, detail=f"Unknown OAuth provider: {provider}")
    return cfg


def _configured_providers() -> list[dict]:
    """Return list of providers that have client_id configured."""
    out = []
    for pid in ("entra", "google", "github"):
        try:
            cfg = _provider_config(pid)
            if cfg["client_id"]:
                out.append({"id": pid, "name": cfg["name"]})
        except HTTPException:
            pass
    return out


# ── State helpers ──────────────────────────────────────────────────────────────

def _make_state(provider: str) -> str:
    state = secrets.token_hex(32)
    expires = datetime.now(UTC) + timedelta(seconds=_STATE_TTL_SECONDS)
    with _state_lock:
        now = datetime.now(UTC)
        expired = [k for k, v in _state_store.items() if v[1] < now]
        for k in expired:
            del _state_store[k]
        _state_store[state] = (provider, expires)
    return state


def _consume_state(state: str) -> str:
    with _state_lock:
        entry = _state_store.pop(state, None)
    if entry is None:
        raise HTTPException(status_code=400, detail="Invalid or expired OAuth state")
    provider, expires = entry
    if datetime.now(UTC) > expires:
        raise HTTPException(status_code=400, detail="OAuth state expired")
    return provider


# ── Routes ────────────────────────────────────────────────────────────────────


def _oauth_redirect_for_known_provider(provider: Literal["entra", "google", "github"]):
    cfg = _provider_config(provider)
    if not cfg["client_id"]:
        raise HTTPException(status_code=503, detail=f"{cfg['name']} OAuth is not configured")

    state = _make_state(provider)
    redirect_uri = f"{OAUTH_BASE_URL}/api/auth/oauth/{provider}/callback"
    params = {
        "client_id": cfg["client_id"],
        "response_type": "code",
        "redirect_uri": redirect_uri,
        "scope": cfg["scopes"],
        "state": state,
    }
    authorize_url = _authorize_url_for_provider(provider)
    parsed = urlparse(authorize_url)
    expected_host = _OAUTH_AUTHORIZE_HOSTS.get(provider)
    if parsed.scheme != "https" or parsed.hostname != expected_host:
        raise HTTPException(status_code=500, detail="Invalid OAuth provider authorize URL")

    return RedirectResponse(url=f"{authorize_url}?{urlencode(params)}")


@router.get("/entra")
async def oauth_redirect_entra():
    return _oauth_redirect_for_known_provider("entra")


@router.get("/google")
async def oauth_redirect_google():
    return _oauth_redirect_for_known_provider("google")


@router.get("/github")
async def oauth_redirect_github():
    return _oauth_redirect_for_known_provider("github")

@router.get("/providers")
async def list_providers():
    """Return configured OAuth providers for the login page."""
    return {"providers": _configured_providers()}


@router.get("/{provider}")
async def oauth_redirect(provider: str):
    """Backward-compatible provider dispatcher."""
    if provider == "entra":
        return _oauth_redirect_for_known_provider("entra")
    if provider == "google":
        return _oauth_redirect_for_known_provider("google")
    if provider == "github":
        return _oauth_redirect_for_known_provider("github")
    raise HTTPException(status_code=404, detail=f"Unknown OAuth provider: {provider}")


@router.get("/{provider}/callback")
async def oauth_callback(
    provider: str,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    response: Response = None,
    db: AsyncSession = Depends(get_db),
):
    """Handle the OAuth provider callback and issue a JWT cookie."""
    if error:
        # Do not reflect arbitrary provider error strings into redirect URLs.
        return RedirectResponse(url="/?oauth_error=provider_error")
    if not code or not state:
        raise HTTPException(status_code=400, detail="Missing code or state")

    validated_provider = _consume_state(state)
    if validated_provider != provider:
        raise HTTPException(status_code=400, detail="State mismatch")

    cfg = _provider_config(provider)
    redirect_uri = f"{OAUTH_BASE_URL}/api/auth/oauth/{provider}/callback"

    # Exchange code for tokens
    token_data = {
        "grant_type":    "authorization_code",
        "code":          code,
        "redirect_uri":  redirect_uri,
        "client_id":     cfg["client_id"],
        "client_secret": cfg["client_secret"],
    }
    async with httpx.AsyncClient(timeout=15) as client:
        token_headers = {"Accept": "application/json"}
        token_resp = await client.post(cfg["token_url"], data=token_data, headers=token_headers)
    if token_resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Failed to exchange OAuth code")
    tokens = token_resp.json()
    access_token: str = tokens.get("access_token", "")
    if not access_token:
        raise HTTPException(status_code=502, detail="No access_token in OAuth response")

    # Fetch user info
    async with httpx.AsyncClient(timeout=15) as client:
        headers = {"Authorization": f"Bearer {access_token}", "Accept": "application/json"}
        userinfo_resp = await client.get(cfg["userinfo_url"], headers=headers)
    if userinfo_resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Failed to fetch OAuth user info")
    userinfo = userinfo_resp.json()

    # Parse provider-specific user ID and email
    if provider == "entra":
        provider_user_id = userinfo.get("id") or userinfo.get("sub", "")
        email = userinfo.get("mail") or userinfo.get("userPrincipalName") or userinfo.get("email", "")
        display_name = userinfo.get("displayName") or userinfo.get("name", "")
    elif provider == "google":
        provider_user_id = userinfo.get("sub", "")
        email = userinfo.get("email", "")
        display_name = userinfo.get("name", "")
    else:  # github
        provider_user_id = str(userinfo.get("id", ""))
        email = userinfo.get("email") or ""
        display_name = userinfo.get("login", "")

    if not provider_user_id:
        raise HTTPException(status_code=502, detail="Unable to get user ID from OAuth provider")

    # Look up existing OAuth account linkage
    result = await db.execute(
        select(OAuthAccount).where(
            OAuthAccount.provider == provider,
            OAuthAccount.provider_user_id == provider_user_id,
        )
    )
    oauth_account = result.scalar_one_or_none()

    if oauth_account:
        result2 = await db.execute(select(User).where(User.id == oauth_account.user_id))
        user = result2.scalar_one_or_none()
        if user is None or not user.is_active:
            return RedirectResponse(url="/?oauth_error=account_disabled")
    elif OAUTH_AUTO_PROVISION:
        # Auto-create local user from OAuth identity
        base_username = (display_name or email.split("@")[0] or "user").lower()
        base_username = "".join(c for c in base_username if c.isalnum() or c in "_-")[:32] or "user"
        username = base_username
        suffix = 1
        while True:
            existing = await db.execute(select(User).where(User.username == username))
            if not existing.scalar_one_or_none():
                break
            username = f"{base_username}{suffix}"
            suffix += 1

        user = User(
            username=username,
            hashed_password=hash_password(secrets.token_hex(32)),  # random unusable password
            is_admin=False,
            role="viewer",
            is_active=True,
        )
        db.add(user)
        await db.flush()
        oauth_account = OAuthAccount(
            user_id=user.id,
            provider=provider,
            provider_user_id=provider_user_id,
            email=email or None,
        )
        db.add(oauth_account)
        await db.commit()
    else:
        # No linked account and auto-provision is disabled
        return RedirectResponse(url="/?oauth_error=no_account")

    # Issue JWT cookie
    jwt_token = create_access_token({"sub": user.username})
    cookie_response = RedirectResponse(url="/", status_code=302)
    cookie_response.set_cookie(
        key="access_token",
        value=jwt_token,
        httponly=True,
        samesite="lax",
        max_age=int(timedelta(hours=JWT_EXPIRE_HOURS).total_seconds()),
        secure=False,
    )
    return cookie_response
