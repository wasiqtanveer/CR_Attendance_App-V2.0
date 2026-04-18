import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, CalendarCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import DoodleBackground from '../components/DoodleBackground';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [success, setSuccess] = useState(false);
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
      redirectTo: window.location.origin + '/reset-password',
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
    <div className="relative min-h-screen bg-[#f7f6f2] dark:bg-[#0a0a0a] flex items-center justify-center px-4">
      <DoodleBackground />

      <motion.div
        layoutId="authCard"
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 bg-white dark:bg-[#111111] border-2 border-black dark:border-white rounded-2xl p-8 w-full max-w-sm overflow-hidden"
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
                  className="bg-[#b9ff66] border-2 border-black rounded-2xl p-4 flex items-center justify-center mb-6"
                >
                  <CalendarCheck size={32} className="text-black" />
                </motion.div>
                <div className="bg-[#b9ff66] text-black text-xs font-bold px-3 py-1 rounded-full border border-black inline-block mb-4">
                  CR Portal
                </div>
                <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">
                  Sign in
                </h1>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mt-1 mb-7 text-center">
                  Welcome back, take attendance.
                </p>
              </div>

              <form onSubmit={handleLogin}>
                <div className="mb-4">
                  <label className="text-sm font-bold text-gray-900 dark:text-white mb-1.5 block uppercase tracking-wide">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full px-4 py-3 rounded-xl border-2 border-black dark:border-white bg-transparent text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-0 focus:border-[#b9ff66] text-sm font-medium transition-colors duration-150"
                    placeholder="you@example.com"
                  />
                </div>

                <div className="mb-4">
                    <label className="text-sm font-bold text-gray-900 dark:text-white mb-1.5 block uppercase tracking-wide">
                      Password
                    </label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="w-full px-4 py-3 rounded-xl border-2 border-black dark:border-white bg-transparent text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-0 focus:border-[#b9ff66] text-sm font-medium transition-colors duration-150"
                      placeholder="••••••••"
                    />
                    <span 
                      onClick={() => {
                        setShowForgotPassword(true);
                        setError(null);
                      }}
                      className="text-xs font-bold text-gray-400 hover:text-black dark:hover:text-white transition-colors cursor-pointer underline underline-offset-2 block text-right mt-1"
                    >
                      Forgot password?
                    </span>
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
                  className="w-full py-2.5 mt-2 bg-[#b9ff66] text-black font-bold border-2 border-black rounded-xl hover:bg-black hover:text-[#b9ff66] transition-all duration-200 disabled:opacity-70"
                >
                  {loading ? 'Signing in...' : 'Sign in →'}
                </motion.button>
              </form>

              <p className="text-sm font-medium text-gray-500 dark:text-gray-400 text-center mt-6">
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
              <div 
                onClick={() => {
                  setShowForgotPassword(false);
                  setSuccess(false);
                  setError(null);
                }}
                className="inline-flex text-xs font-bold text-gray-500 hover:text-black dark:text-gray-400 dark:hover:text-white transition-colors cursor-pointer mb-6 items-center gap-1.5 px-3 py-1.5 rounded-full border border-transparent hover:border-gray-200 dark:hover:border-white/10"
              >
                <ArrowLeft size={14} /> Back to sign in
              </div>

              {success ? (
                <motion.div
                  initial={{ scale: 0.9, opacity: 0, y: 10 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  className="bg-[#b9ff66] border-2 border-black rounded-xl p-6 text-center"
                >
                  <div className="w-12 h-12 bg-black text-[#b9ff66] rounded-full flex items-center justify-center mx-auto mb-3">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                  </div>
                  <h3 className="text-black font-black text-lg mb-1">Check your inbox</h3>
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
                    <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">
                      Reset Password
                    </h1>
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mt-1 mb-7 text-center">
                      Enter your email and we'll send you a reset link.
                    </p>
                  </div>

                  <form onSubmit={handleResetRequest}>
                    <div className="mb-4">
                      <label className="text-sm font-bold text-gray-900 dark:text-white mb-1.5 block uppercase tracking-wide">
                        Email
                      </label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className="w-full px-4 py-3 rounded-xl border-2 border-black dark:border-white bg-transparent text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-0 focus:border-[#b9ff66] text-sm font-medium transition-colors duration-150"
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
                      className="w-full py-2.5 mt-2 bg-[#b9ff66] text-black font-bold border-2 border-black rounded-xl hover:bg-black hover:text-[#b9ff66] transition-all duration-200 disabled:opacity-70"
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
    </div>
  );
}
