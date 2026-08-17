// src/pages/customer/Login.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginCustomer, saveCustomerSession } from '../../api';
import { Eye, EyeOff } from 'lucide-react';
import { applyTheme, readStoredTheme } from '@/lib/theme';

const Login: React.FC = () => {
  const [customerCode, setCustomerCode] = useState('');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [showForgotInfo, setShowForgotInfo] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    applyTheme('light', { persist: false });
    return () => {
      applyTheme(readStoredTheme(), { persist: false });
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const data = await loginCustomer(customerCode.trim(), pin.trim());
      saveCustomerSession(data);
      navigate('/customer/dashboard');
    } catch (err: any) {
      setError(err.message || 'Invalid Customer ID or PIN. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8" style={{ colorScheme: 'light' }}>
      <div className="w-full max-w-5xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col lg:flex-row">
        
        {/* Left Side - Brand Section (desktop only) */}
        <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 p-12 flex-col justify-between relative overflow-hidden">
          {/* Decorative lines */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="absolute top-0 left-1/4 w-px h-full bg-gradient-to-b from-transparent via-white/20 to-transparent" />
            <div className="absolute top-0 right-1/3 w-px h-full bg-gradient-to-b from-transparent via-white/15 to-transparent" />
            <div className="absolute top-1/3 left-0 w-full h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
            <div className="absolute bottom-1/4 left-0 w-full h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          </div>

          <div className="relative z-10 flex flex-col h-full justify-between">
            <div>
              <div className="bg-white rounded-2xl p-5 inline-block shadow-xl border border-white/20 mb-10">
                <img
                  src="/vobiss-logo.png"
                  alt="Vobiss"
                  className="h-20 w-auto object-contain"
                />
              </div>

              <div className="text-white">
                <h2 className="text-4xl font-bold mb-4">Customer Portal</h2>
                <p className="text-xl text-indigo-100 mb-3">
                  Real-time support • Ticket tracking • Direct team access
                </p>
                <p className="text-indigo-200 leading-relaxed">
                  View ticket status, receive updates, upload files, and communicate securely with your dedicated support team.
                </p>
              </div>
            </div>

            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20 shadow-[var(--shadow-md)]">
              <p className="text-sm text-white/90">
                🔒 End-to-end encrypted • Access restricted to verified customers only
              </p>
            </div>
          </div>
        </div>

        {/* Right Side - Login Form */}
        <div className="w-full lg:w-1/2 p-8 sm:p-12">
          <div className="max-w-md mx-auto">
            {/* Mobile Logo & Title – plain logo, no container */}
            <div className="lg:hidden text-center mb-10">
              <img
                src="/vobiss-logo.png"
                alt="Vobiss"
                className="h-20 w-auto mx-auto mb-6 object-contain"
              />
              <h2 className="text-3xl font-bold text-gray-900 mb-2">Customer Portal</h2>
              <p className="text-gray-600">Sign in to track your support tickets</p>
            </div>

            {/* Desktop-only title */}
            <div className="hidden lg:block mb-10">
              <h2 className="text-3xl font-bold text-gray-900 mb-2">Welcome Back</h2>
              <p className="text-gray-600">Sign in with your Customer ID and PIN</p>
            </div>

            {/* Error message */}
            {error && (
              <div className="mb-6 flex items-center gap-3 rounded-xl bg-red-50 border border-red-200 p-4 text-red-700 text-sm">
                <svg className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6" autoComplete="on">
              {/* Customer ID */}
              <div>
                <label htmlFor="customerCode" className="block text-sm font-medium text-gray-700 mb-2">
                  Customer ID
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm6 0a2 2 0 100-4 2 2 0 000 4z" />
                    </svg>
                  </div>
                  <input
                    id="customerCode"
                    type="text"
                    autoComplete="username"
                    value={customerCode}
                    onChange={(e) => setCustomerCode(e.target.value)}
                    placeholder="e.g., CUST-00001"
                    className="block w-full pl-11 pr-4 py-3.5 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    required
                    autoFocus
                    disabled={loading}
                  />
                </div>
              </div>

              {/* PIN */}
              <div>
                <label htmlFor="pin" className="block text-sm font-medium text-gray-700 mb-2">
                  5-Digit PIN
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3.517-1.009 6.799-2.753 9.571-3.283-2.448-5.247-6.203-5.247-10.071C4 6.728 7.299 3.5 12 3.5s8 3.228 8 7.5c0 3.868-2.164 7.623-5.247 10.071C13.009 17.799 12 14.517 12 11z" />
                    </svg>
                  </div>
                  <input
                    id="pin"
                    type={showPin ? 'text' : 'password'}
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 5))}
                    placeholder="•••••"
                    maxLength={5}
                    inputMode="numeric"
                    className="block w-full pl-11 pr-14 py-3.5 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono text-xl tracking-widest transition-all"
                    required
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPin(!showPin)}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center"
                  >
                    {showPin ? <EyeOff className="h-5 w-5 text-gray-500 hover:text-gray-700" /> : <Eye className="h-5 w-5 text-gray-500 hover:text-gray-700" />}
                  </button>
                </div>
              </div>

              {/* Remember me + Forgot PIN */}
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <input
                    id="remember-me"
                    type="checkbox"
                    className="h-4 w-4 border-gray-300 rounded text-indigo-600 focus:ring-indigo-500"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-700 select-none">
                    Remember this device
                  </label>
                </div>

                <button
                  type="button"
                  onClick={() => setShowForgotInfo(!showForgotInfo)}
                  className={`text-sm font-medium ${
                    showForgotInfo ? 'text-indigo-700' : 'text-indigo-600 hover:text-indigo-700'
                  } transition-colors`}
                >
                  {showForgotInfo ? 'Hide info' : 'Forgot PIN?'}
                </button>
              </div>

              {showForgotInfo && (
                <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 text-sm space-y-3">
                  <div className="flex items-start gap-2">
                    <svg className="h-5 w-5 text-indigo-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-indigo-800">
                      Please contact your account manager or email support to reset your PIN.
                    </p>
                  </div>
                  <a
                    href="mailto:support@vobiss.com?subject=Customer PIN Reset Request"
                    className="inline-flex items-center px-4 py-2 text-sm font-medium text-indigo-700 bg-indigo-100 hover:bg-indigo-200 rounded-lg transition-colors"
                  >
                    <svg className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    Contact Support
                  </a>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !customerCode.trim() || pin.length !== 5}
                className="w-full flex items-center justify-center py-3.5 px-4 border border-transparent rounded-xl text-base font-semibold text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Signing in...
                  </>
                ) : (
                  'Sign In'
                )}
              </button>
            </form>

            <div className="mt-8 text-center text-sm text-gray-500">
              <p>Having trouble? Reach out to</p>
              <a href="mailto:support@vobiss.com" className="text-indigo-600 font-medium hover:underline">
                support@vobiss.com
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;