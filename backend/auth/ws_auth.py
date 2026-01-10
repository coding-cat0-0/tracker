from fastapi import WebSocket, status, Depends
from jose import jwt, JWTError, ExpiredSignatureError
from sqlmodel import Session, select
from typing import Optional
from datetime import timezone
from data import get_session
from model import User
from decouple import config


SECRET_KEY: str = config('SECRET_KEY')
ALGORITHM: str = config('ALGORITHM', default='HS256')

async def get_current_ws(
    websocket:WebSocket,
    session:Session=Depends(get_session),
    required_role: Optional[str] = None
):
    async def close(code=status.WS_1008_POLICY_VIOLATION):
        await websocket.close(code=code)
        return None
    
    token = websocket.query_params.get("token")
    if not token:
        return await close()

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except ExpiredSignatureError:
        print('token expired')
        return await close()
    except JWTError:
        print('invalid token')
        return await close()
    
    email = payload.get('sub')
    user_id = payload.get("id")
    role = payload.get("role")
    
    
    if not email or not user_id or not role:
        print('missing credentials in token')
        return await close()
        
    user = session.exec(select(Users).where(Users.id == user_id, Users.email == email)).first()
    if not user:
        print('User not found')
        return await close()
    
    if required_role and user.role != required_role:
        print('role mismatch')
        return await close()

    return user
