from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth import get_current_user, hash_password, require_admin
from backend.database import get_db
from backend.models import User

router = APIRouter(prefix="/api/users", tags=["users"])


class UserResponse(BaseModel):
    id: int
    username: str
    is_admin: bool
    role: str
    is_active: bool
    totp_enabled: bool

    model_config = {"from_attributes": True}


class CreateUserRequest(BaseModel):
    username: str
    password: str
    role: str = "viewer"  # admin | viewer


class UpdateUserRequest(BaseModel):
    role: str | None = None
    is_active: bool | None = None


@router.get("/")
async def list_users(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    result = await db.execute(select(User).order_by(User.id))
    users = result.scalars().all()
    return {
        "users": [
            UserResponse(
                id=u.id,
                username=u.username,
                is_admin=u.is_admin,
                role=u.role,
                is_active=u.is_active,
                totp_enabled=u.totp_enabled,
            )
            for u in users
        ]
    }


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_user(
    body: CreateUserRequest,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    if body.role not in ("admin", "viewer"):
        raise HTTPException(status_code=422, detail="role must be 'admin' or 'viewer'")
    if len(body.username.strip()) < 1:
        raise HTTPException(status_code=422, detail="username is required")
    if len(body.password) < 4:
        raise HTTPException(status_code=422, detail="password must be at least 4 characters")

    existing = await db.execute(select(User).where(User.username == body.username))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Username already exists")

    is_admin = body.role == "admin"
    user = User(
        username=body.username,
        hashed_password=hash_password(body.password),
        is_admin=is_admin,
        role=body.role,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return {"message": "User created", "user": UserResponse(
        id=user.id,
        username=user.username,
        is_admin=user.is_admin,
        role=user.role,
        is_active=user.is_active,
        totp_enabled=user.totp_enabled,
    )}


@router.put("/{user_id}")
async def update_user(
    user_id: int,
    body: UpdateUserRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    # Prevent admin from demoting themselves
    if user.id == admin.id and body.role == "viewer":
        raise HTTPException(status_code=400, detail="Cannot change your own role")

    if body.role is not None:
        if body.role not in ("admin", "viewer"):
            raise HTTPException(status_code=422, detail="role must be 'admin' or 'viewer'")
        user.role = body.role
        user.is_admin = body.role == "admin"
    if body.is_active is not None:
        if user.id == admin.id and not body.is_active:
            raise HTTPException(status_code=400, detail="Cannot disable your own account")
        user.is_active = body.is_active

    await db.commit()
    return {"message": "User updated"}


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    await db.delete(user)
    await db.commit()


@router.post("/{user_id}/reset-password")
async def admin_reset_password(
    user_id: int,
    body: dict,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    new_password: str = body.get("password", "")
    if len(new_password) < 4:
        raise HTTPException(status_code=422, detail="password must be at least 4 characters")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    user.hashed_password = hash_password(new_password)
    await db.commit()
    return {"message": "Password reset"}


# ── User preferences (menu layout, etc.) ─────────────────────────────────────


class MenuStructureRequest(BaseModel):
    menu_structure: str  # JSON string


@router.get("/me/menu-structure")
async def get_my_menu_structure(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get the current user's menu structure."""
    result = await db.execute(select(User).where(User.id == user.id))
    fresh_user = result.scalar_one_or_none()
    if fresh_user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return {"menu_structure": fresh_user.menu_structure}


@router.put("/me/menu-structure")
async def update_my_menu_structure(
    body: MenuStructureRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Update the current user's menu structure."""
    result = await db.execute(select(User).where(User.id == user.id))
    db_user = result.scalar_one_or_none()
    if db_user is None:
        raise HTTPException(status_code=404, detail="User not found")
    db_user.menu_structure = body.menu_structure
    await db.commit()
    return {"message": "Menu structure updated"}
