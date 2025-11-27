#!/usr/bin/env python3
"""
End-to-end Selenium test for the Business Settings page.

This test:
  - (Optionally) logs in via API and seeds localStorage with the access token
  - Opens https://<tenant>.digitalchain.in/business-settings
  - Reads the current Address value
  - Appends a short token to Address, clicks Save Changes, and verifies the value updates
  - Reverts Address back to the original value and saves again (leaves data unchanged)

Usage examples:
  python3 scripts/selenium_test_business_settings.py --tenant jorg --email admin@example.com --password 'secret'

Environment variables (alternative to flags):
  DC_TENANT, DC_TEST_EMAIL, DC_TEST_PASSWORD, DC_HEADLESS=1

Requires: selenium, webdriver-manager, requests
  pip install selenium webdriver-manager requests
"""
import argparse
import os
import time
import json
import random
import string
import requests
from urllib.parse import urljoin

from selenium import webdriver
from selenium.webdriver.chrome.options import Options as ChromeOptions
from selenium.webdriver.chrome.service import Service as ChromeService
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager
from selenium.common.exceptions import NoAlertPresentException


def get_args():
    p = argparse.ArgumentParser()
    p.add_argument('--tenant', default=os.getenv('DC_TENANT', 'jorg'))
    p.add_argument('--email', default=os.getenv('DC_TEST_EMAIL'))
    p.add_argument('--password', default=os.getenv('DC_TEST_PASSWORD'))
    p.add_argument('--access-token', default=os.getenv('DC_ACCESS'))
    p.add_argument('--base', default=os.getenv('DC_BASE'))
    p.add_argument('--chrome-binary', default=os.getenv('DC_CHROME_BIN'))
    p.add_argument('--headless', action='store_true', default=os.getenv('DC_HEADLESS', '1') == '1')
    return p.parse_args()


def api_login(tenant: str, email: str, password: str) -> dict | None:
    try:
        resp = requests.post(
            'https://api.digitalchain.in/v1/auth/login',
            headers={'X-Org': tenant, 'Content-Type': 'application/json'},
            json={'email': email, 'password': password}
        )
        if resp.status_code == 200:
            return resp.json()
        else:
            print('API login failed:', resp.status_code, resp.text)
            return None
    except Exception as e:
        print('API login error:', e)
        return None


