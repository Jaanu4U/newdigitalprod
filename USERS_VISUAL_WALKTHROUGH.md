# User Management - Visual Walkthrough

## 🎬 Step-by-Step Screenshots & Actions

---

## PART 1: ACCESSING THE USERS PAGE

### Step 1: Login to Portal

**URL:** `https://admin.digitalchain.in` (production) or `http://localhost:3001` (dev)

```
┌──────────────────────────────────────┐
│        DigitalChain Admin Portal      │
├──────────────────────────────────────┤
│                                      │
│  Email:    [superadmin@digitalchain.in]
│  Password: [•••••••••••••••]         │
│                                      │
│           [Login Button]             │
│                                      │
└──────────────────────────────────────┘
```

**Credentials:**
- Email: `superadmin@digitalchain.in`
- Password: `SuperAdmin@123!`

---

### Step 2: Navigate to Users Page

**Option A: Click Users in Sidebar**
```
┌─────────────────────────────────────────────┐
│ ≡ SIDEBAR                                   │
├─────────────────────────────────────────────┤
│ 🏠 Dashboard         ← Main page            │
│ 👥 Users           ← Click here!            │
└─────────────────────────────────────────────┘
```

**Option B: Click Users in NavBar Dropdown**
```
┌─────────────────────────────────────────────┐
│ NavBar: Dashboard  Users ▼  Profile ▼       │
│                   └─────────────┐            │
│                   • Dashboard   │            │
│                   • Users   ← Click here!    │
│                   • Logout      │            │
│                               └─────────────┘
```

---

### Step 3: Users Page Loads

```
┌────────────────────────────────────────────────┐
│ 👥 User Management        [+ Add User Button]  │
├────────────────────────────────────────────────┤
│                                                │
│  Loading users...                              │
│  ⏳ (spinning animation)                        │
│  Connecting to API server                      │
│                                                │
└────────────────────────────────────────────────┘
```

**Wait 1-2 seconds for data to load...**

---

### Step 4: Users Page Fully Loaded

```
┌──────────────────────────────────────────────────────────────┐
│ 👥 User Management                    [+ Add User]           │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│ ┌────────────────────────────────────────────────────────────┐
│ │ Name        │ Email              │ Phone   │ Role │ Team   │
│ ├────────────────────────────────────────────────────────────┤
│ │ Super Admin │ superadmin@...     │ —       │ 🔺   │ —      │
│ │ John Smith  │ john.smith@...     │ +91-... │ 🔷   │ Support│
│ └────────────────────────────────────────────────────────────┘
│
│ Total Users: 2
└──────────────────────────────────────────────────────────────┘
```

---

## PART 2: CREATING A NEW USER

### Step 5: Click "Add User" Button

**Action:** Click the green "+ Add User" button at top right

```
                            ┌──────────────────┐
                            │ + Add User       │
                            │ (Green Button)   │
                            └──────────────────┘
                                      ↑
                                 Click here
```

---

### Step 6: Create User Form Appears

```
┌────────────────────────────────────────────┐
│ Create New User                            │
├────────────────────────────────────────────┤
│                                            │
│ Name *                                     │
│ [________________________]                 │
│ (required)                                 │
│                                            │
│ Email *                                    │
│ [________________________]                 │
│ (required)                                 │
│                                            │
│ Cell Number *                              │
│ [________________________]                 │
│ (required)                                 │
│                                            │
│ Role                    │ Team             │
│ [Staff ▼]              │ [Unassigned ▼]   │
│ (optional)             │ (optional)        │
│                                            │
│ [Create User] [Cancel]                    │
│ (Green)     (Gray)                         │
│                                            │
└────────────────────────────────────────────┘
```

---

### Step 7: Fill in User Information

**Example:**

