from __future__ import annotations

"""Admin CLI for UHLD.

Usage:
    python -m backend.cli create-user <username> <password>
    python -m backend.cli reset-password <username> <new_password>
    python -m backend.cli list-users
"""

import asyncio

import typer
from rich.console import Console
from rich.table import Table
from sqlalchemy import select

from backend.auth import hash_password
from backend.database import AsyncSessionLocal, init_db
from backend.models import User

app = typer.Typer(help="UHLD admin CLI")
console = Console()


def _run(coro):
    asyncio.run(coro)


async def _create_user_async(username: str, password: str, admin: bool) -> None:
    await init_db()
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.username == username))
        if result.scalar_one_or_none():
            console.print(f"[red]User '{username}' already exists.[/red]")
            raise typer.Exit(1)
        role = "admin" if admin else "viewer"
        user = User(
            username=username,
            hashed_password=hash_password(password),
            is_admin=admin,
            role=role,
            is_active=True,
        )
        db.add(user)
        await db.commit()
        console.print(f"[green]Created user '{username}' (role={role})[/green]")


async def _reset_password_async(username: str, new_password: str) -> None:
    await init_db()
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.username == username))
        user = result.scalar_one_or_none()
        if user is None:
            console.print(f"[red]User '{username}' not found.[/red]")
            raise typer.Exit(1)
        user.hashed_password = hash_password(new_password)
        await db.commit()
        console.print(f"[green]Password reset for '{username}'[/green]")


async def _list_users_async() -> None:
    await init_db()
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User))
        users = result.scalars().all()
    table = Table(title="UHLD Users")
    table.add_column("ID", style="dim")
    table.add_column("Username")
    table.add_column("Role")
    table.add_column("Active")
    table.add_column("Created")
    for u in users:
        table.add_row(str(u.id), u.username, u.role, str(u.is_active), str(u.created_at))
    console.print(table)


@app.command()
def create_user(
    username: str = typer.Argument(..., help="Username"),
    password: str = typer.Argument(..., help="Password"),
    admin: bool = typer.Option(True, "--admin/--no-admin", help="Grant admin privileges"),
):
    """Create a new user."""
    _run(_create_user_async(username, password, admin))


@app.command()
def reset_password(
    username: str = typer.Argument(..., help="Username"),
    new_password: str = typer.Argument(..., help="New password"),
):
    """Reset a user's password."""
    _run(_reset_password_async(username, new_password))


@app.command()
def list_users():
    """List all users."""
    _run(_list_users_async())


if __name__ == "__main__":
    app()
