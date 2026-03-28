from __future__ import annotations

import json
import os

from cryptography.fernet import Fernet

_fernet: Fernet | None = None


def _get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        key = os.getenv("ENCRYPTION_KEY")
        if not key:
            raise RuntimeError("ENCRYPTION_KEY environment variable is not set")
        _fernet = Fernet(key.encode())
    return _fernet


def encrypt_config(config: dict) -> str:
    """Encrypt a config dict to a base64 Fernet token string."""
    f = _get_fernet()
    return f.encrypt(json.dumps(config).encode()).decode()


def decrypt_config(token: str) -> dict:
    """Decrypt a Fernet token string back to a config dict."""
    f = _get_fernet()
    return json.loads(f.decrypt(token.encode()).decode())


def mask_sensitive(config: dict, schema: dict) -> dict:
    """Return a copy of config with sensitive fields masked."""
    masked = dict(config)
    props = schema.get("properties", {})
    for field, field_schema in props.items():
        if field_schema.get("sensitive") and field in masked:
            masked[field] = "***"
    return masked
