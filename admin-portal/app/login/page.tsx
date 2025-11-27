"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Lock, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { getTenantSlugFromHost, withTenantHeaders } from "@/lib/tenant";
import { apiBase } from "@/lib/api";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orgExists, setOrgExists] = useState<boolean | null>(null);
  const [showResendButton, setShowResendButton] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  const slug = getTenantSlugFromHost();

  // If on apex, redirect to dedicated SuperAdmin login page
  useEffect(() => {
    if (!slug) {
      router.replace("/superadmin/login");
    }
  }, [slug, router]);

  // Check if already logged in (SuperAdmin)
  useEffect(() => {
    const token = localStorage.getItem("dc_access");
    const role = localStorage.getItem("dc_role");
    if (token && role === "SuperAdmin" && !slug) {
      router.push("/superadmin");
    }
  }, [router, slug]);

  // When on a subdomain, verify that organization exists (invert availability)
  useEffect(() => {
    let alive = true;
    async function run() {
      if (!slug) { setOrgExists(null); return; }
      try {
  const r = await fetch(`${apiBase()}v1/org/check?slug=${encodeURIComponent(slug)}`, { cache: "no-store" });
        const j = await r.json().catch(()=>({}));
        const available = Boolean(j?.slug?.available);
        if (alive) setOrgExists(!available); // exists = !available
      } catch {
        if (alive) setOrgExists(null);
      }
    }
    run();
    return () => { alive = false };
  }, [slug]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Please fill in email and password.");
      return;
    }
    if (slug && orgExists === false) {
      setError("Organization not found for this subdomain.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      if (slug) {
        // Tenant org login (host or X-Org resolves org)
  const res = await fetch(`${apiBase()}v1/auth/login`, withTenantHeaders({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password })
        }));
        if (!res.ok) {
          const data = await res.json().catch(()=>({}));
          // Check if email not verified (403)
          if (res.status === 403) {
            setError("Email not verified. Please verify your email before logging in.");
            setShowResendButton(true);
            setLoading(false);
            return;
          }
          throw new Error(data.detail ?? "Login failed");
        }
        const data = await res.json();
        localStorage.setItem("dc_access", data.access_token);
        localStorage.setItem("dc_refresh", data.refresh_token);
        localStorage.setItem("dc_email", email);
        localStorage.setItem("dc_role", data.user?.role || "User");
        localStorage.setItem("dc_org_id", data.org_id || "");
        router.push("/dashboard");
        return;
      }

      // SuperAdmin login on apex
  const res = await fetch(`${apiBase()}v1/auth/superadmin-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail ?? "Login failed");
      }
      const data = await res.json();
      localStorage.setItem("dc_access", data.access_token);
      localStorage.setItem("dc_refresh", data.refresh_token);
      localStorage.setItem("dc_email", email);
      localStorage.setItem("dc_role", "SuperAdmin");
      localStorage.setItem("dc_organizations", JSON.stringify(data.organizations || []));
      router.push("/superadmin");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!email) return;
    setResendLoading(true);
    setResendSuccess(false);
    try {
      const res = await fetch(`${apiBase()}v1/org/resend-verification?email=${encodeURIComponent(email)}`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Failed to resend verification email");
      }
      setResendSuccess(true);
      setError("Verification email sent! Please check your inbox and spam folder.");
      setShowResendButton(false);
    } catch (err: any) {
      setError(err.message || "Failed to resend verification email");
    } finally {
      setResendLoading(false);
    }
  };

  const title = slug ? "Organization Login" : "Redirecting…";
  const subtitle = slug
    ? (orgExists === false
        ? "This organization does not exist."
        : "Sign in to your organization's admin portal")
    : "Taking you to SuperAdmin login";

  return (
    <main className="min-h-[80vh] grid md:grid-cols-2 gap-0 items-stretch">
      {/* Left brand panel */}
      <div className="hidden md:flex relative overflow-hidden rounded-xl border border-gray-200 bg-gradient-to-br from-brand-600 to-brand-800 text-white">
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 20% 20%, rgba(255,255,255,.2) 0, transparent 40%), radial-gradient(circle at 80% 0%, rgba(255,255,255,.2) 0, transparent 40%)" }} />
        <div className="relative z-10 p-10 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-white/20" />
              <div>
                <div className="text-xl font-semibold">Digitalchain</div>
                <div className="text-white/80 text-sm">{slug ? "Organization Portal" : "SuperAdmin Portal"}</div>
              </div>
            </div>
            <div className="mt-10 space-y-3 text-white/90">
              {slug ? (
                <>
                  <div className="flex items-center gap-2"><ShieldCheck size={18} /> Secure access for your organization</div>
                  <div className="flex items-center gap-2"><ShieldCheck size={18} /> Manage users and deliveries</div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2"><ShieldCheck size={18} /> Platform-wide access and control</div>
                  <div className="flex items-center gap-2"><ShieldCheck size={18} /> Monitor all organizations</div>
                  <div className="flex items-center gap-2"><ShieldCheck size={18} /> View activities and analytics</div>
                </>
              )}
            </div>
          </div>
          <div className="text-white/70 text-sm">© {new Date().getFullYear()} Digitalchain {slug ? "Org" : "SuperAdmin"}</div>
        </div>
      </div>

      {/* Right form card */}
      <div className="flex items-center justify-center">
        <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
            <p className={`text-sm mt-2 ${orgExists === false ? 'text-red-600' : 'text-gray-600'}`}>{subtitle}</p>
            {slug && orgExists === false && (
              <p className="text-xs mt-1 text-gray-500">Use root site to create it: <a className="text-blue-600 underline" href="https://digitalchain.in/signup" target="_blank" rel="noreferrer">digitalchain.in/signup</a></p>
            )}
          </div>

          {error && (
            <div className={`mb-4 rounded-md border ${resendSuccess ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700'} px-3 py-2 text-sm`}>
              {error}
              {showResendButton && (
                <button
                  type="button"
                  onClick={handleResendVerification}
                  disabled={resendLoading}
                  className="mt-2 w-full inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 transition-colors"
                >
                  {resendLoading ? "Sending..." : "Resend Verification Email"}
                </button>
              )}
            </div>
          )}

          <form onSubmit={onSubmit} className="grid gap-4">
            {/* Email Field */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                  className="w-full rounded-md border border-gray-300 pl-10 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder={slug ? "you@company.com" : "admin@example.com"}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                  className="w-full rounded-md border border-gray-300 pl-10 pr-10 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="••••••••"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  aria-label="Toggle password"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-700"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {slug ? (
              <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                <strong>Organization:</strong> {slug}.digitalchain.in
              </div>
            ) : (
              <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                <strong>SuperAdmin Access:</strong> Full platform access with monitoring capabilities for all organizations.
              </div>
            )}

            {/* Sign In Button */}
            <div className="pt-2">
              <button
                disabled={loading || (slug ? orgExists === false : false)}
                type="submit"
                className="w-full inline-flex items-center justify-center gap-2 rounded-md px-4 py-3 text-base font-bold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-60 shadow-md transition-colors"
              >
                {loading ? "Signing in…" : "Sign in to Dashboard"}
              </button>
            </div>

            {/* Footer */}
            <div className="text-center text-xs text-gray-500 mt-4">
              {slug ? (
                <>Need an account? <a className="text-blue-600 underline" href="https://digitalchain.in/signup" target="_blank" rel="noreferrer">Create organization</a></>
              ) : (
                <>Authorised SuperAdmin users only</>
              )}
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}

