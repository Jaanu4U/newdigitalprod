import smtplib
import os
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.image import MIMEImage
from email.mime.base import MIMEBase
from email import encoders
from sqlalchemy.orm import Session
from typing import Optional, List
from ..models import PlatformSettings


def get_platform_email_config(db: Session) -> Optional[dict]:
    """Get platform email configuration from database"""
    settings = db.query(PlatformSettings).first()
    if settings and settings.email_config:
        return settings.email_config
    return None


def send_generic_email(
    db: Session,
    to_email: str,
    subject: str,
    html_body: str,
    from_fallback: str = "noreply@digitalchain.in",
    from_name: str = None,
    attachments: Optional[List[dict]] = None
) -> bool:
    """Send a generic email using platform email configuration (Mailgun or SMTP).
    
    Args:
        from_name: Sender display name (e.g., "Company Name")
        attachments: List of dicts with 'filepath' and optional 'filename' keys
    """
    try:
        email_config = get_platform_email_config(db)
        if not email_config:
            print("[Email] Platform email not configured")
            return False
        if email_config.get("enabled") is False:
            print("[Email] Platform email is disabled")
            return False

        provider = (email_config.get("provider") or "mailgun").lower()

        if provider == "mailgun":
            mailgun_config = email_config.get("mailgun", {})
            api_key = mailgun_config.get("api_key")
            domain = mailgun_config.get("domain")
            from_email = mailgun_config.get("from_email", from_fallback)

            if not api_key or not domain:
                print("[Email] Mailgun API key or domain not configured")
                return False

            import requests

            from_address = f"{from_name} <{from_email}>" if from_name else from_email
            
            data = {
                "from": from_address,
                "to": to_email,
                "subject": subject,
                "html": html_body
            }
            
            files = []
            if attachments:
                for att in attachments:
                    filepath = att.get('filepath')
                    if filepath and os.path.exists(filepath):
                        filename = att.get('filename') or os.path.basename(filepath)
                        files.append(("attachment", (filename, open(filepath, "rb"))))

            response = requests.post(
                f"https://api.mailgun.net/v3/{domain}/messages",
                auth=("api", api_key),
                data=data,
                files=files if files else None
            )

            if response.status_code == 200:
                print(f"[Email] Generic email sent to {to_email}")
                return True
            else:
                print(f"[Email] Failed to send via Mailgun: {response.status_code} - {response.text}")
                return False

        elif provider == "smtp":
            smtp_config = email_config.get("smtp", {})
            host = smtp_config.get("host")
            port = smtp_config.get("port", 587)
            username = smtp_config.get("username")
            password = smtp_config.get("password")
            from_email = smtp_config.get("from_email", from_fallback)
            use_tls = smtp_config.get("use_tls", True)

            if not all([host, username, password]):
                print("[Email] SMTP configuration incomplete")
                return False

            msg = MIMEMultipart("mixed")
            msg["Subject"] = subject
            msg["From"] = f"{from_name} <{from_email}>" if from_name else from_email
            msg["To"] = to_email
            
            # Add HTML body
            msg.attach(MIMEText(html_body, "html"))
            
            # Add attachments
            if attachments:
                for att in attachments:
                    filepath = att.get('filepath')
                    if filepath and os.path.exists(filepath):
                        filename = att.get('filename') or os.path.basename(filepath)
                        with open(filepath, 'rb') as f:
                            # Determine if it's an image
                            if filepath.lower().endswith(('.png', '.jpg', '.jpeg', '.gif')):
                                img = MIMEImage(f.read())
                                img.add_header('Content-Disposition', 'attachment', filename=filename)
                                msg.attach(img)
                            else:
                                part = MIMEBase('application', 'octet-stream')
                                part.set_payload(f.read())
                                encoders.encode_base64(part)
                                part.add_header('Content-Disposition', f'attachment; filename={filename}')
                                msg.attach(part)

            with smtplib.SMTP(host, port) as server:
                if use_tls:
                    server.starttls()
                server.login(username, password)
                server.send_message(msg)

            print(f"[Email] Generic email sent to {to_email} via SMTP")
            return True

        else:
            print(f"[Email] Unsupported provider: {provider}")
            return False

    except Exception as e:
        print(f"[Email] Error sending generic email: {str(e)}")
        return False


