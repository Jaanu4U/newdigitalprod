"use client";

import { useRouter } from "next/navigation";
import { BarChart3, Truck, Settings, Mail, LogOut, User } from "lucide-react";
import { useState } from "react";

interface SuperAdminHeaderProps {
  email?: string;
  activeTab?: 'dashboard' | 'providers' | 'platform' | 'email' | 'settings';
}

export default function SuperAdminHeader({ email, activeTab }: SuperAdminHeaderProps) {
  const router = useRouter();
  const [showDropdown, setShowDropdown] = useState(false);

  const handleLogout = () => {
    try {
      localStorage.removeItem("dc_access");
      localStorage.removeItem("dc_refresh");
      localStorage.removeItem("dc_email");
      localStorage.removeItem("dc_role");
      localStorage.removeItem("dc_org_id");
    } catch {}
    router.push("/superadmin/login");
  };

  return (
    <div className="bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-brand-600" />
              <span className="text-lg font-semibold">Digitalchain</span>
            </div>
            <nav className="hidden md:flex gap-2">
              <a
                href="/superadmin"
                className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md ${
                  activeTab === 'dashboard'
                    ? 'text-brand-600 bg-brand-50'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <BarChart3 size={16} /> Dashboard
              </a>
              <a
                href="/superadmin/providers"
                className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md ${
                  activeTab === 'providers'
                    ? 'text-brand-600 bg-brand-50'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <Truck size={16} /> Providers
              </a>
              <a
                href="/superadmin/platform"
                className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md ${
                  activeTab === 'platform'
                    ? 'text-brand-600 bg-brand-50'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <Settings size={16} /> Platform Settings
              </a>
              <a
                href="/superadmin/platform/email"
                className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md ${
                  activeTab === 'email'
                    ? 'text-brand-600 bg-brand-50'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <Mail size={16} /> Email Settings
              </a>
            </nav>
          </div>

          <div className="relative">
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium hover:bg-gray-100 rounded-md"
            >
              <span className="hidden sm:inline text-gray-700">{email || 'SuperAdmin'}</span>
              <div className="h-8 w-8 rounded-full bg-brand-600 flex items-center justify-center text-white text-xs font-medium">
                SA
              </div>
            </button>

            {showDropdown && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowDropdown(false)}
                />
                <div className="absolute right-0 mt-2 w-56 rounded-md border bg-white shadow-lg z-20">
                  <div className="px-4 py-3 border-b border-gray-200">
                    <p className="text-xs text-gray-500">Signed in as</p>
                    <p className="text-sm font-medium text-gray-900 truncate">{email || 'SuperAdmin'}</p>
                  </div>
                  <a
                    href="/superadmin/settings"
                    className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <User size={16} /> Account Settings
                  </a>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                  >
                    <LogOut size={16} /> Sign Out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Mobile Navigation */}
        <nav className="md:hidden flex flex-wrap gap-2 mt-4 pt-4 border-t">
          <a
            href="/superadmin"
            className={`inline-flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-md ${
              activeTab === 'dashboard'
                ? 'text-brand-600 bg-brand-50'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            <BarChart3 size={14} /> Dashboard
          </a>
          <a
            href="/superadmin/providers"
            className={`inline-flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-md ${
              activeTab === 'providers'
                ? 'text-brand-600 bg-brand-50'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            <Truck size={14} /> Providers
          </a>
          <a
            href="/superadmin/platform"
            className={`inline-flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-md ${
              activeTab === 'platform'
                ? 'text-brand-600 bg-brand-50'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            <Settings size={14} /> Platform
          </a>
          <a
            href="/superadmin/platform/email"
            className={`inline-flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-md ${
              activeTab === 'email'
                ? 'text-brand-600 bg-brand-50'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            <Mail size={14} /> Email
          </a>
        </nav>
      </div>
    </div>
  );
}
