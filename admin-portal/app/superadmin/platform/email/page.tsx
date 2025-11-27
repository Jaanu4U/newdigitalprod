"use client";
import { useEffect, useState } from 'react';
import { withTenantHeaders } from '@/lib/tenant';
import { apiBase } from '@/lib/api';
import { Loader2, Save, Mail, AlertCircle, CheckCircle2 } from "lucide-react";
import SuperAdminHeader from "@/components/SuperAdminHeader";

interface MailgunConfigMasked {
  domain?: string | null;
  from_email?: string | null;
  api_key_present?: boolean;
}

export default function PlatformEmailPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [provider, setProvider] = useState<string>('');
  const [mailgun, setMailgun] = useState<MailgunConfigMasked>({});
  const [apiKeyInput, setApiKeyInput] = useState<string>('');
  const [testRecipient, setTestRecipient] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState<string>('');

  useEffect(() => {
    let ignore = false;
    async function load() {
      setLoading(true);
      try {
        const token = localStorage.getItem("dc_access");
        const em = localStorage.getItem("dc_email") || "";
        if (!ignore) setEmail(em);
        
        const res = await fetch(`${apiBase()}v1/platform/email-config`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        if (!res.ok) throw new Error('Failed to load config');
        const data = await res.json();
        if (!ignore) {
          setProvider(data.provider || '');
          setMailgun(data.mailgun || {});
        }
      } catch (e: any) {
        if (!ignore) setError(e.message || 'Load error');
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    load();
    return () => { ignore = true; };
  }, []);

  async function save() {
    setSaving(true); setMessage(null); setError(null);
    try {
      const token = localStorage.getItem("dc_access");
      const payload: any = { provider };
      if (provider === 'mailgun') {
        payload.mailgun = {
          domain: mailgun.domain || '',
          from_email: mailgun.from_email || '',
          api_key: apiKeyInput || undefined,
        };
      }
      const res = await fetch(`${apiBase()}v1/platform/email-config`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || 'Save failed');
      }
      setMessage('Saved changes');
      if (apiKeyInput) {
        setMailgun(m => ({ ...m, api_key_present: true }));
        setApiKeyInput('');
      }
    } catch (e: any) {
      setError(e.message || 'Save error');
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    setTesting(true); setMessage(null); setError(null);
    try {
      const token = localStorage.getItem("dc_access");
      if (!testRecipient) throw new Error('Enter test recipient');
      const res = await fetch(`${apiBase()}v1/platform/email-config/test`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ to: testRecipient }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Test failed');
      setMessage('Test email sent');
    } catch (e: any) {
      setError(e.message || 'Test error');
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <SuperAdminHeader email={email} activeTab="email" />

      <div className="max-w-3xl mx-auto p-4">
      <h1 className="text-xl font-semibold mb-4">Platform Email Configuration</h1>
      <p className="text-sm text-gray-600 mb-6">SuperAdmin global email settings used for organization registration verification and platform notifications. Operational/org emails still use org-level SMTP settings.</p>
      {loading && <div>Loading...</div>}
      {!loading && (
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium mb-1">Provider</label>
            <select value={provider} onChange={e => setProvider(e.target.value)} className="border rounded px-2 py-1">
              <option value="">None</option>
              <option value="mailgun">Mailgun</option>
            </select>
          </div>
          {provider === 'mailgun' && (
            <div className="space-y-4 border rounded p-4 bg-gray-50">
              <div>
                <label className="block text-xs font-medium uppercase mb-1">Domain</label>
                <input value={mailgun.domain || ''} onChange={e => setMailgun(m => ({ ...m, domain: e.target.value }))} className="border rounded px-2 py-1 w-full" placeholder="mg.yourdomain.com" />
              </div>
              <div>
                <label className="block text-xs font-medium uppercase mb-1">From Email (optional)</label>
                <input value={mailgun.from_email || ''} onChange={e => setMailgun(m => ({ ...m, from_email: e.target.value }))} className="border rounded px-2 py-1 w-full" placeholder="postmaster@mg.yourdomain.com" />
              </div>
              <div>
                <label className="block text-xs font-medium uppercase mb-1">API Key</label>
                <div className="flex gap-2 items-center">
                  <input value={apiKeyInput} onChange={e => setApiKeyInput(e.target.value)} className="border rounded px-2 py-1 flex-1" placeholder={mailgun.api_key_present ? '•••••• present (enter to replace)' : 'key-xxxxxxxx'} />
                  <button disabled={saving} onClick={save} className="px-3 py-1 rounded bg-brand-600 text-white text-sm disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
                </div>
                <p className="text-xs text-gray-500 mt-1">Secret is never shown once saved. Enter a new key to replace.</p>
              </div>
            </div>
          )}
          <div className="border rounded p-4">
            <h2 className="font-medium mb-2 text-sm">Test Email</h2>
            <div className="flex gap-2 items-center">
              <input value={testRecipient} onChange={e => setTestRecipient(e.target.value)} className="border rounded px-2 py-1 flex-1" placeholder="you@example.com" />
              <button disabled={testing} onClick={sendTest} className="px-3 py-1 rounded bg-brand-700 text-white text-sm disabled:opacity-50">{testing ? 'Sending…' : 'Send Test'}</button>
            </div>
            <p className="text-xs text-gray-500 mt-1">Sends using current saved provider configuration.</p>
          </div>

          {(message || error) && (
            <div className={"text-sm rounded p-2 " + (error ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700')}>
              {error || message}
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  );
}
