import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ChevronLeft, ChevronRight, Search, Undo2, Users, X } from 'lucide-react';
import useSWR from 'swr';
import { supabase } from '../lib/supabase';
import { useLoadingBar } from '../context/LoadingBarContext';
import Layout from '../components/Layout';
import { CourseHeader } from '../components/CourseNav';
import { playAbsent, playPresent, playSuccess } from '../lib/sounds';
import { flushMarks, pendingMarks, queueMarks, queueState, resumeQueuedMarks } from '../lib/attendanceQueue';
import { useModalFocus } from '../hooks/useModalFocus';

export default function AttendancePage() {
  const { id: courseId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const loadingBar = useLoadingBar();

  const [currentDate, setCurrentDate] = useState(() => {
    const queryDate = searchParams.get('date');
    if (/^\d{4}-\d{2}-\d{2}$/.test(queryDate || '')) return queryDate;
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [unmarkedOnly, setUnmarkedOnly] = useState(false);
  const [lastBulkSnapshot, setLastBulkSnapshot] = useState(null);
  const [saveState, setSaveState] = useState({ pending: 0, saving: false, error: null });
  const [localError, setLocalError] = useState(null);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const leaveDialogRef = useModalFocus(showLeaveConfirm, () => setShowLeaveConfirm(false));

  // ── Fetcher ──────────────────────────────────────────────────────────────
  const fetcher = async () => {
      const [courseRes, studentsRes, attendanceRes, sessionRes] = await Promise.all([
        supabase.from('courses').select('name').eq('id', courseId).single(),
        supabase.from('students').select('*').eq('course_id', courseId).is('archived_at', null).order('name', { ascending: true }),
        supabase.from('attendance').select('*').eq('course_id', courseId).eq('date', currentDate),
        supabase.auth.getSession(),
      ]);

      const userId = sessionRes.data.session?.user.id;
      if (!userId) throw new Error('Sign in before marking attendance.');
      const rosterKey = `attendance_roster_${userId}_${courseId}`;
      const dayKey = `attendance_day_${userId}_${courseId}_${currentDate}`;
      const cachedRoster = JSON.parse(localStorage.getItem(rosterKey) || 'null');
      const fetchError = courseRes.error || studentsRes.error || attendanceRes.error;
      const networkFailure = !navigator.onLine || /network|fetch|offline|timeout/i.test(fetchError?.message || '');
      if (fetchError && (!networkFailure || !cachedRoster)) throw fetchError;
      const students = studentsRes.data || cachedRoster?.students;
      if (!students) throw new Error('Open this course while online once before marking offline.');
      const courseName = courseRes.data?.name || cachedRoster?.courseName || '';
      if (!courseRes.error && !studentsRes.error) {
        localStorage.setItem(rosterKey, JSON.stringify({ courseName, students }));
      }
      const records = attendanceRes.data || JSON.parse(localStorage.getItem(dayKey) || '[]');
      if (!attendanceRes.error) localStorage.setItem(dayKey, JSON.stringify(records));

      const existingRecords = {};
      records.forEach(record => {
        existingRecords[record.student_id] = record.status;
      });

      const attendanceMap = {};
      students.forEach(student => {
        attendanceMap[student.id] = existingRecords[student.id] || null;
      });

      // Migrate drafts from the previous autosave implementation once.
      const draftKey = `att_draft_${courseId}_${currentDate}`;
      const draft = localStorage.getItem(draftKey);
      if (draft) {
        try {
          const parsed = JSON.parse(draft);
          const validIds = new Set(students.map(student => student.id));
          const marks = Object.fromEntries(Object.entries(parsed).filter(([id, status]) =>
            validIds.has(id) && (status === 'present' || status === 'absent')));
          if (Object.keys(marks).length) queueMarks(userId, courseId, currentDate, marks);
        } catch { /* Leave a malformed draft for manual recovery. */ }
        localStorage.removeItem(draftKey);
      }
      Object.assign(attendanceMap, pendingMarks(userId, courseId, currentDate));

      return {
        courseName,
        userId,
        students,
        attendance: attendanceMap
      };
  };

  const { data, error: swrError, mutate, isLoading, isValidating } = useSWR(`attendance_${courseId}_${currentDate}`, fetcher);

  // Only show loading bar on true first fetch — ref gate prevents ghost flash on cached revalidations
  const attLoadingBarActive = useRef(false);
  useEffect(() => {
    if (isValidating && !data) { attLoadingBarActive.current = true; loadingBar?.start(); }
    else if (!isValidating && attLoadingBarActive.current) { attLoadingBarActive.current = false; loadingBar?.done(); }
  }, [isValidating, data, loadingBar]);

  const courseName = data?.courseName || '';
  const students = data?.students || [];
  const attendance = data?.attendance || {};
  const loading = isLoading;
  const error = swrError?.message || localError;

  // ── Refs ──────────────────────────────────────────────────────────────────
  const userId = data?.userId;
  useEffect(() => {
    const refresh = () => setSaveState(queueState(userId, courseId, currentDate));
    refresh();
    window.addEventListener('attendance-queue-change', refresh);
    window.addEventListener('online', refresh);
    if (userId) resumeQueuedMarks(userId);
    return () => {
      window.removeEventListener('attendance-queue-change', refresh);
      window.removeEventListener('online', refresh);
    };
  }, [userId, courseId, currentDate]);

  // ── Supabase Realtime: sync attendance from other sessions ────────────────
  useEffect(() => {
    const channel = supabase
      .channel(`attendance_rt_${courseId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'attendance',
        filter: `course_id=eq.${courseId}`,
      }, (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const { student_id, status, date } = payload.new;
          if (date === currentDate) {
            mutate(prev => {
              if (!prev) return prev;
              const pending = pendingMarks(prev.userId, courseId, currentDate);
              return { ...prev, attendance: {
                ...prev.attendance, [student_id]: Object.hasOwn(pending, student_id) ? pending[student_id] : status,
              } };
            }, false);
          }
        } else if (payload.eventType === 'DELETE') {
          mutate();
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, currentDate]);

  const handleToggle = (studentId, status) => {
    if (!userId) return;
    const newAttendance = { ...attendance, [studentId]: status };
    try {
      queueMarks(userId, courseId, currentDate, { [studentId]: status });
      if (data) mutate({ ...data, attendance: newAttendance }, false);
      setLastBulkSnapshot(null);
      setLocalError(null);
      const wasComplete = students.every(student => attendance[student.id]);
      const nowComplete = students.every(student => newAttendance[student.id]);
      if (nowComplete && !wasComplete) playSuccess();
      else if (status === 'present') playPresent();
      else playAbsent();
    } catch (error) { setLocalError(error.message); }
  };

  const handleBulkAction = (status) => {
    if (!userId || !students.length) return;
    const newAttendance = {};
    students.forEach(student => {
      newAttendance[student.id] = status;
    });
    try {
      queueMarks(userId, courseId, currentDate, newAttendance);
      if (data) mutate({ ...data, attendance: newAttendance }, false);
      setLastBulkSnapshot({ date: currentDate, attendance: { ...attendance } });
      setLocalError(null);
      if (status === 'present') playSuccess(); else playAbsent();
    } catch (error) { setLocalError(error.message); }
  };

  const undoBulkAction = () => {
    if (!lastBulkSnapshot || lastBulkSnapshot.date !== currentDate || !userId) return;
    try {
      queueMarks(userId, courseId, currentDate, lastBulkSnapshot.attendance);
      if (data) mutate({ ...data, attendance: lastBulkSnapshot.attendance }, false);
      setLastBulkSnapshot(null);
      setLocalError(null);
    } catch (error) { setLocalError(error.message); }
  };

  useEffect(() => {
    const handleKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !showLeaveConfirm) {
        event.preventDefault();
        handleBulkAction('present');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const checkUnsavedAndProceed = (callback) => {
    const hasUnrecorded = Object.values(attendance).some(val => val === null || val === undefined);
    if (hasUnrecorded) {
      setPendingAction(() => callback);
      setShowLeaveConfirm(true);
    } else {
      callback();
    }
  };

  const selectDate = (date) => {
    setCurrentDate(date);
    setLastBulkSnapshot(null);
    setSearchParams(previous => {
      const next = new URLSearchParams(previous);
      next.set('date', date);
      return next;
    }, { replace: true });
  };

  const handleDateChange = (e) => {
    if (e.target.value) {
      const newDate = e.target.value;
      checkUnsavedAndProceed(() => selectDate(newDate));
    }
  };

  const changeDays = (days) => {
    checkUnsavedAndProceed(() => {
      const d = new Date(currentDate + 'T00:00:00'); // parse as local to avoid offset bugs
      d.setDate(d.getDate() + days);
      selectDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    });
  };

  const presentCount = Object.values(attendance).filter(s => s === 'present').length;
  const absentCount = Object.values(attendance).filter(s => s === 'absent').length;
  const unmarkedCount = Math.max(0, students.length - presentCount - absentCount);

  const filteredStudents = students.filter(student =>
    (!unmarkedOnly || !attendance[student.id]) &&
    (student.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    student.reg_number.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const todayDate = new Date();
  const todayStr = `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2, '0')}-${String(todayDate.getDate()).padStart(2, '0')}`;
  const isToday = currentDate === todayStr;
  const dateLabel = new Date(currentDate + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  const markedCount = students.length - unmarkedCount;
  const complete = unmarkedCount === 0 && students.length > 0;
  const saveLabel = saveState.error ? 'Not synced' : saveState.saving ? 'Saving…' : saveState.pending ? 'Waiting to sync' : 'All saved';

  return (
    <Layout>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      >
        <CourseHeader
          courseId={courseId}
          courseName={courseName}
          summary={students.length ? `Roll call · ${students.length} ${students.length === 1 ? 'student' : 'students'}` : 'Roll call'}
          onBack={() => checkUnsavedAndProceed(() => navigate('/dashboard'))}
          actions={
            <div role="status" aria-live="polite"
              className={`inline-flex items-center gap-2 rounded-full border-2 px-3 py-1.5 text-xs font-bold ${saveState.error
                ? 'border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200'
                : 'border-black/15 bg-white text-gray-700 dark:border-white/20 dark:bg-[#171717] dark:text-gray-200'}`}>
              <span aria-hidden="true" className={`h-2 w-2 rounded-full ${saveState.error ? 'bg-amber-500' : saveState.saving || saveState.pending ? 'animate-pulse bg-yellow-500' : 'bg-green-600'}`} />
              {saveLabel}
            </div>
          }
        />

        {error && <div role="alert" className="alert-error mb-4">{error}</div>}
        {saveState.error && (
          <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-amber-500 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900 dark:bg-amber-950/60 dark:text-amber-100">
            <span>{saveState.error} Your marks are kept on this phone.</span>
            <button className="btn-secondary min-h-[36px] px-3 text-xs" onClick={() => flushMarks(userId, courseId, currentDate)}>Retry now</button>
          </div>
        )}

        {!loading && students.length === 0 ? (
          <div className="panel flex flex-col items-center px-6 py-12 text-center">
            <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-black bg-[#b9ff66] text-black">
              <Users size={26} />
            </span>
            <h2 className="text-xl font-extrabold text-gray-900 dark:text-white">No students in this course yet</h2>
            <p className="mt-1 max-w-xs text-sm text-gray-600 dark:text-gray-400">Add your class list first, then come back to take the roll call.</p>
            <Link to={`/courses/${courseId}/students`} className="btn-primary mt-6 px-6">Add students</Link>
          </div>
        ) : (
          <>
            {/* Date */}
            <div className="panel flex items-center gap-2 p-2">
              <button type="button" onClick={() => changeDays(-1)} aria-label="Previous day" className="icon-btn">
                <ChevronLeft size={22} />
              </button>
              <label className="relative flex min-w-0 flex-1 cursor-pointer flex-col items-center justify-center rounded-xl px-2 py-1 text-center hover:bg-black/5 dark:hover:bg-white/5">
                <span className="text-[11px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">{isToday ? 'Today' : 'Date'}</span>
                <span className="truncate font-display text-base font-extrabold text-gray-900 dark:text-white sm:text-lg">{dateLabel}</span>
                <input
                  type="date"
                  aria-label="Attendance date"
                  value={currentDate}
                  onChange={handleDateChange}
                  onClick={event => { try { event.currentTarget.showPicker?.(); } catch { /* not supported */ } }}
                  className="date-input absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
              </label>
              <button type="button" onClick={() => changeDays(1)} aria-label="Next day" className="icon-btn">
                <ChevronRight size={22} />
              </button>
            </div>
            {!isToday && (
              <button type="button" onClick={() => checkUnsavedAndProceed(() => selectDate(todayStr))}
                className="mt-2 text-xs font-bold text-gray-700 underline underline-offset-4 dark:text-gray-300">
                Jump to today
              </button>
            )}

            {/* Progress — stays visible while scrolling the list */}
            <div role="status"
              className={`sticky top-[calc(3.5rem+env(safe-area-inset-top)+0.5rem)] z-30 mt-3 rounded-2xl border-2 px-4 py-3 transition-colors md:top-[4.5rem] ${complete
                ? 'border-black bg-[#b9ff66] text-black'
                : 'border-black bg-white text-gray-900 dark:border-white/85 dark:bg-[#141812] dark:text-white'}`}>
              <div className="flex items-baseline justify-between gap-3">
                <strong className="font-display text-base font-extrabold">
                  {complete ? 'Roll call complete' : `${unmarkedCount} left to mark`}
                </strong>
                <span className="text-sm font-bold tabular-nums">{markedCount}/{students.length}</span>
              </div>
              <div className={`mt-2 h-2 overflow-hidden rounded-full ${complete ? 'bg-black/15' : 'bg-black/10 dark:bg-white/15'}`} aria-hidden="true">
                <div className={`h-full rounded-full transition-[width] duration-300 ${complete ? 'bg-black' : 'bg-[#6b9d28] dark:bg-[#b9ff66]'}`}
                  style={{ width: `${students.length ? (markedCount / students.length) * 100 : 0}%` }} />
              </div>
              <div className={`mt-2 flex gap-4 text-xs font-bold ${complete ? 'text-black/75' : 'text-gray-600 dark:text-gray-300'}`}>
                <span className="inline-flex items-center gap-1"><Check size={13} strokeWidth={3} className={complete ? '' : 'text-[#4d7a16] dark:text-[#b9ff66]'} />{presentCount} present</span>
                <span className="inline-flex items-center gap-1"><X size={13} strokeWidth={3} className={complete ? '' : 'text-red-600 dark:text-red-400'} />{absentCount} absent</span>
              </div>
            </div>

            {/* Search, filter, bulk */}
            <div className="mt-3 flex gap-2">
              <label className="relative min-w-0 flex-1">
                <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type="search"
                  aria-label="Search students"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search name or reg no."
                  className="field pl-10"
                />
              </label>
              <button type="button" aria-pressed={unmarkedOnly} onClick={() => setUnmarkedOnly(value => !value)}
                className={`btn px-3 ${unmarkedOnly
                  ? 'border-black bg-black text-[#b9ff66] dark:border-[#b9ff66] dark:bg-[#b9ff66] dark:text-black'
                  : 'border-black bg-white text-gray-900 dark:border-white/80 dark:bg-[#111] dark:text-white'}`}>
                Unmarked
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button onClick={() => handleBulkAction('present')} className="btn-quiet min-h-[40px] border-black/15 px-3 text-xs dark:border-white/20">
                <Check size={15} strokeWidth={2.75} /> All present
              </button>
              <button onClick={() => handleBulkAction('absent')} className="btn-quiet min-h-[40px] border-black/15 px-3 text-xs dark:border-white/20">
                <X size={15} strokeWidth={2.75} /> All absent
              </button>
              {lastBulkSnapshot?.date === currentDate && (
                <button type="button" onClick={undoBulkAction} className="btn-quiet min-h-[40px] px-3 text-xs underline underline-offset-4">
                  <Undo2 size={14} /> Undo
                </button>
              )}
              <span className="ml-auto hidden text-xs text-gray-500 dark:text-gray-400 md:inline">Ctrl + Enter marks everyone present</span>
            </div>

            {/* Student List */}
            <AnimatePresence mode="wait">
              {loading ? (
                <motion.div key="skeleton" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="mt-4 flex flex-col gap-2">
                  {[1, 2, 3, 4, 5, 6].map(i => (
                    <div key={i} className="h-[68px] w-full animate-pulse rounded-2xl bg-black/[0.06] dark:bg-white/[0.06]" />
                  ))}
                </motion.div>
              ) : (
                <motion.ul key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="mt-4 flex flex-col gap-2" aria-label="Students">
                  {filteredStudents.map((student) => {
                    const status = attendance[student.id];
                    const isPresent = status === 'present';
                    const isAbsent = status === 'absent';

                    return (
                      <li
                        key={student.id}
                        className={`flex items-center gap-3 rounded-2xl border-2 py-2.5 pl-4 pr-2.5 transition-colors duration-150 ${isPresent
                          ? 'border-[#6b9d28] bg-[#f3ffe0] dark:border-[#b9ff66]/70 dark:bg-[#18240c]'
                          : isAbsent
                            ? 'border-red-300 bg-red-50 dark:border-red-500/50 dark:bg-red-950/30'
                            : 'border-black/80 bg-white dark:border-white/70 dark:bg-[#111]'}`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[15px] font-bold leading-tight text-gray-900 dark:text-white">{student.name}</p>
                          <p className="mt-0.5 truncate text-xs font-medium tabular-nums text-gray-600 dark:text-gray-400">{student.reg_number}</p>
                        </div>

                        <div className="flex flex-none items-center gap-1.5">
                          <motion.button
                            whileTap={{ scale: 0.9 }}
                            onClick={() => handleToggle(student.id, 'present')}
                            aria-label={`Mark ${student.name} present`}
                            aria-pressed={isPresent}
                            className={`flex h-12 min-w-12 items-center justify-center gap-1.5 rounded-xl border-2 px-3 text-sm font-bold transition-colors ${isPresent
                              ? 'border-black bg-[#b9ff66] text-black'
                              : 'border-black/25 bg-white text-gray-700 hover:border-black dark:border-white/30 dark:bg-transparent dark:text-gray-200 dark:hover:border-white'}`}
                          >
                            <Check size={20} strokeWidth={3} />
                            <span className="hidden sm:inline">Present</span>
                          </motion.button>
                          <motion.button
                            whileTap={{ scale: 0.9 }}
                            onClick={() => handleToggle(student.id, 'absent')}
                            aria-label={`Mark ${student.name} absent`}
                            aria-pressed={isAbsent}
                            className={`flex h-12 min-w-12 items-center justify-center gap-1.5 rounded-xl border-2 px-3 text-sm font-bold transition-colors ${isAbsent
                              ? 'border-red-700 bg-red-500 text-white dark:border-red-300'
                              : 'border-black/25 bg-white text-gray-700 hover:border-black dark:border-white/30 dark:bg-transparent dark:text-gray-200 dark:hover:border-white'}`}
                          >
                            <X size={20} strokeWidth={3} />
                            <span className="hidden sm:inline">Absent</span>
                          </motion.button>
                        </div>
                      </li>
                    );
                  })}

                  {filteredStudents.length === 0 && students.length > 0 && (
                    <li className="panel-soft px-4 py-8 text-center text-sm font-semibold text-gray-600 dark:text-gray-400">
                      {unmarkedOnly && unmarkedCount === 0 ? 'Everyone is marked for this date.' : 'No students match this search.'}
                    </li>
                  )}
                </motion.ul>
              )}
            </AnimatePresence>
          </>
        )}
      </motion.div>

      <AnimatePresence>
        {showLeaveConfirm && (
          <motion.div
            className="sheet-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowLeaveConfirm(false)}
          >
            <motion.div
              ref={leaveDialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="leave-dialog-title"
              tabIndex={-1}
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              onClick={event => event.stopPropagation()}
              className="sheet"
            >
              <div className="sheet-handle" />
              <h3 id="leave-dialog-title" className="text-xl font-extrabold text-gray-900 dark:text-white">Leave with {unmarkedCount} unmarked?</h3>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                Marks you already made are saved. You can come back and finish the rest later.
              </p>
              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row">
                <button onClick={() => setShowLeaveConfirm(false)} className="btn-primary flex-1">Keep marking</button>
                <button
                  onClick={() => {
                    setShowLeaveConfirm(false);
                    if (pendingAction) pendingAction();
                  }}
                  className="btn-secondary flex-1"
                >
                  Leave anyway
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Layout>
  );
}
