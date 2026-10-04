import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Pencil, Check, X, Lock, ChevronDown, ChevronUp, LogOut } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { playPresent, setSoundsEnabled, soundsEnabled } from '../lib/sounds';
import useSWR from 'swr';
import { useTheme } from '../context/ThemeContext';
import { useLoadingBar } from '../context/LoadingBarContext';
import Layout from '../components/Layout';
import { fetchAllRows } from '../lib/fetchAllRows';
import { useModalFocus } from '../hooks/useModalFocus';

function ProfileSkeleton() {
  return (
    <div className="animate-pulse w-full flex flex-col gap-8 mt-2">
      <div className="h-6 w-24 bg-[#b9ff66]/50 rounded-full mb-2" />
      <div className="bg-white dark:bg-[#111111] border-2 border-gray-100 dark:border-gray-800 rounded-2xl p-6 sm:p-8">
        <div className="h-6 w-32 bg-gray-200 dark:bg-gray-700 rounded mb-8" />
        <div className="space-y-6">
          <div>
            <div className="h-3 w-20 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
            <div className="h-5 w-48 bg-gray-200 dark:bg-gray-700 rounded" />
          </div>
          <div>
            <div className="h-3 w-20 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
            <div className="h-5 w-64 bg-gray-200 dark:bg-gray-700 rounded" />
          </div>
        </div>
        <div className="border-t-2 border-dashed border-gray-100 dark:border-gray-800 my-8" />
        <div className="flex gap-4">
          <div className="h-20 w-full bg-gray-200 dark:bg-gray-700 rounded-xl" />
          <div className="h-20 w-full bg-gray-200 dark:bg-gray-700 rounded-xl" />
        </div>
      </div>
      <div className="bg-white dark:bg-[#111111] border-2 border-gray-100 dark:border-gray-800 rounded-2xl p-6 sm:p-8">
         <div className="h-6 w-32 bg-gray-200 dark:bg-gray-700 rounded mb-6" />
         <div className="h-14 w-full bg-gray-200 dark:bg-gray-700 rounded-xl" />
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const [session, setSession] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [accountError, setAccountError] = useState(null);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const signOutDialogRef = useModalFocus(showSignOutConfirm, () => setShowSignOutConfirm(false));
  const deleteDialogRef = useModalFocus(showDeleteConfirm, () => { if (!deletingAccount) setShowDeleteConfirm(false); });

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState(null);
  const [profileError, setProfileError] = useState(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [isPasswordAccordionOpen, setIsPasswordAccordionOpen] = useState(false);
  const [soundsOn, setSoundsOn] = useState(soundsEnabled);
  
  const { preference, setThemePreference } = useTheme();
  const loadingBar = useLoadingBar();

  const fetcher = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return null;

      const [profileRes, courses] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', session.user.id).single(),
        fetchAllRows(() => supabase.from('courses').select('id').eq('cr_id', session.user.id).order('id')),
      ]);
      if (profileRes.error) throw profileRes.error;

      let studentTotal = 0;
      if (courses.length > 0) {
        const courseIds = courses.map(c => c.id);
        const { count, error } = await supabase
          .from('students')
          .select('id', { count: 'exact', head: true })
          .in('course_id', courseIds).is('archived_at', null);
        if (error) throw error;
        studentTotal = count || 0;
      }

      return {
        session,
        profile: profileRes.data || {},
        stats: { courses: courses.length, students: studentTotal }
      };
  };

  const { data, error: loadError, mutate, isLoading: loading, isValidating } = useSWR('profile_data', fetcher);

  const profLoadingBarActive = useRef(false);
  useEffect(() => {
    if (isValidating && !data) { profLoadingBarActive.current = true; loadingBar?.start(); }
    else if (!isValidating && profLoadingBarActive.current) { profLoadingBarActive.current = false; loadingBar?.done(); }
  }, [isValidating, data, loadingBar]);
  
  const profile = data?.profile || null;
  const stats = data?.stats || { courses: 0, students: 0 };

  useEffect(() => {
    if (data?.session) {
      setSession(data.session);
      if (!isEditing) setEditName(data.profile?.full_name || data.session.user.user_metadata?.full_name || 'CR');
    }
  }, [data, isEditing]);

  const handleUpdateName = async () => {
    if (!editName.trim()) return;
    setSaving(true);
    setProfileError(null);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: editName
        })
        .eq('id', session.user.id);
      
      if (error) throw error;
      if (!error) {
        if (data) mutate({ ...data, profile: { ...data.profile, full_name: editName } }, false);
        setIsEditing(false);
        localStorage.setItem('cr_name', editName);
        window.dispatchEvent(new Event('cr_name_updated'));
      }
    } catch (error) {
      setProfileError(`Could not update name: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdatePassword = async () => {
    setPasswordError(null);
    setPasswordSuccess(false);

    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.');
      return;
    }

    setIsUpdatingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) {
        setPasswordError(error.message);
      } else {
        setPasswordSuccess(true);
        setNewPassword('');
        setConfirmPassword('');
        setTimeout(() => setPasswordSuccess(false), 3000);
      }
    } catch {
      setPasswordError('An unexpected error occurred.');
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const handleSignOut = () => {
    window.dispatchEvent(new Event('cr_sign_out'));
  };

  const handleDeleteAccount = async () => {
    setDeletingAccount(true);
    setAccountError(null);
    try {
      const { data, error } = await supabase.functions.invoke('delete-account', { method: 'POST' });
      if (error || !data?.deleted) throw error || new Error('Account deletion could not be verified.');
      await supabase.auth.signOut({ scope: 'local' });
      for (let index = localStorage.length - 1; index >= 0; index--) {
        const key = localStorage.key(index);
        if (key?.startsWith(`attendance_queue_v2_${session.user.id}_`) ||
            key?.startsWith(`attendance_roster_${session.user.id}_`) ||
            key?.startsWith(`attendance_day_${session.user.id}_`)) localStorage.removeItem(key);
      }
      localStorage.removeItem('cr_name');
      window.location.assign('/login');
    } catch (err) {
      setAccountError(err.message || 'Could not delete account. Please try again.');
      setDeletingAccount(false);
    }
  };

  const formatMemberSince = (dateString) => {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  return (
    <Layout>
      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div
            key="skeleton"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.2 }}
          >
            <ProfileSkeleton />
          </motion.div>
        ) : (
          <motion.div
            key="content"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.4, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          >
        {(loadError || profileError) && (
          <div role="alert" className="mb-4 rounded-xl border-2 border-red-500 bg-red-100 px-4 py-3 text-sm font-bold text-red-800">
            {loadError ? `Could not load profile: ${loadError.message}` : profileError}
            {loadError && <button className="ml-3 underline" onClick={() => mutate()}>Retry</button>}
          </div>
        )}
        <h1 className="text-[2rem] font-extrabold leading-[1.05] text-gray-900 dark:text-white sm:text-5xl">
          Profile
        </h1>
        <p className="mt-2 text-sm font-medium text-gray-600 dark:text-gray-400">
          Your account, preferences and sign-out.
        </p>

        <div className="mt-6 grid w-full grid-cols-1 items-start gap-4 md:mt-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-6">
          <div className="flex min-w-0 flex-col gap-4 lg:gap-6">
          {/* Section 1 - Account Info */}
          <motion.div 
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="panel p-5 sm:p-6"
          >
            <h2 className="mb-4 text-lg font-extrabold text-gray-900 dark:text-white">
              Account Info
            </h2>
            
            <div className="mb-4">
              <label className="label">
                Full Name
              </label>
              
              <div className="flex items-center">
                {isEditing ? (
                  <div className="flex items-center gap-2 w-full">
                    <input
                      aria-label="Full name"
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="field flex-1 py-2"
                      autoFocus
                    />
                    <motion.button
                      aria-label="Save name"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={handleUpdateName}
                      disabled={saving}
                      className="border-2 border-transparent bg-[#b9ff66] text-black rounded-lg p-1.5 flex items-center justify-center hover:border-black transition-all"
                    >
                      <Check size={16} />
                    </motion.button>
                    <motion.button
                      aria-label="Cancel name edit"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setIsEditing(false)}
                      className="border-2 border-gray-300 dark:border-gray-700 bg-transparent text-gray-500 dark:text-gray-400 rounded-lg p-1.5 flex items-center justify-center hover:border-black dark:hover:border-white transition-all"
                    >
                      <X size={16} />
                    </motion.button>
                  </div>
                ) : (
                  <div className="flex items-center">
                    <span className="font-bold text-gray-900 dark:text-white text-sm">
                      {profile?.full_name || session?.user?.user_metadata?.full_name || 'CR User'}
                    </span>
                    <motion.button
                      aria-label="Edit name"
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => setIsEditing(true)}
                      className="border-2 border-black dark:border-white rounded-lg p-1 ml-2 text-gray-900 dark:text-white bg-transparent hover:bg-[#b9ff66] hover:border-black transition-all"
                    >
                      <Pencil size={14} />
                    </motion.button>
                  </div>
                )}
              </div>
            </div>

            <div className="mb-4">
              <label className="label flex items-center gap-1.5">
                Email
                <Lock size={12} className="text-gray-400" />
              </label>
              <div className="font-bold text-gray-900 dark:text-white text-sm">
                {session?.user?.email}
              </div>
            </div>

            <div>
              <label className="label">
                Member Since
              </label>
              <div className="font-bold text-gray-900 dark:text-white text-sm">
                {formatMemberSince(session?.user?.created_at)}
              </div>
            </div>

            <div className="my-4 border-t border-black/10 dark:border-white/10" />

            <div className="flex gap-3">
              <div className="bg-[#f7f6f2] dark:bg-[#1a1a1a] border-2 border-black dark:border-white rounded-xl px-4 py-2 flex flex-col justify-center w-full">
                <span className="text-xl font-black text-gray-900 dark:text-white">{stats.courses}</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Courses</span>
              </div>
              <div className="bg-[#f7f6f2] dark:bg-[#1a1a1a] border-2 border-black dark:border-white rounded-xl px-4 py-2 flex flex-col justify-center w-full">
                <span className="text-xl font-black text-gray-900 dark:text-white">{stats.students}</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Students</span>
              </div>
            </div>

            <div className="my-4 border-t border-black/10 dark:border-white/10" />

            <div>
              <button 
                onClick={() => setIsPasswordAccordionOpen(!isPasswordAccordionOpen)}
                className="group -mx-1 flex min-h-[44px] w-[calc(100%+0.5rem)] items-center justify-between rounded-lg px-1 text-left" aria-expanded={isPasswordAccordionOpen}
              >
                <span className="block text-sm font-bold text-gray-900 dark:text-white">
                  Change Password
                </span>
                {isPasswordAccordionOpen ? (
                  <ChevronUp className="w-4 h-4 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors" />
                )}
              </button>
              
              <AnimatePresence>
                {isPasswordAccordionOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
              <div className="pb-1 pt-3">
                      {passwordSuccess && (
                <div className="border-2 border-green-400 bg-green-50 dark:bg-green-950 text-green-600 rounded-xl px-4 py-2 text-xs font-bold mb-4">
                  Password updated successfully!
                </div>
              )}
              
              {passwordError && (
                <div className="border-2 border-red-400 bg-red-50 dark:bg-red-950 text-red-600 rounded-xl px-4 py-2 text-xs font-bold mb-4">
                  {passwordError}
                </div>
              )}

              <input
                aria-label="New password"
                autoComplete="new-password"
                type="password"
                placeholder="New Password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="field mb-3"
              />
              <input
                aria-label="Confirm new password"
                autoComplete="new-password"
                type="password"
                placeholder="Confirm New Password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="field mb-3"
              />
              
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleUpdatePassword}
                disabled={isUpdatingPassword}
                className="btn-primary mb-2 w-full"
              >
                {isUpdatingPassword ? 'Updating...' : 'Update Password →'}
              </motion.button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>

          {/* Section 2 - Preferences */}
          <motion.div 
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="panel p-5 sm:p-6"
          >
            <h2 className="mb-4 text-lg font-extrabold text-gray-900 dark:text-white">
              Preferences
            </h2>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span id="theme-label" className="text-sm font-bold text-gray-900 dark:text-white">Appearance</span>
              <div role="radiogroup" aria-labelledby="theme-label" className="grid grid-cols-3 gap-1 rounded-xl border-2 border-black bg-[#f7f6f2] p-1 dark:border-white/80 dark:bg-[#0a0a0a]">
                {[['system', 'Auto'], ['light', 'Light'], ['dark', 'Dark']].map(([value, label]) => (
                  <button key={value} type="button" role="radio" aria-checked={preference === value}
                    onClick={() => setThemePreference(value)}
                    className={`min-h-[40px] rounded-lg px-4 text-sm font-bold transition-colors ${preference === value
                      ? 'bg-[#b9ff66] text-black'
                      : 'text-gray-600 hover:text-black dark:text-gray-300 dark:hover:text-white'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="my-4 border-t border-black/10 dark:border-white/10" />

            <div className="flex items-center justify-between gap-4">
              <div>
                <span id="sound-label" className="block text-sm font-bold text-gray-900 dark:text-white">Sounds &amp; vibration</span>
                <span className="mt-0.5 block text-xs text-gray-600 dark:text-gray-400">Plays a tick when you mark a student. On iPhone, the silent switch mutes it.</span>
              </div>
              <button type="button" role="switch" aria-checked={soundsOn} aria-labelledby="sound-label"
                onClick={() => {
                  const next = !soundsOn;
                  setSoundsEnabled(next);
                  setSoundsOn(next);
                  if (next) playPresent();
                }}
                className={`relative h-8 w-14 flex-none rounded-full border-2 border-black transition-colors dark:border-white/80 ${soundsOn ? 'bg-[#b9ff66]' : 'bg-black/10 dark:bg-white/15'}`}>
                <span aria-hidden="true" className={`absolute top-1/2 h-6 w-6 -translate-y-1/2 rounded-full border-2 border-black bg-white transition-[left] duration-200 ${soundsOn ? 'left-[26px]' : 'left-0.5'}`} />
              </button>
            </div>
          </motion.div>

          </div>
          <div className="flex min-w-0 flex-col gap-4 lg:gap-6">
          <div className="panel flex items-center justify-between gap-4 p-5 sm:p-6">
            <div>
              <h2 className="text-lg font-extrabold text-gray-900 dark:text-white">Sign out</h2>
              <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">Sign out of this device.</p>
            </div>
            <button onClick={() => setShowSignOutConfirm(true)} className="btn-secondary">
              <LogOut size={16} /> Sign out
            </button>
          </div>

          <div className="rounded-2xl border-2 border-red-400 bg-white p-5 dark:border-red-500/70 dark:bg-[#111] sm:p-6">
            <h2 className="text-lg font-extrabold text-red-600 dark:text-red-400">Delete account</h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Permanently deletes every course, student and attendance record. This can’t be undone.</p>
            <button onClick={() => setShowDeleteConfirm(true)}
              className="btn mt-4 border-red-500 bg-red-50 text-red-700 hover:bg-red-500 hover:text-white dark:bg-red-950/40 dark:text-red-300 dark:hover:text-white">
              Delete account…
            </button>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.15 }}
            className="panel p-5 sm:p-6"
          >
            <h2 className="mb-4 text-lg font-extrabold text-gray-900 dark:text-white">
              About This App
            </h2>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#b9ff66] border-2 border-black flex items-center justify-center font-black text-black text-sm">
                WT
              </div>
              <div className="flex flex-col">
                <span className="font-black text-gray-900 dark:text-white text-sm">Muhammad Wasiq Tanveer</span>
                <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Developer</span>
              </div>
            </div>
            
            <div className="my-4 border-t border-black/10 dark:border-white/10" />
            
            <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-400">
              CR Attendance App was built around my personal need, but as fellow class reps found it useful, I thought why not make it practical. Built with React, Tailwind CSS, Framer Motion and Supabase.
            </p>
            
            <div className="flex gap-2 flex-wrap mt-4">
              <span className="bg-[#f7f6f2] dark:bg-[#1a1a1a] border-2 border-black dark:border-white rounded-xl px-3 py-1 text-xs font-black text-gray-900 dark:text-white">React</span>
              <span className="bg-[#f7f6f2] dark:bg-[#1a1a1a] border-2 border-black dark:border-white rounded-xl px-3 py-1 text-xs font-black text-gray-900 dark:text-white">Tailwind CSS</span>
              <span className="bg-[#f7f6f2] dark:bg-[#1a1a1a] border-2 border-black dark:border-white rounded-xl px-3 py-1 text-xs font-black text-gray-900 dark:text-white">Framer Motion</span>
              <span className="bg-[#f7f6f2] dark:bg-[#1a1a1a] border-2 border-black dark:border-white rounded-xl px-3 py-1 text-xs font-black text-gray-900 dark:text-white">Supabase</span>
            </div>
            
            <div className="flex gap-3 mt-6">
              <a 
                href="https://www.linkedin.com/in/wasiq-tanveer" 
                target="_blank" 
                rel="noopener noreferrer"
                className="bg-transparent border-2 border-black dark:border-white font-bold px-4 py-2 rounded-xl text-sm flex-1 text-center hover:bg-black hover:text-[#b9ff66] dark:hover:bg-white dark:hover:text-black transition-all"
              >
                LinkedIn
              </a>
              <a 
                href="https://wasiq-portfolio-delta.vercel.app/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="bg-[#b9ff66] border-2 border-black text-black font-bold px-4 py-2 rounded-xl text-sm flex-1 text-center hover:bg-black hover:text-[#b9ff66] transition-all"
              >
                Portfolio
              </a>
            </div>

            <div className="mt-5 text-xs font-medium text-gray-600 dark:text-gray-400">
              Built by Muhammad Wasiq Tanveer · {new Date().getFullYear()}
            </div>
          </motion.div>
          </div>
        </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Modals ──────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showSignOutConfirm && (
          <motion.div key="signout" className="sheet-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setShowSignOutConfirm(false)}>
            <motion.div
              ref={signOutDialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="signout-dialog-title"
              tabIndex={-1}
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              onClick={event => event.stopPropagation()}
              className="sheet"
            >
              <div className="sheet-handle" />
              <h3 id="signout-dialog-title" className="text-xl font-extrabold text-gray-900 dark:text-white">Sign out?</h3>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                Marks waiting to sync stay on this phone and upload when you sign back in.
              </p>
              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row">
                <button onClick={() => setShowSignOutConfirm(false)} className="btn-secondary flex-1">Stay signed in</button>
                <button
                  onClick={() => {
                    setShowSignOutConfirm(false);
                    handleSignOut();
                  }}
                  className="btn flex-1 border-black bg-black text-[#b9ff66] hover:bg-[#b9ff66] hover:text-black dark:border-white dark:bg-white dark:text-black"
                >
                  <LogOut size={16} /> Sign out
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showDeleteConfirm && (
          <motion.div key="delete" className="sheet-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => { if (!deletingAccount) setShowDeleteConfirm(false); }}>
            <motion.div
              ref={deleteDialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-account-dialog-title"
              tabIndex={-1}
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              onClick={event => event.stopPropagation()}
              className="sheet border-red-500 dark:border-red-500"
            >
              <div className="sheet-handle" />
              <h3 id="delete-account-dialog-title" className="text-xl font-extrabold text-red-600 dark:text-red-400">Delete your account?</h3>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                This permanently deletes your login and every course, student and attendance record. It can’t be undone.
              </p>
              {accountError && <p role="alert" className="alert-error mt-4">{accountError}</p>}
              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row">
                <button onClick={() => setShowDeleteConfirm(false)} disabled={deletingAccount} className="btn-secondary flex-1">Keep my account</button>
                <button onClick={handleDeleteAccount} disabled={deletingAccount} className="btn-danger flex-1">
                  {deletingAccount ? 'Deleting…' : 'Delete everything'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Layout>
  );
}
