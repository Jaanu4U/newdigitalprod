"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Mail, Loader2, CheckCircle } from "lucide-react";

function apiBase() {
  if (process.env.NEXT_PUBLIC_API_BASE) {
    const b = process.env.NEXT_PUBLIC_API_BASE;
    return b.endsWith('/') ? b : b + '/';
  }
  if (typeof window !== 'undefined') {
    const h = window.location.hostname
    if (h.endsWith('digitalchain.in')) return 'https://api.digitalchain.in/v1/'
  }
  return 'http://localhost:8000/v1/'
}

function VerifyPendingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams?.get("email") || "";
  
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleResend = async () => {
    if (!email) {
      setError("Email address is required");
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      const res = await fetch(`${apiBase()}org/resend-verification?email=${encodeURIComponent(email)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const data = await res.json();

      if (res.ok) {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 5000);
      } else {
        setError(data.detail || 'Failed to resend verification email');
      }
    } catch (err: any) {
      setError('Failed to resend verification email. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-xl p-8">
        <div className="text-center">
          {/* Icon */}
          <div className="mb-6 flex justify-center">
            <Mail className="h-16 w-16 text-blue-600" />
          </div>

          {/* Title */}
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            Email Verification Required
          </h1>

          {/* Message */}
          <p className="text-gray-600 mb-2">
            Your email address <strong>{email}</strong> has not been verified yet.
          </p>
          <p className="text-gray-600 mb-6">
            Please check your inbox and click the verification link to activate your account.
          </p>

          {/* Success message */}
          {success && (
            <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
              <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
              <p className="text-sm text-green-800">
                Verification email has been sent! Please check your inbox.
              </p>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Info box */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 text-left">
            <p className="text-sm text-blue-800 mb-2">
              <strong>Didn't receive the email?</strong>
            </p>
            <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
              <li>Check your spam or junk folder</li>
              <li>Make sure {email} is correct</li>
              <li>Wait a few minutes for delivery</li>
            </ul>
          </div>

          {/* Action buttons */}
          <div className="space-y-3">
            <button
              onClick={handleResend}
              disabled={loading || success}
              className="w-full bg-blue-600 text-white px-4 py-3 rounded-md hover:bg-blue-700 transition disabled:bg-blue-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Sending...
                </>
              ) : success ? (
                <>
                  <CheckCircle className="h-5 w-5" />
                  Email Sent!
                </>
              ) : (
                'Resend Verification Email'
              )}
            </button>

            <button
              onClick={() => router.push('/login')}
              className="w-full bg-gray-100 text-gray-700 px-4 py-3 rounded-md hover:bg-gray-200 transition"
            >
              Back to Login
            </button>
          </div>

          {/* Help text */}
          <p className="text-xs text-gray-500 mt-6">
            Need help? Contact support at support@digitalchain.in
          </p>
        </div>
      </div>
    </div>
  );
}

export default function VerifyPendingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <Loader2 className="h-16 w-16 text-blue-600 animate-spin" />
      </div>
    }>
      <VerifyPendingContent />
    </Suspense>
  );
}
