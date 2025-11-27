"use client";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Package, Home, LogOut, Menu, X, MapPin } from "lucide-react";
import Link from "next/link";

export default function RiderNavBar() {
  const router = useRouter();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [riderName, setRiderName] = useState<string>("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    try {
      const name = localStorage.getItem("dc_name") || "Rider";
      setRiderName(name);
    } catch {}
  }, [mounted]);

  const handleLogout = () => {
    try {
      localStorage.removeItem("dc_access");
      localStorage.removeItem("dc_refresh");
      localStorage.removeItem("dc_role");
      localStorage.removeItem("dc_name");
      router.push("/login");
    } catch {
      router.push("/login");
    }
  };

  const navLinks = [
    { href: "/rider/dashboard", label: "Dashboard", icon: Home },
    { href: "/rider/orders", label: "My Orders", icon: Package },
  ];

  return (
    <nav className="bg-blue-600 text-white shadow-md">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo/Brand */}
          <div className="flex items-center gap-2">
            <MapPin size={24} />
            <span className="font-bold text-lg">Rider App</span>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
                    isActive
                      ? "bg-blue-700"
                      : "hover:bg-blue-500"
                  }`}
                >
                  <link.icon size={18} />
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </div>

          {/* User Info & Logout */}
          <div className="hidden md:flex items-center gap-3">
            <span className="text-sm">
              {mounted ? riderName : "Loading..."}
            </span>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2 bg-blue-700 hover:bg-blue-800 rounded-md transition-colors"
            >
              <LogOut size={18} />
              <span>Logout</span>
            </button>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-md hover:bg-blue-500"
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-blue-500 py-3 space-y-1">
            {navLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-2 px-4 py-3 rounded-md transition-colors ${
                    isActive
                      ? "bg-blue-700"
                      : "hover:bg-blue-500"
                  }`}
                >
                  <link.icon size={18} />
                  <span>{link.label}</span>
                </Link>
              );
            })}
            <div className="px-4 py-2 text-sm border-t border-blue-500 mt-2 pt-3">
              <p className="mb-2">{mounted ? riderName : "Loading..."}</p>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-2 bg-blue-700 hover:bg-blue-800 rounded-md transition-colors w-full"
              >
                <LogOut size={18} />
                <span>Logout</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
