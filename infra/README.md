# Production Deployment: Domain, SSL (Nginx), and DB Setup

This guide walks you through setting up DNS, Nginx + Let's Encrypt SSL, deploying the FastAPI backend and Next.js Admin Portal, and configuring Postgres.

## 1) DNS Records
Create A/AAAA records at your DNS provider:
- api.digitalchain.in → 103.49.131.101
- admin.digitalchain.in → 103.49.131.101

Verify propagation (can take minutes) by pinging both subdomains from your machine.
Examples:
```
dig +short api.digitalchain.in A
dig +short admin.digitalchain.in A
# Both should resolve to 103.49.131.101 before issuing certificates
```

## 2) Install base packages on the server
- Nginx
- Certbot (for Let's Encrypt)
- Python 3 + pip + venv (if not using Docker for the app)
- Node 18+ (for Admin Portal)

On Ubuntu/Debian (example):
```
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx python3-venv python3-pip
# Node: use NodeSource or nvm
```

Ensure firewall allows HTTP/HTTPS:
```
sudo ufw allow 80,443/tcp
```

## 3) Postgres database
Option A: Docker Compose (provided at repo root)
```
cd /opt/digitalchain
docker compose up -d db
```
- Default credentials/DB name are controlled by environment variables; see `.env.example`.
- Secure: change `POSTGRES_USER`, `POSTGRES_PASSWORD` in your `.env` and recreate the container.

Option B: Managed Postgres or native install
- Provision a managed DB (e.g., RDS, Cloud SQL) or install `postgresql` package. 
- Create a database and user, and note the connection URL.

Set backend DATABASE_URL accordingly, e.g.:
```
postgresql+psycopg2://dcuser:STRONGPASSWORD@127.0.0.1:5432/digitalchain
```

## 4) Deploy application files
Clone the repo under `/opt/digitalchain` (or your preferred path):
```
sudo mkdir -p /opt/digitalchain
sudo chown -R $USER:$USER /opt/digitalchain
cd /opt/digitalchain
# git clone your repo here
```

Build Admin Portal for production:
```
cd /opt/digitalchain/admin-portal
npm install
npm run build
```

Backend Python env (if not containerizing the app):
```
cd /opt/digitalchain
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
```

## 5) Configure environment files
Create directory for app envs and copy examples:
```
sudo mkdir -p /etc/digitalchain
sudo cp infra/env/backend.env.example /etc/digitalchain/backend.env
sudo cp infra/env/admin.env.example /etc/digitalchain/admin.env
```
Edit secrets and URLs in those files:
- `/etc/digitalchain/backend.env` → set `DATABASE_URL` and a strong `JWT_SECRET`.
- `/etc/digitalchain/admin.env` → set `NEXT_PUBLIC_API_BASE=https://api.digitalchain.in/v1` and ensure `PORT=3000`.

Secure permissions:
```
sudo chown root:root /etc/digitalchain/*.env
sudo chmod 600 /etc/digitalchain/*.env
```

## 6) Systemd services
Copy service files and enable them:
```
sudo cp infra/systemd/digitalchain-backend.service /etc/systemd/system/
sudo cp infra/systemd/digitalchain-admin.service /etc/systemd/system/

sudo systemctl daemon-reload
sudo systemctl enable digitalchain-backend digitalchain-admin
sudo systemctl start digitalchain-backend digitalchain-admin

sudo systemctl status digitalchain-backend --no-pager
sudo systemctl status digitalchain-admin --no-pager
```
Notes:
- Ensure `WorkingDirectory` paths in the unit files match your deploy location.
- The backend unit starts Uvicorn on 127.0.0.1:8000. The admin unit runs `next start` on 127.0.0.1:3000.

## 7) Nginx reverse proxy
Copy Nginx vhost configs and enable them:
```
sudo cp infra/nginx/api.conf /etc/nginx/sites-available/digitalchain-api.conf
sudo cp infra/nginx/admin.conf /etc/nginx/sites-available/digitalchain-admin.conf

sudo ln -s /etc/nginx/sites-available/digitalchain-api.conf /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/digitalchain-admin.conf /etc/nginx/sites-enabled/

# Replace server_name values (api.digitalchain.in/admin.digitalchain.in) before linking

sudo nginx -t
sudo systemctl reload nginx
```

Alternatively, use the helper script (Ubuntu/Debian):
```
sudo bash infra/scripts/setup_nginx_ssl.sh \
	--repo-dir /opt/digitalchain \
	--api-domain api.digitalchain.in \
	--admin-domain admin.digitalchain.in \
	--email you@digitalchain.in
```

## 8) SSL with Let's Encrypt (Certbot)
Create webroot (used during initial challenge):
```
sudo mkdir -p /var/www/certbot
sudo chown -R www-data:www-data /var/www/certbot
```
Issue certificates (nginx plugin will update the config automatically):
```
sudo certbot --nginx -d api.digitalchain.in -d admin.digitalchain.in --redirect --non-interactive --agree-tos -m you@digitalchain.in
```
Certbot installs a systemd timer for auto-renewal. Test renewal:
```
sudo certbot renew --dry-run
```

Quick verification script:
```
bash infra/scripts/verify_endpoints.sh api.digitalchain.in admin.digitalchain.in
```

## 9) Backend database migrations (optional)
For quick starts, the app auto-creates tables on startup (suitable for SQLite or dev). For Postgres/prod, initialize Alembic and run migrations:
```
# Example outline (adjust paths and settings)
cd /opt/digitalchain/backend
alembic init migrations
# Configure alembic.ini and env.py to use DATABASE_URL
alembic revision --autogenerate -m "init"
alembic upgrade head
```

## 10) Health check and smoke tests
- API: `curl -i https://api.digitalchain.in/v1/health`
- Admin: open `https://admin.digitalchain.in`

## Troubleshooting
- `journalctl -u digitalchain-backend -f` for backend logs.
- `journalctl -u digitalchain-admin -f` for admin logs.
- `sudo nginx -t` and `sudo tail -f /var/log/nginx/error.log` for Nginx issues.
- Make sure DNS resolves to your server and firewall allows ports 80/443.