```
┌────────────────────────────────────────────┐
│ Create New User                            │
├────────────────────────────────────────────┤
│                                            │
│ Name *                                     │
│ [John Smith_________________]              │ ← Type name
│                                            │
│ Email *                                    │
│ [john.smith@digitalchain.in_]              │ ← Type email
│                                            │
│ Cell Number *                              │
│ [+91-9876543210__________]                 │ ← Type phone
│                                            │
│ Role                    │ Team             │
│ [Staff ▼]              │ [Support ▼]      │ ← Select options
│                                            │
│ [Create User] [Cancel]                    │
│                                            │
└────────────────────────────────────────────┘
```

**Fields to Fill:**

| Field | Value | Instruction |
|-------|-------|-------------|
| Name | John Smith | Type full name |
| Email | john.smith@digitalchain.in | Type unique email |
| Phone | +91-9876543210 | Type phone number |
| Role | Admin | Click dropdown, select |
| Team | Support | Click dropdown, select |

---

### Step 8: Select Role (Dropdown)

**Click Role Dropdown:**

```
┌────────────────────┐
│ Role               │ ← Click here
│ Staff    ▼         │
└────────────────────┘
     ↓
   Shows:
   ┌─────────────────┐
   │ Staff (default) │ ← Option 1
   │ Admin           │ ← Option 2
   │ SuperAdmin      │ ← Option 3
   └─────────────────┘
```

**Select one:**
- `Staff` - Regular team member (default)
- `Admin` - Team lead/manager
- `SuperAdmin` - Platform administrator

---

### Step 9: Select Team (Dropdown)

**Click Team Dropdown:**

```
┌────────────────────┐
│ Team               │ ← Click here
│ Unassigned ▼       │
└────────────────────┘
         ↓
      Shows:
   ┌──────────────────┐
   │ Unassigned       │ ← Default
   │ Support          │ ← Option
   │ Sales            │ ← Option
   │ Operations       │ ← Option
   │ Engineering      │ ← Option
   │ Management       │ ← Option
   └──────────────────┘
```

**Select one:**
- Choose the team this user belongs to
- Or leave as "Unassigned"

---

### Step 10: Submit Form - Click "Create User"

```
Before:
┌───────────────────────────────────────┐
│ Name:  John Smith                     │
│ Email: john.smith@digitalchain.in     │
│ Phone: +91-9876543210                 │
│ Role:  Admin                          │
│ Team:  Support                        │
│                                       │
│ [Create User] ← Click this button     │
└───────────────────────────────────────┘
```

---

### Step 11: Confirmation

**Success Message Appears:**

```
┌──────────────────────────────────────┐
│ ✅ User created successfully!         │
│                                      │
│ (Auto-closes in 3 seconds)           │
└──────────────────────────────────────┘
```

**Backend Processing:**
- ✅ Email uniqueness validated
- ✅ UUID auto-generated
- ✅ Password hashed
- ✅ User record created
- ✅ Success response sent

---

### Step 12: Form Closes & Table Updates

```
BEFORE (2 users):
┌──────────────────────────────────────────────────┐
│ Name       │ Email              │ Role   │ Team   │
├──────────────────────────────────────────────────┤
│ Super Admin│ superadmin@...     │ 🔺     │ —      │
│ John Smith │ john.smith@...     │ 🔷     │ Support│
└──────────────────────────────────────────────────┘

           ↓ (New user created)

AFTER (3 users):
┌──────────────────────────────────────────────────┐
│ Name       │ Email              │ Role   │ Team   │
├──────────────────────────────────────────────────┤
│ Super Admin│ superadmin@...     │ 🔺     │ —      │
│ John Smith │ john.smith@...     │ 🔷     │ Support│
│ Sarah J.   │ sarah.johnson@...  │ 🔷     │ Sales  │ ← NEW
└──────────────────────────────────────────────────┘
```

---

## PART 3: VIEWING USERS

### User Table Details

