import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Download, FileSpreadsheet, BarChart2, Trash2 } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts';
import * as XLSX from 'xlsx-js-style';
import useSWR from 'swr';
import { supabase } from '../lib/supabase';
import { useTheme } from '../context/ThemeContext';
import { useLoadingBar } from '../context/LoadingBarContext';
import Layout from '../components/Layout';
import AnimatedNumber from '../components/AnimatedNumber';
import { playDelete } from '../lib/sounds';

export default function HistoryPage() {
  const { id: courseId } = useParams();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  const loadingBar = useLoadingBar();

  const [searchQuery, setSearchQuery] = useState('');
  const [expandedDates, setExpandedDates] = useState(new Set());
  const [showToast, setShowToast] = useState(false);
  const [confirmDeleteDate, setConfirmDeleteDate] = useState(null);
  const [mobileDeleteDate, setMobileDeleteDate] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.matchMedia('(pointer: coarse)').matches);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const fetcher = async () => {
    try {
      const [courseData, studentsData, attendanceData] = await Promise.all([
        supabase.from('courses').select('name').eq('id', courseId).single(),
        supabase.from('students').select('*').eq('course_id', courseId).order('name', { ascending: true }),
        supabase.from('attendance').select('*').eq('course_id', courseId)
      ]);
      return {
        courseName: courseData.data?.name || '',
        students: studentsData.data || [],
        attendanceRecords: attendanceData.data || []
      };
    } catch (err) {
      throw err;
    }
  };

  const { data, mutate, isLoading: loading, isValidating } = useSWR(`history_${courseId}`, fetcher);

  // Only show loading bar on true first fetch — ref gate prevents ghost flash on cached revalidations
  const histLoadingBarActive = useRef(false);
  useEffect(() => {
    if (isValidating && !data) { histLoadingBarActive.current = true; loadingBar?.start(); }
    else if (!isValidating && histLoadingBarActive.current) { histLoadingBarActive.current = false; loadingBar?.done(); }
  }, [isValidating]);

  const courseName = data?.courseName || '';
  const students = data?.students || [];
  const attendanceRecords = data?.attendanceRecords || [];

  // Compute stats
  const normalizeStatus = (status) => status?.toLowerCase() === 'absent' ? 'absent' : 'present';

  const dateRecordsMap = {};
  attendanceRecords.forEach(record => {
    if (!dateRecordsMap[record.date]) {
      dateRecordsMap[record.date] = { present: 0, absent: 0, total: 0 };
    }
    const stat = normalizeStatus(record.status);
    dateRecordsMap[record.date][stat]++;
    dateRecordsMap[record.date].total++;
  });

  const datesList = Object.keys(dateRecordsMap).sort((a, b) => new Date(b) - new Date(a));
  const totalClasses = datesList.length;
  const totalStudents = students.length;

  // Student stats
  const studentStatsMap = {};
  students.forEach(student => {
    studentStatsMap[student.id] = { present: 0, absent: 0, total: 0, name: student.name, regNumber: student.reg_number };
  });

  attendanceRecords.forEach(record => {
    if (studentStatsMap[record.student_id]) {
      const stat = normalizeStatus(record.status);
      studentStatsMap[record.student_id][stat]++;
      studentStatsMap[record.student_id].total++;
    }
  });

  let totalPresentsAll = 0;
  let totalAbsentsAll = 0;
  let atRiskCount = 0;

  const studentsWithStats = students.map(student => {
    const stats = studentStatsMap[student.id];
    totalPresentsAll += stats.present;
    totalAbsentsAll += stats.absent;
    const totalRecords = stats.total;
    const percentage = totalRecords > 0 ? Math.round((stats.present / totalRecords) * 100) : 0;
    
    if (totalRecords > 0 && percentage < 75) {
      atRiskCount++;
    }

    return {
      ...student,
      percentage,
      present: stats.present,
      absent: stats.absent
    };
  });

  const totalPossible = totalPresentsAll + totalAbsentsAll;
  const avgAttendance = totalPossible > 0 ? Math.round((totalPresentsAll / totalPossible) * 100) : 0;

  let bestDay = "—";
  let bestPct = -1;
  datesList.forEach(date => {
    const stats = dateRecordsMap[date];
    const total = stats.present + stats.absent;
    const pct = total > 0 ? Math.round((stats.present / total) * 100) : -1;
    if (pct > bestPct && total > 0) {
      bestPct = pct;
      const d = new Date(date + 'T00:00:00');
      bestDay = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  });

  const trendData = [...datesList].reverse().map(date => {
    const stats = dateRecordsMap[date];
    const total = stats.present + stats.absent;
    const pct = total > 0 ? Math.round((stats.present / total) * 100) : 0;
    const d = new Date(date + 'T00:00:00');
    return {
      date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      percentage: pct
    };
  });

  const studentChartData = studentsWithStats.map(s => {
    const parts = s.name.split(' ');
    const shortName = parts.length > 1 ? `${parts[0]} ${parts[1][0]}.` : s.name;
    return {
      name: shortName,
      percentage: s.percentage
    };
  });

  const filteredStudents = studentsWithStats.filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    s.reg_number.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleExport = () => {
    const today = new Date();
    // format like Apr-18-2025
    const opts = { month: 'short', day: 'numeric', year: 'numeric' };
    const formattedDate = today.toLocaleDateString('en-US', opts).replace(/, /g, '-').replace(/ /g, '-');
    const sortedDates = datesList.slice().reverse();

    const wb = XLSX.utils.book_new();
    wb.Props = {
      Title: `${courseName || 'Course'} Attendance Report`,
      Author: "CR Attendance App",
      CreatedDate: today
    };

    const headerStyle = {
      fill: { fgColor: { rgb: "0A0A0A" } },
      font: { name: "Arial", bold: true, color: { rgb: "B9FF66" }, sz: 11 },
      alignment: { horizontal: "center", vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "404040" } },
        bottom: { style: "medium", color: { rgb: "B9FF66" } },
        left: { style: "thin", color: { rgb: "404040" } },
        right: { style: "thin", color: { rgb: "404040" } }
      }
    };

    const studentHeaderStyle = {
      ...headerStyle,
      alignment: { horizontal: "left", vertical: "center" }
    };

    const cellStylePresent = {
      fill: { fgColor: { rgb: "B9FF66" } },
      font: { name: "Arial", bold: true, color: { rgb: "0A0A0A" } },
      alignment: { horizontal: "center", vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "E5E7EB" } }, bottom: { style: "thin", color: { rgb: "E5E7EB" } }, left: { style: "thin", color: { rgb: "E5E7EB" } }, right: { style: "thin", color: { rgb: "E5E7EB" } }
      }
    };

    const cellStyleAbsent = {
      fill: { fgColor: { rgb: "FCA5A5" } },
      font: { name: "Arial", bold: true, color: { rgb: "7F1D1D" } },
      alignment: { horizontal: "center", vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "E5E7EB" } }, bottom: { style: "thin", color: { rgb: "E5E7EB" } }, left: { style: "thin", color: { rgb: "E5E7EB" } }, right: { style: "thin", color: { rgb: "E5E7EB" } }
      }
    };

    const getBaseRowStyle = (rowIndex) => ({
      fill: { fgColor: { rgb: rowIndex % 2 === 0 ? "FFFFFF" : "F7F6F2" } },
      font: { name: "Arial", color: { rgb: "111111" } },
      border: {
        top: { style: "thin", color: { rgb: "E5E7EB" } }, bottom: { style: "thin", color: { rgb: "E5E7EB" } }, left: { style: "thin", color: { rgb: "E5E7EB" } }, right: { style: "thin", color: { rgb: "E5E7EB" } }
      }
    });

    const cellStyleDash = (rowIndex) => ({
      ...getBaseRowStyle(rowIndex),
      font: { name: "Arial", color: { rgb: "9CA3AF" }, italic: true },
      alignment: { horizontal: "center", vertical: "center" }
    });

    const cellStyleName = (rowIndex) => ({
      ...getBaseRowStyle(rowIndex),
      font: { name: "Arial", bold: true, color: { rgb: "0A0A0A" } },
      alignment: { horizontal: "left", vertical: "center" }
    });

    const cellStyleNormal = (rowIndex) => ({
      ...getBaseRowStyle(rowIndex),
      alignment: { horizontal: "center", vertical: "center" }
    });

    // ==============================================================================
    // Sheet 1: Attendance Log
    // ==============================================================================
    const logData = [];
    const courseTitleStyle = {
      fill: { fgColor: { rgb: "B9FF66" } },
      font: { name: "Arial", bold: true, color: { rgb: "0A0A0A" }, sz: 15 },
      alignment: { horizontal: "center", vertical: "center" },
      border: {
        top: { style: "medium", color: { rgb: "0A0A0A" } }, bottom: { style: "medium", color: { rgb: "0A0A0A" } }, left: { style: "medium", color: { rgb: "0A0A0A" } }, right: { style: "medium", color: { rgb: "0A0A0A" } }
      }
    };
    logData.push([{ v: `${courseName || 'Course'} Attendance Log`, t: 's', s: courseTitleStyle }]);

    const logHeaders = ['Student', 'Reg Number', ...sortedDates, 'Average'];
    logData.push(logHeaders.map((h, i) => ({
      v: h,
      t: 's',
      s: (i === 0 || i === 1) ? studentHeaderStyle : headerStyle
    })));

    students.forEach((student, rIdx) => {
      const row = [];
      const rowIndex = rIdx + 2; // 0 is title, 1 is header
      
      row.push({ v: student.name, t: 's', s: cellStyleName(rowIndex) });
      row.push({ v: student.reg_number, t: 's', s: cellStyleNormal(rowIndex) });
      
      sortedDates.forEach(date => {
        const record = attendanceRecords.find(r => r.student_id === student.id && r.date === date);
        if (record) {
          const isPresent = normalizeStatus(record.status) === 'present';
          row.push({
            v: isPresent ? 'Present' : 'Absent',
            t: 's',
            s: isPresent ? cellStylePresent : cellStyleAbsent
          });
        } else {
          row.push({ v: '—', t: 's', s: cellStyleDash(rowIndex) });
        }
      });
      
      const studentStats = studentsWithStats.find(s => s.id === student.id) || { percentage: 0 };
      const pct = studentStats.percentage;
      let pctStyle = cellStyleAbsent;
      if (pct >= 75) {
        pctStyle = cellStylePresent;
      } else if (pct >= 50) {
        pctStyle = {
          fill: { fgColor: { rgb: "FEF9C3" } }, 
          font: { name: "Arial", bold: true, color: { rgb: "854D0E" } }, 
          alignment: { horizontal: "center", vertical: "center" },
          border: { top: { style: "thin", color: { rgb: "E5E7EB" } }, bottom: { style: "thin", color: { rgb: "E5E7EB" } }, left: { style: "thin", color: { rgb: "E5E7EB" } }, right: { style: "thin", color: { rgb: "E5E7EB" } } }
        };
      }
      
      row.push({ v: `${pct}%`, t: 's', s: pctStyle });
      logData.push(row);
    });

    const wsLog = XLSX.utils.aoa_to_sheet(logData);
    wsLog['!cols'] = [{ wch: 25 }, { wch: 18 }, ...sortedDates.map(() => ({ wch: 12 })), { wch: 12 }];
    wsLog['!rows'] = [{ hpt: 30 }, { hpt: 22 }];
    wsLog['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: logHeaders.length - 1 } }];

    // ==============================================================================
    // Sheet 2: Summary
    // ==============================================================================
    const summaryData = [];
    summaryData.push([{ v: `${courseName || 'Course'} Attendance Summary`, t: 's', s: courseTitleStyle }]);
    
    const sumHeaders = ['Student Name', 'Reg Number', 'Present', 'Absent', 'Total Classes', 'Percentage'];
    summaryData.push(sumHeaders.map((h, i) => ({
      v: h,
      t: 's',
      s: (i === 0 || i === 1) ? studentHeaderStyle : headerStyle
    })));

    studentsWithStats.forEach((student, rIdx) => {
      const row = [];
      const rowIndex = rIdx + 2;
      
      row.push({ v: student.name, t: 's', s: cellStyleName(rowIndex) });
      row.push({ v: student.reg_number, t: 's', s: cellStyleNormal(rowIndex) });
      row.push({ v: student.present, t: 'n', s: cellStyleNormal(rowIndex) });
      row.push({ v: student.absent, t: 'n', s: cellStyleNormal(rowIndex) });
      row.push({ v: student.present + student.absent, t: 'n', s: cellStyleNormal(rowIndex) });
      
      const pct = student.percentage;
      let pctStyle = cellStyleAbsent;
      if (pct >= 75) {
        pctStyle = cellStylePresent;
      } else if (pct >= 50) {
        pctStyle = {
          fill: { fgColor: { rgb: "FEF9C3" } }, 
          font: { name: "Arial", bold: true, color: { rgb: "854D0E" } }, 
          alignment: { horizontal: "center", vertical: "center" },
          border: { top: { style: "thin", color: { rgb: "E5E7EB" } }, bottom: { style: "thin", color: { rgb: "E5E7EB" } }, left: { style: "thin", color: { rgb: "E5E7EB" } }, right: { style: "thin", color: { rgb: "E5E7EB" } } }
        };
      }
      row.push({ v: `${pct}%`, t: 's', s: pctStyle });
      
      summaryData.push(row);
    });

    // Totals Row
    const totalsStyle = {
      fill: { fgColor: { rgb: "0A0A0A" } },
      font: { name: "Arial", bold: true, color: { rgb: "B9FF66" }, sz: 12 },
      border: { top: { style: "medium", color: { rgb: "B9FF66" } }, bottom: { style: "thin", color: { rgb: "E5E7EB" } }, left: { style: "thin", color: { rgb: "E5E7EB" } }, right: { style: "thin", color: { rgb: "E5E7EB" } } }
    };
    const totalsStyleCenter = { ...totalsStyle, alignment: { horizontal: "center", vertical: "center" } };

    summaryData.push([
      { v: 'CLASS AVERAGE', t: 's', s: totalsStyle },
      { v: '', t: 's', s: totalsStyle },
      { v: '', t: 's', s: totalsStyle },
      { v: '', t: 's', s: totalsStyle },
      { v: '', t: 's', s: totalsStyle },
      { v: `${avgAttendance}%`, t: 's', s: totalsStyleCenter },
    ]);

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    wsSummary['!cols'] = [{ wch: 25 }, { wch: 18 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 16 }];
    wsSummary['!rows'] = [{ hpt: 30 }, { hpt: 22 }];
    wsSummary['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: sumHeaders.length - 1 } }];

    // ==============================================================================
    // Sheet 3: At Risk
    // ==============================================================================
    const atRiskData = [];
    atRiskData.push([{ v: `${courseName || 'Course'} At Risk Students`, t: 's', s: {
      ...courseTitleStyle,
      fill: { fgColor: { rgb: "A32D2D" } },
      font: { bold: true, color: { rgb: "FFFFFF" }, sz: 14 }
    }}]);

    const atRiskHeaderStyle = {
      ...headerStyle,
      fill: { fgColor: { rgb: "991B1B" } },
      font: { name: "Arial", bold: true, color: { rgb: "FFFFFF" }, sz: 11 },
      border: { ...headerStyle.border, bottom: { style: "medium", color: { rgb: "FFFFFF" } } }
    };
    const atRiskStudentHeaderStyle = {
      ...studentHeaderStyle,
      fill: { fgColor: { rgb: "991B1B" } },
      font: { name: "Arial", bold: true, color: { rgb: "FFFFFF" }, sz: 11 },
      border: { ...headerStyle.border, bottom: { style: "medium", color: { rgb: "FFFFFF" } } }
    };

    atRiskData.push(sumHeaders.map((h, i) => ({
      v: h,
      t: 's',
      s: (i === 0 || i === 1) ? atRiskStudentHeaderStyle : atRiskHeaderStyle
    })));

    const atRiskStudents = studentsWithStats.filter(s => s.percentage < 75);
    const atRiskRowStyle = {
      fill: { fgColor: { rgb: "FEF2F2" } },
      font: { name: "Arial", color: { rgb: "111111" } },
      border: { top: { style: "thin", color: { rgb: "E5E7EB" } }, bottom: { style: "thin", color: { rgb: "E5E7EB" } }, left: { style: "thin", color: { rgb: "E5E7EB" } }, right: { style: "thin", color: { rgb: "E5E7EB" } } }
    };

    if (atRiskStudents.length > 0) {
      atRiskStudents.forEach(student => {
        const row = [];
        row.push({ v: student.name, t: 's', s: { ...atRiskRowStyle, font: { bold: true, color: { rgb: "000000" } } } });
        row.push({ v: student.reg_number, t: 's', s: { ...atRiskRowStyle, alignment: { horizontal: "center", vertical: "center" } } });
        row.push({ v: student.present, t: 'n', s: { ...atRiskRowStyle, alignment: { horizontal: "center", vertical: "center" } } });
        row.push({ v: student.absent, t: 'n', s: { ...atRiskRowStyle, alignment: { horizontal: "center", vertical: "center" } } });
        row.push({ v: student.present + student.absent, t: 'n', s: { ...atRiskRowStyle, alignment: { horizontal: "center", vertical: "center" } } });
        
        let pctStyleFontColor = "A32D2D";
        if (student.percentage >= 50) {
           pctStyleFontColor = "854D0E"; // yellow-800 for 50-74
        }
        
        row.push({ v: `${student.percentage}%`, t: 's', s: { ...atRiskRowStyle, font: { bold: true, color: { rgb: pctStyleFontColor } }, alignment: { horizontal: "center", vertical: "center" } } });
        atRiskData.push(row);
      });
    } else {
      atRiskData.push([
        { 
          v: 'No at-risk students — great job!', 
          t: 's', 
          s: { ...atRiskRowStyle, font: { italic: true, color: { rgb: "9CA3AF" } }, alignment: { horizontal: "center", vertical: "center" } } 
        },
        ...Array(5).fill({ v: '', t: 's', s: atRiskRowStyle })
      ]);
    }

    const wsAtRisk = XLSX.utils.aoa_to_sheet(atRiskData);
    wsAtRisk['!cols'] = [{ wch: 25 }, { wch: 18 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 16 }];
    wsAtRisk['!rows'] = [{ hpt: 30 }, { hpt: 22 }];
    
    const atRiskMerges = [{ s: { r: 0, c: 0 }, e: { r: 0, c: sumHeaders.length - 1 } }];
    if (atRiskStudents.length === 0) {
      atRiskMerges.push({ s: { r: 2, c: 0 }, e: { r: 2, c: 5 } });
    }
    wsAtRisk['!merges'] = atRiskMerges;

    // Append sheets
    XLSX.utils.book_append_sheet(wb, wsLog, "Attendance Log");
    XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");
    XLSX.utils.book_append_sheet(wb, wsAtRisk, "At Risk");

    const safeCourseName = (courseName || 'Course').replace(/[^a-zA-Z0-9.\-_ ()]/g, "");
    const fileName = `${safeCourseName}_Attendance_Report_${formattedDate}.xlsx`;
    
    // Explicitly set cellStyles to true so xlsx-js-style applies our objects
    XLSX.writeFile(wb, fileName, { cellStyles: true });
    
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3500);
  };

  const toggleDateRow = (e, date) => {
    e.stopPropagation();
    const newExpanded = new Set(expandedDates);
    if (newExpanded.has(date)) {
      newExpanded.delete(date);
    } else {
      newExpanded.add(date);
    }
    setExpandedDates(newExpanded);
  };

  const formatDate = (dateStr) => {
    // Parse Date as Local
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const handleDeleteDate = async (e, date) => {
    e.stopPropagation();
    setDeleteLoading(true);
    playDelete();
    try {
      const { error } = await supabase
        .from('attendance')
        .delete()
        .eq('course_id', courseId)
        .eq('date', date);
        
      if (error) throw error;
      
      // Update local state by filtering out records for this date
      mutate({ ...data, attendanceRecords: data.attendanceRecords.filter(req => req.date !== date) }, false);
      setConfirmDeleteDate(null);
      
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    } catch (err) {
      console.error("Error deleting date:", err);
    } finally {
      setDeleteLoading(false);
    }
  };

  const gridColor = isDarkMode ? '#374151' : '#e5e7eb';
  const tooltipStyle = {
    background: isDarkMode ? '#1a1a1a' : '#fff',
    border: `2px solid ${isDarkMode ? '#fff' : '#000'}`,
    borderRadius: '12px',
    fontWeight: 700,
    fontSize: 12,
    color: isDarkMode ? '#fff' : '#000'
  };
  const tooltipItemStyle = { color: isDarkMode ? '#fff' : '#000' };

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
            className="w-full flex-col flex gap-8 pb-24"
          >
            <div className="flex items-center justify-between mb-6">
              <div className="h-4 w-24 bg-gray-200 dark:bg-gray-800 rounded mb-3" />
            </div>
            <div>
              <div className="h-6 w-32 bg-gray-200 dark:bg-gray-800 rounded mb-3" />
              <div className="h-10 w-48 bg-gray-200 dark:bg-gray-800 rounded mb-4" />
              <div className="h-4 w-32 bg-gray-200 dark:bg-gray-800 rounded" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-8">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="bg-white dark:bg-[#111111] border-2 border-gray-100 dark:border-gray-800 rounded-2xl p-5">
                  <div className="h-3 w-16 bg-gray-200 dark:bg-gray-800 rounded mb-4" />
                  <div className="h-8 w-12 bg-gray-200 dark:bg-gray-800 rounded" />
                </div>
              ))}
            </div>
            <div className="mt-10 mb-6">
               <div className="h-4 w-24 bg-gray-200 dark:bg-gray-800 rounded mb-6" />
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div className="bg-white dark:bg-[#111111] border-2 border-gray-100 dark:border-gray-800 rounded-2xl h-[300px]" />
                 <div className="bg-white dark:bg-[#111111] border-2 border-gray-100 dark:border-gray-800 rounded-2xl h-[300px]" />
               </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="content"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="pb-24"
          >
            <div className="flex items-center justify-between mb-6">
          <motion.button
            onClick={() => navigate('/dashboard')}
            whileHover={{ x: -2 }}
            whileTap={{ scale: 0.97 }}
            className="flex items-center gap-1.5 text-sm font-bold text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white transition-colors"
          >
            <ArrowLeft size={16} />
            Back to Courses
          </motion.button>
        </div>

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
            History
          </h1>
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mt-2">
            {totalClasses} classes recorded
          </p>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-8">
          <div className="bg-white dark:bg-[#111111] border-2 border-black dark:border-white rounded-2xl p-5">
            <div className="text-xs font-black uppercase tracking-wide text-gray-400 mb-2">Total Classes</div>
            <div className="text-3xl font-black text-gray-900 dark:text-white"><AnimatedNumber value={totalClasses} /></div>
          </div>
          <div className="bg-white dark:bg-[#111111] border-2 border-black dark:border-white rounded-2xl p-5">
            <div className="text-xs font-black uppercase tracking-wide text-gray-400 mb-2">Total Students</div>
            <div className="text-3xl font-black text-gray-900 dark:text-white"><AnimatedNumber value={totalStudents} /></div>
          </div>
          <div className="bg-white dark:bg-[#111111] border-2 border-black dark:border-white rounded-2xl p-5">
            <div className="text-xs font-black uppercase tracking-wide text-gray-400 mb-2">Avg Attendance</div>
            <div className="text-3xl font-black text-gray-900 dark:text-white"><AnimatedNumber value={avgAttendance} />%</div>
          </div>
          <div className="bg-white dark:bg-[#111111] border-2 border-black dark:border-white rounded-2xl p-5">
            <div className="text-xs font-black uppercase tracking-wide text-gray-400 mb-2">Best Day</div>
            <div className="text-3xl font-black text-gray-900 dark:text-white">{bestDay}</div>
          </div>
          <div className="bg-white dark:bg-[#111111] border-2 border-black dark:border-white rounded-2xl p-5">
            <div className="text-xs font-black uppercase tracking-wide text-gray-400 mb-2">At Risk</div>
            <div className={`text-3xl font-black ${atRiskCount > 0 ? 'text-red-500' : 'text-gray-900 dark:text-white'}`}><AnimatedNumber value={atRiskCount} /></div>
          </div>
        </div>

        {/* Analytics Section */}
        <div className="mt-10 mb-6">
          <h2 className="text-xs font-black uppercase tracking-wide text-gray-400 mb-6">Analytics</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Chart 1: Trend */}
            <div className="bg-white dark:bg-[#111111] border-2 border-black dark:border-white rounded-2xl p-6">
              <h3 className="text-sm font-black uppercase tracking-wide text-gray-900 dark:text-white mb-4">Attendance Trend</h3>
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                    <XAxis 
                      dataKey="date" 
                      tick={{ fontSize: 11, fontWeight: 700, fill: '#9ca3af' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis 
                      domain={[0, 100]} 
                      unit="%" 
                      tick={{ fontSize: 11, fontWeight: 700, fill: '#9ca3af' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      itemStyle={tooltipItemStyle}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="percentage" 
                      stroke="#b9ff66" 
                      strokeWidth={3} 
                      isAnimationActive={true}
                      dot={{ fill: '#b9ff66', stroke: '#000', strokeWidth: 2, r: 4 }} 
                      activeDot={{ r: 6, fill: '#b9ff66', stroke: '#000', strokeWidth: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Chart 2: Distribution */}
            <div className="bg-white dark:bg-[#111111] border-2 border-black dark:border-white rounded-2xl p-6">
              <h3 className="text-sm font-black uppercase tracking-wide text-gray-900 dark:text-white mb-4">Student Overview</h3>
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart layout="vertical" data={studentChartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
                    <XAxis 
                      type="number" 
                      domain={[0, 100]} 
                      unit="%" 
                      tick={{ fontSize: 11, fontWeight: 700, fill: '#9ca3af' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis 
                      type="category" 
                      dataKey="name" 
                      tick={{ fontSize: 11, fontWeight: 700, fill: '#9ca3af' }} 
                      width={80}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      itemStyle={tooltipItemStyle}
                      cursor={{fill: 'rgba(156, 163, 175, 0.1)'}}
                    />
                    <Bar dataKey="percentage" radius={[0, 6, 6, 0]} isAnimationActive={true}>
                      {
                        studentChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.percentage >= 75 ? '#b9ff66' : '#f87171'} />
                        ))
                      }
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>

        {/* Per-date history list */}
        <h2 className="text-xs font-black uppercase tracking-wide text-gray-400 mt-10 mb-4">
          Class Records
        </h2>
        {datesList.length === 0 ? (
          <div className="text-sm text-gray-500">No classes recorded yet.</div>
        ) : (
          <div className="flex flex-col">
            {datesList.map((date, index) => {
              const stats = dateRecordsMap[date];
              const total = stats.present + stats.absent;
              const pct = total > 0 ? Math.round((stats.present / total) * 100) : 0;
              const good = pct >= 75;

              return (
                <motion.div
                  layout
                  key={date}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -16, scale: 0.98 }}
                  transition={{ delay: index * 0.04, duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                  onClick={() => navigate(`/courses/${courseId}/attendance?date=${date}`)}
                  className="bg-white dark:bg-[#111111] border-2 border-black dark:border-white rounded-2xl px-5 py-4 cursor-pointer hover:border-[#b9ff66] transition-all duration-150 relative mb-3"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-black text-gray-900 dark:text-white flex items-center gap-2">
                        {formatDate(date)}
                      </div>
                      <div className="text-xs text-gray-400 font-medium mt-1">
                        {stats.present} present · {stats.absent} absent
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <AnimatePresence mode="popLayout">
                        {confirmDeleteDate === date && !isMobile ? (
                          <motion.div 
                            key="confirm"
                            initial={{ opacity: 0, scale: 0.8, x: 20 }}
                            animate={{ opacity: 1, scale: 1, x: 0 }}
                            exit={{ opacity: 0, scale: 0.8, x: 20 }}
                            transition={{ duration: 0.2 }}
                            className="flex items-center gap-1 border-2 border-red-500 rounded-xl p-1 bg-red-50 dark:bg-red-950 h-[32px]"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <motion.button
                              whileTap={{ scale: 0.9 }}
                              onClick={(e) => handleDeleteDate(e, date)}
                              disabled={deleteLoading}
                              className="px-2 py-0 text-xs font-bold text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors h-full flex items-center justify-center"
                            >
                              {deleteLoading ? '...' : 'Clear?'}
                            </motion.button>
                            <motion.button
                              whileTap={{ scale: 0.9 }}
                              onClick={(e) => { e.stopPropagation(); setConfirmDeleteDate(null); }}
                              disabled={deleteLoading}
                              className="px-2 py-0 text-xs font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg transition-colors h-full flex items-center justify-center"
                            >
                              ✕
                            </motion.button>
                          </motion.div>
                        ) : (
                          <motion.button 
                            key="btn"
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            transition={{ duration: 0.2 }}
                            whileHover={!isMobile ? { scale: 1.05 } : {}}
                            whileTap={{ scale: 0.95 }}
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              if (isMobile) {
                                setMobileDeleteDate(date);
                              } else {
                                setConfirmDeleteDate(date);
                              }
                            }}
                            className="rounded-xl flex-shrink-0 bg-red-50 dark:bg-red-950/30 border-2 border-red-200 dark:border-red-900/50 text-red-500 hover:border-red-500 transition-all flex items-center justify-center h-[32px] w-[44px]"
                            title="Delete Day"
                          >
                            <Trash2 size={16} />
                          </motion.button>
                        )}
                      </AnimatePresence>

                      <motion.button 
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={(e) => toggleDateRow(e, date)}
                        className="rounded-xl flex-shrink-0 bg-gray-100 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-black dark:hover:border-white hover:text-black dark:hover:text-white transition-all flex items-center justify-center h-[32px] w-[44px]"
                        title="Show Attendance Chart"
                      >
                        <BarChart2 size={16} />
                      </motion.button>

                      <div className={`rounded-xl flex-shrink-0 text-sm font-black flex items-center justify-center h-[32px] w-[64px] ${good ? 'bg-[#b9ff66] border-2 border-black text-black' : 'bg-red-100 border-2 border-red-400 text-red-700'}`}>
                        {pct}%
                      </div>
                    </div>
                  </div>
                  
                  <AnimatePresence>
                    {expandedDates.has(date) && (
                      <motion.div 
                        initial={{ height: 0, opacity: 0 }} 
                        animate={{ height: 'auto', opacity: 1 }} 
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div 
                          className="flex rounded-lg overflow-hidden h-3 mt-3 border border-black dark:border-gray-600 bg-gray-200 dark:bg-gray-800"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div 
                            style={{ width: `${pct}%` }} 
                            className="bg-[#b9ff66] h-full"
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* Per-student breakdown */}
        <h2 className="text-xs font-black uppercase tracking-wide text-gray-400 mt-10 mb-4">
          Student Attendance
        </h2>
        <input
          type="text"
          placeholder="Search students..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-4 py-3 rounded-xl border-2 border-black dark:border-white bg-white dark:bg-[#111111] text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-[#b9ff66] font-medium text-sm transition-colors mb-4"
        />
        
        {filteredStudents.length === 0 ? (
          <div className="text-sm text-gray-500">No students match your search.</div>
        ) : (
          <div className="grid gap-3">
            {filteredStudents.map((student, index) => {
              const good = student.percentage >= 75;

              return (
                <motion.div
                  key={student.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.04 }}
                  className="bg-white dark:bg-[#111111] border-2 border-black dark:border-white rounded-2xl px-5 py-4 flex items-center justify-between"
                >
                  <div className="w-1/3 min-w-[120px]">
                    <div className="font-bold text-gray-900 dark:text-white truncate">{student.name}</div>
                    <div className="text-xs text-gray-400">{student.reg_number}</div>
                  </div>
                  
                  <div className="hidden sm:block">
                    <div className="w-32 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${student.percentage}%` }}
                        transition={{ duration: 0.6, delay: index * 0.04, ease: [0.22, 1, 0.36, 1] }}
                        className={`h-full ${good ? 'bg-[#b9ff66]' : 'bg-red-400'}`}
                      />
                    </div>
                  </div>

                  <div className={`rounded-xl px-3 py-1 text-sm font-black ${good ? 'bg-[#b9ff66] border-2 border-black text-black' : 'bg-red-100 border-2 border-red-400 text-red-700'}`}>
                    {student.percentage}%
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

      </motion.div>
        )}
      </AnimatePresence>

      {/* Export buttons */}
      <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3">
        <motion.button
          whileHover={!isMobile ? { scale: 1.04 } : {}}
          whileTap={{ scale: 0.97 }}
          onClick={handleExport}
          className="bg-[#b9ff66] border-2 border-black rounded-2xl px-6 py-3 font-black text-black text-sm flex items-center gap-2 shadow-md hover:bg-black hover:text-[#b9ff66] transition-all"
        >
          <Download size={18} />
          Export to Excel
        </motion.button>
      </div>

      {/* ── Mobile Modals & Toasts ─────────────────────────────────── */}
      <AnimatePresence>
        {mobileDeleteDate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMobileDeleteDate(null)}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm bg-white dark:bg-[#111111] border-2 border-black dark:border-white rounded-2xl p-6 shadow-2xl flex flex-col items-center text-center"
            >
              <div className="flex items-center justify-center w-14 h-14 rounded-full bg-red-100 dark:bg-red-900/30 text-red-500 mb-4 border-2 border-red-500">
                <Trash2 size={24} strokeWidth={2.5} />
              </div>
              <h3 className="text-2xl font-black text-gray-900 dark:text-white mb-2">Delete Record?</h3>
              <p className="text-gray-600 dark:text-gray-400 mb-8 font-medium">
                Are you sure you want to clear attendance for<br/>
                <span className="text-gray-900 dark:text-gray-200 font-bold">{new Date(mobileDeleteDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>?
              </p>
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => setMobileDeleteDate(null)}
                  disabled={deleteLoading}
                  className="flex-1 py-3.5 px-4 bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white font-black rounded-xl border-2 border-transparent hover:border-gray-300 dark:hover:border-gray-700 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={(e) => {
                    handleDeleteDate(e, mobileDeleteDate).then(() => setMobileDeleteDate(null));
                  }}
                  disabled={deleteLoading}
                  className="flex-1 py-3.5 px-4 bg-red-500 text-white font-black rounded-xl border-2 border-black hover:bg-red-600 transition-colors flex items-center justify-center disabled:opacity-80"
                >
                  {deleteLoading ? <span className="animate-pulse">...</span> : 'Delete'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showToast && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className="fixed bottom-24 right-6 z-50 bg-[#b9ff66] border-2 border-black rounded-2xl px-5 py-3 font-bold text-black text-sm shadow-xl"
          >
            Export ready! Check your downloads.
          </motion.div>
        )}
      </AnimatePresence>

    </Layout>
  );
}