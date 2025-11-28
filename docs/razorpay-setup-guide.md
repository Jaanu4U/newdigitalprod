# Razorpay Payment Gateway Setup Guide

## 📋 Overview

This guide will help you set up Razorpay payment gateway integration for automated payment collection in your Digitalchain platform.

---

## 🎯 What You'll Get

- **Automated Payment Collection**: Customers pay via UPI/Card/Netbanking
- **Real-time Payment Confirmation**: Automatic webhook notifications
- **Payment Tracking**: All payments synced to your dashboard
- **Security**: Webhook signature verification enabled
- **Fallback Option**: Manual UPI collection if gateway fails

---

## 📝 Prerequisites

1. Active Razorpay account (Business or Individual)
2. KYC completed (for live mode)
3. Admin access to Digitalchain settings
4. Access to your domain's webhook endpoint

---

## 🚀 Step-by-Step Setup

### Step 1: Create Razorpay Account

1. Go to [https://razorpay.com](https://razorpay.com)
2. Sign up for a new account or log in
3. Complete KYC verification (required for live mode)
4. Navigate to **Settings** → **API Keys**

---

### Step 2: Get API Credentials

#### **Test Mode** (for testing):
1. Go to **Settings** → **API Keys**
2. Click **Generate Test Key**
3. Copy the **Key ID** (starts with `rzp_test_`)
4. Copy the **Key Secret** (starts with a long string)

#### **Live Mode** (for production):
1. Complete KYC verification
2. Go to **Settings** → **API Keys**
3. Click **Generate Live Key**
4. Copy the **Key ID** (starts with `rzp_live_`)
5. Copy the **Key Secret**

**⚠️ Important**: Never share your Key Secret publicly!

---

### Step 3: Configure Razorpay in Digitalchain

1. Log in to your Digitalchain Admin Portal
2. Go to **Settings** → **Payment Settings**
3. Fill in the following:

   ```
   ✓ Enable Payments: [✓] Checked
   ✓ Provider: Razorpay
   ✓ Currency: INR
   ✓ Key ID: rzp_test_xxxxxxxxxx (or rzp_live_xxxxxxxxxx)
   ✓ Key Secret: ******************
   ```

4. Click **Save Changes**

---

### Step 4: Set Up Webhook (Critical for Auto-Confirmation)

1. In Razorpay Dashboard, go to **Settings** → **Webhooks**
2. Click **+ Add New Webhook**
3. Configure:

   ```
   Webhook URL: https://api.digitalchain.in/v1/payment/webhook/razorpay
   Active Events: 
     ✓ payment.captured
     ✓ payment.failed
   Secret: [Generate a strong secret]
   ```

4. Click **Create Webhook**
5. **Copy the Webhook Secret** (you'll need this)

---

### Step 5: Add Webhook Secret to Digitalchain

Currently, you need to add the webhook secret via API or database:

**Option A: Via Database** (requires database access):
```sql
UPDATE organizations 
SET settings = jsonb_set(
  settings, 
  '{payment,gateway,webhook_secret}', 
  '"your_webhook_secret_here"'
)
WHERE org_id = 'your-org-id';
```

**Option B: Via API** (coming soon in UI):
```bash
curl -X PATCH https://api.digitalchain.in/v1/org/YOUR_ORG_ID/settings \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "payment_settings": {
      "gateway": {
        "webhook_secret": "your_webhook_secret_here"
      }
    }
  }'
```

---

### Step 6: Enable Gateway in Organization Settings

Update your organization settings to enable the gateway:

```json
{
  "payment": {
    "enabled": true,
    "upi": {
      "merchant_vpa": "your_upi@bank",
      "merchant_name": "Your Store",
      "qr_expiry_minutes": 15
    },
    "gateway": {
      "provider": "razorpay",
      "enabled": true,
      "key_id": "rzp_test_xxxxxxxxxx",
      "key_secret": "******************",
      "webhook_secret": "******************"
    }
  }
}
```

---

## ✅ Testing Your Setup

### Test Payment Flow:

1. **Generate QR Code**:
   - Open Rider App
   - Select a delivery
   - Choose UPI payment method
   - Click "Generate Payment QR Code"
   - Verify QR code is generated successfully

2. **Make Test Payment**:
   - Use Razorpay Test Card: `4111 1111 1111 1111`
   - CVV: Any 3 digits
   - Expiry: Any future date
   - Or scan QR with test UPI app

3. **Verify Payment**:
   - Check Razorpay Dashboard for payment status
   - Verify webhook is triggered
   - Check Digitalchain Payments page for status update
   - Verify delivery status updated to "payment received"

---

## 🔒 Security Best Practices

1. **Never commit secrets to git**
   - Store credentials in environment variables or secure vault
   - Use `.env` files (add to `.gitignore`)

2. **Webhook Signature Verification**
   - Always configure webhook secret
   - Signature verification is automatic once configured
   - Protects against fake webhook calls

3. **Use Test Mode First**
   - Test thoroughly before enabling live mode
   - Verify all flows work correctly
   - Test error scenarios

4. **Rotate Keys Regularly**
   - Change API keys every 90 days
   - Update webhook secrets periodically
   - Revoke old keys after rotation

5. **Monitor Payment Logs**
   - Check backend logs for errors
   - Monitor Razorpay Dashboard for failed payments
   - Set up alerts for payment failures

---

## 🔧 Troubleshooting

### Issue: QR Code Generation Fails

**Symptoms**: Error message when generating QR

**Solutions**:
1. Check if Key ID and Secret are correct
2. Verify Razorpay account is active
3. Check backend logs: `journalctl -u digitalchain-backend -f`
4. Ensure amount is valid (minimum ₹1)

### Issue: Webhook Not Triggered

**Symptoms**: Payment successful in Razorpay but not updated in Digitalchain

**Solutions**:
1. Verify webhook URL is correct: `https://api.digitalchain.in/v1/payment/webhook/razorpay`
2. Check webhook is active in Razorpay Dashboard
3. Verify webhook secret is configured
4. Check webhook logs in Razorpay Dashboard
5. Test webhook with Razorpay's test tool

### Issue: Signature Verification Failed

**Symptoms**: Webhook received but shows "Invalid signature" error

**Solutions**:
1. Verify webhook secret matches between Razorpay and Digitalchain
2. Ensure no extra spaces in webhook secret
3. Check if webhook secret is properly stored in database
4. Restart backend service after updating secret

### Issue: Payment Shows "Initiated" Forever

**Symptoms**: Payment created but never completes

**Solutions**:
1. Check if customer actually completed payment
2. Verify webhook is configured and active
3. Manually confirm payment if needed:
   - Go to Payments page in Admin Portal
   - Find the payment
   - Click "Confirm Payment" (coming soon)
   - Or rider can confirm manually in app

---

## 📊 Payment Flow Diagram

```
┌─────────────┐
│   Rider     │
│ Generates QR│
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│   Digitalchain  │◄── 1. Create Payment Record
│     Backend     │
└────────┬────────┘
         │
         │ 2. Call Razorpay API
         ▼
┌─────────────────┐
│   Razorpay      │◄── 3. Create Order
│     Gateway     │
└────────┬────────┘
         │
         │ 4. Return Order ID & QR
         ▼
┌─────────────────┐
│  Customer Scans │
│   & Pays via    │
│  UPI/Card/Net   │
└────────┬────────┘
         │
         │ 5. Payment Processed
         ▼
┌─────────────────┐
│   Razorpay      │
│  Webhook Event  │──► 6. POST to Digitalchain
└─────────────────┘
         │
         ▼
┌─────────────────┐
│ Verify Signature│──► 7. HMAC SHA256 Check
│ Update Payment  │
│ Update Delivery │
│ Send WebSocket  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Admin Dashboard │◄── 8. Real-time Update
│  Rider App      │
└─────────────────┘
```

---

## 💰 Pricing

**Razorpay Charges**:
- **Domestic Cards**: 2% per transaction
- **UPI**: Free up to ₹2000, then ₹X per transaction
- **Wallets**: 2% per transaction
- **Net Banking**: 2% per transaction

**Check latest pricing**: [Razorpay Pricing](https://razorpay.com/pricing/)

---

## 📞 Support

### Razorpay Support:
- Dashboard: [https://dashboard.razorpay.com](https://dashboard.razorpay.com)
- Email: support@razorpay.com
- Docs: [https://razorpay.com/docs](https://razorpay.com/docs)

### Digitalchain Support:
- Check backend logs: `journalctl -u digitalchain-backend -f`
- Check payment status in database
- Review webhook logs in Razorpay Dashboard

---

## 📚 Additional Resources

- [Razorpay API Documentation](https://razorpay.com/docs/api/)
- [Razorpay Webhooks Guide](https://razorpay.com/docs/webhooks/)
- [Payment Gateway Security](https://razorpay.com/docs/security/)
- [Test Card Numbers](https://razorpay.com/docs/payments/payments/test-card-details/)

---

## ✨ Next Steps

After successful setup:

1. **Test in Test Mode**: Verify all flows work
2. **Train Your Team**: Show riders how to use payment collection
3. **Monitor Initial Transactions**: Watch first few payments closely
4. **Switch to Live Mode**: Once comfortable, use live credentials
5. **Set Up Settlements**: Configure bank account for settlements
6. **Enable Auto-settlements**: Automated daily payouts

---

**Last Updated**: November 28, 2025
**Version**: 1.0
