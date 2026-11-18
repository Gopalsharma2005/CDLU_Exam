import React, { useState, useEffect } from 'react';
import { X, CheckCircle2, XCircle, AlertCircle, Clock, Award, User, School, BookOpen } from 'lucide-react';
import { apiFetch } from '../api';

export default function AnswerSheetModal({ attemptId, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchDetail() {
      try {
        setLoading(true);
        const res = await apiFetch(`/api/results/detail/${attemptId}`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('cdlu_token')}`
          }
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to load student answer sheet.');
        setData(json);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchDetail();
  }, [attemptId]);

  return (
    <div className="fixed inset-0 z-50 bg-sky-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
      <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden animate-scale-up">
        
        {/* Header */}
        <div className="bg-slate-900 text-white p-4 sm:p-5 flex items-center justify-between border-b-2 border-sky-500">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-400/30">
                Official CDLU Answer Sheet Review
              </span>
              <span className="text-xs text-slate-400">Authorized Admin Eyes Only</span>
            </div>
            <h3 className="text-base sm:text-lg font-bold text-white mt-1">
              {data?.attempt?.student_name} ({data?.attempt?.student_roll_no})
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {loading ? (
            <div className="p-8 text-center">
              <div className="w-8 h-8 border-3 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
              <p className="text-xs font-bold text-slate-600">Retrieving Student Answer Sheet from Database...</p>
            </div>
          ) : error ? (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
              {error}
            </div>
          ) : data ? (
            <>
              {/* Attempt Overview Card */}
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-slate-400 font-semibold block text-[10px] uppercase">College</span>
                  <span className="font-bold text-slate-800 truncate block">{data.attempt.college_name}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold block text-[10px] uppercase">Exam</span>
                  <span className="font-bold text-slate-800 truncate block">{data.attempt.exam_name}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold block text-[10px] uppercase">Score & Status</span>
                  <span className="font-black text-sky-600">
                    {data.attempt.total_marks_obtained} / {data.attempt.max_possible_marks} Pts
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold block text-[10px] uppercase">Time Taken</span>
                  <span className="font-bold text-slate-800">{data.attempt.time_taken}</span>
                </div>
              </div>

              {/* Stats Bar */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-sky-50 text-xs text-slate-700 font-medium">
                <span className="flex items-center gap-1.5 text-green-700 font-bold">
                  <CheckCircle2 className="w-4 h-4" /> {data.attempt.correct_answers} Correct
                </span>
                <span className="flex items-center gap-1.5 text-red-600 font-bold">
                  <XCircle className="w-4 h-4" /> {data.attempt.incorrect_answers} Incorrect
                </span>
                <span className="flex items-center gap-1.5 text-slate-500 font-bold">
                  <AlertCircle className="w-4 h-4" /> {data.attempt.unanswered} Unanswered
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-900 text-sky-300 font-bold">
                  {data.attempt.status === 'auto_submitted' ? 'Auto-Submitted (Timeout)' : 'Manually Submitted'}
                </span>
              </div>

              {/* Questions List */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Question-by-Question Evaluation
                </h4>

                {data.questions.map((q, idx) => {
                  const isCorrect = q.selected_option && q.selected_option.toUpperCase() === q.correct_option.toUpperCase();
                  const isUnanswered = !q.selected_option;

                  return (
                    <div
                      key={q.id}
                      className={`p-4 rounded-xl border text-xs leading-relaxed ${
                        isUnanswered
                          ? 'bg-slate-50/80 border-slate-200'
                          : isCorrect
                          ? 'bg-green-50/50 border-green-200'
                          : 'bg-red-50/50 border-red-200'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-2 font-bold">
                        <span className="text-slate-800">
                          Q{idx + 1}. {q.question_text}
                        </span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full flex-shrink-0 ${
                          isUnanswered
                            ? 'bg-slate-200 text-slate-700'
                            : isCorrect
                            ? 'bg-green-100 text-green-800 font-black'
                            : 'bg-red-100 text-red-800 font-black'
                        }`}>
                          {isUnanswered ? 'Not Attempted' : isCorrect ? `+${q.marks} Marks (Correct)` : '0 Marks (Wrong)'}
                        </span>
                      </div>

                      {/* Options */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 my-2">
                        {['A', 'B', 'C', 'D'].map(optKey => {
                          const optText = q[`option_${optKey.toLowerCase()}`];
                          const isKeyCorrect = optKey === q.correct_option;
                          const isStudentPick = optKey === q.selected_option;

                          let style = 'bg-white border-slate-200 text-slate-700';
                          if (isKeyCorrect) {
                            style = 'bg-green-100 border-green-400 text-green-900 font-bold';
                          } else if (isStudentPick && !isKeyCorrect) {
                            style = 'bg-red-100 border-red-400 text-red-900 line-through';
                          }

                          return (
                            <div key={optKey} className={`p-2 rounded-lg border text-[11px] flex items-center justify-between ${style}`}>
                              <span><strong>{optKey}.</strong> {optText}</span>
                              {isKeyCorrect && <span className="text-[10px] text-green-700 font-black">✓ Correct Key</span>}
                              {isStudentPick && !isKeyCorrect && <span className="text-[10px] text-red-700 font-black">✗ Student's Pick</span>}
                            </div>
                          );
                        })}
                      </div>

                      {q.explanation && (
                        <p className="text-[11px] text-slate-500 italic mt-1.5 pt-1.5 border-t border-slate-200">
                          <strong>Explanation:</strong> {q.explanation}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl cursor-pointer"
          >
            Close Sheet
          </button>
        </div>

      </div>
    </div>
  );
}
