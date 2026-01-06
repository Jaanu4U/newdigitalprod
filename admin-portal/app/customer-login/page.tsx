'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { apiBase } from '@/lib/api'
import { getTenantSlugFromHost, withTenantHeaders } from "@/lib/tenant"

export default function CustomerLogin() {
  const router = useRouter()
  const [emailOrPhone, setEmailOrPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showEmailVerification, setShowEmailVerification] = useState(false)
  const [verificationEmail, setVerificationEmail] = useState('')
  const [resendSuccess, setResendSuccess] = useState(false)
  const [resendLoading, setResendLoading] = useState(false)

  async function handleLogin(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const slug = getTenantSlugFromHost(window.location.hostname)
      
      const res = await fetch(`${apiBase()}auth/customer-login`, withTenantHeaders({
        method: 'POST',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email_or_phone: emailOrPhone,
          password: password,
          org_id: slug || undefined
        })
      }))

      const data = await res.json()

      if (!res.ok) {
        // Check if email not verified (403)
        if (res.status === 403 && data.detail?.includes('Email not verified')) {
          setVerificationEmail(emailOrPhone)
          setShowEmailVerification(true)
          setError('')
          setLoading(false)
          return
        }
        
        setError(data.detail || 'Login failed')
        setLoading(false)
        return
      }

      // Store tokens
      localStorage.setItem('dc_token', data.access_token)
      localStorage.setItem('dc_refresh', data.refresh_token)
      localStorage.setItem('dc_user', JSON.stringify(data.user))
      localStorage.setItem('dc_org_id', data.org_id)

      // Redirect to customer portal dashboard
      router.push('/customer/dashboard')
    } catch (err) {
      console.error('Login error:', err)
      setError('An error occurred during login')
      setLoading(false)
    }
  }

  async function handleResendVerification() {
    setResendLoading(true)
    setResendSuccess(false)

    try {
      const res = await fetch(`${apiBase()}customer-portal/resend-verification`, withTenantHeaders({
        method: 'POST',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: verificationEmail })
      }))

      if (res.ok) {
        const data = await res.json()
        setResendSuccess(true)
        
        // Log verification link to console for testing
        if (data.verification_link) {
          console.log('Verification Link:', data.verification_link)
          alert('Verification link logged to console. In production, this will be sent via email.')
        }
      }
    } catch (err) {
      console.error('Resend verification error:', err)
    } finally {
      setResendLoading(false)
    }
  }

  if (showEmailVerification) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Email Not Verified</h2>
            <p className="text-gray-600">
              Please verify your email address <strong>{verificationEmail}</strong> before logging in.
            </p>
          </div>

          {resendSuccess && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
              Verification email sent! Please check your inbox and spam folder.
            </div>
          )}

          <div className="space-y-4">
            <button
              onClick={handleResendVerification}
              disabled={resendLoading}
              className="w-full px-6 py-3 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {resendLoading ? 'Sending...' : 'Resend Verification Email'}
            </button>

            <button
              onClick={() => {
                setShowEmailVerification(false)
                setVerificationEmail('')
                setResendSuccess(false)
              }}
              className="w-full px-6 py-3 text-gray-600 hover:text-gray-800 transition-colors"
            >
              Back to Login
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Logo/Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl mb-4">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Customer Portal</h1>
          <p className="text-gray-600">Sign in to view your orders and account</p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
          <form onSubmit={handleLogin} className="space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="emailOrPhone" className="block text-sm font-medium text-gray-700 mb-2">
                Email or Phone Number
              </label>
              <input
                id="emailOrPhone"
                type="text"
                value={emailOrPhone}
                onChange={(e) => setEmailOrPhone(e.target.value)}
                placeholder="you@example.com or 9876543210"
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
              />
            </div>

            <div className="flex items-center justify-between text-sm">
              <a href="/customer-register" className="text-blue-600 hover:text-blue-700 font-medium">
                Create an account
              </a>
              <a href="/customer-forgot-password" className="text-gray-600 hover:text-gray-700">
                Forgot password?
              </a>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-3 px-4 rounded-lg font-medium hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl"
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Signing in...
                </span>
              ) : (
                'Sign In'
              )}
            </button>
          </form>
        </div>

        {/* Help Text */}
        <div className="mt-6 text-center text-sm text-gray-600">
          <p>Need help? Contact support at</p>
          <a href="mailto:support@digitalchain.in" className="text-blue-600 hover:text-blue-700 font-medium">
            support@digitalchain.in
          </a>
        </div>
      </div>
    </div>
  )
}
