from __future__ import annotations

import json
import os
import secrets
import threading
from datetime import UTC, datetime, timedelta
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth import (
    JWT_EXPIRE_HOURS,
    create_access_token,
    create_partial_token,
    decode_partial_token,
    generate_totp_secret,
    get_current_user,
    get_totp_uri,
    hash_password,
    verify_password,
    verify_totp_code,
)
from backend.database import get_db
from backend.models import Passkey, Setting, User

router = APIRouter(prefix="/api/auth", tags=["auth"])

# ── In-memory WebAuthn challenge store ───────────────────────────────────────
_challenges: dict[str, tuple[bytes, str | None, datetime]] = {}
_challenges_lock = threading.Lock()
_CHALLENGE_TTL_SECONDS = 120

WEBAUTHN_RP_ID = os.getenv("WEBAUTHN_RP_ID", "")
WEBAUTHN_RP_NAME = os.getenv("WEBAUTHN_RP_NAME", "UHLD")
WEBAUTHN_ORIGIN = os.getenv("WEBAUTHN_ORIGIN", "")


def _derive_rp_config(request: Request) -> tuple[str, str]:
    """Return (rp_id, origin) from env vars when set, otherwise derived from
    the incoming request's Origin/Host header. This allows passkeys to work
    without any extra env config for typical homelab setups."""
    env_rp_id = WEBAUTHN_RP_ID
    env_origin = WEBAUTHN_ORIGIN
    if env_rp_id and env_origin:
        return env_rp_id, env_origin

    # Prefer the Origin request header (always present for browser fetch/XHR)
    origin_header = request.headers.get("origin", "")
    if origin_header:
        parsed = urlparse(origin_header)
        rp_id = env_rp_id or (parsed.hostname or "localhost")
        origin = env_origin or origin_header
        return rp_id, origin

    # Fall back to Host header
    host = request.headers.get("host", "localhost")
    hostname = host.split(":")[0]
    scheme = "https" if request.url.scheme == "https" else "http"
    port = request.url.port
    if port and not ((scheme == "http" and port == 80) or (scheme == "https" and port == 443)):
        derived_origin = f"{scheme}://{host}"
    else:
        derived_origin = f"{scheme}://{hostname}"
    return env_rp_id or hostname, env_origin or derived_origin


def _store_challenge(challenge: bytes, username: str | None = None) -> str:
    token = secrets.token_hex(32)
    expires = datetime.now(UTC) + timedelta(seconds=_CHALLENGE_TTL_SECONDS)
    with _challenges_lock:
        now = datetime.now(UTC)
        expired_keys = [k for k, v in _challenges.items() if v[2] < now]
        for k in expired_keys:
            del _challenges[k]
        _challenges[token] = (challenge, username, expires)
    return token


def _pop_challenge(token: str) -> tuple[bytes, str | None]:
    with _challenges_lock:
        entry = _challenges.pop(token, None)
    if entry is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Challenge expired or not found")
    challenge, username, expires = entry
    if datetime.now(UTC) > expires:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Challenge expired")
    return challenge, username


# ── Pydantic models ───────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str
    password: str


class UserResponse(BaseModel):
    id: int
    username: str
    is_admin: bool
    role: str
    totp_enabled: bool
    needs_setup: bool = False

    model_config = {"from_attributes": True}


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class TOTPVerifyRequest(BaseModel):
    code: str


class TOTPLoginRequest(BaseModel):
    partial_token: str
    code: str


class PasskeyRegisterCompleteRequest(BaseModel):
    credential: dict
    challenge_token: str
    name: str = "Passkey"


class PasskeyLoginBeginResponse(BaseModel):
    challenge_token: str
    options: dict


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_needs_setup(db: AsyncSession) -> bool:
    result = await db.execute(select(Setting).where(Setting.key == "setup_required"))
    setting = result.scalar_one_or_none()
    return setting is not None and setting.value == "true"


def _set_auth_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        samesite="lax",
        max_age=int(timedelta(hours=JWT_EXPIRE_HOURS).total_seconds()),
        secure=False,
    )


def _user_response(user: User, needs_setup: bool = False) -> UserResponse:
    return UserResponse(
        id=user.id,
        username=user.username,
        is_admin=user.is_admin,
        role=user.role,
        totp_enabled=user.totp_enabled,
        needs_setup=needs_setup,
    )


# ── Core auth ─────────────────────────────────────────────────────────────────

