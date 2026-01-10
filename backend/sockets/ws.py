from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from sqlmodel import Session
from data import get_session
from redis.asyncio import Redis

import asyncio
from auth.ws_auth import get_current_ws

router = APIRouter()
r = Redis(host='localhost', port=6379, db=0, decode_responses=True)
class WSConnectionManager():
    def __init__(self):
        self.connections : dict[str, WebSocket] = {}
        self.redis = None
    async def init_redis(self):
        if not self.redis:
            self.redis = await r.from_url('redis://localhost')
    async def connect(self, email:str, websocket: WebSocket ):
        await websocket.accept()
        self.connections[email] = websocket
        await self.redis.sadd("Online users", email)
    async def disconnect(self, email:str):
        self.connections.pop(email, None)
        await self.redis.srem("Online users",email)
    async def send_notification(self, email:str, message:str):
        if email in self.connections:
            await self.connections[email].send_json({"message": message} )       

manager = WSConnectionManager()                        

@router.websocket('/ws')
async def ws_handler(ws:WebSocket):
    await manager.init_redis()
    user = await get_current_ws(ws)
    email = user.email
    await manager.connect(email, ws)
    pubsub = manager.redis.pubsub()
    await pubsub.subscribe(f"notify:{email}")
    
    try:
        while True:
            msg = await pubsub.get_message(ignore_subscribe_messages=True)
            if msg:
                await manager.send_notification(email, msg["data"].decode())
            await asyncio.sleep(0.01)    
    except WebSocketDisconnect:
        await manager.disconnect(email)
        await manager.redis.srem("online users", email)