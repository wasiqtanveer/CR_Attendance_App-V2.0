import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Pencil, Check, X, Lock, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../lib/supabase';
import useSWR from 'swr';
import { useTheme } from '../context/ThemeContext';
import { useLoadingBar } from '../context/LoadingBarContext';
import Layout from '../components/Layout';

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
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [isPasswordAccordionOpen, setIsPasswordAccordionOpen] = useState(false);
  
  const { theme, toggleTheme } = useTheme();
  const isDarkMode = theme === 'dark';
  const navigate = useNavigate();
  const loadingBar = useLoadingBar();

  const fetcher = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return null;

      const [profileRes, coursesRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', session.user.id).single(),
        supabase.from('courses').select('id', { count: 'exact' }).eq('cr_id', session.user.id)
      ]);

      let studentTotal = 0;
      if (coursesRes.data && coursesRes.data.length > 0) {
        const courseIds = coursesRes.data.map(c => c.id);
        const { count } = await supabase
          .from('students')
          .select('id', { count: 'exact', head: true })
          .in('course_id', courseIds);
        studentTotal = count || 0;
      }

      return {
        session,
        profile: profileRes.data || {},
        stats: { courses: coursesRes.count || 0, students: studentTotal }
      };
    } catch (err) {
      throw err;
    }
  };

  const { data, mutate, isLoading: loading, isValidating } = useSWR('profile_data', fetcher);

  const profLoadingBarActive = useRef(false);
  useEffect(() => {
    if (isValidating && !data) { profLoadingBarActive.current = true; loadingBar?.start(); }
    else if (!isValidating && profLoadingBarActive.current) { profLoadingBarActive.current = false; loadingBar?.done(); }
  }, [isValidating]);
  
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
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: editName
        })
        .eq('id', session.user.id);
      
      if (!error) {
        if (data) mutate({ ...data, profile: { ...data.profile, full_name: editName } }, false);
        setIsEditing(false);
        localStorage.setItem('cr_name', editName);
        window.dispatchEvent(new Event('cr_name_updated'));
      }
    } catch (error) {
      console.error('Error updating profile:', error);
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
    } catch (err) {
      setPasswordError('An unexpected error occurred.');
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const handleSignOut = () => {
    window.dispatchEvent(new Event('cr_sign_out'));
  };

  const handleDeleteAccount = async () => {
    try {
      await supabase.from('profiles').delete().eq('id', session?.user?.id);
      await supabase.auth.signOut();
      navigate('/login');
    } catch (err) {
      console.error(err);
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
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.25 }}
          className="bg-[#b9ff66] border border-black text-black text-xs font-bold px-3 py-1 rounded-full inline-block mb-3"
        >
          Account
        </motion.div>
        <motion.h1
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="text-4xl font-black text-gray-900 dark:text-white tracking-tight"
        >
          Profile
        </motion.h1>
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mt-2">
          Manage your account
        </p>

        <div className="w-full mt-10 flex flex-col gap-6">
          {/* Section 1 - Account Info */}
          <motion.div 
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="bg-white dark:bg-[#111111] border-2 border-black dark:border-white rounded-2xl p-6 shadow-sm"
          >
            <h2 className="text-xs font-black uppercase tracking-wide text-gray-400 mb-5">
              Account Info
            </h2>
            
            <div className="mb-4">
              <label className="block text-xs font-black uppercase tracking-wide text-gray-400 mb-1.5">
                Full Name
              </label>
              
              <div className="flex items-center">
                {isEditing ? (
                  <div className="flex items-center gap-2 w-full">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="flex-1 bg-transparent border-2 border-black dark:border-white rounded-xl px-3 py-1.5 text-sm font-bold text-gray-900 dark:text-white focus:outline-none focus:border-[#b9ff66]"
                      autoFocus
                    />
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={handleUpdateName}
                      disabled={saving}
                      className="border-2 border-transparent bg-[#b9ff66] text-black rounded-lg p-1.5 flex items-center justify-center hover:border-black transition-all"
                    >
                      <Check size={16} />
                    </motion.button>
                    <motion.button
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
              <label className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-gray-400 mb-1.5">
                Email
                <Lock size={12} className="text-gray-400" />
              </label>
              <div className="font-bold text-gray-900 dark:text-white text-sm">
                {session?.user?.email}
              </div>
            </div>

            <div>
              <label className="block text-xs font-black uppercase tracking-wide text-gray-400 mb-1.5">
                Member Since
              </label>
              <div className="font-bold text-gray-900 dark:text-white text-sm">
                {formatMemberSince(session?.user?.created_at)}
              </div>
            </div>

            <div className="border-t-2 border-dashed border-gray-100 dark:border-gray-800 my-5" />

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

            <div className="border-t-2 border-dashed border-gray-100 dark:border-gray-800 my-5" />

            <div>
              <button 
                onClick={() => setIsPasswordAccordionOpen(!isPasswordAccordionOpen)}
                className="flex items-center justify-between w-full text-left focus:outline-none mb-4 group"
              >
                <span className="block text-xs font-black uppercase tracking-wide text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors">
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
              <div className="pt-1 pb-2">
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
                type="password"
                placeholder="New Password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full bg-transparent border-2 border-black dark:border-white rounded-xl px-4 py-2.5 text-sm font-bold text-gray-900 dark:text-white focus:outline-none focus:border-[#b9ff66] mb-3"
              />
              <input
                type="password"
                placeholder="Confirm New Password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-transparent border-2 border-black dark:border-white rounded-xl px-4 py-2.5 text-sm font-bold text-gray-900 dark:text-white focus:outline-none focus:border-[#b9ff66] mb-3"
              />
              
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleUpdatePassword}
                disabled={isUpdatingPassword}
                className="bg-[#b9ff66] border-2 border-black text-black font-bold py-2.5 rounded-xl hover:bg-black hover:text-[#b9ff66] transition-all duration-150 text-sm w-full mb-2"
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
            className="bg-white dark:bg-[#111111] border-2 border-black dark:border-white rounded-2xl p-6 shadow-sm"
          >
            <h2 className="text-xs font-black uppercase tracking-wide text-gray-400 mb-5">
              Preferences
            </h2>
            
            <div className="flex items-center justify-between">
              <div>
                <div className="font-bold text-sm text-gray-900 dark:text-white truncate">Dark Mode</div>
                <div className="text-xs font-medium text-gray-400 mt-0.5 truncate">Switch between light and dark theme</div>
              </div>
              
              <div className="ml-4">
                <motion.div
                  onClick={toggleTheme}
                  className={`w-12 h-6 rounded-full border-2 cursor-pointer flex items-center px-0.5 relative ${
                    isDarkMode 
                      ? 'bg-[#b9ff66] border-black' 
                      : 'bg-gray-200 border-black dark:border-white'
                  }`}
                >
                  <motion.div 
                    className={`w-4 h-4 rounded-full absolute ${isDarkMode ? 'bg-black' : 'bg-white border border-gray-300'}`}
                    animate={{ x: isDarkMode ? 20 : 0 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  />
                </motion.div>
              </div>
            </div>
          </motion.div>

          {/* Section 3 - Danger Zone */}
          <motion.div 
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="bg-white dark:bg-[#111111] border-2 border-red-400 dark:border-red-600 rounded-2xl p-6 shadow-sm"
          >
            <h2 className="text-xs font-black uppercase tracking-wide text-red-400 mb-5">
              Danger Zone
            </h2>

            <div className="flex flex-row items-center justify-between gap-4">
              <div>
                <div className="font-bold text-sm text-gray-900 dark:text-white">Sign Out</div>
                <div className="text-xs font-medium text-gray-400 mt-0.5 hidden sm:block">You will be redirected to the login page</div>
              </div>
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setShowSignOutConfirm(true)}
                className="border-2 border-black dark:border-white rounded-xl px-5 py-2 text-sm font-bold text-gray-900 dark:text-white hover:bg-black hover:text-[#b9ff66] dark:hover:bg-white dark:hover:text-black transition-all bg-transparent whitespace-nowrap"
              >
                Sign Out →
              </motion.button>
            </div>

            <div className="border-t-2 border-dashed border-red-100 dark:border-red-900/40 my-5" />

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="font-bold text-sm text-red-500">Delete Account</div>
                <div className="text-xs font-medium text-gray-400 mt-0.5 hidden sm:block">Permanently delete all your data. This cannot be undone.</div>
              </div>

              <div className="flex-shrink-0">
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setShowDeleteConfirm(true)}
                  className="bg-red-50 dark:bg-red-950/30 border-2 border-red-500 rounded-xl px-5 py-2 text-sm font-bold text-red-600 hover:bg-red-500 hover:text-white transition-all whitespace-nowrap"
                >
                  Delete Account
                </motion.button>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.15 }}
            className="bg-white dark:bg-[#111111] border-2 border-black dark:border-white rounded-2xl p-6"
          >
            <h2 className="text-xs font-black uppercase tracking-wide text-gray-400 mb-5">
              About This App
            </h2>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#b9ff66] border-2 border-black flex items-center justify-center font-black text-black text-sm">
                WT
              </div>
              <div className="flex flex-col">
                <span className="font-black text-gray-900 dark:text-white text-sm">Muhammad Wasiq Tanveer</span>
                <span className="text-xs text-gray-400 font-medium">Developer</span>
              </div>
            </div>
            
            <div className="border-t-2 border-dashed border-gray-100 dark:border-gray-800 my-4" />
            
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400 leading-relaxed">
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

            <div className="mt-5 text-xs text-gray-400 font-medium">
              Built by Muhammad Wasiq Tanveer · {new Date().getFullYear()}
            </div>
          </motion.div>
        </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Modals ──────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showSignOutConfirm && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 pointer-events-none rounded-xl"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: '-40%', x: '-50%' }}
              animate={{ opacity: 1, scale: 1, y: '-50%', x: '-50%' }}
              exit={{ opacity: 0, scale: 0.95, y: '-40%', x: '-50%' }}
              className="fixed top-1/2 left-1/2 w-[90%] max-w-sm bg-white dark:bg-[#111111] border-2 border-black dark:border-white rounded-2xl p-6 z-[60] shadow-2xl pointer-events-auto"
            >
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Sign Out?</h3>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-6">
                Are you sure you want to sign out of your account?
              </p>
              <div className="flex gap-3 mt-4">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setShowSignOutConfirm(false)}
                  className="flex-1 border-2 border-gray-300 dark:border-gray-600 rounded-xl py-2.5 font-bold text-gray-600 dark:text-gray-300 hover:border-black dark:hover:border-white hover:text-black dark:hover:text-white transition-colors"
                >
                  Cancel
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    setShowSignOutConfirm(false);
                    handleSignOut();
                  }}
                  className="flex-1 bg-black dark:bg-white border-2 border-black dark:border-white rounded-xl py-2.5 font-bold text-[#b9ff66] dark:text-black hover:bg-[#b9ff66] hover:text-black transition-colors"
                >
                  Yes, Sign Out
                </motion.button>
              </div>
            </motion.div>
          </>
        )}

        {showDeleteConfirm && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 pointer-events-none rounded-xl"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: '-40%', x: '-50%' }}
              animate={{ opacity: 1, scale: 1, y: '-50%', x: '-50%' }}
              exit={{ opacity: 0, scale: 0.95, y: '-40%', x: '-50%' }}
              className="fixed top-1/2 left-1/2 w-[90%] max-w-sm bg-white dark:bg-[#111111] border-2 border-red-500 dark:border-red-600 rounded-2xl p-6 z-[60] shadow-2xl pointer-events-auto"
            >
              <h3 className="text-xl font-bold text-red-500 dark:text-red-600 mb-2">Delete Everything?</h3>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-6">
                This will permanently delete all your courses, students, and attendance data. This action cannot be undone.
              </p>
              <div className="flex gap-3 mt-4">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 border-2 border-gray-300 dark:border-gray-600 rounded-xl py-2.5 font-bold text-gray-600 dark:text-gray-300 hover:border-black dark:hover:border-white hover:text-black dark:hover:text-white transition-colors"
                >
                  Cancel
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleDeleteAccount}
                  className="flex-1 bg-red-50 dark:bg-red-950/30 border-2 border-red-500 rounded-xl py-2.5 font-bold text-red-600 hover:bg-red-500 hover:text-white transition-colors"
                >
                  Yes, Delete
                </motion.button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </Layout>
  );
}