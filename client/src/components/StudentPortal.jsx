import React, { useState, useEffect } from 'react';
import {
  BookOpen, Clock, AlertCircle, CheckCircle2, Lock, ArrowRight,
  ShieldAlert, School, GraduationCap, User, RefreshCw, FileText
} from 'lucide-react';
import StudentExamScreen from './StudentExamScreen';
import { apiFetch } from '../api';

export default function StudentPortal({ user, onLogout }) {
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedExam, setSelectedExam] = useState(null);
  const [instructionsAccepted, setInstructionsAccepted] = useState(false);
  const [activeExamSession, setActiveExamSession] = useState(null);

  const fetchAssignedExams = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch('/api/student/assigned-exams', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('cdlu_token')}`
        }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch assigned exams.');
      setExams(data.exams || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssignedExams();
  }, []);

  const handleOpenInstructions = (exam) => {
    if (!['READY_TO_START', 'IN_PROGRESS'].includes(exam.status)) return;
    setSelectedExam(exam);
    setInstructionsAccepted(false);
  };

  const handleStartExam = () => {
    if (!instructionsAccepted || !selectedExam) return;
    setActiveExamSession(selectedExam);
    setSelectedExam(null);
  };

  // If in an active exam session, show the exam interface
  if (activeExamSession) {
    return (
      <StudentExamScreen
        exam={activeExamSession}
        user={user}
        onLogout={onLogout}
        onExitExam={() => {
          setActiveExamSession(null);
          fetchAssignedExams();
        }}
      />
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 sm:py-8">
      
      {/* 1. STUDENT PROFILE CARD (Mobile Responsive) */}
      <div className="bg-gradient-to-r from-slate-900 to-green-950 rounded-3xl p-5 sm:p-6 text-white shadow-xl border-b-4 border-sky-500 mb-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-14 h-14 rounded-2xl bg-sky-500/20 border border-sky-400/40 flex items-center justify-center text-sky-400 font-black text-xl shadow-inner">
              <GraduationCap className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-sky-400">
                  Student Examination Desk
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/20 text-green-300 border border-green-500/40 font-bold">
                  Active Session
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white mt-0.5">
                {user.name}
              </h2>
              <p className="text-xs text-slate-300 font-mono mt-0.5">
                Roll No / ID: <span className="text-sky-300 font-bold">{user.username}</span>
              </p>
            </div>
          </div>

          <div className="w-full sm:w-auto p-3 bg-white/5 rounded-2xl border border-white/10 text-xs space-y-1">
            <div className="flex items-center gap-2 text-slate-300">
              <School className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
              <span className="truncate max-w-[240px] font-medium">{user.college_name || 'CDLU Campus'}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-300">
              <BookOpen className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
              <span>{user.course || 'BCA'} • {user.semester || '4th Semester'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. ASSIGNED EXAMS LIST SECTION */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-black text-slate-900 tracking-tight">Assigned Examinations</h3>
          <p className="text-xs text-slate-500">Exams scheduled for your college and course</p>
        </div>
        <button
          onClick={fetchAssignedExams}
          disabled={loading}
          className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-200 rounded-xl transition cursor-pointer flex items-center gap-1 text-xs font-semibold"
          title="Refresh exams"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3 text-xs text-red-700 mb-4">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="p-8 text-center bg-white rounded-2xl border border-slate-200">
          <div className="w-8 h-8 border-3 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
          <p className="text-xs font-bold text-slate-600">Checking University Exam Schedule...</p>
        </div>
      ) : exams.length === 0 ? (
        <div className="p-8 text-center bg-white rounded-2xl border border-slate-200">
          <BookOpen className="w-10 h-10 text-slate-400 mx-auto mb-2" />
          <p className="text-sm font-bold text-slate-700">No Examinations Scheduled</p>
          <p className="text-xs text-slate-500 mt-1">There are currently no active exams for your course and college.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {exams.map((exam) => {
            const isLocked = exam.status === 'LOCKED';
            const isInProgress = exam.status === 'IN_PROGRESS';
            const isUpcoming = exam.status === 'UPCOMING';
            const isClosed = exam.status === 'CLOSED';

            return (
              <div
                key={exam.id}
                className={`bg-white rounded-2xl p-5 border shadow-sm transition flex flex-col justify-between ${
                  isLocked
                    ? 'border-slate-200 bg-slate-50/70 opacity-90'
                    : isInProgress
                    ? 'border-sky-400 ring-2 ring-sky-400/20'
                    : 'border-slate-200 hover:border-sky-500 hover:shadow-md'
                }`}
              >
                <div>
                  {/* Top Badges */}
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-md bg-sky-50 text-slate-800">
                      {exam.code}
                    </span>
                    {isLocked ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-800 border border-red-200 flex items-center gap-1">
                        <Lock className="w-3 h-3" /> Attempt Locked
                      </span>
                    ) : isInProgress ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 border border-sky-300 flex items-center gap-1 animate-pulse">
                        <Clock className="w-3 h-3" /> In Progress (Resume)
                      </span>
                    ) : isUpcoming ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200 flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Scheduled
                      </span>
                    ) : isClosed ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-50 text-slate-600 border border-slate-200 flex items-center gap-1">
                        <Lock className="w-3 h-3" /> Schedule Closed
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-800 border border-green-200 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Ready to Start
                      </span>
                    )}
                  </div>

                  {/* Title & Subject */}
                  <h4 className="font-bold text-slate-900 text-base leading-snug">
                    {exam.title}
                  </h4>
                  <p className="text-xs text-slate-500 mt-1">
                    Subject: {exam.subject} • Course: {exam.course} ({exam.semester})
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Available: {new Date(exam.start_window).toLocaleString()} – {new Date(exam.end_window).toLocaleString()}
                  </p>

                  {/* Metrics Bar */}
                  <div className="grid grid-cols-3 gap-2 my-3 p-2.5 bg-slate-50 rounded-xl border border-slate-100 text-center text-xs">
                    <div>
                      <div className="text-[10px] text-slate-400 font-semibold uppercase">Duration</div>
                      <div className="font-bold text-slate-800">{exam.duration_minutes} Mins</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 font-semibold uppercase">Questions</div>
                      <div className="font-bold text-slate-800">{exam.question_count || 25} MCQs</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 font-semibold uppercase">Marks</div>
                      <div className="font-bold text-slate-800">{exam.total_marks} Pts</div>
                    </div>
                  </div>
                </div>

                {/* Bottom Action */}
                <div className="pt-3 border-t border-slate-100">
                  {isLocked ? (
                    <div className="text-center p-2 rounded-xl bg-sky-50 text-slate-600 text-xs font-semibold flex items-center justify-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-red-500" />
                      <span>Exam Submitted & Attempt Locked</span>
                    </div>
                  ) : isUpcoming || isClosed ? (
                    <div className="text-center p-2 rounded-xl bg-sky-50 text-slate-600 text-xs font-semibold flex items-center justify-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{isUpcoming ? 'Exam has not opened yet' : 'Exam schedule has closed'}</span>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleOpenInstructions(exam)}
                      className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition shadow-sm ${
                        isInProgress
                          ? 'bg-sky-500 hover:bg-sky-600 text-sky-950 shadow-sky-500/20'
                          : 'bg-slate-900 hover:bg-slate-800 text-white shadow-slate-900/20'
                      }`}
                    >
                      <span>{isInProgress ? 'Resume Examination' : 'Start Examination'}</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  )}
                </div>

              </div>
            );
          })}
        </div>
      )}

      {/* 3. EXAM INSTRUCTIONS MODAL (Mandatory Acceptance) */}
      {selectedExam && (
        <div className="fixed inset-0 z-50 bg-sky-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="max-w-lg w-full bg-white rounded-3xl p-6 shadow-2xl border border-slate-200 animate-scale-up">
            
            {/* Modal Header */}
            <div className="flex items-center gap-3 pb-3 border-b border-slate-200">
              <div className="w-10 h-10 rounded-xl bg-sky-500/20 text-sky-700 flex items-center justify-center flex-shrink-0 font-bold">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-black text-slate-900 text-base leading-tight">
                  Mandatory Examination Instructions
                </h3>
                <p className="text-xs text-slate-500">{selectedExam.title}</p>
              </div>
            </div>

            {/* Instruction Points */}
            <div className="my-4 max-h-[45vh] overflow-y-auto space-y-2.5 text-xs text-slate-700 leading-relaxed pr-1">
              <div className="p-3 bg-sky-50 rounded-xl border border-sky-200 text-sky-900">
                <span className="font-bold block mb-1">⏱️ Strict 30-Minute Server Clock Rule:</span>
                Your timer is controlled by the university server. If you close your browser or get disconnected, <strong>the countdown does NOT pause</strong>. Reopening the browser will only give you the remaining server time.
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <div className="flex items-start gap-2">
                  <span className="font-bold text-sky-600">1.</span>
                  <span><strong>Automatic Submission:</strong> As soon as the 30-minute timer hits zero, all your saved answers will be automatically submitted by the server.</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-bold text-sky-600">2.</span>
                  <span><strong>One Attempt Only:</strong> Second attempts are strictly prohibited. Your account's attempt will be permanently LOCKED immediately upon submission.</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-bold text-sky-600">3.</span>
                  <span><strong>Real-time Auto-save:</strong> Every option you click is immediately saved to the server database.</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-bold text-sky-600">4.</span>
                  <span><strong>Result Withheld:</strong> In accordance with CDLU examination ordinances, marks and results are withheld and declared exclusively by the authorized University Admin Panel.</span>
                </div>
              </div>
            </div>

            {/* Mandatory Checkbox */}
            <label className="flex items-start gap-2.5 p-3 rounded-xl bg-sky-50 hover:bg-slate-200/70 border border-slate-200 cursor-pointer transition select-none">
              <input
                type="checkbox"
                checked={instructionsAccepted}
                onChange={(e) => setInstructionsAccepted(e.target.checked)}
                className="mt-0.5 rounded text-sky-600 focus:ring-sky-500 w-4 h-4 cursor-pointer"
              />
              <span className="text-xs font-semibold text-slate-800">
                I hereby accept and understand all CDLU online examination regulations. I understand my attempt will be locked upon timer expiration.
              </span>
            </label>

            {/* Modal Buttons */}
            <div className="flex gap-2.5 mt-5">
              <button
                type="button"
                onClick={() => setSelectedExam(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-sky-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleStartExam}
                disabled={!instructionsAccepted}
                className="flex-1 py-2.5 rounded-xl font-bold text-xs bg-gradient-to-r from-sky-400 to-sky-500 text-sky-950 hover:from-sky-500 hover:to-sky-500 shadow-md shadow-sky-500/25 disabled:opacity-40 disabled:pointer-events-none transition cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span>Proceed to Exam</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
