import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Trash2, Users, Upload, X } from 'lucide-react';
import * as XLSX from 'xlsx-js-style';
import useSWR from 'swr';
import { supabase } from '../lib/supabase';
import { useLoadingBar } from '../context/LoadingBarContext';
import Layout from '../components/Layout';
import AnimatedNumber from '../components/AnimatedNumber';

export default function StudentsPage() {
  const { id: courseId } = useParams();
  const navigate = useNavigate();
  const loadingBar = useLoadingBar();

  // File Import State
  const fileInputRef = useRef(null);
  const [importFile, setImportFile] = useState(null);
  const [isImporting, setIsImporting] = useState(false);

  // Delete State
  const [deletingId, setDeletingId] = useState(null);

  const fetcher = async () => {
    try {
      const [courseData, studentsData] = await Promise.all([
        supabase.from('courses').select('name').eq('id', courseId).single(),
        supabase.from('students').select('*').eq('course_id', courseId).order('name', { ascending: true })
      ]);
      if (courseData.error) throw courseData.error;
      if (studentsData.error) throw studentsData.error;
      return {
        courseName: courseData.data?.name || '',
        students: studentsData.data || []
      };
    } catch (err) {
      throw err;
    }
  };

  const [localError, setLocalError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Single Add State
  const [newName, setNewName] = useState('');
  const [newReg, setNewReg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Bulk Add State
  const [bulkText, setBulkText] = useState('');
  const [isBulkSubmitting, setIsBulkSubmitting] = useState(false);

  // Add from Existing Course State
  const [showExistingCourseModal, setShowExistingCourseModal] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [selectedSourceCourseId, setSelectedSourceCourseId] = useState('');
  const [sourceStudents, setSourceStudents] = useState([]);
  const [sourceStudentsLoading, setSourceStudentsLoading] = useState(false);
  const [selectedStudentIds, setSelectedStudentIds] = useState(new Set());
  const [isAddingExisting, setIsAddingExisting] = useState(false);

  const { data, error: swrError, mutate, isLoading, isValidating } = useSWR(`students_${courseId}`, fetcher);

  // Fetch available courses instantly using SWR so it stays fresh when courses are deleted elsewhere
  const { data: rawAvailableCourses } = useSWR('available_courses', async () => {
    const { data } = await supabase.from('courses').select('id, name').order('name');
    return data || [];
  }, { refreshInterval: 2000 }); // poll every 2s for quick updates

  const availableCourses = rawAvailableCourses ? rawAvailableCourses.filter(c => c.id !== courseId) : [];

  const studLoadingBarActive = useRef(false);
  useEffect(() => {
    if (isValidating && !data) { studLoadingBarActive.current = true; loadingBar?.start(); }
    else if (!isValidating && studLoadingBarActive.current) { studLoadingBarActive.current = false; loadingBar?.done(); }
  }, [isValidating]);

  const courseName = data?.courseName || '';
  const students = data?.students || [];
  const loading = isLoading;
  const error = swrError?.message || localError;

  useEffect(() => {
    if (showExistingCourseModal && availableCourses.length > 0 && !selectedSourceCourseId) {
      setSelectedSourceCourseId(availableCourses[0].id);
    }
  }, [showExistingCourseModal, availableCourses, selectedSourceCourseId]);

  useEffect(() => {
    if (!selectedSourceCourseId) return;
    
    async function fetchSourceStudents() {
      setSourceStudentsLoading(true);
      const { data, error } = await supabase
        .from('students')
        .select('*')
        .eq('course_id', selectedSourceCourseId)
        .order('name');
        
      if (!error && data) {
        setSourceStudents(data);
      }
      setSourceStudentsLoading(false);
      setSelectedStudentIds(new Set()); 
    }
    
    if (showExistingCourseModal) {
      fetchSourceStudents();
    }
  }, [selectedSourceCourseId, showExistingCourseModal]);

  const handleAddExistingStudents = async () => {
    if (selectedStudentIds.size === 0) return;
    setIsAddingExisting(true);
    setLocalError(null);
    
    const studentsToAdd = sourceStudents
      .filter(s => selectedStudentIds.has(s.id))
      .map(s => ({
        name: s.name,
        reg_number: s.reg_number,
        course_id: courseId
      }));
      
    if (studentsToAdd.length > 0) {
      const { error } = await supabase.from('students').insert(studentsToAdd);
      if (error) {
        setLocalError(error.message);
      } else {
        setShowExistingCourseModal(false);
        await mutate();
      }
    }
    setIsAddingExisting(false);
  };


  const handleAddSingle = async (e) => {
    e.preventDefault();
    if (!newName.trim() || !newReg.trim()) return;
    setIsSubmitting(true);
    setLocalError(null);

    const { error: insertError } = await supabase
      .from('students')
      .insert({
        name: newName.trim(),
        reg_number: newReg.trim(),
        course_id: courseId
      });

    if (insertError) {
      setLocalError(insertError.message);
    } else {
      setNewName('');
      setNewReg('');
      await mutate();
    }
    setIsSubmitting(false);
  };

  const handleBulkAdd = async (e) => {
    e.preventDefault();
    if (!bulkText.trim()) return;
    setIsBulkSubmitting(true);
    setLocalError(null);

    const lines = bulkText.split('\n');
    const newStudents = [];

    lines.forEach(line => {
      const parts = line.split(',');
      if (parts.length >= 2) {
        const name = parts[0].trim();
        const reg = parts[1].trim();
        if (name && reg) {
          newStudents.push({
            name,
            reg_number: reg,
            course_id: courseId
          });
        }
      }
    });

    if (newStudents.length > 0) {
      const { error: insertError } = await supabase
        .from('students')
        .insert(newStudents);

      if (insertError) {
        setLocalError(insertError.message);
      } else {
        setBulkText('');
        await mutate();
      }
    }
    setIsBulkSubmitting(false);
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      setImportFile(e.target.files[0]);
    }
  };

  const handleImportFile = async () => {
    if (!importFile) return;
    setIsImporting(true);
    setLocalError(null);

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = e.target.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Read as array of arrays to handle columns properly
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        const newStudents = [];
        let startIndex = 0;

        // Skip header if exists
        if (rows.length > 0 && 
           (String(rows[0][0]).toLowerCase().includes('name') || 
            String(rows[0][0]).toLowerCase() === 'student name')) {
          startIndex = 1;
        }

        for (let i = startIndex; i < rows.length; i++) {
          const row = rows[i];
          if (row && row.length >= 2 && row[0] && row[1]) {
            newStudents.push({
              name: String(row[0]).trim(),
              reg_number: String(row[1]).trim(),
              course_id: courseId
            });
          }
        }

        if (newStudents.length > 0) {
          const { error: insertError } = await supabase
            .from('students')
            .insert(newStudents);
            
          if (insertError) throw insertError;
          setImportFile(null);
          if (fileInputRef.current) fileInputRef.current.value = '';
          await mutate();
        }
      } catch (err) {
        setLocalError('Failed to import file. Please check the format.');
      } finally {
        setIsImporting(false);
      }
    };
    reader.onerror = () => {
      setLocalError('Error reading file.');
      setIsImporting(false);
    };
    
    reader.readAsBinaryString(importFile);
  };

  const handleDownloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["Name", "Reg Number"],
      ["Ahmed Khan", "2021-CS-101"],
      ["Sara Ali", "2021-CS-102"]
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Students");
    XLSX.writeFile(wb, "Student_Import_Template.xlsx");
  };

  const handleDeleteStudent = async (studentId) => {
    if (data) mutate({ ...data, students: data.students.filter(s => s.id !== studentId) }, false); // Optimistic UI
    
    const { error: deleteError } = await supabase
      .from('students')
      .delete()
      .eq('id', studentId);

    if (deleteError) {
      setLocalError(deleteError.message);
      await mutate(); // rollback UI on fail
    } else {
      setDeletingId(null);
    }
  };

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
        <motion.button
          onClick={() => navigate('/dashboard')}
          whileHover={{ x: -3 }}
          whileTap={{ scale: 0.97 }}
          className="flex items-center gap-1.5 text-sm font-bold text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white transition-colors mb-6"
        >
          <ArrowLeft size={16} />
          Back to Courses
        </motion.button>

        {error && (
          <div className="bg-red-100 border-2 border-red-500 text-red-700 font-bold px-4 py-2 rounded-xl text-sm mb-4 inline-block">
            {error}
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
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
              Students
            </h1>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mt-2 mb-0">
              <AnimatedNumber value={students.length} /> {students.length === 1 ? 'student enrolled' : 'students enrolled'}
            </p>
          </div>
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
          {/* Left Column - Add Students */}
          <div className="border-2 border-black dark:border-white rounded-2xl bg-white dark:bg-[#111111] p-6">
            <h2 className="text-xs font-black uppercase tracking-wide text-gray-900 dark:text-white mb-4">
              Add Student
            </h2>
            <form onSubmit={handleAddSingle}>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Full Name"
                className="w-full px-4 py-2.5 rounded-xl border-2 border-black dark:border-white bg-transparent text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-[#b9ff66] font-medium text-sm transition-colors mb-3"
                required
              />
              <input
                type="text"
                value={newReg}
                onChange={(e) => setNewReg(e.target.value)}
                placeholder="Reg. Number e.g. 2021-CS-101"
                className="w-full px-4 py-2.5 rounded-xl border-2 border-black dark:border-white bg-transparent text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-[#b9ff66] font-medium text-sm transition-colors mb-3"
                required
              />
              <motion.button
                whileTap={{ scale: 0.97 }}
                type="submit"
                disabled={isSubmitting}
                className="bg-[#b9ff66] border-2 border-black text-black font-bold py-2.5 rounded-xl hover:bg-black hover:text-[#b9ff66] transition-all duration-150 text-sm w-full mt-1 disabled:opacity-70"
              >
                {isSubmitting ? 'Adding...' : 'Add Student →'}
              </motion.button>
            </form>

            <div className="border-t-2 border-dashed border-gray-200 dark:border-gray-700 my-5" />

            <h2 className="text-xs font-black uppercase tracking-wide text-gray-900 dark:text-white mb-4">
              Bulk Add
            </h2>
            <form onSubmit={handleBulkAdd}>
              <textarea
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder="Paste one student per line in format: Name, RegNumber&#10;e.g. Ahmed Khan, 2021-CS-101"
                rows={4}
                className="w-full px-4 py-3 rounded-xl border-2 border-black dark:border-white bg-transparent text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-[#b9ff66] font-medium text-sm transition-colors resize-none mb-3"
                required
              />
              <motion.button
                whileTap={{ scale: 0.97 }}
                type="submit"
                disabled={isBulkSubmitting}
                className="bg-[#b9ff66] border-2 border-black text-black font-bold py-2.5 rounded-xl hover:bg-black hover:text-[#b9ff66] transition-all duration-150 text-sm w-full mt-1 disabled:opacity-70"
              >
                {isBulkSubmitting ? 'Adding...' : 'Bulk Add →'}
              </motion.button>
            </form>

            {availableCourses.length > 0 && (
              <>
                <div className="border-t-2 border-dashed border-gray-200 dark:border-gray-700 my-6" />
                <h2 className="text-xs font-black uppercase tracking-wide text-gray-900 dark:text-white mb-4">
                  From existing course
                </h2>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setShowExistingCourseModal(true)}
                  className="w-full flex items-center justify-center gap-2 bg-white dark:bg-[#111111] text-gray-900 dark:text-white border-2 border-black dark:border-white text-sm font-bold px-4 py-3 rounded-xl hover:bg-[#b9ff66] hover:text-black hover:border-black transition-colors"
                >
                  <Users size={18} />
                  Select Students to Import
                </motion.button>
              </>
            )}
          </div>

          {/* Right Column - Import from File */}
          <div className="border-2 border-black dark:border-white rounded-2xl bg-white dark:bg-[#111111] p-6">
            <h2 className="text-xs font-black uppercase tracking-wide text-gray-900 dark:text-white mb-4">
              Import from File
            </h2>
            
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-black/40 dark:border-white/40 rounded-xl p-8 text-center cursor-pointer hover:border-black dark:hover:border-[#b9ff66] hover:bg-[#b9ff66]/10 dark:hover:bg-[#b9ff66]/5 transition-all flex flex-col items-center justify-center mb-4 group"
            >
              <Upload size={24} className="text-gray-900 dark:text-white group-hover:text-black dark:group-hover:text-[#b9ff66] transition-colors mb-2 group-hover:-translate-y-1" />
              <p className="text-sm font-bold text-gray-900 dark:text-white mt-2 group-hover:text-black dark:group-hover:text-[#b9ff66]">Click to upload or drag & drop</p>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mt-1">.xlsx or .csv — Name in column A, Reg Number in column B</p>
            </div>
            
            <input
              type="file"
              ref={fileInputRef}
              accept=".xlsx,.csv"
              onChange={handleFileChange}
              className="hidden"
            />

            {importFile && (
              <div className="bg-gray-100 dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 mb-4 truncate">
                Selected: {importFile.name}
              </div>
            )}

            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleImportFile}
              disabled={!importFile || isImporting}
              className="bg-[#b9ff66] border-2 border-black text-black font-bold py-2.5 rounded-xl hover:bg-black hover:text-[#b9ff66] transition-all duration-150 text-sm w-full disabled:opacity-50 disabled:cursor-not-allowed mb-5"
            >
              {isImporting ? 'Importing...' : 'Import Students →'}
            </motion.button>

            <div className="border-t-2 border-dashed border-gray-200 dark:border-gray-700 my-5" />
            
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleDownloadTemplate}
              className="border-2 border-black dark:border-white rounded-xl px-4 py-2 text-xs font-bold hover:bg-[#b9ff66] hover:border-black dark:hover:border-[#b9ff66] transition-all text-gray-900 dark:text-white w-full"
            >
              Download Template
            </motion.button>
          </div>
        </div>

        {/* Students List Below */}
        <h2 className="text-xs font-black uppercase tracking-wide text-gray-400 mt-10 mb-4">
          Enrolled Students
        </h2>
        
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by name or reg number..."
          className="w-full px-4 py-2.5 rounded-xl border-2 border-black dark:border-white bg-white dark:bg-[#111111] text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-[#b9ff66] font-medium text-sm transition-colors mb-4"
        />

        {loading ? (
          <div className="flex flex-col gap-2">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="animate-pulse bg-gray-200 dark:bg-gray-800 rounded-xl h-14 w-full mb-2" />
            ))}
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl p-10 text-center flex flex-col items-center justify-center">
            <Users size={28} className="text-gray-400 mb-3" />
            <h3 className="font-black text-gray-400 text-lg">No students yet</h3>
            <p className="text-sm text-gray-400 mt-1">Add students using the form above</p>
          </div>
        ) : (
          <div className="flex flex-col">
            <AnimatePresence>
              {filteredStudents.map((student, index) => (
                <motion.div
                  layout
                  key={student.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1], delay: index * 0.04 }}
                  className="bg-white dark:bg-[#111111] border-2 border-black dark:border-white rounded-xl px-5 py-3.5 flex items-center justify-between mb-2"
                >
                  <div>
                    <h3 className="font-bold text-gray-900 dark:text-white text-sm">
                      {student.name}
                    </h3>
                    <p className="text-xs font-medium text-gray-400 mt-0.5">
                      {student.reg_number}
                    </p>
                  </div>
                  
                  {deletingId === student.id ? (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.8, x: 10 }}
                      animate={{ opacity: 1, scale: 1, x: 0 }}
                      className="flex items-center gap-2"
                    >
                      <motion.button
                        whileTap={{ scale: 0.9 }}
                        onClick={() => setDeletingId(null)}
                        className="text-xs font-bold text-gray-500 hover:text-black dark:hover:text-white"
                      >
                        Cancel
                      </motion.button>
                      <motion.button
                        whileTap={{ scale: 0.9 }}
                        onClick={() => handleDeleteStudent(student.id)}
                        className="bg-red-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg border-2 border-black"
                      >
                        Sure?
                      </motion.button>
                    </motion.div>
                  ) : (
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => setDeletingId(student.id)}
                      className="border-2 border-black dark:border-white rounded-lg p-1.5 hover:bg-red-500 hover:border-red-500 hover:text-white text-gray-400 transition-all"
                    >
                      <Trash2 size={14} />
                    </motion.button>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </motion.div>

      {/* Add from Existing Course Modal */}
      <AnimatePresence>
        {showExistingCourseModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowExistingCourseModal(false)}
            className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4 overflow-y-auto"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-[#111111] border-2 border-black dark:border-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] flex flex-col"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xs font-black uppercase tracking-wide text-gray-900 dark:text-white">
                  Add from Existing Course
                </h2>
                <button
                  onClick={() => setShowExistingCourseModal(false)}
                  className="text-gray-500 hover:text-black dark:hover:text-white transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              {localError && (
                <div className="bg-red-100 border-2 border-red-500 text-red-700 font-bold px-4 py-2 rounded-xl text-sm mb-4">
                  {localError}
                </div>
              )}

              <div className="flex flex-col gap-4 mb-6">
                <div className="flex flex-col gap-2 relative">
                  <span className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400">Select Source Course</span>
                  <div 
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    className="w-full px-4 py-3 rounded-xl border-2 border-black dark:border-white bg-white dark:bg-[#222222] text-gray-900 dark:text-white font-bold text-sm cursor-pointer flex justify-between items-center transition-colors"
                  >
                    <span>{availableCourses.find(c => c.id === selectedSourceCourseId)?.name || "Select Course"}</span>
                    <div className={`transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`}>
                      <div className="w-0 h-0 border-l-[5px] border-r-[5px] border-t-[5px] border-t-black border-l-transparent border-r-transparent dark:border-t-white" />
                    </div>
                  </div>
                  
                  <AnimatePresence>
                    {isDropdownOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.15 }}
                        className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-[#222222] border-2 border-black dark:border-white rounded-xl z-50 overflow-hidden"
                      >
                        <div className="max-h-48 overflow-y-auto">
                          {availableCourses.map(c => (
                            <div
                              key={c.id}
                              onClick={() => {
                                setSelectedSourceCourseId(c.id);
                                setIsDropdownOpen(false);
                              }}
                              className={`px-4 py-3 text-sm font-bold cursor-pointer transition-colors ${
                                selectedSourceCourseId === c.id 
                                  ? 'bg-[#b9ff66] text-black border-b-2 border-black last:border-b-0' 
                                  : 'text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-800 border-b border-gray-100 dark:border-gray-800 last:border-0'
                              }`}
                            >
                              {c.name}
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

                <div className="flex-1 overflow-y-auto mb-2 pr-2 -mr-2 h-[350px] min-h-[350px]">
                  {sourceStudentsLoading ? (
                    <div className="flex justify-center items-center h-full text-gray-500">
                      <div className="animate-pulse flex gap-2">
                        <div className="w-3 h-3 bg-[#b9ff66] border-2 border-black rounded-full" />
                        <div className="w-3 h-3 bg-[#b9ff66] border-2 border-black rounded-full" style={{ animationDelay: '0.2s' }} />
                        <div className="w-3 h-3 bg-[#b9ff66] border-2 border-black rounded-full" style={{ animationDelay: '0.4s' }} />
                      </div>
                    </div>
                  ) : sourceStudents.length === 0 ? (
                    <p className="text-sm border-2 border-dashed border-gray-300 dark:border-gray-700 bg-white/50 dark:bg-[#111111]/50 rounded-2xl p-8 text-gray-500 font-bold text-center my-0">No students found in this course.</p>
                  ) : (
                    <div className="flex flex-col gap-3">
                      <label className="flex flex-row items-center gap-4 p-4 rounded-xl border-2 border-dashed border-black dark:border-white cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors bg-white dark:bg-[#222222] flex-shrink-0 group">
                        <div className="relative flex items-center justify-center">
                          <input
                            type="checkbox"
                            className="peer w-6 h-6 rounded border-2 border-black dark:border-white appearance-none checked:bg-[#b9ff66] checked:border-black transition-colors cursor-pointer"
                            checked={selectedStudentIds.size > 0 && selectedStudentIds.size === sourceStudents.filter(s => !students.some(es => es.reg_number === s.reg_number)).length}
                            onChange={(e) => {
                              if (e.target.checked) {
                                const validIds = sourceStudents
                                  .filter(s => !students.some(es => es.reg_number === s.reg_number))
                                  .map(s => s.id);
                                setSelectedStudentIds(new Set(validIds));
                              } else {
                                setSelectedStudentIds(new Set());
                              }
                            }}
                          />
                          <svg className="absolute w-4 h-4 text-black opacity-0 peer-checked:opacity-100 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        </div>
                      <span className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-wide">Select All Valid Students</span>
                    </label>

                    {sourceStudents.map(student => {
                      const alreadyExists = students.some(es => es.reg_number === student.reg_number);
                      const isSelected = selectedStudentIds.has(student.id);

                      return (
                        <label 
                          key={student.id}
                          className={`flex flex-row items-center justify-between p-4 rounded-xl border-2 transition-all flex-shrink-0 group ${
                            alreadyExists 
                              ? 'border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-[#1a1a1a] opacity-60 cursor-not-allowed' 
                              : isSelected
                                ? 'border-black dark:border-[#b9ff66] bg-[#b9ff66]/10 dark:bg-[#b9ff66]/5 cursor-pointer shadow-[4px_4px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_rgba(185,255,102,0.2)] -translate-y-[2px]'
                                : 'border-black/20 dark:border-white/20 bg-white dark:bg-[#222222] hover:border-black dark:hover:border-white cursor-pointer'
                          }`}
                        >
                          <div className="flex items-center gap-4">
                            <div className="relative flex items-center justify-center">
                              <input 
                                type="checkbox"
                                disabled={alreadyExists}
                                checked={isSelected}
                                onChange={(e) => {
                                  const newSet = new Set(selectedStudentIds);
                                  if (e.target.checked) newSet.add(student.id);
                                  else newSet.delete(student.id);
                                  setSelectedStudentIds(newSet);
                                }}
                                className="peer w-6 h-6 rounded border-2 border-black dark:border-white appearance-none checked:bg-[#b9ff66] checked:border-black transition-colors cursor-pointer disabled:cursor-not-allowed disabled:border-gray-300 dark:disabled:border-gray-700"
                              />
                              <svg className="absolute w-4 h-4 text-black opacity-0 peer-checked:opacity-100 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                            </div>
                            <div className="flex flex-col">
                              <span className="text-sm font-bold text-gray-900 dark:text-white truncate max-w-[150px] sm:max-w-[240px]">
                                {student.name}
                              </span>
                              <span className="text-xs font-semibold text-gray-500">
                                {student.reg_number}
                              </span>
                            </div>
                          </div>
                          {alreadyExists && (
                            <span className="text-[10px] font-black px-2 py-1 bg-gray-200 dark:bg-gray-800 text-gray-500 uppercase tracking-widest rounded-md border border-gray-300 dark:border-gray-700">
                              Added
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 mt-4 pt-4 border-t-2 border-black/10 dark:border-white/10">
                <button
                  type="button"
                  onClick={() => setShowExistingCourseModal(false)}
                  className="px-5 py-2.5 rounded-xl text-sm font-bold text-gray-500 hover:text-black dark:hover:text-white transition-colors border-2 border-transparent hover:border-gray-200 dark:hover:border-gray-800"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddExistingStudents}
                  disabled={isAddingExisting || selectedStudentIds.size === 0}
                  className="bg-[#b9ff66] border-2 border-black text-black px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-black hover:text-[#b9ff66] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-w-[140px] shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-y-[2px] disabled:hover:translate-y-0 disabled:hover:shadow-[2px_2px_0px_rgba(0,0,0,1)] disabled:hover:bg-[#b9ff66] disabled:hover:text-black"
                >
                  {isAddingExisting ? (
                    <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  ) : (
                    `Add ${selectedStudentIds.size > 0 ? `(${selectedStudentIds.size})` : ''}`
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Layout>
  );
}