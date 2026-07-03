import hashlib
import hmac
import shutil
import time
import uuid
from pathlib import Path
from typing import IO, Optional
from urllib.parse import quote
from config import get_settings

settings = get_settings()

UPLOADS_ROOT = Path(__file__).parent.parent / "uploads"

# URLs signées à durée limitée (C22) — liens coffre-fort / documents.
SIGNED_URL_TTL = 15 * 60  # 15 minutes


def _file_signature(file_path: str, org_id: str, exp: int) -> str:
    msg = f"{file_path}|{org_id}|{exp}".encode("utf-8")
    return hmac.new(settings.SECRET_KEY.encode("utf-8"), msg, hashlib.sha256).hexdigest()


def sign_file_path(file_path: str, org_id: str, expires_in: int = SIGNED_URL_TTL) -> str:
    """Retourne une URL signée /api/files/view/... valable `expires_in` secondes.

    `file_path` est le chemin relatif sous uploads/ (sans préfixe /uploads/),
    NON encodé. La signature lie chemin + org + expiration : toute altération
    de l'un des trois invalide l'URL."""
    exp = int(time.time()) + expires_in
    sig = _file_signature(file_path, org_id, exp)
    quoted = "/".join(quote(seg) for seg in file_path.split("/"))
    return f"/api/files/view/{quoted}?org={quote(org_id)}&exp={exp}&sig={sig}"


def verify_file_signature(file_path: str, org_id: str, exp, sig) -> bool:
    """Vérifie signature + expiration. Fail closed sur toute entrée invalide."""
    try:
        exp_int = int(exp)
    except (TypeError, ValueError):
        return False
    if time.time() > exp_int:
        return False
    expected = _file_signature(file_path, org_id, exp_int)
    return hmac.compare_digest(expected, sig or "")


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

    async def upload_stream(
        self,
        fileobj: IO[bytes],
        filename: str,
        prefix: str,
        content_type: Optional[str] = None,
    ) -> str:
        """Persist a file-like object without ever loading the whole payload into memory."""
        key = f"{prefix}/{uuid.uuid4()}-{filename}"
        if self._use_s3:
            return await self._upload_s3_stream(fileobj, key, content_type)
        return self._upload_local_stream(fileobj, key)

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

    async def _upload_s3_stream(
        self, fileobj: IO[bytes], key: str, content_type: Optional[str],
    ) -> str:
        import boto3
        s3 = boto3.client(
            "s3",
            region_name=settings.AWS_REGION,
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        )
        extra = {"ContentType": content_type} if content_type else {}
        try:
            fileobj.seek(0)
        except Exception:
            pass
        s3.upload_fileobj(fileobj, settings.AWS_S3_BUCKET, key, ExtraArgs=extra)
        return f"https://{settings.AWS_S3_BUCKET}.s3.{settings.AWS_REGION}.amazonaws.com/{key}"

    def _upload_local(self, content: bytes, key: str) -> str:
        path = UPLOADS_ROOT / key
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        return f"/uploads/{key}"

    def _upload_local_stream(self, fileobj: IO[bytes], key: str) -> str:
        path = UPLOADS_ROOT / key
        path.parent.mkdir(parents=True, exist_ok=True)
        try:
            fileobj.seek(0)
        except Exception:
            pass
        with open(path, "wb") as dest:
            shutil.copyfileobj(fileobj, dest, length=4 * 1024 * 1024)
        return f"/uploads/{key}"

    def delete_local(self, file_url: str) -> None:
        """Delete a locally stored file given its URL."""
        if file_url.startswith("/uploads/"):
            path = UPLOADS_ROOT / file_url.removeprefix("/uploads/")
            if path.exists():
                path.unlink()
