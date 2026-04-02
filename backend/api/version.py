from __future__ import annotations

import os
from fastapi import APIRouter

router = APIRouter(prefix="/api", tags=["version"])

#VERSION will be replaced during Docker build via sed or build args
# Format: v1.2.3 or dev
VERSION = os.getenv("UHLD_VERSION", "dev")
GITHUB_REPO = "https://github.com/mzac/uhld"


@router.get("/version")
async def get_version():
    """Return the current UHLD version and GitHub repository URL."""
    return {
        "version": VERSION,
        "github_repo": GITHUB_REPO,
    }
