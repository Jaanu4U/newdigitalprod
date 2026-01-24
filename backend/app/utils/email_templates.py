"""Professional email templates for DigitalChain"""

def get_order_accepted_customer_email(org_name: str, invoice_no: str, customer_name: str, rider_name: str, rider_phone: str, estimated_minutes: int, tracking_url: str, login_url: str) -> dict:
    """Email sent to customer when rider accepts their order"""
    
    subject = f"Your order {invoice_no} has been accepted - {org_name}"
    
    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .header {{ background-color: #4CAF50; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }}
            .content {{ background-color: #f9f9f9; padding: 30px; border-radius: 0 0 5px 5px; }}
            .info-box {{ background-color: white; padding: 15px; margin: 15px 0; border-left: 4px solid #4CAF50; }}
            .button {{ display: inline-block; padding: 12px 30px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 5px; margin: 10px 5px; }}
            .footer {{ text-align: center; padding: 20px; color: #666; font-size: 12px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>✓ Order Accepted</h1>
            </div>
            <div class="content">
                <p>Hello {customer_name},</p>
                
                <p>Great news! Your order <strong>{invoice_no}</strong> has been accepted by our delivery partner.</p>
                
                <div class="info-box">
                    <h3>Delivery Partner Details</h3>
                    <p><strong>Rider:</strong> {rider_name}</p>
                    <p><strong>Contact:</strong> {rider_phone}</p>
                    <p><strong>Estimated Delivery:</strong> {estimated_minutes} minutes</p>
                </div>
                
                <div style="text-align: center; margin: 30px 0;">
                    <a href="{tracking_url}" class="button">📍 Track Your Order</a>
                    <a href="{login_url}" class="button">🔐 Customer Portal</a>
                </div>
                
                <div class="info-box">
                    <h3>How to Track Your Order</h3>
                    <ol>
                        <li>Click the "Track Your Order" button above</li>
                        <li>Or login to the Customer Portal using your phone number</li>
                        <li>View real-time location and delivery status</li>
                    </ol>
                </div>
                
                <p>If you have any questions, please don't hesitate to contact us.</p>
                
                <p>Best regards,<br><strong>{org_name}</strong></p>
            </div>
            <div class="footer">
                <p>This is an automated message from {org_name}. Please do not reply to this email.</p>
            </div>
        </div>
    </body>
    </html>
    """
    
    return {"subject": subject, "html": html}


def get_order_completed_email(org_name: str, invoice_no: str, customer_name: str, customer_phone: str, 
                               amount: float, payment_method: str, items_html: str, 
                               completed_at: str, has_attachment: bool, is_customer: bool = False) -> dict:
    """Email sent when order is completed"""
    
    if is_customer:
        subject = f"Your order {invoice_no} has been delivered - {org_name}"
        greeting = f"Dear {customer_name},"
        thank_you = "<p>Thank you for choosing us! We hope you enjoy your order.</p>"
    else:
        subject = f"Order {invoice_no} completed - {org_name}"
        greeting = "Team,"
        thank_you = ""
    
    attachment_note = "<p><strong>📎 Delivery Proof:</strong> See attached image</p>" if has_attachment else ""
    
    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .header {{ background-color: #2196F3; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }}
            .content {{ background-color: #f9f9f9; padding: 30px; border-radius: 0 0 5px 5px; }}
            .info-box {{ background-color: white; padding: 15px; margin: 15px 0; border-left: 4px solid #2196F3; }}
            .items-table {{ width: 100%; border-collapse: collapse; margin: 15px 0; background: white; }}
            .items-table th {{ background-color: #2196F3; color: white; padding: 10px; text-align: left; }}
            .items-table td {{ padding: 10px; border-bottom: 1px solid #ddd; }}
            .total {{ font-size: 18px; font-weight: bold; color: #2196F3; }}
            .footer {{ text-align: center; padding: 20px; color: #666; font-size: 12px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>✓ Order Delivered Successfully</h1>
            </div>
            <div class="content">
                <p>{greeting}</p>
                
                <p>Order <strong>{invoice_no}</strong> has been successfully delivered.</p>
                
                <div class="info-box">
                    <h3>Order Summary</h3>
                    <p><strong>Invoice Number:</strong> {invoice_no}</p>
                    <p><strong>Customer:</strong> {customer_name}</p>
                    {f'<p><strong>Phone:</strong> {customer_phone}</p>' if customer_phone else ''}
                    <p><strong>Completed At:</strong> {completed_at}</p>
                </div>
                
                {items_html}
                
                <div class="info-box">
                    <p><strong>Payment Method:</strong> {payment_method}</p>
                    <p class="total">Total Amount: ₹{amount}</p>
                </div>
                
                {attachment_note}
                
                {thank_you}
                
                <p>Best regards,<br><strong>{org_name}</strong></p>
            </div>
            <div class="footer">
                <p>This is an automated message from {org_name}.</p>
            </div>
        </div>
    </body>
    </html>
    """
    
    return {"subject": subject, "html": html}


def format_items_html(items: list) -> str:
    """Format order items as HTML table"""
    if not items:
        return ""
    
    rows = ""
    for item in items:
        # Support both formats: {name, quantity, price} and {description, qty, rate}
        name = item.get('name') or item.get('description', 'N/A')
        quantity = item.get('quantity') or item.get('qty', 0)
        price = item.get('price') or item.get('rate', 0)
        total = quantity * price
        rows += f"""
        <tr>
            <td>{name}</td>
            <td style="text-align: center;">{quantity}</td>
            <td style="text-align: right;">₹{price:.2f}</td>
            <td style="text-align: right;">₹{total:.2f}</td>
        </tr>
        """
    
    html = f"""
    <table class="items-table">
        <thead>
            <tr>
                <th>Item</th>
                <th style="text-align: center;">Qty</th>
                <th style="text-align: right;">Rate</th>
                <th style="text-align: right;">Total</th>
            </tr>
        </thead>
        <tbody>
            {rows}
        </tbody>
    </table>
    """
    
    return html
