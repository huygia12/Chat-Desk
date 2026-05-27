import mimetypes
import re
import uuid
from pathlib import Path
from urllib.parse import urlparse

import httpx
from fastapi import HTTPException, UploadFile

from app.config import get_settings


SAFE_FILENAME_PATTERN = re.compile(r"[^a-zA-Z0-9._-]+")


def get_upload_dir() -> Path:
    settings = get_settings()
    upload_dir = Path(settings.UPLOAD_DIR)
    if not upload_dir.is_absolute():
        upload_dir = Path(__file__).resolve().parents[2] / upload_dir
    upload_dir.mkdir(parents=True, exist_ok=True)
    return upload_dir


def sanitize_filename(filename: str | None) -> str:
    fallback = "attachment"
    if not filename:
        return fallback

    name = Path(filename).name.strip() or fallback
    return SAFE_FILENAME_PATTERN.sub("_", name)[:180] or fallback


def filename_from_url(url: str, fallback: str = "attachment") -> str:
    path_name = Path(urlparse(url).path).name
    return sanitize_filename(path_name or fallback)


def attachment_kind(mime_type: str | None, filename: str | None = None) -> str:
    mime = (mime_type or mimetypes.guess_type(filename or "")[0] or "").lower()
    if mime.startswith("image/"):
        return "image"
    if mime.startswith("video/"):
        return "video"
    if mime.startswith("audio/"):
        return "audio"
    return "file"


def public_file_url(stored_filename: str) -> str:
    settings = get_settings()
    return f"{settings.API_URL.rstrip('/')}/api/files/{stored_filename}"


async def save_upload_file(file: UploadFile) -> dict:
    settings = get_settings()
    original_filename = sanitize_filename(file.filename)
    suffix = Path(original_filename).suffix[:20]
    stored_filename = f"{uuid.uuid4().hex}{suffix}"
    path = get_upload_dir() / stored_filename

    size = 0
    try:
        with path.open("wb") as out_file:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > settings.MAX_UPLOAD_SIZE:
                    out_file.close()
                    path.unlink(missing_ok=True)
                    raise HTTPException(status_code=413, detail="File is too large")
                out_file.write(chunk)
    finally:
        await file.close()

    mime_type = file.content_type or mimetypes.guess_type(original_filename)[0] or "application/octet-stream"
    return {
        "attachment_url": public_file_url(stored_filename),
        "attachment_filename": original_filename,
        "attachment_mime_type": mime_type,
        "attachment_size": size,
        "attachment_kind": attachment_kind(mime_type, original_filename),
        "stored_filename": stored_filename,
    }


async def save_remote_file(
    url: str,
    filename: str | None = None,
    mime_type: str | None = None,
) -> dict | None:
    settings = get_settings()
    original_filename = sanitize_filename(filename) if filename else filename_from_url(url)
    size = 0
    path = None
    try:
        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            async with client.stream("GET", url) as response:
                if response.status_code >= 400:
                    return None

                resolved_mime = (
                    mime_type
                    or response.headers.get("content-type", "").split(";", 1)[0].strip()
                    or mimetypes.guess_type(original_filename)[0]
                    or "application/octet-stream"
                )
                suffix = Path(original_filename).suffix[:20]
                if not suffix:
                    suffix = (mimetypes.guess_extension(resolved_mime) or "")[:20]
                    if suffix:
                        original_filename = f"{original_filename}{suffix}"

                stored_filename = f"{uuid.uuid4().hex}{suffix}"
                path = get_upload_dir() / stored_filename
                with path.open("wb") as out_file:
                    async for chunk in response.aiter_bytes(1024 * 1024):
                        size += len(chunk)
                        if size > settings.MAX_UPLOAD_SIZE:
                            out_file.close()
                            path.unlink(missing_ok=True)
                            raise HTTPException(status_code=413, detail="File is too large")
                        out_file.write(chunk)

        return {
            "attachment_url": public_file_url(stored_filename),
            "attachment_filename": original_filename,
            "attachment_mime_type": resolved_mime,
            "attachment_size": size,
            "attachment_kind": attachment_kind(resolved_mime, original_filename),
            "stored_filename": stored_filename,
        }
    except HTTPException:
        raise
    except Exception:
        if path:
            path.unlink(missing_ok=True)
        return None


def resolve_stored_file(stored_filename: str) -> Path | None:
    safe_name = sanitize_filename(stored_filename)
    if safe_name != stored_filename:
        return None

    path = get_upload_dir() / safe_name
    if not path.is_file():
        return None
    return path


def delete_public_file_url(url: str | None) -> bool:
    if not url:
        return False

    parsed = urlparse(url)
    if not parsed.path.startswith("/api/files/"):
        return False

    stored_filename = Path(parsed.path).name
    path = resolve_stored_file(stored_filename)
    if not path:
        return False

    path.unlink(missing_ok=True)
    return True
