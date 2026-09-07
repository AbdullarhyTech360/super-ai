from sqlmodel import Field, SQLModel
from app.services.generate_uuid import generate_uuid

class Login(SQLModel):
    email: str
    password: str

class SignUp(SQLModel):
    full_name: str
    email: str
    password: str