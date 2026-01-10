from datetime import timedelta
from sqlmodel import SQLModel
from typing import Annotated
from data import get_session
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from model import User
from schema import UserInput, UserLogin, ForgetPassword
from auth.jwt_hasher import create_access_token, hash_password, check_hashed_password
from sqlmodel import Session, select
from email.mime.text import MIMEText
import smtplib
from datetime import datetime, timedelta
import random

import os

router = APIRouter(
    tags=['Login']
)


@router.post('/signup')
def signup(
    user : UserInput, session : Session = Depends(get_session)):
    user.name = user.name.strip()
    user.username = user.username.strip()
    user.email = user.email.strip()
    user.password = user.password.strip()
    
    # Check if username already exists
    existing_username = session.exec(select(User).where(User.username == user.username)).first()
    if existing_username:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Username already exists")
    
    try:
        hashed_password = hash_password(user.password)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail=str(e))
    
    create = User(
        name = user.name,
        username = user.username,
        email = user.email,
        password = hashed_password
    )    
    
    session.add(create)
    session.commit()
    session.refresh(create)
    return {"message" : "User created"}

# Login route
@router.post('/signin')
def signin(
    user: UserLogin,
    session : Session = Depends(get_session)
):
    query = session.exec(select(User).where(User.username == user.username)).first()
    if not query:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail = "Wrong username"
                    )
    if not check_hashed_password(user.password, query.password):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail = "Invalid password") 
  
    access_token = create_access_token(data = {'sub' : query.username,
                                    'id' : query.id, 'role' : query.role})
    
    return {'message':'Login successful',
            'access_token' : access_token,
            'token_type' : 'bearer'}    


# Generating OTP
def send_otp(to_email: str, otp: str):
    sender_email = os.getenv(SMTP_USERNAME)     
    app_password = os.getenv(SMTP_PASSWORD) 

    msg = MIMEText(f"Your OTP is {otp}")
    msg["Subject"] = "OTP for login"
    msg["From"] = sender_email
    msg["To"] = to_email

    # Connect to Gmail SMTP
    with smtplib.SMTP("smtp.gmail.com", 587) as server:
        server.starttls()          
        server.login(sender_email, app_password)
        server.send_message(msg)
  
@router.post('/generate_otp')
def generate_otp(email : str, session: Session = Depends(get_session)):
    otp = str(random.randint(100000, 999999))
    user_obj = select(User).where(User.email == email)
    generate = session.exec(user_obj).first()
    if generate:
        generate.otp_code = otp
        generate.otp_created_at = datetime.utcnow()      
        
        session.add(generate)
        session.commit()
        send_otp(generate.email, otp)

        return {"message": "OTP sent to your email"}  
    
    else: 
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found")    
  
# Updating password      
@router.post('/update_password')
def update_password(user : ForgetPassword,
                    session: Session = Depends(get_session)):
    query = select(User).where(User.email == user.email, User.otp_code == user.otp)
    user_obj = session.exec(query).first()
    
    if user_obj is not None:
       
        if datetime.utcnow() > user_obj.otp_created_at + timedelta(minutes=2):
            user_obj.otp_code = None
            user_obj.otp_created_at = None
            session.commit()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="OTP expired, please request a new one") 
        else:
            user_obj.password = get_hashed_password(user.password)
            user_obj.otp_code = None
            user_obj.otp_created_at = None
            session.commit()
            return {"message" : "Password changed successfully"}
         
    else: 
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail = "No user found")
                

def raise_error_404():
    raise HTTPException(
    status_code=status.HTTP_404_NOT_FOUND,
    detail="User not found",
    headers={"WWW-Authenticate": "Bearer"}
    )
        