from celery import Celery
from celery.schedules import crontab

# Initialize Celery app
celery_app = Celery(
    'tracker',
    broker='redis://localhost:6379/0',
    backend='redis://localhost:6379/0'
)

# Configure Celery
celery_app.conf.update(
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='UTC',
    enable_utc=True,
    task_track_started=True,
    task_time_limit=30 * 60,  # 30 minutes hard limit
)

# Schedule tasks
celery_app.conf.beat_schedule = {
    'calculate-daily-stats-hourly': {
        'task': 'tasks.calculate_daily_stats',
        'schedule': crontab(minute=0),  # Run every hour at :00
    },
    'calculate-weekly-stats-daily': {
        'task': 'tasks.calculate_weekly_stats',
        'schedule': crontab(hour=0, minute=0),  # Run daily at midnight
    },
}