def send_verification_email(
    db: Session,
    to_email: str,
    verification_link: str,
    org_name: str
) -> bool:
    """
    Send email verification email using platform SMTP settings
    
    Args:
        db: Database session
        to_email: Recipient email address
        verification_link: Full URL for email verification
        org_name: Organization name for personalization
    
    Returns:
        True if email sent successfully, False otherwise
    """
    try:
        # Get platform email configuration
        email_config = get_platform_email_config(db)
        
        if not email_config:
            print(f"[Email] Platform email not configured")
            return False
        
        # Check if explicitly disabled (optional field)
        if email_config.get("enabled") is False:
            print(f"[Email] Platform email is disabled")
            return False
        
        provider = email_config.get("provider", "mailgun").lower()
        
        if provider == "mailgun":
            # For Mailgun API
            mailgun_config = email_config.get("mailgun", {})
            api_key = mailgun_config.get("api_key")
            domain = mailgun_config.get("domain")
            from_email = mailgun_config.get("from_email", "noreply@digitalchain.in")
            
            if not api_key or not domain:
                print("[Email] Mailgun API key or domain not configured")
                return False
            
            import requests
            
            # Send email via Mailgun API
            response = requests.post(
                f"https://api.mailgun.net/v3/{domain}/messages",
                auth=("api", api_key),
                data={
                    "from": from_email,
                    "to": to_email,
                    "subject": f"Verify your email for {org_name}",
                    "html": _get_verification_email_html(verification_link, org_name)
                }
            )
            
            if response.status_code == 200:
                print(f"[Email] Verification email sent to {to_email}")
                return True
            else:
                print(f"[Email] Failed to send via Mailgun: {response.status_code} - {response.text}")
                return False
        
        elif provider == "smtp":
            # For SMTP (fallback/default)
            smtp_config = email_config.get("smtp", {})
            host = smtp_config.get("host")
            port = smtp_config.get("port", 587)
            username = smtp_config.get("username")
            password = smtp_config.get("password")
            from_email = smtp_config.get("from_email", "noreply@digitalchain.in")
            use_tls = smtp_config.get("use_tls", True)
            
            if not all([host, username, password]):
                print("[Email] SMTP configuration incomplete")
                return False
            
            # Create message
            msg = MIMEMultipart("alternative")
            msg["Subject"] = f"Verify your email for {org_name}"
            msg["From"] = from_email
            msg["To"] = to_email
            
            # HTML content
            html_content = _get_verification_email_html(verification_link, org_name)
            msg.attach(MIMEText(html_content, "html"))
            
            # Send email
            with smtplib.SMTP(host, port) as server:
                if use_tls:
                    server.starttls()
                server.login(username, password)
                server.send_message(msg)
            
            print(f"[Email] Verification email sent to {to_email} via SMTP")
            return True
        
        else:
            print(f"[Email] Unsupported provider: {provider}")
            return False
            
    except Exception as e:
        print(f"[Email] Error sending verification email: {str(e)}")
        return False


