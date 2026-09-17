from sqlmodel import Field, SQLModel


class ProfileUpdate(SQLModel):
    full_name: str = Field(default="")


class ChangePasswordRequest(SQLModel):
    current_password: str = Field(default="")
    new_password: str = Field(default="")


class ForgotPasswordRequest(SQLModel):
    email: str = Field(default="")


class ResetPasswordRequest(SQLModel):
    token: str = Field(default="")
    new_password: str = Field(default="")


class VerifyEmailRequest(SQLModel):
    token: str = Field(default="")


class ResendVerificationRequest(SQLModel):
    email: str = Field(default="")
