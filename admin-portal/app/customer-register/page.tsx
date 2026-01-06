"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiBase } from '@/lib/api';
import { withTenantHeaders } from '@/lib/tenant';
import { User, Building2, Mail, Phone, MapPin, Lock, ArrowLeft } from 'lucide-react';

export default function CustomerRegister() {
  const router = useRouter();
  const [customerType, setCustomerType] = useState<'retail' | 'business' | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [existingEmail, setExistingEmail] = useState('');

  // Form fields
  const [name, setName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Photon address autocomplete
  const [addressSuggestions, setAddressSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchingAddress, setSearchingAddress] = useState(false);

  // Debounced address search
  useEffect(() => {
    if (!address || address.length < 3) {
      setAddressSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearchingAddress(true);
      try {
        // Use Photon API with India bias (center of India)
        const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(address)}&limit=10&lat=20.5937&lon=78.9629`);
        const data = await res.json();
        
        // Filter and prioritize India addresses
        const features = (data.features || [])
          .filter((f: any) => f.properties.country === 'India' || f.properties.countrycode === 'IN')
          .slice(0, 5);
        
        setAddressSuggestions(features);
        setShowSuggestions(true);
      } catch (err) {
        console.error('Address search failed:', err);
        setAddressSuggestions([]);
      } finally {
        setSearchingAddress(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [address]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!customerType) {
      setError('Please select customer type');
      return;
    }

    if (customerType === 'retail' && !name) {
      setError('Please enter your name');
      return;
    }

    if (customerType === 'business' && (!businessName || !contactPerson)) {
      setError('Please enter business name and contact person');
      return;
    }

    if (!email || !phone || !address) {
      setError('Please fill in all required fields');
      return;
    }

    if (!password || password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      const payload = {
        ctype: customerType === 'retail' ? 'b2c' : 'b2b',
        name: customerType === 'retail' ? name : contactPerson,
        company_name: customerType === 'business' ? businessName : null,
        email,
        phone,
        address,
        password,
      };

      const res = await fetch(`${apiBase()}customer-portal/register`, withTenantHeaders({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }));

      const data = await res.json();

      if (!res.ok) {
        // Check if email already exists
        if (res.status === 400 && data.detail?.includes('email already exists')) {
          setExistingEmail(email);
          setShowPasswordReset(true);
          setError(null);
          return;
        }
        throw new Error(data.detail || 'Registration failed');
      }

      // Show verification link if provided (for testing)
      if (data.verification_link) {
        console.log('Email Verification Link:', data.verification_link);
        alert(`Registration successful! \n\nVerification link: ${data.verification_link}\n\nIn production, this will be sent via email.`);
      }

      setSuccess(true);
      setTimeout(() => {
        router.push('/customer-login');
      }, 3000);
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${apiBase()}customer-portal/request-password-reset`, withTenantHeaders({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: existingEmail }),
      }));

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Password reset request failed');
      }

      setSuccess(true);
      setShowPasswordReset(false);
      setError('Password reset link sent to your email. Please check your inbox.');
    } catch (err: any) {
      setError(err.message || 'Password reset failed');
    } finally {
      setLoading(false);
    }
  };

  if (showPasswordReset) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Mail className="w-8 h-8 text-yellow-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Email Already Registered</h2>
            <p className="text-gray-600">
              The email <strong>{existingEmail}</strong> is already registered.
            </p>
          </div>

          <div className="space-y-4">
            <button
              onClick={handlePasswordReset}
              disabled={loading}
              className="w-full px-6 py-3 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Sending...' : 'Reset Password'}
            </button>

            <button
              onClick={() => router.push('/customer-login')}
              className="w-full px-6 py-3 bg-gray-100 text-gray-700 font-semibold rounded-lg hover:bg-gray-200 transition-colors"
            >
              Go to Login
            </button>

            <button
              onClick={() => {
                setShowPasswordReset(false);
                setEmail('');
                setExistingEmail('');
              }}
              className="w-full px-6 py-3 text-gray-600 hover:text-gray-800 transition-colors"
            >
              Use Different Email
            </button>
          </div>

          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Mail className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Registration Successful!</h2>
          <p className="text-gray-600 mb-2">
            Thank you for registering! We've sent a verification email to your email address.
          </p>
          <p className="text-gray-700 font-semibold mb-4">
            Please check your inbox and verify your email to activate your account.
          </p>
          <p className="text-sm text-gray-500 mb-6">
            Redirecting to login page...
          </p>
          <button
            onClick={() => router.push('/customer-login')}
            className="px-6 py-3 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 transition-colors"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <button
            onClick={() => router.push('/')}
            className="inline-flex items-center gap-2 text-purple-700 hover:text-purple-800 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </button>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Create Account</h1>
          <p className="text-gray-600">Join us for seamless delivery tracking</p>
        </div>

        {/* Customer Type Selection */}
        {!customerType && (
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">Select Account Type</h2>
            <div className="grid md:grid-cols-2 gap-6">
              <button
                onClick={() => setCustomerType('retail')}
                className="p-8 border-2 border-gray-200 rounded-xl hover:border-purple-600 hover:bg-purple-50 transition-all group"
              >
                <User className="w-12 h-12 text-purple-600 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-gray-900 mb-2">Retail Customer</h3>
                <p className="text-gray-600 text-sm">For individual customers</p>
              </button>

              <button
                onClick={() => setCustomerType('business')}
                className="p-8 border-2 border-gray-200 rounded-xl hover:border-indigo-600 hover:bg-indigo-50 transition-all group"
              >
                <Building2 className="w-12 h-12 text-indigo-600 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-gray-900 mb-2">Business</h3>
                <p className="text-gray-600 text-sm">For companies and organizations</p>
              </button>
            </div>
          </div>
        )}

        {/* Registration Form */}
        {customerType && (
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900">
                {customerType === 'retail' ? 'Retail' : 'Business'} Registration
              </h2>
              <button
                onClick={() => {
                  setCustomerType(null);
                  setName('');
                  setBusinessName('');
                  setContactPerson('');
                  setEmail('');
                  setPhone('');
                  setAddress('');
                  setPassword('');
                  setConfirmPassword('');
                }}
                className="text-sm text-purple-700 hover:text-purple-800"
              >
                Change Type
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Retail Fields */}
              {customerType === 'retail' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Full Name *
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full pl-11 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600"
                      placeholder="John Doe"
                      required
                    />
                  </div>
                </div>
              )}

              {/* Business Fields */}
              {customerType === 'business' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Business Name *
                    </label>
                    <div className="relative">
                      <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        type="text"
                        value={businessName}
                        onChange={(e) => setBusinessName(e.target.value)}
                        className="w-full pl-11 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600"
                        placeholder="Acme Corporation"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Contact Person *
                    </label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        type="text"
                        value={contactPerson}
                        onChange={(e) => setContactPerson(e.target.value)}
                        className="w-full pl-11 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600"
                        placeholder="John Doe"
                        required
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Common Fields */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email Address *
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600"
                    placeholder="you@example.com"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Phone Number *
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600"
                    placeholder="+1 234 567 8900"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Address *
                </label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 z-10" />
                  <input
                    id="address-input"
                    type="text"
                    value={address}
                    onChange={(e) => {
                      setAddress(e.target.value);
                      setShowSuggestions(true);
                    }}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                    className="w-full pl-11 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600"
                    placeholder="Start typing your address..."
                    required
                  />
                  
                  {/* Address suggestions dropdown */}
                  {showSuggestions && addressSuggestions.length > 0 && (
                    <div className="absolute z-20 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {addressSuggestions.map((suggestion, idx) => {
                        const props = suggestion.properties;
                        const displayName = props.name || '';
                        const displayAddress = [props.street, props.city, props.state, props.country].filter(Boolean).join(', ');
                        const fullAddress = [displayName, displayAddress].filter(Boolean).join(', ');
                        
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => {
                              setAddress(fullAddress);
                              setShowSuggestions(false);
                            }}
                            className="w-full px-4 py-3 text-left hover:bg-purple-50 border-b last:border-b-0 transition-colors"
                          >
                            <div className="font-medium text-gray-900">{displayName}</div>
                            <div className="text-sm text-gray-600">{displayAddress}</div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  
                  {searchingAddress && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-purple-600"></div>
                    </div>
                  )}
                </div>
                <p className="mt-1 text-xs text-gray-500">Start typing to search for your address (powered by Photon)</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Password *
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600"
                    placeholder="Minimum 8 characters"
                    required
                    minLength={8}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Confirm Password *
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600"
                    placeholder="Re-enter password"
                    required
                    minLength={8}
                  />
                </div>
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full px-6 py-3 bg-purple-600 text-white font-bold rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
              >
                {loading ? 'Creating Account...' : 'Create Account'}
              </button>

              <div className="text-center text-sm text-gray-600">
                Already have an account?{' '}
                <a href="/customer-login" className="text-purple-700 font-medium hover:text-purple-800">
                  Login here
                </a>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
