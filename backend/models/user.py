import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import relationship
from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    clerk_id = Column(String(255), nullable=True, unique=True, index=True)
    organization_id = Column(String, ForeignKey("organizations.id"), nullable=True)
    email = Column(String(255), nullable=False, unique=True, index=True)
    password_hash = Column(String(255), nullable=True)
    name = Column(String(255), nullable=False)
    phone = Column(String(50), nullable=True)
    role = Column(SAEnum("admin", "member", name="user_role"), nullable=False, default="admin")
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    organization = relationship("Organization", back_populates="users")
