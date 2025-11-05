"use client";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { ChevronDown, Package, LogOut, LayoutDashboard, LogIn, Menu, Settings } from "lucide-react";
import { getTenantSlugFromHost } from "@/lib/tenant";

export default function NavBar({ onToggleSidebar, sidebarOpen }: { onToggleSidebar?: () => void; sidebarOpen?: boolean }) {
  const [open, setOpen] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [slug, setSlug] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  const syncAuth = () => {
    try {
      const token = localStorage.getItem("dc_access");
      const em = localStorage.getItem("dc_email");
      setAuthed(!!token);
      setEmail(em);
    } catch {}
  };

  useEffect(() => {
    syncAuth();
    try {
      setSlug(getTenantSlugFromHost());
    } catch {}
    try {
      setRole(localStorage.getItem("dc_role"));
    } catch {}
    const onStorage = (e: StorageEvent) => {
      if (e.key && ["dc_access", "dc_email", "dc_refresh", "dc_org"].includes(e.key)) {
        syncAuth();
      }
    };
    const onVisibility = () => document.visibilityState === "visible" && syncAuth();
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update auth UI on route changes as well
  useEffect(() => {
    syncAuth();
    try {
      setSlug(getTenantSlugFromHost());
    } catch {}
    try {
      setRole(localStorage.getItem("dc_role"));
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const logout = () => {
    try {
      localStorage.removeItem("dc_access");
      localStorage.removeItem("dc_refresh");
      localStorage.removeItem("dc_email");
      localStorage.removeItem("dc_role");
      localStorage.removeItem("dc_org_id");
    } catch {}
    // Ensure state reflects logout immediately, then navigate
    syncAuth();
    router.push("/login");
    router.refresh();
  };

  const dashboardHref = slug ? "/" : "/superadmin";
  const usersHref = slug ? "/org-users" : "/users";

  return (
    <div className="border-b bg-white">
      <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Mobile menu toggle */}
          <button onClick={onToggleSidebar} className="md:hidden inline-flex items-center justify-center p-2 rounded hover:bg-gray-100" aria-label="Toggle menu">
            <Menu size={18} />
          </button>
          <a href={dashboardHref} className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-brand-600" />
          <span className="text-lg font-semibold">Digitalchain</span>
          </a>
        </div>

        {!authed ? (
          <a href="/login" className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700">
            <LogIn size={16} /> Login
          </a>
        ) : (
          <div className="relative">
            <button onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-gray-100">
              <span className="hidden sm:inline">{email || "Account"}</span>
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-white">DC</span>
              <ChevronDown size={16} />
            </button>
            {open && (
              <div className="absolute right-0 mt-2 w-56 rounded-md border bg-white shadow-lg z-10">
                <div className="px-3 py-2 text-xs text-gray-500">Signed in as {email || "Admin"}</div>
                <a href={dashboardHref} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50"><LayoutDashboard size={16} /> Dashboard</a>
                {slug ? (
                  <>
                    <a href="/deliveries" className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50"><Package size={16} /> Deliveries</a>
                    <a href={usersHref} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50"><Package size={16} /> Users</a>
                    <a href="/settings" className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50"><Settings size={16} /> Settings</a>
                  </>
                ) : (
                  <>
                    <a href={usersHref} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50"><Package size={16} /> Users</a>
                    <a href="/settings" className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50"><Settings size={16} /> Settings</a>
                  </>
                )}
                <button onClick={logout} className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm text-blue-600 hover:bg-blue-50"><LogOut size={16} /> Logout</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
