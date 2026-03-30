from pydantic import BaseModel, EmailStr


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    name: str
    organization_name: str
    siret: str
    plan: str = "free"


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
