import re
import uuid
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import get_current_business_or_employee, get_effective_business_id
from app.database import get_db
from app.i18n import t
from app.models.saved_reply import SavedReply
from app.models.user import User
from app.schemas.saved_reply import SavedReplyCreate, SavedReplyOut, SavedReplyUpdate

router = APIRouter(prefix="/api/saved-replies", tags=["saved-replies"])

SHORTCUT_PATTERN = re.compile(r"^[a-zA-Z0-9_-]+$")


def _normalize_shortcut(shortcut: str) -> str:
    normalized = shortcut.strip().lstrip("/").lower()
    if not normalized:
        raise HTTPException(status_code=422, detail="Shortcut is required")
    if not SHORTCUT_PATTERN.match(normalized):
        raise HTTPException(
            status_code=422,
            detail="Shortcut can only contain letters, numbers, hyphen, and underscore",
        )
    return normalized


def _normalize_text(value: str, field_name: str) -> str:
    normalized = value.strip()
    if not normalized:
        raise HTTPException(status_code=422, detail=f"{field_name} is required")
    return normalized


async def _ensure_shortcut_available(
    db: AsyncSession,
    *,
    business_id: uuid.UUID,
    owner_id: uuid.UUID | None,
    visibility: str,
    shortcut: str,
    exclude_id: uuid.UUID | None = None,
) -> None:
    filters = [
        SavedReply.business_id == business_id,
        SavedReply.visibility == visibility,
        SavedReply.shortcut == shortcut,
    ]
    if owner_id is None:
        filters.append(SavedReply.owner_id.is_(None))
    else:
        filters.append(SavedReply.owner_id == owner_id)
    if exclude_id is not None:
        filters.append(SavedReply.id != exclude_id)

    result = await db.execute(select(SavedReply).where(*filters))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Shortcut already exists")


def _can_modify(reply: SavedReply, current_user: User, business_id: uuid.UUID) -> bool:
    if reply.business_id != business_id:
        return False
    if current_user.role == "business":
        return reply.visibility == "business" and reply.owner_id is None
    if current_user.role == "employee":
        return reply.visibility == "personal" and reply.owner_id == current_user.id
    return False


@router.get("", response_model=list[SavedReplyOut])
async def list_saved_replies(
    search: str | None = Query(default=None, max_length=120),
    current_user: User = Depends(get_current_business_or_employee),
    db: AsyncSession = Depends(get_db),
):
    business_id = get_effective_business_id(current_user)
    if current_user.role == "business":
        query = select(SavedReply).where(
            SavedReply.business_id == business_id,
            SavedReply.visibility == "business",
            SavedReply.owner_id.is_(None),
        )
    else:
        query = select(SavedReply).where(
            SavedReply.business_id == business_id,
            or_(
                SavedReply.visibility == "business",
                SavedReply.owner_id == current_user.id,
            ),
        )

    search_text = search.strip().lstrip("/") if search else ""
    if search_text:
        search_pattern = f"%{search_text}%"
        query = query.where(
            or_(
                SavedReply.title.ilike(search_pattern),
                SavedReply.shortcut.ilike(search_pattern),
            )
        )

    result = await db.execute(query.order_by(SavedReply.visibility.asc(), SavedReply.shortcut.asc()))
    return result.scalars().all()


@router.post("", response_model=SavedReplyOut, status_code=status.HTTP_201_CREATED)
async def create_saved_reply(
    data: SavedReplyCreate,
    current_user: User = Depends(get_current_business_or_employee),
    db: AsyncSession = Depends(get_db),
):
    business_id = get_effective_business_id(current_user)
    visibility = data.visibility

    if current_user.role == "business" and visibility != "business":
        raise HTTPException(status_code=403, detail="Business users can only create business templates")
    if current_user.role == "employee" and visibility != "personal":
        raise HTTPException(status_code=403, detail="Employees can only create personal templates")

    owner_id = None if visibility == "business" else current_user.id
    shortcut = _normalize_shortcut(data.shortcut)
    await _ensure_shortcut_available(
        db,
        business_id=business_id,
        owner_id=owner_id,
        visibility=visibility,
        shortcut=shortcut,
    )

    reply = SavedReply(
        business_id=business_id,
        owner_id=owner_id,
        visibility=visibility,
        title=_normalize_text(data.title, "Title"),
        shortcut=shortcut,
        content=_normalize_text(data.content, "Content"),
    )
    db.add(reply)
    await db.flush()
    await db.refresh(reply)
    return reply


@router.put("/{reply_id}", response_model=SavedReplyOut)
async def update_saved_reply(
    reply_id: uuid.UUID,
    data: SavedReplyUpdate,
    current_user: User = Depends(get_current_business_or_employee),
    db: AsyncSession = Depends(get_db),
):
    business_id = get_effective_business_id(current_user)
    result = await db.execute(select(SavedReply).where(SavedReply.id == reply_id))
    reply = result.scalar_one_or_none()
    if not reply or not _can_modify(reply, current_user, business_id):
        raise HTTPException(status_code=404, detail="Saved reply not found")

    shortcut = _normalize_shortcut(data.shortcut)
    await _ensure_shortcut_available(
        db,
        business_id=business_id,
        owner_id=reply.owner_id,
        visibility=reply.visibility,
        shortcut=shortcut,
        exclude_id=reply.id,
    )

    reply.title = _normalize_text(data.title, "Title")
    reply.shortcut = shortcut
    reply.content = _normalize_text(data.content, "Content")
    await db.flush()
    await db.refresh(reply)
    return reply


@router.delete("/{reply_id}")
async def delete_saved_reply(
    reply_id: uuid.UUID,
    current_user: User = Depends(get_current_business_or_employee),
    db: AsyncSession = Depends(get_db),
):
    business_id = get_effective_business_id(current_user)
    result = await db.execute(select(SavedReply).where(SavedReply.id == reply_id))
    reply = result.scalar_one_or_none()
    if not reply or not _can_modify(reply, current_user, business_id):
        raise HTTPException(status_code=404, detail="Saved reply not found")

    await db.delete(reply)
    return {"detail": t("Saved reply deleted")}
