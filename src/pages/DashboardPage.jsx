import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, Undo2 } from 'lucide-react';
import useSWR from 'swr';
import { supabase } from '../lib/supabase';
import { useLoadingBar } from '../context/LoadingBarContext';
import { useCountUp } from '../hooks/useCountUp';
import Layout from '../components/Layout';

// ─── Animated counter — wraps hook so it can be used per-card ───────────────
function CountUp({ value }) {
  const animated = useCountUp(value);
  return <span className="tabular-nums">{animated}</span>;
}

// ─── Shaped skeleton that mirrors the real card layout ──────────────────────
function CourseSkeleton() {
  return (
    <div className="animate-pulse bg-white dark:bg-[#111111] border-2 border-gray-100 dark:border-gray-800 rounded-2xl p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded-lg w-1/2" />
        <div className="h-9 w-9 bg-gray-200 dark:bg-gray-700 rounded-xl flex-shrink-0" />
      </div>
      {/* rate bar skeleton */}
      <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full mt-5 w-full" />
      <div className="flex justify-between mt-1.5">
        <div className="h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
        <div className="h-3 w-8 bg-gray-200 dark:bg-gray-700 rounded" />
      </div>
      <div className="border-t-2 border-dashed border-gray-100 dark:border-gray-800 mt-4 pt-4 flex items-center justify-between gap-4">
        <div className="flex gap-2">
          <div className="h-6 w-20 bg-gray-200 dark:bg-gray-700 rounded-lg" />
          <div className="h-6 w-20 bg-gray-200 dark:bg-gray-700 rounded-lg" />
        </div>
        <div className="flex gap-2">
          <div className="h-8 w-20 bg-gray-200 dark:bg-gray-700 rounded-xl" />
          <div className="h-8 w-20 bg-gray-200 dark:bg-gray-700 rounded-xl" />
          <div className="h-8 w-24 bg-gray-200 dark:bg-gray-700 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [fullName, setFullName] = useState(() => localStorage.getItem('cr_name') || '');
  const [newCourseName, setNewCourseName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [showToast, setShowToast] = useState(false);
  const [courseFilter, setCourseFilter] = useState('');
  const [undoToast, setUndoToast] = useState(null); // { course, timer }

  const newCourseInputRef = useRef(null);
  const navigate = useNavigate();
  const loadingBar = useLoadingBar();

  // ── Sync name from localStorage (set by Layout) ───────────────────────────
  useEffect(() => {
    const handleNameSync = () => setFullName(localStorage.getItem('cr_name') || '');
    window.addEventListener('cr_name_updated', handleNameSync);
    return () => window.removeEventListener('cr_name_updated', handleNameSync);
  }, []);

  // ── Keyboard shortcut: 'n' focuses add-course input ──────────────────────
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'n' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
        e.preventDefault();
        newCourseInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ── Cleanup any pending undo timer on unmount ─────────────────────────────
  useEffect(() => {
    return () => { if (undoToast?.timer) clearTimeout(undoToast.timer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetcher = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return [];

      const { data: coursesData } = await supabase
        .from('courses')
        .select('*')
        .eq('cr_id', session.user.id)
        .order('created_at', { ascending: false });

      if (!coursesData || coursesData.length === 0) return [];

      const courseIds = coursesData.map(c => c.id);

      const [{ data: allStudents }, { data: allAttendance }] = await Promise.all([
        supabase.from('students').select('id, course_id').in('course_id', courseIds),
        supabase.from('attendance').select('date, course_id, status').in('course_id', courseIds),
      ]);

      const studentCounts = {};
      const attByCourse = {};
      courseIds.forEach(id => {
        studentCounts[id] = 0;
        attByCourse[id] = { total: 0, present: 0, dates: new Set() };
      });

      allStudents?.forEach(s => { studentCounts[s.course_id] = (studentCounts[s.course_id] || 0) + 1; });
      allAttendance?.forEach(a => {
        if (!attByCourse[a.course_id]) return;
        attByCourse[a.course_id].total++;
        if (a.status === 'present') attByCourse[a.course_id].present++;
        attByCourse[a.course_id].dates.add(a.date);
      });

      return coursesData.map(c => ({
        ...c,
        studentCount: studentCounts[c.id] || 0,
        classCount: attByCourse[c.id]?.dates.size || 0,
        attendanceRate: attByCourse[c.id]?.total > 0
          ? Math.round((attByCourse[c.id].present / attByCourse[c.id].total) * 100)
          : null,
      }));
    } catch (err) {
      throw err;
    }
  };

  const { data: courses = [], mutate: mutateCourses, isLoading: loading, isValidating } = useSWR('dashboard_courses', fetcher);

  // Show loading bar only on true first fetch (no cached data) or manual revalidation
  useEffect(() => {
    if (isValidating && !courses.length) loadingBar?.start();
    else if (!isValidating) loadingBar?.done();
  }, [isValidating]);

  // Helper alias to maintain existing mutation logic
  const setCourses = (updater) => {
    mutateCourses(typeof updater === 'function' ? updater(courses) : updater, { revalidate: false });
  };

  // ── Add course ────────────────────────────────────────────────────────────
  const handleAddCourse = async (e) => {
    e.preventDefault();
    if (!newCourseName.trim()) return;

    setIsSubmitting(true);
    setErrorMsg(null);
    const { data: { session } } = await supabase.auth.getSession();

    const { data: newCourse, error } = await supabase
      .from('courses')
      .insert({ name: newCourseName.trim(), cr_id: session.user.id })
      .select()
      .single();

    if (error) {
      setErrorMsg(error.message);
    } else {
      setNewCourseName('');
      setCourses(prev => [{ ...newCourse, studentCount: 0, classCount: 0, attendanceRate: null }, ...prev]);
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2500);
    }
    setIsSubmitting(false);
  };

  // ── Undo-delete: removes from UI instantly, delays real DB delete 3s ──────
  const handleDeleteCourse = (id) => {
    const courseToDelete = courses.find(c => c.id === id);
    if (!courseToDelete) return;

    // Clear any in-flight undo timer from a previous delete, but force execute it!
    if (undoToast?.timer) {
      clearTimeout(undoToast.timer);
      supabase.from('courses').delete().eq('id', undoToast.course.id).then();
    }

    setDeletingId(null);
    setCourses(prev => prev.filter(c => c.id !== id));

    const timer = setTimeout(async () => {
      await supabase.from('courses').delete().eq('id', id);
      setUndoToast(null);
    }, 3000);

    setUndoToast({ course: courseToDelete, timer });
  };

  const handleUndoDelete = () => {
    if (!undoToast) return;
    clearTimeout(undoToast.timer);
    setCourses(prev =>
      [undoToast.course, ...prev].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    );
    setUndoToast(null);
  };

  const filteredCourses = courses.filter(c =>
    c.name.toLowerCase().includes(courseFilter.toLowerCase())
  );

  const rateColor = (rate) => {
    if (rate === null) return '';
    if (rate >= 75) return 'bg-[#b9ff66]';
    if (rate >= 50) return 'bg-yellow-400';
    return 'bg-red-400';
  };

  return (
    <Layout>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12 }}
        transition={{ duration: 0.4, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* ── Header ────────────────────────────────────────────────── */}
        <div className="flex flex-col md:flex-row md:items-start justify-between">
          <div>
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.25 }}
              className="bg-[#b9ff66] border border-black text-black text-xs font-bold px-3 py-1 rounded-full inline-block mb-3"
            >
              My Courses
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="text-4xl font-black text-gray-900 dark:text-white tracking-tight"
            >
              Your Classes
            </motion.h1>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mt-2">
              {fullName ? `Welcome back, ${fullName}` : 'Welcome back'}
            </p>
          </div>
        </div>

        {/* ── Add Course Form ───────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
          className="mt-6 mb-8"
        >
          {errorMsg && (
            <div className="bg-red-100 border-2 border-red-500 text-red-700 font-bold px-4 py-2 rounded-xl text-sm mb-4">
              {errorMsg}
            </div>
          )}
          <form onSubmit={handleAddCourse} className="flex flex-col sm:flex-row gap-3">
            <input
              ref={newCourseInputRef}
              id="new-course-input"
              type="text"
              value={newCourseName}
              onChange={(e) => setNewCourseName(e.target.value)}
              disabled={isSubmitting}
              placeholder='New course name… (press "N" to focus)'
              className="flex-1 px-5 py-3 rounded-2xl border-2 border-black dark:border-white bg-white dark:bg-[#111111] text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-[#b9ff66] font-bold text-sm transition-colors"
              required
            />
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.96 }}
              type="submit"
              disabled={isSubmitting}
              className="bg-[#b9ff66] border-2 border-black text-black font-bold px-5 py-3 rounded-2xl hover:bg-black hover:text-[#b9ff66] transition-all duration-150 whitespace-nowrap disabled:opacity-75"
            >
              {isSubmitting ? 'Adding…' : 'Add Course'}
            </motion.button>
          </form>
        </motion.div>

        {/* ── List Header + Filter ──────────────────────────────────── */}
        <div className="flex items-center justify-between mt-8 mb-4 gap-4">
          <h2 className="text-xs font-bold uppercase tracking-wide text-gray-400 whitespace-nowrap">
            {courses.length} {courses.length === 1 ? 'Course' : 'Courses'}
          </h2>
          {courses.length > 1 && (
            <input
              type="text"
              value={courseFilter}
              onChange={(e) => setCourseFilter(e.target.value)}
              placeholder="Filter courses…"
              className="w-44 px-4 py-1.5 rounded-xl border-2 border-black dark:border-white bg-white dark:bg-[#111111] text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-[#b9ff66] font-bold text-xs transition-colors"
            />
          )}
        </div>

        {/* ── Content: Skeleton / Empty / Cards ────────────────────── */}
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div
              key="skeleton"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col gap-4"
            >
              {[1, 2, 3].map(i => <CourseSkeleton key={i} />)}
            </motion.div>
          ) : courses.length === 0 ? (
          /* ── Empty state with inline SVG ── */
          <motion.div
            key="empty"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-2xl p-12 text-center flex flex-col items-center justify-center"
          >
            <svg className="w-16 h-16 text-gray-300 dark:text-gray-700 mb-4" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="8" y="16" width="48" height="40" rx="4" stroke="currentColor" strokeWidth="2.5" strokeDasharray="6 3"/>
              <path d="M8 26H56" stroke="currentColor" strokeWidth="2.5"/>
              <path d="M20 8V20M44 8V20" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
              <path d="M32 38V46M28 42H36" stroke="#b9ff66" strokeWidth="3" strokeLinecap="round"/>
            </svg>
            <h3 className="font-black text-gray-400 text-lg mt-1">No courses yet</h3>
            <p className="text-sm text-gray-400 mt-2">
              Add your first course above or press{' '}
              <kbd className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 px-1.5 py-0.5 rounded text-xs font-black">N</kbd>
            </p>
          </motion.div>
        ) : filteredCourses.length === 0 ? (
          <motion.div
            key="notfound"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-center py-10 text-sm font-bold text-gray-400"
          >
            No courses match "<span className="text-gray-600 dark:text-gray-300">{courseFilter}</span>"
          </motion.div>
        ) : (
          <motion.div
            key="list"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col gap-4"
          >
            <AnimatePresence>
              {filteredCourses.map((course, index) => (
                <motion.div
                  layout
                  key={course.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -16, scale: 0.98 }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1], delay: 0.15 + index * 0.08 }}
                  className="bg-white dark:bg-[#111111] border-2 border-black dark:border-white rounded-2xl p-6 flex flex-col"
                >
                  {/* card header */}
                  <div className="flex items-start justify-between gap-4">
                    <h3 className="text-xl font-black text-gray-900 dark:text-white break-words">
                      {course.name}
                    </h3>

                    {deletingId === course.id ? (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.8, x: 10 }}
                        animate={{ opacity: 1, scale: 1, x: 0 }}
                        className="flex items-center gap-1 border-2 border-red-500 rounded-xl p-1 bg-red-50 dark:bg-red-950 ml-2"
                      >
                        <motion.button
                          whileTap={{ scale: 0.9 }}
                          onClick={() => handleDeleteCourse(course.id)}
                          className="px-2 py-1 text-xs font-bold text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors"
                        >
                          Sure?
                        </motion.button>
                        <motion.button
                          whileTap={{ scale: 0.9 }}
                          onClick={() => setDeletingId(null)}
                          className="px-2 py-1 text-xs font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg transition-colors"
                        >
                          Cancel
                        </motion.button>
                      </motion.div>
                    ) : (
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setDeletingId(course.id)}
                        className="border-2 border-black dark:border-white rounded-xl p-2 hover:bg-red-500 hover:border-red-500 hover:text-white transition-all duration-150 text-gray-900 dark:text-white ml-2 flex-shrink-0"
                      >
                        <Trash2 size={16} />
                      </motion.button>
                    )}
                  </div>

                  {/* ── Attendance rate bar ── */}
                  {course.attendanceRate !== null && (
                    <div className="mt-4">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Avg Attendance</span>
                        <span className="text-xs font-black text-gray-900 dark:text-white">
                          <CountUp value={course.attendanceRate} />%
                        </span>
                      </div>
                      <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${course.attendanceRate}%` }}
                          transition={{ duration: 0.8, delay: index * 0.05 + 0.2, ease: [0.22, 1, 0.36, 1] }}
                          className={`h-full rounded-full ${rateColor(course.attendanceRate)}`}
                        />
                      </div>
                    </div>
                  )}

                  {/* card footer */}
                  <div className="border-t-2 border-dashed border-gray-100 dark:border-gray-800 mt-4 pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex gap-2">
                      <div className="bg-[#f7f6f2] dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1 text-xs font-bold text-gray-500 dark:text-gray-400">
                        <CountUp value={course.studentCount} /> students
                      </div>
                      <div className="bg-[#f7f6f2] dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1 text-xs font-bold text-gray-500 dark:text-gray-400">
                        <CountUp value={course.classCount} /> classes
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => navigate(`/courses/${course.id}/students`)}
                        className="border-2 border-black dark:border-white rounded-xl px-4 py-2 text-xs font-bold hover:bg-[#b9ff66] hover:border-black transition-all duration-150 text-gray-900 dark:text-white whitespace-nowrap"
                      >
                        Students
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => navigate(`/courses/${course.id}/history`)}
                        className="border-2 border-black dark:border-white rounded-xl px-4 py-2 text-xs font-bold hover:bg-[#b9ff66] hover:border-black transition-all duration-150 text-gray-900 dark:text-white whitespace-nowrap"
                      >
                        History
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => navigate(`/courses/${course.id}/attendance`)}
                        className="bg-[#b9ff66] border-2 border-black rounded-xl px-4 py-2 text-xs font-bold text-black hover:bg-black hover:text-[#b9ff66] transition-all duration-150 whitespace-nowrap"
                      >
                        Attendance
                      </motion.button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
        </AnimatePresence>
      </motion.div>

      {/* ── Toasts ──────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showToast && (
          <motion.div
            key="added"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className="fixed bottom-6 right-6 z-50 bg-[#b9ff66] border-2 border-black rounded-xl px-5 py-3 font-bold text-black text-sm"
          >
            ✓ Course added!
          </motion.div>
        )}

        {undoToast && (
          <motion.div
            key={undoToast.course.id}
            initial={{ opacity: 0, y: 24, x: "-50%", scale: 0.95 }}
            animate={{ opacity: 1, y: 0, x: "-50%", scale: 1 }}
            exit={{ opacity: 0, y: 24, x: "-50%", scale: 0.95 }}
            className="fixed bottom-6 left-1/2 z-50 bg-gray-900 dark:bg-white border-2 border-black rounded-2xl p-2 flex flex-col gap-2 shadow-2xl min-w-[280px]"
          >
            <div className="flex items-center justify-between gap-4 px-3 py-1">
              <span className="text-sm font-bold text-white dark:text-black whitespace-nowrap">
                "{undoToast.course.name}" deleted
              </span>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleUndoDelete}
                className="flex items-center gap-1.5 bg-[#b9ff66] border-2 border-black text-black font-black text-xs px-3 py-1.5 rounded-lg hover:bg-black hover:text-[#b9ff66] transition-all"
              >
                <Undo2 size={12} />
                Undo
              </motion.button>
            </div>
            {/* Visual countdown bar */}
            <div className="h-1.5 bg-gray-700 dark:bg-gray-200 rounded-full overflow-hidden mx-2 mb-1">
              <motion.div 
                initial={{ scaleX: 1 }}
                animate={{ scaleX: 0 }}
                transition={{ duration: 3, ease: "linear" }}
                style={{ originX: 0 }}
                className="h-full bg-[#b9ff66] w-full"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Layout>
  );
}