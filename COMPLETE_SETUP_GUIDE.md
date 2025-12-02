# DigitalChain Production Server - Complete Setup Guide

**Last Updated:** December 1, 2025  
**Server:** Digitalchain-prod (Ubuntu 24.04)  
**Public IP:** 4.247.144.42  
**Domain:** digitalchain.in

This document provides step-by-step instructions for setting up the complete DigitalChain production environment from scratch.

---

## Table of Contents

1. [System Information](#system-information)
2. [Prerequisites](#prerequisites)
3. [DNS Configuration](#dns-configuration)
4. [Step 1: System Dependencies Installation](#step-1-system-dependencies-installation)
5. [Step 2: PostgreSQL Database Setup](#step-2-postgresql-database-setup)
6. [Step 3: Backend (FastAPI) Setup](#step-3-backend-fastapi-setup)
7. [Step 4: Admin Portal (Next.js) Setup](#step-4-admin-portal-nextjs-setup)
8. [Step 5: Nginx Configuration](#step-5-nginx-configuration)
9. [Step 6: SSL Certificates (Let's Encrypt)](#step-6-ssl-certificates-lets-encrypt)
10. [Step 7: Systemd Services Configuration](#step-7-systemd-services-configuration)
11. [Step 8: Verification & Testing](#step-8-verification--testing)
12. [Troubleshooting](#troubleshooting)
13. [Maintenance Commands](#maintenance-commands)

---

## System Information

### Current Server Setup (December 1, 2025)
```
OS: Ubuntu 24.04 LTS
RAM: 8GB+
CPU: 4 cores
Hostname: Digitalchain-prod
Public IP: 4.247.144.42
User: jugesh
```

### Installed Software Versions (Verified December 1, 2025)
```
Node.js: v20.19.6 ✅
npm: 10.8.2 ✅
Python: 3.12.3 ✅
PostgreSQL: 16.10 ✅
Nginx: 1.24.0 (Active and Running) ✅
Certbot: 2.9.0 (Auto-renewal timer enabled) ✅
```

### Service Status
```
✅ digitalchain-backend.service - Active (Running) on port 8000
✅ digitalchain-admin.service - Active (Running) on port 3000
✅ nginx.service - Active (Running)
✅ postgresql.service - Active (Running)
✅ certbot.timer - Active (Waiting for next renewal check)
```

### SSL/TLS Status
```
✅ SSL Certificates: Installed (Expires: March 1, 2026)
✅ HTTP Server: Running on port 80 (redirects to HTTPS)
✅ HTTPS Server: Running on port 443
✅ Nginx Configuration: Valid and active with SSL
✅ Certificate Domains: digitalchain.in, *.digitalchain.in
```

---

## Prerequisites

- Ubuntu 22.04 LTS or 24.04 LTS
- Root or sudo access
- Domain name with DNS access (digitalchain.in)
- Minimum 8GB RAM, 4 CPU cores
- 50GB+ storage

---

## DNS Configuration

### Required DNS Records

Configure the following DNS records before proceeding:

```
Type    Name                    Value           TTL
----    --------------------    -----------     -----
A       digitalchain.in         4.247.144.42    300
A       *.digitalchain.in       4.247.144.42    300
A       api.digitalchain.in     4.247.144.42    300
```

### Verification

```bash
# Check DNS propagation
dig digitalchain.in +short
dig api.digitalchain.in +short
dig jugesh.digitalchain.in +short

# Check your public IP
curl -s ifconfig.me
```

**Status:** ✅ DNS Configured (Verified December 1, 2025)

---

## Step 1: System Dependencies Installation

### 1.1 Update System

```bash
sudo apt update && sudo apt upgrade -y
```

### 1.2 Install Node.js 20.x

```bash
# Add Node.js repository
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

# Install Node.js
sudo apt install -y nodejs

# Verify installation
node --version  # Should show v20.19.6
npm --version   # Should show 10.8.2
```

**Status:** ✅ Installed

### 1.3 Install Python and Build Tools

```bash
# Install Python 3.12, PostgreSQL, Nginx, Certbot, and build tools
sudo apt install -y \
    python3 \
    python3-venv \
    python3-pip \
    postgresql \
    postgresql-contrib \
    nginx \
    certbot \
    python3-certbot-nginx \
    build-essential \
    libpq-dev
```

**Status:** ✅ Installed

### 1.4 Verify Installations

```bash
python3 --version     # Should show 3.12.3
psql --version        # Should show PostgreSQL 16.10
nginx -v              # Should show nginx/1.24.0
certbot --version     # Should show certbot 2.9.0
```

---

## Step 2: PostgreSQL Database Setup

### 2.1 Create Database User

```bash
sudo -u postgres psql -c "CREATE USER dcuser WITH PASSWORD 'DigitalChain2024Prod';"
```

### 2.2 Create Database

```bash
sudo -u postgres psql -c "CREATE DATABASE digitalchain OWNER dcuser;"
```

### 2.3 Grant Privileges

```bash
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE digitalchain TO dcuser;"
sudo -u postgres psql -d digitalchain -c "GRANT ALL ON SCHEMA public TO dcuser;"
```

### 2.4 Test Database Connection

```bash
PGPASSWORD='DigitalChain2024Prod' psql -h 127.0.0.1 -U dcuser -d digitalchain -c "SELECT version();"
```

**Expected Output:**
```
PostgreSQL 16.10 (Ubuntu 16.10-0ubuntu0.24.04.1) on x86_64-pc-linux-gnu...
```

**Status:** ✅ Database Created

### Database Credentials

```
Database: digitalchain
User: dcuser
Password: DigitalChain2024Prod
Host: 127.0.0.1
Port: 5432
```

---

## Step 3: Backend (FastAPI) Setup

### 3.1 Navigate to Backend Directory

```bash
cd /home/jugesh/digitalchain/newdigitalprod/backend
```

### 3.2 Create Python Virtual Environment

```bash
python3 -m venv .venv
source .venv/bin/activate
```

### 3.3 Upgrade pip

```bash
pip install --upgrade pip
```

### 3.4 Install Python Dependencies

```bash
pip install -r requirements.txt
```

**Required packages (from requirements.txt):**
```
fastapi==0.115.0
uvicorn[standard]==0.30.6
SQLAlchemy==2.0.34
psycopg2-binary==2.9.9
pydantic[email]==2.8.2
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
python-multipart==0.0.9
alembic==1.13.2
httpx==0.27.2
requests==2.31.0
qrcode==7.4.2
pillow==10.4.0
razorpay==1.4.1
pandas==2.3.3
openpyxl==3.1.5
fpdf2==2.8.5
```

### 3.5 Configure Environment Variables

Edit `/home/jugesh/digitalchain/newdigitalprod/backend/.env`:

```bash
DATABASE_URL=postgresql+psycopg2://dcuser:DigitalChain2024Prod@127.0.0.1:5432/digitalchain
JWT_SECRET=dc_prod_jwt_secret_2024_secure_key_12345
REFRESH_SECRET=dc_prod_refresh_secret_2024_secure_key_67890
JWT_EXPIRES_IN=604800
```

### 3.6 Initialize Database Schema

```bash
cd /home/jugesh/digitalchain/newdigitalprod/backend
source .venv/bin/activate
python -c "from app.db import engine, Base; from app.models import *; Base.metadata.create_all(engine); print('Database tables created successfully')"
```

**Expected Output:**
```
Database tables created successfully
```

### 3.7 Test Backend Manually (Optional)

```bash
cd /home/jugesh/digitalchain/newdigitalprod/backend
source .venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
# Press Ctrl+C to stop
```

**Status:** ✅ Backend Configured

---

## Step 4: Admin Portal (Next.js) Setup

### 4.1 Navigate to Admin Portal Directory

```bash
cd /home/jugesh/digitalchain/newdigitalprod/admin-portal
```

### 4.2 Install Node Dependencies

```bash
npm install
```

### 4.3 Configure Environment Variables

Edit `/home/jugesh/digitalchain/newdigitalprod/admin-portal/.env.local`:

```bash
NEXT_PUBLIC_API_BASE_URL=https://api.digitalchain.in
NEXT_PUBLIC_WS_URL=wss://api.digitalchain.in
```

### 4.4 Build for Production

```bash
npm run build
```

**Expected Output:**
```
✓ Compiled successfully
✓ Collecting page data
✓ Generating static pages
✓ Finalizing page optimization
```

### 4.5 Test Admin Portal Manually (Optional)

```bash
npm run start
# Press Ctrl+C to stop
```

**Status:** ✅ Admin Portal Built

---

## Step 5: Nginx Configuration

### 5.1 Create Initial Nginx Configuration

Create `/etc/nginx/sites-available/digitalchain`:

```bash
sudo bash -c 'cat > /etc/nginx/sites-available/digitalchain << "EOF"
server {
    listen 80;
    server_name digitalchain.in *.digitalchain.in api.digitalchain.in;
    
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }
    
    location / {
        return 301 https://\$host\$request_uri;
    }
}
EOF'
```

### 5.2 Enable Configuration

```bash
sudo ln -sf /etc/nginx/sites-available/digitalchain /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
```

### 5.3 Test and Reload Nginx

```bash
sudo nginx -t
sudo systemctl reload nginx
```

**Expected Output:**
```
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

**Verification:**
```bash
# Check Nginx status
sudo systemctl status nginx

# Test HTTP to HTTPS redirect
curl -I http://digitalchain.in
# Should return: HTTP/1.1 301 Moved Permanently
```

**Status:** ✅ Nginx Configured and Running
- HTTP server active on port 80
- HTTPS redirect configured (301)
- Configuration syntax valid
- Service enabled and active

---

## Step 6: SSL Certificates (Let's Encrypt)

### 6.1 Wildcard Certificate with Manual DNS Challenge

For wildcard certificates (*.digitalchain.in), you need to use manual DNS challenge:

```bash
sudo certbot certonly --manual --preferred-challenges dns \
  -d digitalchain.in \
  -d "*.digitalchain.in" \
  --agree-tos \
  --email jugeshrastogi@gmail.com
```

### 6.2 Add DNS TXT Records

When prompted, add these DNS TXT records to your domain:

```
Type    Name                           Value
----    --------------------------    ----------------------------------
TXT     _acme-challenge.digitalchain.in    [value provided by certbot]
```

**Note:** You may need to add 2 TXT records with the same name for wildcard certificates.

### 6.3 Verify DNS TXT Records

Before pressing Enter in certbot, verify the TXT records:

```bash
dig _acme-challenge.digitalchain.in TXT +short
```

Or use online tool: https://toolbox.googleapps.com/apps/dig/

### 6.4 Complete Certificate Installation

After DNS verification, certbot will issue certificates:

```
Certificates saved to:
/etc/letsencrypt/live/digitalchain.in/fullchain.pem
/etc/letsencrypt/live/digitalchain.in/privkey.pem
```

### 6.5 Update Nginx for HTTPS

Create complete Nginx configuration with SSL:

```bash
sudo bash -c 'cat > /etc/nginx/sites-available/digitalchain << "EOF"
# Rate limiting
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=general_limit:10m rate=30r/s;

# Upstream Backend API
upstream backend_api {
    server 127.0.0.1:8000;
    keepalive 32;
}

# Upstream Admin Portal
upstream admin_portal {
    server 127.0.0.1:3000;
    keepalive 32;
}

# API Server (api.digitalchain.in)
server {
    listen 443 ssl http2;
    server_name api.digitalchain.in;

    ssl_certificate /etc/letsencrypt/live/digitalchain.in/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/digitalchain.in/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    client_max_body_size 50M;
    
    # WebSocket support
    location /ws {
        proxy_pass http://backend_api;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }
    
    # API endpoints
    location / {
        limit_req zone=api_limit burst=20 nodelay;
        
        proxy_pass http://backend_api;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
    }
}

# Admin Portal - Main Domain and Subdomains
server {
    listen 443 ssl http2;
    server_name digitalchain.in *.digitalchain.in;
    
    # Exclude api subdomain
    if ($host = api.digitalchain.in) {
        return 444;
    }

    ssl_certificate /etc/letsencrypt/live/digitalchain.in/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/digitalchain.in/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    client_max_body_size 50M;

    location / {
        limit_req zone=general_limit burst=50 nodelay;
        
        proxy_pass http://admin_portal;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

# HTTP to HTTPS redirect
server {
    listen 80;
    server_name digitalchain.in *.digitalchain.in api.digitalchain.in;
    return 301 https://$host$request_uri;
}
EOF'
```

### 6.6 Test and Reload Nginx

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### 6.7 Setup Auto-Renewal Monitoring

Since wildcard certificates require manual DNS challenge, we've set up an automated monitoring system that will send email reminders when renewal is needed.

#### Create SSL Renewal Monitoring Script

The script is located at `/opt/digitalchain/ssl-renewal-dns-hook.sh` and performs the following:
- Checks certificate expiry daily
- Sends email reminders at 30, 14, 7, and 3 days before expiry
- Provides step-by-step renewal instructions
- Logs all checks to `/var/log/digitalchain-ssl-renewal.log`

#### Systemd Timer Configuration

The monitoring runs via systemd timer:

```bash
# Check timer status
sudo systemctl status ssl-renewal-check.timer

# View next scheduled run
sudo systemctl list-timers ssl-renewal-check.timer

# View monitoring logs
sudo tail -f /var/log/digitalchain-ssl-renewal.log
```

#### Email Notifications Setup (Optional)

To receive email notifications, install mailutils:

```bash
sudo apt-get install mailutils
```

Configure your email settings when prompted. The script will automatically send renewal reminders to `jugeshr@gmail.com`.

#### Manual Test

To test the monitoring script:

```bash
sudo /opt/digitalchain/ssl-renewal-dns-hook.sh
```

**Current Status (December 1, 2025):**
- ✅ SSL Certificates: **INSTALLED** - Valid until March 1, 2026
- ✅ Auto-Renewal Monitoring: **ACTIVE** - Daily checks enabled
- ✅ Systemd Timer: Running (next check: daily at midnight UTC)
- ✅ Nginx: Running with HTTPS configuration
- ✅ DNS: Configured correctly (verified)
- ✅ HTTPS Endpoints: Active and responding
  - https://api.digitalchain.in/v1/health ✅
  - https://digitalchain.in ✅
  - https://*.digitalchain.in (wildcard) ✅

**Certificate Details:**
- Certificate: `/etc/letsencrypt/live/digitalchain.in/fullchain.pem`
- Private Key: `/etc/letsencrypt/live/digitalchain.in/privkey.pem`
- Domains: digitalchain.in, *.digitalchain.in
- Expiry: March 1, 2026 (89 days remaining)
- Issuer: Let's Encrypt
- Days Remaining: 89 (as of December 1, 2025)

**Renewal Process (When Reminder Received):**
1. You will receive email reminder at 30, 14, 7, and 3 days before expiry
2. SSH to server: `ssh jugesh@4.247.144.42`
3. Run certbot: `sudo certbot certonly --manual --preferred-challenges dns -d digitalchain.in -d "*.digitalchain.in"`
4. Update DNS TXT records as instructed
5. Verify DNS: `dig @8.8.8.8 _acme-challenge.digitalchain.in TXT +short`
6. Complete renewal and reload Nginx: `sudo systemctl reload nginx`

---

## Step 7: Systemd Services Configuration

### 7.1 Create Backend Service

Create `/etc/systemd/system/digitalchain-backend.service`:

```bash
sudo bash -c 'cat > /etc/systemd/system/digitalchain-backend.service << "EOF"
[Unit]
Description=DigitalChain Backend API
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=jugesh
Group=jugesh
WorkingDirectory=/home/jugesh/digitalchain/newdigitalprod/backend
Environment="PATH=/home/jugesh/digitalchain/newdigitalprod/backend/.venv/bin:/usr/local/bin:/usr/bin:/bin"
Environment="DATABASE_URL=postgresql+psycopg2://dcuser:DigitalChain2024Prod@127.0.0.1:5432/digitalchain"
Environment="JWT_SECRET=dc_prod_jwt_secret_2024_secure_key_12345"
Environment="REFRESH_SECRET=dc_prod_refresh_secret_2024_secure_key_67890"
ExecStart=/home/jugesh/digitalchain/newdigitalprod/backend/.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF'
```

### 7.2 Create Admin Portal Service

Create `/etc/systemd/system/digitalchain-admin.service`:

```bash
sudo bash -c 'cat > /etc/systemd/system/digitalchain-admin.service << "EOF"
[Unit]
Description=DigitalChain Admin Portal
After=network.target

[Service]
Type=simple
User=jugesh
Group=jugesh
WorkingDirectory=/home/jugesh/digitalchain/newdigitalprod/admin-portal
Environment="PATH=/usr/bin:/bin"
Environment="NODE_ENV=production"
Environment="NEXT_PUBLIC_API_BASE_URL=https://api.digitalchain.in"
Environment="NEXT_PUBLIC_WS_URL=wss://api.digitalchain.in"
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF'
```

### 7.3 Enable and Start Services

```bash
# Reload systemd daemon
sudo systemctl daemon-reload

# Enable services to start on boot
sudo systemctl enable digitalchain-backend
sudo systemctl enable digitalchain-admin

# Start services
sudo systemctl start digitalchain-backend
sudo systemctl start digitalchain-admin
```

### 7.4 Check Service Status

```bash
# Check backend status
sudo systemctl status digitalchain-backend

# Check admin portal status
sudo systemctl status digitalchain-admin
```

**Status:** ✅ Services Created and Running

---

## Step 8: Verification & Testing

### 8.1 Check Service Health

```bash
# Backend health check
curl http://localhost:8000/v1/health
# Expected: {"status":"OK","timestamp":1764602679.4260285}

# Admin portal check
curl -s http://localhost:3000 | head -10
# Expected: HTML content
```

### 8.2 Check Service Status

```bash
sudo systemctl status digitalchain-backend --no-pager
sudo systemctl status digitalchain-admin --no-pager
sudo systemctl status nginx --no-pager
sudo systemctl status postgresql --no-pager
```

### 8.3 Check Logs

```bash
# Backend logs
sudo journalctl -u digitalchain-backend -f

# Admin portal logs
sudo journalctl -u digitalchain-admin -f

# Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### 8.4 Test Public Access (After SSL Setup)

```bash
# Test API endpoint
curl https://api.digitalchain.in/v1/health

# Test admin portal
curl https://digitalchain.in

# Test subdomain
curl https://jugesh.digitalchain.in
```

**Status:** ✅ All Services Running Successfully

---

## Troubleshooting

### Backend Won't Start

```bash
# Check logs for errors
sudo journalctl -u digitalchain-backend -n 50 --no-pager

# Common issues:
# 1. Missing Python packages - install them:
source /home/jugesh/digitalchain/newdigitalprod/backend/.venv/bin/activate
pip install <missing-package>

# 2. Database connection issues - test connection:
PGPASSWORD='DigitalChain2024Prod' psql -h 127.0.0.1 -U dcuser -d digitalchain -c "SELECT 1;"

# 3. Port already in use - check what's using port 8000:
sudo ss -tulpn | grep 8000
```

### Admin Portal Issues

```bash
# Check logs
sudo journalctl -u digitalchain-admin -n 50 --no-pager

# Rebuild if needed
cd /home/jugesh/digitalchain/newdigitalprod/admin-portal
npm run build
sudo systemctl restart digitalchain-admin
```

### Nginx Issues

```bash
# Test configuration
sudo nginx -t

# Check error logs
sudo tail -f /var/log/nginx/error.log

# Reload configuration
sudo systemctl reload nginx
```

### Database Issues

```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# View database logs
sudo tail -f /var/log/postgresql/postgresql-16-main.log

# Restart PostgreSQL
sudo systemctl restart postgresql
```

---

## Maintenance Commands

### Restart All Services

```bash
sudo systemctl restart digitalchain-backend
sudo systemctl restart digitalchain-admin
sudo systemctl reload nginx
```

### View Logs

```bash
# Real-time backend logs
sudo journalctl -u digitalchain-backend -f

# Real-time admin portal logs
sudo journalctl -u digitalchain-admin -f

# Last 100 lines of backend logs
sudo journalctl -u digitalchain-backend -n 100 --no-pager
```

### Update Application Code

```bash
cd /home/jugesh/digitalchain/newdigitalprod
git pull origin main

# Update backend
cd backend
source .venv/bin/activate
pip install -r requirements.txt
sudo systemctl restart digitalchain-backend

# Update admin portal
cd ../admin-portal
npm install
npm run build
sudo systemctl restart digitalchain-admin
```

### Database Backup

```bash
# Create backup directory
sudo mkdir -p /opt/backups/digitalchain

# Backup database
PGPASSWORD='DigitalChain2024Prod' pg_dump -h 127.0.0.1 -U dcuser digitalchain | gzip > /opt/backups/digitalchain/db_$(date +%Y%m%d_%H%M%S).sql.gz

# Backup uploads
tar -czf /opt/backups/digitalchain/uploads_$(date +%Y%m%d_%H%M%S).tar.gz -C /home/jugesh/digitalchain/newdigitalprod/backend uploads/
```

### SSL Certificate Renewal

```bash
# Manual renewal
sudo certbot renew

# Test renewal
sudo certbot renew --dry-run

# Check certificate expiry
sudo certbot certificates
```

---

## Quick Reference

### Service Commands

```bash
# Status
sudo systemctl status digitalchain-backend digitalchain-admin nginx postgresql

# Start
sudo systemctl start digitalchain-backend digitalchain-admin

# Stop
sudo systemctl stop digitalchain-backend digitalchain-admin

# Restart
sudo systemctl restart digitalchain-backend digitalchain-admin

# Enable on boot
sudo systemctl enable digitalchain-backend digitalchain-admin

# Disable on boot
sudo systemctl disable digitalchain-backend digitalchain-admin
```

### File Locations

```
Application Code:          /home/jugesh/digitalchain/newdigitalprod/
Backend:                   /home/jugesh/digitalchain/newdigitalprod/backend/
Admin Portal:              /home/jugesh/digitalchain/newdigitalprod/admin-portal/
Backend Venv:              /home/jugesh/digitalchain/newdigitalprod/backend/.venv/
Backend .env:              /home/jugesh/digitalchain/newdigitalprod/backend/.env
Admin .env:                /home/jugesh/digitalchain/newdigitalprod/admin-portal/.env.local
Nginx Config:              /etc/nginx/sites-available/digitalchain
SSL Certificates:          /etc/letsencrypt/live/digitalchain.in/
Backend Service:           /etc/systemd/system/digitalchain-backend.service
Admin Service:             /etc/systemd/system/digitalchain-admin.service
SSL Renewal Script:        /opt/digitalchain/ssl-renewal-dns-hook.sh
SSL Renewal Service:       /etc/systemd/system/ssl-renewal-check.service
SSL Renewal Timer:         /etc/systemd/system/ssl-renewal-check.timer
SSL Renewal Log:           /var/log/digitalchain-ssl-renewal.log
```

### Database Access

```bash
# Connect to database
PGPASSWORD='DigitalChain2024Prod' psql -h 127.0.0.1 -U dcuser -d digitalchain

# Run query
PGPASSWORD='DigitalChain2024Prod' psql -h 127.0.0.1 -U dcuser -d digitalchain -c "SELECT COUNT(*) FROM organizations;"
```

### Network Ports

```
Backend API:          8000 (internal)
Admin Portal:         3000 (internal)
PostgreSQL:           5432 (internal)
HTTP:                 80 (external → redirects to 443)
HTTPS:                443 (external)
```

---

## Production Checklist

**Completed Items:**
- [x] DNS configured correctly (verified: digitalchain.in → 4.247.144.42)
- [x] System dependencies installed (Node.js, Python, PostgreSQL, Nginx, Certbot)
- [x] PostgreSQL database created and tested
- [x] Backend application configured and running
- [x] Admin portal built and running
- [x] Nginx configured with HTTPS and SSL certificates
- [x] Systemd services created and enabled (auto-start on boot)
- [x] Services running successfully (verified December 1, 2025)
- [x] Backend health check passing
- [x] SSL certificates installed (Expires: March 1, 2026)
- [x] HTTPS endpoints verified and working
- [x] SSL renewal monitoring configured (daily checks with email reminders)

**Pending Items:**
- [x] SuperAdmin user created (admin@digitalchain.in)
- [ ] Change default SuperAdmin password
- [ ] Firewall configured (UFW)
- [ ] Backup script configured
- [ ] First organization created
- [ ] Monitoring setup (optional)
- [ ] Email notifications setup (mailutils for SSL reminders)

**Current System Health:**
```
Backend API:          ✅ Healthy (https://api.digitalchain.in/v1/health)
Admin Portal:         ✅ Running (https://digitalchain.in)
PostgreSQL:           ✅ Running
Nginx:                ✅ Running with SSL
SSL Certificate:      ✅ Valid (89 days remaining - expires March 1, 2026)
SSL Monitoring:       ✅ Active (daily checks, email reminders enabled)
Auto-start Services:  ✅ Enabled on boot
```

---

## SuperAdmin Access

### Login Credentials

**SuperAdmin Login URL:**
```
https://digitalchain.in/superadmin/login
```

**Credentials:**
```
Email:    admin@digitalchain.in
Password: DigitalChain@2024!
```

**User Details:**
- User ID: da3267c4-6985-4616-ae8d-7e5b477df837
- Name: Digital Chain Admin
- Role: SuperAdmin
- Organization: None (SuperAdmin has access to ALL organizations)

**API Endpoint:**
```
POST https://api.digitalchain.in/v1/auth/superadmin-login

Body:
{
  "email": "admin@digitalchain.in",
  "password": "DigitalChain@2024!"
}
```

**Important Notes:**
- ⚠️ Change the default password immediately after first login
- SuperAdmin has unrestricted access to all organizations
- Keep these credentials secure
- Do not share with unauthorized personnel

---

## Next Steps

1. **Login to SuperAdmin Portal (COMPLETED ✅)**
   - URL: https://digitalchain.in/superadmin/login
   - Email: admin@digitalchain.in
   - Password: DigitalChain@2024!
   - **Action:** Change password after first login

2. **Configure Firewall (Recommended)**
   ```bash
   sudo ufw allow 22/tcp
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   sudo ufw enable
   ```

3. **Setup Email Notifications for SSL Reminders**
   ```bash
   sudo apt-get install mailutils
   # Configure email settings when prompted
   # Test: sudo /opt/digitalchain/ssl-renewal-dns-hook.sh
   ```

4. **Create First Organization (via SuperAdmin Portal)**
   - Login to https://digitalchain.in/superadmin/login
   - Create organization through the admin interface
   - Or use CLI: `python scripts/seed_production.py`

5. **Setup Automated Backups**
   - Create backup script for database and uploads
   - Configure cron job for daily backups
   - Test restore procedure

6. **Setup Monitoring (Optional)**
   - Install Prometheus Node Exporter
   - Setup Grafana dashboards
   - Configure alerting

---

## Support

For issues or questions:
- Check logs: `sudo journalctl -u digitalchain-backend -f`
- Review this guide
- Check original migration guide: `SERVER_MIGRATION_GUIDE.md`

---

**Setup completed successfully on December 1, 2025**
