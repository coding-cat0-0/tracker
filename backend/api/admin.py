from datetime import timedelta, date, datetime
from typing import Annotated
from data import get_session
from fastapi import APIRouter, Depends, HTTPException, status, Query
from datetime import datetime, timedelta
from model import User, AppUsage, Timesheet,Attendance, Screenshots, Projects, Applications, ProjectEmployee
from auth.jwt_hasher import create_access_token, hash_password, get_current_user, bearer_scheme, check_hashed_password
from sqlmodel import Session, select

from sqlmodel import SQLModel, delete
from typing import Optional, List
from fastapi.responses import FileResponse
from schema import CreateProject, UserInvite, UpdateUser, ApplicationRview
from bg_tasks import send_invitation_email_task
from auth.jwt_hasher import create_invite_token

router = APIRouter(
    tags=['Admin']
)

@router.post("/invite_users")
async def invite_employee(
    user: UserInvite,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user("admin")),

):

    token = create_invite_token(
        email=user.email,
        role=user.role,
        client_id=user.client_id
    )
    invite_link = build_invite_link(token)
    send_invitation_email_task.delay(user.email, invite_link)
    connection = active_connections.get(current_user.email)
    if connection:
        await connection.send_text("Invitation sent")

    return {"detail": "Invitation queued"}

@router.get('/get_all_employees')
def view_all_employees( session:Session = Depends(get_session),
                    current_user : User = Depends(get_current_user("admin"))):

    employees = session.exec(select(User).where(User.role == "employee")).all()   
    
    if employees is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail = f"No employees found")
    return employees

    
# Get Activity    
@router.get('/get_user_activity')
def view_user_activity( employee_id : int ,session:Session = Depends(get_session),
                    current_user : User = Depends(get_current_user("admin"))):

    find_user(employee_id)
    get_activity = session.exec(select(AppUsage).where(
        AppUsage.employee_id == employee_id, AppUsage.role == "employee")).all() 
       
    if get_activity is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail = f"No activity found")
    return get_activity    

# Get employee timesheet
@router.get('/get_all_timesheets')
def get_all_timesheets(
                    session:Session = Depends(get_session),
                    current_user : User = Depends(get_current_user("admin"))):
    """Get all timesheets for today with app usage data"""
    timesheets = session.exec(select(Timesheet).where(
        Timesheet.work_date == date.today())).all()   
    
    if not timesheets:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="No timesheet for this date found")
    
    # Fetch all AppUsage records for these timesheets
    timesheet_ids = [ts.id for ts in timesheets]
    app_usages = session.exec(
        select(AppUsage).where(AppUsage.timesheet_id.in_(timesheet_ids))
    ).all()
    
    # Build map of timesheet_id -> list of AppUsage records
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

@router.get('/get_user_timesheet')
def get_user_timesheet(employee_id: int,
                       session: Session = Depends(get_session),
                       current_user: User = Depends(get_current_user("admin"))):
    """Get 7-day timesheet for specific employee with app usage data"""
    find_user(session, employee_id)
    end_date = date.today()
    start_date = end_date - timedelta(days=7)
    
    timesheets = session.exec(select(Timesheet).where(
        Timesheet.employee_id == employee_id,
        Timesheet.work_date >= start_date,
        Timesheet.work_date <= end_date)).all()
    
    if not timesheets:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="No timesheet for this employee found")
    
    # Fetch all AppUsage records for these timesheets
    timesheet_ids = [ts.id for ts in timesheets]
    app_usages = session.exec(
        select(AppUsage).where(AppUsage.timesheet_id.in_(timesheet_ids))
    ).all()
    
    # Build map of timesheet_id -> list of AppUsage records
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
# Get employee attendance
@router.post('/get_user_attendance')
def view_user_attendance(employee_id : int ,session:Session = Depends(get_session),
                    current_user : User = Depends(get_current_user("admin"))):  

    find_user(employee_id)
    get_attendance = session.exec(select(Attendance).where(
        Attendance.employee_id == employee_id)).all()   

    if get_attendance is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail = f"Attendance not found")
    return get_attendance  


@router.delete('/remove_employee')
async def remove_employee( client_id : int,
    session:Session = Depends(get_session),
    current_user : User = Depends(get_current_user("admin"))):

    find_user(employee_id)
    employee = session.get(User, employee_id)
    if not employee or employee.role != 'employee': 
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail = f"No employee with id {employee_id} found")
        
    session.delete(employee) 
    session.commit()          
        
 
        
    return {'message' : 'Client and all their related data has been removed'} 
   
""" employee = session.get(User, employee_id)
    if not employee or employee.role != 'employee': 
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail = f"No employee with id {employee_id} found")
        
    session.exec(delete(Timesheet).where(Timesheet.employee_id == employee_id))
    session.exec(delete(Attendance).where(Attendance.employee_id == employee_id))
    session.exec(delete(AppUsage).where(AppUsage.employee_id == employee_id))
    session.exec(delete(Screenshots).where(Screenshots.employee_id == employee_id))
    session.delete(employee)

    session.commit()"""
    
