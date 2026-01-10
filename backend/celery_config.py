from celery import Celery
from celery.schedules import crontab
import os

# Initialize Celery app
celery_app = Celery(
    'tracker',
    broker='redis://localhost:6379/0',
    backend='redis://localhost:6379/0'
)

# Celery configuration
celery_app.conf.update(
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='UTC',
    enable_utc=True,
    task_track_started=True,
    task_time_limit=30 * 60,  # 30 minutes hard time limit
)

# Celery Beat schedule (periodic tasks)
celery_app.conf.beat_schedule = {
    'calculate-dashboard-stats-hourly': {
        'task': 'tasks.calculate_daily_stats',
        'schedule': crontab(minute=0),  # Run every hour at minute 0
    },
    'calculate-dashboard-stats-daily': {
        'task': 'tasks.calculate_all_users_weekly_stats',
        'schedule': crontab(hour=0, minute=0),  # Run daily at midnight
    },
}