def send_welcome_email(
    db: Session,
    to_email: str,
    org_name: str,
    org_slug: str,
    admin_name: str
) -> bool:
    """
    Send welcome email with login instructions and setup guide after email verification
    
    Args:
        db: Database session
        to_email: Recipient email address
        org_name: Organization name
        org_slug: Organization subdomain slug
        admin_name: Admin user name
    
    Returns:
        True if email sent successfully, False otherwise
    """
    try:
        # Get platform email configuration
        email_config = get_platform_email_config(db)
        
        if not email_config or not email_config.get("enabled"):
            print(f"[Email] Platform email not configured or disabled")
            return False
        
        provider = email_config.get("provider", "mailgun").lower()
        login_url = f"https://{org_slug}.digitalchain.in/login"
        
        if provider == "mailgun":
            mailgun_config = email_config.get("mailgun", {})
            api_key = mailgun_config.get("api_key")
            domain = mailgun_config.get("domain")
            from_email = mailgun_config.get("from_email", "noreply@digitalchain.in")
            
            if not api_key or not domain:
                print("[Email] Mailgun API key or domain not configured")
                return False
            
            import requests
            
            response = requests.post(
                f"https://api.mailgun.net/v3/{domain}/messages",
                auth=("api", api_key),
                data={
                    "from": f"DigitalChain <{from_email}>",
                    "to": to_email,
                    "subject": f"Welcome to DigitalChain - {org_name} Setup Guide",
                    "html": _get_welcome_email_html(org_name, org_slug, login_url, admin_name)
                }
            )
            
            if response.status_code == 200:
                print(f"[Email] Welcome email sent to {to_email}")
                return True
            else:
                print(f"[Email] Failed to send welcome email: {response.status_code} - {response.text}")
                return False
        
        elif provider == "smtp":
            smtp_config = email_config.get("smtp", {})
            host = smtp_config.get("host")
            port = smtp_config.get("port", 587)
            username = smtp_config.get("username")
            password = smtp_config.get("password")
            from_email = smtp_config.get("from_email", "noreply@digitalchain.in")
            use_tls = smtp_config.get("use_tls", True)
            
            if not all([host, username, password]):
                print("[Email] SMTP configuration incomplete")
                return False
            
            msg = MIMEMultipart("alternative")
            msg["Subject"] = f"Welcome to DigitalChain - {org_name} Setup Guide"
            msg["From"] = f"DigitalChain <{from_email}>"
            msg["To"] = to_email
            
            html_content = _get_welcome_email_html(org_name, org_slug, login_url, admin_name)
            msg.attach(MIMEText(html_content, "html"))
            
            with smtplib.SMTP(host, port) as server:
                if use_tls:
                    server.starttls()
                server.login(username, password)
                server.send_message(msg)
            
            print(f"[Email] Welcome email sent to {to_email} via SMTP")
            return True
        
        else:
            print(f"[Email] Unsupported provider: {provider}")
            return False
            
    except Exception as e:
        print(f"[Email] Error sending welcome email: {str(e)}")
        return False


def send_rider_welcome_email(
    db: Session,
    to_email: str,
    rider_name: str,
    temp_password: str,
    org_name: str,
    org_slug: str
) -> bool:
    """
    Send welcome email to any user with login credentials only (riders, staff, managers, etc.)
    
    Args:
        db: Database session
        to_email: User email address
        rider_name: User name
        temp_password: Temporary password
        org_name: Organization name
        org_slug: Organization subdomain slug
    
    Returns:
        True if email sent successfully, False otherwise
    """
    try:
        email_config = get_platform_email_config(db)
        
        if not email_config or not email_config.get("enabled"):
            print(f"[Email] Platform email not configured or disabled")
            return False
        
        provider = email_config.get("provider", "mailgun").lower()
        login_url = f"https://{org_slug}.digitalchain.in/login"
        
        if provider == "mailgun":
            mailgun_config = email_config.get("mailgun", {})
            api_key = mailgun_config.get("api_key")
            domain = mailgun_config.get("domain")
            from_email = mailgun_config.get("from_email", "noreply@digitalchain.in")
            
            if not api_key or not domain:
                print("[Email] Mailgun API key or domain not configured")
                return False
            
            import requests
            
            response = requests.post(
                f"https://api.mailgun.net/v3/{domain}/messages",
                auth=("api", api_key),
                data={
                    "from": f"{org_name} via DigitalChain <{from_email}>",
                    "to": to_email,
                    "subject": f"Welcome to {org_name} - Your Login Credentials",
                    "html": _get_rider_welcome_email_html(rider_name, to_email, temp_password, org_name, login_url)
                }
            )
            
            if response.status_code == 200:
                print(f"[Email] Welcome email sent to {to_email}")
                return True
            else:
                print(f"[Email] Failed to send welcome email: {response.status_code} - {response.text}")
                return False
        
        elif provider == "smtp":
            smtp_config = email_config.get("smtp", {})
            host = smtp_config.get("host")
            port = smtp_config.get("port", 587)
            username = smtp_config.get("username")
            password = smtp_config.get("password")
            from_email = smtp_config.get("from_email", "noreply@digitalchain.in")
            use_tls = smtp_config.get("use_tls", True)
            
            if not all([host, username, password]):
                print("[Email] SMTP configuration incomplete")
                return False
            
            msg = MIMEMultipart("alternative")
            msg["Subject"] = f"Welcome to {org_name} - Your Login Credentials"
            msg["From"] = f"{org_name} via DigitalChain <{from_email}>"
            msg["To"] = to_email
            
            html_content = _get_rider_welcome_email_html(rider_name, to_email, temp_password, org_name, login_url)
            msg.attach(MIMEText(html_content, "html"))
            
            with smtplib.SMTP(host, port) as server:
                if use_tls:
                    server.starttls()
                server.login(username, password)
                server.send_message(msg)
            
            print(f"[Email] Welcome email sent to {to_email} via SMTP")
            return True
        
        else:
            print(f"[Email] Unsupported provider: {provider}")
            return False
            
    except Exception as e:
        print(f"[Email] Error sending welcome email: {str(e)}")
        return False


