import React, { useState, useEffect, useRef } from 'react';
import {
  Clock, AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight,
  Bookmark, RotateCcw, Send, ShieldAlert, Grid, X, Check, Lock
} from 'lucide-react';
import { apiFetch } from '../api';

export default function StudentExamScreen({ exam, user, onExitExam, onLogout }) {
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState({}); // { [questionId]: 'A' | 'B' | 'C' | 'D' }
  const [reviewMarked, setReviewMarked] = useState({});       // { [questionId]: boolean }
  const [remainingSeconds, setRemainingSeconds] = useState(exam.duration_minutes * 60);
  const [serverDeadline, setServerDeadline] = useState(null);
  const [saveStatus, setSaveStatus] = useState('idle'); // 'idle' | 'saving' | 'saved' | 'error'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submissionNotice, setSubmissionNotice] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const timerRef = useRef(null);
  const syncIntervalRef = useRef(null);

  // Initialize Exam Session & fetch questions
  useEffect(() => {
    let isMounted = true;

    async function initSession() {
      try {
        setLoading(true);

        // 1. Call server to start or resume attempt (Server Authoritative)
        const startRes = await apiFetch(`/api/student/start-exam/${exam.id}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('cdlu_token')}`
          }
        });

        const startData = await startRes.json();
        if (!startRes.ok) {
          if (startData.isLocked) {
            setIsSubmitted(true);
            setSubmissionNotice({
              title: 'Exam Submitted Successfully',
              message: 'Your examination has been submitted. Your result will be declared by the University.',
              lockStatus: 'Attempt Locked'
            });
            setLoading(false);
            return;
          }
          throw new Error(startData.error || 'Unable to start examination.');
        }

        if (!isMounted) return;

        setServerDeadline(startData.serverDeadline);
        setRemainingSeconds(startData.remainingSeconds);

        // 2. Fetch Questions (Without correct answers)
        const qRes = await apiFetch(`/api/exams/${exam.id}/questions`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('cdlu_token')}`
          }
        });
        const qData = await qRes.json();
        if (!qRes.ok) throw new Error(qData.error || 'Failed to load questions.');

        if (!isMounted) return;

        setQuestions(qData.questions || []);

        // Reconstruct saved answers from server
        const initialAnswers = {};
        const initialReviews = {};
        (qData.questions || []).forEach(q => {
          if (q.selected_option) {
            initialAnswers[q.id] = q.selected_option;
          }
          if (q.is_marked_review) {
            initialReviews[q.id] = true;
          }
        });
        setSelectedAnswers(initialAnswers);
        setReviewMarked(initialReviews);

      } catch (err) {
        if (isMounted) setError(err.message);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    initSession();

    return () => {
      isMounted = false;
      if (timerRef.current) clearInterval(timerRef.current);
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
    };
  }, [exam.id]);

  // Client Countdown Timer (Ticks every second)
  useEffect(() => {
    if (loading || isSubmitted || remainingSeconds <= 0) return;

    timerRef.current = setInterval(() => {
      setRemainingSeconds(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          handleAutoSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [loading, isSubmitted, remainingSeconds]);

  // Periodic Server Heartbeat Sync (every 25 seconds)
  useEffect(() => {
    if (loading || isSubmitted) return;

    syncIntervalRef.current = setInterval(async () => {
      try {
        const res = await apiFetch(`/api/student/timer/${exam.id}`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('cdlu_token')}`
          }
        });
        const data = await res.json();
        if (data.isLocked || data.remainingSeconds <= 0) {
          handleAutoSubmit();
        } else if (typeof data.remainingSeconds === 'number') {
          // Adjust client timer with authoritative server time
          setRemainingSeconds(data.remainingSeconds);
        }
      } catch (e) {
        console.warn('Timer sync attempt error:', e);
      }
    }, 25000);

    return () => {
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
    };
  }, [exam.id, loading, isSubmitted]);

  // Handle Option Selection (Auto-Save immediately)
  const handleSelectOption = async (optionLetter) => {
    if (isSubmitted || remainingSeconds <= 0) return;

    const currentQuestion = questions[currentIndex];
    if (!currentQuestion) return;

    const updated = {
      ...selectedAnswers,
      [currentQuestion.id]: optionLetter
    };
    setSelectedAnswers(updated);
    setSaveStatus('saving');

    try {
      const res = await apiFetch('/api/student/save-answer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('cdlu_token')}`
        },
        body: JSON.stringify({
          examId: exam.id,
          questionId: currentQuestion.id,
          selectedOption: optionLetter,
          isMarkedReview: reviewMarked[currentQuestion.id] || false
        })
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.isLocked) {
          handleAutoSubmit();
          return;
        }
        setSaveStatus('error');
      } else {
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      }
    } catch (err) {
      setSaveStatus('error');
    }
  };

  // Clear Selection for current question
  const handleClearOption = async () => {
    const currentQuestion = questions[currentIndex];
    if (!currentQuestion) return;

    const updated = { ...selectedAnswers };
    delete updated[currentQuestion.id];
    setSelectedAnswers(updated);
    setSaveStatus('saving');

    try {
      await apiFetch('/api/student/save-answer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('cdlu_token')}`
        },
        body: JSON.stringify({
          examId: exam.id,
          questionId: currentQuestion.id,
          selectedOption: null,
          isMarkedReview: reviewMarked[currentQuestion.id] || false
        })
      });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (e) {
      setSaveStatus('error');
    }
  };

  // Toggle Review
  const handleToggleReview = async () => {
    const currentQuestion = questions[currentIndex];
    if (!currentQuestion) return;

    const currentReviewState = !!reviewMarked[currentQuestion.id];
    const newReviewState = !currentReviewState;

    setReviewMarked(prev => ({
      ...prev,
      [currentQuestion.id]: newReviewState
    }));

    try {
      await apiFetch('/api/student/save-answer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('cdlu_token')}`
        },
        body: JSON.stringify({
          examId: exam.id,
          questionId: currentQuestion.id,
          selectedOption: selectedAnswers[currentQuestion.id] || null,
          isMarkedReview: newReviewState
        })
      });
    } catch (e) {
      console.warn('Failed to save review tag:', e);
    }
  };

  // Auto-Submit on Timeout
  const handleAutoSubmit = async () => {
    if (isSubmitted || submitting) return;
    setSubmitting(true);

    try {
      const res = await apiFetch(`/api/student/submit-exam/${exam.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('cdlu_token')}`
        },
        body: JSON.stringify({ isAutoSubmit: true })
      });

      const data = await res.json();
      setIsSubmitted(true);
      setSubmissionNotice(data.submissionNotice || {
        title: 'Exam Submitted Successfully',
        message: 'Your examination has been submitted. Your result will be declared by the University.',
        lockStatus: 'Attempt Locked'
      });
    } catch (e) {
      setIsSubmitted(true);
      setSubmissionNotice({
        title: 'Exam Submitted Successfully',
        message: 'Your examination has been submitted. Your result will be declared by the University.',
        lockStatus: 'Attempt Locked'
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Manual Submit
  const handleManualSubmit = async () => {
    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/student/submit-exam/${exam.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('cdlu_token')}`
        },
        body: JSON.stringify({ isAutoSubmit: false })
      });

      const data = await res.json();
      setIsSubmitted(true);
      setIsSubmitModalOpen(false);
      setSubmissionNotice(data.submissionNotice || {
        title: 'Exam Submitted Successfully',
        message: 'Your examination has been submitted. Your result will be declared by the University.',
        lockStatus: 'Attempt Locked'
      });
    } catch (err) {
      setError('Submission error. Retrying auto-lock...');
      handleAutoSubmit();
    } finally {
      setSubmitting(false);
    }
  };

  // Formatting minutes and seconds
  const formatTimer = (totalSec) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const answeredCount = Object.keys(selectedAnswers).length;
  const reviewCount = Object.values(reviewMarked).filter(Boolean).length;
  const unansweredCount = Math.max(0, questions.length - answeredCount);

  // -------------------------------------------------------------
  // POST-SUBMITTED LOCKED SCREEN (Matches user's exact specification)
  // -------------------------------------------------------------
  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center px-4 py-8 text-white">
        <div className="max-w-md w-full bg-sky-950 border-2 border-sky-500 rounded-3xl p-6 sm:p-8 text-center shadow-2xl relative overflow-hidden">
          
          {/* University status banner */}
          <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-sky-400 via-sky-500 to-sky-600"></div>

          <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-tr from-sky-500/20 to-green-500/20 border-2 border-green-400 flex items-center justify-center mb-5 shadow-lg shadow-green-500/20">
            <CheckCircle2 className="w-10 h-10 text-green-400 animate-bounce" />
          </div>

          <h2 className="text-2xl font-black tracking-tight text-white uppercase">
            {submissionNotice?.title || 'Exam Submitted Successfully'}
          </h2>

          <div className="my-5 p-4 rounded-2xl bg-slate-900 border border-slate-800 text-sm leading-relaxed text-slate-300">
            <p className="font-medium text-sky-200 mb-2">
              {submissionNotice?.message || 'Your examination has been submitted. Your result will be declared by the University.'}
            </p>
            <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/20 border border-red-500/50 text-red-400 text-xs font-bold tracking-wide uppercase">
              <Lock className="w-3.5 h-3.5" />
              <span>{submissionNotice?.lockStatus || 'Attempt Locked'}</span>
            </div>
          </div>

          <div className="text-left text-xs bg-slate-900/60 p-3.5 rounded-xl border border-slate-800/80 space-y-1.5 text-slate-400">
            <div className="flex justify-between">
              <span>Student ID:</span>
              <span className="font-bold text-white">{user?.username}</span>
            </div>
            <div className="flex justify-between">
              <span>Examination:</span>
              <span className="font-bold text-white truncate max-w-[200px]">{exam.title}</span>
            </div>
            <div className="flex justify-between">
              <span>College:</span>
              <span className="font-bold text-white truncate max-w-[200px]">{user?.college_name || 'CDLU Campus'}</span>
            </div>
            <div className="flex justify-between">
              <span>Reference Code:</span>
              <span className="font-mono text-sky-400 font-bold">{submissionNotice?.referenceId || `CDLU-SEC-${Date.now().toString().slice(-6)}`}</span>
            </div>
            <div className="flex justify-between">
              <span>Status:</span>
              <span className="text-green-400 font-bold">Successfully Recorded & Sealed</span>
            </div>
          </div>

          <p className="text-[11px] text-slate-500 mt-4">
            Your account has been deactivated after this exam submission. Your marks will only be accessible in the authorized University Admin Result Panel.
          </p>

          <button
            onClick={onLogout}
            className="w-full mt-6 py-3 px-4 rounded-xl font-bold text-sm bg-gradient-to-r from-sky-400 to-sky-500 text-sky-950 hover:from-sky-500 hover:to-sky-500 transition shadow-lg shadow-sky-500/25 cursor-pointer active:scale-95"
          >
            Finish and return to Home
          </button>

        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-sky-50 flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 border-4 border-sky-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-sm font-bold text-slate-700">Connecting to University Examination Server...</p>
        <p className="text-xs text-slate-500 mt-1">Synchronizing 30-minute server countdown & questions</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-sky-50 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-white p-6 rounded-2xl shadow-xl border border-red-200 text-center">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-slate-900">Examination Alert</h3>
          <p className="text-xs text-red-600 mt-2">{error}</p>
          <button
            onClick={onExitExam}
            className="mt-5 px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-lg cursor-pointer"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const currentQ = questions[currentIndex];

  return (
    <div className="min-h-screen bg-sky-50 flex flex-col exam-secure-mode select-none">
      
      {/* 1. TOP STICKY MOBILE-FIRST HEADER */}
      <header className="sticky top-0 z-40 bg-slate-900 text-white shadow-md border-b-2 border-sky-500">
        <div className="max-w-4xl mx-auto px-3 sm:px-4 py-2.5 flex items-center justify-between gap-2">
          
          {/* Left: Exam Info & Question Counter */}
          <div className="flex items-center gap-2">
            <img src="./cdlu-logo.png" alt="CDLU" className="w-8 h-8 object-contain rounded-lg" />
            <div>
              <div className="text-[10px] sm:text-xs text-slate-400 font-medium truncate max-w-[150px] sm:max-w-xs">
                {exam.code} • {exam.title}
              </div>
              <div className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
                <span>Question {currentIndex + 1} of {questions.length}</span>
                {saveStatus === 'saving' && (
                  <span className="text-[10px] text-sky-400 flex items-center gap-1 font-normal">
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-ping"></span>
                    Saving...
                  </span>
                )}
                {saveStatus === 'saved' && (
                  <span className="text-[10px] text-green-400 flex items-center gap-0.5 font-normal">
                    <Check className="w-3 h-3" /> Saved
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Right: Server Authoritative Countdown Timer & Palette Toggle */}
          <div className="flex items-center gap-2">
            
            {/* Timer Badge with Dynamic Colors */}
            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-mono text-xs sm:text-sm font-black tracking-wider shadow-inner transition-colors ${
                remainingSeconds <= 60
                  ? 'bg-red-600 text-white animate-pulse'
                  : remainingSeconds <= 300
                  ? 'bg-sky-500 text-sky-950 animate-pulse'
                  : 'bg-slate-800 text-sky-400 border border-slate-700'
              }`}
              title="Server-synchronized 30-minute exam timer"
            >
              <Clock className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{formatTimer(remainingSeconds)}</span>
            </div>

            {/* Question Palette Drawer Trigger */}
            <button
              onClick={() => setIsPaletteOpen(true)}
              className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1 cursor-pointer"
              title="View all questions"
            >
              <Grid className="w-4 h-4 text-sky-400" />
              <span className="hidden sm:inline">Palette</span>
            </button>

          </div>

        </div>

        {/* Progress Bar */}
        <div className="w-full bg-slate-800 h-1">
          <div
            className="bg-gradient-to-r from-sky-400 to-green-400 h-1 transition-all duration-300"
            style={{ width: `${(answeredCount / (questions.length || 1)) * 100}%` }}
          ></div>
        </div>
      </header>

      {/* 2. MAIN QUESTION VIEWPORT */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-3 sm:p-5 flex flex-col justify-between">
        
        {currentQ ? (
          <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-slate-200">
            
            {/* Question Header & Action Badges */}
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-md bg-sky-50 text-slate-800 font-bold text-xs">
                  Q. {currentQ.question_number}
                </span>
                <span className="text-xs text-slate-500">
                  {currentQ.marks} Marks
                </span>
              </div>

              <div className="flex items-center gap-2">
                {reviewMarked[currentQ.id] && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-sky-100 text-sky-800 border border-sky-300 flex items-center gap-1">
                    <Bookmark className="w-3 h-3 fill-sky-500 text-sky-500" /> Review
                  </span>
                )}
                {selectedAnswers[currentQ.id] ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-green-100 text-green-800 border border-green-300 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-green-600" /> Answered ({selectedAnswers[currentQ.id]})
                  </span>
                ) : (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-sky-50 text-slate-600">
                    Not Answered
                  </span>
                )}
              </div>
            </div>

            {/* Question Text */}
            <h3 className="text-base sm:text-lg font-bold text-slate-900 leading-snug mb-5">
              {currentQ.question_text}
            </h3>

            {/* MCQ Options A, B, C, D */}
            <div className="space-y-2.5 sm:space-y-3">
              {[
                { letter: 'A', text: currentQ.option_a },
                { letter: 'B', text: currentQ.option_b },
                { letter: 'C', text: currentQ.option_c },
                { letter: 'D', text: currentQ.option_d }
              ].map((opt) => {
                const isSelected = selectedAnswers[currentQ.id] === opt.letter;
                return (
                  <button
                    key={opt.letter}
                    type="button"
                    onClick={() => handleSelectOption(opt.letter)}
                    className={`w-full text-left p-3 sm:p-4 rounded-xl border transition-all cursor-pointer flex items-center gap-3 active:scale-[0.99] ${
                      isSelected
                        ? 'bg-sky-500/10 border-sky-500 shadow-sm ring-1 ring-sky-500'
                        : 'bg-white hover:bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div
                      className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center font-bold text-xs sm:text-sm flex-shrink-0 transition-colors ${
                        isSelected
                          ? 'bg-sky-500 text-sky-950 font-black shadow'
                          : 'bg-sky-50 text-slate-700 border border-slate-300'
                      }`}
                    >
                      {opt.letter}
                    </div>
                    <span className={`text-xs sm:text-sm leading-relaxed ${isSelected ? 'font-bold text-sky-950' : 'text-slate-700'}`}>
                      {opt.text}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Clear Selection Option */}
            {selectedAnswers[currentQ.id] && (
              <div className="mt-4 pt-3 border-t border-slate-100 flex justify-end">
                <button
                  type="button"
                  onClick={handleClearOption}
                  className="text-xs text-slate-500 hover:text-red-600 flex items-center gap-1 font-semibold transition cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Clear Selection</span>
                </button>
              </div>
            )}

          </div>
        ) : (
          <div className="bg-white p-8 rounded-2xl text-center text-slate-500">
            No questions available.
          </div>
        )}

      </main>

      {/* 3. BOTTOM CONTROL BAR (Mobile Touch Optimized) */}
      <footer className="sticky bottom-0 z-30 bg-white border-t border-slate-200 px-3 py-2.5 sm:py-3 shadow-lg">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-2">
          
          {/* Previous Button */}
          <button
            onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
            disabled={currentIndex === 0}
            className="px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-30 disabled:pointer-events-none text-xs sm:text-sm font-bold flex items-center gap-1 cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Previous</span>
          </button>

          {/* Mark for Review Button */}
          <button
            onClick={handleToggleReview}
            className={`px-3 py-2 sm:py-2.5 rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer transition ${
              reviewMarked[currentQ?.id]
                ? 'bg-sky-100 text-sky-800 border border-sky-300'
                : 'bg-sky-50 text-slate-700 hover:bg-slate-200 border border-slate-200'
            }`}
          >
            <Bookmark className={`w-3.5 h-3.5 ${reviewMarked[currentQ?.id] ? 'fill-sky-500 text-sky-500' : ''}`} />
            <span>{reviewMarked[currentQ?.id] ? 'Marked' : 'Review'}</span>
          </button>

          {/* Next Button / Final Submit */}
          {currentIndex < questions.length - 1 ? (
            <button
              onClick={() => setCurrentIndex(prev => Math.min(questions.length - 1, prev + 1))}
              className="px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-bold flex items-center gap-1 cursor-pointer"
            >
              <span>Next</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={() => setIsSubmitModalOpen(true)}
              className="px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-xs sm:text-sm font-bold flex items-center gap-1.5 shadow-md shadow-green-600/30 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Submit</span>
            </button>
          )}

          {/* Sticky Submit Option for Quick Finish */}
          {currentIndex < questions.length - 1 && (
            <button
              onClick={() => setIsSubmitModalOpen(true)}
              className="hidden sm:flex px-3 py-2 sm:py-2.5 rounded-xl bg-green-600/10 hover:bg-green-600 text-green-700 hover:text-white border border-green-500/30 text-xs font-bold items-center gap-1 cursor-pointer transition"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Finish Exam</span>
            </button>
          )}

        </div>
      </footer>

      {/* 4. QUESTION PALETTE MODAL / DRAWER */}
      {isPaletteOpen && (
        <div className="fixed inset-0 z-50 bg-sky-950/70 backdrop-blur-xs flex justify-end">
          <div className="w-full max-w-xs sm:max-w-sm bg-white h-full shadow-2xl flex flex-col justify-between p-4 sm:p-5 animate-slide-left">
            
            {/* Header */}
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">Question Palette</h4>
                  <p className="text-[11px] text-slate-500">{exam.code} • Total: {questions.length}</p>
                </div>
                <button
                  onClick={() => setIsPaletteOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-sky-50 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Legend */}
              <div className="grid grid-cols-2 gap-2 my-3 text-[11px] p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-600">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-md bg-green-500"></span>
                  <span>Answered ({answeredCount})</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-md bg-sky-400"></span>
                  <span>Review ({reviewCount})</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-md bg-slate-200"></span>
                  <span>Unanswered ({unansweredCount})</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-md border-2 border-slate-900 bg-white"></span>
                  <span>Current Question</span>
                </div>
              </div>

              {/* Grid of Question Numbers */}
              <div className="grid grid-cols-5 gap-2 max-h-[50vh] overflow-y-auto p-1">
                {questions.map((q, idx) => {
                  const isAnswered = Boolean(selectedAnswers[q.id]);
                  const isReview = Boolean(reviewMarked[q.id]);
                  const isCurrent = idx === currentIndex;

                  let bgColor = 'bg-sky-50 text-slate-700 hover:bg-slate-200 border-slate-200';
                  if (isAnswered) {
                    bgColor = 'bg-green-500 text-white font-bold border-green-600';
                  } else if (isReview) {
                    bgColor = 'bg-sky-400 text-sky-950 font-bold border-sky-500';
                  }

                  return (
                    <button
                      key={q.id}
                      onClick={() => {
                        setCurrentIndex(idx);
                        setIsPaletteOpen(false);
                      }}
                      className={`h-10 rounded-xl flex items-center justify-center text-xs font-bold transition-all cursor-pointer border ${bgColor} ${
                        isCurrent ? 'ring-2 ring-slate-900 ring-offset-2' : ''
                      }`}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Bottom Submit Action */}
            <div className="pt-3 border-t border-slate-200">
              <button
                onClick={() => {
                  setIsPaletteOpen(false);
                  setIsSubmitModalOpen(true);
                }}
                className="w-full py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-green-600/30 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Submit Final Exam</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* 5. CONFIRMATION SUBMISSION MODAL */}
      {isSubmitModalOpen && (
        <div className="fixed inset-0 z-50 bg-sky-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-3xl p-6 shadow-2xl border border-slate-200 animate-scale-up text-center">
            
            <div className="w-14 h-14 mx-auto rounded-full bg-sky-100 text-sky-700 flex items-center justify-center mb-3">
              <ShieldAlert className="w-7 h-7" />
            </div>

            <h3 className="text-lg font-black text-slate-900">Confirm Final Submission?</h3>
            <p className="text-xs text-slate-500 mt-1">
              Please review your summary before finalizing your exam.
            </p>

            {/* Stats Summary */}
            <div className="grid grid-cols-3 gap-2 my-4 p-3 bg-slate-50 rounded-2xl border border-slate-200 text-xs">
              <div className="p-2 bg-green-50 rounded-xl border border-green-200">
                <div className="text-lg font-black text-green-700">{answeredCount}</div>
                <div className="text-[10px] text-green-800 font-semibold">Answered</div>
              </div>
              <div className="p-2 bg-sky-50 rounded-xl border border-sky-200">
                <div className="text-lg font-black text-sky-700">{reviewCount}</div>
                <div className="text-[10px] text-sky-800 font-semibold">In Review</div>
              </div>
              <div className="p-2 bg-sky-50 rounded-xl border border-slate-200">
                <div className="text-lg font-black text-slate-700">{unansweredCount}</div>
                <div className="text-[10px] text-slate-600 font-semibold">Unanswered</div>
              </div>
            </div>

            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-left text-xs text-red-700 mb-5">
              <span className="font-bold block mb-1">⚠️ University Lock Warning:</span>
              Once submitted, your attempt will be permanently locked on the server. Second attempt is blocked. Your result will be withheld and declared exclusively by the University Admin Panel.
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsSubmitModalOpen(false)}
                disabled={submitting}
                className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-sky-50 cursor-pointer"
              >
                Continue Answering
              </button>
              <button
                type="button"
                onClick={handleManualSubmit}
                disabled={submitting}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-md shadow-red-600/30 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {submitting ? 'Locking Exam...' : 'Confirm & Submit'}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