```
Full User Table:

┌─────────┬──────────────────────┬────────────────┬──────┬──────────────┐
│ Name    │ Email                │ Phone          │ Role │ Team         │
├─────────┼──────────────────────┼────────────────┼──────┼──────────────┤
│ Super A.│ superadmin@digital...│ —              │ 🔺   │ —            │
│         │                      │                │ SA   │              │
├─────────┼──────────────────────┼────────────────┼──────┼──────────────┤
│ John S. │ john.smith@digital...│ 📱 +91-987...  │ 🔷   │ 🏷️ Support   │
│         │                      │                │ Ad   │              │
├─────────┼──────────────────────┼────────────────┼──────┼──────────────┤
│ Sarah J.│ sarah.johnson@digi...│ 📱 +91-988...  │ 🔷   │ 🏷️ Sales     │
│         │                      │                │ Ad   │              │
├─────────┼──────────────────────┼────────────────┼──────┼──────────────┤
│ Maria S.│ maria@digitalchain...│ 📱 +91-976...  │ 👤   │ 🏷️ Ops       │
│         │                      │                │ Sf   │              │
└─────────┴──────────────────────┴────────────────┴──────┴──────────────┘

Status Column:
✅ Active (Green check)
❌ Inactive (Red X)

Actions Column:
🗑️ Delete (Red trash icon)
```

---

## PART 4: DELETING A USER

### Step 1: Locate User in Table

```
Find the user to delete:

┌────────────────────────────────┐
│ Name      │ Email          │ Ac │
├────────────────────────────────┤
│ Super Adm.│ superadmin@... │    │
│ John Smith│ john@...       │ 🗑️ │ ← Find this row
│ Sarah J.  │ sarah@...      │ 🗑️ │
│ Maria S.  │ maria@...      │ 🗑️ │
└────────────────────────────────┘
                              ↑
                         Actions column
```

---

### Step 2: Click Delete Button

```
┌─────────────────────────────────┐
│ User: John Smith                │
│ Email: john.smith@digital...    │
│                             🗑️  │
│                          Click  │
│                          here   │
└─────────────────────────────────┘
```

---

### Step 3: Confirm Deletion

```
Browser Confirmation Dialog:

┌──────────────────────────────────────────┐
│  Confirm                                 │
├──────────────────────────────────────────┤
│                                          │
│  Are you sure you want to delete this    │
│  user?                                   │
│                                          │
│  [OK]  [Cancel]                          │
│   ↑         ↑                            │
│ Confirm   Abort                          │
│                                          │
└──────────────────────────────────────────┘
```

---

### Step 4: Confirm or Cancel

**Option A: Click OK**
```
→ User permanently deleted
→ Success message shown
→ Table refreshes
→ User no longer appears
```

**Option B: Click Cancel**
```
→ Deletion aborted
→ Dialog closes
→ User still in table
→ No changes made
```

---

### Step 5: Successful Deletion

```
┌──────────────────────────────┐
│ ✅ User deleted successfully! │
│                              │
│ (Auto-closes in 3 seconds)   │
└──────────────────────────────┘

Table Updated (John Smith removed):

┌────────────────────────────────────────┐
│ Name      │ Email            │ Team    │
├────────────────────────────────────────┤
│ Super Adm.│ superadmin@...   │ —       │
│ Sarah J.  │ sarah@...        │ Sales   │
│ Maria S.  │ maria@...        │ Ops     │
└────────────────────────────────────────┘
(John Smith gone)

Total Users: 3 (was 4)
```

---

## PART 5: ERROR HANDLING

### Error: Email Already Exists

```
Form Submitted:
─────────────────────────────────────
Name:  Sarah Johnson
Email: sarah@digitalchain.in  ← Duplicate!
Phone: +91-9876543210

Result:

┌─────────────────────────────────────┐
│ ❌ Error: User with this email      │
│    already exists                   │
└─────────────────────────────────────┘

Action: Try different email address
```

---

### Error: Missing Required Fields