def _get_verification_email_html(verification_link: str, org_name: str) -> str:
    """Generate HTML content for verification email"""
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verify Your Email</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
            <tr>
                <td align="center">
                    <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                        <!-- Header -->
                        <tr>
                            <td style="background-color: #2563eb; padding: 30px; text-align: center;">
                                <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Welcome to DigitalChain</h1>
                            </td>
                        </tr>
                        
                        <!-- Content -->
                        <tr>
                            <td style="padding: 40px 30px;">
                                <h2 style="color: #333333; margin: 0 0 20px 0; font-size: 20px;">Verify Your Email Address</h2>
                                <p style="color: #666666; line-height: 1.6; margin: 0 0 20px 0;">
                                    Thank you for registering your organization <strong>{org_name}</strong> with DigitalChain.
                                </p>
                                <p style="color: #666666; line-height: 1.6; margin: 0 0 30px 0;">
                                    To complete your registration and activate your account, please verify your email address by clicking the button below:
                                </p>
                                
                                <!-- Button -->
                                <table width="100%" cellpadding="0" cellspacing="0">
                                    <tr>
                                        <td align="center" style="padding: 0 0 30px 0;">
                                            <a href="{verification_link}" 
                                               style="display: inline-block; padding: 14px 40px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">
                                                Verify Email Address
                                            </a>
                                        </td>
                                    </tr>
                                </table>
                                
                                <p style="color: #666666; line-height: 1.6; margin: 0 0 10px 0; font-size: 14px;">
                                    Or copy and paste this link into your browser:
                                </p>
                                <p style="color: #2563eb; word-break: break-all; margin: 0 0 30px 0; font-size: 14px;">
                                    {verification_link}
                                </p>
                                
                                <p style="color: #999999; line-height: 1.6; margin: 0; font-size: 12px;">
                                    This verification link will expire in 24 hours. If you didn't create an account with DigitalChain, please ignore this email.
                                </p>
                            </td>
                        </tr>
                        
                        <!-- Footer -->
                        <tr>
                            <td style="background-color: #f8f9fa; padding: 20px 30px; text-align: center;">
                                <p style="color: #999999; margin: 0; font-size: 12px;">
                                    © 2025 DigitalChain. All rights reserved.
                                </p>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>
    """


def _get_welcome_email_html(org_name: str, org_slug: str, login_url: str, admin_name: str) -> str:
    """Generate HTML content for welcome email with setup instructions"""
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to DigitalChain</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
            <tr>
                <td align="center">
                    <table width="650" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                        <!-- Header -->
                        <tr>
                            <td style="background-color: #2563eb; padding: 40px 30px; text-align: center;">
                                <h1 style="color: #ffffff; margin: 0 0 10px 0; font-size: 28px;">🎉 Welcome to DigitalChain!</h1>
                                <p style="color: #e0e7ff; margin: 0; font-size: 16px;">Your account is now active</p>
                            </td>
                        </tr>
                        
                        <!-- Welcome Message -->
                        <tr>
                            <td style="padding: 40px 30px 30px 30px;">
                                <h2 style="color: #333333; margin: 0 0 15px 0; font-size: 22px;">Hello {admin_name},</h2>
                                <p style="color: #666666; line-height: 1.6; margin: 0 0 20px 0; font-size: 16px;">
                                    Congratulations! Your organization <strong>{org_name}</strong> has been successfully set up on DigitalChain.
                                </p>
                            </td>
                        </tr>

                        <!-- Login Details -->
                        <tr>
                            <td style="padding: 0 30px 30px 30px;">
                                <div style="background-color: #f0f9ff; border-left: 4px solid #2563eb; padding: 20px; border-radius: 4px;">
                                    <h3 style="color: #1e40af; margin: 0 0 15px 0; font-size: 18px;">🔐 Login to Your Dashboard</h3>
                                    <p style="color: #1e3a8a; margin: 0 0 10px 0; font-size: 14px;">
                                        <strong>Your Login URL:</strong><br/>
                                        <a href="{login_url}" style="color: #2563eb; text-decoration: none; font-size: 16px; font-weight: bold;">{login_url}</a>
                                    </p>
                                    <p style="color: #475569; margin: 10px 0 0 0; font-size: 13px;">
                                        💡 Bookmark this URL for quick access to your dashboard
                                    </p>
                                </div>
                            </td>
                        </tr>

                        <!-- Setup Guide -->
                        <tr>
                            <td style="padding: 0 30px 20px 30px;">
                                <h3 style="color: #333333; margin: 0 0 20px 0; font-size: 20px;">📋 Quick Setup Guide</h3>
                                
                                <!-- Step 1: Custom Domain -->
                                <div style="margin-bottom: 25px; padding: 20px; background-color: #fafafa; border-radius: 6px;">
                                    <h4 style="color: #2563eb; margin: 0 0 12px 0; font-size: 16px;">1️⃣ Custom Domain Setup (Optional)</h4>
                                    <p style="color: #666666; margin: 0 0 12px 0; line-height: 1.5; font-size: 14px;">
                                        Want to use your own domain instead of <strong>{org_slug}.digitalchain.in</strong>?
                                    </p>
                                    <div style="background-color: #ffffff; padding: 15px; border-radius: 4px; border: 1px solid #e5e7eb;">
                                        <p style="margin: 0 0 8px 0; color: #374151; font-size: 13px;"><strong>Add this A Record to your DNS:</strong></p>
                                        <table style="width: 100%; font-family: monospace; font-size: 12px;">
                                            <tr style="background-color: #f9fafb;">
                                                <td style="padding: 8px; border: 1px solid #e5e7eb; color: #6b7280;">Type</td>
                                                <td style="padding: 8px; border: 1px solid #e5e7eb; color: #6b7280;">Name</td>
                                                <td style="padding: 8px; border: 1px solid #e5e7eb; color: #6b7280;">Value</td>
                                                <td style="padding: 8px; border: 1px solid #e5e7eb; color: #6b7280;">TTL</td>
                                            </tr>
                                            <tr>
                                                <td style="padding: 8px; border: 1px solid #e5e7eb; color: #111827; font-weight: bold;">A</td>
                                                <td style="padding: 8px; border: 1px solid #e5e7eb; color: #111827;">@</td>
                                                <td style="padding: 8px; border: 1px solid #e5e7eb; color: #2563eb; font-weight: bold;">YOUR_SERVER_IP</td>
                                                <td style="padding: 8px; border: 1px solid #e5e7eb; color: #111827;">3600</td>
                                            </tr>
                                        </table>
                                        <p style="margin: 12px 0 0 0; color: #6b7280; font-size: 12px;">
                                            ℹ️ Contact support for your server IP address
                                        </p>
                                    </div>
                                </div>

                                <!-- Step 2: Email MX Records -->
                                <div style="margin-bottom: 25px; padding: 20px; background-color: #fafafa; border-radius: 6px;">
                                    <h4 style="color: #2563eb; margin: 0 0 12px 0; font-size: 16px;">2️⃣ Email Configuration (MX Records)</h4>
                                    <p style="color: #666666; margin: 0 0 12px 0; line-height: 1.5; font-size: 14px;">
                                        To send emails from your domain, add these MX records:
                                    </p>
                                    <div style="background-color: #ffffff; padding: 15px; border-radius: 4px; border: 1px solid #e5e7eb;">
                                        <table style="width: 100%; font-family: monospace; font-size: 12px;">
                                            <tr style="background-color: #f9fafb;">
                                                <td style="padding: 8px; border: 1px solid #e5e7eb; color: #6b7280;">Type</td>
                                                <td style="padding: 8px; border: 1px solid #e5e7eb; color: #6b7280;">Priority</td>
                                                <td style="padding: 8px; border: 1px solid #e5e7eb; color: #6b7280;">Value</td>
                                            </tr>
                                            <tr>
                                                <td style="padding: 8px; border: 1px solid #e5e7eb; color: #111827; font-weight: bold;">MX</td>
                                                <td style="padding: 8px; border: 1px solid #e5e7eb; color: #111827;">10</td>
                                                <td style="padding: 8px; border: 1px solid #e5e7eb; color: #2563eb;">mxa.mailgun.org</td>
                                            </tr>
                                            <tr>
                                                <td style="padding: 8px; border: 1px solid #e5e7eb; color: #111827; font-weight: bold;">MX</td>
                                                <td style="padding: 8px; border: 1px solid #e5e7eb; color: #111827;">10</td>
                                                <td style="padding: 8px; border: 1px solid #e5e7eb; color: #2563eb;">mxb.mailgun.org</td>
                                            </tr>
                                        </table>
                                        <p style="margin: 12px 0 0 0; color: #6b7280; font-size: 12px;">
                                            ℹ️ Configure email settings in Settings → Platform Settings
                                        </p>
                                    </div>
                                </div>

                                <!-- Step 3: Logo Upload -->
                                <div style="margin-bottom: 25px; padding: 20px; background-color: #fafafa; border-radius: 6px;">
                                    <h4 style="color: #2563eb; margin: 0 0 12px 0; font-size: 16px;">3️⃣ Upload Your Logo</h4>
                                    <p style="color: #666666; margin: 0 0 8px 0; line-height: 1.5; font-size: 14px;">
                                        Customize your brand by uploading your organization logo:
                                    </p>
                                    <ol style="margin: 8px 0 0 20px; padding: 0; color: #475569; font-size: 13px; line-height: 1.8;">
                                        <li>Go to <strong>Org Settings</strong> → <strong>Business Settings</strong></li>
                                        <li>Click on <strong>Upload Logo</strong></li>
                                        <li>Recommended size: 200x200px (PNG or JPG)</li>
                                        <li>Your logo will appear on invoices and emails</li>
                                    </ol>
                                </div>

                                <!-- Step 4: Compliance -->
                                <div style="margin-bottom: 25px; padding: 20px; background-color: #fafafa; border-radius: 6px;">
                                    <h4 style="color: #2563eb; margin: 0 0 12px 0; font-size: 16px;">4️⃣ Compliance Configuration</h4>
                                    <p style="color: #666666; margin: 0 0 8px 0; line-height: 1.5; font-size: 14px;">
                                        Set up your business compliance details:
                                    </p>
                                    <ul style="margin: 8px 0 0 20px; padding: 0; color: #475569; font-size: 13px; line-height: 1.8;">
                                        <li><strong>GST Number</strong> (if applicable)</li>
                                        <li><strong>PAN/Tax ID</strong></li>
                                        <li><strong>Business Registration Number</strong></li>
                                        <li><strong>Terms & Conditions</strong></li>
                                        <li><strong>Privacy Policy</strong></li>
                                    </ul>
                                    <p style="margin: 12px 0 0 0; color: #6b7280; font-size: 12px;">
                                        📍 Configure in: <strong>Org Settings → Business Settings → Compliance</strong>
                                    </p>
                                </div>

                                <!-- Step 5: Payment Settings -->
                                <div style="margin-bottom: 25px; padding: 20px; background-color: #fafafa; border-radius: 6px;">
                                    <h4 style="color: #2563eb; margin: 0 0 12px 0; font-size: 16px;">5️⃣ Payment Gateway Setup</h4>
                                    <p style="color: #666666; margin: 0 0 12px 0; line-height: 1.5; font-size: 14px;">
                                        Accept online payments by configuring your payment gateway:
                                    </p>
                                    <div style="background-color: #ffffff; padding: 15px; border-radius: 4px; border: 1px solid #e5e7eb;">
                                        <p style="margin: 0 0 10px 0; color: #374151; font-size: 13px;"><strong>Supported Providers:</strong></p>
                                        <ul style="margin: 0 0 10px 20px; padding: 0; color: #475569; font-size: 13px; line-height: 1.8;">
                                            <li><strong>Razorpay</strong> - Popular in India (INR)</li>
                                            <li><strong>Stripe</strong> - International payments</li>
                                            <li><strong>Cashfree</strong> - Indian businesses</li>
                                        </ul>
                                        <p style="margin: 12px 0 0 0; color: #6b7280; font-size: 12px;">
                                            📍 Setup: <strong>Org Settings → Payment Settings</strong><br/>
                                            You'll need: API Key, Secret Key, and Webhook URL
                                        </p>
                                    </div>
                                </div>
                            </td>
                        </tr>

                        <!-- CTA Button -->
                        <tr>
                            <td style="padding: 0 30px 40px 30px;" align="center">
                                <a href="{login_url}" 
                                   style="display: inline-block; padding: 16px 50px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px; box-shadow: 0 2px 4px rgba(37, 99, 235, 0.3);">
                                    Access Your Dashboard →
                                </a>
                            </td>
                        </tr>

                        <!-- Support Section -->
                        <tr>
                            <td style="padding: 0 30px 40px 30px;">
                                <div style="background-color: #fffbeb; border: 1px solid #fcd34d; padding: 20px; border-radius: 6px;">
                                    <h4 style="color: #92400e; margin: 0 0 10px 0; font-size: 15px;">💬 Need Help?</h4>
                                    <p style="color: #78350f; margin: 0; font-size: 13px; line-height: 1.6;">
                                        Our support team is here to help you get started. Contact us anytime:<br/>
                                        📧 Email: <a href="mailto:support@digitalchain.in" style="color: #2563eb;">support@digitalchain.in</a><br/>
                                        📚 Documentation: <a href="https://docs.digitalchain.in" style="color: #2563eb;">docs.digitalchain.in</a>
                                    </p>
                                </div>
                            </td>
                        </tr>
                        
                        <!-- Footer -->
                        <tr>
                            <td style="background-color: #f8f9fa; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb;">
                                <p style="color: #6b7280; margin: 0 0 10px 0; font-size: 13px;">
                                    <strong>{org_name}</strong> on DigitalChain
                                </p>
                                <p style="color: #9ca3af; margin: 0; font-size: 12px;">
                                    © 2025 DigitalChain. All rights reserved.
                                </p>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>
    """


