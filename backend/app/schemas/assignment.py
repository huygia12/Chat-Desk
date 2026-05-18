import uuid
from pydantic import BaseModel, Field


class AssignmentSettingOut(BaseModel):
    business_id: uuid.UUID
    employee_assignment_locked: bool
    auto_assign_enabled: bool = False
    auto_assign_strategy: str = "round_robin"
    channel_assignment_rules: dict[str, uuid.UUID | None] = Field(default_factory=dict)
    label_assignment_rules: dict[str, uuid.UUID | None] = Field(default_factory=dict)
    last_round_robin_assignee_id: uuid.UUID | None = None

    model_config = {"from_attributes": True}


class AssignmentSettingUpdate(BaseModel):
    employee_assignment_locked: bool | None = None
    auto_assign_enabled: bool | None = None
    auto_assign_strategy: str | None = None
    channel_assignment_rules: dict[str, uuid.UUID | None] | None = None
    label_assignment_rules: dict[str, uuid.UUID | None] | None = None


class AssigneeOptionOut(BaseModel):
    id: uuid.UUID | None = None
    type: str
    name: str
    email: str | None = None


class AssignmentOverviewBucket(BaseModel):
    assignee_id: uuid.UUID | None = None
    assignee_type: str
    name: str
    email: str | None = None
    count: int


class AssignmentOverviewOut(BaseModel):
    total_conversations: int
    unassigned_count: int
    business_assigned_count: int
    employee_assigned: list[AssignmentOverviewBucket]
