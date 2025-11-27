import os
from pydantic import BaseModel
from dotenv import load_dotenv

# Load .env file if it exists (for development)
# In production, systemd loads /etc/digitalchain/backend.env
load_dotenv()

class Settings(BaseModel):
    DATABASE_URL: str = os.getenv("DATABASE_URL", "postgresql+psycopg2://dcuser:dcpass@127.0.0.1:5432/digitalchain")
    JWT_SECRET: str = os.getenv("JWT_SECRET", "dev-secret-change-me")
    JWT_ALG: str = "HS256"
    JWT_EXPIRES_IN: int = int(os.getenv("JWT_EXPIRES_IN", "604800"))  # 7 days

settings = Settings()
