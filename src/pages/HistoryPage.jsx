import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { BarChart2, Check, ChevronDown, Download, Search, Trash2 } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts';
import useSWR from 'swr';
import { supabase } from '../lib/supabase';
import { useTheme } from '../context/ThemeContext';
import { useLoadingBar } from '../context/LoadingBarContext';
import Layout from '../components/Layout';
import { CourseHeader } from '../components/CourseNav';
import AnimatedNumber from '../components/AnimatedNumber';
import { playDelete } from '../lib/sounds';
import { fetchAllRows } from '../lib/fetchAllRows';
import { useModalFocus } from '../hooks/useModalFocus';

export default function HistoryPage() {
  const { id: courseId } = useParams();
  const prefersReducedMotion = useReducedMotion();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  const loadingBar = useLoadingBar();

  const [searchQuery, setSearchQuery] = useState('');
  const [expandedStudentId, setExpandedStudentId] = useState(null);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [thresholdInput, setThresholdInput] = useState('75');
  const [savingThreshold, setSavingThreshold] = useState(false);
  const [expandedDates, setExpandedDates] = useState(new Set());
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [confirmDeleteDate, setConfirmDeleteDate] = useState(null);
  const [mobileDeleteDate, setMobileDeleteDate] = useState(null);
  const deleteDateDialogRef = useModalFocus(Boolean(mobileDeleteDate), () => setMobileDeleteDate(null));
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.matchMedia('(pointer: coarse)').matches);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const fetcher = async () => {
      const [courseData, studentsData, attendanceRecords] = await Promise.all([
        supabase.from('courses').select('name, risk_threshold').eq('id', courseId).single(),
        fetchAllRows(() => supabase.from('students').select('*').eq('course_id', courseId).order('id')),
        fetchAllRows(() => supabase.from('attendance').select('*').eq('course_id', courseId).order('id')),
      ]);
      if (courseData.error) throw courseData.error;
      return {
        courseName: courseData.data?.name || '',
        riskThreshold: courseData.data?.risk_threshold ?? 75,
        students: studentsData,
        attendanceRecords,
      };
  };

  const { data, error: loadError, mutate, isLoading: loading, isValidating } = useSWR(`history_${courseId}`, fetcher);

  // Only show loading bar on true first fetch — ref gate prevents ghost flash on cached revalidations
  const histLoadingBarActive = useRef(false);
  useEffect(() => {
    if (isValidating && !data) { histLoadingBarActive.current = true; loadingBar?.start(); }
    else if (!isValidating && histLoadingBarActive.current) { histLoadingBarActive.current = false; loadingBar?.done(); }
  }, [isValidating, data, loadingBar]);

  const courseName = data?.courseName || '';
  const riskThreshold = data?.riskThreshold ?? 75;
  useEffect(() => { setThresholdInput(String(riskThreshold)); }, [riskThreshold]);
  const handleSaveThreshold = async (event) => {
    event.preventDefault();
    const value = Number(thresholdInput);
    if (!Number.isInteger(value) || value < 1 || value > 100) {
      setActionError('Choose a threshold from 1 to 100 percent.');
      return;
    }
    setSavingThreshold(true);
    setActionError(null);
    const { error } = await supabase.from('courses').update({ risk_threshold: value }).eq('id', courseId);
    if (error) setActionError(`Could not save threshold: ${error.message}`);
    else mutate(current => ({ ...current, riskThreshold: value }), false);
    setSavingThreshold(false);
  };
  const students = data?.students || [];
  const attendanceRecords = (data?.attendanceRecords || []).filter(record =>
    (!fromDate || record.date >= fromDate) && (!toDate || record.date <= toDate));

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
  const rosterSizeOn = date => students.filter(student => !student.archived_at || student.archived_at.slice(0, 10) > date).length;
  const incompleteCount = datesList.filter(date => dateRecordsMap[date].total < rosterSizeOn(date)).length;

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
    
    const atRisk = totalRecords > 0 && stats.present / totalRecords < riskThreshold / 100;
    if (atRisk) {
      atRiskCount++;
    }

    return {
      ...student,
      percentage,
      atRisk,
      totalRecords,
      present: stats.present,
      absent: stats.absent
    };
  });

  const totalPossible = totalPresentsAll + totalAbsentsAll;
  const avgAttendance = totalPossible > 0 ? Math.round((totalPresentsAll / totalPossible) * 100) : 0;

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

  const studentChartData = [...studentsWithStats].filter(s => s.totalRecords > 0)
    .sort((a, b) => a.percentage - b.percentage).slice(0, 8).map(s => {
    const parts = s.name.split(' ');
    const shortName = parts.length > 1 ? `${parts[0]} ${parts[1][0]}.` : s.name;
    return {
      name: shortName,
      percentage: s.percentage,
      atRisk: s.atRisk,
    };
  });

  const filteredStudents = studentsWithStats.filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    s.reg_number.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleExport = async () => {
    const XLSX = await import('xlsx-js-style');
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
      let pctStyle = student.totalRecords > 0 ? cellStyleAbsent : cellStyleDash(rowIndex);
      if (!student.atRisk && student.totalRecords > 0) {
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
      if (!student.atRisk && student.totalRecords > 0) {
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

    const atRiskStudents = studentsWithStats.filter(s => s.atRisk);
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
    
    setToastMessage('Report downloaded. Check your Downloads folder.');
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
      
      setToastMessage('Day cleared.');
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    } catch (err) {
      setActionError(`Could not delete that session: ${err.message}`);
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
            {(loadError || actionError) && (
              <div role="alert" className="mb-5 rounded-xl border-2 border-red-500 bg-red-100 px-4 py-3 text-sm font-bold text-red-800">
                {loadError ? `Could not load complete history: ${loadError.message}` : actionError}
                {loadError && <button className="ml-3 underline" onClick={() => mutate()}>Retry</button>}
              </div>
            )}
        <CourseHeader
          courseId={courseId}
          courseName={courseName}
          summary={`History · ${totalClasses} ${totalClasses === 1 ? 'class' : 'classes'} recorded`}
          actions={
            <button onClick={handleExport} disabled={!students.length} className="btn-secondary px-3 sm:px-4">
              <Download size={17} /> Export
            </button>
          }
        />

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          <div className="panel p-3 sm:p-5">
            <div className="text-[11px] font-bold text-gray-600 dark:text-gray-400 sm:text-xs">Average</div>
            <div className="mt-1 font-display text-2xl font-extrabold tabular-nums text-gray-900 dark:text-white sm:text-3xl"><AnimatedNumber value={avgAttendance} />%</div>
          </div>
          <div className="panel p-3 sm:p-5">
            <div className="text-[11px] font-bold text-gray-600 dark:text-gray-400 sm:text-xs">Below {riskThreshold}%</div>
            <div className={`mt-1 font-display text-2xl font-extrabold tabular-nums sm:text-3xl ${atRiskCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}><AnimatedNumber value={atRiskCount} /></div>
          </div>
          <div className="panel p-3 sm:p-5">
            <div className="text-[11px] font-bold text-gray-600 dark:text-gray-400 sm:text-xs">Incomplete</div>
            <div className="mt-1 font-display text-2xl font-extrabold tabular-nums text-gray-900 dark:text-white sm:text-3xl"><AnimatedNumber value={incompleteCount} /></div>
          </div>
        </div>

        <details className="group panel-soft mt-3 [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex min-h-[48px] items-center justify-between gap-3 px-4 text-sm font-bold text-gray-900 dark:text-white">
            <span>Date range &amp; at-risk threshold{(fromDate || toDate) && <span className="ml-2 rounded-full bg-[#b9ff66] px-2 py-0.5 text-[11px] text-black">Filtered</span>}</span>
            <ChevronDown size={18} className="flex-none transition-transform group-open:rotate-180" />
          </summary>
          <div className="grid gap-4 border-t border-black/10 px-4 pb-4 pt-4 dark:border-white/10 lg:grid-cols-[minmax(0,1fr)_minmax(250px,0.5fr)]">
            <section aria-labelledby="history-date-range" className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h2 id="history-date-range" className="text-sm font-extrabold text-gray-900 dark:text-white">Date range</h2>
                {(fromDate || toDate) && <button type="button" className="text-xs font-bold text-gray-700 underline underline-offset-4 hover:text-black dark:text-gray-300 dark:hover:text-white" onClick={() => { setFromDate(''); setToDate(''); }}>Show all dates</button>}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="min-w-0"><span className="label">From</span>
                  <input type="date" max={toDate || undefined} value={fromDate} onChange={event => setFromDate(event.target.value)} className="field date-input px-3" />
                </label>
                <label className="min-w-0"><span className="label">To</span>
                  <input type="date" min={fromDate || undefined} value={toDate} onChange={event => setToDate(event.target.value)} className="field date-input px-3" />
                </label>
              </div>
            </section>
            <section aria-labelledby="history-risk-setting" className="min-w-0">
              <h2 id="history-risk-setting" className="mb-2 text-sm font-extrabold text-gray-900 dark:text-white">Flag students below</h2>
              <form onSubmit={handleSaveThreshold} className="flex items-end gap-2">
                <label className="relative min-w-0 flex-1">
                  <span className="sr-only">At-risk threshold percent</span>
                  <input type="number" inputMode="numeric" min="1" max="100" required value={thresholdInput} onChange={event => setThresholdInput(event.target.value)} className="field pr-9" />
                  <span aria-hidden="true" className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-500">%</span>
                </label>
                <button type="submit" disabled={savingThreshold || Number(thresholdInput) === riskThreshold} className="btn-primary">Save</button>
              </form>
            </section>
            <p className="text-xs text-gray-600 dark:text-gray-400 lg:col-span-2">Percentages count recorded marks only. “Incomplete” means some students on the roster weren’t marked that day.</p>
          </div>
        </details>

        {/* Analytics Section */}
        <div className="mt-8 mb-6">
          <h2 className="mb-3 text-lg font-extrabold text-gray-900 dark:text-white">Trends</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* Chart 1: Trend */}
            <div className="panel p-4 sm:p-6">
              <h3 className="mb-4 text-sm font-extrabold text-gray-900 dark:text-white">Attendance by class</h3>
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
                      isAnimationActive={!prefersReducedMotion}
                      dot={{ fill: '#b9ff66', stroke: '#000', strokeWidth: 2, r: 4 }} 
                      activeDot={{ r: 6, fill: '#b9ff66', stroke: '#000', strokeWidth: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Chart 2: Distribution */}
            <div className="panel p-4 sm:p-6">
              <h3 className="mb-4 text-sm font-extrabold text-gray-900 dark:text-white">Lowest attendance</h3>
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
                    <Bar dataKey="percentage" radius={[0, 6, 6, 0]} isAnimationActive={!prefersReducedMotion}>
                      {
                        studentChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.atRisk ? '#f87171' : '#b9ff66'} />
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
        <h2 className="mb-3 mt-8 text-lg font-extrabold text-gray-900 dark:text-white">
          Classes
        </h2>
        {datesList.length === 0 ? (
          <div className="panel-soft px-4 py-8 text-center text-sm font-semibold text-gray-600 dark:text-gray-400">
            {fromDate || toDate ? 'No classes in this date range.' : 'No classes recorded yet. Take a roll call and it will show up here.'}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {datesList.map((date, index) => {
              const stats = dateRecordsMap[date];
              const total = stats.present + stats.absent;
              const pct = total > 0 ? Math.round((stats.present / total) * 100) : 0;
              const good = total > 0 && stats.present / total >= riskThreshold / 100;
              const unmarked = Math.max(0, rosterSizeOn(date) - total);

              return (
                <motion.div
                  layout
                  key={date}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -16, scale: 0.98 }}
                  transition={{ delay: Math.min(index * 0.015, 0.18), duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                  className="relative rounded-2xl border-2 border-black/80 bg-white py-3 pl-4 pr-3 dark:border-white/60 dark:bg-[#111]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <button onClick={() => navigate(`/courses/${courseId}/attendance?date=${date}`)}
                      aria-label={`Open roll call for ${formatDate(date)}`}
                      className="min-w-0 flex-1 text-left">
                      <span className="block truncate text-[15px] font-bold text-gray-900 underline-offset-4 hover:underline dark:text-white">
                        {formatDate(date)}
                      </span>
                      <span className="mt-0.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
                        {stats.present} present · {stats.absent} absent{unmarked > 0 && <span className="text-amber-700 dark:text-amber-400"> · {unmarked} unmarked</span>}
                      </span>
                    </button>
                    <div className="flex shrink-0 items-center gap-1">
                      <AnimatePresence mode="popLayout">
                        {confirmDeleteDate === date && !isMobile ? (
                          <motion.div 
                            key="confirm"
                            initial={{ opacity: 0, scale: 0.8, x: 20 }}
                            animate={{ opacity: 1, scale: 1, x: 0 }}
                            exit={{ opacity: 0, scale: 0.8, x: 20 }}
                            transition={{ duration: 0.2 }}
                            className="flex items-center gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              onClick={(e) => { e.stopPropagation(); setConfirmDeleteDate(null); }}
                              disabled={deleteLoading}
                              className="btn-quiet min-h-[36px] px-2.5 text-xs"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={(e) => handleDeleteDate(e, date)}
                              disabled={deleteLoading}
                              aria-label={`Clear attendance for ${formatDate(date)}`}
                              className="btn-danger min-h-[36px] px-2.5 text-xs"
                            >
                              {deleteLoading ? 'Clearing…' : 'Clear day'}
                            </button>
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
                            aria-label={`Clear attendance for ${formatDate(date)}`}
                            className="flex h-10 w-10 flex-none items-center justify-center rounded-xl text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-gray-400 dark:hover:bg-red-950/50 dark:hover:text-red-400"
                            title="Clear this day"
                          >
                            <Trash2 size={17} />
                          </motion.button>
                        )}
                      </AnimatePresence>

                      <button
                        onClick={(e) => toggleDateRow(e, date)}
                        aria-label={`${expandedDates.has(date) ? 'Hide' : 'Show'} attendance bar for ${formatDate(date)}`}
                        aria-expanded={expandedDates.has(date)}
                        className="hidden h-10 w-10 flex-none items-center justify-center rounded-xl text-gray-500 transition-colors hover:bg-black/5 hover:text-black dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white sm:flex"
                        title="Show attendance bar"
                      >
                        <BarChart2 size={17} />
                      </button>

                      <div className={`flex h-9 w-[58px] flex-none items-center justify-center rounded-xl border-2 text-sm font-extrabold tabular-nums ${good ? 'border-black bg-[#b9ff66] text-black' : 'border-red-400 bg-red-50 text-red-700 dark:border-red-500/60 dark:bg-red-950/40 dark:text-red-300'}`}>
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
        <h2 className="mb-3 mt-8 text-lg font-extrabold text-gray-900 dark:text-white">
          Students
        </h2>
        <label className="relative mb-3 block">
          <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="search"
            aria-label="Search students in history"
            placeholder="Search name or reg no."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="field pl-10"
          />
        </label>

        {filteredStudents.length === 0 ? (
          <div className="panel-soft px-4 py-8 text-center text-sm font-semibold text-gray-600 dark:text-gray-400">No students match your search.</div>
        ) : (
          <div className="grid gap-2">
            {filteredStudents.map((student, index) => {
              const good = !student.atRisk && student.totalRecords > 0;

              return (
                <motion.div
                  key={student.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(index * 0.015, 0.18) }}
                  className="panel-soft flex min-w-0 flex-wrap items-center justify-between gap-3 py-3 pl-4 pr-3"
                >
                  <button type="button" onClick={() => setExpandedStudentId(current => current === student.id ? null : student.id)}
                    aria-expanded={expandedStudentId === student.id} aria-controls={`student-history-${student.id}`}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left">
                    <ChevronDown size={16} aria-hidden="true" className={`flex-none text-gray-500 transition-transform ${expandedStudentId === student.id ? 'rotate-180' : ''}`} />
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-bold text-gray-900 dark:text-white">
                        {student.name}
                        {student.archived_at && <span className="ml-2 rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-bold text-gray-600 dark:bg-white/10 dark:text-gray-300">Archived</span>}
                      </span>
                      <span className="block truncate text-xs tabular-nums text-gray-600 dark:text-gray-400">{student.reg_number} · {student.present}/{student.totalRecords} present</span>
                    </span>
                  </button>
                  
                  <div className="hidden sm:block">
                    <div className="w-32 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${student.percentage}%` }}
                        transition={{ duration: 0.6, delay: Math.min(index * 0.04, 0.2), ease: [0.22, 1, 0.36, 1] }}
                        className={`h-full ${good ? 'bg-[#b9ff66]' : 'bg-red-400'}`}
                      />
                    </div>
                  </div>

                  <div className={`flex h-9 min-w-[58px] shrink-0 items-center justify-center rounded-xl border-2 px-2 text-sm font-extrabold tabular-nums ${student.totalRecords === 0 ? 'border-transparent bg-black/5 text-xs text-gray-600 dark:bg-white/10 dark:text-gray-300' : good ? 'border-black bg-[#b9ff66] text-black' : 'border-red-400 bg-red-50 text-red-700 dark:border-red-500/60 dark:bg-red-950/40 dark:text-red-300'}`}>
                    {student.totalRecords ? `${student.percentage}%` : 'No marks'}
                  </div>
                  {expandedStudentId === student.id && (
                    <div id={`student-history-${student.id}`} className="w-full max-h-64 overflow-y-auto border-t border-black/10 pt-2 dark:border-white/10">
                      {datesList.length === 0 ? <p className="text-sm text-gray-600 dark:text-gray-300">No sessions in this range.</p> :
                        datesList.map(date => {
                          const mark = attendanceRecords.find(record => record.student_id === student.id && record.date === date);
                          return <div key={date} className="flex justify-between gap-3 py-1 text-sm">
                            <span className="text-gray-600 dark:text-gray-300">{formatDate(date)}</span>
                            <span className={`font-bold ${mark?.status === 'present' ? 'text-green-700 dark:text-[#b9ff66]' : mark?.status === 'absent' ? 'text-red-600' : 'text-gray-500'}`}>
                              {mark?.status === 'present' ? 'Present' : mark?.status === 'absent' ? 'Absent' : 'Unmarked'}
                            </span>
                          </div>;
                        })}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        )}

      </motion.div>
        )}
      </AnimatePresence>

      {/* ── Mobile Modals & Toasts ─────────────────────────────────── */}
      <AnimatePresence>
        {mobileDeleteDate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMobileDeleteDate(null)}
            className="sheet-backdrop"
          >
            <motion.div
              ref={deleteDateDialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-date-dialog-title"
              tabIndex={-1}
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="sheet"
            >
              <div className="sheet-handle" />
              <h3 id="delete-date-dialog-title" className="text-xl font-extrabold text-gray-900 dark:text-white">
                Clear {formatDate(mobileDeleteDate)}?
              </h3>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                Every present and absent mark for this day will be deleted. This can’t be undone.
              </p>
              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row">
                <button onClick={() => setMobileDeleteDate(null)} disabled={deleteLoading} className="btn-secondary flex-1">
                  Keep it
                </button>
                <button
                  onClick={(e) => {
                    handleDeleteDate(e, mobileDeleteDate).then(() => setMobileDeleteDate(null));
                  }}
                  disabled={deleteLoading}
                  className="btn-danger flex-1"
                >
                  <Trash2 size={16} /> {deleteLoading ? 'Clearing…' : 'Clear day'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showToast && (
          <motion.div
            role="status"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-4 right-4 z-50 flex items-center gap-2 rounded-xl border-2 border-black bg-[#b9ff66] px-4 py-3 text-sm font-bold text-black md:bottom-6 md:left-auto md:right-6"
          >
            <Check size={16} strokeWidth={3} /> {toastMessage}
          </motion.div>
        )}
      </AnimatePresence>

    </Layout>
  );
}
