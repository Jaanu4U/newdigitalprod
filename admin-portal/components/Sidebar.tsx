"use client";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { Home, Users, Package, X, ChevronLeft, ChevronRight } from "lucide-react";
import { getTenantSlugFromHost } from "@/lib/tenant";

export default function Sidebar({ isOpen, onClose, collapsed = false, onToggleCollapsed }: { isOpen: boolean; onClose: () => void; collapsed?: boolean; onToggleCollapsed?: () => void }) {
  const pathname = usePathname();
  const slug = useMemo(() => {
    try { return getTenantSlugFromHost(); } catch { return null; }
  }, []);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    try {
      setRole(localStorage.getItem("dc_role"));
    } catch {}
  }, []);

  const links = useMemo(() => {
    if (slug) {
      return [
        { href: "/", label: "Dashboard", icon: Home },
        { href: "/deliveries", label: "Deliveries", icon: Package },
        { href: "/org-users", label: "Users", icon: Users },
        { href: "/org-settings", label: "Org Settings", icon: Home },
      ];
    }
    return [
      { href: "/superadmin", label: "Dashboard", icon: Home },
      { href: "/users", label: "Users", icon: Users },
    ];
  }, [slug]);
  return (
    <>
      {/* Mobile overlay */}
      <div
        onClick={onClose}
        className={`fixed inset-0 bg-black/30 z-40 md:hidden transition-opacity duration-200 ${isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
        aria-hidden={!isOpen}
      />

      {/* Sidebar panel */}
      <aside
        className={
          `
          fixed md:static inset-y-0 left-0 z-50 md:z-auto
          w-64 ${collapsed ? "md:w-16" : "md:w-60"} shrink-0 bg-white md:bg-transparent border-r md:border-0
          transform transition-transform duration-200 md:transition-[width]
          ${isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
          hidden md:block
          `
        }
      >
        <div className="md:hidden flex items-center justify-between px-3 py-3 border-b">
          <span className="font-semibold">Menu</span>
          <button onClick={onClose} aria-label="Close menu" className="p-1 rounded hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>
        {/* Desktop: top control row with collapse/expand */}
        <div className="hidden md:flex items-center justify-end px-2 pt-3">
          <button
            onClick={onToggleCollapsed}
            className="inline-flex items-center justify-center rounded-md p-2 text-gray-600 hover:bg-gray-100"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand" : "Collapse"}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        <div className="p-3 md:p-0 md:sticky md:top-4 space-y-1">
          {links.map((l) => {
            const active = pathname === l.href;
            return (
              <a
                key={l.href}
                href={l.href}
                title={l.label}
                className={`${active ? "bg-brand-50 text-brand-700" : "text-gray-700 hover:bg-gray-50"} flex items-center gap-2 rounded-md px-3 py-2`}
              >
                <l.icon size={18} aria-hidden />
                <span className={`${collapsed ? "md:hidden inline" : "inline"}`}>{l.label}</span>
              </a>
            );
          })}
        </div>
      </aside>
    </>
  );
}
