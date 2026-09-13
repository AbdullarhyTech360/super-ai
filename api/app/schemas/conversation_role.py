from sqlmodel import Field, SQLModel

class Chat_role(SQLModel):
    input: str = Field(default="")
    is_new: bool = Field(default=True)
    conversation_id: str | None = None

class Rename_request(SQLModel):
    title: str = Field(default="")

class ConversationBulkDeleteRequest(SQLModel):
    conversation_ids: list[str] = Field(default_factory=list)