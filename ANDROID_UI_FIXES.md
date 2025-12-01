# Android App Order Details UI Fixes

## Date: 2025-11-29

## Issues Reported
1. Invoice number appearing reduced/truncated
2. Invoice amount not showing on order details page
3. QR code text box layout concerns

## Changes Made

### 1. Backend API Updates

#### File: `/opt/digitalchain/backend/app/schemas.py`
- Added `amount: Optional[float] = None` field to `DeliveryOut` schema
- This allows the API to return invoice amount data to the Android app

#### File: `/opt/digitalchain/backend/app/routers/rider.py`
- Added `amount_map` dictionary to extract invoice amounts from `invoice_draft` payload
- Extracts amount from `totals.total`, `totals.grandTotal`, or `totals.grand_total` fields
- Added `amount=amount_map.get(r.order_id)` to the `DeliveryOut` response

**Backend Service**: Restarted to apply changes

### 2. Android App Updates

#### File: `/opt/digitalchain/rider-android/app/src/main/java/in/digitalchain/rider/data/model/Delivery.kt`
- Added `val amount: Double?` field to the `Delivery` data class

#### File: `/opt/digitalchain/rider-android/app/src/main/java/in/digitalchain/rider/data/api/ApiService.kt`
- Added `val amount: Double? = null` to `DeliveryDto` data class
- Added `val amount: Double? = null` to `AssignedOrderDto` data class

#### File: `/opt/digitalchain/rider-android/app/src/main/java/in/digitalchain/rider/data/Repository.kt`
- Updated both `toModel()` extension functions to include `amount` parameter
- Fixed compilation errors in DeliveryDto and AssignedOrderDto conversions

#### File: `/opt/digitalchain/rider-android/app/src/main/java/in/digitalchain/rider/ui/screens/DeliveryDetailScreen.kt`

**InvoiceHeroCard Updates:**
1. Added `invoiceAmount: Double?` parameter to function signature
2. Added new section displaying invoice amount with styling:
   - Label: "Invoice Amount" (white text with 60% opacity)
   - Value: "₹{amount}" (green color #4ADE80, bold, titleMedium size)
   - Positioned between status badge and delivery progress sections
3. Fixed invoice number display:
   - Added `modifier = Modifier.weight(1f)` to allow proper space allocation
   - Added `fontSize = 20.sp` for better readability
   - Set `maxLines = 2` and `softWrap = true` to prevent truncation
   - Added `Spacer(modifier = Modifier.width(12.dp))` between invoice and status badge
4. Updated function call to pass `invoiceAmount = currentDelivery.amount`

**QR Code Layout:**
- Reviewed the payment section layout
- Confirmed correct structure: Amount text field → Generate QR button → QR code → Amount display → Instructions → Manual UTR field
- No changes needed; layout is functioning as designed

## Build Results
- APK successfully built: `/opt/digitalchain/rider-android/app/build/outputs/apk/debug/app-debug.apk`
- File size: 20MB
- Build time: 28 seconds
- Status: BUILD SUCCESSFUL

## Testing Notes
To test the changes:
1. Install the new APK on the device
2. Log in as a rider with assigned orders
3. Open an order's detail page
4. Verify:
   - Invoice number is fully visible and larger (20sp)
   - Invoice amount displays below status badge in green
   - Amount shows as "₹799.00" format
   - QR code section layout is clear and organized

## Technical Details

### Amount Data Flow
1. **Invoice Creation**: Amount stored in `sync_log.payload.totals` (invoice_draft type)
2. **Backend API**: Extracts amount from invoice_draft and includes in `/api/deliveries` response
3. **Android App**: Receives amount via `DeliveryDto`, converts to `Delivery` model
4. **UI Display**: `InvoiceHeroCard` component renders amount with green styling

### API Response Example
```json
{
  "items": [
    {
      "delivery_id": "...",
      "order_id": "INV-20251129-0001",
      "customer": "swethaC",
      "address": "...",
      "status": "assigned",
      "rider_status": "assigned",
      "customer_phone": "...",
      "latitude": 12.9716,
      "longitude": 77.5946,
      "amount": 799.0
    }
  ]
}
```

## Files Modified Summary
- Backend: 2 files (schemas.py, rider.py)
- Android: 4 files (Delivery.kt, ApiService.kt, Repository.kt, DeliveryDetailScreen.kt)
- Total: 6 files

## Deployment
- Backend: Service restarted automatically
- Android: APK ready for distribution at `/opt/digitalchain/rider-android/app/build/outputs/apk/debug/app-debug.apk`
