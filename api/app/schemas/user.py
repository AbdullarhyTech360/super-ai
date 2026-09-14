from sqlmodel import Field, SQLModel

class ProfileUpdate(SQLModel):
    full_name: str = Field(default="")

class ChangePasswordRequest(SQLModel):
    current_password: str = Field(default="")
    new_password: str = Field(default="")