# User Management - Quick Reference Card

## 🎯 Quick Start (30 seconds)

```
1. Login → superadmin@digitalchain.in / SuperAdmin@123!
2. Click "Users" in sidebar
3. Click "Add User" button
4. Fill form:
   - Name: John Smith
   - Email: john@digitalchain.in
   - Phone: +91-9876543210
   - Role: Staff (or Admin/SuperAdmin)
   - Team: Support (or other team)
5. Click "Create User"
6. Done! User appears in table
```

---

## 📝 Form Fields

| Field | Required | Example | Notes |
|-------|----------|---------|-------|
| Name | ✅ | Sarah Johnson | Full name |
| Email | ✅ | sarah@digitalchain.in | Must be unique |
| Phone | ✅ | +91-9876543210 | Mobile number |
| Role | ❌ | Admin | Default: Staff |
| Team | ❌ | Support | Default: Unassigned |

---

## 🔑 Roles

- **SuperAdmin** - Full platform access
- **Admin** - Team management access
- **Staff** - Limited access (default)

---

## 🏢 Teams

- Support
- Sales
- Operations
- Engineering
- Management
- Unassigned (default)

---

## 🗑️ Delete User

1. Find user in table
2. Click red trash icon (Actions column)
3. Confirm deletion
4. User removed from table

---

## 📊 User Table Columns

- **Name** - User's full name
- **Email** - Email address (unique identifier)
- **Phone** - Cell number
- **Role** - Color-coded role badge
- **Team** - Team assignment badge
- **Status** - Active (🟢) or Inactive (🔴)
- **Actions** - Delete button

---

## ⚡ Default Password

```
Email:    user@digitalchain.in
Password: TempPassword@123!
Portal:   https://admin.digitalchain.in
```

User must change on first login.

---

## ❌ Common Errors

| Error | Fix |
|-------|-----|
| "Email already exists" | Use different email |
| "Missing required fields" | Fill Name, Email, Phone |
| "Connection timeout" | Check API server |
| "Unauthorized" | Login again |

---

## 🎨 UI Elements

- **Loading spinner** - Data fetching
- **Error message** (Red box) - Something went wrong
- **Success message** (Alert) - Action completed
- **Green button** - Create/Submit
- **Gray button** - Cancel
- **Red button** - Delete
- **Blue badge** - Team/Role indicator

---

## 🔐 Security Tips

✅ Use company email (@digitalchain.in)  
✅ Share temporary password securely  
✅ Encourage password change on first login  
✅ Review user list monthly  
✅ Delete inactive users  
✅ Assign correct roles and teams  

---

## 💾 Example User Data

```json
{
  "name": "John Smith",
  "email": "john.smith@digitalchain.in",
  "cellnumber": "+91-9876543210",
  "role": "Admin",
  "team": "Support",
  "password": "TempPassword@123!" // auto-generated
}
```

---

## 📱 Features Available

✅ Create users  
✅ View users  
✅ Delete users  
✅ Filter by role  
✅ Filter by team  
✅ Sort by columns (coming)  
✅ Search users (coming)  
✅ Edit users (coming)  
✅ Bulk import (coming)  

---

## 🆘 Troubleshooting

**Page stuck on loading?**
- F5 to refresh
- Check Console (F12) for errors
- Verify API server running

**User didn't get created?**
- Check email is not duplicate
- Verify form submitted
- Check for error message
- Refresh and check table

**Can't delete user?**
- Check network connection
- Verify user still in table
- Try refresh and retry

---

## 📞 Help Resources

1. **Guide**: See USERS_MANAGEMENT_GUIDE.md
2. **API Docs**: /v1/docs (if available)
3. **Logs**: Browser Console (F12)
4. **Support**: Contact system admin

---

## 🚀 Production URL

```
Admin Portal: https://admin.digitalchain.in
API Server:   https://api.digitalchain.in
```

---

## 📌 Important Notes

- ⚠️ Only SuperAdmins can create/delete users
- ⚠️ Each email must be unique
- ⚠️ Default role is Staff
- ⚠️ Deletion is permanent
- ⚠️ Phone number required for all users
- ⚠️ Temporary password is TempPassword@123!

---

**Quick Guide v1.0** | Last Updated: Nov 4, 2025
