from datetime import timedelta
from typing import Annotated
from data import get_session
from fastapi import APIRouter, Depends, HTTPException, status, Query, File, UploadFile, Path
from datetime import datetime, timedelta, date
from model import User, AppUsage, Timesheet, Attendance, Screenshots, ProjectEmployee, Projects, Applications, TimesheetStatus, AttendanceStatus, DashboardStats
from auth.jwt_hasher import create_access_token, hash_password, get_current_user, bearer_scheme, check_hashed_password
from sqlmodel import Session, select
from redis.asyncio import Redis
from uuid import uuid4
import json
from schema import UsageCreate, CreateApplication
from email.mime.text import MIMEText
import smtplib
import os
from pathlib import Path
from fastapi.responses import FileResponse

router = APIRouter(
    tags=['Employee']
)

r = Redis(
    host="localhost",
    port=6379,
    db=0,
    decode_responses=True
)

@router.post('/start_timesheet')
async def start_timesheet(session:Session = Depends(get_session),
               current_user: User = Depends(get_current_user("employee"))):
    
    existing = session.exec(
        select(Timesheet).where(
            Timesheet.employee_id == current_user.id,
            Timesheet.work_date == date.today())
    ).first()
    
    if existing and existing.status == TimesheetStatus.INACTIVE:
        existing.status = TimesheetStatus.ACTIVE
        existing.end_time = None    
        session.commit()
        session.refresh(existing)
        return {"message": "Timesheet reactivated", "timesheet_id": existing.id}
    
    if existing and existing.status == TimesheetStatus.ACTIVE:  
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Timesheet already active")
    
    timesheet = Timesheet(
        employee_id=current_user.id,
        work_date=date.today(),
        start_time=datetime.now(),
        status=TimesheetStatus.ACTIVE  
    )

    session.add(timesheet)
    session.commit()
    session.refresh(timesheet)

    await r.rpush(
        f"timesheet_{current_user.id}",
        json.dumps({
            "event": "start",
            "time": timesheet.start_time.isoformat()
        })
    )

    return {"message": "Tracking started"}

# Router for recieving data from the frontend and adding data to redis
@router.post('/event_buffering')
async def add_activity( usage: UsageCreate,
                session:Session = Depends(get_session),
                current_user: User = Depends(get_current_user("employee"))):
    
    data = {
        "event": "usage",
        "app": usage.app,  # FIXED: Changed from usage.app_name to usage.app
        "duration": usage.duration,
        "timestamp": usage.timestamp.isoformat()
    }

    await r.rpush(f"queue_usage_{current_user.id}", json.dumps(data))

    return "Tracking started successfully"



# Router for both stopping and syncing activity from redis to the database
@router.post("/sync")
async def sync_activity(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user("employee"))
):
    timesheet = session.exec(
        select(Timesheet).where(
            Timesheet.employee_id == current_user.id,
            Timesheet.work_date == date.today(),
            Timesheet.status == TimesheetStatus.ACTIVE  # FIXED: Changed from string to enum
        )
    ).first()

    if not timesheet:
        raise HTTPException(404, "No active timesheet")

    rows = []
    queue = f"queue_usage_{current_user.id}"

    while True:
        msg = await r.lpop(queue)
        if not msg:
            break

        data = json.loads(msg)
        if data.get("event") != "usage":
            continue

        # FIXED: Skip if required fields are missing
        if not data.get("app") or not data.get("duration") or not data.get("timestamp"):
            continue

        rows.append(AppUsage(
            employee_id=current_user.id,
            timesheet_id=timesheet.id,  # FIXED: Added timesheet_id
            role=current_user.role,  # FIXED: Added role field
            app=data["app"],
            duration=data["duration"],
            timestamp=datetime.fromisoformat(data["timestamp"])
        ))

    if rows:
        session.add_all(rows)
        session.commit()

    return {"synced": len(rows)}