# Updating clients and employees
"""@router.put('/update_employee_details')
async def update_user_details(user_id :int, update_user : UpdateUser,
    session:Session= Depends(get_session), current_user : User = Depends(get_current_user())):
    
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Only admins are authorised to perform this action")
    
    query = session.exec(select(User).where(User.id == user_id)).first()
    if query:
        for key, value in update_user.model_dump(exclude_unset=True).items():
            if value not in (None, "", "string", 0):
                if key == "email":
                    existing_email = select(User).where(User.email == value)
                    check_existing_email : User = session.exec(existing_email).first()
                    if check_existing_email:
                        raise HTTPException(status_code= 400, detail='Email already exists')
                if key == "password":
                    value = get_hashed_password(value)
                setattr(query, key, value)
        session.add(query)
        session.commit()
         
    else:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"User of id {user_id} not found") 
    
    email = current_user.email
    connection = active_connections.get(email)
        
    if connection:
            print("Active Connection", active_connections)
            print("Target email", email) 
            await connection.send_text(f"{query.role} successfuly updated")  
    else:
            print(f"No websocket with email {email} logged in..") 
    
    return {'message' : f'{query.role} has been updated'} """
    
@router.get('/get_screenshots')
def get_screenshots(
            employee_id : int,
            session:Session = Depends(get_session),
            current_user : User = Depends(get_current_user("admin"))):

    find_user(session, employee_id)
    screenshots=session.exec(select(Screenshots).where(
        Screenshots.employee_id == employee_id,
        Screenshots.timestamp == date.today())).all()
    if not screenshots:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail = f"Screenshots of employee id {employee_id} found ") 
    return screenshots    

@router.get('/get_users_screenshots')
def get_users_screenshots(
            employee_id : int,
            session:Session = Depends(get_session),
            current_user : User = Depends(get_current_user("admin"))):

    end_date= date.today()
    start_date = end_date - timedelta(days=7)
    
    screenshots = session.exec(select(Screenshots).where(
        Screenshots.employee_id == employee_id,
        Screenshots.timestamp >= start_date,
        Screenshots.timestamp <= end_date)).all()
    
    if not screenshots:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail = f"Screenshots not found ") 
    return screenshots      
# Router for getting screenshot
@router.get('/view_screenshot')
def view_screenshot_file(screenshot_id : int,
            session:Session = Depends(get_session),
            current_user : User = Depends(get_current_user("admin"))):

    screenshot = session.exec(select(Screenshots).where(Screenshots.id == screenshot_id)).first()
    if not screenshot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail = f"Screenshot of id {screenshot_id} found ")
    return FileResponse(screenshot.filepath, media_type="image/png")   
 
# Downloading screenshot 
@router.get('/download_screenshot')
def download_screenshot(screenshot_id : int,
            session:Session = Depends(get_session),
            current_user : User = Depends(get_current_user("admin"))):

    
    screenshot = session.get(Screenshots, screenshot_id)
    if not screenshot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail = f"Screenshot of id {screenshot_id} found ")
        
    return FileResponse(
            path = screenshot.filepath,
            filename = f"screenshot_{screenshot.id}_{screenshot.timestamp}.png",
            media_type="image/png"
        )

#Collective endpoint for admin to view employee
@router.get('employee_stats')
def get_stats(employee_id:int,            
            current_user : User = Depends(get_current_user("admin"))):

    find_user(employee_id)
        
    timesheet = session.exec(select(Timesheet).where(Timesheet.employee_id == employee_id)).all()
    attendance = session.exec(select(Attendance).where(Attendance.employee_id == employee_id)).all()
    activities = session.exec(select(AppUsage).where(AppUsage.employee_id == employee_id)).all()
    screenshots = session.exec(select(Screenshots).where(Screenshots.employee_id == employee_id)).all()
    project_names = session.exec(
        select(Projects.name)
        .join(ProjectEmployee, ProjectEmployee.project_id == Projects.id)
        .where(ProjectEmployee.employee_id == employee_id)
    ).all()
    return {
        "timsheet" : timesheet,
        "attendance" : attendance,
        "activities" : activities,
        "screenshots" : screenshots,
        "projects" : project_names,
    }
    
@router.post("/create_project")
def create_proj(
            proj: CreateProject,
            session: Session = Depends(get_session),
            current_user: User = Depends(get_current_user("admin"))):

    existing = session.exec(select(Projects).where(Projects.name == proj.name)).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="A project by this name already exists")
    p_name = proj.name
    p = Projects(
        name = p_name
    )
    session.add(p)
    session.refresh(p)
    
    for emp in proj.emp_id:
        session.add(
            ProjectEmployee(
            project_id = p.id,
            employee_id = emp
        )
            )

    session.commit()      
    return {"message" : "Project has been created", "project_id": p.id} 
  
    
@router.put('/assign_projects')
def assign_proj(
            p_id: int, 
            emp_ids: List[int],            
            session: Session = Depends(get_session),
            current_user: User = Depends(get_current_user("admin"))):

    for emp in emp_ids:
        existing = session.exec(select(
            ProjectEmployee).where(
            ProjectEmployee.project_id == p_id,
            ProjectEmployee.employee_id == emp)).first()
        
        if existing:
            continue
            
        session.add(
            ProjectEmployee(
            project_id = p_id,
            employee_id = emp
        )
            )    
        
    session.commit()    
    return {"message":"Project assigned to employees"}

