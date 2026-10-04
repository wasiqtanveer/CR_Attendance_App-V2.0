import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Archive, Check, ClipboardPaste, FileSpreadsheet, Pencil, Plus, RotateCcw, Search, Upload, UserPlus, Users, X } from 'lucide-react';
import useSWR from 'swr';
import { supabase } from '../lib/supabase';
import { useLoadingBar } from '../context/LoadingBarContext';
import Layout from '../components/Layout';
import { CourseHeader } from '../components/CourseNav';
import { normalizeReg, parseRosterSheet, parseRosterText, validateRoster } from '../lib/rosterImport';
import { fetchAllRows } from '../lib/fetchAllRows';
import { useModalFocus } from '../hooks/useModalFocus';
import { playClick, playDelete, playSuccess } from '../lib/sounds';

const ADD_TABS = [
  { id: 'one', label: 'One student', icon: UserPlus },
  { id: 'paste', label: 'Paste list', icon: ClipboardPaste },
  { id: 'file', label: 'Excel / CSV', icon: FileSpreadsheet },
  { id: 'course', label: 'Other course', icon: Users },
];

function summarize(result, added) {
  const parts = [`${added} added`];
  if (result.duplicate.length) parts.push(`${result.duplicate.length} already enrolled`);
  if (result.invalid.length) parts.push(`${result.invalid.length} missing a name or reg no.`);
  return parts.join(' · ');
}

function insertErrorMessage(error) {
  if (error?.code === '23505') return 'One of these registration numbers is already in this course. Refresh and try again.';
  return error?.message || 'Could not save students.';
}

