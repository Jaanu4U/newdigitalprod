# Google Maps API Usage Tracking

## Overview
All organizations now use a single global Google Maps API key configured at the platform level. API usage is tracked per organization and displayed in dashboards.

## Features Implemented

### 1. Database Schema
**New Table: `maps_api_usage`**
- `id` - Primary key
- `org_id` - Organization reference
- `endpoint` - API endpoint used (geocode, bulk_geocode, etc.)
- `request_count` - Number of requests
- `created_at` - Timestamp (grouped by day)
- `updated_at` - Last update timestamp

**Updated Table: `organizations`**
- Added `maps_api_usage_count` - Total lifetime Maps API requests

### 2. Usage Tracking
Automatic tracking implemented in:
- `/v1/org/geocode` - Address geocoding
- `/v1/org/estimated-time` - Distance/time calculations
- Bulk invoice upload geocoding
- Customer address autocomplete (frontend)

### 3. API Endpoints

#### Get Organization Maps Usage
```
GET /v1/org/maps-usage
```
Returns:
- `total_usage` - Lifetime total API calls
- `usage_by_endpoint` - Breakdown by endpoint type (last 30 days)
- `daily_usage_last_7_days` - Daily usage for charting

#### Get All Organizations (SuperAdmin)
```
GET /v1/platform/organizations
```
Returns array of organizations with:
- Basic org info (name, slug, status, plan)
- `maps_api_usage_count` - Total Maps API usage
- `user_count` - Number of users
- Timestamps

### 4. UI Display

#### Organization Dashboard (`/`)
New card showing:
- Total Maps API requests (lifetime)
- Top 2 endpoints by usage
- Real-time data fetched on page load

#### SuperAdmin Platform
`GET /v1/platform/organizations` provides usage data for admin monitoring

## Global API Key Configuration

### Current Setup
- API Key stored in: `platform_settings.email_config['maps_config']['google_api_key']`
- Fallback: Hardcoded `AIzaSyDJVgqPI6Gbu1YXxMBZnJazQ43r7O9nmv0`

### To Update API Key

**Option 1: Via SuperAdmin UI** (if implemented)
- Login as SuperAdmin
- Go to Platform Settings → Maps Configuration
- Enter new API key

**Option 2: Via Environment Variable**
Add to `/home/jugesh/digitalchain/newdigitalprod/backend/.env`:
```bash
GOOGLE_MAPS_API_KEY=your_new_api_key_here
```
Then restart: `sudo systemctl restart digitalchain-backend`

**Option 3: Via Database**
```sql
sudo -u postgres psql -d digitalchain -c "
UPDATE platform_settings 
SET email_config = jsonb_set(
    COALESCE(email_config, '{}'::jsonb),
    '{maps_config}',
    '{\"enabled\": true, \"provider\": \"google\", \"google_api_key\": \"YOUR_API_KEY_HERE\"}'::jsonb
)
WHERE id = 1;
"
```

## Usage Tracking Logic

### Function: `track_maps_usage(db, org_id, endpoint)`
Located in: `backend/app/routers/org.py`

**Behavior:**
1. Increments organization's `maps_api_usage_count`
2. Creates or updates daily usage record in `maps_api_usage` table
3. Groups by date and endpoint
4. Non-blocking - errors don't affect main request

**Example:**
```python
# In any endpoint using Maps API
from .org import track_maps_usage

track_maps_usage(db, principal.org_id, "geocode")
```

## Testing

### Test Usage Tracking
1. Login to organization dashboard
2. Go to `/customers` and add a customer with address
3. Autocomplete will trigger Maps API usage
4. Return to dashboard (`/`) - see usage count updated

### Test SuperAdmin View
```bash
curl -H "Authorization: Bearer SUPERADMIN_TOKEN" \
  http://localhost:8000/v1/platform/organizations | jq
```

### Manual Database Check
```sql
-- View total usage per org
SELECT 
    o.name, 
    o.maps_api_usage_count 
FROM organizations o 
ORDER BY o.maps_api_usage_count DESC;

-- View detailed usage breakdown
SELECT 
    o.name,
    m.endpoint,
    m.request_count,
    m.created_at::date as date
FROM maps_api_usage m
JOIN organizations o ON m.org_id = o.org_id
ORDER BY m.created_at DESC
LIMIT 20;
```

## Security Notes

1. **API Key Protection**: 
   - Frontend: Key visible in network requests (required for Google Maps)
   - Backend: Key not logged in console
   - Database: Stored encrypted in production

2. **API Key Restrictions** (Configure in Google Cloud Console):
   - HTTP referrer restrictions (limit to your domains)
   - API restrictions (enable only needed APIs)
   - Quotas and billing alerts

3. **Usage Monitoring**:
   - Track per-organization usage
   - Set up alerts for unusual spikes
   - Monitor via SuperAdmin dashboard

## File Changes

### Backend
- `app/models.py` - Added MapsApiUsage model, updated Organization
- `app/routers/org.py` - Added track_maps_usage(), maps-usage endpoint
- `app/routers/platform.py` - Added organizations endpoint with usage
- `app/routers/invoice.py` - Updated geocode_address to track usage

### Frontend
- `app/page.tsx` - Added Maps usage card to dashboard

### Database
- Created `maps_api_usage` table
- Added `maps_api_usage_count` column to organizations

## Deployment

Services deployed via:
```bash
sudo systemctl restart digitalchain-backend
sudo systemctl restart digitalchain-admin
```

Changes committed: `12dd410`
