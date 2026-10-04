import { supabase } from './supabase';

const PREFIX = 'attendance_queue_v2_';
const jobs = new Map();
const timers = new Map();
const errors = new Map();
let nextRevision = Date.now();

const keyFor = (userId, courseId, date) => `${PREFIX}${userId}_${courseId}_${date}`;
const changed = (key) => window.dispatchEvent(new CustomEvent('attendance-queue-change', { detail: key }));

function read(key) {
  try { return JSON.parse(localStorage.getItem(key) || '{}'); }
  catch { return {}; }
}

function write(key, entries) {
  if (Object.keys(entries).length) localStorage.setItem(key, JSON.stringify(entries));
  else localStorage.removeItem(key);
  changed(key);
}

export function pendingMarks(userId, courseId, date) {
  if (!userId) return {};
  return Object.fromEntries(Object.entries(read(keyFor(userId, courseId, date)))
    .map(([studentId, entry]) => [studentId, entry.status]));
}

export function queueState(userId, courseId, date) {
  if (!userId) return { pending: 0, saving: false, error: null };
  const key = keyFor(userId, courseId, date);
  return { pending: Object.keys(read(key)).length, saving: jobs.has(key), error: errors.get(key) || null };
}

export function queueMarks(userId, courseId, date, marks) {
  if (!userId) throw new Error('Sign in before marking attendance.');
  const key = keyFor(userId, courseId, date);
  const entries = read(key);
  for (const [studentId, status] of Object.entries(marks)) {
    entries[studentId] = { status, revision: ++nextRevision };
  }
  errors.delete(key);
  write(key, entries); // Persist before any network request or navigation.
  try {
    const dayKey = `attendance_day_${userId}_${courseId}_${date}`;
    const cached = JSON.parse(localStorage.getItem(dayKey) || '[]');
    const records = new Map(cached.map(record => [record.student_id, record]));
    for (const [studentId, status] of Object.entries(marks)) {
      if (status === null) records.delete(studentId);
      else records.set(studentId, { ...records.get(studentId), course_id: courseId, student_id: studentId, date, status });
    }
    localStorage.setItem(dayKey, JSON.stringify([...records.values()]));
  } catch { /* The durable queue remains authoritative if the day cache cannot be updated. */ }
  schedule(userId, courseId, date);
}

function schedule(userId, courseId, date, delay = 600) {
  const key = keyFor(userId, courseId, date);
  clearTimeout(timers.get(key));
  timers.set(key, setTimeout(() => {
    timers.delete(key);
    void flushMarks(userId, courseId, date);
  }, delay));
}

export async function flushMarks(userId, courseId, date) {
  const key = keyFor(userId, courseId, date);
  clearTimeout(timers.get(key));
  timers.delete(key);
  if (jobs.has(key)) return jobs.get(key);
  if (!Object.keys(read(key)).length) return;

  const job = (async () => {
    while (Object.keys(read(key)).length) {
      if (!navigator.onLine) {
        errors.set(key, 'Offline — marks are saved on this device.');
        break;
      }
      const batch = read(key);
      const rows = Object.entries(batch).filter(([, entry]) => entry.status !== null)
        .map(([studentId, entry]) => ({ course_id: courseId, student_id: studentId, date, status: entry.status }));
      const removals = Object.entries(batch).filter(([, entry]) => entry.status === null).map(([studentId]) => studentId);
      try {
        if (rows.length) {
          const { error } = await supabase.from('attendance').upsert(rows, { onConflict: 'course_id, student_id, date' });
          if (error) throw error;
        }
        if (removals.length) {
          const { error } = await supabase.from('attendance').delete()
            .eq('course_id', courseId).eq('date', date).in('student_id', removals);
          if (error) throw error;
        }
        const remaining = read(key);
        for (const [studentId, entry] of Object.entries(batch)) {
          if (remaining[studentId]?.revision === entry.revision) delete remaining[studentId];
        }
        write(key, remaining);
        errors.delete(key);
      } catch (error) {
        errors.set(key, error.message || 'Save failed. Your marks remain on this device.');
        break;
      }
    }
  })();
  jobs.set(key, job);
  changed(key);
  try { await job; }
  finally { jobs.delete(key); changed(key); }
}

export function resumeQueuedMarks(userId) {
  if (!userId) return;
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index);
    const prefix = `${PREFIX}${userId}_`;
    if (!key?.startsWith(prefix)) continue;
    const parts = key.slice(prefix.length).match(/^(.*)_([0-9]{4}-[0-9]{2}-[0-9]{2})$/);
    if (parts) schedule(userId, parts[1], parts[2], 0);
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', async () => {
    const { data } = await supabase.auth.getSession();
    resumeQueuedMarks(data.session?.user.id);
  });
}
