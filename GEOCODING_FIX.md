# Geocoding Fix for Invoice Save

**Issue:** When saving invoices, the geocode (latitude/longitude) was not being saved to the database.

**Root Cause:** 
- Backend API expected `delivery_latitude` and `delivery_longitude` fields in the SaveInvoiceIn model
- Frontend was NOT sending these coordinates when saving invoices

**Solution Implemented:**

### Backend (Already Exists)
File: `/opt/digitalchain/backend/app/routers/invoice_pdf.py`

```python
class SaveInvoiceIn(BaseModel):
    items: Optional[List[Dict[str, Any]]] = None
    ship_to_same: Optional[bool] = True
    ship_to_address: Optional[str] = None
    totals: Optional[Dict[str, Any]] = None
    invoice_no: Optional[str] = None
    delivery_latitude: Optional[float] = None    # ✅ Already exists
    delivery_longitude: Optional[float] = None   # ✅ Already exists
```

The backend saves these coordinates to the `sync_log` table in the invoice_draft payload.

### Frontend Fix Applied
File: `/opt/digitalchain/admin-portal/app/billing/invoice/[customer_id]/page.tsx`

**Added geocoding before saving invoice (both save buttons):**

```typescript
// Geocode the delivery address
let deliveryLat = null;
let deliveryLng = null;
const deliveryAddr = shipToSame 
  ? [cust.address, [cust.city, cust.state, cust.pin].filter(Boolean).join(', ')].filter(Boolean).join(', ').trim()
  : shipToAddress.trim();

if (deliveryAddr) {
  try {
    const geoRes = await fetch(`${base}v1/org/geocode?address=${encodeURIComponent(deliveryAddr)}`, withTenantHeaders({
      headers: { Authorization: `Bearer ${token}` }
    }));
    if (geoRes.ok) {
      const geoData = await geoRes.json();
      if (geoData.status === 'ok') {
        deliveryLat = geoData.latitude;
        deliveryLng = geoData.longitude;
        console.log('✅ Geocoded delivery address:', { lat: deliveryLat, lng: deliveryLng });
      }
    }
  } catch (geoErr) {
    console.warn('⚠️ Geocoding failed, continuing without coordinates:', geoErr);
  }
}

const payload = {
  items: items.map(it => ({ description: it.description, qty: it.qty, rate: it.rate })),
  ship_to_same: shipToSame,
  ship_to_address: shipToSame ? null : shipToAddress,
  totals: { subtotal, total },
  delivery_latitude: deliveryLat,      // ✅ Now included
  delivery_longitude: deliveryLng,     // ✅ Now included
  invoice_no: effectiveInvoiceNo,
};
```

## How It Works

1. **User fills out invoice** with customer details and items
2. **User clicks "Save & Exit"** or "Save Draft"
3. **Geocoding happens:**
   - If `shipToSame` is true → Uses customer's address (address + city + state + pin)
   - If `shipToSame` is false → Uses custom `shipToAddress`
4. **API call to `/v1/org/geocode`:**
   - Uses organization's configured Google Maps API key
   - Returns `{ status: 'ok', latitude: 28.6139, longitude: 77.2090, formatted_address: '...' }`
5. **Coordinates included in save payload**
6. **Backend saves to database:**
   ```json
   {
     "delivery_latitude": 28.6139,
     "delivery_longitude": 77.2090
   }
   ```

## Testing

### To verify geocoding is working:

1. **Open browser console** (F12)
2. **Create or edit an invoice** at `/billing/invoice/<customer_id>?create=true&shipToSame=1`
3. **Fill in customer address** (or use existing customer with address)
4. **Click "Save & Exit"**
5. **Check console logs:**
   ```
   ✅ Geocoded delivery address: { lat: 28.6139, lng: 77.2090 }
   ```

### To verify coordinates are saved:

```sql
-- Check the most recent invoice draft
SELECT 
  id,
  type,
  payload->>'invoice_no' as invoice_no,
  payload->>'delivery_latitude' as lat,
  payload->>'delivery_longitude' as lng,
  payload->>'customer_address' as address,
  created_at
FROM sync_log 
WHERE type = 'invoice_draft' 
ORDER BY created_at DESC 
LIMIT 5;
```

Expected output:
```
 id  | type          | invoice_no | lat      | lng      | address           | created_at
-----+---------------+------------+----------+----------+-------------------+------------
 123 | invoice_draft | INV-00123  | 28.6139  | 77.2090  | 123 Main St, ... | 2025-11-27...
```

## Error Handling

- **Geocoding fails gracefully:** If the geocoding API is down or returns an error, the invoice will still save but coordinates will be `null`
- **Console warning shown:** `⚠️ Geocoding failed, continuing without coordinates: <error>`
- **Invoice save continues:** User experience is not interrupted

## Requirements

- ✅ Organization must have Google Maps API key configured in settings
- ✅ User must have valid authentication token
- ✅ Delivery address must be provided (either customer address or custom ship-to address)

## API Endpoint Used

**Endpoint:** `GET /v1/org/geocode?address=<address>`

**Authentication:** Bearer token (JWT)

**Response:**
```json
{
  "status": "ok",
  "latitude": 28.6139,
  "longitude": 77.2090,
  "formatted_address": "New Delhi, Delhi, India"
}
```

## Status

✅ **IMPLEMENTED & DEPLOYED**

- Date: November 27, 2025
- Build: Successful
- Service: Running
- Testing: Ready

**Next Steps:**
1. Clear browser cache (Ctrl+Shift+R)
2. Test invoice save with address
3. Verify coordinates in database
4. Check console logs for geocoding success

