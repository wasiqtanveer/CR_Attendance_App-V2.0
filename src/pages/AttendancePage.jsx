import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ChevronLeft, ChevronRight, Users } from 'lucide-react';
import useSWR from 'swr';
import { supabase } from '../lib/supabase';
import { useLoadingBar } from '../context/LoadingBarContext';
import Layout from '../components/Layout';

export default function AttendancePage() {
  const { id: courseId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const loadingBar = useLoadingBar();

  const [currentDate, setCurrentDate] = useState(() => {
    const queryDate = searchParams.get('date');
    if (queryDate) return queryDate;
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [localError, setLocalError] = useState(null);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);

  // ── Fetcher ──────────────────────────────────────────────────────────────
  const fetcher = async () => {
    try {
      const [courseRes, studentsRes, attendanceRes] = await Promise.all([
        supabase.from('courses').select('name').eq('id', courseId).single(),
        supabase.from('students').select('*').eq('course_id', courseId).order('name', { ascending: true }),
        supabase.from('attendance').select('*').eq('course_id', courseId).eq('date', currentDate)
      ]);

      if (courseRes.error) throw courseRes.error;
      if (studentsRes.error) throw studentsRes.error;
      if (attendanceRes.error) throw attendanceRes.error;

      const existingRecords = {};
      attendanceRes.data?.forEach(record => {
        existingRecords[record.student_id] = record.status;
      });

      const attendanceMap = {};
      studentsRes.data.forEach(student => {
        attendanceMap[student.id] = existingRecords[student.id] || null;
      });

      // Restore draft if any
      const draftKey = `att_draft_${courseId}_${currentDate}`;
      const draft = localStorage.getItem(draftKey);
      if (draft) {
        try {
          const parsed = JSON.parse(draft);
          Object.entries(parsed).forEach(([id, status]) => {
            if (status !== null && attendanceMap[id] === null) attendanceMap[id] = status;
          });
        } catch (_) { }
      }

      return {
        courseName: courseRes.data?.name || '',
        students: studentsRes.data || [],
        attendance: attendanceMap
      };
    } catch (err) {
      throw err;
    }
  };

  const { data, error: swrError, mutate, isLoading, isValidating } = useSWR(`attendance_${courseId}_${currentDate}`, fetcher);

  // Only show loading bar on true first fetch — ref gate prevents ghost flash on cached revalidations
  const attLoadingBarActive = useRef(false);
  useEffect(() => {
    if (isValidating && !data) { attLoadingBarActive.current = true; loadingBar?.start(); }
    else if (!isValidating && attLoadingBarActive.current) { attLoadingBarActive.current = false; loadingBar?.done(); }
  }, [isValidating]);

  const courseName = data?.courseName || '';
  const students = data?.students || [];
  const attendance = data?.attendance || {};
  const loading = isLoading;
  const error = swrError?.message || localError;

  // ── Refs ──────────────────────────────────────────────────────────────────
  const pendingUpdates = useRef({});
  const saveTimeout = useRef(null);
  const loadingBarStarted = useRef(false);

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
            mutate(prev => prev ? { ...prev, attendance: { ...prev.attendance, [student_id]: status } } : prev, false);
          }
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, currentDate]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Escape → close leave-confirm modal
      if (e.key === 'Escape' && showLeaveConfirm) {
        setShowLeaveConfirm(false);
      }
      // Ctrl/Cmd + Enter → mark all present
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleBulkAction('present');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showLeaveConfirm]);

  // Clean up timeout on unmount
  useEffect(() => {
    return () => { if (saveTimeout.current) clearTimeout(saveTimeout.current); };
  }, []);

  const triggerDebouncedSave = () => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    setIsSaving(true);
    setLocalError(null);

    saveTimeout.current = setTimeout(async () => {
      const updates = Object.entries(pendingUpdates.current).map(([studentId, status]) => ({
        course_id: courseId,
        student_id: studentId,
        date: currentDate,
        status: status
      }));

      if (updates.length > 0) {
        const { error } = await supabase
          .from('attendance')
          .upsert(updates, { onConflict: 'course_id, student_id, date' });

        if (error) {
          console.error('Failed to save attendance:', error);
          setLocalError('Failed to save some attendance records.');
        } else {
          pendingUpdates.current = {};
          // Clear draft once successfully persisted to DB
          localStorage.removeItem(`att_draft_${courseId}_${currentDate}`);
        }
      }
      setIsSaving(false);
    }, 600);
  };

  const handleToggle = (studentId, status) => {
    const newAttendance = { ...attendance, [studentId]: status };
    if (data) mutate({ ...data, attendance: newAttendance }, false);
    pendingUpdates.current[studentId] = status;

    // Persist draft so a browser crash / accidental close doesn't lose work
    localStorage.setItem(`att_draft_${courseId}_${currentDate}`, JSON.stringify(newAttendance));

    triggerDebouncedSave();
  };

  const handleBulkAction = (status) => {
    const newAttendance = {};
    students.forEach(student => {
      newAttendance[student.id] = status;
      pendingUpdates.current[student.id] = status;
    });
    if (data) mutate({ ...data, attendance: newAttendance }, false);
    triggerDebouncedSave();
  };

  const checkUnsavedAndProceed = (callback) => {
    const hasUnrecorded = Object.values(attendance).some(val => val === null || val === undefined);
    if (hasUnrecorded) {
      setPendingAction(() => callback);
      setShowLeaveConfirm(true);
    } else {
      callback();
    }
  };

  const handleDateChange = (e) => {
    if (e.target.value) {
      const newDate = e.target.value;
      checkUnsavedAndProceed(() => {
        setCurrentDate(newDate);
      });
    }
  };

  const changeDays = (days) => {
    checkUnsavedAndProceed(() => {
      const d = new Date(currentDate + 'T00:00:00'); // parse as local to avoid offset bugs
      d.setDate(d.getDate() + days);
      setCurrentDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    });
  };

  // Date formatting for display
  const displayDate = new Date(currentDate + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });

  const presentCount = Object.values(attendance).filter(s => s === 'present').length;
  const absentCount = Object.values(attendance).filter(s => s === 'absent').length;

  const filteredStudents = students.filter(student =>
    student.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    student.reg_number.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Layout>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Top Section */}
        <div className="flex items-center justify-between mb-6">
          <motion.button
            onClick={() => checkUnsavedAndProceed(() => navigate('/dashboard'))}
            whileHover={{ x: -2 }}
            whileTap={{ scale: 0.97 }}
            className="flex items-center gap-1.5 text-sm font-bold text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white transition-colors"
          >
            <ArrowLeft size={16} />
            Back to Courses
          </motion.button>

          <AnimatePresence>
            {isSaving && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 1, 0] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="text-xs font-bold text-gray-400"
              >
                Saving...
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {error && (
          <div className="bg-red-100 border-2 border-red-500 text-red-700 font-bold px-4 py-2 rounded-xl text-sm mb-4 inline-block">
            {error}
          </div>
        )}

        <div>
          {courseName && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.25 }}
              className="bg-[#b9ff66] border border-black text-black text-xs font-bold px-3 py-1 rounded-full inline-block mb-3"
            >
              {courseName}
            </motion.div>
          )}
          <h1 className="text-4xl font-black text-gray-900 dark:text-white tracking-tight">
            Attendance
          </h1>
        </div>

        {/* Empty State vs Content */}
        {!loading && students.length === 0 ? (
          <div className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl p-12 text-center mt-6 flex flex-col items-center justify-center">
            <Users size={32} className="text-gray-400 mb-3" />
            <h3 className="font-black text-gray-400 text-lg">No students enrolled</h3>
            <p className="text-sm text-gray-400 mt-1 mb-5">Go to the Students page to add students first</p>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => navigate(`/courses/${courseId}/students`)}
              className="bg-[#b9ff66] border-2 border-black text-black font-bold px-5 py-2.5 rounded-xl hover:bg-black hover:text-[#b9ff66] transition-all duration-150 text-sm"
            >
              Add Students →
            </motion.button>
          </div>
        ) : (
          <>
            {/* Date Selector Bar */}
            <div className="border-2 border-black dark:border-white rounded-2xl bg-white dark:bg-[#111111] p-4 mt-6 flex items-center justify-between gap-4">
              <style>
                {`
                  .date-input::-webkit-calendar-picker-indicator {
                    filter: invert(0);
                    cursor: pointer;
                    opacity: 0.6;
                  }
                  .dark .date-input::-webkit-calendar-picker-indicator {
                    filter: invert(1);
                  }
                `}
              </style>

              <div className="flex items-center gap-1 flex-1">
                <motion.button
                  whileHover={{ x: -2 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => changeDays(-1)}
                  className="border-2 border-black dark:border-white rounded-xl p-2 hover:bg-[#b9ff66] hover:border-black dark:hover:border-black transition-all text-gray-900 dark:text-white"
                >
                  <ChevronLeft size={20} />
                </motion.button>

                <div className="flex-1 flex justify-center">
                  <input
                    type="date"
                    value={currentDate}
                    onChange={handleDateChange}
                    className="bg-transparent border-none outline-none font-black text-lg text-gray-900 dark:text-white text-center cursor-pointer w-48 date-input"
                  />
                </div>

                <motion.button
                  whileHover={{ x: 2 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => changeDays(1)}
                  className="border-2 border-black dark:border-white rounded-xl p-2 hover:bg-[#b9ff66] hover:border-black dark:hover:border-black transition-all text-gray-900 dark:text-white"
                >
                  <ChevronRight size={20} />
                </motion.button>
              </div>
            </div>

            {/* Summary Bar */}
            <div className="mt-3 flex gap-3 flex-wrap">
              <div className="bg-[#b9ff66] border-2 border-black rounded-xl px-4 py-2 text-sm font-black text-black">
                ✓ {presentCount} Present
              </div>
              <div className="bg-white dark:bg-[#111111] border-2 border-black dark:border-white rounded-xl px-4 py-2 text-sm font-black text-gray-900 dark:text-white">
                ✗ {absentCount} Absent
              </div>
            </div>

            {/* Bulk Action Buttons & Search */}
            <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex gap-3 flex-wrap">
                <button
                  onClick={() => handleBulkAction('present')}
                  className="border-2 border-black dark:border-white rounded-xl px-4 py-2 text-xs font-bold hover:bg-[#b9ff66] hover:border-black dark:hover:border-[#b9ff66] transition-all text-gray-900 dark:text-white"
                >
                  All Present
                </button>
                <button
                  onClick={() => handleBulkAction('absent')}
                  className="border-2 border-black dark:border-white rounded-xl px-4 py-2 text-xs font-bold hover:bg-[#b9ff66] hover:border-black dark:hover:border-[#b9ff66] transition-all text-gray-900 dark:text-white"
                >
                  All Absent
                </button>
              </div>

              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search students..."
                className="w-full sm:w-64 px-4 py-2.5 rounded-xl border-2 border-black dark:border-white bg-white dark:bg-[#111111] text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-[#b9ff66] font-medium text-sm transition-colors"
              />
            </div>

            {/* Student List */}
            <AnimatePresence mode="wait">
              {loading ? (
                <motion.div
                  key="skeleton"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.2 }}
                  className="mt-4 flex flex-col gap-2"
                >
                  {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="animate-pulse bg-gray-200 dark:bg-gray-800 rounded-2xl h-16 w-full mb-2" />
                  ))}
                </motion.div>
              ) : (
                <motion.div
                  key="list"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="mt-4 flex flex-col gap-2"
                >
                  <AnimatePresence>
                    {filteredStudents.map((student, index) => {
                      const status = attendance[student.id];
                      const isPresent = status === 'present';
                      const isAbsent = status === 'absent';

                      return (
                        <motion.div
                          layout
                          key={student.id}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={{ duration: 0.2, delay: index * 0.03, ease: [0.22, 1, 0.36, 1] }}
                          className={`rounded-2xl border-2 transition-all duration-150 px-5 py-4 flex items-center justify-between ${isPresent
                              ? 'border-[#b9ff66] bg-[#f9ffe8] dark:bg-[#1a2a0a]'
                              : 'border-black dark:border-white bg-white dark:bg-[#111111]'
                            }`}
                        >
                          <div>
                            <h3 className="font-bold text-gray-900 dark:text-white text-sm">
                              {student.name}
                            </h3>
                            <p className="text-xs font-medium text-gray-400 mt-0.5">
                              {student.reg_number}
                            </p>
                          </div>

                          <div className="flex items-center gap-2">
                            <motion.button
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => handleToggle(student.id, 'present')}
                              className={
                                isPresent
                                  ? 'bg-[#b9ff66] border-2 border-black text-black font-bold text-xs px-4 py-1.5 rounded-xl'
                                  : 'bg-transparent border-2 border-gray-300 dark:border-gray-600 text-gray-400 font-bold text-xs px-4 py-1.5 rounded-xl hover:border-black dark:hover:border-white transition-all'
                              }
                            >
                              P
                            </motion.button>
                            <motion.button
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => handleToggle(student.id, 'absent')}
                              className={
                                isAbsent
                                  ? 'bg-black dark:bg-white border-2 border-black dark:border-white text-white dark:text-black font-bold text-xs px-4 py-1.5 rounded-xl'
                                  : 'bg-transparent border-2 border-gray-300 dark:border-gray-600 text-gray-400 font-bold text-xs px-4 py-1.5 rounded-xl hover:border-black dark:hover:border-white transition-all'
                              }
                            >
                              A
                            </motion.button>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>

                  {filteredStudents.length === 0 && students.length > 0 && (
                    <div className="text-center py-8 text-sm font-bold text-gray-400">
                      No students match your search.
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </motion.div>

      <AnimatePresence>
        {showLeaveConfirm && (
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
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Wait a second!</h3>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-6">
                You have students with unrecorded attendance. Are you sure you want to leave this day without finishing?
              </p>

              <div className="flex gap-3 mt-4">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setShowLeaveConfirm(false)}
                  className="flex-1 border-2 border-gray-300 dark:border-gray-600 rounded-xl py-2.5 font-bold text-gray-600 dark:text-gray-300 hover:border-black dark:hover:border-white hover:text-black dark:hover:text-white transition-colors"
                >
                  Stay and Finish
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    setShowLeaveConfirm(false);
                    if (pendingAction) pendingAction();
                  }}
                  className="flex-1 bg-red-50 dark:bg-red-950/30 border-2 border-red-500 rounded-xl py-2.5 font-bold text-red-600 hover:bg-red-500 hover:text-white transition-colors"
                >
                  Yes, Leave
                </motion.button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

    </Layout>
  );
}