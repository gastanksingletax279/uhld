from __future__ import annotations

import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


def start_scheduler() -> None:
    if not scheduler.running:
        scheduler.start()
        logger.info("Scheduler started")


def stop_scheduler() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("Scheduler stopped")


def add_plugin_job(plugin_id: str, func, interval_seconds: int) -> None:
    job_id = f"plugin_{plugin_id}_poll"
    # Remove existing job if present
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)
    scheduler.add_job(
        func,
        trigger=IntervalTrigger(seconds=interval_seconds),
        id=job_id,
        name=f"{plugin_id} scheduled poll",
        replace_existing=True,
        misfire_grace_time=30,
    )
    logger.info("Scheduled %s poll every %ds", plugin_id, interval_seconds)


def remove_plugin_job(plugin_id: str) -> None:
    job_id = f"plugin_{plugin_id}_poll"
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)
        logger.info("Removed scheduled job for %s", plugin_id)
