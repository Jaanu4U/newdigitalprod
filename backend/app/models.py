from sqlalchemy import Column, String, Integer, Boolean, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
from .db import Base


def gen_uuid():
    return str(uuid.uuid4())

class Organization(Base):
    __tablename__ = "organizations"
    org_id = Column(String, primary_key=True, default=gen_uuid)
    name = Column(String, nullable=False)
    # Unique slug for subdomain-based tenancy: <slug>.digitalchain.in
    slug = Column(String, unique=True, index=True, nullable=True)
    # Optional custom domain, unique if present
    custom_domain = Column(String, unique=True, index=True, nullable=True)
    region = Column(String, nullable=True)
    timezone = Column(String, nullable=True)
    plan = Column(String, nullable=True)
    status = Column(String, default="active")
    access_key = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    # Flexible JSON settings for payments/email/maps/etc.
    settings = Column(JSON, nullable=True)

    users = relationship("User", back_populates="org")

class User(Base):
    __tablename__ = "users"
    user_id = Column(String, primary_key=True, default=gen_uuid)
    org_id = Column(String, ForeignKey("organizations.org_id"), nullable=True)  # nullable for SuperAdmin
    email = Column(String, unique=False, index=True, nullable=False)
    name = Column(String, nullable=True)
    cellnumber = Column(String, nullable=True)
    role = Column(String, default="Staff")  # 'Staff', 'Admin', 'SuperAdmin'
    team = Column(String, nullable=True)  # e.g., 'Support', 'Sales', 'Operations'
    password_hash = Column(String, nullable=False)
    mfa_enabled = Column(Boolean, default=False)
    status = Column(String, default="active")
    last_login = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by = Column(String, nullable=True, index=True)  # creator's user_id

    org = relationship("Organization", back_populates="users")

class Delivery(Base):
    __tablename__ = "deliveries"
    delivery_id = Column(String, primary_key=True, default=gen_uuid)
    org_id = Column(String, index=True, nullable=False)
    order_id = Column(String, nullable=False)
    customer = Column(String, nullable=False)
    address = Column(Text, nullable=False)
    status = Column(String, default="assigned")
    created_at = Column(DateTime, default=datetime.utcnow)

class SyncLog(Base):
    __tablename__ = "sync_log"
    id = Column(Integer, primary_key=True, autoincrement=True)
    org_id = Column(String, index=True, nullable=False)
    user_id = Column(String, nullable=True)
    type = Column(String, nullable=False)
    payload = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