def _get_rider_welcome_email_html(rider_name: str, email: str, temp_password: str, org_name: str, login_url: str) -> str:
    """Generate HTML content for user welcome email with login credentials only (all user types)"""
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to {org_name}</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
            <tr>
                <td align="center">
                    <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                        <!-- Header -->
                        <tr>
                            <td style="background-color: #2563eb; padding: 40px 30px; text-align: center;">
                                <h1 style="color: #ffffff; margin: 0 0 10px 0; font-size: 28px;">Welcome to {org_name}!</h1>
                                <p style="color: #e0e7ff; margin: 0; font-size: 16px;">Your account has been created</p>
                            </td>
                        </tr>
                        
                        <!-- Welcome Message -->
                        <tr>
                            <td style="padding: 40px 30px 20px 30px;">
                                <h2 style="color: #333333; margin: 0 0 15px 0; font-size: 22px;">Hello {rider_name},</h2>
                                <p style="color: #666666; line-height: 1.6; margin: 0 0 30px 0; font-size: 16px;">
                                    You have been added as a user for <strong>{org_name}</strong>. Below are your login credentials to access the system.
                                </p>
                            </td>
                        </tr>

                        <!-- Login Credentials -->
                        <tr>
                            <td style="padding: 0 30px 30px 30px;">
                                <div style="background-color: #f0f9ff; border: 2px solid #2563eb; padding: 25px; border-radius: 8px;">
                                    <h3 style="color: #1e40af; margin: 0 0 20px 0; font-size: 18px; text-align: center;">🔐 Your Login Credentials</h3>
                                    
                                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 20px;">
                                        <tr>
                                            <td style="padding: 12px; background-color: #ffffff; border-radius: 4px; margin-bottom: 10px;">
                                                <p style="margin: 0 0 5px 0; color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Email / Username</p>
                                                <p style="margin: 0; color: #111827; font-size: 16px; font-weight: bold; font-family: monospace;">{email}</p>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td style="padding: 12px; background-color: #ffffff; border-radius: 4px; margin-top: 10px;">
                                                <p style="margin: 0 0 5px 0; color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Temporary Password</p>
                                                <p style="margin: 0; color: #dc2626; font-size: 18px; font-weight: bold; font-family: monospace; letter-spacing: 1px;">{temp_password}</p>
                                            </td>
                                        </tr>
                                    </table>

                                    <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; border-radius: 4px; margin-top: 15px;">
                                        <p style="margin: 0; color: #92400e; font-size: 13px; line-height: 1.6;">
                                            <strong>⚠️ Important:</strong> Please change your password after your first login for security reasons.
                                        </p>
                                    </div>
                                </div>
                            </td>
                        </tr>

                        <!-- Login URL -->
                        <tr>
                            <td style="padding: 0 30px 30px 30px;">
                                <div style="background-color: #f8f9fa; padding: 20px; border-radius: 6px; text-align: center;">
                                    <p style="margin: 0 0 15px 0; color: #6b7280; font-size: 14px;">Access your dashboard at:</p>
                                    <a href="{login_url}" style="color: #2563eb; font-size: 16px; font-weight: bold; text-decoration: none; word-break: break-all;">{login_url}</a>
                                </div>
                            </td>
                        </tr>

                        <!-- CTA Button -->
                        <tr>
                            <td style="padding: 0 30px 40px 30px;" align="center">
                                <a href="{login_url}" 
                                   style="display: inline-block; padding: 16px 50px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px; box-shadow: 0 2px 4px rgba(37, 99, 235, 0.3);">
                                    Login Now →
                                </a>
                            </td>
                        </tr>

                        <!-- Support Section -->
                        <tr>
                            <td style="padding: 0 30px 40px 30px;">
                                <div style="background-color: #fffbeb; border: 1px solid #fcd34d; padding: 20px; border-radius: 6px;">
                                    <h4 style="color: #92400e; margin: 0 0 10px 0; font-size: 15px;">💬 Need Help?</h4>
                                    <p style="color: #78350f; margin: 0; font-size: 13px; line-height: 1.6;">
                                        If you have any questions or need assistance, please contact your administrator at <strong>{org_name}</strong>.
                                    </p>
                                </div>
                            </td>
                        </tr>
                        
                        <!-- Footer -->
                        <tr>
                            <td style="background-color: #f8f9fa; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb;">
                                <p style="color: #6b7280; margin: 0 0 10px 0; font-size: 13px;">
                                    <strong>{org_name}</strong> powered by DigitalChain
                                </p>
                                <p style="color: #9ca3af; margin: 0; font-size: 12px;">
                                    © 2025 DigitalChain. All rights reserved.
                                </p>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>
    """
