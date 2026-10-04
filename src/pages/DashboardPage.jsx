import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, Check, ClipboardCheck, History as HistoryIcon, Plus, Search, Trash2, Undo2, Users } from 'lucide-react';
import useSWR from 'swr';
import { supabase } from '../lib/supabase';
import { useLoadingBar } from '../context/LoadingBarContext';
import { useCountUp } from '../hooks/useCountUp';
import Layout from '../components/Layout';
import { playDelete } from '../lib/sounds';
import { fetchAllRows } from '../lib/fetchAllRows';
import { useModalFocus } from '../hooks/useModalFocus';

// ─── Animated counter — wraps hook so it can be used per-card ───────────────
function CountUp({ value }) {
  const animated = useCountUp(value);
  return <span className="tabular-nums">{animated}</span>;
}

// ─── Shaped skeleton that mirrors the real card layout ──────────────────────
function CourseSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl border-2 border-black/10 bg-white p-5 dark:border-white/10 dark:bg-[#111]">
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
  const [mobileDeletingCourse, setMobileDeletingCourse] = useState(null);
  const deleteCourseDialogRef = useModalFocus(Boolean(mobileDeletingCourse), () => setMobileDeletingCourse(null));
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.matchMedia('(pointer: coarse)').matches);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  const [errorMsg, setErrorMsg] = useState(null);
  const [showToast, setShowToast] = useState(false);
  const [courseFilter, setCourseFilter] = useState('');
  const [pendingDeletes, setPendingDeletes] = useState([]); // Each course has its own undo window.

  const newCourseInputRef = useRef(null);
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

  const fetcher = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return [];

      const coursesData = await fetchAllRows(() => supabase.from('courses').select('*')
        .eq('cr_id', session.user.id).order('created_at', { ascending: false }).order('id'));

      if (!coursesData || coursesData.length === 0) return [];

      const courseIds = coursesData.map(c => c.id);

      const [allStudents, allAttendance] = await Promise.all([
        fetchAllRows(() => supabase.from('students').select('id, course_id').in('course_id', courseIds).is('archived_at', null).order('id')),
        fetchAllRows(() => supabase.from('attendance').select('id, date, course_id, status').in('course_id', courseIds).order('id')),
      ]);

      const studentCounts = {};
      const attByCourse = {};
      courseIds.forEach(id => {
        studentCounts[id] = 0;
        attByCourse[id] = { total: 0, present: 0, dates: new Set() };
      });

      allStudents.forEach(s => { studentCounts[s.course_id] = (studentCounts[s.course_id] || 0) + 1; });
      allAttendance.forEach(a => {
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
  };

  const { data: courses = [], error: loadError, mutate: mutateCourses, isLoading: loading, isValidating } = useSWR('dashboard_courses', fetcher);

  // Show loading bar only on true first fetch (no cached data) or manual revalidation
  useEffect(() => {
    if (isValidating && !courses.length) loadingBar?.start();
    else if (!isValidating) loadingBar?.done();
  }, [isValidating, courses.length, loadingBar]);

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
    playDelete();
    setDeletingId(null);
    setCourses(prev => prev.filter(c => c.id !== id));

    const timer = setTimeout(async () => {
      const { error } = await supabase.from('courses').delete().eq('id', id);
      if (error) {
        setErrorMsg(`Could not delete ${courseToDelete.name}: ${error.message}`);
        await mutateCourses();
      }
      setPendingDeletes(prev => prev.filter(item => item.course.id !== id));
    }, 5000);

    setPendingDeletes(prev => [...prev, { course: courseToDelete, timer }]);
  };

  const handleUndoDelete = (id) => {
    const pending = pendingDeletes.find(item => item.course.id === id);
    if (!pending) return;
    clearTimeout(pending.timer);
    setCourses(prev =>
      [pending.course, ...prev].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    );
    setPendingDeletes(prev => prev.filter(item => item.course.id !== id));
  };

  const filteredCourses = courses.filter(c =>
    c.name.toLowerCase().includes(courseFilter.toLowerCase())
  );
  const totalStudents = courses.reduce((sum, course) => sum + (course.studentCount || 0), 0);

  const rateColor = (rate) => {
    if (rate === null) return '';
    if (rate >= 75) return 'bg-[#b9ff66]';
    if (rate >= 50) return 'bg-yellow-400';
    return 'bg-red-400';
  };

  const firstName = fullName && fullName !== 'CR' ? fullName.split(' ')[0] : '';
  const toastBottom = 'bottom-[calc(5.5rem+env(safe-area-inset-bottom))] md:bottom-6';

  return (
    <Layout>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* ── Header ────────────────────────────────────────────────── */}
        <div className="mb-5 md:mb-8">
          <p className="text-sm font-semibold text-gray-600 dark:text-gray-400">
            {firstName ? `Hi ${firstName},` : 'Welcome back,'}
          </p>
          <h1 className="mt-0.5 text-[2rem] font-extrabold leading-[1.05] text-gray-900 dark:text-white sm:text-5xl">
            Your courses
          </h1>
          {!loading && courses.length > 0 && (
            <p className="mt-2 text-sm font-medium text-gray-600 dark:text-gray-400">
              {courses.length} {courses.length === 1 ? 'course' : 'courses'} · {totalStudents} {totalStudents === 1 ? 'student' : 'students'}
            </p>
          )}
        </div>

        {/* ── Add Course Form ───────────────────────────────────────── */}
        <div className="panel mb-6 p-3 shadow-[4px_4px_0_#111] dark:shadow-[4px_4px_0_#b9ff66] sm:p-4">
          {errorMsg && <div className="alert-error mb-3">{errorMsg}</div>}
          {loadError && (
            <div role="alert" className="alert-error mb-3">
              Could not load courses: {loadError.message} <button className="ml-2 underline" onClick={() => mutateCourses()}>Retry</button>
            </div>
          )}
          <form onSubmit={handleAddCourse} className="flex gap-2">
            <label htmlFor="new-course-input" className="sr-only">New course name</label>
            <input
              ref={newCourseInputRef}
              id="new-course-input"
              type="text"
              value={newCourseName}
              onChange={(e) => setNewCourseName(e.target.value)}
              disabled={isSubmitting}
              placeholder="New course, e.g. Software Engineering"
              autoCapitalize="words"
              className="field flex-1"
              required
            />
            <button type="submit" disabled={isSubmitting} className="btn-primary px-4 sm:px-5" aria-label="Add course">
              <Plus size={18} strokeWidth={2.5} />
              <span className="hidden sm:inline">{isSubmitting ? 'Adding…' : 'Add course'}</span>
            </button>
          </form>
          <p className="mt-2 hidden px-1 text-xs text-gray-500 dark:text-gray-400 md:block">Press <kbd className="rounded border border-black/20 px-1 font-bold dark:border-white/30">N</kbd> to jump here.</p>
        </div>

        {/* ── Filter ──────────────────────────────────────────────── */}
        {courses.length > 3 && (
          <label className="relative mb-4 block">
            <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="search"
              aria-label="Filter courses"
              value={courseFilter}
              onChange={(e) => setCourseFilter(e.target.value)}
              placeholder="Find a course"
              className="field pl-10"
            />
          </label>
        )}

        {/* ── Content: Skeleton / Empty / Cards ────────────────────── */}
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div key="skeleton" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {[1, 2, 3].map(i => <CourseSkeleton key={i} />)}
            </motion.div>
          ) : courses.length === 0 ? (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="panel-soft flex flex-col items-center px-6 py-12 text-center">
              <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-black bg-[#b9ff66] text-black">
                <BookOpen size={26} />
              </span>
              <h2 className="text-xl font-extrabold text-gray-900 dark:text-white">Add your first course</h2>
              <p className="mt-1 max-w-xs text-sm text-gray-600 dark:text-gray-400">
                Type a course name above. Next you’ll add the class list, then you’re ready for roll call.
              </p>
              <button onClick={() => newCourseInputRef.current?.focus()} className="btn-secondary mt-6">Name a course</button>
            </motion.div>
          ) : filteredCourses.length === 0 ? (
            <motion.div key="notfound" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="py-10 text-center text-sm font-semibold text-gray-600 dark:text-gray-400">
              No courses match “{courseFilter}”.
            </motion.div>
          ) : (
            <motion.ul key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <AnimatePresence>
                {filteredCourses.map((course, index) => (
                  <motion.li
                    layout
                    key={course.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -16 }}
                    transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1], delay: Math.min(index * 0.03, 0.2) }}
                    className="course-card panel flex h-full flex-col p-4 sm:p-5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <Link to={`/courses/${course.id}/students`} className="min-w-0 flex-1">
                        <h3 className="break-words text-xl font-extrabold leading-tight text-gray-900 dark:text-white">{course.name}</h3>
                        <p className="mt-1 text-xs font-semibold text-gray-600 dark:text-gray-400">
                          <CountUp value={course.studentCount} /> {course.studentCount === 1 ? 'student' : 'students'} · <CountUp value={course.classCount} /> {course.classCount === 1 ? 'class' : 'classes'}
                        </p>
                      </Link>

                      {deletingId === course.id && !isMobile ? (
                        <div className="flex flex-none items-center gap-1">
                          <button onClick={() => setDeletingId(null)} className="btn-quiet min-h-[36px] px-2.5 text-xs">Cancel</button>
                          <button onClick={() => handleDeleteCourse(course.id)} className="btn-danger min-h-[36px] px-2.5 text-xs">Delete</button>
                        </div>
                      ) : (
                        <button
                          aria-label={`Delete ${course.name}`}
                          onClick={() => isMobile ? setMobileDeletingCourse(course) : setDeletingId(course.id)}
                          className="-mr-1.5 -mt-1 flex h-10 w-10 flex-none items-center justify-center rounded-xl text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-gray-400 dark:hover:bg-red-950/50 dark:hover:text-red-400"
                        >
                          <Trash2 size={17} />
                        </button>
                      )}
                    </div>

                    {course.attendanceRate !== null && (
                      <div className="mt-4">
                        <div className="mb-1.5 flex items-center justify-between">
                          <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Average attendance</span>
                          <span className="text-sm font-extrabold tabular-nums text-gray-900 dark:text-white"><CountUp value={course.attendanceRate} />%</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-black/[0.07] dark:bg-white/10">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${course.attendanceRate}%` }}
                            transition={{ duration: 0.8, delay: Math.min(index * 0.05 + 0.2, 0.4), ease: [0.22, 1, 0.36, 1] }}
                            className={`h-full rounded-full ${rateColor(course.attendanceRate)}`}
                          />
                        </div>
                      </div>
                    )}

                    <div className="mt-auto grid grid-cols-2 gap-2 pt-5">
                      <Link to={`/courses/${course.id}/attendance`} className="btn-primary col-span-2 min-h-[48px] text-[15px]">
                        <ClipboardCheck size={18} /> Take roll call
                      </Link>
                      <Link to={`/courses/${course.id}/students`} className="btn-secondary">
                        <Users size={16} /> Students
                      </Link>
                      <Link to={`/courses/${course.id}/history`} className="btn-secondary">
                        <HistoryIcon size={16} /> History
                      </Link>
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </motion.ul>
          )}
        </AnimatePresence>
      </motion.div>

      {/* ── Mobile Modals & Toasts ─────────────────────────────────── */}
      <AnimatePresence>
        {mobileDeletingCourse && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMobileDeletingCourse(null)}
            className="sheet-backdrop"
          >
            <motion.div
              ref={deleteCourseDialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-course-dialog-title"
              tabIndex={-1}
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="sheet"
            >
              <div className="sheet-handle" />
              <h3 id="delete-course-dialog-title" className="text-xl font-extrabold text-gray-900 dark:text-white">
                Delete “{mobileDeletingCourse.name}”?
              </h3>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                Its students and attendance records will be deleted too. You’ll have 5 seconds to undo.
              </p>
              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row">
                <button onClick={() => setMobileDeletingCourse(null)} className="btn-secondary flex-1">Keep course</button>
                <button
                  onClick={() => {
                    handleDeleteCourse(mobileDeletingCourse.id);
                    setMobileDeletingCourse(null);
                  }}
                  className="btn-danger flex-1"
                >
                  <Trash2 size={16} /> Delete course
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showToast && (
          <motion.div
            key="added"
            role="status"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className={`fixed left-4 right-4 z-50 flex items-center gap-2 rounded-xl border-2 border-black bg-[#b9ff66] px-4 py-3 text-sm font-bold text-black md:left-auto md:right-6 ${toastBottom}`}
          >
            <Check size={16} strokeWidth={3} /> Course added. Add its students next.
          </motion.div>
        )}

        {pendingDeletes.map((item, index) => (
          <motion.div
            key={item.course.id}
            role="status"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            className={`fixed left-4 right-4 z-50 mx-auto max-w-sm overflow-hidden rounded-2xl border-2 border-black bg-gray-900 text-white dark:border-white/80 dark:bg-white dark:text-black ${toastBottom}`}
            style={{ marginBottom: `${index * 76}px` }}
          >
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="min-w-0 truncate text-sm font-semibold">Deleted “{item.course.name}”</span>
              <button
                onClick={() => handleUndoDelete(item.course.id)}
                className="inline-flex flex-none items-center gap-1.5 rounded-lg border-2 border-black bg-[#b9ff66] px-3 py-1.5 text-xs font-extrabold text-black"
              >
                <Undo2 size={13} /> Undo
              </button>
            </div>
            <motion.div
              initial={{ scaleX: 1 }}
              animate={{ scaleX: 0 }}
              transition={{ duration: 5, ease: 'linear' }}
              style={{ originX: 0 }}
              className="h-1 w-full bg-[#b9ff66]"
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </Layout>
  );
}
