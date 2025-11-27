"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");
  const [orgSlug, setOrgSlug] = useState<string | null>(null);

  useEffect(() => {
    const token = searchParams.get("token");
    
    if (!token) {
      setStatus("error");
      setMessage("Verification token is missing");
      return;
    }

    // Build API base URL
    const apiBase = process.env.NEXT_PUBLIC_API_BASE 
      ? (process.env.NEXT_PUBLIC_API_BASE.endsWith('/') ? process.env.NEXT_PUBLIC_API_BASE : process.env.NEXT_PUBLIC_API_BASE + '/')
      : (typeof window !== 'undefined' && window.location.hostname.endsWith('digitalchain.in'))
        ? 'https://api.digitalchain.in/v1/'
        : 'http://localhost:8000/v1/';

    // Verify the email
    fetch(`${apiBase}org/verify-email?token=${token}`)
      .then(async (res) => {
        const data = await res.json();
        
        if (res.ok) {
          setStatus("success");
          setMessage(data.message || "Email verified successfully!");
          setOrgSlug(data.org_slug);
          
          // Redirect to login after 3 seconds
          setTimeout(() => {
            if (data.org_slug) {
              window.location.href = `https://${data.org_slug}.digitalchain.in/login`;
            } else {
              router.push("/login");
            }
          }, 3000);
        } else {
          setStatus("error");
          setMessage(data.detail || "Verification failed");
        }
      })
      .catch((error) => {
        setStatus("error");
        setMessage("Failed to verify email. Please try again.");
        console.error("Verification error:", error);
      });
  }, [searchParams, router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-xl p-8">
        <div className="text-center">
          {/* Icon */}
          <div className="mb-6 flex justify-center">
            {status === "loading" && (
              <Loader2 className="h-16 w-16 text-blue-600 animate-spin" />
            )}
            {status === "success" && (
              <CheckCircle className="h-16 w-16 text-green-600" />
            )}
            {status === "error" && (
              <XCircle className="h-16 w-16 text-red-600" />
            )}
          </div>

          {/* Title */}
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            {status === "loading" && "Verifying Your Email..."}
            {status === "success" && "Email Verified!"}
            {status === "error" && "Verification Failed"}
          </h1>

          {/* Message */}
          <p className="text-gray-600 mb-6">
            {status === "loading" && "Please wait while we verify your email address."}
            {status === "success" && message}
            {status === "error" && message}
          </p>

          {/* Success - Redirect info */}
          {status === "success" && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-blue-800">
                Redirecting you to the login page...
              </p>
            </div>
          )}

          {/* Error - Action buttons */}
          {status === "error" && (
            <div className="space-y-3">
              <button
                onClick={() => router.push("/signup")}
                className="w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition"
              >
                Sign Up Again
              </button>
              <button
                onClick={() => router.push("/login")}
                className="w-full bg-gray-100 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-200 transition"
              >
                Go to Login
              </button>
            </div>
          )}

          {/* Loading - No action needed */}
          {status === "loading" && (
            <p className="text-xs text-gray-400">This may take a few moments...</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmail() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <Loader2 className="h-16 w-16 text-blue-600 animate-spin" />
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  );
}
