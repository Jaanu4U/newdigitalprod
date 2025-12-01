# Server Migration & Production Deployment Guide

Complete guide to migrate DigitalChain application to a new server with full production setup.

---

## Table of Contents

1. [Server Requirements](#server-requirements)
2. [Initial Server Setup](#initial-server-setup)
3. [Install Dependencies](#install-dependencies)
4. [PostgreSQL Setup](#postgresql-setup)
5. [Application Deployment](#application-deployment)
6. [SSL/HTTPS Setup](#ssl-https-setup)
7. [Nginx Configuration](#nginx-configuration)
8. [Service Configuration](#service-configuration)
9. [Final Steps](#final-steps)
10. [Verification](#verification)

---

## Server Requirements

### Minimum Specifications
- **OS**: Ubuntu 22.04 LTS or 24.04 LTS
- **RAM**: 4GB minimum (8GB recommended)
- **CPU**: 2 cores minimum (4 cores recommended)
- **Storage**: 50GB SSD minimum
- **Network**: Public IP with ports 80, 443 open

### Domain Requirements
- Main domain: `digitalchain.in`
- Wildcard SSL support for subdomains: `*.digitalchain.in`
- DNS access to create A records

---

## Initial Server Setup

### 1. Connect to Server

```bash
ssh root@your-server-ip
```

### 2. Update System

```bash
apt update && apt upgrade -y
apt install -y curl wget git vim ufw
```

### 3. Create Application User

```bash
useradd -m -s /bin/bash digitalchain
usermod -aG sudo digitalchain
```

### 4. Configure Firewall

```bash
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

### 5. Set Hostname

```bash
hostnamectl set-hostname digitalchain
echo "127.0.0.1 digitalchain" >> /etc/hosts
```

---

## Install Dependencies

### 1. Install Node.js (v20.x)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node --version  # Should show v20.x
npm --version
```

### 2. Install Python (3.11)

```bash
apt install -y python3.11 python3.11-venv python3-pip
python3.11 --version
```

### 3. Install PostgreSQL (15)

```bash
apt install -y postgresql postgresql-contrib
systemctl enable postgresql
systemctl start postgresql
```

### 4. Install Nginx

```bash
apt install -y nginx
systemctl enable nginx
systemctl start nginx
```

### 5. Install Certbot (for SSL)

```bash
apt install -y certbot python3-certbot-nginx
```

### 6. Install Build Tools

```bash
apt install -y build-essential libpq-dev
```

---

## PostgreSQL Setup

### 1. Create Database and User

```bash
sudo -u postgres psql
```

In PostgreSQL prompt:

```sql
-- Create user
CREATE USER dcuser WITH PASSWORD 'YOUR_STRONG_PASSWORD_HERE';

-- Create database
CREATE DATABASE digitalchain OWNER dcuser;

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE digitalchain TO dcuser;

-- Connect to database
\c digitalchain

-- Grant schema privileges
GRANT ALL ON SCHEMA public TO dcuser;

-- Exit
\q
```

### 2. Configure PostgreSQL for Remote Access (if needed)

Edit `/etc/postgresql/15/main/postgresql.conf`:

```bash
sudo nano /etc/postgresql/15/main/postgresql.conf
```

Change:
```
listen_addresses = 'localhost'
```

Edit `/etc/postgresql/15/main/pg_hba.conf`:

```bash
sudo nano /etc/postgresql/15/main/pg_hba.conf
```

Add:
```
# Local connections
local   digitalchain    dcuser                                  md5
host    digitalchain    dcuser          127.0.0.1/32            md5
```

Restart PostgreSQL:

```bash
systemctl restart postgresql
```

### 3. Test Database Connection

```bash
psql -h 127.0.0.1 -U dcuser -d digitalchain -c "SELECT version();"
```

---

## Application Deployment

### 1. Clone Repository

```bash
cd /opt
git clone https://github.com/Jaanu4U/newdigitalprod.git digitalchain
cd digitalchain
chown -R digitalchain:digitalchain /opt/digitalchain
```

### 2. Setup Backend

```bash
cd /opt/digitalchain/backend

# Create virtual environment
python3.11 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install --upgrade pip
pip install -r requirements.txt

# Create environment file
cat > .env << 'EOF'
DATABASE_URL=postgresql+psycopg2://dcuser:YOUR_PASSWORD@127.0.0.1:5432/digitalchain
JWT_SECRET=YOUR_RANDOM_JWT_SECRET_HERE
REFRESH_SECRET=YOUR_RANDOM_REFRESH_SECRET_HERE
WHATSAPP_API_KEY=your_whatsapp_api_key_if_needed
EOF

# Initialize database
python -c "from app.db import engine, Base; from app.models import *; Base.metadata.create_all(engine)"

# Test backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
# Press Ctrl+C after testing
```

### 3. Setup Admin Portal

```bash
cd /opt/digitalchain/admin-portal

# Install dependencies
npm install

# Create environment file
cat > .env.local << 'EOF'
NEXT_PUBLIC_API_BASE_URL=https://api.digitalchain.in
NEXT_PUBLIC_WS_URL=wss://api.digitalchain.in
EOF

# Build for production
npm run build

# Test
npm run start
# Press Ctrl+C after testing
```

### 4. Setup WhatsApp Service (Optional)

```bash
cd /opt/digitalchain/whatsapp-service

# Install dependencies
npm install

# Create environment file
cat > .env << 'EOF'
BACKEND_URL=http://localhost:8000
WHATSAPP_API_KEY=your_api_key
EOF

# Build
npm run build
```

---

## SSL/HTTPS Setup

### 1. Configure DNS

Before requesting SSL certificates, ensure DNS is configured:

```
A Record:  digitalchain.in       → your-server-ip
A Record:  *.digitalchain.in     → your-server-ip
A Record:  api.digitalchain.in   → your-server-ip
```

Wait for DNS propagation (5-30 minutes). Test with:

```bash
dig digitalchain.in
dig api.digitalchain.in
dig jugesh.digitalchain.in
```

### 2. Create Initial Nginx Config

```bash
cat > /etc/nginx/sites-available/digitalchain << 'EOF'
server {
    listen 80;
    server_name digitalchain.in *.digitalchain.in api.digitalchain.in;
    
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }
    
    location / {
        return 301 https://$host$request_uri;
    }
}
EOF

ln -sf /etc/nginx/sites-available/digitalchain /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
```

### 3. Request SSL Certificates

```bash
# Get wildcard certificate
certbot certonly --nginx \
  -d digitalchain.in \
  -d *.digitalchain.in \
  -d api.digitalchain.in \
  --agree-tos \
  --email your-email@example.com \
  --non-interactive

# Certificates will be saved to:
# /etc/letsencrypt/live/digitalchain.in/fullchain.pem
# /etc/letsencrypt/live/digitalchain.in/privkey.pem
```

### 4. Setup Auto-Renewal

```bash
# Test renewal
certbot renew --dry-run

# Certbot automatically installs a renewal cron job
systemctl status certbot.timer
```

---

## Nginx Configuration

### 1. Main Configuration

Create `/etc/nginx/sites-available/digitalchain`:

```nginx
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
        proxy_set_header Connection 'upgrade';
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
```

### 2. Enable Configuration

```bash
ln -sf /etc/nginx/sites-available/digitalchain /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
```

---

## Service Configuration

### 1. Backend Service

Create `/etc/systemd/system/digitalchain-backend.service`:

```ini
[Unit]
Description=DigitalChain Backend API
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=digitalchain
Group=digitalchain
WorkingDirectory=/opt/digitalchain/backend
Environment="PATH=/opt/digitalchain/backend/.venv/bin:/usr/local/bin:/usr/bin:/bin"
Environment="DATABASE_URL=postgresql+psycopg2://dcuser:YOUR_PASSWORD@127.0.0.1:5432/digitalchain"
Environment="JWT_SECRET=YOUR_JWT_SECRET"
Environment="REFRESH_SECRET=YOUR_REFRESH_SECRET"
ExecStart=/opt/digitalchain/backend/.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### 2. Admin Portal Service

Create `/etc/systemd/system/digitalchain-admin.service`:

```ini
[Unit]
Description=DigitalChain Admin Portal
After=network.target

[Service]
Type=simple
User=digitalchain
Group=digitalchain
WorkingDirectory=/opt/digitalchain/admin-portal
Environment="PATH=/usr/bin:/bin"
Environment="NODE_ENV=production"
Environment="NEXT_PUBLIC_API_BASE_URL=https://api.digitalchain.in"
Environment="NEXT_PUBLIC_WS_URL=wss://api.digitalchain.in"
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### 3. WhatsApp Service (Optional)

Create `/etc/systemd/system/digitalchain-whatsapp.service`:

```ini
[Unit]
Description=DigitalChain WhatsApp Service
After=network.target digitalchain-backend.service
Requires=digitalchain-backend.service

[Service]
Type=simple
User=digitalchain
Group=digitalchain
WorkingDirectory=/opt/digitalchain/whatsapp-service
Environment="PATH=/usr/bin:/bin"
Environment="NODE_ENV=production"
Environment="BACKEND_URL=http://localhost:8000"
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### 4. Location Cleanup Service

Create `/etc/systemd/system/location-cleanup.service`:

```ini
[Unit]
Description=Cleanup old location tracking data
After=network.target postgresql.service

[Service]
Type=oneshot
User=digitalchain
WorkingDirectory=/opt/digitalchain/backend
Environment="PATH=/opt/digitalchain/backend/.venv/bin"
Environment="DATABASE_URL=postgresql+psycopg2://dcuser:YOUR_PASSWORD@127.0.0.1:5432/digitalchain"
ExecStart=/opt/digitalchain/backend/.venv/bin/python /opt/digitalchain/backend/scripts/cleanup_old_locations.py 30
```

Create `/etc/systemd/system/location-cleanup.timer`:

```ini
[Unit]
Description=Run location cleanup every 15 minutes

[Timer]
OnBootSec=15min
OnUnitActiveSec=15min
Persistent=true

[Install]
WantedBy=timers.target
```

### 5. Enable and Start Services

```bash
# Reload systemd
systemctl daemon-reload

# Enable services
systemctl enable digitalchain-backend
systemctl enable digitalchain-admin
systemctl enable digitalchain-whatsapp  # if using
systemctl enable location-cleanup.timer

# Start services
systemctl start digitalchain-backend
systemctl start digitalchain-admin
systemctl start digitalchain-whatsapp  # if using
systemctl start location-cleanup.timer

# Check status
systemctl status digitalchain-backend
systemctl status digitalchain-admin
systemctl status digitalchain-whatsapp
systemctl status location-cleanup.timer
```

---

## Final Steps

### 1. Create Upload Directories

```bash
mkdir -p /opt/digitalchain/backend/uploads/pod
chown -R digitalchain:digitalchain /opt/digitalchain/backend/uploads
chmod -R 755 /opt/digitalchain/backend/uploads
```

### 2. Create First Organization

```bash
cd /opt/digitalchain/backend
source .venv/bin/activate
python scripts/seed_production.py
```

Follow prompts to create:
- Organization name
- Subdomain (e.g., "jugesh" for jugesh.digitalchain.in)
- Admin user email and password

### 3. Setup Logging

Create log directories:

```bash
mkdir -p /var/log/digitalchain
chown digitalchain:digitalchain /var/log/digitalchain
```

Configure log rotation in `/etc/logrotate.d/digitalchain`:

```
/var/log/digitalchain/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 digitalchain digitalchain
    sharedscripts
    postrotate
        systemctl reload digitalchain-backend > /dev/null 2>&1 || true
        systemctl reload digitalchain-admin > /dev/null 2>&1 || true
    endscript
}
```

### 4. Configure Backup

Create backup script `/opt/digitalchain/backup.sh`:

```bash
#!/bin/bash
BACKUP_DIR="/opt/backups/digitalchain"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Backup database
PGPASSWORD=YOUR_PASSWORD pg_dump -h 127.0.0.1 -U dcuser digitalchain | gzip > $BACKUP_DIR/db_$DATE.sql.gz

# Backup uploads
tar -czf $BACKUP_DIR/uploads_$DATE.tar.gz -C /opt/digitalchain/backend uploads/

# Keep only last 7 days
find $BACKUP_DIR -name "db_*.sql.gz" -mtime +7 -delete
find $BACKUP_DIR -name "uploads_*.tar.gz" -mtime +7 -delete

echo "Backup completed: $DATE"
```

Make executable and add to crontab:

```bash
chmod +x /opt/digitalchain/backup.sh
crontab -e -u digitalchain
```

Add:
```
0 2 * * * /opt/digitalchain/backup.sh >> /var/log/digitalchain/backup.log 2>&1
```

---

## Verification

### 1. Check Services

```bash
systemctl status digitalchain-backend
systemctl status digitalchain-admin
systemctl status nginx
systemctl status postgresql
```

### 2. Check Logs

```bash
journalctl -u digitalchain-backend -f
journalctl -u digitalchain-admin -f
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log
```

### 3. Test Endpoints

```bash
# Test API
curl -k https://api.digitalchain.in/health

# Test WebSocket
curl -k -i -N \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Host: api.digitalchain.in" \
  -H "Origin: https://digitalchain.in" \
  https://api.digitalchain.in/ws

# Test Admin Portal
curl -k https://digitalchain.in
curl -k https://jugesh.digitalchain.in  # Replace with your subdomain
```

### 4. Test SSL

```bash
# Check SSL certificate
openssl s_client -connect api.digitalchain.in:443 -servername api.digitalchain.in

# Check SSL rating
# Visit: https://www.ssllabs.com/ssltest/analyze.html?d=api.digitalchain.in
```

### 5. Test Database

```bash
PGPASSWORD=YOUR_PASSWORD psql -h 127.0.0.1 -U dcuser -d digitalchain -c "
SELECT 
  (SELECT COUNT(*) FROM organizations) as orgs,
  (SELECT COUNT(*) FROM users) as users,
  (SELECT COUNT(*) FROM sync_log WHERE type='invoice_rider_assigned') as orders;
"
```

---

## Security Checklist

- [ ] Change all default passwords
- [ ] Configure firewall (UFW)
- [ ] Enable automatic security updates
- [ ] Setup fail2ban for SSH protection
- [ ] Regular backups configured
- [ ] SSL certificates installed and auto-renewal working
- [ ] Database access restricted to localhost
- [ ] File permissions set correctly
- [ ] Logs being rotated
- [ ] Monitoring setup (optional: Prometheus, Grafana)

---

## Monitoring Setup (Optional)

### Install Prometheus Node Exporter

```bash
wget https://github.com/prometheus/node_exporter/releases/download/v1.7.0/node_exporter-1.7.0.linux-amd64.tar.gz
tar xvfz node_exporter-1.7.0.linux-amd64.tar.gz
sudo cp node_exporter-1.7.0.linux-amd64/node_exporter /usr/local/bin/
```

Create service `/etc/systemd/system/node_exporter.service`:

```ini
[Unit]
Description=Node Exporter

[Service]
User=digitalchain
ExecStart=/usr/local/bin/node_exporter

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
systemctl enable node_exporter
systemctl start node_exporter
```

---

## Troubleshooting

### Backend Not Starting

```bash
# Check logs
journalctl -u digitalchain-backend -n 50

# Check if port 8000 is in use
netstat -tulpn | grep 8000

# Test manually
cd /opt/digitalchain/backend
source .venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### Admin Portal Not Loading

```bash
# Check logs
journalctl -u digitalchain-admin -n 50

# Check if port 3000 is in use
netstat -tulpn | grep 3000

# Rebuild and restart
cd /opt/digitalchain/admin-portal
npm run build
systemctl restart digitalchain-admin
```

### SSL Certificate Issues

```bash
# Renew certificates
certbot renew --force-renewal

# Check certificate
certbot certificates

# Test Nginx config
nginx -t
```

### Database Connection Issues

```bash
# Check PostgreSQL
systemctl status postgresql

# Check connections
sudo -u postgres psql -c "SELECT * FROM pg_stat_activity;"

# Test connection
PGPASSWORD=YOUR_PASSWORD psql -h 127.0.0.1 -U dcuser -d digitalchain -c "SELECT 1;"
```

---

## Maintenance Commands

### Update Application

```bash
cd /opt/digitalchain
git pull origin main

# Update backend
cd backend
source .venv/bin/activate
pip install -r requirements.txt
systemctl restart digitalchain-backend

# Update admin portal
cd ../admin-portal
npm install
npm run build
systemctl restart digitalchain-admin
```

### View Logs

```bash
# Backend
journalctl -u digitalchain-backend -f

# Admin Portal
journalctl -u digitalchain-admin -f

# Nginx
tail -f /var/log/nginx/error.log
tail -f /var/log/nginx/access.log

# PostgreSQL
tail -f /var/log/postgresql/postgresql-15-main.log
```

### Restart Services

```bash
systemctl restart digitalchain-backend
systemctl restart digitalchain-admin
systemctl restart nginx
systemctl restart postgresql
```

---

## Production Checklist

Before going live:

- [ ] All environment variables set correctly
- [ ] Database backed up
- [ ] SSL certificates working
- [ ] All services running and enabled
- [ ] Nginx configuration tested
- [ ] DNS configured correctly
- [ ] Firewall rules in place
- [ ] Backup script tested
- [ ] Log rotation configured
- [ ] Monitoring setup (optional)
- [ ] Test all functionality:
  - [ ] User login
  - [ ] Order creation
  - [ ] Rider assignment
  - [ ] Mobile app connectivity
  - [ ] WebSocket real-time updates
  - [ ] File uploads
  - [ ] Payment processing

---

## Quick Reference

### Service Commands

```bash
# Status
systemctl status digitalchain-backend digitalchain-admin nginx postgresql

# Restart all
systemctl restart digitalchain-backend digitalchain-admin nginx

# Logs
journalctl -u digitalchain-backend -f
journalctl -u digitalchain-admin -f
```

### Database Access

```bash
PGPASSWORD=YOUR_PASSWORD psql -h 127.0.0.1 -U dcuser -d digitalchain
```

### File Locations

- Application: `/opt/digitalchain`
- Backend: `/opt/digitalchain/backend`
- Admin Portal: `/opt/digitalchain/admin-portal`
- Nginx Config: `/etc/nginx/sites-available/digitalchain`
- SSL Certificates: `/etc/letsencrypt/live/digitalchain.in/`
- Logs: `/var/log/digitalchain/`
- Uploads: `/opt/digitalchain/backend/uploads/`

---

**Server migration complete! Your DigitalChain application is now running in production.**
