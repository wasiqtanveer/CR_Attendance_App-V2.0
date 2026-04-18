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
        initial={{ opacity: 0, scale: 0.96, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 bg-white dark:bg-[#111111] border-2 border-black dark:border-white rounded-2xl p-8 w-full max-w-sm"
      >
        <AnimatePresence mode="wait">
          {!showForgotPassword ? (
            <motion.div
              key="login"
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="flex flex-col items-center">
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  className="bg-[#b9ff66] border-2 border-black rounded-2xl p-4 flex items-center justify-center mb-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
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
              key="forgot"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            >
              <div 
                onClick={() => {
                  setShowForgotPassword(false);
                  setSuccess(false);
                  setError(null);
                }}
                className="text-xs font-bold text-gray-400 hover:text-black dark:hover:text-white transition-colors cursor-pointer mb-6 flex items-center gap-1"
              >
                <ArrowLeft size={14} /> Back to sign in
              </div>

              {success ? (
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="bg-[#b9ff66] border-2 border-black rounded-xl px-5 py-4 text-black font-bold text-sm"
                >
                  Check your email for the reset link!
                </motion.div>
              ) : (
                <>
                  <h1 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">
                    Reset Password
                  </h1>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 mb-6">
                    Enter your email and we'll send you a reset link.
                  </p>

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