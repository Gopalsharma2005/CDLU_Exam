import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard, Building2, Users, BookOpen, HelpCircle,
  Activity, Award, FileSpreadsheet, Download, Plus, Search,
  Filter, CheckCircle2, XCircle, AlertTriangle, Clock, Lock,
  Unlock, RefreshCw, Eye, Trash2, Edit, Save, School, ChevronRight
} from 'lucide-react';
import AnswerSheetModal from './AnswerSheetModal';
import { apiFetch } from '../api';

const toLocalDateTimeInput = (date) => {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
};

export default function AdminPortal({ user }) {
  const isSuper = user.role === 'super_admin';
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' | 'colleges' | 'students' | 'exams' | 'questions' | 'monitoring' | 'results' | 'reports'

  // Global state
  const [stats, setStats] = useState(null);
  const [colleges, setColleges] = useState([]);
  const [students, setStudents] = useState([]);
  const [exams, setExams] = useState([]);
  const [results, setResults] = useState([]);
  const [liveAttempts, setLiveAttempts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState({ text: '', type: '' });

  // Modals & sub-selections
  const [reviewAttemptId, setReviewAttemptId] = useState(null);
  const [selectedExamForQuestions, setSelectedExamForQuestions] = useState(null);
  const [examQuestions, setExamQuestions] = useState([]);

  // Create Modals
  const [showAddCollegeModal, setShowAddCollegeModal] = useState(false);
  const [showAddStudentModal, setShowAddStudentModal] = useState(false);
  const [showCreateExamModal, setShowCreateExamModal] = useState(false);
  const [showAddQuestionModal, setShowAddQuestionModal] = useState(false);

  // Forms
  const [newCollege, setNewCollege] = useState({ code: '', name: '', city: 'Sirsa', email: '', phone: '', adminEmail: '', adminPassword: '' });
  const [newStudent, setNewStudent] = useState({ student_id: '', name: '', email: '', phone: '', college_id: user.college_id || '', course: 'BCA', semester: '4th Semester', password: 'Student@123' });
  const [newExam, setNewExam] = useState({
    code: '',
    title: '',
    subject: 'Computer Applications',
    course: 'BCA',
    semester: '4th Semester',
    duration_minutes: 30,
    total_marks: 50,
    passing_marks: 20,
    college_id: '',
    start_window: '',
    end_window: ''
  });
  const [newQuestion, setNewQuestion] = useState({ question_text: '', option_a: '', option_b: '', option_c: '', option_d: '', correct_option: 'A', marks: 2, explanation: '' });

  // Filters for results & students
  const [resultFilterCollege, setResultFilterCollege] = useState('');
  const [resultFilterExam, setResultFilterExam] = useState('');
  const [resultSearch, setResultSearch] = useState('');
  const [studentSearch, setStudentSearch] = useState('');

  // Auto-clear notification
  const notify = (text, type = 'success') => {
    setActionMessage({ text, type });
    setTimeout(() => setActionMessage({ text: '', type: '' }), 4000);
  };

  // Fetch Dashboard Stats
  const fetchDashboardStats = async () => {
    try {
      const res = await apiFetch('/api/dashboard/stats', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('cdlu_token')}` }
      });
      const data = await res.json();
      if (res.ok) setStats(data);
    } catch (e) {
      console.error(e);
    }
  };

  // Fetch Colleges
  const fetchColleges = async () => {
    try {
      const res = await apiFetch('/api/colleges', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('cdlu_token')}` }
      });
      const data = await res.json();
      if (res.ok) setColleges(data.colleges || []);
    } catch (e) {
      console.error(e);
    }
  };

  // Fetch Students
  const fetchStudents = async () => {
    try {
      const params = new URLSearchParams();
      if (studentSearch) params.append('search', studentSearch);
      const res = await apiFetch(`/api/students?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('cdlu_token')}` }
      });
      const data = await res.json();
      if (res.ok) setStudents(data.students || []);
    } catch (e) {
      console.error(e);
    }
  };

  // Fetch Exams
  const fetchExams = async () => {
    try {
      const res = await apiFetch('/api/exams', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('cdlu_token')}` }
      });
      const data = await res.json();
      if (res.ok) {
        setExams(data.exams || []);
        if (!selectedExamForQuestions && data.exams?.length > 0) {
          setSelectedExamForQuestions(data.exams[0].id);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Fetch Questions for selected exam
  const fetchQuestions = async (examId) => {
    if (!examId) return;
    try {
      const res = await apiFetch(`/api/exams/${examId}/questions`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('cdlu_token')}` }
      });
      const data = await res.json();
      if (res.ok) setExamQuestions(data.questions || []);
    } catch (e) {
      console.error(e);
    }
  };

  // Fetch Live Monitoring
  const fetchMonitoring = async () => {
    try {
      const res = await apiFetch('/api/results/monitoring/live', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('cdlu_token')}` }
      });
      const data = await res.json();
      if (res.ok) setLiveAttempts(data.liveAttempts || []);
    } catch (e) {
      console.error(e);
    }
  };

  // Fetch Results Panel
  const fetchResults = async () => {
    try {
      const params = new URLSearchParams();
      if (resultFilterCollege) params.append('college_id', resultFilterCollege);
      if (resultFilterExam) params.append('exam_id', resultFilterExam);
      if (resultSearch) params.append('search', resultSearch);

      const res = await apiFetch(`/api/results?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('cdlu_token')}` }
      });
      const data = await res.json();
      if (res.ok) setResults(data.results || []);
    } catch (e) {
      console.error(e);
    }
  };

  // Initial load
  useEffect(() => {
    fetchDashboardStats();
    fetchColleges();
    fetchExams();
    fetchStudents();
    fetchResults();
    fetchMonitoring();
  }, []);

  // Sync tab specific data
  useEffect(() => {
    if (activeTab === 'dashboard') fetchDashboardStats();
    if (activeTab === 'colleges') fetchColleges();
    if (activeTab === 'students') fetchStudents();
    if (activeTab === 'exams') fetchExams();
    if (activeTab === 'questions' && selectedExamForQuestions) fetchQuestions(selectedExamForQuestions);
    if (activeTab === 'monitoring') fetchMonitoring();
    if (activeTab === 'results' || activeTab === 'reports') fetchResults();
  }, [activeTab, selectedExamForQuestions]);

  // Periodic refresh for Live Monitoring
  useEffect(() => {
    if (activeTab !== 'monitoring') return;
    const interval = setInterval(fetchMonitoring, 5000);
    return () => clearInterval(interval);
  }, [activeTab]);

  // Handlers
  const handleCreateCollege = async (e) => {
    e.preventDefault();
    try {
      const res = await apiFetch('/api/colleges', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('cdlu_token')}`
        },
        body: JSON.stringify(newCollege)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add college');
      notify('College and admin credentials added successfully!');
      setShowAddCollegeModal(false);
      setNewCollege({ code: '', name: '', city: 'Sirsa', email: '', phone: '', adminEmail: '', adminPassword: '' });
      fetchColleges();
      fetchDashboardStats();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const handleCreateStudent = async (e) => {
    e.preventDefault();
    try {
      const res = await apiFetch('/api/students', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('cdlu_token')}`
        },
        body: JSON.stringify(newStudent)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add student');
      notify(`Student ${newStudent.student_id} registered successfully!`);
      setShowAddStudentModal(false);
      setNewStudent({ student_id: '', name: '', email: '', phone: '', college_id: user.college_id || '', course: 'BCA', semester: '4th Semester', password: 'Student@123' });
      fetchStudents();
      fetchDashboardStats();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const handleCreateExam = async (e) => {
    e.preventDefault();
    try {
      const res = await apiFetch('/api/exams', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('cdlu_token')}`
        },
        body: JSON.stringify({
          ...newExam,
          start_window: new Date(newExam.start_window).toISOString(),
          end_window: new Date(newExam.end_window).toISOString()
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create exam');
      notify('Examination created and scheduled!');
      setShowCreateExamModal(false);
      fetchExams();
      fetchDashboardStats();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const handleOpenCreateExam = () => {
    const now = new Date();
    setNewExam((current) => ({
      ...current,
      start_window: toLocalDateTimeInput(now),
      end_window: toLocalDateTimeInput(new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000))
    }));
    setShowCreateExamModal(true);
  };

  const handleToggleStudentStatus = async (student) => {
    const nextStatus = student.status === 'active' ? 'deactivated' : 'active';
    try {
      const res = await apiFetch(`/api/students/${student.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `******'cdlu_token')}`
        },
        body: JSON.stringify({ status: nextStatus })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update student account.');
      notify(`Student account ${nextStatus === 'active' ? 'activated' : 'deactivated'}.`);
      fetchStudents();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const handleAddQuestion = async (e) => {
    e.preventDefault();
    if (!selectedExamForQuestions) return;
    try {
      const res = await apiFetch(`/api/exams/${selectedExamForQuestions}/questions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('cdlu_token')}`
        },
        body: JSON.stringify(newQuestion)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add question');
      notify('MCQ question added to Question Bank!');
      setShowAddQuestionModal(false);
      setNewQuestion({ question_text: '', option_a: '', option_b: '', option_c: '', option_d: '', correct_option: 'A', marks: 2, explanation: '' });
      fetchQuestions(selectedExamForQuestions);
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const handleUnlockStudentExam = async (studentId, studentRoll, examId) => {
    if (!confirm(`Are you sure you want to UNLOCK the exam attempt for ${studentRoll}? This will clear their locked status and permit them to start fresh.`)) {
      return;
    }
    try {
      const res = await apiFetch(`/api/students/${studentId}/unlock-exam/${examId || exams[0]?.id}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('cdlu_token')}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to unlock');
      notify(data.message);
      fetchStudents();
      fetchResults();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const handleDownloadCSV = () => {
    const params = new URLSearchParams();
    if (resultFilterCollege) params.append('college_id', resultFilterCollege);
    if (resultFilterExam) params.append('exam_id', resultFilterExam);

    const downloadUrl = `/api/results/export-csv?${params.toString()}`;
    window.open(downloadUrl, '_blank');
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      
      {/* Action Notification */}
      {actionMessage.text && (
        <div className={`p-4 rounded-2xl mb-4 text-xs font-bold flex items-center justify-between border shadow-sm transition-all animate-scale-up ${
          actionMessage.type === 'error'
            ? 'bg-red-50 text-red-700 border-red-200'
            : 'bg-green-50 text-green-800 border-green-200'
        }`}>
          <span>{actionMessage.text}</span>
          <button onClick={() => setActionMessage({ text: '', type: '' })} className="cursor-pointer">✕</button>
        </div>
      )}

      {/* TOP ROLE & CONTEXT BAR */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 mb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full ${
              isSuper ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'
            }`}>
              {isSuper ? 'University Super Admin Panel' : 'College Admin Panel'}
            </span>
            <span className="text-xs text-slate-400">• Authorized Access Only</span>
          </div>
          <h2 className="text-xl font-black text-slate-900 mt-1">
            {isSuper ? 'CDLU Central Examination Management System' : `${user.college_name || 'College'} Examination Administration`}
          </h2>
          <p className="text-xs text-slate-500">
            {isSuper
              ? 'Complete centralized control of all colleges, exams, question bank, live monitoring and locked results.'
              : 'Scoped access to college student records, assigned exams, and student result reports.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloadCSV}
            className="px-3.5 py-2 rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* ADMIN TABS NAVIGATION (Matches User's Required Modules) */}
      <div className="flex flex-wrap items-center gap-1.5 pb-2 mb-6 border-b border-slate-200">
        {[
          { id: 'dashboard', label: 'University Dashboard', icon: LayoutDashboard },
          ...(isSuper ? [{ id: 'colleges', label: 'College Management', icon: Building2 }] : []),
          { id: 'students', label: 'Student Management', icon: Users },
          ...(isSuper ? [{ id: 'exams', label: 'Exam Management', icon: BookOpen }] : []),
          ...(isSuper ? [{ id: 'questions', label: 'Question Bank', icon: HelpCircle }] : []),
          { id: 'monitoring', label: 'Exam Monitoring (Live)', icon: Activity },
          { id: 'results', label: 'Result Management (Admin Panel)', icon: Award },
          { id: 'reports', label: 'Reports & Analytics', icon: FileSpreadsheet }
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                isActive
                  ? 'bg-slate-900 text-sky-400 shadow-sm'
                  : 'bg-white text-slate-600 hover:bg-sky-50 border border-slate-200/80'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-sky-400' : 'text-slate-400'}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* =========================================================================
          MODULE 1: UNIVERSITY DASHBOARD
         ========================================================================= */}
      {activeTab === 'dashboard' && stats && (
        <div className="space-y-6">
          {/* KPI Cards Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            
            {isSuper && (
              <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-xs font-bold uppercase tracking-wider">Affiliated Colleges</span>
                  <Building2 className="w-5 h-5 text-sky-600" />
                </div>
                <div className="text-2xl sm:text-3xl font-black text-slate-900 mt-2">
                  {stats.stats.totalColleges}
                </div>
                <p className="text-[11px] text-slate-500 mt-1">Sirsa district colleges</p>
              </div>
            )}

            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-xs font-bold uppercase tracking-wider">Total Students</span>
                <Users className="w-5 h-5 text-blue-600" />
              </div>
              <div className="text-2xl sm:text-3xl font-black text-slate-900 mt-2">
                {stats.stats.totalStudents}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">Registered for online exams</p>
            </div>

            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-xs font-bold uppercase tracking-wider">Live Ongoing Exams</span>
                <Activity className="w-5 h-5 text-green-600 animate-pulse" />
              </div>
              <div className="text-2xl sm:text-3xl font-black text-green-600 mt-2">
                {stats.stats.liveAttempts}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">Active 30-min student sessions</p>
            </div>

            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-xs font-bold uppercase tracking-wider">Completed & Locked</span>
                <Lock className="w-5 h-5 text-indigo-600" />
              </div>
              <div className="text-2xl sm:text-3xl font-black text-indigo-600 mt-2">
                {stats.stats.completedAttempts}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">Pass Rate: <strong>{stats.stats.passRate}%</strong></p>
            </div>

          </div>

          {/* College Distribution & Activity Logs */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* College-wise summary */}
            <div className="lg:col-span-2 bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-slate-900 text-sm">College-wise Online Exam Distribution</h3>
                <span className="text-xs text-slate-400">Live Enrollment</span>
              </div>

              <div className="space-y-3">
                {stats.collegeBreakdown?.map((c) => (
                  <div key={c.id} className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-xs text-slate-800">{c.name}</span>
                      <div className="text-[10px] text-slate-500 mt-0.5">Code: {c.code} • City: {c.city}</div>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-black text-slate-900">{c.student_count} Students</span>
                      <div className="text-[10px] text-green-600 font-semibold">{c.attempts_count} Attempts ({c.passed_count} Passed)</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Submissions */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-slate-900 text-sm">Recent Exam Attempts</h3>
                <span className="text-xs text-slate-400">Locked</span>
              </div>

              <div className="space-y-2.5">
                {stats.recentAttempts?.map((a) => (
                  <div key={a.id} className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                    <div className="flex justify-between font-bold text-slate-800">
                      <span>{a.student_name}</span>
                      <span className="text-sky-600">{a.total_marks_obtained} Pts</span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5 flex justify-between">
                      <span className="truncate max-w-[140px]">{a.exam_name}</span>
                      <span className="text-slate-400">{a.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* =========================================================================
          MODULE 2: COLLEGE MANAGEMENT (University Super Admin)
         ========================================================================= */}
      {activeTab === 'colleges' && isSuper && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900">Affiliated Colleges & Exam Centers</h3>
              <p className="text-xs text-slate-500">Manage participating colleges and center credentials</p>
            </div>
            <button
              onClick={() => setShowAddCollegeModal(true)}
              className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <Plus className="w-4 h-4 text-sky-400" />
              <span>Add College</span>
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase border-b border-slate-200">
                  <tr>
                    <th className="p-3.5">Code</th>
                    <th className="p-3.5">College Name</th>
                    <th className="p-3.5">City & State</th>
                    <th className="p-3.5">Contact</th>
                    <th className="p-3.5 text-center">Enrolled Students</th>
                    <th className="p-3.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {colleges.map((col) => (
                    <tr key={col.id} className="hover:bg-slate-50/80 transition">
                      <td className="p-3.5 font-mono font-bold text-sky-700">{col.code}</td>
                      <td className="p-3.5 font-bold text-slate-900">{col.name}</td>
                      <td className="p-3.5 text-slate-600">{col.city}, {col.state}</td>
                      <td className="p-3.5 text-slate-500">
                        <div>{col.email || 'N/A'}</div>
                        <div className="text-[10px] text-slate-400">{col.phone}</div>
                      </td>
                      <td className="p-3.5 text-center font-bold text-slate-800">{col.student_count || 0}</td>
                      <td className="p-3.5">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-800">
                          Active
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODULE 3: STUDENT MANAGEMENT
         ========================================================================= */}
      {activeTab === 'students' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-900">Registered Students</h3>
              <p className="text-xs text-slate-500">Manage student logins and exam permissions</p>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="Search student or roll no..."
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && fetchStudents()}
                  className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-200 rounded-xl outline-none focus:ring-1 focus:ring-sky-500"
                />
              </div>
              <button
                onClick={() => setShowAddStudentModal(true)}
                className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-sm flex-shrink-0"
              >
                <Plus className="w-4 h-4 text-sky-400" />
                <span>Add Student</span>
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase border-b border-slate-200">
                  <tr>
                    <th className="p-3.5">Student ID / Roll No</th>
                    <th className="p-3.5">Full Name</th>
                    <th className="p-3.5">College</th>
                    <th className="p-3.5">Course & Sem</th>
                    <th className="p-3.5 text-center">Attempts</th>
                    <th className="p-3.5">Status</th>
                    <th className="p-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {students.map((stu) => (
                    <tr key={stu.id} className="hover:bg-slate-50/80 transition">
                      <td className="p-3.5 font-mono font-bold text-slate-900">{stu.student_id}</td>
                      <td className="p-3.5 font-bold text-slate-800">{stu.name}</td>
                      <td className="p-3.5 text-slate-600 truncate max-w-[180px]">{stu.college_name || 'CDLU Campus'}</td>
                      <td className="p-3.5 text-slate-600">{stu.course} ({stu.semester})</td>
                      <td className="p-3.5 text-center font-bold text-slate-800">{stu.attempts_count || 0}</td>
                      <td className="p-3.5">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-800">
                          {stu.status}
                        </span>
                      </td>
                      <td className="p-3.5 text-right">
                        <div className="flex flex-col items-end gap-1.5">
                          <button
                            onClick={() => handleToggleStudentStatus(stu)}
                            className={`px-2 py-1 rounded border text-[10px] font-bold cursor-pointer ${
                              stu.status === 'active'
                                ? 'bg-slate-50 hover:bg-sky-50 text-slate-700 border-slate-300'
                                : 'bg-green-50 hover:bg-green-100 text-green-800 border-green-300'
                            }`}
                          >
                            {stu.status === 'active' ? 'Deactivate Account' : 'Activate Account'}
                          </button>
                          <button
                            onClick={() => handleUnlockStudentExam(stu.id, stu.student_id)}
                            className="px-2 py-1 rounded bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-300 text-[10px] font-bold cursor-pointer"
                            title="Clear lock and permit fresh attempt"
                          >
                            Unlock Attempt
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODULE 4: EXAM MANAGEMENT (University Super Admin)
         ========================================================================= */}
      {activeTab === 'exams' && isSuper && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900">Examination Schedule & Papers</h3>
              <p className="text-xs text-slate-500">Configure 30-minute exam papers and course assignments</p>
            </div>
            <button
              onClick={handleOpenCreateExam}
              className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <Plus className="w-4 h-4 text-sky-400" />
              <span>Create Exam Paper</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {exams.map((exam) => (
              <div key={exam.id} className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="font-mono font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded">
                      {exam.code}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      exam.is_active ? 'bg-green-100 text-green-800' : 'bg-sky-50 text-slate-600'
                    }`}>
                      {exam.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  <h4 className="font-bold text-slate-900 text-sm leading-snug">{exam.title}</h4>
                  <p className="text-xs text-slate-500 mt-1">Course: {exam.course} • {exam.semester}</p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Opens: {new Date(exam.start_window).toLocaleString()}<br />
                    Closes: {new Date(exam.end_window).toLocaleString()}
                  </p>

                  <div className="grid grid-cols-3 gap-2 my-3 p-2 rounded-xl bg-slate-50 border border-slate-100 text-center text-xs">
                    <div>
                      <div className="text-[10px] text-slate-400">Duration</div>
                      <div className="font-bold text-slate-800">{exam.duration_minutes} Mins</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400">Questions</div>
                      <div className="font-bold text-slate-800">{exam.question_count || 0}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400">Total Marks</div>
                      <div className="font-bold text-slate-800">{exam.total_marks}</div>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[10px] text-slate-400">
                    College: {exam.college_name || 'All Colleges'}
                  </span>
                  <button
                    onClick={() => {
                      setSelectedExamForQuestions(exam.id);
                      setActiveTab('questions');
                    }}
                    className="text-xs font-bold text-sky-700 hover:text-sky-800 flex items-center gap-1 cursor-pointer"
                  >
                    <span>Question Bank</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const res = await apiFetch(`/api/exams/${exam.id}`, {
                        method: 'PUT',
                        headers: {
                          'Content-Type': 'application/json',
                          'Authorization': `******'cdlu_token')}`
                        },
                        body: JSON.stringify({ is_active: exam.is_active ? 0 : 1 })
                      });
                      const data = await res.json();
                      if (!res.ok) throw new Error(data.error || 'Failed to update exam status');
                      notify(`Exam ${exam.is_active ? 'deactivated' : 'activated'} successfully.`);
                      fetchExams();
                    } catch (err) {
                      notify(err.message, 'error');
                    }
                  }}
                  className="mt-3 w-full py-2 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  {exam.is_active ? 'Deactivate Exam' : 'Activate Exam'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* =========================================================================
          MODULE 5: QUESTION BANK
         ========================================================================= */}
      {activeTab === 'questions' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-900">University Question Bank (MCQs)</h3>
              <p className="text-xs text-slate-500">Manage multiple-choice questions, options, and keys</p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={selectedExamForQuestions || ''}
                onChange={(e) => {
                  setSelectedExamForQuestions(e.target.value);
                  fetchQuestions(e.target.value);
                }}
                className="text-xs bg-white border border-slate-200 rounded-xl px-3 py-2 font-bold text-slate-800 outline-none"
              >
                {exams.map(e => (
                  <option key={e.id} value={e.id}>{e.code} - {e.title}</option>
                ))}
              </select>
              <button
                onClick={() => setShowAddQuestionModal(true)}
                className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <Plus className="w-4 h-4 text-sky-400" />
                <span>Add MCQ</span>
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {examQuestions.map((q, idx) => (
              <div key={q.id} className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs text-xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-slate-900">
                    Q{idx + 1}. {q.question_text}
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-800">
                    Key: Option {q.correct_option} (+{q.marks} Marks)
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 my-2">
                  <div className={`p-2 rounded-lg border ${q.correct_option === 'A' ? 'bg-green-50 border-green-300 font-bold text-green-900' : 'bg-slate-50 border-slate-200 text-slate-700'}`}>
                    A. {q.option_a}
                  </div>
                  <div className={`p-2 rounded-lg border ${q.correct_option === 'B' ? 'bg-green-50 border-green-300 font-bold text-green-900' : 'bg-slate-50 border-slate-200 text-slate-700'}`}>
                    B. {q.option_b}
                  </div>
                  <div className={`p-2 rounded-lg border ${q.correct_option === 'C' ? 'bg-green-50 border-green-300 font-bold text-green-900' : 'bg-slate-50 border-slate-200 text-slate-700'}`}>
                    C. {q.option_c}
                  </div>
                  <div className={`p-2 rounded-lg border ${q.correct_option === 'D' ? 'bg-green-50 border-green-300 font-bold text-green-900' : 'bg-slate-50 border-slate-200 text-slate-700'}`}>
                    D. {q.option_d}
                  </div>
                </div>

                {q.explanation && (
                  <p className="text-[11px] text-slate-500 italic mt-1">
                    <strong>Note:</strong> {q.explanation}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* =========================================================================
          MODULE 6: EXAM MONITORING (Live Attempts)
         ========================================================================= */}
      {activeTab === 'monitoring' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500 animate-ping"></span>
                <h3 className="text-base font-bold text-slate-900">Live Exam Session Monitoring</h3>
              </div>
              <p className="text-xs text-slate-500">Real-time status of student 30-minute exam attempts</p>
            </div>
            <button
              onClick={fetchMonitoring}
              className="p-2 text-slate-600 hover:text-slate-900 hover:bg-sky-50 rounded-xl transition cursor-pointer text-xs font-bold flex items-center gap-1"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh Now</span>
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase border-b border-slate-200">
                  <tr>
                    <th className="p-3.5">Student</th>
                    <th className="p-3.5">College</th>
                    <th className="p-3.5">Exam</th>
                    <th className="p-3.5 text-center">Progress</th>
                    <th className="p-3.5 text-center">Server Timer Remaining</th>
                    <th className="p-3.5 text-center">Attempt Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {liveAttempts.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-500">
                        No active exam sessions in progress right now.
                      </td>
                    </tr>
                  ) : (
                    liveAttempts.map((item) => (
                      <tr key={item.attempt_id} className="hover:bg-slate-50/80 transition">
                        <td className="p-3.5">
                          <div className="font-bold text-slate-900">{item.student_name}</div>
                          <div className="font-mono text-[10px] text-slate-400">{item.student_roll_no}</div>
                        </td>
                        <td className="p-3.5 text-slate-600 truncate max-w-[160px]">{item.college_name}</td>
                        <td className="p-3.5 text-slate-800 font-medium truncate max-w-[180px]">{item.exam_name}</td>
                        <td className="p-3.5 text-center">
                          <div className="font-bold text-slate-900">{item.answered_count} / {item.total_questions} answered</div>
                          <div className="w-24 bg-slate-200 h-1.5 rounded-full mx-auto mt-1">
                            <div className="bg-sky-500 h-1.5 rounded-full" style={{ width: `${item.progress_pct}%` }}></div>
                          </div>
                        </td>
                        <td className="p-3.5 text-center">
                          {item.is_live ? (
                            <span className="font-mono font-black text-sky-600 bg-sky-50 px-2.5 py-1 rounded-lg border border-sky-200">
                              ⏱️ {item.remaining_formatted}
                            </span>
                          ) : (
                            <span className="font-mono text-slate-400">Expired</span>
                          )}
                        </td>
                        <td className="p-3.5 text-center">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                            item.is_live
                              ? 'bg-green-100 text-green-800 animate-pulse'
                              : item.status === 'auto_submitted'
                              ? 'bg-sky-100 text-sky-800'
                              : 'bg-indigo-100 text-indigo-800'
                          }`}>
                            {item.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODULE 7: RESULT MANAGEMENT (UNIVERSITY ADMIN RESULT PANEL)
         ========================================================================= */}
      {activeTab === 'results' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sky-500 font-bold">🔒</span>
                <h3 className="text-base font-bold text-slate-900">University Admin Result Panel</h3>
              </div>
              <p className="text-xs text-slate-500">Only authorized admins can view marks and results</p>
            </div>
            
            {/* Filter toolbar */}
            <div className="flex items-center gap-2 flex-wrap">
              {isSuper && (
                <select
                  value={resultFilterCollege}
                  onChange={(e) => {
                    setResultFilterCollege(e.target.value);
                    setTimeout(fetchResults, 50);
                  }}
                  className="text-xs bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 font-medium text-slate-700 outline-none"
                >
                  <option value="">All Colleges</option>
                  {colleges.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}

              <select
                value={resultFilterExam}
                onChange={(e) => {
                  setResultFilterExam(e.target.value);
                  setTimeout(fetchResults, 50);
                }}
                className="text-xs bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 font-medium text-slate-700 outline-none"
              >
                <option value="">All Exams</option>
                {exams.map(e => <option key={e.id} value={e.id}>{e.code}</option>)}
              </select>

              <button
                onClick={handleDownloadCSV}
                className="px-3 py-1.5 rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold text-xs flex items-center gap-1 cursor-pointer shadow-xs"
              >
                <Download className="w-3.5 h-3.5" />
                <span>CSV</span>
              </button>
            </div>
          </div>

          {/* Results Table (Includes all requested fields) */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase border-b border-slate-200">
                  <tr>
                    <th className="p-3.5">Student Details</th>
                    <th className="p-3.5">College</th>
                    <th className="p-3.5">Course / Sem</th>
                    <th className="p-3.5">Exam Name</th>
                    <th className="p-3.5">Start & Submit Time (IST)</th>
                    <th className="p-3.5 text-center">Questions Breakdown</th>
                    <th className="p-3.5 text-center">Total Marks</th>
                    <th className="p-3.5 text-center">Attempt Status</th>
                    <th className="p-3.5 text-center">Time Taken</th>
                    <th className="p-3.5 text-right">Answer Sheet</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {results.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="p-8 text-center text-slate-500">
                        No examination attempts recorded yet.
                      </td>
                    </tr>
                  ) : (
                    results.map((row) => (
                      <tr key={row.attempt_id} className="hover:bg-slate-50/80 transition">
                        
                        {/* 1. Student Name & ID */}
                        <td className="p-3.5">
                          <div className="font-bold text-slate-900">{row.student_name}</div>
                          <div className="font-mono text-[10px] text-sky-700 font-semibold">{row.student_id}</div>
                        </td>

                        {/* 2. College Name */}
                        <td className="p-3.5 text-slate-700 truncate max-w-[150px]">
                          {row.college_name}
                        </td>

                        {/* 3. Course and Semester */}
                        <td className="p-3.5 text-slate-600">
                          <div>{row.course}</div>
                          <div className="text-[10px] text-slate-400">{row.semester}</div>
                        </td>

                        {/* 4. Exam Name */}
                        <td className="p-3.5 text-slate-900 font-semibold truncate max-w-[180px]">
                          <div>{row.exam_name}</div>
                          <div className="text-[10px] font-mono text-slate-400">{row.exam_code}</div>
                        </td>

                        {/* 5. Start Time and Submission Time */}
                        <td className="p-3.5 text-slate-500 text-[11px]">
                          <div><strong>Start:</strong> {row.start_time_formatted}</div>
                          <div><strong>Submit:</strong> {row.submit_time_formatted}</div>
                        </td>

                        {/* 6. Questions Breakdown (Correct, Incorrect, Unanswered) */}
                        <td className="p-3.5 text-center">
                          <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-sky-50 text-[11px]">
                            <span className="text-green-700 font-bold" title="Correct">{row.correct_answers}✓</span>
                            <span>/</span>
                            <span className="text-red-600 font-bold" title="Incorrect">{row.incorrect_answers}✗</span>
                            <span>/</span>
                            <span className="text-slate-500" title="Unanswered">{row.unanswered}—</span>
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5">Total: {row.total_questions} Qs</div>
                        </td>

                        {/* 7. Total Marks */}
                        <td className="p-3.5 text-center">
                          <div className="font-black text-sm text-slate-900">
                            {row.total_marks} / {row.max_possible_marks}
                          </div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            row.is_passed ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {row.is_passed ? 'PASSED' : 'FAILED'} ({row.percentage}%)
                          </span>
                        </td>

                        {/* 8. Attempt Status */}
                        <td className="p-3.5 text-center">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                            row.status === 'auto_submitted'
                              ? 'bg-sky-100 text-sky-800'
                              : 'bg-green-100 text-green-800'
                          }`}>
                            {row.status === 'auto_submitted' ? 'Auto-Submit' : 'Submitted'}
                          </span>
                          <div className="text-[9px] text-slate-400 mt-0.5">Attempt Locked</div>
                        </td>

                        {/* 9. Time Taken */}
                        <td className="p-3.5 text-center font-bold text-slate-700">
                          {row.time_taken}
                        </td>

                        {/* 10. Actions / View Sheet */}
                        <td className="p-3.5 text-right">
                          <button
                            onClick={() => setReviewAttemptId(row.attempt_id)}
                            className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-sky-300 font-bold text-[10px] flex items-center gap-1 cursor-pointer ml-auto"
                            title="View student's question-by-question responses"
                          >
                            <Eye className="w-3 h-3" />
                            <span>Inspect</span>
                          </button>
                        </td>

                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODULE 8: REPORTS & ANALYTICS
         ========================================================================= */}
      {activeTab === 'reports' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900">College-wise Result Reports</h3>
              <p className="text-xs text-slate-500">Aggregated performance and passing rates</p>
            </div>
            <button
              onClick={handleDownloadCSV}
              className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <Download className="w-3.5 h-3.5 text-sky-400" />
              <span>Download Excel/CSV Report</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Submissions</span>
              <div className="text-3xl font-black text-slate-900 mt-1">{results.length}</div>
              <p className="text-xs text-slate-500 mt-1">Locked examination attempts</p>
            </div>
            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Passed Candidates</span>
              <div className="text-3xl font-black text-green-600 mt-1">
                {results.filter(r => r.is_passed).length}
              </div>
              <p className="text-xs text-slate-500 mt-1">Met university pass criteria</p>
            </div>
            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Auto-Submissions (Timeouts)</span>
              <div className="text-3xl font-black text-sky-600 mt-1">
                {results.filter(r => r.status === 'auto_submitted').length}
              </div>
              <p className="text-xs text-slate-500 mt-1">Finished on strict 30-min timer</p>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODALS SECTION (Add College, Add Student, Add Exam, Add Question)
         ========================================================================= */}
      
      {/* 1. Add College Modal */}
      {showAddCollegeModal && (
        <div className="fixed inset-0 z-50 bg-sky-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-3xl p-6 shadow-2xl border border-slate-200 animate-scale-up">
            <h3 className="text-lg font-black text-slate-900">Add Affiliated College</h3>
            <p className="text-xs text-slate-500 mb-4">Register college & setup college admin login</p>
            <form onSubmit={handleCreateCollege} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">College Code</label>
                <input
                  type="text"
                  placeholder="e.g. CDLU-GOV-01"
                  value={newCollege.code}
                  onChange={(e) => setNewCollege({ ...newCollege, code: e.target.value })}
                  className="w-full p-2.5 border border-slate-300 rounded-xl"
                  required
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">College Full Name</label>
                <input
                  type="text"
                  placeholder="e.g. Government PG College, Sirsa"
                  value={newCollege.name}
                  onChange={(e) => setNewCollege({ ...newCollege, name: e.target.value })}
                  className="w-full p-2.5 border border-slate-300 rounded-xl"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">City</label>
                  <input
                    type="text"
                    value={newCollege.city}
                    onChange={(e) => setNewCollege({ ...newCollege, city: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Contact Phone</label>
                  <input
                    type="text"
                    placeholder="01666-..."
                    value={newCollege.phone}
                    onChange={(e) => setNewCollege({ ...newCollege, phone: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl"
                  />
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <span className="font-bold text-slate-800 block text-[11px]">College Admin Credentials (Optional)</span>
                <input
                  type="email"
                  placeholder="admin.college@cdlu.ac.in"
                  value={newCollege.adminEmail}
                  onChange={(e) => setNewCollege({ ...newCollege, adminEmail: e.target.value })}
                  className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs"
                />
                <input
                  type="password"
                  placeholder="Password"
                  value={newCollege.adminPassword}
                  onChange={(e) => setNewCollege({ ...newCollege, adminPassword: e.target.value })}
                  className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddCollegeModal(false)}
                  className="flex-1 py-2.5 border border-slate-300 rounded-xl font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl cursor-pointer"
                >
                  Save College
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Add Student Modal */}
      {showAddStudentModal && (
        <div className="fixed inset-0 z-50 bg-sky-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-3xl p-6 shadow-2xl border border-slate-200 animate-scale-up">
            <h3 className="text-lg font-black text-slate-900">Add New Student</h3>
            <p className="text-xs text-slate-500 mb-4">Create student examination account</p>
            <form onSubmit={handleCreateStudent} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Student ID / Roll No</label>
                  <input
                    type="text"
                    placeholder="e.g. CDLU2026010"
                    value={newStudent.student_id}
                    onChange={(e) => setNewStudent({ ...newStudent, student_id: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl"
                    required
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Full Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Jaswinder Singh"
                    value={newStudent.name}
                    onChange={(e) => setNewStudent({ ...newStudent, name: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl"
                    required
                  />
                </div>
              </div>

              {isSuper && (
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Assigned College</label>
                  <select
                    value={newStudent.college_id}
                    onChange={(e) => setNewStudent({ ...newStudent, college_id: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl bg-white"
                    required
                  >
                    <option value="">Select College</option>
                    {colleges.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Course</label>
                  <input
                    type="text"
                    value={newStudent.course}
                    onChange={(e) => setNewStudent({ ...newStudent, course: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl"
                    required
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Semester</label>
                  <input
                    type="text"
                    value={newStudent.semester}
                    onChange={(e) => setNewStudent({ ...newStudent, semester: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Password</label>
                <input
                  type="text"
                  value={newStudent.password}
                  onChange={(e) => setNewStudent({ ...newStudent, password: e.target.value })}
                  className="w-full p-2.5 border border-slate-300 rounded-xl"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddStudentModal(false)}
                  className="flex-1 py-2.5 border border-slate-300 rounded-xl font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl cursor-pointer"
                >
                  Register Student
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. Create Exam Modal */}
      {showCreateExamModal && (
        <div className="fixed inset-0 z-50 bg-sky-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-3xl p-6 shadow-2xl border border-slate-200 animate-scale-up">
            <h3 className="text-lg font-black text-slate-900">Create & Schedule Exam</h3>
            <p className="text-xs text-slate-500 mb-4">Set up a 30-minute online examination</p>
            <form onSubmit={handleCreateExam} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Exam Code</label>
                  <input
                    type="text"
                    placeholder="e.g. BCA403-2026"
                    value={newExam.code}
                    onChange={(e) => setNewExam({ ...newExam, code: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl"
                    required
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Duration (Mins)</label>
                  <input
                    type="number"
                    value={newExam.duration_minutes}
                    onChange={(e) => setNewExam({ ...newExam, duration_minutes: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl font-bold text-sky-700"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Exam Title</label>
                <input
                  type="text"
                  placeholder="e.g. Software Engineering & Cloud Computing"
                  value={newExam.title}
                  onChange={(e) => setNewExam({ ...newExam, title: e.target.value })}
                  className="w-full p-2.5 border border-slate-300 rounded-xl"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Subject</label>
                  <input
                    type="text"
                    value={newExam.subject}
                    onChange={(e) => setNewExam({ ...newExam, subject: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl"
                    required
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Course</label>
                  <input
                    type="text"
                    value={newExam.course}
                    onChange={(e) => setNewExam({ ...newExam, course: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Total Marks</label>
                  <input
                    type="number"
                    value={newExam.total_marks}
                    onChange={(e) => setNewExam({ ...newExam, total_marks: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl"
                    required
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Passing Marks</label>
                  <input
                    type="number"
                    value={newExam.passing_marks}
                    onChange={(e) => setNewExam({ ...newExam, passing_marks: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Opens At</label>
                  <input
                    type="datetime-local"
                    value={newExam.start_window}
                    onChange={(e) => setNewExam({ ...newExam, start_window: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl"
                    required
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Closes At</label>
                  <input
                    type="datetime-local"
                    value={newExam.end_window}
                    onChange={(e) => setNewExam({ ...newExam, end_window: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl"
                    required
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateExamModal(false)}
                  className="flex-1 py-2.5 border border-slate-300 rounded-xl font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl cursor-pointer"
                >
                  Create Exam
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. Add Question Modal */}
      {showAddQuestionModal && (
        <div className="fixed inset-0 z-50 bg-sky-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="max-w-lg w-full bg-white rounded-3xl p-6 shadow-2xl border border-slate-200 animate-scale-up">
            <h3 className="text-lg font-black text-slate-900">Add Question to Question Bank</h3>
            <p className="text-xs text-slate-500 mb-4">Add Multiple Choice Question with official answer key</p>
            <form onSubmit={handleAddQuestion} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Question Statement</label>
                <textarea
                  placeholder="Enter the question text..."
                  value={newQuestion.question_text}
                  onChange={(e) => setNewQuestion({ ...newQuestion, question_text: e.target.value })}
                  rows={2}
                  className="w-full p-2.5 border border-slate-300 rounded-xl"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Option A</label>
                  <input
                    type="text"
                    value={newQuestion.option_a}
                    onChange={(e) => setNewQuestion({ ...newQuestion, option_a: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl"
                    required
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Option B</label>
                  <input
                    type="text"
                    value={newQuestion.option_b}
                    onChange={(e) => setNewQuestion({ ...newQuestion, option_b: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl"
                    required
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Option C</label>
                  <input
                    type="text"
                    value={newQuestion.option_c}
                    onChange={(e) => setNewQuestion({ ...newQuestion, option_c: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl"
                    required
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Option D</label>
                  <input
                    type="text"
                    value={newQuestion.option_d}
                    onChange={(e) => setNewQuestion({ ...newQuestion, option_d: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Correct Answer Key</label>
                  <select
                    value={newQuestion.correct_option}
                    onChange={(e) => setNewQuestion({ ...newQuestion, correct_option: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl font-bold text-green-700 bg-white"
                  >
                    <option value="A">Option A</option>
                    <option value="B">Option B</option>
                    <option value="C">Option C</option>
                    <option value="D">Option D</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Marks</label>
                  <input
                    type="number"
                    value={newQuestion.marks}
                    onChange={(e) => setNewQuestion({ ...newQuestion, marks: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Explanation / Hints (Optional)</label>
                <input
                  type="text"
                  placeholder="Why this answer is correct..."
                  value={newQuestion.explanation}
                  onChange={(e) => setNewQuestion({ ...newQuestion, explanation: e.target.value })}
                  className="w-full p-2.5 border border-slate-300 rounded-xl"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddQuestionModal(false)}
                  className="flex-1 py-2.5 border border-slate-300 rounded-xl font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl cursor-pointer"
                >
                  Save to Question Bank
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Answer Sheet Modal */}
      {reviewAttemptId && (
        <AnswerSheetModal
          attemptId={reviewAttemptId}
          onClose={() => setReviewAttemptId(null)}
        />
      )}

    </div>
  );
}
