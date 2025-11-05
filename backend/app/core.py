import os
from pydantic import BaseModel

class Settings(BaseModel):
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./digitalchain.db")
    JWT_SECRET: str = os.getenv("JWT_SECRET", "dev-secret-change-me")
    JWT_ALG: str = "HS256"
    JWT_EXPIRES_IN: int = int(os.getenv("JWT_EXPIRES_IN", "604800"))  # 7 days

settings = Settings()
