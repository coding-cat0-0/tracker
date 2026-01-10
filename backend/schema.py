from sqlmodel import SQLModel
from typing import Optional, List
from pydantic import field_validator
import re
from datetime import datetime
class UserInput(SQLModel):
    name : str
    username : str
    email : str
    password: str
    
    @field_validator('username')
    def validate_username(cls, v):
        if not v or len(v.strip()) == 0:
            raise ValueError("Username cannot be empty")
        if v != v.lower():
            raise ValueError("Username must be lowercase")
        if not re.match(r'^[a-z0-9_.]+$', v):
            raise ValueError("Username can only contain lowercase letters, numbers, dots, and underscores")
        return v.strip()
    
    @field_validator('email')
    def email_must_be_valid(cls, v):    
        if not re.search(r"\w+@(\w+\.)?\w+\.(com)$",v, re.IGNORECASE):
            raise ValueError("Invalid email format")
        else:
            return v
          
    @field_validator('password')    
    def password_must_be_strong(cls, p):
            if not re.search(r"^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)[A-Za-z\d!@#$%^&_*-]{4,}$", p):
                 raise ValueError("Invalid Password")
            else:
                    return p

class UserLogin(SQLModel):
    username : str
    password: str
    
    @field_validator('username')
    def validate_username(cls, v):
        if not v or len(v.strip()) == 0:
            raise ValueError("Username cannot be empty")
        if v != v.lower():
            raise ValueError("Username must be lowercase")
        if not re.match(r'^[a-z0-9_.]+$', v):
            raise ValueError("Username can only contain lowercase letters, numbers, dots, and underscores")
        return v.strip()
          
    @field_validator('password')    
    def password_must_be_strong(cls, p):
            if not re.search(r"^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)[A-Za-z\d!@#$%^&_*-]{4,}$", p):
                 raise ValueError("Invalid Password")
            else:
                    return p
    
class ForgetPassword(SQLModel):
    otp : str
    email : str
    password : str 
    @field_validator('email')
    def email_must_be_valid(cls, v):    
        if not re.search(r"\w+@(\w+\.)?\w+\.(com)$",v, re.IGNORECASE):
            raise ValueError("Invalid email format")
        else:
            return v
    @field_validator('password')    
    def password_must_be_strong(cls, p):
             if not re.search(r"^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[!@#$%&*^_-])[A-Za-z\d!@#$%^&_*-]{8,}$",p):
                 raise ValueError("Invalid Password")
             else:
                    return p    
                       
class UpdateUser(SQLModel):
    email : Optional[str]
    password : Optional[str]
    
class CreateProject(SQLModel):
    name: str
    emp_id: Optional[List[int]] = None


class CreateApplication(SQLModel):
    reason: str
    body: str
    
class UserInvite(SQLModel):
    email: str
    role: str
    client_id: Optional[int] = None
class UsageCreate(SQLModel):
    app: Optional[str] = None  # FIXED: Changed from app_name to app to match frontend
    duration: Optional[int] = None
    idle_duration: Optional[int] = None
    timestamp: datetime
