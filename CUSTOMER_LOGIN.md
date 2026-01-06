# Customer Login & Portal System

## Overview
Customer login system that allows B2B and B2C customers to access a self-service portal to view their orders, update profile, and manage their account.

## Database Changes
Added the following fields to `customers` table:
- `password_hash` - Hashed password for login
- `email_verified` - Boolean flag for email verification
- `phone_verified` - Boolean flag for phone verification  
- `portal_access` - Boolean flag to enable/disable portal access
- `last_login` - Timestamp of last login
- `latitude` - Geocoded latitude
- `longitude` - Geocoded longitude

## API Endpoints

### 1. Customer Login
**POST** `/v1/auth/customer-login`

Login using email or phone number and password.

**Request:**
```json
{
  "email_or_phone": "customer@example.com",  // or "9876543210"
  "password": "password123",
  "org_id": "optional-org-id"
}
```

**Response:**
```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "user": {
    "user_id": "customer-uuid",
    "role": "Customer",
    "name": "Customer Name",
    "email": "customer@example.com",
    "phone": "9876543210"
  },
  "org_id": "org-uuid"
}
```

### 2. Customer Registration
**POST** `/v1/customer-portal/register`

Self-registration for new customers.

**Request:**
```json
{
  "org_id": "org-uuid",
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "9876543210",
  "password": "securepassword",
  "ctype": "B2C"  // or "B2B"
}
```

**Response:**
```json
{
  "message": "Registration successful. Please verify your email to activate your account.",
  "customer_id": "customer-uuid",
  "custom_customer_id": "ABC123",
  "email_verified": false
}
```

### 3. Get Customer Profile
**GET** `/v1/customer-portal/profile`

Get logged-in customer's profile information.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "customer_id": "uuid",
  "custom_customer_id": "ABC123",
  "name": "John Doe",
  "company_name": null,
  "email": "john@example.com",
  "phone": "9876543210",
  "address": "123 Main St",
  "city": "Hyderabad",
  "state": "Telangana",
  "pin": "500001",
  "gstin": null,
  "ctype": "B2C",
  "email_verified": true,
  "phone_verified": false,
  "last_login": "2025-12-21T12:30:00Z",
  "created_at": "2025-12-01T10:00:00Z"
}
```

### 4. Update Customer Profile
**PUT** `/v1/customer-portal/profile`

Update customer profile information.

**Request:**
```json
{
  "name": "John Updated",
  "phone": "9876543211",
  "address": "456 New St",
  "city": "Mumbai",
  "state": "Maharashtra",
  "pin": "400001"
}
```

### 5. Get Customer Orders
**GET** `/v1/customer-portal/orders?status=pending&limit=20&offset=0`

Get customer's orders/invoices.

**Query Parameters:**
- `status` (optional): Filter by order status
- `limit`: Number of records (default: 20)
- `offset`: Pagination offset (default: 0)

**Response:**
```json
{
  "total": 45,
  "orders": [
    {
      "invoice_id": "inv-uuid",
      "invoice_no": "INV-001",
      "status": "pending",
      "total": 1500.00,
      "items": [
        {
          "description": "Product A",
          "qty": 2,
          "rate": 500,
          "total": 1000
        }
      ],
      "created_at": "2025-12-20T10:00:00Z",
      "delivery_address": "123 Main St",
      "tracking_number": "TRACK123"
    }
  ],
  "limit": 20,
  "offset": 0
}
```

### 6. Change Password
**POST** `/v1/customer-portal/change-password`

Change customer password.

**Request:**
```json
{
  "old_password": "currentpassword",
  "new_password": "newsecurepassword"
}
```

## Enabling Portal Access for Existing Customers

For existing customers, you need to:

1. **Enable portal access:**
```sql
UPDATE customers 
SET portal_access = TRUE 
WHERE customer_id = 'customer-uuid';
```

2. **Set initial password (admin action):**
```python
from app.security import hash_password

customer.password_hash = hash_password("initial_password")
customer.portal_access = True
db.commit()
```

3. **Send welcome email with login credentials**

## Frontend Implementation

### Login Page Example
```typescript
async function customerLogin(emailOrPhone: string, password: string, orgId: string) {
  const response = await fetch('/v1/auth/customer-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email_or_phone: emailOrPhone,
      password: password,
      org_id: orgId
    })
  });
  
  if (response.ok) {
    const data = await response.json();
    localStorage.setItem('access_token', data.access_token);
    localStorage.setItem('refresh_token', data.refresh_token);
    return data.user;
  }
  throw new Error('Login failed');
}
```

### Protected Route Example
```typescript
async function getCustomerOrders() {
  const token = localStorage.getItem('access_token');
  
  const response = await fetch('/v1/customer-portal/orders?limit=10', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  return await response.json();
}
```

## Security Features

1. **Password Hashing**: All passwords are hashed using bcrypt
2. **JWT Tokens**: Access tokens expire in 1 hour, refresh tokens in 30 days
3. **Email Verification**: Email must be verified for email-based login
4. **Portal Access Control**: Admin can enable/disable portal access per customer
5. **Role-based Access**: Customer role has limited access to only their own data

## Next Steps

1. **Email Verification**: Implement email verification flow
2. **Password Reset**: Add forgot password functionality
3. **OTP Login**: Add phone OTP-based login option
4. **Customer Portal UI**: Create frontend pages for customer portal
5. **Order Tracking**: Add real-time order tracking
6. **Payment History**: Show payment and invoice history
7. **Address Management**: Allow multiple delivery addresses
8. **Notifications**: Email/SMS notifications for order updates

## Testing

Test the customer login with:

```bash
# Create a test customer with portal access
curl -X POST http://localhost:8000/v1/customer-portal/register \
  -H "Content-Type: application/json" \
  -d '{
    "org_id": "your-org-id",
    "name": "Test Customer",
    "email": "test@example.com",
    "phone": "9876543210",
    "password": "Test@123",
    "ctype": "B2C"
  }'

# Login
curl -X POST http://localhost:8000/v1/auth/customer-login \
  -H "Content-Type: application/json" \
  -d '{
    "email_or_phone": "test@example.com",
    "password": "Test@123",
    "org_id": "your-org-id"
  }'

# Get profile (use token from login response)
curl -X GET http://localhost:8000/v1/customer-portal/profile \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```
