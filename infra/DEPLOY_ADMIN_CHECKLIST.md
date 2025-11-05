# Digitalchain Admin Portal – Deployment & Asset Troubleshooting Checklist

This checklist resolves production errors like:

- Loading failed for script …/_next/static/chunks/app/users/page-<hash>.js
- CSS: Selector expected … for /_next/static/css/<hash>.css

Root cause: the running Next.js server is serving a different build than the HTML references, or Nginx misroutes `/_next/static/*`. Fix by ensuring a clean build, correct Nginx config, and restarting the service.

## 1) Nginx proxy config for Next.js assets

Ensure your HTTPS server block contains the explicit `/_next/static/` location. See `infra/nginx/admin-https.conf.example`:

```
location ^~ /_next/static/ {
  proxy_pass http://127.0.0.1:3000;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  expires 1y;
  add_header Cache-Control "public, immutable";
}
```

Then:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 2) Stop → Clean build → Start Next service

Assuming `/opt/digitalchain/admin-portal` and service `digitalchain-admin`:

```bash
# Stop service
sudo systemctl stop digitalchain-admin

# Reinstall deps and build fresh
cd /opt/digitalchain/admin-portal
sudo -u www-data npm ci
sudo -u www-data npm run build

# Sanity checks: make sure the assets exist
ls -l .next/static/chunks/app/users/
ls -l .next/static/css/
cat .next/BUILD_ID

# Start service
sudo systemctl start digitalchain-admin
sudo systemctl status digitalchain-admin --no-pager
```

## 3) Validate the exact assets referenced by /users

```bash
# Extract the page-specific JS chunk and CSS from the rendered HTML
curl -sS https://admin.digitalchain.in/users | grep -oE '/_next/static/[^"\n]+page-[^"\n]+\.js' | head -n 1
curl -sS https://admin.digitalchain.in/users | grep -oE '/_next/static/[^"\n]+\.css' | head -n 2

# Replace <PATH> with the actual value and verify 200 + correct content-type
curl -sSI "https://admin.digitalchain.in<PATH>" --max-time 15
```

Expected:
- HTTP/2 200
- `content-type: application/javascript` (for .js) and `text/css` (for .css)
- No redirects
- Body is JS/CSS – not an HTML error page

Helper script:

```bash
infra/scripts/verify_next_assets.sh admin.digitalchain.in
```

## 4) Build ID consistency (avoids mismatched HTML and assets)

The running server emits a build ID that appears in asset URLs: `/_next/static/<BUILD_ID>/*`.

- Local build ID: `cat .next/BUILD_ID`
- Remote build ID (from an error page or HTML): look for `/_next/static/<BUILD_ID>/_buildManifest.js` in page source.

If these differ, you are serving HTML from one build and assets from another. Restart the Next service after rebuild, and ensure only one deployment path is used.

You can automate the check:

```bash
infra/scripts/check_next_buildid.sh admin.digitalchain.in
```

## 5) CDN caches (if any)

If using Cloudflare or similar, purge:

- `/_next/*`
- `/users`

Then re-verify assets.

## 6) Common pitfalls

- A leftover `next dev` process running on 3000 – stop it; only `next start` should be active.
- Multiple app copies on disk; systemd points to an old path.
- Nginx missing the `/_next/static/` location; assets get redirected or altered.
- Service didn’t restart after build, so HTML and assets are out of sync.

Once the JS and CSS return 200 OK with proper content types, the Users page will hydrate and render correctly.
