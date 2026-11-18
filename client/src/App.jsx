import React, { useState, useEffect } from 'react';
import BannerHeader from './components/BannerHeader';
import LoginScreen from './components/LoginScreen';
import StudentPortal from './components/StudentPortal';
import AdminPortal from './components/AdminPortal';
import { apiFetch } from './api';
import { School, ShieldCheck, Mail, Phone, MapPin, Award, BookOpen, Clock } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => {
    const handoffToken = new URLSearchParams(window.location.hash.slice(1)).get('session');
    if (!handoffToken) return localStorage.getItem('cdlu_token') || null;
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    return handoffToken;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) localStorage.setItem('cdlu_token', token);
    else localStorage.removeItem('cdlu_token');
  }, [token]);

  // Verify stored session on boot
  useEffect(() => {
    async function checkAuth() {
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const res = await apiFetch('/api/auth/me', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        const data = await res.json();
        if (res.ok && data.user) {
          setUser(data.user);
        } else {
          localStorage.removeItem('cdlu_token');
          setToken(null);
          setUser(null);
        }
      } catch (err) {
        console.error('Session verification error:', err);
      } finally {
        setLoading(false);
      }
    }

    checkAuth();
  }, [token]);

  const handleLoginSuccess = (newToken, authUser) => {
    localStorage.setItem('cdlu_token', newToken);
    setToken(newToken);
    setUser(authUser);
  };

  const handleLogout = () => {
    localStorage.removeItem('cdlu_token');
    setToken(null);
    setUser(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-sky-950 text-white flex flex-col items-center justify-center">
        <div className="w-12 h-12 border-4 border-sky-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-sm font-bold text-sky-400">Chaudhary Devi Lal University</p>
        <p className="text-xs text-slate-400 mt-1">Initializing Secure Examination Environment...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-sky-50 flex flex-col font-sans relative selection:bg-sky-500 selection:text-sky-950">
      {/* University & Sri Guru Gobind Singh Ji Commemorative Header */}
      <BannerHeader user={user} onLogout={handleLogout} />

      {/* Main Viewport */}
      <main className="flex-1">
        {!user ? (
          <LoginScreen onLoginSuccess={handleLoginSuccess} />
        ) : user.role === 'student' ? (
          <StudentPortal user={user} onLogout={handleLogout} />
        ) : (
          <AdminPortal user={user} />
        )}
      </main>

      {/* ------------------------------------------------------------- */}
      {/* PREMIUM UNIVERSITY COMMEMORATIVE FOOTER */}
      {/* ------------------------------------------------------------- */}
      <footer className="w-full bg-sky-950 text-slate-300 border-t-2 border-sky-500/80 pt-10 pb-6 px-4 sm:px-6 relative overflow-hidden">
        {/* Subtle glow in footer */}
        <div className="absolute top-0 right-1/4 w-80 h-32 bg-sky-500/10 blur-3xl pointer-events-none"></div>

        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-8 text-xs leading-relaxed">
          
          {/* Column 1: University Identity & Sri Guru Gobind Singh Ji Centre */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-sky-500 to-sky-300 flex items-center justify-center text-sky-950 font-black text-xl shadow-md">
                <span>☬</span>
              </div>
              <div>
                <h4 className="font-black text-white text-sm tracking-tight">CDLU SIRSA</h4>
                <p className="text-[10px] text-sky-400 font-semibold">Chaudhary Devi Lal University</p>
              </div>
            </div>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Established by the State Legislature Act 9 of 2003. Accredited Grade 'B+' by NAAC. Dedicated to academic excellence, ethics, and integrity.
            </p>
            <div className="text-[10px] font-serif text-sky-200/90 italic bg-white/5 p-2 rounded-lg border border-white/10">
              "ਮਾਨਸ ਕੀ ਜਾਤਿ ਸਭੈ ਏਕੈ ਪਹਿਚਾਨਬੋ" — Guru Gobind Singh Ji
            </div>
          </div>

          {/* Column 2: Digital Examination Services */}
          <div>
            <h4 className="font-bold text-white text-xs uppercase tracking-wider mb-3.5 flex items-center gap-1.5 text-sky-400">
              <BookOpen className="w-3.5 h-3.5" /> Examination Modules
            </h4>
            <ul className="space-y-2 text-[11px] text-slate-400">
              <li className="hover:text-sky-300 transition flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-sky-400"></span>
                <span>Student Online Examination Desk</span>
              </li>
              <li className="hover:text-sky-300 transition flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-sky-400"></span>
                <span>Affiliated College Administration</span>
              </li>
              <li className="hover:text-sky-300 transition flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-sky-400"></span>
                <span>Controller of Examinations Result Panel</span>
              </li>
              <li className="hover:text-sky-300 transition flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-sky-400"></span>
                <span>Question Bank & Question Randomization</span>
              </li>
              <li className="hover:text-sky-300 transition flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-sky-400"></span>
                <span>University Merit & Grade Transcripts</span>
              </li>
            </ul>
          </div>

          {/* Column 3: Contact & Helpline */}
          <div>
            <h4 className="font-bold text-white text-xs uppercase tracking-wider mb-3.5 flex items-center gap-1.5 text-sky-400">
              <Phone className="w-3.5 h-3.5" /> Contact & Helpdesk
            </h4>
            <div className="space-y-2.5 text-[11px] text-slate-400">
              <div className="flex items-start gap-2">
                <MapPin className="w-3.5 h-3.5 text-sky-400 flex-shrink-0 mt-0.5" />
                <span>Barnala Road, Sirsa, Haryana - 125055, India</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
                <span className="text-slate-300 font-mono">coe@cdlu.ac.in</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
                <span>Tel: 01666-239801, 239811</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
                <span>Office Hours: 9:00 AM – 5:00 PM (Mon – Fri)</span>
              </div>
            </div>
          </div>

          {/* Column 4: Anti-Malpractice & Security Guarantee */}
          <div>
            <h4 className="font-bold text-white text-xs uppercase tracking-wider mb-3.5 flex items-center gap-1.5 text-sky-400">
              <ShieldCheck className="w-3.5 h-3.5" /> Security & Integrity
            </h4>
            <div className="p-3 bg-white/5 rounded-xl border border-white/10 space-y-1.5 text-[11px] text-slate-400">
              <div className="flex items-center gap-1.5 text-green-400 font-semibold">
                <ShieldCheck className="w-4 h-4" />
                <span>Server-Authoritative Clock</span>
              </div>
              <p className="text-[10px] leading-relaxed text-slate-400">
                All timers are strictly governed by the university central clock. Single-attempt locking and automatic deadline auto-finalization active.
              </p>
              <div className="text-[10px] text-sky-300/80 pt-1 border-t border-white/10">
                Authorized Personnel Only • Session Encrypted
              </div>
            </div>
          </div>

        </div>

        {/* Bottom Copyright & Commemorative Strip */}
        <div className="max-w-7xl mx-auto pt-5 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-slate-500">
          <div>
            <span className="text-slate-400 font-bold">Chaudhary Devi Lal University (CDLU), Sirsa</span>
            <span className="mx-2 hidden sm:inline">•</span>
            <span>© 2026 CDLU. All Rights Reserved.</span>
          </div>

          <div className="text-sky-400/90 font-medium text-[10px] flex items-center gap-2">
            <span>Sri Guru Gobind Singh Ji Commemorative Digital Portal</span>
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400"></span>
            <span>v2026.1 Enterprise</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