export default function StudentsPage() {
  const { id: courseId } = useParams();
  const loadingBar = useLoadingBar();
  const addPanelRef = useRef(null);

  // Add panel
  const [addOpen, setAddOpen] = useState(null); // null = decide from roster size
  const [addTab, setAddTab] = useState('one');
  const [notice, setNotice] = useState('');

  // File Import State
  const fileInputRef = useRef(null);
  const [importFile, setImportFile] = useState(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importPreview, setImportPreview] = useState(null);

  // Row State
  const [deletingId, setDeletingId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editReg, setEditReg] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const fetcher = async () => {
      const [courseData, students] = await Promise.all([
        supabase.from('courses').select('name').eq('id', courseId).single(),
        fetchAllRows(() => supabase.from('students').select('*').eq('course_id', courseId).order('id')),
      ]);
      if (courseData.error) throw courseData.error;
      return {
        courseName: courseData.data?.name || '',
        students,
      };
  };

  const [localError, setLocalError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Single Add State
  const [newName, setNewName] = useState('');
  const [newReg, setNewReg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const nameInputRef = useRef(null);

  // Bulk Add State
  const [bulkText, setBulkText] = useState('');
  const [isBulkSubmitting, setIsBulkSubmitting] = useState(false);

  // Add from Existing Course State
  const [showExistingCourseModal, setShowExistingCourseModal] = useState(false);
  const sourceDialogRef = useModalFocus(showExistingCourseModal, () => setShowExistingCourseModal(false));
  const [selectedSourceCourseId, setSelectedSourceCourseId] = useState('');
  const [sourceStudents, setSourceStudents] = useState([]);
  const [sourceStudentsLoading, setSourceStudentsLoading] = useState(false);
  const [selectedStudentIds, setSelectedStudentIds] = useState(new Set());
  const [isAddingExisting, setIsAddingExisting] = useState(false);

  const { data, error: swrError, mutate, isLoading, isValidating } = useSWR(`students_${courseId}`, fetcher);

  // Fetch available courses instantly using SWR so it stays fresh when courses are deleted elsewhere
  const { data: rawAvailableCourses } = useSWR(showExistingCourseModal ? 'available_courses' : null, async () => {
    return fetchAllRows(() => supabase.from('courses').select('id, name').order('id'));
  });

  const availableCourses = useMemo(() => (rawAvailableCourses || []).filter(c => c.id !== courseId), [rawAvailableCourses, courseId]);

  const studLoadingBarActive = useRef(false);
  useEffect(() => {
    if (isValidating && !data) { studLoadingBarActive.current = true; loadingBar?.start(); }
    else if (!isValidating && studLoadingBarActive.current) { studLoadingBarActive.current = false; loadingBar?.done(); }
  }, [isValidating, data, loadingBar]);

  const courseName = data?.courseName || '';
  const allStudents = useMemo(() => data?.students || [], [data]);
  const students = allStudents.filter(student => !student.archived_at);
  const archivedStudents = allStudents.filter(student => student.archived_at);
  const loading = isLoading;
  const error = swrError?.message || localError;
  const isAddOpen = addOpen ?? (!loading && students.length === 0);

  // Live preview of the paste box.
  const bulkPreview = useMemo(() => bulkText.trim() ? validateRoster(parseRosterText(bulkText), allStudents) : null, [bulkText, allStudents]);

  useEffect(() => {
    if (showExistingCourseModal && availableCourses.length > 0 && !selectedSourceCourseId) {
      setSelectedSourceCourseId(availableCourses[0].id);
    }
  }, [showExistingCourseModal, availableCourses, selectedSourceCourseId]);

  useEffect(() => {
    if (!selectedSourceCourseId) return;

    async function fetchSourceStudents() {
      setSourceStudentsLoading(true);
      try {
        const rows = await fetchAllRows(() => supabase.from('students').select('*')
          .eq('course_id', selectedSourceCourseId).is('archived_at', null).order('id'));
        setSourceStudents(rows);
        setSelectedStudentIds(new Set());
      } catch (error) {
        setLocalError(`Could not load source students: ${error.message}`);
      } finally {
        setSourceStudentsLoading(false);
      }
    }

    if (showExistingCourseModal) {
      fetchSourceStudents();
    }
  }, [selectedSourceCourseId, showExistingCourseModal]);

  const flash = (message) => {
    setNotice(message);
    setTimeout(() => setNotice(current => current === message ? '' : current), 5000);
  };

  const openAdd = (tab) => {
    setAddOpen(true);
    if (tab) setAddTab(tab);
    requestAnimationFrame(() => addPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const handleAddExistingStudents = async () => {
    if (selectedStudentIds.size === 0) return;
    setIsAddingExisting(true);
    setLocalError(null);

    const result = validateRoster(sourceStudents.filter(s => selectedStudentIds.has(s.id)), allStudents);
    if (result.valid.length > 0) {
      const { error } = await supabase.from('students').insert(result.valid.map(student => ({ ...student, course_id: courseId })));
      if (error) {
        setLocalError(insertErrorMessage(error));
      } else {
        setShowExistingCourseModal(false);
        await mutate();
        playSuccess();
        flash(summarize(result, result.valid.length));
      }
    }
    setIsAddingExisting(false);
  };

  const handleAddSingle = async (e) => {
    e.preventDefault();
    setLocalError(null);
    const result = validateRoster([{ name: newName, reg_number: newReg }], allStudents);
    if (!result.valid.length) {
      setLocalError(result.duplicate.length ? `${normalizeReg(newReg)} is already enrolled in this course.` : 'Enter both a name and a registration number.');
      return;
    }
    setIsSubmitting(true);

    const { error: insertError } = await supabase
      .from('students')
      .insert({ ...result.valid[0], course_id: courseId });

    if (insertError) {
      setLocalError(insertErrorMessage(insertError));
    } else {
      setNewName('');
      setNewReg('');
      await mutate();
      playClick();
      flash(`${result.valid[0].name} added`);
      nameInputRef.current?.focus();
    }
    setIsSubmitting(false);
  };

  const handleBulkAdd = async (e) => {
    e.preventDefault();
    if (!bulkPreview) return;
    setLocalError(null);

    if (!bulkPreview.valid.length) {
      setLocalError(`Nothing new to add: ${bulkPreview.duplicate.length} already enrolled, ${bulkPreview.invalid.length} missing a name or reg no.`);
      return;
    }
    setIsBulkSubmitting(true);
    const { error: insertError } = await supabase
      .from('students')
      .insert(bulkPreview.valid.map(student => ({ ...student, course_id: courseId })));

    if (insertError) {
      setLocalError(insertErrorMessage(insertError));
    } else {
      const result = bulkPreview;
      setBulkText('');
      await mutate();
      playSuccess();
      flash(summarize(result, result.valid.length));
    }
    setIsBulkSubmitting(false);
  };

  const pickFile = (file) => {
    if (!file) return;
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      setLocalError('Choose an .xlsx, .xls or .csv file.');
      return;
    }
    setLocalError(null);
    setImportFile(file);
    setImportPreview(null);
    readFile(file);
  };

  const readFile = (file) => {
    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const XLSX = await import('xlsx-js-style');
        const workbook = XLSX.read(e.target.result, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const sheetRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: '' });
        setImportPreview(validateRoster(parseRosterSheet(sheetRows), allStudents));
      } catch (error) {
        setLocalError(`Could not read this file: ${error.message}`);
        setImportFile(null);
      } finally {
        setIsImporting(false);
      }
    };
    reader.onerror = () => {
      setLocalError('Error reading file.');
      setIsImporting(false);
    };
    reader.readAsArrayBuffer(file);
  };

  const clearFile = () => {
    setImportFile(null);
    setImportPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleImportFile = async () => {
    if (!importPreview?.valid.length) return;
    setIsImporting(true);
    setLocalError(null);
    // Re-check against the latest roster in case it changed since the preview.
    const fresh = validateRoster(importPreview.valid, allStudents);
    const { error: insertError } = await supabase
      .from('students')
      .insert(fresh.valid.map(student => ({ ...student, course_id: courseId })));
    if (insertError) {
      setLocalError(insertErrorMessage(insertError));
    } else {
      const added = fresh.valid.length;
      const preview = importPreview;
      clearFile();
      await mutate();
      playSuccess();
      flash(summarize({ ...preview, duplicate: [...preview.duplicate, ...fresh.duplicate] }, added));
    }
    setIsImporting(false);
  };

  const handleDownloadTemplate = async () => {
    const XLSX = await import('xlsx-js-style');
    const ws = XLSX.utils.aoa_to_sheet([
      ["Name", "Reg Number"],
      ["Ahmed Khan", "2021-CS-101"],
      ["Sara Ali", "2021-CS-102"]
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Students");
    XLSX.writeFile(wb, "Student_Import_Template.xlsx");
  };

  const handleArchiveStudent = async (studentId, archive) => {
    const { error } = await supabase.from('students')
      .update({ archived_at: archive ? new Date().toISOString() : null }).eq('id', studentId);
    if (error) setLocalError(error.message);
    else {
      setDeletingId(null);
      if (archive) playDelete(); else playClick();
      await mutate();
    }
  };

  const handleEditStudent = async (event, studentId) => {
    event.preventDefault();
    const result = validateRoster([{ name: editName, reg_number: editReg }],
      allStudents.filter(student => student.id !== studentId));
    if (!result.valid.length) {
      setLocalError(result.duplicate.length ? 'Registration number already exists.' : 'Enter a name and registration number.');
      return;
    }
    const { error } = await supabase.from('students').update(result.valid[0]).eq('id', studentId);
    if (error) setLocalError(insertErrorMessage(error));
    else { setEditingId(null); setLocalError(null); playClick(); await mutate(); }
  };

  const query = searchQuery.trim().toLowerCase();
  const filteredStudents = students.filter(student =>
    student.name.toLowerCase().includes(query) ||
    student.reg_number.toLowerCase().includes(query)
  );

  const tabBody = {
    one: (
      <form onSubmit={handleAddSingle} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div>
          <label htmlFor="new-student-name" className="label">Full name</label>
          <input id="new-student-name" ref={nameInputRef} type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
            placeholder="Ahmed Khan" autoComplete="off" autoCapitalize="words" className="field" required />
        </div>
        <div>
          <label htmlFor="new-student-reg" className="label">Registration no.</label>
          <input id="new-student-reg" type="text" value={newReg} onChange={(e) => setNewReg(e.target.value)}
            placeholder="2021-CS-101" autoComplete="off" autoCapitalize="characters" className="field" required />
        </div>
        <button type="submit" disabled={isSubmitting} className="btn-primary">
          <Plus size={18} strokeWidth={2.5} /> {isSubmitting ? 'Adding…' : 'Add student'}
        </button>
      </form>
    ),
    paste: (
      <form onSubmit={handleBulkAdd}>
        <label htmlFor="bulk-students" className="label">One student per line</label>
        <textarea
          id="bulk-students"
          value={bulkText}
          onChange={(e) => setBulkText(e.target.value)}
          placeholder={'Ahmed Khan, 2021-CS-101\nSara Ali, 2021-CS-102\n…or paste two columns straight from Excel'}
          rows={6}
          className="field resize-y font-medium leading-relaxed"
        />
        <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
          Works with commas, tabs (copied from Excel or Google Sheets), numbered lists and either column order.
        </p>
        {bulkPreview && (
          <div className="mt-3 rounded-xl bg-black/[0.04] px-4 py-3 text-sm dark:bg-white/[0.06]" aria-live="polite">
            <p className="font-bold text-gray-900 dark:text-white">
              {bulkPreview.valid.length} ready to add
              {bulkPreview.duplicate.length > 0 && <span className="font-medium text-gray-600 dark:text-gray-400"> · {bulkPreview.duplicate.length} already enrolled</span>}
              {bulkPreview.invalid.length > 0 && <span className="font-medium text-red-700 dark:text-red-400"> · line {bulkPreview.invalid.slice(0, 3).join(', ')}{bulkPreview.invalid.length > 3 ? '…' : ''} missing a reg no.</span>}
            </p>
            {bulkPreview.valid.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-xs text-gray-700 dark:text-gray-300">
                {bulkPreview.valid.slice(0, 4).map(student => (
                  <li key={student.reg_number} className="flex justify-between gap-3">
                    <span className="truncate">{student.name}</span><span className="flex-none tabular-nums text-gray-500">{student.reg_number}</span>
                  </li>
                ))}
                {bulkPreview.valid.length > 4 && <li className="text-gray-500">+ {bulkPreview.valid.length - 4} more</li>}
              </ul>
            )}
          </div>
        )}
        <button type="submit" disabled={isBulkSubmitting || !bulkPreview?.valid.length} className="btn-primary mt-3 w-full sm:w-auto">
          {isBulkSubmitting ? 'Adding…' : bulkPreview?.valid.length ? `Add ${bulkPreview.valid.length} ${bulkPreview.valid.length === 1 ? 'student' : 'students'}` : 'Add students'}
        </button>
      </form>
    ),
    file: (
      <div>
        <label htmlFor="roster-file"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => { event.preventDefault(); pickFile(event.dataTransfer.files?.[0]); }}
          className="group flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-black/30 px-4 py-8 text-center transition-colors hover:border-black hover:bg-[#b9ff66]/15 dark:border-white/30 dark:hover:border-[#b9ff66] dark:hover:bg-[#b9ff66]/5"
        >
          <Upload size={24} className="mb-2 text-gray-900 dark:text-white" />
          <span className="text-sm font-bold text-gray-900 dark:text-white">{importFile ? 'Choose a different file' : 'Choose a file'}</span>
          <span className="mt-1 text-xs text-gray-600 dark:text-gray-400">.xlsx or .csv · names in one column, reg numbers in the next</span>
        </label>
        <input type="file" id="roster-file" ref={fileInputRef} accept=".xlsx,.xls,.csv"
          onChange={(e) => pickFile(e.target.files?.[0])} className="sr-only" />

        {importFile && (
          <div className="mt-3 rounded-xl bg-black/[0.04] px-4 py-3 text-sm dark:bg-white/[0.06]" aria-live="polite">
            <div className="flex items-center justify-between gap-3">
              <span className="truncate font-bold text-gray-900 dark:text-white">{importFile.name}</span>
              <button type="button" onClick={clearFile} aria-label="Remove file" className="flex-none rounded-lg p-1 text-gray-600 hover:bg-black/10 dark:text-gray-300 dark:hover:bg-white/10"><X size={16} /></button>
            </div>
            {isImporting && !importPreview && <p className="mt-1 text-gray-600 dark:text-gray-400">Reading…</p>}
            {importPreview && (
              <>
                <p className="mt-1 text-gray-700 dark:text-gray-300">
                  <strong className="text-gray-900 dark:text-white">{importPreview.valid.length} ready to add</strong>
                  {importPreview.duplicate.length > 0 && ` · ${importPreview.duplicate.length} already enrolled`}
                  {importPreview.invalid.length > 0 && ` · ${importPreview.invalid.length} incomplete rows skipped`}
                </p>
                <ul className="mt-2 space-y-0.5 text-xs text-gray-700 dark:text-gray-300">
                  {importPreview.valid.slice(0, 4).map(student => (
                    <li key={student.reg_number} className="flex justify-between gap-3">
                      <span className="truncate">{student.name}</span><span className="flex-none tabular-nums text-gray-500">{student.reg_number}</span>
                    </li>
                  ))}
                  {importPreview.valid.length > 4 && <li className="text-gray-500">+ {importPreview.valid.length - 4} more</li>}
                </ul>
              </>
            )}
          </div>
        )}

        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <button onClick={handleImportFile} disabled={!importPreview?.valid.length || isImporting} className="btn-primary flex-1 sm:flex-none">
            {isImporting && importPreview ? 'Adding…' : importPreview?.valid.length ? `Add ${importPreview.valid.length} students` : 'Add students'}
          </button>
          <button onClick={handleDownloadTemplate} className="btn-quiet">Download template</button>
        </div>
      </div>
    ),
    course: (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm text-gray-600 dark:text-gray-400">Copy students you already added to another course — handy when the same class takes several subjects.</p>
        <button onClick={() => setShowExistingCourseModal(true)} className="btn-primary">
          <Users size={18} /> Choose students
        </button>
      </div>
    ),
  };

  const selectableSource = sourceStudents.filter(s => !students.some(es => normalizeReg(es.reg_number) === normalizeReg(s.reg_number)));

  return (
    <Layout>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-col"
      >
        <CourseHeader
          courseId={courseId}
          courseName={courseName}
          summary={loading ? 'Students' : `Students · ${students.length} enrolled`}
          actions={!isAddOpen && (
            <button onClick={() => openAdd()} className="btn-primary">
              <Plus size={18} strokeWidth={2.5} /> Add
            </button>
          )}
        />

        {error && (
          <div role="alert" className="alert-error mb-4 flex items-start justify-between gap-3">
            <span>{error}</span>
            {localError && <button onClick={() => setLocalError(null)} aria-label="Dismiss" className="flex-none"><X size={16} /></button>}
          </div>
        )}
        <AnimatePresence>
          {notice && (
            <motion.div role="status" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="alert-ok mb-4 flex items-center gap-2">
              <Check size={16} strokeWidth={3} className="flex-none" /> {notice}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Add students */}
        {isAddOpen && (
          <section ref={addPanelRef} aria-labelledby="add-students-title" className="panel mb-6 scroll-mt-24 overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-4 pt-4 sm:px-5">
              <h2 id="add-students-title" className="text-lg font-extrabold text-gray-900 dark:text-white">Add students</h2>
              {students.length > 0 && (
                <button onClick={() => setAddOpen(false)} aria-label="Close add students" className="rounded-lg p-2 text-gray-600 hover:bg-black/5 dark:text-gray-300 dark:hover:bg-white/10">
                  <X size={18} />
                </button>
              )}
            </div>
            <div role="tablist" aria-label="Ways to add students" className="mt-3 grid grid-cols-2 gap-1.5 px-4 sm:flex sm:flex-wrap sm:px-5">
              {ADD_TABS.map(({ id, label, icon: Icon }) => (
                <button key={id} role="tab" aria-selected={addTab === id} aria-controls={`add-tab-${id}`} id={`add-tab-btn-${id}`}
                  onClick={() => { setAddTab(id); setLocalError(null); }}
                  className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border-2 px-3.5 text-[13px] font-bold transition-colors ${addTab === id
                    ? 'border-black bg-black text-[#b9ff66] dark:border-[#b9ff66] dark:bg-[#b9ff66] dark:text-black'
                    : 'border-black/15 text-gray-700 hover:border-black dark:border-white/20 dark:text-gray-300 dark:hover:border-white'}`}>
                  <Icon size={15} /> {label}
                </button>
              ))}
            </div>
            <div role="tabpanel" id={`add-tab-${addTab}`} aria-labelledby={`add-tab-btn-${addTab}`} className="px-4 pb-5 pt-4 sm:px-5">
              {tabBody[addTab]}
            </div>
          </section>
        )}

        {/* Roster */}
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-extrabold text-gray-900 dark:text-white">Class list</h2>
        </div>
        {students.length > 5 && (
          <label className="relative mb-3 block">
            <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
            <input type="search" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search name or reg no." aria-label="Search enrolled students" className="field pl-10" />
          </label>
        )}

        {loading ? (
          <div className="flex flex-col gap-2">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-16 w-full animate-pulse rounded-2xl bg-black/[0.06] dark:bg-white/[0.06]" />)}
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="panel-soft flex flex-col items-center px-6 py-10 text-center">
            <Users size={28} className="mb-3 text-gray-400" />
            <h3 className="text-lg font-extrabold text-gray-800 dark:text-gray-200">{students.length ? 'No matching students' : 'No students yet'}</h3>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{students.length ? 'Try another name or reg number.' : 'Paste your class list above to add everyone at once.'}</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {filteredStudents.map((student) => (
              <li key={student.id}
                className="flex min-w-0 flex-wrap items-center gap-3 rounded-2xl border-2 border-black/80 bg-white px-3 py-2.5 dark:border-white/60 dark:bg-[#111] sm:flex-nowrap sm:px-4">
                {editingId === student.id ? (
                  <form onSubmit={event => handleEditStudent(event, student.id)} className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
                    <input aria-label={`Name for ${student.name}`} value={editName} onChange={event => setEditName(event.target.value)} className="field py-2.5" autoFocus />
                    <input aria-label={`Registration number for ${student.name}`} value={editReg} onChange={event => setEditReg(event.target.value)} className="field py-2.5" />
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => setEditingId(null)} className="btn-quiet">Cancel</button>
                      <button type="submit" className="btn-primary">Save</button>
                    </div>
                  </form>
                ) : (
                  <>
                    <span aria-hidden="true" className="flex h-10 w-10 flex-none items-center justify-center rounded-xl border-2 border-black bg-[#e4facb] text-sm font-extrabold text-black dark:bg-[#b9ff66]">
                      {student.name.charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-bold text-gray-900 dark:text-white">{student.name}</p>
                      <p className="truncate text-xs font-medium tabular-nums text-gray-600 dark:text-gray-400">{student.reg_number}</p>
                    </div>
                    {deletingId === student.id ? (
                      <div className="flex w-full justify-end gap-2 sm:w-auto">
                        <button onClick={() => setDeletingId(null)} className="btn-quiet min-h-[40px] text-xs">Cancel</button>
                        <button onClick={() => handleArchiveStudent(student.id, true)} className="btn-danger min-h-[40px] text-xs">
                          <Archive size={15} /> Archive
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-none gap-1">
                        <button
                          onClick={() => { setEditingId(student.id); setEditName(student.name); setEditReg(student.reg_number); setDeletingId(null); }}
                          aria-label={`Edit ${student.name}`}
                          className="flex h-10 w-10 items-center justify-center rounded-xl text-gray-600 transition-colors hover:bg-black/5 hover:text-black dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white"
                        ><Pencil size={17} /></button>
                        <button
                          onClick={() => { setDeletingId(student.id); setEditingId(null); }}
                          aria-label={`Archive ${student.name}`}
                          className="flex h-10 w-10 items-center justify-center rounded-xl text-gray-600 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-gray-300 dark:hover:bg-red-950/50 dark:hover:text-red-400"
                        ><Archive size={17} /></button>
                      </div>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        {archivedStudents.length > 0 && (
          <div className="mt-6">
            <button className="btn-quiet -ml-3 text-sm" aria-expanded={showArchived} onClick={() => setShowArchived(value => !value)}>
              {showArchived ? 'Hide' : 'Show'} archived ({archivedStudents.length})
            </button>
            {showArchived && (
              <ul className="mt-2 flex flex-col gap-2">
                {archivedStudents.map(student => (
                  <li key={student.id} className="panel-soft flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                    <span className="min-w-0 truncate text-gray-700 dark:text-gray-300">{student.name} <span className="tabular-nums text-gray-500">· {student.reg_number}</span></span>
                    <button className="btn-quiet min-h-[40px] flex-none px-3 text-xs" onClick={() => handleArchiveStudent(student.id, false)}>
                      <RotateCcw size={14} /> Restore
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </motion.div>

      {/* Add from Existing Course */}
      <AnimatePresence>
        {showExistingCourseModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowExistingCourseModal(false)}
            className="sheet-backdrop"
          >
            <motion.div
              ref={sourceDialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="source-dialog-title"
              tabIndex={-1}
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="sheet flex max-h-[88dvh] max-w-lg flex-col"
            >
              <div className="sheet-handle" />
              <div className="mb-4 flex items-center justify-between">
                <h2 id="source-dialog-title" className="text-lg font-extrabold text-gray-900 dark:text-white">Copy from another course</h2>
                <button aria-label="Close" onClick={() => setShowExistingCourseModal(false)}
                  className="rounded-lg p-2 text-gray-600 hover:bg-black/5 dark:text-gray-300 dark:hover:bg-white/10">
                  <X size={20} />
                </button>
              </div>

              {localError && <div className="alert-error mb-3">{localError}</div>}

              <label htmlFor="source-course" className="label">Course</label>
              <select id="source-course" value={selectedSourceCourseId} onChange={event => setSelectedSourceCourseId(event.target.value)} className="field font-bold">
                {!availableCourses.length && <option value="">No other courses</option>}
                {availableCourses.map(course => <option key={course.id} value={course.id}>{course.name}</option>)}
              </select>

              <div className="-mx-1 mt-4 min-h-[200px] flex-1 overflow-y-auto px-1">
                {sourceStudentsLoading ? (
                  <div className="flex flex-col gap-2">
                    {[1, 2, 3].map(i => <div key={i} className="h-14 animate-pulse rounded-xl bg-black/[0.06] dark:bg-white/[0.06]" />)}
                  </div>
                ) : sourceStudents.length === 0 ? (
                  <p className="panel-soft px-6 py-8 text-center text-sm font-semibold text-gray-600 dark:text-gray-400">No students in this course.</p>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    <label className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-3 hover:bg-black/5 dark:hover:bg-white/5">
                      <input
                        type="checkbox"
                        className="h-5 w-5 flex-none accent-[#6b9d28]"
                        checked={selectableSource.length > 0 && selectedStudentIds.size === selectableSource.length}
                        disabled={!selectableSource.length}
                        onChange={(e) => setSelectedStudentIds(e.target.checked ? new Set(selectableSource.map(s => s.id)) : new Set())}
                      />
                      <span className="text-sm font-bold text-gray-900 dark:text-white">Select all ({selectableSource.length})</span>
                    </label>
                    {sourceStudents.map(student => {
                      const alreadyExists = !selectableSource.includes(student);
                      const isSelected = selectedStudentIds.has(student.id);
                      return (
                        <label key={student.id}
                          className={`flex items-center gap-3 rounded-xl border-2 px-3 py-2.5 transition-colors ${alreadyExists
                            ? 'cursor-not-allowed border-transparent opacity-55'
                            : isSelected
                              ? 'cursor-pointer border-black bg-[#f3ffe0] dark:border-[#b9ff66] dark:bg-[#18240c]'
                              : 'cursor-pointer border-black/10 hover:border-black/40 dark:border-white/10 dark:hover:border-white/40'}`}>
                          <input
                            type="checkbox"
                            disabled={alreadyExists}
                            checked={isSelected}
                            onChange={(e) => {
                              const next = new Set(selectedStudentIds);
                              if (e.target.checked) next.add(student.id); else next.delete(student.id);
                              setSelectedStudentIds(next);
                            }}
                            className="h-5 w-5 flex-none accent-[#6b9d28]"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-bold text-gray-900 dark:text-white">{student.name}</span>
                            <span className="block truncate text-xs tabular-nums text-gray-600 dark:text-gray-400">{student.reg_number}</span>
                          </span>
                          {alreadyExists && <span className="flex-none text-[11px] font-bold text-gray-500">Already added</span>}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="mt-4 flex flex-col-reverse gap-2 border-t-2 border-black/10 pt-4 dark:border-white/10 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => setShowExistingCourseModal(false)} className="btn-quiet">Cancel</button>
                <button onClick={handleAddExistingStudents} disabled={isAddingExisting || selectedStudentIds.size === 0} className="btn-primary">
                  {isAddingExisting ? 'Adding…' : selectedStudentIds.size ? `Add ${selectedStudentIds.size} ${selectedStudentIds.size === 1 ? 'student' : 'students'}` : 'Add students'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Layout>
  );
}