```
Form with Missing Fields:
─────────────────────────────────────
Name:  [empty] ← Required!
Email: john@digitalchain.in
Phone: [empty] ← Required!

Result:

┌────────────────────────────────────┐
│ ❌ Please fill all required fields │
└────────────────────────────────────┘

Action: Fill all required fields (Name, Email, Phone)
```

---

### Error: Network Timeout

```
Page stuck loading for >10 seconds

Result:

┌──────────────────────────────────────────┐
│ ⚠️ Error: Connection timeout - API       │
│ server is not responding                 │
│                                          │
│ Check your network connection and        │
│ ensure the API server is running.        │
└──────────────────────────────────────────┘

Action: 
1. Check internet connection
2. Verify API server running
3. Refresh page (F5)
4. Try again
```

---

## PART 6: COLOR CODES & INDICATORS

### Role Color Coding

```
🔺 SuperAdmin      → Purple icon
   Color: #9333EA (Purple)

🔷 Admin           → Blue icon
   Color: #3B82F6 (Blue)

👤 Staff           → Gray icon
   Color: #6B7280 (Gray)
```

### Team Badges

```
Support     → 🏷️ Gray badge with text
Sales       → 🏷️ Gray badge with text
Operations  → 🏷️ Gray badge with text
Engineering → 🏷️ Gray badge with text
Management  → 🏷️ Gray badge with text
Unassigned  → (no badge)
```

### Status Indicators

```
✅ Active        → Green checkmark
   Status: Active (can login)

❌ Inactive      → Red X
   Status: Inactive (cannot login)
```

---

## PART 7: COMMON WORKFLOWS

### Workflow 1: Add New Team Member

```
Scenario: Hiring new support staff member

Steps:
1. Click "Add User" button
2. Fill form:
   - Name: Emma Davis
   - Email: emma.davis@digitalchain.in
   - Phone: +91-9111111111
   - Role: Staff
   - Team: Support
3. Click "Create User"
4. Share credentials with Emma:
   - Portal: https://admin.digitalchain.in
   - Email: emma.davis@digitalchain.in
   - Password: TempPassword@123!
5. Emma logs in and changes password
6. Emma ready to work!

Time: ~2 minutes
```

---

### Workflow 2: Promote Staff to Admin

```
Scenario: Staff member promoted to team lead

Steps:
1. Delete old staff account
   - Find user in table
   - Click delete
   - Confirm
2. Create new admin account
   - Click "Add User"
   - Same email (change domain if needed)
   - Role: Admin
   - Same team
   - Create
3. Share new credentials
4. User logs in

Note: Email must be unique, so may need different email

Time: ~3 minutes
```

---

### Workflow 3: Restructure Teams

```
Scenario: Moving users between teams

Steps:
1. Create users in new team structure
   - Add users with new team assignments
2. Delete users from old team
   - Find and delete old team assignments
3. Verify all users reassigned
   - Check table for team badges
   - Confirm all active users present

Time: ~10 minutes for small team
```

---

## KEYBOARD SHORTCUTS

| Action | Shortcut |
|--------|----------|
| Open page | None (click Users in sidebar) |
| Focus Add button | Tab (multiple times) |
| Close form | Esc key (may work) |
| Submit form | Enter (when cursor in form) |
| Confirm delete | Enter (in dialog) |
| Refresh page | F5 |
| Open DevTools | F12 |

---

## 📱 RESPONSIVE DESIGN

### Desktop (1920x1080)
```
Full table view with all columns visible
Sidebar on left
All buttons and forms visible
```

### Tablet (768px)
```
Table may scroll horizontally
Sidebar collapsible
Forms stack vertically
Touch-friendly buttons
```

### Mobile (320px)
```
Table scrolls horizontally
2-column layout
Buttons full width
Forms scroll vertically
```

---

**Visual Walkthrough v1.0** | Last Updated: Nov 4, 2025
