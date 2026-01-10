from fastapi import FastAPI, status
from sqlmodel import SQLModel
from data import engine
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from api.employee import router as employee
from api.admin import router as admin
from api.auth_route import router as auth_route

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4200"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc):
    errors = [err['msg'] for err in exc.errors()] 
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"message": ", ".join(errors)},
    )
    
#  Include routers
app.include_router(employee, prefix="/employee", tags=["Employee"])
app.include_router(auth_route, prefix="/auth", tags=["Authentication"])
app.include_router(admin, prefix="/admin", tags=["Admin"])

#  Create tables on startup
@app.on_event("startup")
def on_startup() -> None:
    SQLModel.metadata.create_all(engine)