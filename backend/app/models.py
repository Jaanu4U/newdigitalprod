from sqlalchemy import Column, String, Integer, Boolean, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
import string
import random
from .db import Base


def gen_uuid():
    return str(uuid.uuid4())

def gen_custom_id(length=6):
    """Generate random alphanumeric ID (A-Z, a-z, 0-9)"""
    chars = string.ascii_letters + string.digits
    return ''.join(random.choice(chars) for _ in range(length))

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
    # Address fields
    address = Column(String, nullable=True)
    city = Column(String, nullable=True)
    state = Column(String, nullable=True)
    pincode = Column(String, nullable=True)
    country = Column(String, nullable=True)
    maps_api_usage_count = Column(Integer, default=0)

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
    # Email verification fields
    email_verified = Column(Boolean, default=False)
    verification_token = Column(String, nullable=True, index=True)
    token_expires_at = Column(DateTime, nullable=True)

    org = relationship("Organization", back_populates="users")

class Delivery(Base):
    __tablename__ = "deliveries"
    delivery_id = Column(String, primary_key=True, default=gen_uuid)
    org_id = Column(String, index=True, nullable=False)
    order_id = Column(String, nullable=False)
    customer = Column(String, nullable=False)
    customer_phone = Column(String, nullable=True)
    address = Column(Text, nullable=False)
    latitude = Column(String, nullable=True)
    longitude = Column(String, nullable=True)
    status = Column(String, default="assigned")
    rider_status = Column(String, nullable=True)  # assigned, accepted, in_transit, delivered, completed
    assigned_rider_id = Column(String, ForeignKey("users.user_id"), nullable=True, index=True)
    shipment_provider_id = Column(String, ForeignKey("shipment_providers.provider_id"), nullable=True)
    tracking_number = Column(String, nullable=True)
    # Audit timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    assigned_at = Column(DateTime, nullable=True)
    accepted_at = Column(DateTime, nullable=True)
    in_transit_at = Column(DateTime, nullable=True)
    delivered_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    estimated_delivery_minutes = Column(Integer, nullable=True)  # Estimated delivery time in minutes
    # Audit locations
    pickup_latitude = Column(String, nullable=True)
    pickup_longitude = Column(String, nullable=True)
    delivery_latitude = Column(String, nullable=True)
    delivery_longitude = Column(String, nullable=True)
    # Proof of delivery
    pod_image_url = Column(String, nullable=True)
    pod_signature_url = Column(String, nullable=True)
    delivery_notes = Column(Text, nullable=True)

class Customer(Base):
    __tablename__ = "customers"
    customer_id = Column(String, primary_key=True, default=gen_uuid)
    org_id = Column(String, ForeignKey("organizations.org_id"), nullable=False, index=True)
    custom_customer_id = Column(String, nullable=True, index=True)  # User-defined or auto-generated 6-char ID
    ctype = Column(String, nullable=False)  # 'B2B' or 'B2C'
    name = Column(String, nullable=True)  # Optional for B2B (contact person), required for B2C
    company_name = Column(String, nullable=True)
    gstin = Column(String, nullable=True)
    email = Column(String, nullable=True, index=True)
    phone = Column(String, nullable=True, index=True)
    password_hash = Column(String, nullable=True)  # For customer portal login
    email_verified = Column(Boolean, default=False)
    phone_verified = Column(Boolean, default=False)
    verification_token = Column(String, nullable=True, index=True)
    verification_token_expires = Column(DateTime, nullable=True)
    password_reset_token = Column(String, nullable=True, index=True)
    password_reset_expires = Column(DateTime, nullable=True)
    portal_access = Column(Boolean, default=False)  # Enable/disable portal access
    last_login = Column(DateTime, nullable=True)
    address = Column(Text, nullable=True)
    city = Column(String, nullable=True)
    state = Column(String, nullable=True)
    pin = Column(String, nullable=True)
    latitude = Column(String, nullable=True)
    longitude = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by = Column(String, nullable=True)

