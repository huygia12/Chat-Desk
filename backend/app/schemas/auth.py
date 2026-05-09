from pydantic import BaseModel, EmailStr


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    business_name: str
    phone: str | None = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