@router.delete('/delete_project')
def delete_project(
            p_id: int,             
            session: Session = Depends(get_session),
            current_user: User = Depends(get_current_user("admin"))):

    project = session.get(Projects, p_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="No project with this id exists")
    session.exec(delete(ProjectEmployee).where(
        ProjectEmployee.project_id == p_id))
    session.delete(project)
    session.commit()    
    return {"message":"Project and all its assignments have been removed"}  

@router.delete('/remove_employee')
def remove_employee(
            p_id: int,             
            emp_id: int,            
            session: Session = Depends(get_session),
            current_user: User = Depends(get_current_user("admin"))):

    project = session.get(Projects, p_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="No project with this id exists")
    session.exec(delete(ProjectEmployee).where(
        ProjectEmployee.project_id == p_id, ProjectEmployee.employee_id == emp_id))
    session.commit()    
    return {"message":"Employee has been removed from project"}

@router.get('/view_assigned_employees')
def view_assigned_employees(
            session: Session = Depends(get_session),
            current_user: User = Depends(get_current_user("admin"))):
    
    
    assigned_employees = session.exec(
        select(User).join(
            ProjectEmployee,
            ProjectEmployee.employee_id == User.id
        ).distinct()
    ).all()
    
    if not assigned_employees:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="No employees assigned to any project")
    return assigned_employees

@router.get('/get_employees_by_project')
def get_employees_by_project(
            p_id: int,
            session: Session = Depends(get_session),
            current_user: User = Depends(get_current_user("admin"))):
    """
    Get all employees assigned to a specific project
    """
    project = session.get(Projects, p_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="No project with this id exists")
    
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

@router.get('/get_unassigned_employees')
def get_unassigned_employees(
            p_id: int,
            session: Session = Depends(get_session),
            current_user: User = Depends(get_current_user("admin"))):
    """
    Get all employees NOT assigned to a specific project
    """
    project = session.get(Projects, p_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="No project with this id exists")
    
    # Get all employees
    all_employees = session.exec(select(User).where(User.role == "employee")).all()
    
    # Get assigned employees for this project
    assigned_ids = session.exec(
        select(ProjectEmployee.employee_id).where(ProjectEmployee.project_id == p_id)
    ).all()
    
    # Filter out assigned employees
    unassigned = [emp for emp in all_employees if emp.id not in assigned_ids]
    
    if not unassigned:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="All employees are already assigned to this project")
    return unassigned

@router.get('/view_projects')
def view_projects(
            session: Session = Depends(get_session),
            current_user: User = Depends(get_current_user("admin"))):
    
    projects = session.exec(select(Projects)).all()
    if not projects:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="No projects found")
    return projects

@router.get('/view_applications')
def view_applications(           
            session:Session = Depends(get_session),
            current_user : User = Depends(get_current_user("admin"))):
    
    applications = session.exec(select(Applications)).all()
    if not applications:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="No applications found")
    return applications

@router.get('/get_applications')
def get_applications(
            employee_id:int,             
            session:Session = Depends(get_session),
            current_user : User = Depends(get_current_user("admin"))):

    applications = session.exec(select(Applications).where(Applications.employee_id == employee_id)).all()
    if not applications:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="No application submiited by this employee")
    
    return applications
@router.post('create_tasks')
def create_tasks(
            project_id:int,
            name:str,
            assigned_to:int,             
            current_user : User = Depends(get_current_user("admin"))):

    find_user(assigned_to)
    project = session.get(Projects, project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="No project with this id exists")
    
    task = Tasks(
        project_id = project_id,
        name = name,
        assigned_to = assigned_to
    )
    session.add(task)
    session.commit()    
    return {"message":"Task has been created"}
@router.put('update_task')
def update_task(
            task_id:int,
            name:Optional[str]=None,
            assigned_to:Optional[int]=None,             
            current_user : User = Depends(get_current_user("admin"))):

    task = session.get(Tasks, task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="No task with this id exists")
    if name:
        task.name = name
    if assigned_to:
        find_user(assigned_to)
        task.assigned_to = assigned_to
    
    session.commit()    
    return {"message":"Task has been updated"}

@router.put('/review_application')
def review_application(
            review_data: ApplicationRview,             
            session:Session = Depends(get_session),             
            current_user : User = Depends(get_current_user("admin"))):

    application = session.get(Applications, review_data.app_id)
    if not application:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="No application with this id exists")
    new_status = review_data.status.lower()
    if new_status not in ("accepted","rejected"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Status must be either accepted or rejected")
    
    application.status = new_status.upper()
    session.add(application)
    session.commit()    
    return {"message":"Application has been reviewed"}
    
def find_user(session: Session,id:int):
       check =session.exec(select(User).where(User.id == id)).first()
       if not check:
           raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                               detail=f"No employee of id {id} could be found")
       return check  
   
   