@router.post("/login")
async def login(body: LoginRequest, response: Response, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.username == body.username))
    user = result.scalar_one_or_none()
    if user is None or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account disabled")

    if user.totp_enabled:
        partial = create_partial_token(user.username)
        return {"requires_totp": True, "partial_token": partial}

    token = create_access_token({"sub": user.username})
    _set_auth_cookie(response, token)
    needs_setup = await _get_needs_setup(db)
    return {"message": "Logged in", "user": _user_response(user, needs_setup)}


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("access_token")
    return {"message": "Logged out"}


@router.get("/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    needs_setup = await _get_needs_setup(db)
    return _user_response(current_user, needs_setup)


@router.put("/password")
async def change_password(
    body: ChangePasswordRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not verify_password(body.current_password, current_user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Current password is incorrect")
    if len(body.new_password) < 4:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Password must be at least 4 characters")
    current_user.hashed_password = hash_password(body.new_password)
    result = await db.execute(select(Setting).where(Setting.key == "setup_required"))
    setting = result.scalar_one_or_none()
    if setting:
        setting.value = "false"
    await db.commit()
    return {"message": "Password changed"}


# ── TOTP 2FA ──────────────────────────────────────────────────────────────────

@router.post("/totp/login")
async def totp_login(body: TOTPLoginRequest, response: Response, db: AsyncSession = Depends(get_db)):
    """Complete login when TOTP is enabled."""
    username = decode_partial_token(body.partial_token)
    result = await db.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active or not user.totp_enabled or not user.totp_secret:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid TOTP session")
    from backend.encryption import decrypt_value
    raw_secret = decrypt_value(user.totp_secret)
    if not verify_totp_code(raw_secret, body.code.strip()):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authenticator code")
    token = create_access_token({"sub": user.username})
    _set_auth_cookie(response, token)
    needs_setup = await _get_needs_setup(db)
    return {"message": "Logged in", "user": _user_response(user, needs_setup)}


@router.get("/totp/setup")
async def totp_setup(current_user: User = Depends(get_current_user)):
    """Generate a new TOTP secret and return provisioning URI."""
    if current_user.totp_enabled:
        raise HTTPException(status_code=400, detail="TOTP is already enabled. Disable it first.")
    secret = generate_totp_secret()
    uri = get_totp_uri(secret, current_user.username)
    return {"secret": secret, "uri": uri}


@router.post("/totp/verify")
async def totp_verify(
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Enable TOTP: verify code against provided secret, then save encrypted secret."""
    secret: str = body.get("secret", "")
    code: str = body.get("code", "")
    if not secret or not code:
        raise HTTPException(status_code=422, detail="secret and code are required")
    if not verify_totp_code(secret, code.strip()):
        raise HTTPException(status_code=400, detail="Invalid authenticator code")
    from backend.encryption import encrypt_value
    current_user.totp_secret = encrypt_value(secret)
    current_user.totp_enabled = True
    await db.commit()
    return {"message": "Two-factor authentication enabled"}


@router.delete("/totp")
async def totp_disable(
    body: TOTPVerifyRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Disable TOTP — requires a valid current TOTP code as confirmation."""
    if not current_user.totp_enabled or not current_user.totp_secret:
        raise HTTPException(status_code=400, detail="TOTP is not enabled")
    from backend.encryption import decrypt_value
    raw_secret = decrypt_value(current_user.totp_secret)
    if not verify_totp_code(raw_secret, body.code.strip()):
        raise HTTPException(status_code=400, detail="Invalid authenticator code")
    current_user.totp_secret = None
    current_user.totp_enabled = False
    await db.commit()
    return {"message": "Two-factor authentication disabled"}


# ── WebAuthn / Passkeys ───────────────────────────────────────────────────────

def _get_webauthn():
    try:
        import webauthn as _wa  # noqa: PLC0415
        return _wa
    except ImportError as exc:
        raise HTTPException(status_code=503, detail="WebAuthn library not installed") from exc


@router.post("/passkey/register/begin")
async def passkey_register_begin(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    wa = _get_webauthn()
    rp_id, _origin = _derive_rp_config(request)
    result = await db.execute(select(Passkey).where(Passkey.user_id == current_user.id))
    existing = result.scalars().all()
    exclude_credentials = [
        wa.helpers.structs.PublicKeyCredentialDescriptor(id=wa.helpers.base64url_to_bytes(pk.credential_id))
        for pk in existing
    ]
    options = wa.generate_registration_options(
        rp_id=rp_id,
        rp_name=WEBAUTHN_RP_NAME,
        user_id=str(current_user.id).encode(),
        user_name=current_user.username,
        user_display_name=current_user.username,
        exclude_credentials=exclude_credentials,
        authenticator_selection=wa.helpers.structs.AuthenticatorSelectionCriteria(
            resident_key=wa.helpers.structs.ResidentKeyRequirement.REQUIRED,
            user_verification=wa.helpers.structs.UserVerificationRequirement.PREFERRED,
        ),
    )
    challenge_token = _store_challenge(options.challenge, current_user.username)
    return {"challenge_token": challenge_token, "options": json.loads(wa.options_to_json(options))}


@router.post("/passkey/register/complete")
async def passkey_register_complete(
    request: Request,
    body: PasskeyRegisterCompleteRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    wa = _get_webauthn()
    rp_id, origin = _derive_rp_config(request)
    challenge, _ = _pop_challenge(body.challenge_token)
    try:
        verification = wa.verify_registration_response(
            credential=json.dumps(body.credential),
            expected_challenge=challenge,
            expected_rp_id=rp_id,
            expected_origin=origin,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Registration failed: {exc}") from exc

    passkey = Passkey(
        user_id=current_user.id,
        credential_id=wa.helpers.bytes_to_base64url(verification.credential_id),
        credential_public_key=wa.helpers.bytes_to_base64url(verification.credential_public_key),
        name=body.name,
        aaguid=str(verification.aaguid) if verification.aaguid else None,
        sign_count=verification.sign_count,
        transports=json.dumps([]),
    )
    db.add(passkey)
    await db.commit()
    await db.refresh(passkey)
    return {"message": "Passkey registered", "id": passkey.id}


@router.post("/passkey/login/begin")
async def passkey_login_begin(request: Request):
    wa = _get_webauthn()
    rp_id, _origin = _derive_rp_config(request)
    options = wa.generate_authentication_options(
        rp_id=rp_id,
        user_verification=wa.helpers.structs.UserVerificationRequirement.PREFERRED,
    )
    challenge_token = _store_challenge(options.challenge)
    return {"challenge_token": challenge_token, "options": json.loads(wa.options_to_json(options))}


@router.post("/passkey/login/complete")
async def passkey_login_complete(
    request: Request,
    body: dict,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    wa = _get_webauthn()
    rp_id, origin = _derive_rp_config(request)
    challenge_token: str = body.pop("challenge_token", "")
    if not challenge_token:
        raise HTTPException(status_code=422, detail="challenge_token is required")
    challenge, _ = _pop_challenge(challenge_token)

    raw_id: str = body.get("rawId") or body.get("id", "")
    result = await db.execute(select(Passkey).where(Passkey.credential_id == raw_id))
    passkey = result.scalar_one_or_none()
    if passkey is None:
        raise HTTPException(status_code=404, detail="Passkey not found")

    result2 = await db.execute(select(User).where(User.id == passkey.user_id))
    user = result2.scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or disabled")

    try:
        verification = wa.verify_authentication_response(
            credential=json.dumps(body),
            expected_challenge=challenge,
            expected_rp_id=rp_id,
            expected_origin=origin,
            credential_public_key=wa.helpers.base64url_to_bytes(passkey.credential_public_key),
            credential_current_sign_count=passkey.sign_count,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Authentication failed: {exc}") from exc

    passkey.sign_count = verification.new_sign_count
    passkey.last_used = datetime.now(UTC)
    await db.commit()
    token = create_access_token({"sub": user.username})
    _set_auth_cookie(response, token)
    return {"message": "Logged in", "user": _user_response(user)}


@router.get("/passkeys")
async def list_passkeys(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Passkey).where(Passkey.user_id == current_user.id))
    passkeys = result.scalars().all()
    return {
        "passkeys": [
            {
                "id": pk.id,
                "name": pk.name,
                "aaguid": pk.aaguid,
                "created_at": pk.created_at.isoformat() if pk.created_at else None,
                "last_used": pk.last_used.isoformat() if pk.last_used else None,
            }
            for pk in passkeys
        ]
    }


@router.delete("/passkey/{passkey_id}")
async def delete_passkey(
    passkey_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Passkey).where(Passkey.id == passkey_id, Passkey.user_id == current_user.id)
    )
    passkey = result.scalar_one_or_none()
    if passkey is None:
        raise HTTPException(status_code=404, detail="Passkey not found")
    await db.delete(passkey)
    await db.commit()
    return {"message": "Passkey removed"}


@router.patch("/passkey/{passkey_id}")
async def rename_passkey(
    passkey_id: int,
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    name: str = body.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=422, detail="name is required")
    result = await db.execute(
        select(Passkey).where(Passkey.id == passkey_id, Passkey.user_id == current_user.id)
    )
    passkey = result.scalar_one_or_none()
    if passkey is None:
        raise HTTPException(status_code=404, detail="Passkey not found")
    passkey.name = name
    await db.commit()
    return {"message": "Passkey renamed"}
