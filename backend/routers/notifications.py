"""Notifications in-app (C23) — liste, badge non-lus, marquage lu."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models.notification import Notification
from models.user import User
from routers.auth import get_auth_user

router = APIRouter()

_MAX_ITEMS = 50


@router.get("")
def list_notifications(
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    base = db.query(Notification).filter(
        Notification.organization_id == user.organization_id,
    )
    unread = base.filter(Notification.read.is_(False)).count()
    items = base.order_by(Notification.created_at.desc()).limit(_MAX_ITEMS).all()
    return {
        "unread": unread,
        "items": [
            {
                "id": n.id, "type": n.type, "titre": n.titre, "corps": n.corps,
                "read": n.read, "created_at": n.created_at.isoformat(),
            }
            for n in items
        ],
    }


@router.post("/{notification_id}/read")
def mark_read(
    notification_id: str,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    n = db.query(Notification).filter(
        Notification.id == notification_id,
        Notification.organization_id == user.organization_id,
    ).first()
    if not n:
        raise HTTPException(status_code=404, detail="Notification introuvable")
    n.read = True
    db.commit()
    return {"read": True}


@router.post("/read-all")
def mark_all_read(
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    db.query(Notification).filter(
        Notification.organization_id == user.organization_id,
        Notification.read.is_(False),
    ).update({"read": True})
    db.commit()
    return {"read": True}
