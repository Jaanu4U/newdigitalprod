"""Email sending utilities"""
import requests
from typing import Optional
from sqlalchemy.orm import Session
from . import models


def send_verification_email(
    db: Session,
    org: models.Organization,
    customer_email: str,
    customer_name: str,
    verification_token: str
) -> bool:
    """
    Send email verification email to customer
    Returns True if sent successfully, False otherwise
    """
    # Get platform email configuration
    platform = db.query(models.PlatformSettings).first()
    if not platform or not platform.email_config:
        print(f"Email config not found. Verification link: https://{org.slug}.digitalchain.in/verify-email?token={verification_token}")
        return False
    
    email_config = platform.email_config
    provider = email_config.get('provider', '').lower()
    
    if provider != 'mailgun':
        print(f"Unsupported email provider: {provider}")
        return False
    
    mailgun_config = email_config.get('mailgun', {})
    api_key = mailgun_config.get('api_key')
    domain = mailgun_config.get('domain')
    from_email = mailgun_config.get('from_email', f'noreply@{domain}')
    
    if not api_key or not domain:
        print("Mailgun credentials not configured")
        return False
    
    # Construct verification link
    verification_link = f"https://{org.slug}.digitalchain.in/verify-email?token={verification_token}"
    
    # Email subject and body
    subject = f"Verify your email - {org.name or org.slug}"
    
    html_body = f"""
    <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #7c3aed;">Welcome to {org.name or org.slug}!</h2>
                <p>Hi {customer_name},</p>
                <p>Thank you for registering with {org.name or org.slug}. Please verify your email address to complete your registration and access your customer portal.</p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="{verification_link}" 
                       style="background-color: #7c3aed; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
                        Verify Email Address
                    </a>
                </div>
                <p style="color: #666; font-size: 14px;">
                    Or copy and paste this link into your browser:<br>
                    <a href="{verification_link}">{verification_link}</a>
                </p>
                <p style="color: #666; font-size: 14px;">
                    This verification link will expire in 24 hours.
                </p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
                <p style="color: #999; font-size: 12px;">
                    If you didn't create an account with {org.name or org.slug}, please ignore this email.
                </p>
            </div>
        </body>
    </html>
    """
    
    text_body = f"""
Welcome to {org.name or org.slug}!

Hi {customer_name},

Thank you for registering with {org.name or org.slug}. Please verify your email address to complete your registration and access your customer portal.

Verify your email by clicking this link:
{verification_link}

This verification link will expire in 24 hours.

If you didn't create an account with {org.name or org.slug}, please ignore this email.
    """
    
    # Send via Mailgun
    try:
        response = requests.post(
            f"https://api.mailgun.net/v3/{domain}/messages",
            auth=("api", api_key),
            data={
                "from": f"{org.name or org.slug} <{from_email}>",
                "to": customer_email,
                "subject": subject,
                "text": text_body,
                "html": html_body
            },
            timeout=10
        )
        
        if response.status_code == 200:
            print(f"Verification email sent to {customer_email}")
            return True
        else:
            print(f"Failed to send email: {response.status_code} - {response.text}")
            return False
            
    except Exception as e:
        print(f"Error sending email: {e}")
        return False


def send_password_reset_email(
    db: Session,
    org: models.Organization,
    customer_email: str,
    customer_name: str,
    reset_token: str
) -> bool:
    """
    Send password reset email to customer
    Returns True if sent successfully, False otherwise
    """
    # Get platform email configuration
    platform = db.query(models.PlatformSettings).first()
    if not platform or not platform.email_config:
        print(f"Email config not found. Reset link: https://{org.slug}.digitalchain.in/reset-password?token={reset_token}")
        return False
    
    email_config = platform.email_config
    provider = email_config.get('provider', '').lower()
    
    if provider != 'mailgun':
        print(f"Unsupported email provider: {provider}")
        return False
    
    mailgun_config = email_config.get('mailgun', {})
    api_key = mailgun_config.get('api_key')
    domain = mailgun_config.get('domain')
    from_email = mailgun_config.get('from_email', f'noreply@{domain}')
    
    if not api_key or not domain:
        print("Mailgun credentials not configured")
        return False
    
    # Construct reset link
    reset_link = f"https://{org.slug}.digitalchain.in/reset-password?token={reset_token}"
    
    # Email subject and body
    subject = f"Password Reset Request - {org.name or org.slug}"
    
    html_body = f"""
    <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #7c3aed;">Password Reset Request</h2>
                <p>Hi {customer_name},</p>
                <p>We received a request to reset your password for your {org.name or org.slug} account.</p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="{reset_link}" 
                       style="background-color: #7c3aed; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
                        Reset Password
                    </a>
                </div>
                <p style="color: #666; font-size: 14px;">
                    Or copy and paste this link into your browser:<br>
                    <a href="{reset_link}">{reset_link}</a>
                </p>
                <p style="color: #666; font-size: 14px;">
                    This password reset link will expire in 1 hour.
                </p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
                <p style="color: #999; font-size: 12px;">
                    If you didn't request a password reset, please ignore this email. Your password will remain unchanged.
                </p>
            </div>
        </body>
    </html>
    """
    
    text_body = f"""
Password Reset Request

Hi {customer_name},

We received a request to reset your password for your {org.name or org.slug} account.

Reset your password by clicking this link:
{reset_link}

This password reset link will expire in 1 hour.

If you didn't request a password reset, please ignore this email. Your password will remain unchanged.
    """
    
    # Send via Mailgun
    try:
        response = requests.post(
            f"https://api.mailgun.net/v3/{domain}/messages",
            auth=("api", api_key),
            data={
                "from": f"{org.name or org.slug} <{from_email}>",
                "to": customer_email,
                "subject": subject,
                "text": text_body,
                "html": html_body
            },
            timeout=10
        )
        
        if response.status_code == 200:
            print(f"Password reset email sent to {customer_email}")
            return True
        else:
            print(f"Failed to send email: {response.status_code} - {response.text}")
            return False
            
    except Exception as e:
        print(f"Error sending email: {e}")
        return False
