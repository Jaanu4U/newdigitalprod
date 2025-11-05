# User Management Guide - DigitalChain Admin Portal

## 📋 Overview

The User Management system allows SuperAdmins to create, view, and manage platform users. This guide walks through all features and operations.

---

## 🚀 Getting Started

### Access the Users Management Page

1. **Login to Admin Portal**
   - URL: `https://admin.digitalchain.in` (production) or `http://localhost:3001` (development)
   - Email: `superadmin@digitalchain.in`
   - Password: `SuperAdmin@123!`

2. **Navigate to Users Page**
   - Click **"Users"** in the left sidebar
   - Or click **"Users"** in the top navigation dropdown (Users ▼)

3. **Expected Screen**
   - Loading briefly while fetching user data
   - Then shows user table with all platform users
   - "Add User" button at the top right

---

## ➕ Creating a New User

### Step-by-Step Process

#### **1. Click "Add User" Button**
   - Located at top right of the Users page
   - Form appears below the header

#### **2. Fill in User Details**

The form has 5 fields (2 required, 3 optional):

| Field | Type | Required | Example | Notes |
|-------|------|----------|---------|-------|
| **Name** | Text | ✅ YES | John Smith | Full name of the user |
| **Email** | Email | ✅ YES | john@digitalchain.in | Must be unique (no duplicates) |
| **Cell Number** | Phone | ✅ YES | +91-9876543210 | Contact phone number |
| **Role** | Dropdown | ❌ NO | Admin | Default: Staff. Options: Staff, Admin, SuperAdmin |
| **Team** | Dropdown | ❌ NO | Support | Default: Unassigned. Options: Support, Sales, Operations, Engineering, Management, Unassigned |

**Example Form Values:**
```
Name:          Sarah Johnson
Email:         sarah.johnson@digitalchain.in
Cell Number:   +91-9988776655
Role:          Admin
Team:          Support
```

#### **3. Password Assignment**
- System automatically generates: `TempPassword@123!`
- User receives this temporary password
- User should change on first login
- Not shown in UI (handled by backend)

#### **4. Submit the Form**

**Button Options:**
- **"Create User"** (Green) - Creates the user
- **"Cancel"** (Gray) - Closes form without saving

**What Happens:**
```
1. Form validates all required fields
2. Sends request to backend
3. Backend checks if email already exists
4. If unique: User created with auto-generated UUID
5. Success message shows "User created successfully!"
6. Form closes automatically
7. User list refreshes to show new user
```

**Example Success Message:**
```
✓ User created successfully!
```

---

## 👥 Viewing Users

### User List Display

The user table shows all platform users with the following columns:

| Column | Content | Color/Format |
|--------|---------|--------------|
| **Name** | User's full name | Black text |
| **Email** | Email address | Blue icon + email |
| **Phone** | Cell number | Phone icon + number |
| **Role** | User role | Color-coded: Purple=SuperAdmin, Blue=Admin, Gray=Staff |
| **Team** | Team assignment | Gray badge with team name |
| **Status** | Active/Inactive | Green=Active ✓, Red=Inactive ✗ |
| **Actions** | Delete button | Red trash icon |

### Example User Table:
```
┌─────────────────────────────────────────────────────────────┐
│ Name           │ Email               │ Phone     │ Role   │ Team      │
├─────────────────────────────────────────────────────────────┤
│ Super Admin    │ superadmin@...      │ null      │ ⚡ SA  │ -         │
│ Sarah Johnson  │ sarah.johnson@...   │ +91-99... │ 🔷 Ad  │ Support   │
│ John Support   │ john.support@...    │ +91-98... │ 🔷 Ad  │ Sales     │
└─────────────────────────────────────────────────────────────┘
```

### Sorting & Searching
- Currently displays all users in creation order
- Search/filter feature coming soon

---

## 🗑️ Deleting a User

### Delete Process

#### **1. Find the User**
   - Locate the user in the table
   - Look at the rightmost column (Actions)

#### **2. Click Delete Button**
   - Red trash icon in the Actions column
   - Only delete button available per row

#### **3. Confirm Deletion**
   - Browser shows confirmation dialog:
   ```
   "Are you sure you want to delete this user?"
   ```
   - Click **"OK"** to confirm deletion
   - Click **"Cancel"** to abort

#### **4. User is Removed**
   - If confirmed, user is permanently deleted
   - Success message: "User deleted successfully!"
   - Table updates immediately
   - User count decreases

### Example:
```
Deleting: john.support@digitalchain.in
↓
"Are you sure?" dialog
↓
Click OK
↓
✓ User deleted successfully!
↓
User no longer appears in table
```

---

## 👤 User Roles Explained

### Role Hierarchy

| Role | Permissions | Use Case |
|------|-------------|----------|
| **SuperAdmin** | Platform-wide access, manage all users | System administrators |
| **Admin** | Organization-wide access, manage team users | Team leads, managers |
| **Staff** | Limited access to assigned tasks | Regular team members |

### Assigning Roles

**When Creating User:**
1. Open create user form
2. Select from **Role** dropdown
3. Choose: Staff, Admin, or SuperAdmin
4. Create user

**Role Notes:**
- Default role if not selected: **Staff**
- Can only be changed by modifying backend database (no edit UI yet)
- Determines API access level
- Controls what features user can access in portal

---

## 🏢 Team Assignment

### Available Teams

- **Support** - Customer support team
- **Sales** - Sales and business development
- **Operations** - Operations and logistics
- **Engineering** - Technical/engineering team
- **Management** - Management and leadership
- **Unassigned** - No team assignment (default)

### Assigning Teams

**When Creating User:**
1. Open create user form
2. Select from **Team** dropdown
3. Choose team or leave as "Unassigned"
4. Create user

