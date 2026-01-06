# Email Verification Fix - Complete Solution

## Problem
1. Old users who registered before the timezone fix are getting "invalid token" errors
2. Verification email links were using wrong domain (admin.digitalchain.in instead of org subdomain)

## Root Causes
1. **Timezone-naive vs timezone-aware datetime mismatch** - Old database entries had timezone-naive datetimes
2. **Token comparison logic** - Python datetime comparisons fail when mixing aware and naive datetimes
3. **Expired tokens** - Some old tokens were already expired
4. **Wrong verification domain** - Links used `admin.digitalchain.in` instead of `{org_slug}.digitalchain.in`

## Solutions Implemented

### 1. Backend Fixes (✅ Completed)

**File: `backend/app/routers/org.py`**
- ✅ All datetime operations now use `datetime.now(timezone.utc)` instead of `datetime.utcnow()`
- ✅ Token expiration check handles both timezone-aware and timezone-naive datetimes
- ✅ Added comprehensive logging for debugging
- ✅ Better error messages
- ✅ Both GET and POST methods supported for resend-verification endpoint
- ✅ **Fixed verification links to use organization subdomain** (`{org.slug}.digitalchain.in` instead of `admin.digitalchain.in`)

### 2. Database Migration (✅ Completed)

**Script: `backend/scripts/fix_timezone_aware_tokens.py`**
- Converted 5 users' tokens from timezone-naive to timezone-aware
- However, all these tokens were already expired (from December 2025)

### 3. User Action Required

For old users who registered before this fix, they need to:

1. **Request a NEW verification email** using the "Resend Verification Email" button
2. The new token will be timezone-aware and valid for 24 hours
3. Click the verification link in the email

## How to Help Users

### Option 1: Via Login Page
Users can click "Resend Verification Email" on the login page after entering their email.

### Option 2: Direct API Call
Admin can resend verification emails for users:

```bash
# Replace with actual email
curl -X POST "https://api.digitalchain.in/v1/org/resend-verification?email=user@example.com"
```

### Option 3: Manual Database Update (Emergency Only)
If needed, you can manually verify a user:

```bash
# SSH to server and run:
cd /home/jugesh/digitalchain/newdigitalprod
/home/jugesh/digitalchain/newdigitalprod/backend/.venv/bin/python3 << EOF
from backend.app.db import SessionLocal
from backend.app.models import User

db = SessionLocal()
user = db.query(User).filter(User.email == "user@example.com").first()
if user:
    user.email_verified = True
    user.verification_token = None
    user.token_expires_at = None
    db.commit()
    print(f"✅ Verified {user.email}")
else:
    print("❌ User not found")
db.close()
EOF
```

## Testing

### Test New Registration
1. Go to https://admin.digitalchain.in/signup
2. Register a new organization
3. Check email for verification link
4. Click link - should verify successfully

### Test Resend for Old Users
1. Go to https://admin.digitalchain.in/login
2. Enter email of old unverified user
3. Click "Resend Verification Email"
4. Check email for new verification link
5. Click link - should now work

## Monitoring

Check backend logs for verification attempts:
```bash
sudo journalctl -u digitalchain-backend.service -f | grep -E "Verify Email|Resend Verification|Registration"
```

You'll see:
- `[Registration]` - New user registrations
- `[Resend Verification]` - Resend requests
- `[Verify Email]` - Verification attempts

## Current Status

✅ Backend timezone fixes deployed
✅ Database migration completed (5 users updated)
✅ Service restarted
⚠️ Old tokens are expired - users must request new ones

## Next Steps

1. Communicate to users that they need to request a new verification email
2. Monitor logs for any remaining issues
3. Consider adding an automated email to unverified users > 7 days old