# Syncing queue with db
@router.put('/stop_tracking')
async def stop_tracking(session: Session = Depends(get_session),
               current_user: User = Depends(get_current_user("employee"))):

    timesheet = session.exec(
        select(Timesheet).where(
            Timesheet.employee_id == current_user.id,
            Timesheet.work_date == date.today(),
            Timesheet.status == TimesheetStatus.ACTIVE  # FIXED: Changed from string to enum
        )
    ).first()

    if not timesheet:
        raise HTTPException(404, "No active timesheet")

    start = timesheet.start_time  # FIXED: Using existing start_time, not modifying it
    end = datetime.now()  # FIXED: Changed from deprecated datetime.utcnow() to datetime.now()
    idle_seconds = timesheet.idle_seconds or 0

    # drain timesheet events
    queue_ts = f"timesheet_{current_user.id}"
    while True:
        msg = await r.lpop(queue_ts)
        if not msg:
            break

        data = json.loads(msg)
        if data["event"] == "idle":
            idle_seconds += int(data["seconds"])

    # drain usage events
    rows = []
    queue_usage = f"queue_usage_{current_user.id}"

    while True:
        msg = await r.lpop(queue_usage)
        if not msg:
            break

        data = json.loads(msg)
        if data.get("event") != "usage":
            continue

        # FIXED: Skip if required fields are missing
        if not data.get("app") or not data.get("duration") or not data.get("timestamp"):
            continue

        rows.append(AppUsage(
            employee_id=current_user.id,
            timesheet_id=timesheet.id,  # FIXED: Added timesheet_id to link app usage to timesheet
            role=current_user.role,  # FIXED: Added role field
            app=data["app"],
            duration=data["duration"],
            timestamp=datetime.fromisoformat(data["timestamp"])
        ))

    if rows:
        session.add_all(rows)

    # FIXED: Only setting end_time here when stopping, not modifying start_time
    timesheet.end_time = end
    timesheet.total_seconds = (end - start).total_seconds()
    timesheet.idle_seconds = idle_seconds
    timesheet.status = TimesheetStatus.INACTIVE  # FIXED: Changed from string to enum

    attendance = session.exec(
        select(Attendance).where(
            Attendance.employee_id == current_user.id,
            Attendance.current_date == date.today()
        )
    ).first()

    if not attendance:
        session.add(Attendance(
            employee_id=current_user.id,
            current_date=date.today(),
            status=AttendanceStatus.PRESENT  # FIXED: Changed from string to enum
        ))

    session.commit()

    return {"message": "Tracking stopped"}
    
  
@router.get('/view_attendance')
def get_attendance(session : Session = Depends(get_session),
                current_user : User= Depends(get_current_user("employee"))):
        
        fetch_attendance = session.exec(select(Attendance).where(Attendance.employee_id == current_user.id)).all()
        if not fetch_attendance:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                                detail = "Your attendance hasnt been marked yet")
        
        return  fetch_attendance  

    
@router.get('/assigned_projects')
def get_projects(session : Session = Depends(get_session),
              current_user : User= Depends(get_current_user("employee"))):
    
    projects = session.exec(select(Projects.name).join(
        ProjectEmployee, ProjectEmployee.project_id == Projects.id
    ).where(ProjectEmployee.employee_id == current_user.id)).all()
    
    if not projects:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="No projects assigned to you")
    return projects

@router.post('/apply_for_leave')
def send_application(application: CreateApplication,
    session:Session=Depends(get_session),
    current_user=Depends(get_current_user("employee"))):
    
    submit = Applications(
        employee_id=current_user.id,
        application_date=date.today(),
        reason = application.reason,
        body = application.body,
        status='pending'
        )
    session.add(submit)
    session.commit()
    session.refresh(submit)
    return "Application submitted successfully"

@router.get('/see_your_applications')
def see_your_applications(status:str|None,
    session:Session=Depends(get_session),
    current_user=Depends(get_current_user("employee"))):
    
    if status == 'pending':
        applications = session.exec(
            select(Applications).where(Applications.employee_id == current_user.id,
                                       Applications.status=='pending')
        ).all()
        
    elif status == 'accepted':
        applications = session.exec(
            select(Applications).where(Applications.employee_id == current_user.id,
                                       Applications.status=='accepted')
        ).all()
        
    elif status == 'rejected':  
        applications = session.exec(
            select(Applications).where(Applications.employee_id == current_user.id,
                                    Applications.status=='rejected')
        ).all()
    
    if not applications:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="No applications found")
    return applications

@router.delete('/delete_application')
def delete_application(a_id:int,
    session:Session=Depends(get_session),
    current_user=Depends(get_current_user("employee"))):
    
    application = session.get(Applications, a_id)
    if not application:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="Application not found")
    session.delete(application)
    session.commit()
    return {"message" : "Application has been deleted"} 

