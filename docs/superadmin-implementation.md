# SuperAdmin Login Implementation Guide

## Overview

The **SuperAdmin** role has been implemented to allow platform administrators to:
- Log in with **email + password only** (no organization ID required)
- Access **all organizations** and their data
- View all users, packages, activities, and deliveries across organizations
- Manage organizations and users at a global level

## SuperAdmin vs Regular Admin

| Feature | Regular Admin | SuperAdmin |
|---------|---------------|-----------|
| Login fields | Email, Password, Org ID | Email, Password only |
| Scope | Single organization | All organizations |
| Org access | Own organization only | All organizations |
| User management | Organization-scoped | Global |

## Backend Changes

### 1) Database Model (`backend/app/models.py`)
- `User.org_id` is now nullable (`nullable=True`) to support SuperAdmin users (who have no organization)
- `User.role` supports three values: `"Staff"`, `"Admin"`, `"SuperAdmin"`

### 2) Auth Endpoints (`backend/app/routers/auth.py`)

#### Original Org Admin Login
```
POST /v1/auth/login
Content-Type: application/json

{
  "email": "admin@example.com",
  "password": "password",
  "org_id": "org-uuid",
  "device_id": "optional"
}

Response:
{
  "access_token": "jwt...",
  "refresh_token": "jwt...",
  "user": {"user_id": "...", "role": "Admin"},
  "org_id": "org-uuid"
}
```

#### New SuperAdmin Login
```
POST /v1/auth/superadmin-login
Content-Type: application/json

{
  "email": "superadmin@example.com",
  "password": "password"
}

Response:
{
  "access_token": "jwt...",
  "refresh_token": "jwt...",
  "user": {"user_id": "...", "role": "SuperAdmin"},
  "organizations": [
    {"org_id": "org-1", "name": "Acme Corp", "status": "active"},
    {"org_id": "org-2", "name": "Beta Inc", "status": "active"},
    ...
  ]
}
```

### 3) Schemas (`backend/app/schemas.py`)
- `SuperAdminLoginIn`: Email + password only
- `SuperAdminTokenOut`: Returns list of accessible organizations

## Frontend Changes

### Login Page (`admin-portal/app/login/page.tsx`)

#### Mode Toggle
A button in the top-right of the login form toggles between:
- **Admin mode** (default): Shows Email, Password, Org ID, Device ID fields
- **SuperAdmin mode**: Shows only Email and Password

#### Auto-Detection
If the user was previously signed in as a SuperAdmin, the form remembers and defaults to SuperAdmin mode.

#### API Call
- **Admin**: POST `/v1/auth/login` with org_id
- **SuperAdmin**: POST `/v1/auth/superadmin-login` with email+password only

#### localStorage Keys
- Regular admin: `dc_access`, `dc_refresh`, `dc_email`, `dc_org`, `dc_role="Admin"`
- SuperAdmin: `dc_access`, `dc_refresh`, `dc_email`, `dc_organizations=[...]`, `dc_role="SuperAdmin"`

## Setup Instructions

### 1) Seed a SuperAdmin User

Use the dedicated seeding script:

```bash
# Activate the backend venv
cd /root/digitalchain
source .venv/bin/activate

# Run the seeder (with defaults)
python backend/scripts/seed_superadmin.py

# Or with custom credentials
python backend/scripts/seed_superadmin.py \
  --admin-email "superadmin@yourdomain.com" \
  --admin-password "A-Strong-Password" \
  --admin-name "Platform Admin"
```

Output:
```
=== SuperAdmin Seed Result ===
SuperAdmin User:
  email: superadmin@digitalchain.in
  user_id: ed9b8cce-a72e-4930-a3fc-1884cd536bac (created=True)
  password: SuperAdmin@123!

Note: SuperAdmin has access to ALL organizations.
Login endpoint: POST /v1/auth/superadmin-login
```

### 2) Rebuild and Deploy

Frontend:
```bash
cd /root/digitalchain/admin-portal
npm run build
npm run start
```

Backend (if you changed the code):
```bash
cd /root/digitalchain/backend
# Ensure the new models/schemas are in place
# If using systemd: sudo systemctl restart digitalchain-backend
```

### 3) Test SuperAdmin Login

#### Via Web UI
1. Go to https://admin.digitalchain.in/login (or http://localhost:3000/login locally)
2. Click the **"Admin"** toggle button in the top-right
3. It should change to **"SuperAdmin"** (button turns purple)
4. The form now shows only Email and Password fields
5. Enter: superadmin@digitalchain.in / SuperAdmin@123!
6. Click "Sign in"
7. On success, you land on the dashboard with access to all organizations

#### Via API (curl)
```bash
curl -X POST https://api.digitalchain.in/v1/auth/superadmin-login \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "superadmin@digitalchain.in",
    "password": "SuperAdmin@123!"
  }' | jq .
```

Expected response:
```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "user": {
    "user_id": "ed9b8cce-...",
    "role": "SuperAdmin"
  },
  "organizations": [
    {"org_id": "6df5a421-...", "name": "Digitalchain", "status": "active"},
    ...
  ]
}
```

## Dashboard for SuperAdmin (Future)

The dashboard will display:
- **Organization Switcher**: Dropdown to select which org to view
- **Global Stats**: Total deliveries, users, activities across all orgs
- **Org List**: Table of all organizations with:
  - Name, Region, Status
  - User count
  - Active deliveries
  - Plan type
- **User Management**: Add/remove users across organizations
- **Activity Log**: Global audit trail
- **Settings**: Platform-wide configurations

For now, you can manually switch organizations by selecting from the list returned on login.

## Security Notes

1. **SuperAdmin password**: Use a strong, unique password in production. Never use the default.
2. **Token scope**: SuperAdmin token has `"is_superadmin": true` in claims for validation.
3. **API guards**: All protected endpoints should check the `role` claim in the token and enforce:
   - Regular endpoints: user's org_id matches the requested org_id
   - Admin endpoints: role == "SuperAdmin" or role == "Admin" (depending on operation)
4. **Audit**: Log all SuperAdmin actions separately for compliance.

## File Changes Summary

- `backend/app/models.py`: Updated User.org_id to nullable
- `backend/app/routers/auth.py`: Added `/v1/auth/superadmin-login` endpoint
- `backend/app/schemas.py`: Added SuperAdminLoginIn, SuperAdminTokenOut, OrgInfo
- `backend/scripts/seed_superadmin.py`: New seeding script
- `admin-portal/app/login/page.tsx`: Added SuperAdmin mode toggle and form logic

## Next Steps

1. ✅ Database schema updated
2. ✅ SuperAdmin login endpoint implemented
3. ✅ Frontend UI supports SuperAdmin mode
4. ✅ Seeding script created
5. ⏳ SuperAdmin dashboard (org switcher, global stats, org/user management)
6. ⏳ API endpoints for fetching org data, users, deliveries (with org filtering for non-admins)
7. ⏳ Activity audit logs for SuperAdmin actions
