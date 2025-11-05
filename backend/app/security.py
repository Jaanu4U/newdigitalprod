from datetime import datetime, timedelta
from jose import jwt, JWTError
from passlib.context import CryptContext
from .core import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)


def create_token(subject: dict, expires_in: int | None = None) -> str:
    expire = datetime.utcnow() + timedelta(seconds=expires_in or settings.JWT_EXPIRES_IN)
    to_encode = {"exp": expire, **subject}
    return jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALG)


def decode_token(token: str) -> dict:
    """Decode and validate a JWT, returning its payload.

    Raises JWTError on invalid token.
    """
    try:
        return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALG])
    except JWTError:
        raise
