from sqlmodel import Field, SQLModel

class Chat_role(SQLModel):
    input: str = Field(default="")
    is_new: bool = Field(default=True)
    conversation_id: str | None = None