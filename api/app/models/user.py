from sqlmodel import Field, SQLModel
from app.services.generate_uuid import generate_uuid

class User(SQLModel, table=True):
    id: str = Field(default_factory=lambda: str(generate_uuid()), primary_key=True)
    full_name: str
    email: str = Field(index=True, unique=True)
    hashed_password: str
