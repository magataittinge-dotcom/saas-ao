import uuid
from sqlalchemy import Column, String, Integer, ForeignKey
from sqlalchemy.orm import relationship
from database import Base


class TeamMember(Base):
    __tablename__ = "team_members"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    organization_id = Column(String, ForeignKey("organizations.id"), nullable=False)
    name = Column(String(255), nullable=False)
    role = Column(String(255), nullable=False)
    specialite = Column(String(255), nullable=True)
    experience_years = Column(Integer, nullable=True)
    certifications = Column(String(500), nullable=True)
    cv_url = Column(String(500), nullable=True)

    # Relationships
    organization = relationship("Organization", back_populates="team_members")