def main():
    args = get_args()
    base = args.base or f"https://{args.tenant}.digitalchain.in/"

    # Configure Chrome
    chrome_opts = ChromeOptions()
    if args.headless:
        chrome_opts.add_argument('--headless=new')
    chrome_opts.add_argument('--no-sandbox')
    chrome_opts.add_argument('--disable-dev-shm-usage')
    chrome_opts.add_argument('--window-size=1280,800')
    # Additional stability flags for snap chromium in headless CI environments
    chrome_opts.add_argument('--disable-gpu')
    chrome_opts.add_argument('--remote-debugging-port=9222')
    chrome_opts.add_argument('--disable-software-rasterizer')
    chrome_opts.add_argument('--disable-extensions')
    chrome_opts.add_argument('--disable-infobars')
    if args.chrome_binary:
        chrome_opts.binary_location = args.chrome_binary

    # Prefer Selenium Manager (auto driver) first; fallback to webdriver-manager if needed
    try:
        driver = webdriver.Chrome(options=chrome_opts)
    except Exception as e:
        print('Selenium Manager init failed, falling back to webdriver-manager:', e)
        try:
            from webdriver_manager.core.utils import ChromeType
            service = ChromeService(ChromeDriverManager(chrome_type=ChromeType.CHROMIUM).install())
        except Exception:
            # Last resort: default Chrome type
            service = ChromeService(ChromeDriverManager().install())
        driver = webdriver.Chrome(service=service, options=chrome_opts)
    wait = WebDriverWait(driver, 20)
    driver.get(urljoin(base, 'login'))

    # If access token provided, seed localStorage directly. Else try API login if creds given.
    seeded = False
    if args.access_token:
        driver.execute_script("window.localStorage.setItem('dc_access', arguments[0]);", args.access_token)
        # Role is optional; default to Admin when not known
        driver.execute_script("window.localStorage.setItem('dc_role', arguments[0]);", 'Admin')
        driver.get(urljoin(base, 'business-settings'))
        seeded = True
    elif args.email and args.password:
        token = api_login(args.tenant, args.email, args.password)
        if token and token.get('access_token'):
            driver.execute_script("window.localStorage.setItem('dc_access', arguments[0]);", token['access_token'])
            role = (token.get('user') or {}).get('role') or 'Admin'
            driver.execute_script("window.localStorage.setItem('dc_role', arguments[0]);", role)
            driver.get(urljoin(base, 'business-settings'))
            seeded = True
        else:
            print('API login failed; attempting form-based login...')
            try:
                email_input = wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, "input[type='email']")))
                pwd_input = wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, "input[type='password']")))
                email_input.clear(); email_input.send_keys(args.email)
                pwd_input.clear(); pwd_input.send_keys(args.password)
                submit_btn = wait.until(EC.element_to_be_clickable((By.XPATH, "//button[contains(., 'Sign in to Dashboard')]")))
                submit_btn.click()
                # Wait for token to appear in localStorage (poll) or redirect
                for _ in range(40):
                    access = driver.execute_script("return window.localStorage.getItem('dc_access');")
                    if access:
                        seeded = True
                        break
                    time.sleep(0.25)
                # Navigate to business-settings explicitly after login
                driver.get(urljoin(base, 'business-settings'))
            except Exception as fe:
                print('Form login attempt failed:', fe)
                print('Proceeding without token; please complete login manually in a non-headless run.')
    else:
        print('No credentials provided; please log in manually (disable headless to interact).')

    # Wait for the Business Settings title; if we didn't seed auth, give the user a chance to log in first
    if not seeded:
        # Wait for login form, then attempt to navigate after a grace period
        try:
            wait.until(EC.presence_of_element_located((By.XPATH, "//form//*[contains(., 'Login') or contains(., 'Sign in') or contains(@type, 'submit')]")))
            print('Waiting 10s for manual login...')
            time.sleep(10)
            driver.get(urljoin(base, 'business-settings'))
        except Exception:
            pass

    wait.until(EC.presence_of_element_located((By.XPATH, "//h1[contains(., 'Business Settings')]")))

    # Locate fields
    address = wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, "textarea")))
    gstin = wait.until(EC.presence_of_element_located((By.XPATH, "//h3[contains(., 'GSTIN')]/following::input[1]")))
    company = wait.until(EC.presence_of_element_located((By.XPATH, "//h3[contains(., 'Company Registration')]/following::input[1]")))
    drug = wait.until(EC.presence_of_element_located((By.XPATH, "//h3[contains(., 'Drug License')]/following::input[1]")))
    fssai = wait.until(EC.presence_of_element_located((By.XPATH, "//h3[contains(., 'FSSAI')]/following::input[1]")))

    # Locate the Save button (it may be disabled initially when no changes)
    save_locator = (By.XPATH, "//button[contains(., 'Save Changes') or contains(., 'Saved')]")
    wait.until(EC.presence_of_element_located(save_locator))

    # Capture current address and craft a reversible change
    original_addr = address.get_attribute('value') or ''
    suffix = ' QA' + ''.join(random.choices(string.ascii_uppercase + string.digits, k=4))
    new_addr = (original_addr + suffix).strip()

    # Enter new address
    address.clear()
    address.send_keys(new_addr)

    # Click Save Changes (wait until it becomes enabled/clickable after edit)
    save_btn = wait.until(EC.element_to_be_clickable(save_locator))
    save_btn.click()
    # Dismiss success alert if the page shows one
    try:
        WebDriverWait(driver, 3).until(EC.alert_is_present())
        driver.switch_to.alert.accept()
    except NoAlertPresentException:
        pass
    except Exception:
        pass

    # Reload page and verify persisted value reflects new suffix
    time.sleep(0.5)
    driver.get(urljoin(base, 'business-settings'))
    wait.until(EC.presence_of_element_located((By.XPATH, "//h1[contains(., 'Business Settings')]")))
    address = wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, "textarea")))
    wait.until(lambda d: (suffix in ((d.find_element(By.CSS_SELECTOR, 'textarea').get_attribute('value') or '').strip())))

    # Revert to the original address and save again
    address = driver.find_element(By.CSS_SELECTOR, 'textarea')
    address.clear()
    address.send_keys(original_addr)
    # Click Save again
    save_btn = wait.until(EC.element_to_be_clickable(save_locator))
    save_btn.click()
    try:
        WebDriverWait(driver, 3).until(EC.alert_is_present())
        driver.switch_to.alert.accept()
    except NoAlertPresentException:
        pass
    except Exception:
        pass
    # Reload and verify revert
    time.sleep(0.5)
    driver.get(urljoin(base, 'business-settings'))
    wait.until(EC.presence_of_element_located((By.XPATH, "//h1[contains(., 'Business Settings')]")))
    wait.until(lambda d: ((d.find_element(By.CSS_SELECTOR, 'textarea').get_attribute('value') or '').strip()) == ((original_addr or '').strip()))

    print('Business Settings E2E test passed for tenant:', args.tenant)
    driver.quit()


if __name__ == '__main__':
    main()
