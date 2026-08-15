// src/pages/Login.tsx — all users land on My Workspace after sign-in
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { loginUser } from '../api';
import { POST_LOGIN_PATH } from '../config/roles';
import { applyTheme, readStoredTheme } from '@/lib/theme';

const REMEMBERED_LOGIN_KEY = 'vobiss_remembered_login';

const Login = () => {
  const [username, setUsername] = useState(''); // email or username
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [showForgotInfo, setShowForgotInfo] = useState(false);
  const navigate = useNavigate();
  const { user, login } = useAuth();

  useEffect(() => {
    const rememberedLogin = localStorage.getItem(REMEMBERED_LOGIN_KEY);
    if (rememberedLogin) {
      setUsername(rememberedLogin);
      setRememberMe(true);
    }
  }, []);

  useEffect(() => {
    applyTheme('light', { persist: false });
    return () => {
      applyTheme(readStoredTheme(), { persist: false });
    };
  }, []);

  // Redirect if already logged in
  useEffect(() => {
    if (user?.role || user?.main_role) {
      navigate(POST_LOGIN_PATH, { replace: true });
    }
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Optional visual delay for better UX (remove in production if not needed)
    setTimeout(async () => {
      try {
        const data = await loginUser(username, password);
        const cleanUsername = username.trim();
        if (rememberMe && cleanUsername) {
          localStorage.setItem(REMEMBERED_LOGIN_KEY, cleanUsername);
        } else {
          localStorage.removeItem(REMEMBERED_LOGIN_KEY);
        }
        login(data.token, data.user);
        navigate(POST_LOGIN_PATH, { replace: true });
      } catch (err: any) {
        setError(err.message || 'Invalid credentials. Please try again.');
      } finally {
        setLoading(false);
      }
    }, 1200);
  };

  const handleForgotPassword = (e: React.MouseEvent) => {
    e.preventDefault();
    setShowForgotInfo(!showForgotInfo);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12" style={{ colorScheme: 'light' }}>
      <div className="flex w-full max-w-5xl overflow-hidden rounded-3xl bg-white shadow-2xl" style={{ zoom: 0.8 }}>
        <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-blue-600 via-blue-700 to-red-600 p-12 lg:flex lg:w-1/2">
          {/* Decorative lines */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-0 left-1/4 w-px h-full bg-gradient-to-b from-transparent via-white/20 to-transparent"></div>
            <div className="absolute top-0 right-1/3 w-px h-full bg-gradient-to-b from-transparent via-white/10 to-transparent"></div>
            <div className="absolute top-1/3 left-0 w-full h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
            <div className="absolute bottom-1/3 left-0 w-full h-px bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>
          </div>

          <div className="relative z-10">
            <div className="mb-12">
              <div className="bg-white rounded-2xl p-4 inline-block shadow-lg">
                <img
                  src="/vobiss-logo.png"
                  alt="Vobiss"
                  className="h-16 w-auto object-contain"
                />
              </div>
            </div>

            <div className="text-white">
              <h2 className="mb-4 text-4xl font-bold tracking-tight text-white">
                Vobiss ERP
              </h2>
              <p className="mb-3 text-lg text-white">
                Enterprise Resource Platform — Vobiss Solutions Limited
              </p>
              <p className="text-sm leading-relaxed text-white/90">
                Network Infrastructure · Field Operations · Asset Management · HR · Finance · NOC
              </p>
            </div>
          </div>

          <div className="relative z-10">
            <div className="rounded-xl border border-white/20 bg-white/10 p-4 backdrop-blur-sm">
              <p className="text-sm text-white">
                <span className="font-medium">Tip:</span> Your access is role-based. What you see depends on who you are.
              </p>
            </div>
          </div>
        </div>

        {/* Right Side - Login Form */}
        <div className="w-full p-8 sm:p-12 lg:w-1/2">
          <div className="max-w-md mx-auto">
            {/* Mobile Logo & Title */}
            <div className="lg:hidden mb-8 text-center">
              <img
                src="/vobiss-logo.png"
                alt="Vobiss"
                className="mx-auto mb-4 h-20 w-auto object-contain"
              />
              <h2 className="text-2xl font-bold text-gray-900">Vobiss ERP</h2>
              <p className="mt-1 text-sm text-gray-600">Enterprise Resource Platform — Vobiss Solutions Limited</p>
              <p className="mt-2 text-xs text-gray-500">Network Infrastructure · Field Operations · Asset Management · HR · Finance · NOC</p>
              <h3 className="mt-6 text-xl font-bold text-gray-900">Welcome Back</h3>
              <p className="text-sm text-gray-600">Sign in to your Vobiss workspace</p>
            </div>

            {/* Desktop Title */}
            <div className="hidden lg:block mb-8">
              <h2 className="mb-2 text-3xl font-bold text-gray-900">
                Welcome Back
              </h2>
              <p className="text-gray-600">
                Sign in to your Vobiss workspace
              </p>
            </div>

            {/* Form */}
            <form className="space-y-6" onSubmit={handleSubmit} autoComplete="on">
              {/* Username field */}
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-2">
                  Email or username
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <input
                    id="username"
                    name="username"
                    type="text"
                    autoComplete="username email"
                    required
                    className="block w-full pl-11 pr-4 py-3 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    placeholder="you@company.com or your username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    disabled={loading}
                  />
                </div>
              </div>

              {/* Password field */}
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    className="block w-full pl-11 pr-12 py-3 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-4 flex items-center"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <svg className="h-5 w-5 text-gray-400 hover:text-gray-600 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="h-5 w-5 text-gray-400 hover:text-gray-600 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Remember me & Forgot password */}
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <input
                    id="remember-me"
                    name="remember-me"
                    type="checkbox"
                    className="h-4 w-4 border-gray-300 rounded text-blue-600 focus:ring-blue-500"
                    checked={rememberMe}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setRememberMe(checked);
                      if (!checked) {
                        localStorage.removeItem(REMEMBERED_LOGIN_KEY);
                      } else if (username.trim()) {
                        localStorage.setItem(REMEMBERED_LOGIN_KEY, username.trim());
                      }
                    }}
                  />
                  <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-700">
                    Remember me
                  </label>
                </div>
                <div className="text-sm">
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    className={`font-medium transition-colors ${
                      showForgotInfo
                        ? 'text-blue-700 hover:text-blue-800'
                        : 'text-blue-600 hover:text-blue-700'
                    }`}
                  >
                    {showForgotInfo ? 'Hide info' : 'Forgot password?'}
                  </button>
                </div>
              </div>

              {/* Forgot Password Info */}
              {showForgotInfo && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-start">
                    <svg className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-sm text-blue-800 ml-2">
                      Contact your system administrator or IT support to reset your password.
                    </p>
                  </div>
                  <div className="pt-2">
                    <a
                      href="mailto:vobissvobiss@gmail.com?subject=Vobiss Password Reset Request"
                      className="inline-flex items-center px-3 py-1 text-sm font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 rounded-lg transition-colors"
                    >
                      <svg className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      Email Admin Support
                    </a>
                  </div>
                </div>
              )}

              {/* Error message */}
              {error && (
                <div className="flex items-center gap-2 text-red-700 text-sm bg-red-50 border border-red-200 p-3 rounded-xl">
                  <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>{error}</span>
                </div>
              )}

              {/* Submit button */}
              <div>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-blue-600 to-red-600 py-3 text-base font-semibold text-white shadow-sm transition hover:from-blue-700 hover:to-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Signing in...
                    </>
                  ) : (
                    'Sign In'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;