class SyncLog(Base):
    __tablename__ = "sync_log"
    id = Column(Integer, primary_key=True, autoincrement=True)
    org_id = Column(String, index=True, nullable=False)
    user_id = Column(String, nullable=True)
    type = Column(String, nullable=False)
    payload = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class ColumnMappingTemplate(Base):
    __tablename__ = "column_mapping_templates"
    id = Column(Integer, primary_key=True, autoincrement=True)
    org_id = Column(String, index=True, nullable=False)
    user_id = Column(String, nullable=False)
    name = Column(String, nullable=False)
    column_mapping = Column(JSON, nullable=False)
    address_parts = Column(JSON, nullable=True)  # {part1, part2, part3}
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# Platform-wide settings (single row table)
class PlatformSettings(Base):
    __tablename__ = "platform_settings"
    id = Column(Integer, primary_key=True, autoincrement=True)
    email_config = Column(JSON, nullable=True)


# Shipment Providers (platform-wide courier/delivery partners)
class ShipmentProvider(Base):
    __tablename__ = "shipment_providers"
    provider_id = Column(String, primary_key=True, default=gen_uuid)
    name = Column(String, nullable=False)
    code = Column(String, unique=True, index=True, nullable=False)
    tracking_url = Column(String, nullable=True)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


# Payments table for UPI/Cash/Card payment tracking
class Payment(Base):
    __tablename__ = "payments"
    payment_id = Column(String, primary_key=True, default=gen_uuid)
    org_id = Column(String, ForeignKey("organizations.org_id"), nullable=False, index=True)
    order_id = Column(String, nullable=True, index=True)  # Invoice/Order ID
    delivery_id = Column(String, ForeignKey("deliveries.delivery_id"), nullable=True, index=True)
    customer_id = Column(String, nullable=True)
    customer_name = Column(String, nullable=True)
    customer_phone = Column(String, nullable=True)
    
    # Amount details
    amount = Column(String, nullable=False)  # Stored as string to preserve precision
    currency = Column(String, default="INR")
    
    # Payment method details
    payment_method = Column(String, default="UPI")  # UPI/Cash/Card/Online
    upi_vpa = Column(String, nullable=True)  # Merchant UPI ID
    upi_transaction_id = Column(String, nullable=True, index=True)  # UPI transaction ID
    upi_ref_id = Column(String, nullable=True)  # Bank reference number
    
    # Status tracking
    status = Column(String, default="pending", index=True)  # pending/initiated/processing/success/failed/cancelled/refunded
    payment_initiated_at = Column(DateTime, nullable=True)
    payment_completed_at = Column(DateTime, nullable=True, index=True)
    
    # Collection details
    collected_by = Column(String, ForeignKey("users.user_id"), nullable=True, index=True)
    collected_by_name = Column(String, nullable=True)
    collection_latitude = Column(String, nullable=True)
    collection_longitude = Column(String, nullable=True)
    
    # QR code tracking
    qr_code_generated = Column(Boolean, default=False)
    qr_generated_at = Column(DateTime, nullable=True)
    qr_expires_at = Column(DateTime, nullable=True)
    
    # Payment gateway details
    gateway_provider = Column(String, nullable=True)  # razorpay/phonepe/paytm/cashfree
    gateway_order_id = Column(String, nullable=True, index=True)
    gateway_payment_id = Column(String, nullable=True, index=True)
    gateway_response = Column(Text, nullable=True)  # Raw JSON response
    
    # Metadata
    notes = Column(Text, nullable=True)
    receipt_url = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class MapsApiUsage(Base):
    __tablename__ = "maps_api_usage"
    id = Column(Integer, primary_key=True, autoincrement=True)
    org_id = Column(String, ForeignKey("organizations.org_id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True, index=True)
    endpoint = Column(String(255), nullable=False)
    request_count = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
