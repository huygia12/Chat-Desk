import uuid
from pydantic import BaseModel


class AssignmentSettingOut(BaseModel):
    business_id: uuid.UUID
    employee_assignment_locked: bool

    model_config = {"from_attributes": True}


class AssignmentSettingUpdate(BaseModel):
    employee_assignment_locked: bool


class AssigneeOptionOut(BaseModel):
    id: uuid.UUID | None = None
    type: str
    name: str
    email: str | None = None
