import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { CalendarCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import DoodleBackground from '../components/DoodleBackground';

export default function ResetPasswordPage() {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecovery(true);
      }
    });
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
    <div className="relative min-h-screen bg-[#f7f6f2] dark:bg-[#0a0a0a] flex items-center justify-center px-4">
      <DoodleBackground />

      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 bg-white dark:bg-[#111111] border-2 border-black dark:border-white rounded-2xl p-8 w-full max-w-sm"
      >
        <AnimatePresence mode="wait">
          {!success ? (
            <motion.div
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
                  className="bg-[#b9ff66] border-2 border-black rounded-2xl p-4 flex items-center justify-center mb-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
                >
                  <CalendarCheck size={32} className="text-black" />
                </motion.div>
                <div className="bg-[#b9ff66] border border-black text-black text-xs font-bold px-3 py-1 rounded-full mb-4">
                  Reset Password
                </div>
                <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">
                  New Password
                </h1>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mt-1 mb-7 text-center">
                  Choose a strong new password.
                </p>
              </div>

              <form onSubmit={handleResetPassword}>
                <div className="mb-4">
                  <label className="text-sm font-bold text-gray-900 dark:text-white mb-1.5 block uppercase tracking-wide">
                    New Password
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    className="w-full px-4 py-3 rounded-xl border-2 border-black dark:border-white bg-transparent text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-0 focus:border-[#b9ff66] text-sm font-medium transition-colors duration-150"
                    placeholder="••••••••"
                  />
                </div>

                <div className="mb-4">
                  <label className="text-sm font-bold text-gray-900 dark:text-white mb-1.5 block uppercase tracking-wide">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    className="w-full px-4 py-3 rounded-xl border-2 border-black dark:border-white bg-transparent text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-0 focus:border-[#b9ff66] text-sm font-medium transition-colors duration-150"
                    placeholder="••••••••"
                  />
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
                  {loading ? 'Updating...' : 'Update Password →'}
                </motion.button>
              </form>
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
              <h1 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">
                Password Updated!
              </h1>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mt-2 mb-8">
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
    </div>
  );
}
