import uuid
from datetime import datetime
from pydantic import BaseModel, EmailStr


class UserOut(BaseModel):
    id: uuid.UUID
    email: EmailStr
    role: str
    business_name: str | None = None
    business_description: str | None = None
    avatar_url: str | None = None
    store_address: str | None = None
    opening_hours: str | None = None
    shipping_policy: str | None = None
    warranty_policy: str | None = None
    payment_methods: str | None = None
    hotline: str | None = None
    phone: str | None = None
    full_name: str | None = None
    business_id: uuid.UUID | None = None
    is_active: bool = True
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    business_name: str | None = None
    business_description: str | None = None
    store_address: str | None = None
    opening_hours: str | None = None
    shipping_policy: str | None = None
    warranty_policy: str | None = None
    payment_methods: str | None = None
    hotline: str | None = None
    phone: str | None = None


class EmployeeCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str


class EmployeeUpdate(BaseModel):
    is_active: bool


class EmployeeProfileUpdate(BaseModel):
    email: EmailStr
    full_name: str


class EmployeePasswordUpdate(BaseModel):
    password: str


class EmployeeOwnPasswordUpdate(BaseModel):
    current_password: str
    password: str


class EmployeeOut(BaseModel):
    id: uuid.UUID
    email: EmailStr
    role: str
    full_name: str | None = None
    business_id: uuid.UUID | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
