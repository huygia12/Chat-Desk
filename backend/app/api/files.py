import mimetypes

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.services.file_storage import resolve_stored_file

router = APIRouter(prefix="/api/files", tags=["files"])


@router.get("/{stored_filename}")
async def get_uploaded_file(stored_filename: str):
    path = resolve_stored_file(stored_filename)
    if not path:
        raise HTTPException(status_code=404, detail="File not found")

    media_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    return FileResponse(
        path,
        media_type=media_type,
        filename=path.name,
        headers={
            "Cache-Control": "public, max-age=3600",
            "X-Robots-Tag": "all",
        },
    )
