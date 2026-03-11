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

  // Clock update
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Load employee data & status
  useEffect(() => {
    const stored = sessionStorage.getItem('employeeData');
    if (stored) {
      const emp = JSON.parse(stored);
      setEmployeeData(emp);
      loadStatus(emp.employeeId);
    }
  }, []);

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
    if (!clockInTime) return '';
    const diff = now - clockInTime;
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-blue-600 text-white px-4 py-4 flex items-center justify-between">
        <div>
          <h1 className="font-bold text-lg">שלום, {employeeData?.name || 'עובד'}</h1>
          <p className="text-blue-200 text-sm">{employeeData?.workSite || ''}</p>
        </div>
        <button
          onClick={handleLogout}
          className="text-blue-200 hover:text-white text-sm border border-blue-400 rounded-lg px-3 py-1"
        >
          יציאה
        </button>
      </header>

      <div className="max-w-sm mx-auto p-4">
        {/* Time display */}
        <div className="bg-white rounded-2xl shadow-sm p-6 mb-4 text-center">
          <p className="text-gray-500 text-sm mb-1">
            {now.toLocaleDateString('he-IL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
          <p className="text-4xl font-bold text-gray-800 tracking-wide">
            {now.toLocaleTimeString('he-IL')}
          </p>
        </div>

        {/* Status card */}
        <div className={`rounded-2xl shadow-sm p-6 mb-4 text-center ${clockedIn ? 'bg-green-50 border-2 border-green-200' : 'bg-gray-50 border-2 border-gray-200'}`}>
          <div className={`text-5xl mb-3 ${clockedIn ? 'animate-pulse' : ''}`}>
            {clockedIn ? '🟢' : '⚪'}
          </div>
          <p className={`text-xl font-semibold ${clockedIn ? 'text-green-700' : 'text-gray-500'}`}>
            {clockedIn ? 'נוכח' : 'לא נוכח'}
          </p>
          {clockedIn && clockInTime && (
            <div className="mt-3">
              <p className="text-sm text-gray-500">
                כניסה: {clockInTime.toLocaleTimeString('he-IL')}
              </p>
              <p className="text-2xl font-mono font-bold text-green-600 mt-1">
                {getElapsedTime()}
              </p>
            </div>
          )}
        </div>

        {/* Error / Success messages */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
            <p className="text-red-600 text-center font-medium">{error}</p>
          </div>
        )}
        {success && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4">
            <p className="text-green-600 text-center font-medium">{success}</p>
          </div>
        )}
        {gpsError && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 mb-4">
            <p className="text-yellow-700 text-sm text-center">{gpsError}</p>
          </div>
        )}

        {/* Clock In/Out button */}
        <button
          onClick={clockedIn ? handleClockOut : handleClockIn}
          disabled={loading || gpsLoading}
          className={`w-full rounded-2xl py-5 text-xl font-bold shadow-lg transition-all active:scale-95 disabled:opacity-50
            ${clockedIn
              ? 'bg-red-500 hover:bg-red-600 text-white'
              : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
        >
          {loading || gpsLoading
            ? 'מעבד...'
            : clockedIn
            ? '🔴 רישום יציאה'
            : '🟢 רישום כניסה'}
        </button>

        <p className="text-xs text-gray-400 text-center mt-3">
          {clockedIn
            ? 'לחץ לרישום יציאה מהעבודה'
            : 'לחץ לרישום כניסה לעבודה'}
        </p>
      </div>
    </div>
  );
}
