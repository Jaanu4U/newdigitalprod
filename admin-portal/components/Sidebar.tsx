"use client";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { Home, Users, Settings, ShoppingCart, Truck, UserCircle, MessageCircle, Smartphone, ClipboardCheck, ChevronLeft, ChevronRight, FileText } from "lucide-react";
import { getTenantSlugFromHost } from "@/lib/tenant";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
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
        { href: "/dashboard", label: "Dashboard", icon: Home },
        { href: "/orders", label: "Orders", icon: ShoppingCart },
        { href: "/purchase-orders", label: "Purchase Orders", icon: FileText },
        { href: "/audit", label: "Order Audit", icon: ClipboardCheck },
        { href: "/customers", label: "Customers", icon: UserCircle },
        { href: "/whatsapp", label: "WhatsApp", icon: MessageCircle },
        { href: "/org-users", label: "Users", icon: Users },
        { href: "/apps", label: "Mobile Apps", icon: Smartphone },
        { href: "/settings", label: "Settings", icon: Settings },
      ];
    }
    return [
      { href: "/superadmin", label: "Dashboard", icon: Home },
      { href: "/superadmin/providers", label: "Providers", icon: Truck },
      { href: "/superadmin/platform", label: "Platform Settings", icon: Settings },
      { href: "/users", label: "Users", icon: Users },
    ];
  }, [slug]);

  return (
    <aside 
      className={`
        fixed left-0 top-16 h-[calc(100vh-4rem)] bg-gradient-to-b from-slate-50 to-white border-r border-gray-200 shadow-lg overflow-y-auto transition-all duration-300
        ${collapsed ? 'w-20' : 'w-64'}
      `}
    >
      {/* Toggle Button */}
      <div className="flex items-center justify-end p-2 border-b border-gray-200">
        <button
          onClick={onToggle}
          className="p-2 rounded-lg hover:bg-blue-50 text-gray-600 hover:text-blue-600 transition-colors"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
        </button>
      </div>

      <div className="p-2 space-y-1">
        {links.map((l) => {
          const active = pathname === l.href;
          return (
            <a
              key={l.href}
              href={l.href}
              title={l.label}
              className={`
                group flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all duration-200
                ${active 
                  ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/30" 
                  : "text-gray-700 hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 hover:shadow-md"
                }
                ${collapsed ? 'justify-center' : ''}
              `}
            >
              <l.icon 
                size={20} 
                className={`transition-transform duration-200 ${active ? "" : "group-hover:scale-110"} ${collapsed ? '' : 'flex-shrink-0'}`}
              />
              {!collapsed && <span className="text-sm">{l.label}</span>}
            </a>
          );
        })}
      </div>
    </aside>
  );
}
