"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiBase } from "@/lib/api";
import { getTenantSlugFromHost, withTenantHeaders } from "@/lib/tenant";
import { Check, KeyRound, Loader2 } from "lucide-react";

interface Me {
  user_id: string;
  email: string;
  name: string | null;
  cellnumber: string | null;
  role: string;
  team: string | null;
  status: string;
  created_at: string | null;
}

export default function SettingsPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string>("");

  const [name, setName] = useState("");
  const [cell, setCell] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const base = useMemo(() => apiBase(), []);

  useEffect(() => {
    const t = localStorage.getItem("dc_access") || "";
    if (!t) {
      router.push("/login");
      return;
    }
    setToken(t);
    fetchMe(t);
  }, [router]);

  const fetchMe = async (accessToken: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${base}me`, withTenantHeaders({
        headers: { Authorization: `Bearer ${accessToken}` },
      }));
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMe(data);
      setName(data.name || "");
      setCell(data.cellnumber || "");
    } catch (e: any) {
      setError(e.message || "Failed to load settings");
    } finally {
      setLoading(false);
    }
  };

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${base}me`, withTenantHeaders({
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name, cellnumber: cell }),
      }));
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || `HTTP ${res.status}`);
      }
      await fetchMe(token);
      alert("Profile updated");
    } catch (e: any) {
      setError(e.message || "Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      alert("Passwords do not match");
      return;
    }
    setPwSaving(true);
    setError(null);
    try {
      const res = await fetch(`${base}me/password`, withTenantHeaders({
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      }));
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || `HTTP ${res.status}`);
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      alert("Password changed");
    } catch (e: any) {
      setError(e.message || "Failed to change password");
    } finally {
      setPwSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex items-center gap-2 text-gray-600">
          <Loader2 className="animate-spin" /> Loading settings...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-semibold text-gray-900 mb-6">Account Settings</h1>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 mb-4">{error}</div>
        )}

        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Profile</h2>
          <form onSubmit={saveProfile} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="Your name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input
                type="tel"
                value={cell}
                onChange={(e) => setCell(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="+1 (555) 000-0000"
              />
            </div>
            <div className="md:col-span-2 flex justify-end gap-2 pt-2">
              <button type="submit" disabled={saving} className="px-4 py-2 rounded-md bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50">
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Change Password</h2>
          <form onSubmit={changePassword} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="Current password"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="At least 8 characters"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="Re-enter new password"
                required
              />
            </div>
            <div className="md:col-span-2 flex justify-end gap-2 pt-2">
              <button type="submit" disabled={pwSaving} className="px-4 py-2 rounded-md bg-gray-800 text-white hover:bg-black disabled:opacity-50">
                {pwSaving ? "Updating..." : "Update Password"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
