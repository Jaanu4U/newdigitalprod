from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Dict, Any
from datetime import datetime

class OrgRegisterIn(BaseModel):
    org_name: str
    admin_name: str
    admin_email: EmailStr
    plan: Optional[str] = None
    region: Optional[str] = None
    slug: Optional[str] = Field(default=None, description="Unique slug for subdomain (a-z0-9-)")
    custom_domain: Optional[str] = Field(default=None, description="Optional custom domain for the org")
    admin_phone: Optional[str] = Field(default=None, description="Admin phone number")
    admin_password: Optional[str] = Field(default=None, description="Owner admin password (if omitted, a temp password is set)")

class OrgRegisterOut(BaseModel):
    org_id: str
    access_key: str
    slug: Optional[str] = None

class LoginIn(BaseModel):
    email: EmailStr
    password: str
    org_id: Optional[str] = None
    device_id: Optional[str] = None
    app_version: Optional[str] = None

class SuperAdminLoginIn(BaseModel):
    email: EmailStr
    password: str

class OrgInfo(BaseModel):
    org_id: str
    name: str
    status: str

class TokenOut(BaseModel):
    access_token: str
    refresh_token: str
    user: dict
    org_id: str

class SuperAdminTokenOut(BaseModel):
    access_token: str
    refresh_token: str
    user: dict
    organizations: List[OrgInfo]

class RefreshIn(BaseModel):
    refresh_token: str

class TokenPairOut(BaseModel):
    access_token: str
    refresh_token: str

class DeliveryOut(BaseModel):
    delivery_id: str
    order_id: str
    customer: str
    address: str
    status: str

class DeliveriesOut(BaseModel):
    items: List[DeliveryOut]

class StatusUpdateIn(BaseModel):
    status: str
    timestamp: datetime
    note: Optional[str] = None

class StatusUpdateOut(BaseModel):
    status: str = "ok"
    delivery_id: str
    new_status: str

class PodIn(BaseModel):
    recipient_name: str
    note: Optional[str] = None
    timestamp: datetime

class PodOut(BaseModel):
    status: str = "ok"
    pod_id: str

# SuperAdmin User Management
class CreateUserIn(BaseModel):
    email: EmailStr
    name: str
    cellnumber: str
    role: str  # 'Staff', 'Admin', 'Rider', 'SuperAdmin' (SuperAdmin not allowed in org scope)
    team: Optional[str] = None
    password: str = Field(default="TempPassword@123!", description="Temporary password for new user")

class UserOut(BaseModel):
    user_id: str
    email: str
    name: Optional[str]
    cellnumber: Optional[str]
    role: str
    team: Optional[str]
    status: str
    created_at: Optional[datetime]

class UpdateUserIn(BaseModel):
    name: Optional[str] = None
    cellnumber: Optional[str] = None
    role: Optional[str] = None
    team: Optional[str] = None
    status: Optional[str] = None

# Account / Profile
class UpdateProfileIn(BaseModel):
    name: Optional[str] = None
    cellnumber: Optional[str] = None

class PasswordChangeIn(BaseModel):
    current_password: str
    new_password: str

# Organization settings
class OrgSettingsOut(BaseModel):
    org_id: str
    name: str
    slug: Optional[str] = None
    custom_domain: Optional[str] = None
    region: Optional[str] = None
    timezone: Optional[str] = None
    plan: Optional[str] = None
    status: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    # Section-wise settings
    payment_settings: Optional[Dict[str, Any]] = None
    email_settings: Optional[Dict[str, Any]] = None
    maps_settings: Optional[Dict[str, Any]] = None

class OrgSettingsUpdateIn(BaseModel):
    name: Optional[str] = None
    region: Optional[str] = None
    timezone: Optional[str] = None
    plan: Optional[str] = None
    # Section-wise updates (partial merge)
    payment_settings: Optional[Dict[str, Any]] = None
    email_settings: Optional[Dict[str, Any]] = None
    maps_settings: Optional[Dict[str, Any]] = None
