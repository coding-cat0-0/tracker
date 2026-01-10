from datetime import datetime, date
from sqlmodel import SQLModel, Field, Relationship
from pydantic import field_validator 
import re
from typing import Optional
from enum import Enum

class User(SQLModel, table=True):
    id : int = Field(default = None, primary_key=True)
    name : str = Field(default=None, nullable = False)
    username : str = Field(default=None, nullable=False, unique=True)
    role : str = Field(default ="employee", nullable=False)
    email : str =  Field(default=None, nullable = False, unique=True)
    password: str =  Field(default=None, nullable = False)
    is_active:bool = Field(default=False, nullable = False)
    otp_code : str = Field(default=None, nullable= True)
    otp_created_at : datetime = Field(default=None, nullable= True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    @field_validator('username')
    @classmethod
    def validate_username(cls, v):
        if not v or len(v.strip()) == 0:
            raise ValueError("Username cannot be empty")
        if v != v.lower():
            raise ValueError("Username must be lowercase")
        if not re.match(r'^[a-z0-9_.]+$', v):
            raise ValueError("Username can only contain lowercase letters, numbers, dots, and underscores")
        return v.strip()


class TimesheetStatus(str,Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"

    
class Timesheet(SQLModel, table=True):
    
    id: Optional[int] = Field(default=None, primary_key=True)
    employee_id: int = Field(foreign_key="user.id")
    work_date: date = Field(default_factory=date.today)
    start_time:datetime = Field(default_factory=datetime.utcnow)
    end_time: Optional[datetime] = Field(default=None, nullable=True)  # FIXED: Removed default_factory so end_time starts as None
    total_seconds: int = Field(default=0)
    status: TimesheetStatus = Field(default=TimesheetStatus.INACTIVE, nullable=False)
    idle_seconds: int = Field(default=0)
    
    @field_validator('total_seconds')
    @classmethod
    def positive_duration(cls, t):
        if t<0:
            raise ValueError("Duration cannot be negative")
        return t
    
    @field_validator("end_time")
    @classmethod
    def comparison(cls, end, info):
        start = info.data.get("start_time")
        if start and end and end < start:
            raise ValueError("Ending time cannot be less than starting time")
        return end
    
    @field_validator("status")
    @classmethod
    def inactive_requires_end_time(cls, v, info):
        if v == "inactive" and not info.data.get("end_time"):
            raise ValueError("Inactive timesheet must have end_time")
        return v


class AttendanceStatus(str,Enum):
    PRESENT = "present"
    ABSENT = "absent"
    LEAVE = "leave"
    
class Attendance(SQLModel, table=True):
    id : int = Field(default = None, primary_key=True)
    employee_id : int = Field(foreign_key="user.id")
    current_date : date = Field(default = date.today(), nullable = False)
    status : AttendanceStatus = Field(default = AttendanceStatus.ABSENT, nullable=False)
    
class Screenshots(SQLModel, table=True):
    id : int = Field(default = None, primary_key=True)
    employee_id : int = Field(foreign_key="user.id")
    timesheet_id : int = Field(foreign_key="timesheet.id")
    filepath : str = Field(default=None)
    timestamp : date = Field(default = date.today(), nullable = False)   

class AppUsage(SQLModel, table=True):
    id : int = Field(default = None, primary_key=True)
    employee_id : int = Field(foreign_key="user.id") 
    timesheet_id: Optional[int] = Field(
        default=None,
        foreign_key="timesheet.id"
    )
    role : str = Field(foreign_key="user.role")
    app : Optional[str] = Field(default=None, nullable=False)
    duration : Optional[int] = Field(default=None, nullable=False)
    timestamp: Optional[datetime] = Field(default_factory=datetime.utcnow)
    
    @field_validator("duration")
    @classmethod
    def positive_duration(cls, v):
        if v <= 0:
            raise ValueError("Duration must be positive")
        return v

class ProjectStatus(str,Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    COMPLETED = "completed"
    
class Projects(SQLModel, table=True):    
       id : int = Field(default=None, primary_key=True)
       name : str = Field(default=None)
       status: ProjectStatus = Field(default=ProjectStatus.INACTIVE, nullable=False)

class ApplicationStatus(str,Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    
class ReasonOptions(str,Enum):
    CASUAL = "casual"
    SICK = "sick"
    OTHER = "other"

class Applications(SQLModel, table=True):
    id: int = Field(default=None, primary_key=True)
    employee_id : int = Field(foreign_key="user.id")
    reason: ReasonOptions = Field(default=ReasonOptions.CASUAL, nullable=False)
    body: str = Field(default=None, nullable=False)
    status:ApplicationStatus = Field(default=ApplicationStatus.PENDING, nullable=False)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    
class ProjectEmployee(SQLModel, table=True):
    project_id: int = Field(
        foreign_key="projects.id",
        primary_key=True
    )
    employee_id: int = Field(
        foreign_key="user.id",
        primary_key=True
    )    

class TaskStatus(str,Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    COMPLETED = "completed"
    
class Tasks(SQLModel, table=True):
    id: int = Field(default=None, primary_key=True)
    project_id: int = Field(foreign_key="projects.id")
    name: str = Field(default=None, nullable=False)
    assigned_to: int = Field(foreign_key="user.id", nullable=False)
    description: str = Field(default=None, nullable=True)
    status: TaskStatus = Field(default=TaskStatus.ACTIVE, nullable=False)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class DashboardStats(SQLModel, table=True):

    id: Optional[int] = Field(default=None, primary_key=True)
    employee_id: int = Field(foreign_key="user.id")
    role : str = Field(foreign_key="user.role")
    stats_date: date = Field(nullable=False)  # Date for which stats are calculated
    total_hours: float = Field(default=0)  # Total hours tracked
    idle_hours: float = Field(default=0)  # Total idle hours
    idle_percentage: float = Field(default=0)  # Idle percentage
    apps_used: str = Field(default="{}")  # JSON string of apps and durations
    attendance_status: Optional[str] = Field(default=None)  # present/absent/leave
    pending_applications: int = Field(default=0)  # Count of pending applications
    calculated_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)