**Team Notes:**
- Helps organize users by department
- Visible in user table
- Color-coded with badges
- Can be used for future team-based features

---

## 📊 User Status

### Status Types

| Status | Indicator | Meaning |
|--------|-----------|---------|
| **Active** | 🟢 Green checkmark | User can login and use portal |
| **Inactive** | 🔴 Red X | User cannot login (account disabled) |

### Status Management
- All new users are created with **Active** status
- Currently can only be changed via backend
- Edit UI planned for future

---

## 🔍 Current User List

### Sample Users (Pre-seeded)

```json
1. SuperAdmin Account
   Email: superadmin@digitalchain.in
   Name: Super Admin
   Role: SuperAdmin
   Team: Unassigned
   Status: Active
   
2. Admin Account
   Email: john.support@digitalchain.in
   Name: John Support
   Role: Admin
   Team: Support
   Status: Active
```

---

## ⚠️ Common Issues & Troubleshooting

### Issue: "No users found" message

**Cause:** API request failed or timeout
**Solution:**
1. Check internet connection
2. Verify API server is running
3. Check browser console (F12) for errors
4. Refresh page

### Issue: "User with this email already exists"

**Cause:** Email address already taken
**Solution:**
1. Use a different email address
2. Check if user already exists in table
3. Delete duplicate if created by mistake

### Issue: Form not submitting

**Cause:** Missing required fields
**Solution:**
1. Fill all required fields (Name, Email, Phone)
2. Make sure email format is valid
3. Make sure phone number is not empty

### Issue: User created but not showing in list

**Cause:** List hasn't refreshed yet
**Solution:**
1. Wait a moment for refresh
2. Refresh page manually (F5)
3. Check API is responding

### Issue: Delete button not working

**Cause:** API error or network issue
**Solution:**
1. Check network connection
2. Refresh page
3. Try again
4. Check browser console for errors

---

## 🔐 Security & Best Practices

### Password Management
- System generates temporary password: `TempPassword@123!`
- Users must change password on first login
- Never share temporary passwords via insecure channels

### User Permissions
- Only **SuperAdmins** can create users
- Only **SuperAdmins** can delete users
- Each user must have unique email

### Email Best Practices
- Use company domain: `@digitalchain.in`
- Format: `firstname.lastname@digitalchain.in`
- Lowercase for consistency

### Team Assignment
- Keep teams updated for organization
- Use consistent team names
- Archive inactive teams in future

---

## 📝 User Management Workflow

### Creating a Team Member

```
1. Collect information:
   - Full name
   - Email address
   - Phone number
   - Assigned role
   - Team assignment

2. Navigate to Users page
   ↓
3. Click "Add User" button
   ↓
4. Fill form with details
   ↓
5. Select role and team
   ↓
6. Click "Create User"
   ↓
7. See success message
   ↓
8. User appears in table
   ↓
9. Share credentials with user:
   - Email: john@digitalchain.in
   - Password: TempPassword@123!
   - Portal: https://admin.digitalchain.in

10. User logs in and changes password
```

### Monthly User Review

```
1. Go to Users page
2. Review all users in table
3. Identify inactive users
4. Delete if no longer needed
5. Update teams if changed
6. Verify all active users still needed
```

---

## 🎯 Advanced Features (Coming Soon)

### Planned Features
- ✏️ **Edit User** - Modify name, phone, team, role, status
- 🔍 **Search/Filter** - Find users by name, email, role, team
- 📄 **Pagination** - Handle large user lists
- 📥 **Bulk Import** - Create multiple users from CSV
- 📊 **User Analytics** - Activity tracking and reports
- 🔐 **2FA Management** - Enable/disable two-factor auth

---

## 📞 Support & Help

### Getting Help
1. Check this guide first
2. Review error messages in UI
3. Check browser console (F12)
4. Check API logs on backend
5. Contact system administrator

### Reporting Issues
- Report bugs with screenshot and error message
- Include steps to reproduce
- Share browser console errors
- Mention which user account was used

---

## 🎓 Examples

### Example 1: Create Support Team Member

```
Form Input:
- Name: Maria Santos
- Email: maria.santos@digitalchain.in
- Phone: +91-9876543210
- Role: Staff
- Team: Support

Click: Create User
Result: User created, appears in table
```

### Example 2: Create Team Lead

```
Form Input:
- Name: David Chen
- Email: david.chen@digitalchain.in
- Phone: +91-8765432109
- Role: Admin
- Team: Operations

Click: Create User
Result: Admin can now manage team users
```

### Example 3: Create Engineering Manager

```
Form Input:
- Name: Emma Wilson
- Email: emma.wilson@digitalchain.in
- Phone: +91-7654321098
- Role: Admin
- Team: Engineering

Click: Create User
Result: Admin user created, can manage engineering team
```

---

## 📱 Mobile Responsiveness

The Users page works on:
- ✅ Desktop (1920x1080 and up)
- ✅ Tablet (768px and up)
- ✅ Mobile (responsive table with scroll)

---

## 🔄 API Endpoints (Technical Reference)

For developers integrating with the system:

```
POST   /v1/superadmin/users/create
GET    /v1/superadmin/users
PUT    /v1/superadmin/users/{user_id}      (planned)
DELETE /v1/superadmin/users/{user_id}
```

---

## ✅ Checklist for Admin

- [ ] Created all team members
- [ ] Assigned correct roles
- [ ] Assigned to correct teams
- [ ] Shared credentials with users
- [ ] Users have changed temporary password
- [ ] Verified all users can login
- [ ] Set up team structure
- [ ] Documented team responsibilities

---

**Last Updated:** November 4, 2025  
**Version:** 1.0  
**Status:** Production Ready ✅
