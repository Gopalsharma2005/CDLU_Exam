import React, { useState, useEffect } from 'react';
import { LogOut, User, School, Clock } from 'lucide-react';

export default function BannerHeader({ user, onLogout }) {
  const [istTime, setIstTime] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setIstTime(
        now.toLocaleTimeString('en-IN', {
          timeZone: 'Asia/Kolkata',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="w-full bg-sky-950/85 backdrop-blur-xl text-white shadow-2xl border-b-2 border-sky-500/80 sticky top-0 z-40">
      {/* Topmost University Strip */}
      <div className="bg-gradient-to-r from-sky-700/90 via-sky-600/90 to-sky-700/90 text-sky-50 text-xs py-1 px-4 font-medium tracking-wide flex justify-between items-center border-b border-sky-400/30">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
          <span className="font-semibold">चौधरी देवी लाल विश्वविद्यालय, सिरसा (हरियाणा) | Chaudhary Devi Lal University, Sirsa</span>
        </div>
        <div className="hidden sm:flex items-center gap-2 font-mono text-[11px] text-sky-100">
          <Clock className="w-3.5 h-3.5 text-sky-300" />
          <span>IST: {istTime}</span>
        </div>
      </div>

      {/* Main Guru Gobind Singh Ji & CDLU Banner */}
      <div className="max-w-7xl mx-auto px-4 py-3 sm:py-3.5">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          
          {/* Left: Official University Crest & Portal Title */}
          <div className="flex items-center gap-3.5 w-full md:w-auto">
            <div className="relative flex-shrink-0">
              <div className="absolute inset-0 bg-sky-500/20 rounded-full blur-md"></div>
              <img
                src="./cdlu-logo.png"
                alt="Chaudhary Devi Lal University official emblem"
                className="w-13 h-13 sm:w-15 sm:h-15 object-contain relative drop-shadow-md"
              />
            </div>

            {/* University & Sri Guru Gobind Singh Ji Title */}
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-400/30">
                  ਨੈਤਿਕਤਾ • ਗਿਆਨ • ਸਮਰਪਣ
                </span>
                <span className="text-[11px] text-slate-300 hidden sm:inline font-serif italic">
                  "ਮਾਨਸ ਕੀ ਜਾਤਿ ਸਭੈ ਏਕੈ ਪਹਿਚਾਨਬੋ"
                </span>
              </div>
              <h1 className="text-base sm:text-xl font-black text-white tracking-tight flex items-center gap-1.5 mt-0.5">
                <span>CHAUDHARY DEVI LAL UNIVERSITY</span>
              </h1>
              <div className="flex items-center gap-1.5 mt-0.5 text-xs sm:text-sm font-semibold text-sky-400">
                <span className="text-sky-400 text-sm">☬</span>
                <span>Sri Guru Gobind Singh Ji Digital Examination Portal</span>
              </div>
            </div>
          </div>

          {/* Right: Authenticated User Badge / Actions */}
          {user && (
            <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end border-t md:border-t-0 pt-2.5 md:pt-0 border-slate-800">
              <div className="text-left md:text-right">
                <div className="flex items-center gap-1.5 md:justify-end">
                  <span className="text-xs sm:text-sm font-bold text-white flex items-center gap-1">
                    <User className="w-3.5 h-3.5 text-sky-400" />
                    {user.name}
                  </span>
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                    user.role === 'super_admin'
                      ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                      : user.role === 'college_admin'
                      ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                      : 'bg-green-500/20 text-green-300 border border-green-500/40'
                  }`}>
                    {user.role === 'super_admin'
                      ? 'University Super Admin'
                      : user.role === 'college_admin'
                      ? 'College Admin'
                      : 'Student'}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 flex items-center gap-1 md:justify-end mt-0.5">
                  <School className="w-3 h-3 text-slate-500" />
                  <span className="truncate max-w-[220px]">
                    {user.college_name || (user.role === 'super_admin' ? 'CDLU Examination Branch' : 'CDLU Campus')}
                  </span>
                  {user.course && (
                    <span className="text-sky-400 font-medium">({user.course})</span>
                  )}
                </div>
              </div>

              <button
                onClick={onLogout}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl bg-red-600/20 hover:bg-red-600 text-red-300 hover:text-white border border-red-500/40 transition-all cursor-pointer shadow-sm active:scale-95"
                title="Logout from Examination Portal"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          )}

        </div>
      </div>
    </header>
  );
}