@router.get('/assigned_projects')
def assigned_projects(session:Session=Depends(get_session),
    current_user=Depends(get_current_user("employee"))):
    
    projects = session.exec(
        select(Projects).join(
            ProjectEmployee, ProjectEmployee.project_id == Projects.id
        ).where(ProjectEmployee.employee_id == current_user.id)
    ).all()
    
    if not projects:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="No projects found")
    return projects

@router.get('/get_employees_by_project')
def get_employees_by_project(
            p_id: int,
            session: Session = Depends(get_session),
            current_user=Depends(get_current_user("employee"))):
    """
    Get all employees assigned to a specific project
    Employee can only view projects they are assigned to
    """
    project = session.get(Projects, p_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="No project with this id exists")
    
    # Check if employee is assigned to this project
    is_assigned = session.exec(
        select(ProjectEmployee).where(
            ProjectEmployee.project_id == p_id,
            ProjectEmployee.employee_id == current_user.id
        )
    ).first()
    
    if not is_assigned:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="You are not assigned to this project")
    
    employees = session.exec(
        select(User).join(
            ProjectEmployee,
            ProjectEmployee.employee_id == User.id
        ).where(ProjectEmployee.project_id == p_id)
    ).all()
    
    if not employees:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="No employees assigned to this project")
    return employees

@router.put('/update_project_status')
def update_project_status(
        p_id: int,
        status: str,
        session: Session = Depends(get_session),
        current_user=Depends(get_current_user("employee"))):
    
    project = session.get(Projects, p_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="Project not found")
    project.status = status.lower()
    session.commit()
    return {"message" : "Project status has been updated"}

@router.put('update_tasks_status')
def update_task_status(
        t_id:int,
        status:str,
        session:Session=Depends(get_session),
        current_user=Depends(get_current_user("employee"))):
    
    task = session.get(Projects, t_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="Task not found")
    task.status = status.lower()
    session.commit()
    return {"message" : "Task status has been updated"}

BASE_DIR = Path("screenshots")


@router.post("/upload-screenshot")
async def upload_screenshot(
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    current_user = Depends(get_current_user("employee"))
):
    date_folder = datetime.now().strftime("%Y-%m-%d")
    save_dir = BASE_DIR / str(current_user.id) / date_folder
    save_dir.mkdir(parents=True, exist_ok=True)
    time_sheet = session.exec(
        select(Timesheet).where(Timesheet.employee_id == current_user.id,
                                Timesheet.work_date == date.today())).first()
    if not time_sheet:
        raise HTTPException(status_code=400,
                            detail="No active timesheet found for today")
    screenshot_id = str(uuid4())
    filename = f"{screenshot_id}.png"
    file_path = save_dir / filename

    with open(file_path, "wb") as f:
        f.write(await file.read())

    screenshot = Screenshots(
        employee_id=current_user.id,
        timesheet_id =time_sheet.id,
        user_id=current_user.id,
        filepath=str(file_path)
    )
    session.add(screenshot)
    session.commit()

    return {
        "status": "ok",
        "screenshot_id": str(screenshot_id)
    }


@router.get("/screenshots")
def list_screenshots(
    session: Session = Depends(get_session),
    current_user = Depends(get_current_user("employee")),
):
    shots = session.exec(
        select(Screenshots)
        .where(Screenshots.user_id == current_user.id)
        .order_by(Screenshots.created_at.desc())
    ).all()

    return {
        "screenshots": [
            {
                "id": s.id,
                "image_url": f"/api/screenshots/{s.id}",
                "created_at": s.created_at,
            }
            for s in shots
        ]
    }

@router.get("/screenshot/{id}")
def get_screenshot(
    id: int,
    session: Session = Depends(get_session),
    current_user = Depends(get_current_user("employee")),
):
    s = session.get(Screenshots, id)

    if not s or s.user_id != current_user.id:
        raise HTTPException(status_code=404)

    return FileResponse(s.file_path, media_type="image/png")


