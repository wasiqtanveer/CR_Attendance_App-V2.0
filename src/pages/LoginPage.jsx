import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import DoodleBackground from '../components/DoodleBackground';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
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

  return (
    <div className="relative min-h-screen bg-[#f7f6f2] dark:bg-[#0a0a0a] flex items-center justify-center px-4">
      <DoodleBackground />

      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 bg-white dark:bg-[#111111] border-2 border-black dark:border-white rounded-2xl p-8 w-full max-w-sm"
      >
        <div className="flex flex-col items-center">
          <div className="bg-[#b9ff66] text-black text-xs font-bold px-3 py-1 rounded-full border border-black inline-block mb-4">
            CR Portal
          </div>
          <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">
            Sign in
          </h1>
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mt-1 mb-7">
            Welcome back, take attendance.
          </p>
        </div>

        <form onSubmit={handleLogin}>
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="mb-4"
          >
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
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="mb-4"
          >
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
          </motion.div>

          {error && (
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              className="mb-4 border-2 border-black dark:border-red-400 bg-[#ffeded] dark:bg-red-950 text-black dark:text-red-300 rounded-xl px-4 py-2.5 text-sm font-medium"
            >
              {error}
            </motion.div>
          )}

          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
          >
            <motion.button
              whileTap={{ scale: 0.97 }}
              type="submit"
              disabled={loading}
              className="w-full py-2.5 mt-2 bg-[#b9ff66] text-black font-bold border-2 border-black rounded-xl hover:bg-black hover:text-[#b9ff66] transition-all duration-200 disabled:opacity-70"
            >
              {loading ? 'Signing in...' : 'Sign in →'}
            </motion.button>
          </motion.div>

        </form>

        <p className="text-sm font-medium text-gray-500 dark:text-gray-400 text-center mt-6">
          Don't have an account?{' '}
          <Link to="/register" className="text-black dark:text-white font-bold underline underline-offset-2 hover:text-[#b9ff66] hover:decoration-[#b9ff66] transition-colors">
            Register
          </Link>
        </p>
      </motion.div>
    </div>
  );
}