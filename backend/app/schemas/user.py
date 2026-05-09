import uuid
from datetime import datetime
from pydantic import BaseModel, EmailStr


class UserOut(BaseModel):
    id: uuid.UUID
    email: EmailStr
    role: str
    business_name: str | None = None
    business_description: str | None = None
    phone: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    business_name: str | None = None
    business_description: str | None = None
    phone: str | None = None
