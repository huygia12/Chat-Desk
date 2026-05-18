from pydantic import BaseModel


class MetricPoint(BaseModel):
    key: str
    label: str
    count: int


class TimeSeriesPoint(BaseModel):
    date: str
    conversations: int
    messages: int


class ChannelStatistic(BaseModel):
    id: str
    name: str
    platform: str
    count: int


class AssignmentStatistic(BaseModel):
    key: str
    name: str
    type: str
    count: int


class LabelStatistic(BaseModel):
    id: str
    name: str
    color: str
    count: int


class BusinessStatisticSummary(BaseModel):
    total_conversations: int
    open_conversations: int
    closed_conversations: int
    total_contacts: int
    total_messages: int
    ai_messages: int
    unassigned_conversations: int
    avg_first_response_minutes: float | None = None


class BusinessStatisticsOut(BaseModel):
    days: int
    summary: BusinessStatisticSummary
    volume: list[TimeSeriesPoint]
    platforms: list[MetricPoint]
    channels: list[ChannelStatistic]
    assignments: list[AssignmentStatistic]
    sender_types: list[MetricPoint]
    top_labels: list[LabelStatistic]
