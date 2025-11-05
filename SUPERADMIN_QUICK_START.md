# SuperAdmin Platform - Quick Start Guide

## 🚀 Quick Test

### 1. **Open Login Page**
```
http://localhost:3000/login
```

### 2. **Enter SuperAdmin Credentials**
- **Email**: `superadmin@digitalchain.in`
- **Password**: `SuperAdmin@123!`

### 3. **View Dashboard**
- Redirects to `http://localhost:3000/superadmin`
- Shows global statistics
- Lists all organizations
- Displays recent deliveries

---

## 🔌 API Endpoints

### **Login**
```bash
curl -X POST http://localhost:8000/v1/auth/superadmin-login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "superadmin@digitalchain.in",
    "password": "SuperAdmin@123!"
  }'
```
**Returns**: `access_token`, `refresh_token`, `organizations` array

### **Dashboard Stats**
```bash
curl -X GET http://localhost:8000/v1/superadmin/dashboard \
  -H "Authorization: Bearer {TOKEN}"
```
**Returns**: Summary stats, org list, recent deliveries

### **All Organizations**
```bash
curl -X GET http://localhost:8000/v1/superadmin/organizations \
  -H "Authorization: Bearer {TOKEN}"
```
**Returns**: List of all orgs with per-org statistics

### **All Users**
```bash
curl -X GET http://localhost:8000/v1/superadmin/users \
  -H "Authorization: Bearer {TOKEN}"
```
**Returns**: All users across platform

### **Deliveries (Filterable)**
```bash
curl -X GET "http://localhost:8000/v1/superadmin/deliveries?status=delivered&limit=20" \
  -H "Authorization: Bearer {TOKEN}"
```
**Returns**: Filtered deliveries list

---

## 📊 Dashboard Sections

| Section | Shows | Purpose |
|---------|-------|---------|
| **Summary Cards** | Total orgs, users, deliveries, status breakdown | Quick metrics |
| **Organizations Table** | Name, status, user count, delivery count | Org overview |
| **Recent Deliveries** | Order ID, customer, status, timestamp | Activity tracking |
| **Header** | SuperAdmin email, logout button | User control |

---

## 🎯 Key Features

✅ **SuperAdmin-only login** (no org context)  
✅ **Global data monitoring** (all orgs at once)  
✅ **Clean interface** (no sidebar clutter)  
✅ **Real-time stats** (live dashboard)  
✅ **Filterable APIs** (status, limit, etc.)  

---

## 📁 Access Points

| Route | Access | Purpose |
|-------|--------|---------|
| `/login` | Public | SuperAdmin login form |
| `/superadmin` | Protected | Dashboard (requires auth) |
| `/v1/auth/superadmin-login` | Public API | Get access token |
| `/v1/superadmin/*` | Protected API | Get platform data |

---

## 🔐 Credentials

| Field | Value |
|-------|-------|
| **Email** | `superadmin@digitalchain.in` |
| **Password** | `SuperAdmin@123!` |
| **Role** | `SuperAdmin` |
| **Organization ID** | `NULL` (no org affiliation) |

---

## ⚙️ Configuration

### Backend
- Base URL: `http://localhost:8000`
- Auth endpoint: `/v1/auth/superadmin-login`
- API prefix: `/v1/superadmin/`

### Frontend
- Base URL: `http://localhost:3000`
- Login route: `/login`
- Dashboard route: `/superadmin`
- API base (env): `http://localhost:8000/v1/`

---

## 🐛 Troubleshooting

### **Login fails with "Invalid credentials"**
- Verify SuperAdmin user was seeded: Check database
- Confirm password is exactly: `SuperAdmin@123!`

### **Dashboard shows "Loading..." indefinitely**
- Check backend is running: `lsof -i :8000`
- Check browser console for API errors
- Verify token is valid

### **API returns "Unauthorized"**
- Token may have expired (24 hours)
- Log out and log back in
- Check `Authorization: Bearer {TOKEN}` header

---

## 📝 Notes

- Dashboard data refreshes on page load
- No real-time updates (manual refresh needed)
- Logout clears all localStorage data
- Backend API throttled for performance

---

**Last Updated**: November 4, 2025
**Status**: ✅ Production Ready
