import { useCallback, useEffect, useState } from 'react';
import { useLocation, Link, NavLink } from 'react-router-dom';
import { LayoutGrid, ClipboardCheck, Users, History as HistoryIcon, UserRound } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useLoadingBar } from '../context/LoadingBarContext';
import { motion, AnimatePresence } from 'framer-motion';

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'CR';
  return (parts[0][0] + (parts.length > 1 ? parts.at(-1)[0] : '')).toUpperCase();
}

function TopLink({ to, active, children }) {
  return (
    <Link to={to}
      className={`relative rounded-lg px-3 py-2 text-sm font-bold transition-colors ${active
        ? 'text-black dark:text-white'
        : 'text-gray-600 hover:text-black dark:text-gray-300 dark:hover:text-white'}`}>
      {children}
      {active && <span aria-hidden="true" className="absolute inset-x-3 -bottom-[3px] h-[3px] rounded-full bg-[#b9ff66]" />}
    </Link>
  );
}

function BottomTab({ to, icon: Icon, label, end }) {
  return (
    <NavLink to={to} end={end}
      className={({ isActive }) => `group flex min-w-0 flex-1 flex-col items-center justify-center gap-1 pt-2 pb-1.5 text-[11px] font-bold transition-colors ${isActive
        ? 'text-black dark:text-white'
        : 'text-gray-500 dark:text-gray-400'}`}>
      {({ isActive }) => (
        <>
          <span className={`flex h-8 w-14 items-center justify-center rounded-full transition-colors ${isActive
            ? 'bg-[#b9ff66] text-black'
            : 'group-active:bg-black/5 dark:group-active:bg-white/10'}`}>
            <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
          </span>
          <span className="truncate">{label}</span>
        </>
      )}
    </NavLink>
  );
}