@router.get('/get_employee_timesheet')
def get_employee_timesheet(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user("employee"))
):
    timesheets = session.exec(
        select(Timesheet).where(
            Timesheet.employee_id == current_user.id,
            Timesheet.work_date == date.today()
        )
    ).all()
    
    if not timesheets:
        return {
            "timesheets": [],
            "app_usages_map": {},
            "idle_times": []
        }
    
    timesheet_ids = [ts.id for ts in timesheets]
    app_usages = session.exec(
        select(AppUsage).where(AppUsage.timesheet_id.in_(timesheet_ids))
    ).all()
    
    app_usages_map = {}
    for usage in app_usages:
        if usage.timesheet_id not in app_usages_map:
            app_usages_map[usage.timesheet_id] = []
        app_usages_map[usage.timesheet_id].append(usage)
    
    return {
        "timesheets": timesheets,
        "app_usages_map": app_usages_map,
        "idle_times": [{"timesheet_id": ts.id, "idle_seconds": ts.idle_seconds} for ts in timesheets]
    }


@router.get('/get_employee_timesheet_week')
def get_employee_timesheet_week(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user("employee"))
):
    end_date = date.today()
    start_date = end_date - timedelta(days=7)
    
    timesheets = session.exec(
        select(Timesheet).where(
            Timesheet.employee_id == current_user.id,
            Timesheet.work_date >= start_date,
            Timesheet.work_date <= end_date
        )
    ).all()
    
    if not timesheets:
        return {
            "timesheets": [],
            "app_usages_map": {},
            "idle_times": []
        }
    
    timesheet_ids = [ts.id for ts in timesheets]
    app_usages = session.exec(
        select(AppUsage).where(AppUsage.timesheet_id.in_(timesheet_ids))
    ).all()
    
    app_usages_map = {}
    for usage in app_usages:
        if usage.timesheet_id not in app_usages_map:
            app_usages_map[usage.timesheet_id] = []
        app_usages_map[usage.timesheet_id].append(usage)
    
    return {
        "timesheets": timesheets,
        "app_usages_map": app_usages_map,
        "idle_times": [{"timesheet_id": ts.id, "idle_seconds": ts.idle_seconds} for ts in timesheets]
    }


@router.get('/get_employee_screenshots')
def get_employee_screenshots(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user("employee"))
):
    screenshots = session.exec(
        select(Screenshots).where(
            Screenshots.employee_id == current_user.id,
            Screenshots.created_at >= date.today()
        )
    ).all()
    
    if not screenshots:
        return {"screenshots": []}
    
    return {"screenshots": screenshots}


@router.get('/get_employee_screenshots_week')
def get_employee_screenshots_week(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user("employee"))
):
    end_date = date.today()
    start_date = end_date - timedelta(days=7)
    
    screenshots = session.exec(
        select(Screenshots).where(
            Screenshots.employee_id == current_user.id,
            Screenshots.created_at >= start_date,
            Screenshots.created_at <= end_date
        )
    ).all()
    
    if not screenshots:
        return {"screenshots": []}
    
    return {"screenshots": screenshots}


# ===== DASHBOARD ENDPOINTS =====

@router.get('/dashboard/stats')
def get_dashboard_stats(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user("employee"))
):
    """
    Get pre-calculated dashboard stats for the current user (today's data)
    Stats are calculated hourly by background job
    """
    today = date.today()
    
    # Fetch pre-calculated stats from DashboardStats table
    stats = session.exec(
        select(DashboardStats).where(
            DashboardStats.employee_id == current_user.id,
            DashboardStats.stats_date == today
        )
    ).first()
    
    if not stats:
        # If stats haven't been calculated yet, return zeros
        return {
            "today": {
                "hours": 0,
                "idle_hours": 0,
                "idle_percentage": 0,
                "apps": []
            },
            "attendance_status": "not_marked",
            "pending_applications": 0,
            "last_updated": None
        }
    
    # Parse apps JSON
    apps_dict = json.loads(stats.apps_used) if stats.apps_used else {}
    apps_list = [
        {
            "app_name": app_name,
            "duration": app_data.get("duration", 0),
            "percentage": app_data.get("percentage", 0),
            "hours": app_data.get("hours", 0)
        }
        for app_name, app_data in apps_dict.items()
    ]
    
    return {
        "today": {
            "hours": stats.total_hours,
            "idle_hours": stats.idle_hours,
            "idle_percentage": stats.idle_percentage,
            "apps": apps_list
        },
        "attendance_status": stats.attendance_status,
        "pending_applications": stats.pending_applications,
        "last_updated": stats.updated_at.isoformat() if stats.updated_at else None
    }


