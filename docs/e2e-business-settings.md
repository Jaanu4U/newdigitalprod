# Business Settings E2E Test (Selenium)

This E2E test exercises the Admin Portal Business Settings page end-to-end:
- Authenticates (via API token or email/password)
- Navigates to /business-settings
- Modifies the Address field and saves
- Verifies the change, then reverts it

## Prerequisites
- Linux host with bash
- Python 3.10+ (uses venv)
- A Chrome/Chromium browser installed
  - Either Google Chrome (google-chrome) or Chromium (chromium / chromium-browser)
- Network access to your environment (e.g., https://<tenant>.digitalchain.in)

## Setup (one-time)

```bash
python3 -m venv .venv-e2e
./.venv-e2e/bin/pip install --upgrade pip
./.venv-e2e/bin/pip install -r requirements-dev.txt
```

## Running

Choose ONE auth method:

1) Access token (recommended for CI)
- Obtain a JWT access token (e.g., from a prior login or API call)
- Export it as DC_ACCESS

```bash
export DC_TENANT=jorg
export DC_ACCESS=eyJhbGciOi... # your token
# optional overrides
export DC_BASE=https://jorg.digitalchain.in/
export DC_CHROME_BIN=$(which chromium || which chromium-browser || which google-chrome)
./.venv-e2e/bin/python scripts/selenium_test_business_settings.py --headless
```

2) Email/password login (interactive or headless)

```bash
export DC_TENANT=jorg
export DC_TEST_EMAIL=admin@example.com
export DC_TEST_PASSWORD='secret'
export DC_CHROME_BIN=$(which chromium || which chromium-browser || which google-chrome)
./.venv-e2e/bin/python scripts/selenium_test_business_settings.py --headless
```

Notes:
- If you do not provide DC_ACCESS or credentials, the script will load /login and wait briefly for manual login. For manual login, run without --headless.
- For Chromium installs, use DC_CHROME_BIN to point to the binary.

## Troubleshooting
- No Chrome/Chromium found: install a browser and set DC_CHROME_BIN.
- Login fails (401): verify tenant (DC_TENANT) and credentials/token.
- Element not found: ensure the Admin Portal is built/deployed and the Business Settings page is available to your role.
- SSL issues in dev: set DC_BASE to your dev/staging URL and ensure certs are trusted or use a non-HTTPS dev endpoint.
