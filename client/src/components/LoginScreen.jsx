import React, { useEffect, useState } from 'react';
import {
  Lock, User, ArrowRight, ShieldCheck, AlertCircle, Smartphone,
  CheckCircle2, Home, Building2, Shield, Mail, Phone, BookOpen,
  School, Clock, Award, Check
} from 'lucide-react';
import { apiFetch } from '../api';

export default function LoginScreen({ onLoginSuccess, isAdminPortal = false }) {
  const showDemoLogin = import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO_LOGIN === 'true';
  const [activeTab, setActiveTab] = useState(isAdminPortal ? 'officer' : 'home'); // 'home' | 'register' | 'officer'

  // Form states
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Registration state (email and phone are mandatory)
  const [registration, setRegistration] = useState({
    name: '',
    email: '',
    phone: '',
    college_id: '',
    course: 'BCA',
    semester: '4th Semester',
    password: ''
  });
  const [colleges, setColleges] = useState([]);
  const [registrationLoading, setRegistrationLoading] = useState(false);
  const [registrationError, setRegistrationError] = useState('');
  const [registeredStudentId, setRegisteredStudentId] = useState('');

  useEffect(() => {
    if (activeTab !== 'register') return;

    let isMounted = true;
    apiFetch('/api/auth/registration-options')
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not load active colleges.');
        if (isMounted) setColleges(data.colleges || []);
      })
      .catch((err) => {
        if (isMounted) setRegistrationError(err.message || 'Could not connect to the portal server.');
      });

    return () => {
      isMounted = false;
    };
  }, [activeTab]);

  // Switch tab and clear messages
  const handleTabSwitch = (tab) => {
    setActiveTab(tab);
    setError('');
    setRegistrationError('');
    setUsername('');
    setPassword('');
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!username || !password) {
      setError('Please enter Username / ID and Password.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Login failed. Please check credentials.');
      }

      // Admin Login supports both university and college administrators.
      if (isAdminPortal && !['college_admin', 'examiner', 'super_admin'].includes(data.user?.role)) {
        throw new Error('This sign-in is for authorized university and college administrators only.');
      }
      if (!isAdminPortal && data.user?.role !== 'student') {
        throw new Error('Please use Admin Login for an administrator account.');
      }

      onLoginSuccess(data.token, data.user);
    } catch (err) {
      setError(err.message || 'Authentication failed. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  const setDemoCredentials = (u, p) => {
    setUsername(u);
    setPassword(p);
    setError('');
  };

  const handleRegistration = async (e) => {
    e.preventDefault();

    // Strict validation: Email and Mobile are MANDATORY
    if (!registration.email || !registration.email.trim()) {
      setRegistrationError('Email address is strictly mandatory.');
      return;
    }
    if (!registration.phone || !registration.phone.trim()) {
      setRegistrationError('Mobile number is strictly mandatory.');
      return;
    }
    const cleanPhone = registration.phone.trim().replace(/[^\d+]/g, '');
    if (cleanPhone.length < 10) {
      setRegistrationError('Please enter a valid 10-digit mobile number.');
      return;
    }

    setRegistrationLoading(true);
    setRegistrationError('');
    setRegisteredStudentId('');

    try {
      const res = await apiFetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registration)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Student registration failed.');

      setRegisteredStudentId(data.studentId);
      setUsername(data.studentId);
      setPassword('');
      setRegistration((current) => ({ ...current, password: '' }));
    } catch (err) {
      setRegistrationError(err.message || 'Student registration failed.');
    } finally {
      setRegistrationLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-140px)] py-8 px-4 flex flex-col items-center justify-center bg-gradient-to-br from-sky-50/60 via-slate-100/80 to-green-50/60 backdrop-blur-3xl relative overflow-hidden">
      
      {/* Background Ambient Glows */}
      <div className="absolute -top-32 -left-32 w-96 h-96 bg-sky-300/25 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-green-400/20 rounded-full blur-3xl pointer-events-none"></div>

      {/* 1. TOP TRANSPARENT NAVIGATION TABS */}
      {!isAdminPortal && <nav
        className="w-full max-w-xl flex flex-wrap sm:flex-nowrap gap-1.5 p-1.5 mb-6 rounded-2xl bg-white/70 backdrop-blur-xl border border-white/80 shadow-[0_8px_30px_rgb(0,0,0,0.06)] z-10"
        aria-label="Student Portal Navigation Tabs"
      >
        <button
          type="button"
          onClick={() => handleTabSwitch('home')}
          className={`flex-1 min-w-[110px] py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-all duration-200 cursor-pointer ${
            activeTab === 'home'
              ? 'bg-slate-900 text-sky-400 shadow-md shadow-slate-900/20 scale-[1.02]'
              : 'text-slate-700 hover:text-sky-950 hover:bg-white/70'
          }`}
        >
          <Home className="w-4 h-4 text-sky-500" />
          <span>Student Login</span>
        </button>

        <button
          type="button"
          onClick={() => handleTabSwitch('register')}
          className={`flex-1 min-w-[130px] py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-all duration-200 cursor-pointer ${
            activeTab === 'register'
              ? 'bg-slate-900 text-sky-400 shadow-md shadow-slate-900/20 scale-[1.02]'
              : 'text-slate-700 hover:text-sky-950 hover:bg-white/70'
          }`}
        >
          <User className="w-4 h-4 text-green-500" />
          <span>Student Registration</span>
        </button>
      </nav>}

      {/* 2. CENTRAL GLASSMORPHISM CARD */}
      <div className="w-full max-w-xl bg-white/75 backdrop-blur-2xl rounded-3xl shadow-[0_20px_60px_rgba(15,23,42,0.1)] border border-white/80 overflow-hidden transition-all duration-300 z-10">
        
        {/* University portal header */}
        <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-green-950 text-white p-6 sm:p-7 text-center border-b-2 border-sky-500 relative overflow-hidden">
          <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-sky-500/10 rounded-full blur-xl pointer-events-none"></div>

          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-sky-500 to-sky-300 text-sky-950 font-black shadow-lg shadow-sky-500/30 mb-2.5">
            <img src="./cdlu-logo.png" alt="CDLU logo" className="w-10 h-10 object-contain" />
          </div>

          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
            {activeTab === 'home' && 'Student Examination Portal'}
            {activeTab === 'register' && 'Student Registration Desk'}
            {activeTab === 'officer' && 'University & College Admin Login'}
          </h2>

          <p className="text-xs text-sky-300 mt-1 font-medium">
            Chaudhary Devi Lal University, Sirsa
          </p>

          <div className="mt-3 text-[11px] text-slate-300 bg-white/10 backdrop-blur-md rounded-full px-3.5 py-1 inline-block border border-white/10 font-medium">
            {activeTab === 'home' && 'Enter your Student ID to begin your timed examination'}
            {activeTab === 'register' && 'Mandatory email and mobile required to generate Student ID'}
            {activeTab === 'officer' && 'Authorized University and College Administration'}
          </div>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* TAB 1: HOME (Dashboard Overview & Student Login) */}
        {/* ------------------------------------------------------------- */}
        {activeTab === 'home' && (
          <div className="p-6 sm:p-8 space-y-5">
            
            {/* Feature Highlights Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
              <div className="p-2.5 bg-white/60 backdrop-blur-md rounded-xl border border-white/80 shadow-xs">
                <span className="block text-base">🎓</span>
                <span className="text-[11px] font-bold text-slate-800">One Student ID</span>
                <span className="text-[9px] text-slate-500 block">Single attempt</span>
              </div>
              <div className="p-2.5 bg-white/60 backdrop-blur-md rounded-xl border border-white/80 shadow-xs">
                <span className="block text-base">⏱️</span>
                <span className="text-[11px] font-bold text-slate-800">30-Min Server</span>
                <span className="text-[9px] text-slate-500 block">Strict timer</span>
              </div>
              <div className="p-2.5 bg-white/60 backdrop-blur-md rounded-xl border border-white/80 shadow-xs">
                <span className="block text-base">💾</span>
                <span className="text-[11px] font-bold text-slate-800">Instant Save</span>
                <span className="text-[9px] text-slate-500 block">Real-time sync</span>
              </div>
              <div className="p-2.5 bg-white/60 backdrop-blur-md rounded-xl border border-white/80 shadow-xs">
                <span className="block text-base">🔒</span>
                <span className="text-[11px] font-bold text-slate-800">Official Result</span>
                <span className="text-[9px] text-slate-500 block">COE verified</span>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-50/90 border border-red-200 rounded-xl flex items-start gap-2.5 text-xs text-red-700 animate-shake">
                <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Student ID / Roll Number
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. CDLU2026001"
                    className="w-full pl-10 pr-4 py-2.5 text-sm bg-white/70 backdrop-blur-md border border-slate-300/80 rounded-xl focus:bg-white focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none transition font-medium"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Examination Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter examination password"
                    className="w-full pl-10 pr-4 py-2.5 text-sm bg-white/70 backdrop-blur-md border border-slate-300/80 rounded-xl focus:bg-white focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none transition font-medium"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 rounded-xl font-bold text-sm text-sky-950 bg-gradient-to-r from-sky-400 via-sky-500 to-sky-400 hover:from-sky-500 hover:to-sky-500 shadow-md shadow-sky-500/25 active:scale-[0.98] transition cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin"></span>
                    Authenticating Session...
                  </span>
                ) : (
                  <>
                    <span>Enter Examination Desk</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            {/* Quick Link to Registration */}
            <div className="text-center pt-2 border-t border-slate-200/60">
              <span className="text-xs text-slate-600">New student? </span>
              <button
                type="button"
                onClick={() => handleTabSwitch('register')}
                className="text-xs font-bold text-sky-700 hover:text-sky-800 underline cursor-pointer"
              >
                Register here to generate Student ID
              </button>
            </div>

            {/* 1-Click Quick Demo Login for Students */}
            {showDemoLogin && (
              <div className="p-3.5 bg-sky-50/70 border border-sky-200/80 rounded-2xl space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-sky-800 flex items-center gap-1">
                  <span>⚡ 1-Click Quick Demo Login</span>
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDemoCredentials('CDLU2026001', 'Student@123')}
                    className="p-2 rounded-xl bg-white/90 hover:bg-green-50 border border-slate-200 text-left transition cursor-pointer group"
                  >
                    <span className="text-xs font-bold text-slate-800 group-hover:text-green-700 block">
                      🎓 Student 1: Harpreet Singh
                    </span>
                    <span className="text-[10px] text-slate-500">Roll: CDLU2026001 • University College</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDemoCredentials('CDLU2026002', 'Student@123')}
                    className="p-2 rounded-xl bg-white/90 hover:bg-green-50 border border-slate-200 text-left transition cursor-pointer group"
                  >
                    <span className="text-xs font-bold text-slate-800 group-hover:text-green-700 block">
                      🎓 Student 2: Simran Kaur
                    </span>
                    <span className="text-[10px] text-slate-500">Roll: CDLU2026002 • JCD Memorial College</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* TAB 2: STUDENT REGISTRATION (Email & Mobile are MANDATORY) */}
        {/* ------------------------------------------------------------- */}
        {activeTab === 'register' && (
          <form onSubmit={handleRegistration} className="p-6 sm:p-8 space-y-3.5">
            {registrationError && (
              <div className="p-3 bg-red-50/90 border border-red-200 rounded-xl flex items-start gap-2 text-xs text-red-700">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{registrationError}</span>
              </div>
            )}

            {registeredStudentId && (
              <div className="p-4 bg-green-50/90 border border-green-300 rounded-2xl text-sm text-green-900 shadow-sm animate-scale-up">
                <div className="flex items-center gap-2 font-bold text-green-800">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <span>Registration Successful!</span>
                </div>
                <p className="mt-2 text-xs text-green-800">Your generated Student ID is:</p>
                <p className="mt-1 text-2xl font-black tracking-wider text-green-950 font-mono">
                  {registeredStudentId}
                </p>
                <p className="text-[11px] text-green-700 mt-1">
                  Save this ID and your password. Use it to log in and take your examination.
                </p>
                <button
                  type="button"
                  onClick={() => handleTabSwitch('home')}
                  className="mt-3 px-4 py-2 bg-green-700 hover:bg-green-800 text-white rounded-xl text-xs font-bold transition cursor-pointer inline-flex items-center gap-1.5 shadow"
                >
                  <span>Go to Student Login Desk</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Full Name */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Full Name <span className="text-red-500">*</span>
              </label>
              <input
                value={registration.name}
                onChange={(e) => setRegistration({ ...registration, name: e.target.value })}
                className="w-full p-2.5 bg-white/70 backdrop-blur-md border border-slate-300 rounded-xl text-sm font-normal focus:bg-white focus:ring-2 focus:ring-sky-500 outline-none"
                placeholder="Enter your official student name"
                autoComplete="name"
                maxLength={100}
                required
              />
            </div>

            {/* Email Address - MANDATORY */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5 text-sky-600" />
                  <span>Email Address <span className="text-red-500">*</span></span>
                </label>
                <span className="text-[10px] font-bold text-red-600 uppercase tracking-wider bg-red-100/80 px-2 py-0.5 rounded-md">
                  Mandatory
                </span>
              </div>
              <input
                type="email"
                value={registration.email}
                onChange={(e) => setRegistration({ ...registration, email: e.target.value })}
                className="w-full p-2.5 bg-white/70 backdrop-blur-md border border-slate-300 rounded-xl text-sm font-normal focus:bg-white focus:ring-2 focus:ring-sky-500 outline-none"
                placeholder="e.g. student@cdlu.ac.in or personal email"
                autoComplete="email"
                required
              />
            </div>

            {/* Mobile Number - MANDATORY */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5 text-green-600" />
                  <span>Mobile Number <span className="text-red-500">*</span></span>
                </label>
                <span className="text-[10px] font-bold text-red-600 uppercase tracking-wider bg-red-100/80 px-2 py-0.5 rounded-md">
                  Mandatory (10 Digits)
                </span>
              </div>
              <input
                type="tel"
                value={registration.phone}
                onChange={(e) => setRegistration({ ...registration, phone: e.target.value })}
                className="w-full p-2.5 bg-white/70 backdrop-blur-md border border-slate-300 rounded-xl text-sm font-normal focus:bg-white focus:ring-2 focus:ring-sky-500 outline-none"
                placeholder="e.g. 9812001234"
                autoComplete="tel"
                inputMode="tel"
                maxLength={15}
                required
              />
            </div>

            {/* College Selection */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Select College <span className="text-red-500">*</span>
              </label>
              <select
                value={registration.college_id}
                onChange={(e) => setRegistration({ ...registration, college_id: e.target.value })}
                className="w-full p-2.5 bg-white/70 backdrop-blur-md border border-slate-300 rounded-xl text-sm font-normal focus:bg-white focus:ring-2 focus:ring-sky-500 outline-none cursor-pointer"
                required
              >
                <option value="">Select your affiliated college</option>
                {colleges.map((college) => (
                  <option key={college.id} value={college.id}>{college.name}</option>
                ))}
              </select>
            </div>

            {/* Course & Semester */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Course <span className="text-red-500">*</span></label>
                <input
                  value={registration.course}
                  onChange={(e) => setRegistration({ ...registration, course: e.target.value })}
                  className="w-full p-2.5 bg-white/70 backdrop-blur-md border border-slate-300 rounded-xl text-sm font-normal focus:bg-white focus:ring-2 focus:ring-sky-500 outline-none"
                  maxLength={80}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Semester <span className="text-red-500">*</span></label>
                <input
                  value={registration.semester}
                  onChange={(e) => setRegistration({ ...registration, semester: e.target.value })}
                  className="w-full p-2.5 bg-white/70 backdrop-blur-md border border-slate-300 rounded-xl text-sm font-normal focus:bg-white focus:ring-2 focus:ring-sky-500 outline-none"
                  maxLength={80}
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Create Examination Password <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                value={registration.password}
                onChange={(e) => setRegistration({ ...registration, password: e.target.value })}
                className="w-full p-2.5 bg-white/70 backdrop-blur-md border border-slate-300 rounded-xl text-sm font-normal focus:bg-white focus:ring-2 focus:ring-sky-500 outline-none"
                placeholder="At least 8 characters"
                autoComplete="new-password"
                minLength={8}
                maxLength={128}
                required
              />
            </div>

            <button
              type="submit"
              disabled={registrationLoading || Boolean(registeredStudentId)}
              className="w-full mt-2 py-3 px-4 rounded-xl font-bold text-sm text-sky-950 bg-gradient-to-r from-sky-400 via-sky-500 to-sky-400 hover:from-sky-500 hover:to-sky-500 shadow-md shadow-sky-500/25 disabled:opacity-50 transition cursor-pointer"
            >
              {registrationLoading ? 'Generating Student ID...' : 'Register and Generate Student ID'}
            </button>
          </form>
        )}

        {/* ------------------------------------------------------------- */}
        {/* TAB 3: OFFICER LOGIN (College Admins & Examiners) */}
        {/* ------------------------------------------------------------- */}
        {activeTab === 'officer' && (
          <div className="p-6 sm:p-8 space-y-4">
            <div className="p-3 bg-blue-50/80 border border-blue-200/80 rounded-xl text-xs text-blue-900 flex items-start gap-2">
              <Building2 className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
              <span>For authorized College Principals, College Admins, and Center Examination Incharges.</span>
            </div>

            {error && (
              <div className="p-3 bg-red-50/90 border border-red-200 rounded-xl flex items-start gap-2.5 text-xs text-red-700 animate-shake">
                <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Officer Username / College Email
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. admin.ucd@cdlu.ac.in"
                    className="w-full pl-10 pr-4 py-2.5 text-sm bg-white/70 backdrop-blur-md border border-slate-300/80 rounded-xl focus:bg-white focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none transition font-medium"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Officer Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter officer password"
                    className="w-full pl-10 pr-4 py-2.5 text-sm bg-white/70 backdrop-blur-md border border-slate-300/80 rounded-xl focus:bg-white focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none transition font-medium"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 rounded-xl font-bold text-sm text-white bg-slate-900 hover:bg-slate-800 shadow-md shadow-slate-900/20 active:scale-[0.98] transition cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? 'Verifying Officer Account...' : 'Sign In to College Officer Portal'}
              </button>
            </form>

            {/* 1-Click Quick Fill for College Officers */}
            {showDemoLogin && (
              <div className="p-3.5 bg-slate-50/80 border border-slate-200 rounded-2xl space-y-2 mt-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                  ⚡ 1-Click Quick Fill (Select College Admin)
                </p>
                <div className="grid grid-cols-1 gap-1.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setDemoCredentials('admin.ucd@cdlu.ac.in', 'College@123')}
                    className="p-2 rounded-xl bg-white hover:bg-blue-50 border border-slate-200 text-left transition cursor-pointer group flex items-center justify-between"
                  >
                    <div>
                      <span className="font-bold text-slate-800 group-hover:text-blue-700">🏫 College Admin 1: University College</span>
                      <span className="block text-[10px] text-slate-500">admin.ucd@cdlu.ac.in</span>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-800">Fill</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDemoCredentials('admin.jcd@cdlu.ac.in', 'College@123')}
                    className="p-2 rounded-xl bg-white hover:bg-blue-50 border border-slate-200 text-left transition cursor-pointer group flex items-center justify-between"
                  >
                    <div>
                      <span className="font-bold text-slate-800 group-hover:text-blue-700">🏫 College Admin 2: JCD Memorial College</span>
                      <span className="block text-[10px] text-slate-500">admin.jcd@cdlu.ac.in</span>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-800">Fill</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* TAB 4: SUPER ADMIN (Controller of Examinations, CDLU) */}
        {/* ------------------------------------------------------------- */}
        {activeTab === 'super_admin' && (
          <div className="p-6 sm:p-8 space-y-4">
            <div className="p-3 bg-red-50/80 border border-red-200/80 rounded-xl text-xs text-red-900 flex items-start gap-2">
              <Shield className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <span>Restricted console for University Super Admin (Controller of Examinations, CDLU Sirsa). Full system governance.</span>
            </div>

            {error && (
              <div className="p-3 bg-red-50/90 border border-red-200 rounded-xl flex items-start gap-2.5 text-xs text-red-700 animate-shake">
                <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Controller of Examinations (COE) Email / ID
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="admin@cdlu.ac.in"
                    className="w-full pl-10 pr-4 py-2.5 text-sm bg-white/70 backdrop-blur-md border border-slate-300/80 rounded-xl focus:bg-white focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition font-medium"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Master Security Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter super admin password"
                    className="w-full pl-10 pr-4 py-2.5 text-sm bg-white/70 backdrop-blur-md border border-slate-300/80 rounded-xl focus:bg-white focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition font-medium"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-red-700 to-slate-900 hover:from-red-800 hover:to-slate-950 shadow-md shadow-red-700/20 active:scale-[0.98] transition cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? 'Verifying Super Admin Authorization...' : 'Access University Super Admin Console'}
              </button>
            </form>

            {/* 1-Click Quick Fill for Super Admin */}
            {showDemoLogin && (
              <div className="p-3.5 bg-red-50/70 border border-red-200/80 rounded-2xl space-y-2 mt-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-red-800">
                  ⚡ 1-Click Quick Fill (Super Admin)
                </p>
                <button
                  type="button"
                  onClick={() => setDemoCredentials('admin@cdlu.ac.in', 'Admin@123')}
                  className="w-full p-2.5 rounded-xl bg-white hover:bg-red-50/80 border border-slate-200 text-left transition cursor-pointer group flex items-center justify-between"
                >
                  <div>
                    <span className="font-bold text-slate-800 group-hover:text-red-700 block">
                      🏛️ University Super Admin (COE CDLU)
                    </span>
                    <span className="block text-[10px] text-slate-500">admin@cdlu.ac.in • Controller of Examinations</span>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-100 text-red-800">Fill</span>
                </button>
              </div>
            )}
          </div>
        )}

      </div>

      {/* Security Advisory */}
      <div className="max-w-xl w-full mt-4 text-center text-xs text-slate-600 flex items-center justify-center gap-1.5 z-10">
        <ShieldCheck className="w-4 h-4 text-green-600" />
        <span>CDLU University Server-Authoritative Anti-Malpractice System Active</span>
      </div>

    </div>
  );
}
