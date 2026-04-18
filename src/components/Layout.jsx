import { useEffect, useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { CalendarCheck, Menu, X, LogOut } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTheme } from '../context/ThemeContext';
import { useLoadingBar } from '../context/LoadingBarContext';
import { motion, AnimatePresence } from 'framer-motion';

export default function Layout({ children }) {
  const [fullName, setFullName] = useState(() => localStorage.getItem('cr_name') || '');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const isDarkMode = theme === 'dark';
  const loadingBar = useLoadingBar();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    async function getProfile() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          if (!localStorage.getItem('cr_name')) {
            const metaName = session.user.user_metadata?.full_name || 'CR';
            setFullName(metaName);
            localStorage.setItem('cr_name', metaName);
          }

          const { data, error } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', session.user.id)
            .single();
          
          if (error && error.code === 'PGRST116') {
            const metaName = session.user.user_metadata?.full_name || 'CR';
            setFullName(metaName);
            localStorage.setItem('cr_name', metaName);
          } else if (error || !data || !data.full_name) {
            setFullName('CR');
            localStorage.setItem('cr_name', 'CR');
          } else {
            setFullName(data.full_name);
            localStorage.setItem('cr_name', data.full_name);
          }
        }
      } catch (err) {
        if (!localStorage.getItem('cr_name')) setFullName('CR');
      }
    }
    getProfile();

    const handleNameSync = () => setFullName(localStorage.getItem('cr_name') || '');
    window.addEventListener('cr_name_updated', handleNameSync);
    return () => window.removeEventListener('cr_name_updated', handleNameSync);
  }, []);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    // Small delay for the overlay to animate in before we sign out
    await new Promise(resolve => setTimeout(resolve, 1800));
    await supabase.auth.signOut();
    localStorage.removeItem('cr_name');
    window.location.href = '/login';
  };

  useEffect(() => {
    window.addEventListener('cr_sign_out', handleSignOut);
    return () => window.removeEventListener('cr_sign_out', handleSignOut);
  }, []);

  const NavLinks = ({ mobile = false }) => (
    <>
      <Link 
        to="/dashboard"
        onClick={() => mobile && setIsMobileMenuOpen(false)}
        className={`text-sm font-bold px-1 transition-colors ${
          location.pathname.startsWith('/dashboard') || location.pathname.startsWith('/courses')
            ? 'border-b-2 border-[#b9ff66] text-black dark:text-white' 
            : 'text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white'
        }`}
      >
        Dashboard
      </Link>
      <Link 
        to="/profile"
        onClick={() => mobile && setIsMobileMenuOpen(false)}
        className={`text-sm font-bold px-1 transition-colors ${
          location.pathname === '/profile' 
            ? 'border-b-2 border-[#b9ff66] text-black dark:text-white' 
            : 'text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white'
        }`}
      >
        Profile
      </Link>
    </>
  );

  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
  }, [isMobileMenuOpen]);

  return (
    <>
      {/* ── Goodbye Overlay ────────────────────────────────────────────── */}
      <AnimatePresence>
        {isSigningOut && (
          <motion.div
            key="goodbye"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-[#f7f6f2] dark:bg-[#0a0a0a]"
          >
            {/* Pulsing logo */}
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: [0.6, 1.08, 1], opacity: 1 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="mb-8"
            >
              <motion.div
                animate={{ boxShadow: ['0 0 0px #b9ff66', '0 0 32px #b9ff66', '0 0 0px #b9ff66'] }}
                transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}
                className="bg-[#b9ff66] border-2 border-black rounded-2xl p-5 flex items-center justify-center"
              >
                <CalendarCheck size={40} className="text-black" />
              </motion.div>
            </motion.div>

            {/* Goodbye text */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="text-center"
            >
              <p className="text-xs font-black uppercase tracking-[0.25em] text-[#b9ff66] mb-3">
                Signing out
              </p>
              <h2 className="text-4xl font-black text-gray-900 dark:text-white tracking-tight mb-2">
                Goodbye{fullName ? `,` : '!'}{fullName && (
                  <span className="text-[#b9ff66]"> {fullName.split(' ')[0]}</span>
                )}{fullName ? '!' : ''}
              </h2>
              <p className="text-sm font-medium text-gray-400 dark:text-gray-500">
                Your attendance records are safe. See you soon ✦
              </p>
            </motion.div>

            {/* Animated dots */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="flex items-center gap-2 mt-10"
            >
              {[0, 1, 2].map(i => (
                <motion.div
                  key={i}
                  className="w-2 h-2 rounded-full bg-[#b9ff66] border border-black"
                  animate={{ scale: [1, 1.5, 1], opacity: [0.4, 1, 0.4] }}
                  transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.2, ease: 'easeInOut' }}
                />
              ))}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="fixed top-0 left-0 right-0 z-50 bg-[#f7f6f2] dark:bg-[#0a0a0a] border-b-2 border-black dark:border-white">
        {/* Top loading progress bar */}
        <AnimatePresence>
          {loadingBar?.visible && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute top-0 left-0 h-[4px] bg-[#b9ff66] border-b border-r border-black dark:border-[#b9ff66]/30 z-[70] transition-[width] duration-300 ease-out"
              style={{ width: `${loadingBar.progress}%` }}
            />
          )}
        </AnimatePresence>
        {/* relative so absolute nav-links center to this container, not the fixed outer div */}
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between relative">
          <motion.div 
            whileHover={{ rotate: -4, scale: 1.08 }} 
            transition={{ duration: 0.15 }}
            className="flex items-center cursor-pointer"
            onClick={() => navigate('/dashboard')}
          >
            <div className="bg-[#b9ff66] border-2 border-black rounded-lg p-1.5 flex items-center justify-center">
              <CalendarCheck size={18} className="text-black" />
            </div>
            <span className="font-black text-lg text-gray-900 dark:text-white ml-3">
              CR Attendance
            </span>
          </motion.div>

          <div className="hidden md:flex items-center justify-center gap-6 absolute left-1/2 -translate-x-1/2">
            <NavLinks />
          </div>

          <div className="flex items-center gap-2">
            {fullName && (
              <Link to="/profile" className="hidden sm:block bg-white dark:bg-[#111111] border-2 border-black dark:border-white rounded-full px-3 py-1 text-xs font-bold text-gray-900 dark:text-white truncate max-w-[120px] sm:max-w-[200px] hover:bg-[#b9ff66] hover:text-black hover:border-black transition-colors cursor-pointer">
                {fullName}
              </Link>
            )}

            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="border-2 border-black dark:border-white rounded-lg p-1.5 bg-transparent hover:bg-[#b9ff66] hover:border-black transition-all duration-150 flex items-center justify-center md:hidden"
            >
              {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </motion.button>
          </div>
        </div>

        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="absolute top-16 left-0 right-0 mx-4 z-50 md:hidden bg-white dark:bg-[#111111] border-2 border-black dark:border-white rounded-2xl p-4 shadow-xl flex flex-col gap-4"
            >
              <NavLinks mobile />
              <div className="border-t border-gray-200 dark:border-gray-700 pt-3 mt-1">
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleSignOut}
                  className="flex items-center gap-2 text-sm font-bold text-red-500 hover:text-red-600 transition-colors"
                >
                  <LogOut size={14} />
                  Sign Out
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="pt-16 min-h-screen bg-[#f7f6f2] dark:bg-[#0a0a0a] w-full">
        <div className="max-w-5xl mx-auto px-6 py-10 w-full">
          {children}
        </div>
      </div>
    </>
  );
}
