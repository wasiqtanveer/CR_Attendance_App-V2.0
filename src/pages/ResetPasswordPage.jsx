import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';
import AuthShell from '../components/AuthShell';

export default function ResetPasswordPage() {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (event === 'INITIAL_SESSION' && session)) setIsRecovery(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
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
          {!success ? (
            <motion.div
              layout
              key="form"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25 }}
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
                <div className="bg-[#b9ff66] border border-black text-black text-xs font-bold px-3 py-1 rounded-full mb-4">
                  Reset Password
                </div>
                <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white">
                  New Password
                </h1>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mt-1 mb-7 text-center">
                  {isRecovery ? 'Choose a strong new password.' : 'Open a valid password-reset link from your email to continue.'}
                </p>
              </div>

              <form onSubmit={handleResetPassword}>
                <div className="mb-4">
                  <label htmlFor="reset-password" className="label">
                    New Password
                  </label>
                  <input
                    id="reset-password"
                    autoComplete="new-password"
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    className="field"
                    placeholder="••••••••"
                  />
                </div>

                <div className="mb-4">
                  <label htmlFor="reset-confirm" className="label">
                    Confirm New Password
                  </label>
                  <input
                    id="reset-confirm"
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

                <motion.button
                  whileTap={{ scale: 0.97 }}
                  type="submit"
                  disabled={loading || !isRecovery}
                  className="btn-primary mt-2 w-full min-h-[48px] text-[15px]"
                >
                  {loading ? 'Updating...' : 'Update Password →'}
                </motion.button>
              </form>
              {!isRecovery && <button type="button" onClick={() => navigate('/login')}
                className="mt-4 w-full text-center text-sm font-bold underline text-gray-700 dark:text-gray-300">Request a new link from Sign in</button>}
            </motion.div>
          ) : (
            <motion.div
              key="success"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col items-center text-center"
            >
              <div className="w-16 h-16 bg-[#b9ff66] rounded-full flex items-center justify-center mb-6 border-2 border-black">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className="text-black">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </div>
              <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white">
                Password Updated!
              </h1>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mt-2 mb-8">
                You can now sign in with your new password.
              </p>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => navigate('/login')}
                className="w-full py-2.5 bg-[#b9ff66] text-black font-bold border-2 border-black rounded-xl hover:bg-black hover:text-[#b9ff66] transition-all duration-200"
              >
                Go to Sign In →
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AuthShell>
  );
}
