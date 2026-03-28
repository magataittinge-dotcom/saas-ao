import uuid
from pathlib import Path
from typing import Optional
from config import get_settings

settings = get_settings()

UPLOADS_ROOT = Path(__file__).parent.parent / "uploads"


class FileStorage:
    """File storage — local filesystem in dev, S3 in production."""

    def __init__(self):
        self._use_s3 = bool(settings.AWS_ACCESS_KEY_ID and settings.AWS_S3_BUCKET)

    async def upload(
        self,
        content: bytes,
        filename: str,
        prefix: str,
        content_type: Optional[str] = None,
    ) -> str:
        key = f"{prefix}/{uuid.uuid4()}-{filename}"
        if self._use_s3:
            return await self._upload_s3(content, key, content_type)
        return self._upload_local(content, key)

    async def _upload_s3(self, content: bytes, key: str, content_type: Optional[str]) -> str:
        import boto3
        s3 = boto3.client(
            "s3",
            region_name=settings.AWS_REGION,
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        )
        extra = {"ContentType": content_type} if content_type else {}
        s3.put_object(Bucket=settings.AWS_S3_BUCKET, Key=key, Body=content, **extra)
        return f"https://{settings.AWS_S3_BUCKET}.s3.{settings.AWS_REGION}.amazonaws.com/{key}"

    def _upload_local(self, content: bytes, key: str) -> str:
        path = UPLOADS_ROOT / key
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        return f"/uploads/{key}"

    def delete_local(self, file_url: str) -> None:
        """Delete a locally stored file given its URL."""
        if file_url.startswith("/uploads/"):
            path = UPLOADS_ROOT / file_url.removeprefix("/uploads/")
            if path.exists():
                path.unlink()
