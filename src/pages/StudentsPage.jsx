import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Trash2, Users, Upload } from 'lucide-react';
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

  const { data, error: swrError, mutate, isLoading, isValidating } = useSWR(`students_${courseId}`, fetcher);

  const studLoadingBarActive = useRef(false);
  useEffect(() => {
    if (isValidating && !data) { studLoadingBarActive.current = true; loadingBar?.start(); }
    else if (!isValidating && studLoadingBarActive.current) { studLoadingBarActive.current = false; loadingBar?.done(); }
  }, [isValidating]);

  const courseName = data?.courseName || '';
  const students = data?.students || [];
  const loading = isLoading;
  const error = swrError?.message || localError;

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
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mt-2 mb-8">
            <AnimatedNumber value={students.length} /> {students.length === 1 ? 'student enrolled' : 'students enrolled'}
          </p>
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
          </div>

          {/* Right Column - Import from File */}
          <div className="border-2 border-black dark:border-white rounded-2xl bg-white dark:bg-[#111111] p-6">
            <h2 className="text-xs font-black uppercase tracking-wide text-gray-900 dark:text-white mb-4">
              Import from File
            </h2>
            
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-8 text-center cursor-pointer hover:border-[#b9ff66] transition-colors flex flex-col items-center justify-center mb-4"
            >
              <Upload size={24} className="text-gray-400 mb-2" />
              <p className="text-sm font-medium text-gray-400 mt-2">Click to upload or drag & drop</p>
              <p className="text-xs text-gray-400 mt-1">.xlsx or .csv — Name in column A, Reg Number in column B</p>
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
    </Layout>
  );
}