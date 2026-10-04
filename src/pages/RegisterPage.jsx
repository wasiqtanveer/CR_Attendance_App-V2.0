import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';
import AuthShell from '../components/AuthShell';

export default function RegisterPage() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match!');
      setLoading(false);
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
        emailRedirectTo: `${import.meta.env.VITE_APP_URL || window.location.origin}/login`,
      },
    });

    if (error) {
      setError(error.message);
    } else {
      setSuccess(true);
    }
    setLoading(false);
  };

  return (
    <AuthShell>
      <motion.div
        layoutId="authCard"
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="auth-card relative z-10 bg-white dark:bg-[#111111] border-2 border-black dark:border-white rounded-2xl p-8 w-full max-w-sm overflow-hidden"
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {!success ? (
            <motion.div 
              key="form" 
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
                  Create account
                </h1>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mt-1 mb-7">
                  Join as a Class Representative.
                </p>
              </div>

              <form onSubmit={handleRegister}>
                <div className="mb-4">
                  <label htmlFor="register-name" className="label">
                    Full Name
                  </label>
                  <input
                    id="register-name"
                    autoComplete="name"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    className="field"
                    placeholder="John Doe"
                  />
                </div>

                <div className="mb-4">
                  <label htmlFor="register-email" className="label">
                    Email
                  </label>
                  <input
                    id="register-email"
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
                  <label htmlFor="register-password" className="label">
                    Password
                  </label>
                  <input
                    id="register-password"
                    autoComplete="new-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="field"
                    placeholder="••••••••"
                  />
                </div>

                <div className="mb-4">
                  <label htmlFor="register-confirm" className="label">
                    Confirm Password
                  </label>
                  <input
                    id="register-confirm"
                    autoComplete="new-password"
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    className="field"
                    placeholder="••••••••"
                  />
                </div>
                <button type="button" onClick={() => setShowPassword(value => !value)} className="mb-3 text-xs font-bold underline">
                  {showPassword ? 'Hide passwords' : 'Show passwords'}
                </button>
                <p className="mb-3 text-xs text-gray-600 dark:text-gray-300">Use at least 8 characters.</p>

                {error && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="mb-4 border-2 border-black dark:border-red-400 bg-[#ffeded] dark:bg-red-950 text-black dark:text-red-300 rounded-xl px-4 py-2.5 text-sm font-medium"
                  >
                    {error}
                  </motion.div>
                )}

                <div>
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    type="submit"
                    disabled={loading}
                    className="btn-primary mt-2 w-full min-h-[48px] text-[15px]"
                  >
                    {loading ? 'Creating...' : 'Create account →'}
                  </motion.button>
                </div>
                
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400 text-center mt-6">
                  Already have an account?{' '}
                  <Link to="/login" className="text-black dark:text-white font-bold underline underline-offset-2 hover:text-[#b9ff66] hover:decoration-[#b9ff66] transition-colors">
                    Sign in
                  </Link>
                </p>
              </form>
            </motion.div>
          ) : (
            <motion.div
              layout
              key="success"
              initial={{ opacity: 0, x: 16, filter: 'blur(4px)' }} 
              animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }} 
              exit={{ opacity: 0, x: -16, filter: 'blur(4px)' }} 
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col items-center py-6 text-center"
            >
              <svg width="64" height="64" viewBox="0 0 64 64" fill="none" className="mb-4 text-[#b9ff66]">
                <path d="M32 64c17.673 0 32-14.327 32-32S49.673 0 32 0 0 14.327 0 32s14.327 32 32 32z" fill="currentColor" opacity="0.2"/>
                <path d="M19 32.5L28.5 42 46 22" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <h2 className="text-2xl font-extrabold text-gray-900 dark:text-white mb-2">Check your email</h2>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mt-2 mb-6">
                We've sent a confirmation link to <span className="font-bold text-gray-900 dark:text-gray-200">{email}</span>.<br />Please click the link to activate your account.
              </p>
              <Link to="/login" className="w-full">
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  className="w-full py-2.5 bg-[#b9ff66] text-black font-bold border-2 border-black rounded-xl hover:bg-black hover:text-[#b9ff66] transition-all duration-200"
                >
                  Return to Sign In →
                </motion.button>
              </Link>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AuthShell>
  );
}
