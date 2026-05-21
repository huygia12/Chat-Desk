from pydantic import BaseModel, Field


class DeviceRegisterRequest(BaseModel):
    expo_push_token: str = Field(min_length=1, max_length=255)
    platform: str | None = Field(default=None, max_length=32)
    device_name: str | None = Field(default=None, max_length=255)


class DeviceRegisterResponse(BaseModel):
    status: str
