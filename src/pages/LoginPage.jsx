import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';
import AuthShell from '../components/AuthShell';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      navigate('/dashboard');
    }
  };

  const handleResetRequest = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${import.meta.env.VITE_APP_URL || window.location.origin}/reset-password`,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setSuccess(true);
      setLoading(false);
    }
  };

  return (
    <AuthShell>
      <motion.div
        layoutId="authCard"
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="auth-card relative z-10 bg-white dark:bg-[#111111] border-2 border-black dark:border-white rounded-2xl p-8 w-full max-w-sm overflow-hidden"
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {!showForgotPassword ? (
            <motion.div
              key="login"
              initial={{ opacity: 0, x: -16, filter: 'blur(4px)' }}
              animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, x: 16, filter: 'blur(4px)' }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="flex flex-col items-center">
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  className="flex items-center justify-center mb-6"
                >
                  <img src="/favicon.svg" alt="" className="h-16 w-16" />
                </motion.div>
                <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white">
                  Sign in
                </h1>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mt-1 mb-7 text-center">
                  Welcome back, take attendance.
                </p>
              </div>

              <form onSubmit={handleLogin}>
                <div className="mb-4">
                  <label htmlFor="login-email" className="label">
                    Email
                  </label>
                  <input
                    id="login-email"
                    autoComplete="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="field"
                    placeholder="you@example.com"
                  />
                </div>

                <div className="mb-4">
                    <label htmlFor="login-password" className="label">
                      Password
                    </label>
                    <input
                      id="login-password"
                      autoComplete="current-password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="field"
                      placeholder="••••••••"
                    />
                    <div className="flex items-center justify-between gap-3 mt-2">
                    <button type="button"
                      onClick={() => setShowPassword(value => !value)}
                      className="text-xs font-bold underline underline-offset-2 text-gray-600 dark:text-gray-300"
                    >{showPassword ? 'Hide password' : 'Show password'}</button>
                    <button type="button"
                      onClick={() => {
                        setShowForgotPassword(true);
                        setError(null);
                      }}
                      className="text-xs font-bold text-gray-600 dark:text-gray-300 hover:text-black dark:hover:text-white transition-colors cursor-pointer underline underline-offset-2 text-right"
                    >
                      Forgot password?
                    </button>
                    </div>
                </div>

                {error && (
                  <motion.div 
                    initial={{ opacity: 0 }} 
                    animate={{ opacity: 1 }} 
                    className="mb-4 border-2 border-black dark:border-red-400 bg-[#ffeded] dark:bg-red-950 text-black dark:text-red-300 rounded-xl px-4 py-2.5 text-sm font-medium"
                  >
                    {error}
                  </motion.div>
                )}

                <motion.button
                  whileTap={{ scale: 0.97 }}
                  type="submit"
                  disabled={loading}
                  className="btn-primary mt-2 w-full min-h-[48px] text-[15px]"
                >
                  {loading ? 'Signing in...' : 'Sign in →'}
                </motion.button>
              </form>

              <p className="text-sm font-medium text-gray-600 dark:text-gray-400 text-center mt-6">
                Don't have an account?{' '}
                <Link to="/register" className="text-black dark:text-white font-bold underline underline-offset-2 hover:text-[#b9ff66] hover:decoration-[#b9ff66] transition-colors">
                  Register
                </Link>
              </p>
            </motion.div>
          ) : (
            <motion.div
              layout
              key="forgot"
              initial={{ opacity: 0, x: 16, filter: 'blur(4px)' }}
              animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, x: -16, filter: 'blur(4px)' }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            >
              <button type="button"
                onClick={() => {
                  setShowForgotPassword(false);
                  setSuccess(false);
                  setError(null);
                }}
                className="inline-flex text-xs font-bold text-gray-500 hover:text-black dark:text-gray-400 dark:hover:text-white transition-colors cursor-pointer mb-6 items-center gap-1.5 px-3 py-1.5 rounded-full border border-transparent hover:border-gray-200 dark:hover:border-white/10"
              >
                <ArrowLeft size={14} /> Back to sign in
              </button>

              {success ? (
                <motion.div
                  initial={{ scale: 0.9, opacity: 0, y: 10 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  className="bg-[#b9ff66] border-2 border-black rounded-xl p-6 text-center"
                >
                  <div className="w-12 h-12 bg-black text-[#b9ff66] rounded-full flex items-center justify-center mx-auto mb-3">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                  </div>
                  <h3 className="text-black font-extrabold text-lg mb-1">Check your inbox</h3>
                  <p className="text-black/80 font-medium text-sm">We've sent a password reset link to your email.</p>
                </motion.div>
              ) : (
                <>
                  <div className="flex flex-col items-center">
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                      className="bg-black dark:bg-white border-2 border-black dark:border-white rounded-2xl p-4 flex items-center justify-center mb-6"
                    >
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white dark:text-black">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                      </svg>
                    </motion.div>
                    <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white">
                      Reset Password
                    </h1>
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mt-1 mb-7 text-center">
                      Enter your email and we'll send you a reset link.
                    </p>
                  </div>

                  <form onSubmit={handleResetRequest}>
                    <div className="mb-4">
                      <label htmlFor="recovery-email" className="label">
                        Email
                      </label>
                      <input
                        id="recovery-email"
                        autoComplete="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className="field"
                        placeholder="you@example.com"
                      />
                    </div>

                    {error && (
                      <div className="mb-4 border-2 border-black dark:border-red-400 bg-[#ffeded] dark:bg-red-950 text-black dark:text-red-300 rounded-xl px-4 py-2.5 text-sm font-medium">
                        {error}
                      </div>
                    )}

                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      type="submit"
                      disabled={loading}
                      className="btn-primary mt-2 w-full min-h-[48px] text-[15px]"
                    >
                      {loading ? 'Sending...' : 'Send Reset Link →'}
                    </motion.button>
                  </form>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AuthShell>
  );
}
