from celery_config import celery_app
from sqlmodel import Session, select, func
from datetime import datetime, date, timedelta
from database import engine
from model import User, AppUsage, DashboardStats, Timesheet, Attendance, Applications
import json


@celery_app.task(name='tasks.calculate_daily_stats')
def calculate_daily_stats():
    """
    Calculate and store dashboard stats for all users
    Runs every hour
    """
    try:
        with Session(engine) as session:
            employees = session.exec(
                select(User).where(User.role == "employee")
            ).all()
            
            today = date.today()
            today_start = datetime.combine(today, datetime.min.time())
            today_end = datetime.combine(today, datetime.max.time())
            
            for emp in employees:
 
                usage_query = select(
                    func.sum(AppUsage.duration),
                    func.sum(AppUsage.idle_duration)
                ).where(
                    AppUsage.employee_id == emp.id,
                    AppUsage.timestamp >= today_start,
                    AppUsage.timestamp <= today_end
                )
                
                result = session.exec(usage_query).first()
                total_duration = result[0] or 0  
                total_idle = result[1] or 0     
                
                total_hours = total_duration / 3600
                idle_hours = total_idle / 3600
                idle_percentage = (total_idle / total_duration * 100) if total_duration > 0 else 0
                
                apps_query = select(
                    AppUsage.app,
                    func.sum(AppUsage.duration).label('duration')
                ).where(
                    AppUsage.employee_id == emp.id,
                    AppUsage.timestamp >= today_start,
                    AppUsage.timestamp <= today_end
                ).group_by(AppUsage.app).order_by(
                    func.sum(AppUsage.duration).desc()
                )
                
                app_results = session.exec(apps_query).all()
                apps_dict = {}
                
                for app_name, duration in app_results:
                    pct = (duration / total_duration * 100) if total_duration > 0 else 0
                    apps_dict[app_name] = {
                        "duration": duration,
                        "percentage": round(pct, 2),
                        "hours": round(duration / 3600, 2)
                    }
                
                # ===== GET ATTENDANCE STATUS =====
                attendance_query = select(Attendance).where(
                    Attendance.employee_id == emp.id,
                    Attendance.current_date == today
                )
                
                attendance = session.exec(attendance_query).first()
                attendance_status = attendance.status if attendance else "not_marked"
                
                pending_apps_query = select(func.count(Applications.id)).where(
                    Applications.employee_id == emp.id,
                    Applications.status == "pending"
                )
                
                pending_apps = session.exec(pending_apps_query).first() or 0
                

                existing_stats = session.exec(
                    select(DashboardStats).where(
                        DashboardStats.employee_id == emp.id,
                        DashboardStats.stats_date == today
                    )
                ).first()
                

                if existing_stats:

                    existing_stats.total_hours = round(total_hours, 2)
                    existing_stats.idle_hours = round(idle_hours, 2)
                    existing_stats.idle_percentage = round(idle_percentage, 2)
                    existing_stats.apps_used = json.dumps(apps_dict)
                    existing_stats.attendance_status = attendance_status
                    existing_stats.pending_applications = pending_apps
                    existing_stats.updated_at = datetime.utcnow()
                    
                    session.add(existing_stats)
                else:
                    new_stats = DashboardStats(
                        employee_id=emp.id,
                        stats_date=today,
                        total_hours=round(total_hours, 2),
                        idle_hours=round(idle_hours, 2),
                        idle_percentage=round(idle_percentage, 2),
                        apps_used=json.dumps(apps_dict),
                        attendance_status=attendance_status,
                        pending_applications=pending_apps,
                        calculated_at=datetime.utcnow(),
                        updated_at=datetime.utcnow()
                    )
                    
                    session.add(new_stats)
                
                session.commit()
        
        return {"status": "success", "message": "Stats calculated for all users"}
    
    except Exception as e:
        return {"status": "error", "message": str(e)}


@celery_app.task(name='tasks.calculate_all_users_weekly_stats')
def calculate_all_users_weekly_stats():
    """
    Calculate weekly stats summary for all users
    Runs daily at midnight
    """
    try:
        with Session(engine) as session:
            # Get all employees
            employees = session.exec(
                select(User).where(User.role == "employee")
            ).all()
            
            today = date.today()
            week_ago = today - timedelta(days=7)
            week_start = datetime.combine(week_ago, datetime.min.time())
            week_end = datetime.combine(today, datetime.max.time())
            
            for emp in employees:
      
                usage_query = select(
                    func.sum(AppUsage.duration),
                    func.sum(AppUsage.idle_duration)
                ).where(
                    AppUsage.employee_id == emp.id,
                    AppUsage.timestamp >= week_start,
                    AppUsage.timestamp <= week_end
                )
                
                result = session.exec(usage_query).first()
                total_duration = result[0] or 0
                total_idle = result[1] or 0
                
                # Calculate daily average
                daily_hours = (total_duration / 3600) / 7  
                daily_idle_pct = (total_idle / total_duration * 100) if total_duration > 0 else 0
                
                # You can store this separately or just calculate on demand
                # For now, we're just ensuring today's stats are up to date
        
        return {"status": "success", "message": "Weekly stats processed"}
    
    except Exception as e:
        return {"status": "error", "message": str(e)}
