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
    address: Optional[str] = Field(default=None, description="Organization street address")
    city: Optional[str] = Field(default=None, description="City")
    state: Optional[str] = Field(default=None, description="State/Province")
    pincode: Optional[str] = Field(default=None, description="PIN/ZIP code")
    country: Optional[str] = Field(default=None, description="Country")

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
    status: Optional[str] = None
    rider_status: Optional[str] = None
    customer_phone: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    amount: Optional[float] = None
    
class OrgLookupOut(BaseModel):
    org_id: str
    name: str
    slug: Optional[str] = None
    custom_domain: Optional[str] = None
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
    # Organization address fields
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    country: Optional[str] = None
    # Section-wise settings
    payment_settings: Optional[Dict[str, Any]] = None
    email_settings: Optional[Dict[str, Any]] = None
    maps_settings: Optional[Dict[str, Any]] = None
    business_settings: Optional[Dict[str, Any]] = None
    provider_settings: Optional[Dict[str, Any]] = None
    whatsapp_settings: Optional[Dict[str, Any]] = None

class OrgSettingsUpdateIn(BaseModel):
    name: Optional[str] = None
    region: Optional[str] = None
    timezone: Optional[str] = None
    plan: Optional[str] = None
    # Organization address fields
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    country: Optional[str] = None
    # Section-wise updates (partial merge)
    payment_settings: Optional[Dict[str, Any]] = None
    email_settings: Optional[Dict[str, Any]] = None
    maps_settings: Optional[Dict[str, Any]] = None
    business_settings: Optional[Dict[str, Any]] = None
    provider_settings: Optional[Dict[str, Any]] = None
    whatsapp_settings: Optional[Dict[str, Any]] = None


# Shipment Provider schemas
class ShipmentProviderOut(BaseModel):
    provider_id: str
    name: str
    code: str
    tracking_url: Optional[str] = None
    active: bool
    created_at: Optional[datetime] = None


class ShipmentProvidersList(BaseModel):
    items: List[ShipmentProviderOut]


class ShipmentProviderCreate(BaseModel):
    name: str
    code: str
    tracking_url: Optional[str] = None
    active: Optional[bool] = True


class ShipmentProviderUpdate(BaseModel):
    name: Optional[str] = None
    tracking_url: Optional[str] = None
    active: Optional[bool] = None


# Customer schemas
class CustomerOut(BaseModel):
    customer_id: str
    ctype: str  # "b2b" or "b2c"
    name: Optional[str] = None
    company_name: Optional[str] = None
    gstin: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pin: Optional[str] = None
    notes: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class CustomersListOut(BaseModel):
    items: List[CustomerOut]


class CustomerCreate(BaseModel):
    ctype: Optional[str] = "b2c"
    name: Optional[str] = None
    company_name: Optional[str] = None
    gstin: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pin: Optional[str] = None
    notes: Optional[str] = None


class CustomerUpdate(BaseModel):
    ctype: Optional[str] = None
    name: Optional[str] = None
    company_name: Optional[str] = None
    gstin: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pin: Optional[str] = None
    notes: Optional[str] = None


# Invoice sync schemas
class InvoiceSyncIn(BaseModel):
    draft_ids: Optional[List[int]] = Field(default=None, description="Specific draft IDs to sync, or None for all pending drafts")


class InvoiceSyncOut(BaseModel):
    synced: int
    deliveries_created: int
    errors: List[Dict[str, Any]] = []
