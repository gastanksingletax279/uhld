from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth import (
    JWT_EXPIRE_HOURS,
    create_access_token,
    get_current_user,
    hash_password,
    verify_password,
)
from backend.database import get_db
from backend.models import Setting, User

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


class UserResponse(BaseModel):
    id: int
    username: str
    is_admin: bool
    needs_setup: bool = False

    model_config = {"from_attributes": True}


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


async def _get_needs_setup(db: AsyncSession) -> bool:
    result = await db.execute(select(Setting).where(Setting.key == "setup_required"))
    setting = result.scalar_one_or_none()
    return setting is not None and setting.value == "true"


@router.post("/login")
async def login(body: LoginRequest, response: Response, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.username == body.username))
    user = result.scalar_one_or_none()
    if user is None or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    token = create_access_token({"sub": user.username})
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        samesite="lax",
        max_age=int(timedelta(hours=JWT_EXPIRE_HOURS).total_seconds()),
        secure=False,  # Set True behind HTTPS
    )
    needs_setup = await _get_needs_setup(db)
    user_resp = UserResponse(id=user.id, username=user.username, is_admin=user.is_admin, needs_setup=needs_setup)
    return {"message": "Logged in", "user": user_resp}


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("access_token")
    return {"message": "Logged out"}


@router.get("/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    needs_setup = await _get_needs_setup(db)
    return UserResponse(
        id=current_user.id,
        username=current_user.username,
        is_admin=current_user.is_admin,
        needs_setup=needs_setup,
    )


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

    # Clear the setup_required flag
    result = await db.execute(select(Setting).where(Setting.key == "setup_required"))
    setting = result.scalar_one_or_none()
    if setting:
        setting.value = "false"

    await db.commit()
    return {"message": "Password changed"}