export default function Layout({ children }) {
  const [fullName, setFullName] = useState(() => localStorage.getItem('cr_name') || '');
  const [isSigningOut, setIsSigningOut] = useState(false);
  const loadingBar = useLoadingBar();
  const location = useLocation();
  const courseId = location.pathname.match(/^\/courses\/([^/]+)/)?.[1];
  const onCourses = location.pathname.startsWith('/dashboard') || Boolean(courseId);

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
            const metaName = session.user.user_metadata?.full_name || session.user.user_metadata?.name || 'CR';
            setFullName(metaName);
            localStorage.setItem('cr_name', metaName);
            // Auto-create missing profile
            await supabase.from('profiles').insert({
              id: session.user.id,
              full_name: metaName,
              email: session.user.email
            });
          } else if (error || !data || !data.full_name) {
            setFullName('CR');
            localStorage.setItem('cr_name', 'CR');
          } else {
            setFullName(data.full_name);
            localStorage.setItem('cr_name', data.full_name);
          }
        }
      } catch {
        if (!localStorage.getItem('cr_name')) setFullName('CR');
      }
    }
    getProfile();

    const handleNameSync = () => setFullName(localStorage.getItem('cr_name') || '');
    window.addEventListener('cr_name_updated', handleNameSync);
    return () => window.removeEventListener('cr_name_updated', handleNameSync);
  }, []);

  const handleSignOut = useCallback(async () => {
    setIsSigningOut(true);
    const { error } = await supabase.auth.signOut();
    if (error) { setIsSigningOut(false); return; }
    localStorage.removeItem('cr_name');
    window.location.href = '/login';
  }, []);

  useEffect(() => {
    window.addEventListener('cr_sign_out', handleSignOut);
    return () => window.removeEventListener('cr_sign_out', handleSignOut);
  }, [handleSignOut]);

  const tabs = courseId
    ? [
        { to: '/dashboard', icon: LayoutGrid, label: 'Courses' },
        { to: `/courses/${courseId}/attendance`, icon: ClipboardCheck, label: 'Roll call' },
        { to: `/courses/${courseId}/students`, icon: Users, label: 'Students' },
        { to: `/courses/${courseId}/history`, icon: HistoryIcon, label: 'History' },
      ]
    : [
        { to: '/dashboard', icon: LayoutGrid, label: 'Courses' },
        { to: '/profile', icon: UserRound, label: 'Profile' },
      ];

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
            className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-[#f7f6f2] px-6 dark:bg-[#0a0a0a]"
          >
            <motion.img
              src="/favicon.svg" alt=""
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: [0.6, 1.08, 1], opacity: 1 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="mb-8 h-20 w-20"
            />
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="text-center"
            >
              <h2 className="mb-2 text-4xl font-extrabold text-gray-900 dark:text-white">
                Goodbye{fullName ? `, ${fullName.split(' ')[0]}` : ''}!
              </h2>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Signing you out. Your attendance records are safe.
              </p>
            </motion.div>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="mt-10 flex items-center gap-2"
            >
              {[0, 1, 2].map(i => (
                <motion.div
                  key={i}
                  className="h-2 w-2 rounded-full border border-black bg-[#b9ff66]"
                  animate={{ scale: [1, 1.5, 1], opacity: [0.4, 1, 0.4] }}
                  transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.2, ease: 'easeInOut' }}
                />
              ))}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <header className="fixed inset-x-0 top-0 z-50 border-b-2 border-black bg-[#f7f6f2]/95 pt-[env(safe-area-inset-top)] backdrop-blur-md dark:border-white/80 dark:bg-[#0a0a0a]/95">
        <AnimatePresence>
          {loadingBar?.visible && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute left-0 top-0 z-[70] h-[3px] bg-[#6b9d28] transition-[width] duration-300 ease-out dark:bg-[#b9ff66]"
              style={{ width: `${loadingBar.progress}%` }}
            />
          )}
        </AnimatePresence>
        <div className="relative mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6 md:h-16">
          <Link to="/dashboard" className="-ml-1 flex items-center gap-2.5 rounded-xl px-1 py-1">
            <img src="/favicon.svg" alt="" className="h-8 w-8 md:h-9 md:w-9" />
            <span className="font-display text-[17px] font-extrabold tracking-tight text-gray-900 dark:text-white md:text-lg">
              CR Attendance
            </span>
          </Link>

          <nav aria-label="Main" className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-2 md:flex">
            <TopLink to="/dashboard" active={onCourses}>Courses</TopLink>
            <TopLink to="/profile" active={location.pathname === '/profile'}>Profile</TopLink>
          </nav>

          <Link to="/profile" aria-label={`Profile${fullName ? ` for ${fullName}` : ''}`}
            className="flex items-center gap-2 rounded-full border-2 border-black bg-white py-0.5 pl-0.5 pr-0.5 text-xs font-bold text-gray-900 transition-colors hover:bg-[#b9ff66] hover:text-black dark:border-white/80 dark:bg-[#111] dark:text-white md:pr-3">
            <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-full bg-[#b9ff66] text-[11px] font-extrabold text-black">
              {initials(fullName)}
            </span>
            <span className="hidden max-w-[160px] truncate md:inline">{fullName || 'Profile'}</span>
          </Link>
        </div>
      </header>

      <div className="app-shell min-h-screen w-full bg-[#f7f6f2] pt-[calc(3.5rem+env(safe-area-inset-top))] dark:bg-[#0a0a0a] md:pt-16">
        <main className="mx-auto w-full max-w-5xl px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-5 sm:px-6 md:pb-16 md:pt-10">
          {children}
        </main>
      </div>

      <nav aria-label="Sections"
        className="fixed inset-x-0 bottom-0 z-50 border-t-2 border-black bg-[#f7f6f2]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md dark:border-white/80 dark:bg-[#0a0a0a]/95 md:hidden">
        <div className="mx-auto flex max-w-md items-stretch px-2">
          {tabs.map(tab => <BottomTab key={tab.to} {...tab} end />)}
        </div>
      </nav>
    </>
  );
}