@router.get('/dashboard/history')
def get_dashboard_history(
    days: int = Query(7, ge=1, le=30),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user("employee"))
):
    """
    Get dashboard stats for the last N days (default: 7 days)
    Useful for showing trends and history
    """
    start_date = date.today() - timedelta(days=days)
    
    stats = session.exec(
        select(DashboardStats).where(
            DashboardStats.employee_id == current_user.id,
            DashboardStats.stats_date >= start_date
        ).order_by(DashboardStats.stats_date.desc())
    ).all()
    
    history = []
    for stat in stats:
        history.append({
            "date": stat.stats_date.isoformat(),
            "hours": stat.total_hours,
            "idle_hours": stat.idle_hours,
            "idle_percentage": stat.idle_percentage,
            "attendance_status": stat.attendance_status
        })
    
    return {
        "period_days": days,
        "history": history,
        "average_hours": sum(s["hours"] for s in history) / len(history) if history else 0,
        "average_idle_pct": sum(s["idle_percentage"] for s in history) / len(history) if history else 0
    }


@router.get('/admin/dashboard/users-stats')
def get_admin_all_users_stats(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user("admin"))
):
    """
    Admin endpoint: Get stats for all employees (today's data)
    Only accessible by admin role
    """
    today = date.today()
    
    # Get all employees' stats for today
    all_stats = session.exec(
        select(DashboardStats).where(
            DashboardStats.stats_date == today
        )
    ).all()
    
    # Enrich with employee names
    users_data = {}
    users = session.exec(select(User).where(User.role == "employee")).all()
    for user in users:
        users_data[user.id] = user.name
    
    stats_list = []
    for stat in all_stats:
        stats_list.append({
            "employee_id": stat.employee_id,
            "employee_name": users_data.get(stat.employee_id, "Unknown"),
            "today_hours": stat.total_hours,
            "idle_hours": stat.idle_hours,
            "idle_percentage": stat.idle_percentage,
            "attendance_status": stat.attendance_status,
            "pending_applications": stat.pending_applications
        })
    
    # Sort by hours (most productive first)
    stats_list.sort(key=lambda x: x["today_hours"], reverse=True)
    
    return {
        "total_employees": len(stats_list),
        "stats": stats_list,
        "date": today.isoformat()
    }


@router.get('/admin/dashboard/user/{employee_id}/history')
def get_admin_user_history(
    employee_id: int,
    days: int = Query(7, ge=1, le=30),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user("admin"))
):
    """
    Admin endpoint: Get detailed history for a specific employee
    Shows stats for the last N days
    """
    # Verify employee exists
    employee = session.get(User, employee_id)
    if not employee or employee.role != "employee":
        raise HTTPException(status_code=404, detail="Employee not found")
    
    start_date = date.today() - timedelta(days=days)
    
    stats = session.exec(
        select(DashboardStats).where(
            DashboardStats.employee_id == employee_id,
            DashboardStats.stats_date >= start_date
        ).order_by(DashboardStats.stats_date.desc())
    ).all()
    
    history = []
    for stat in stats:
        apps_dict = json.loads(stat.apps_used) if stat.apps_used else {}
        apps_list = [
            {
                "app_name": app_name,
                "percentage": app_data.get("percentage", 0)
            }
            for app_name, app_data in apps_dict.items()
        ]
        
        history.append({
            "date": stat.stats_date.isoformat(),
            "hours": stat.total_hours,
            "idle_hours": stat.idle_hours,
            "idle_percentage": stat.idle_percentage,
            "attendance_status": stat.attendance_status,
            "pending_applications": stat.pending_applications,
            "top_apps": apps_list[:5]  # Top 5 apps
        })
    
    return {
        "employee_id": employee_id,
        "employee_name": employee.name,
        "period_days": days,
        "history": history,
        "average_hours": sum(s["hours"] for s in history) / len(history) if history else 0,
        "average_idle_pct": sum(s["idle_percentage"] for s in history) / len(history) if history else 0
    }


@router.post('/admin/dashboard/recalculate-now')
def admin_recalculate_stats_now(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user("admin"))
):
    """
    Admin endpoint: Manually trigger stats calculation (runs background job immediately)
    Useful for testing or force-refreshing stats
    """
    from tasks import calculate_daily_stats
    
    try:
        # Trigger the background job
        task = calculate_daily_stats.delay()
        return {
            "status": "success",
            "message": "Stats recalculation triggered",
            "task_id": task.id
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to trigger calculation: {str(e)}")
