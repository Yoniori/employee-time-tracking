import { useState, useEffect } from 'react';
import { signOut } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { auth } from '../lib/firebase';
import { api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';

function useGPS() {
  const [position, setPosition] = useState(null);
  const [gpsError, setGpsError] = useState('');
  const [loading, setLoading] = useState(false);

  const getPosition = () => {
    setLoading(true);
    setGpsError('');
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        const err = 'GPS אינו נתמך בדפדפן זה';
        setGpsError(err);
        setLoading(false);
        reject(new Error(err));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setPosition(p);
          setLoading(false);
          resolve(p);
        },
        () => {
          const err = 'לא ניתן לקבל מיקום - אנא אשר גישה למיקום';
          setGpsError(err);
          setLoading(false);
          reject(new Error(err));
        },
        { timeout: 10000, enableHighAccuracy: true }
      );
    });
  };

  return { position, gpsError, gpsLoading: loading, getPosition };
}

function initials(name = '') {
  return name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('');
}

function Spinner({ className = 'h-6 w-6' }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}

export default function EmployeeDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { gpsError, gpsLoading, getPosition } = useGPS();
  const [employeeData, setEmployeeData] = useState(null);
  const [clockedIn, setClockedIn] = useState(false);
  const [clockInTime, setClockInTime] = useState(null);
  const [recordId, setRecordId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const stored = sessionStorage.getItem('employeeData');
    if (stored) {
      const emp = JSON.parse(stored);
      setEmployeeData(emp);
      loadStatus(emp.employeeId);
    }
  }, []);

  // Auto-dismiss success
  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(''), 4000);
    return () => clearTimeout(t);
  }, [success]);

  async function loadStatus(empId) {
    try {
      const status = await api.getStatus(empId);
      if (status.clockedIn) {
        setClockedIn(true);
        setRecordId(status.recordId);
        setClockInTime(new Date(status.clockIn));
      }
    } catch {
      // ignore
    }
  }

  async function handleClockIn() {
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const pos = await getPosition();
      const result = await api.clockIn(employeeData.employeeId, pos.lat, pos.lng);
      setClockedIn(true);
      setClockInTime(new Date(result.clockIn));
      setRecordId(result.recordId);
      setSuccess('כניסה נרשמה בהצלחה!');
    } catch (err) {
      setError(err.message || 'שגיאה ברישום כניסה');
    } finally {
      setLoading(false);
    }
  }

  async function handleClockOut() {
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const pos = await getPosition();
      const result = await api.clockOut(employeeData.employeeId, pos.lat, pos.lng);
      setClockedIn(false);
      setClockInTime(null);
      setRecordId(null);
      const hours = result.totalHours?.toFixed(2);
      setSuccess(`יציאה נרשמה! עבדת ${hours} שעות`);
    } catch (err) {
      setError(err.message || 'שגיאה ברישום יציאה');
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    sessionStorage.removeItem('employeeData');
    await signOut(auth);
    navigate('/', { replace: true });
  }

  function getElapsedTime() {
    if (!clockInTime) return '00:00:00';
    const diff = now - clockInTime;
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  const name = employeeData?.name || '';
  const busy = loading || gpsLoading;

  return (
    <div className="min-h-screen bg-[#F4F5FF] flex flex-col" dir="rtl">

      {/* Header */}
      <header className="px-5 pt-10 pb-6" style={{ background: 'linear-gradient(135deg, #3730a3 0%, #4f46e5 60%, #6366f1 100%)' }}>
        <div className="flex items-center justify-between mb-6">
          {/* Avatar + name */}
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center text-white font-bold text-base shadow">
              {initials(name)}
            </div>
            <div>
              <p className="text-white/70 text-xs">שלום,</p>
              <p className="text-white font-bold text-base leading-tight">{name || 'עובד'}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-white/70 hover:text-white text-sm transition-colors bg-white/10 rounded-xl px-3 py-2"
          >
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 001 1h6a1 1 0 100-2H4V5h5a1 1 0 100-2H3zm11.707 4.293a1 1 0 010 1.414L13.414 10l1.293 1.293a1 1 0 01-1.414 1.414l-2-2a1 1 0 010-1.414l2-2a1 1 0 011.414 0z" clipRule="evenodd" />
              <path fillRule="evenodd" d="M13 10a1 1 0 011-1h4a1 1 0 110 2h-4a1 1 0 01-1-1z" clipRule="evenodd" />
            </svg>
            יציאה
          </button>
        </div>

        {/* Work site badge */}
        {employeeData?.workSite && (
          <div className="inline-flex items-center gap-1.5 bg-white/15 rounded-full px-3 py-1">
            <svg className="w-3 h-3 text-white/70" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
            </svg>
            <span className="text-white/90 text-xs font-medium">{employeeData.workSite}</span>
          </div>
        )}
      </header>

      <div className="flex-1 px-5 -mt-3 pb-10">

        {/* Date + time card */}
        <div className="bg-white rounded-3xl shadow-sm p-5 mb-4 text-center">
          <p className="text-gray-400 text-sm mb-1">
            {now.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          <p className="text-5xl font-bold text-gray-900 tabular-nums tracking-tight" dir="ltr">
            {now.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </p>
        </div>

        {/* Status card */}
        <div className={`rounded-3xl p-5 mb-4 transition-all duration-500
          ${clockedIn
            ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-200'
            : 'bg-white text-gray-700 shadow-sm'}`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-xs font-semibold mb-0.5 ${clockedIn ? 'text-emerald-100' : 'text-gray-400'}`}>
                סטטוס נוכחות
              </p>
              <p className={`text-xl font-bold ${clockedIn ? 'text-white' : 'text-gray-600'}`}>
                {clockedIn ? 'נוכח במשמרת' : 'לא מחויב'}
              </p>
            </div>
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center
              ${clockedIn ? 'bg-white/20' : 'bg-gray-100'}`}>
              {clockedIn ? (
                <svg className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="12" cy="12" r="9" />
                </svg>
              ) : (
                <svg className="w-7 h-7 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 3" strokeLinecap="round" />
                </svg>
              )}
            </div>
          </div>

          {clockedIn && clockInTime && (
            <div className="mt-4 pt-4 border-t border-white/20">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-emerald-100 text-xs">שעת כניסה</p>
                  <p className="text-white font-semibold" dir="ltr">
                    {clockInTime.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-emerald-100 text-xs mb-0.5">זמן במשמרת</p>
                  <p className="text-white font-mono font-bold text-2xl tabular-nums" dir="ltr">
                    {getElapsedTime()}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Toast messages */}
        {success && (
          <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3 mb-4 animate-pulse-once">
            <div className="w-8 h-8 rounded-xl bg-emerald-500 flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 text-white" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </div>
            <p className="text-emerald-700 font-medium text-sm">{success}</p>
          </div>
        )}
        {error && (
          <div className="flex items-center gap-3 bg-red-50 border border-red-100 rounded-2xl px-4 py-3 mb-4">
            <div className="w-8 h-8 rounded-xl bg-red-500 flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 text-white" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}
        {gpsError && (
          <div className="flex items-center gap-3 bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3 mb-4">
            <div className="w-8 h-8 rounded-xl bg-amber-400 flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 text-white" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
              </svg>
            </div>
            <p className="text-amber-700 text-sm">{gpsError}</p>
          </div>
        )}

        {/* Clock In/Out button */}
        <button
          onClick={clockedIn ? handleClockOut : handleClockIn}
          disabled={busy}
          className="w-full rounded-3xl py-5 font-bold text-lg transition-all active:scale-[0.97]
            disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 shadow-lg"
          style={{
            background: busy
              ? '#e5e7eb'
              : clockedIn
              ? 'linear-gradient(135deg, #ef4444, #f97316)'
              : 'linear-gradient(135deg, #4f46e5, #6366f1)',
            color: busy ? '#9ca3af' : 'white',
            boxShadow: busy ? 'none' : clockedIn
              ? '0 8px 24px rgba(239,68,68,0.35)'
              : '0 8px 24px rgba(79,70,229,0.35)',
          }}
        >
          {busy ? (
            <><Spinner className="h-5 w-5" /> {gpsLoading ? 'מאתר מיקום...' : 'מעבד...'}</>
          ) : clockedIn ? (
            <>
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
              רישום יציאה
            </>
          ) : (
            <>
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v4l3 3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              רישום כניסה
            </>
          )}
        </button>

        <p className="text-xs text-gray-400 text-center mt-3">
          {busy
            ? 'אנא המתן...'
            : clockedIn
            ? 'לחץ לרישום יציאה מהעבודה'
            : 'לחץ לרישום כניסה לעבודה'}
        </p>
      </div>
    </div>
  );
}
