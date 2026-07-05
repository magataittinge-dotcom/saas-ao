"""Endpoint de recherche réglementaire (RAG) — Lot 7."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from database import get_db
from models.user import User
from routers.auth import get_auth_user
from services.rag.retriever import retrieve

router = APIRouter()


@router.get("/retrieve")
def retrieve_articles(
    q: str = Query(..., min_length=1),
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """Recherche hybride dans le corpus réglementaire (CCP). Top 5."""
    return {"query": q, "results": retrieve(db, q, top_k=5)}
