import { useState, useEffect, useCallback } from 'react';
import { signOut } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { auth } from '../lib/firebase';
import { api } from '../lib/api';

// ─── Shared helpers ───────────────────────────────────────────────────────────
function initials(name = '') {
  return name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

function Avatar({ name, size = 'md' }) {
  const sz = size === 'sm' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm';
  const colors = ['bg-indigo-500', 'bg-violet-500', 'bg-sky-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500'];
  const color = colors[(name || '').charCodeAt(0) % colors.length];
  return (
    <div className={`${sz} ${color} rounded-xl flex items-center justify-center text-white font-bold shrink-0`}>
      {initials(name)}
    </div>
  );
}

function KpiCard({ label, value, sub, accent = 'indigo' }) {
  const map = {
    indigo: 'bg-indigo-50 text-indigo-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    rose: 'bg-rose-50 text-rose-700',
  };
  return (
    <div className={`rounded-2xl p-4 ${map[accent]}`}>
      <p className="text-xs font-semibold opacity-70 mb-1">{label}</p>
      <p className="text-2xl font-bold tabular-nums leading-none">{value}</p>
      {sub && <p className="text-xs opacity-60 mt-0.5">{sub}</p>}
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex justify-center py-10">
      <svg className="animate-spin h-7 w-7 text-indigo-500" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
      </svg>
    </div>
  );
}

function EmptyState({ icon, text }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-gray-400">
      <div className="text-5xl mb-3">{icon}</div>
      <p className="text-sm">{text}</p>
    </div>
  );
}

function SearchBar({ value, onChange, placeholder }) {
  return (
    <div className="relative mb-4">
      <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
      </svg>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-white border border-gray-200 rounded-xl pr-9 pl-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
        dir="rtl"
      />
    </div>
  );
}

// ─── Tab definitions ──────────────────────────────────────────────────────────
const TABS = ['live', 'records', 'employees', 'settings'];
const TAB_LABELS = { live: 'נוכחים', records: 'רשומות', employees: 'עובדים', settings: 'הגדרות' };

function TabIcon({ tab, active }) {
  const cls = `w-5 h-5 ${active ? 'text-indigo-600' : 'text-gray-400'}`;
  if (tab === 'live') return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" /><path d="M6.34 6.34A8 8 0 0 0 4 12M17.66 6.34A8 8 0 0 1 20 12M9.17 20.49A8 8 0 0 0 12 21M14.83 20.49A8 8 0 0 1 12 21" strokeLinecap="round" />
    </svg>
  );
  if (tab === 'records') return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" strokeLinecap="round" />
    </svg>
  );
  if (tab === 'employees') return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" strokeLinecap="round" />
    </svg>
  );
  return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" /><path d="M19.07 4.93l-1.41 1.41M4.93 4.93l1.41 1.41M12 2v2M12 20v2M20 12h2M2 12h2M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41" strokeLinecap="round" />
    </svg>
  );
}

// ─── Main dashboard ───────────────────────────────────────────────────────────
export default function ManagerDashboard() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('live');

  async function handleLogout() {
    await signOut(auth);
    navigate('/manager/login', { replace: true });
  }

  const today = new Date().toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col" dir="rtl">
      {/* Header */}
      <header className="px-5 pt-8 pb-5" style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #3730a3 60%, #4f46e5 100%)' }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-white font-bold text-xl">דשבורד מנהל</h1>
            <p className="text-indigo-300 text-xs mt-0.5">{today}</p>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-indigo-300 hover:text-white text-sm bg-white/10 rounded-xl px-3 py-2 transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 001 1h6a1 1 0 100-2H4V5h5a1 1 0 100-2H3zm11.707 4.293a1 1 0 010 1.414L13.414 10l1.293 1.293a1 1 0 01-1.414 1.414l-2-2a1 1 0 010-1.414l2-2a1 1 0 011.414 0z" clipRule="evenodd" />
              <path fillRule="evenodd" d="M13 10a1 1 0 011-1h4a1 1 0 110 2h-4a1 1 0 01-1-1z" clipRule="evenodd" />
            </svg>
            יציאה
          </button>
        </div>
      </header>

      {/* Tab content */}
      <div className="flex-1 overflow-auto">
        {tab === 'live'      && <LiveTab />}
        {tab === 'records'   && <RecordsTab />}
        {tab === 'employees' && <EmployeesTab />}
        {tab === 'settings'  && <SettingsTab />}
      </div>

      {/* Bottom nav */}
      <nav className="bg-white border-t border-gray-100 flex safe-bottom">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-3 flex flex-col items-center gap-1 text-xs font-medium transition-colors ${
              tab === t ? 'text-indigo-600' : 'text-gray-400'
            }`}
          >
            <TabIcon tab={t} active={tab === t} />
            {TAB_LABELS[t]}
          </button>
        ))}
      </nav>
    </div>
  );
}

// ─── Live Tab ─────────────────────────────────────────────────────────────────
function LiveTab() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    try {
      const data = await api.getLiveRecords();
      setRecords(data);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const poll = setInterval(load, 30000);
    const tick = setInterval(() => setNow(Date.now()), 10000);
    return () => { clearInterval(poll); clearInterval(tick); };
  }, [load]);

  // KPI calculations
  const totalLiveHours = records.reduce((sum, r) => {
    const elapsed = (now - new Date(r.clockIn)) / 3600000;
    return sum + Math.max(0, elapsed);
  }, 0);
  const compliantCount = records.filter(r => r.locationVerified).length;
  const compliancePct = records.length ? Math.round((compliantCount / records.length) * 100) : 100;

  function elapsedLabel(clockIn) {
    const ms = now - new Date(clockIn);
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  return (
    <div className="p-4">
      {/* KPI row */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <KpiCard label="נוכחים עכשיו" value={records.length} accent="emerald" />
        <KpiCard label="שעות מצטברות" value={totalLiveHours.toFixed(1)} sub="היום" accent="indigo" />
        <KpiCard
          label="ציות מיקום"
          value={`${compliancePct}%`}
          accent={compliancePct >= 80 ? 'emerald' : 'amber'}
        />
      </div>

      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold text-gray-800">עובדים נוכחים</h2>
        <button onClick={load} className="text-indigo-500 hover:text-indigo-700 p-1 rounded-lg" title="רענן">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M23 4v6h-6M1 20v-6h6" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {loading && <Spinner />}
      {!loading && records.length === 0 && <EmptyState icon="😴" text="אין עובדים נוכחים כרגע" />}

      <div className="space-y-3">
        {records.map(r => (
          <div key={r.id} className="bg-white rounded-2xl shadow-sm p-4">
            <div className="flex items-center gap-3">
              <Avatar name={r.employeeName} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-gray-800 truncate">{r.employeeName}</p>
                  {r.locationVerified
                    ? <span className="shrink-0 text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">✓ מיקום תקין</span>
                    : <span className="shrink-0 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">⚠ מיקום לא אומת</span>
                  }
                </div>
                <p className="text-xs text-gray-400 truncate">{r.workSite}</p>
              </div>
              <div className="text-left shrink-0">
                <p className="font-mono font-bold text-indigo-600 text-lg tabular-nums" dir="ltr">{elapsedLabel(r.clockIn)}</p>
                <p className="text-xs text-gray-400 text-left" dir="ltr">
                  {new Date(r.clockIn).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Records Tab ──────────────────────────────────────────────────────────────
function RecordsTab() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ from: '', to: '', employeeId: '', site: '' });
  const [employees, setEmployees] = useState([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.getEmployees().then(setEmployees).catch(() => {});
    loadRecords();
  }, []); // eslint-disable-line

  async function loadRecords() {
    setLoading(true);
    try {
      const params = {};
      if (filters.from) params.from = filters.from;
      if (filters.to) params.to = filters.to;
      if (filters.employeeId) params.employeeId = filters.employeeId;
      if (filters.site) params.site = filters.site;
      setRecords(await api.getRecords(params));
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }

  function exportExcel() {
    const header = ['שם עובד', 'ת.ז.', 'אתר עבודה', 'תאריך', 'כניסה', 'יציאה', 'שעות'];
    const rows = filtered.map(r => [
      r.employeeName,
      r.idNumber,
      r.workSite,
      r.clockIn ? new Date(r.clockIn).toLocaleDateString('he-IL') : '',
      r.clockIn ? new Date(r.clockIn).toLocaleTimeString('he-IL') : '',
      r.clockOut ? new Date(r.clockOut).toLocaleTimeString('he-IL') : '',
      r.totalHours?.toFixed(2) || '',
    ]);
    const csv = [header, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'attendance.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  const sites = [...new Set(employees.map(e => e.workSite).filter(Boolean))];
  const filtered = search
    ? records.filter(r => r.employeeName?.includes(search) || r.idNumber?.includes(search))
    : records;

  const totalHours = filtered.reduce((s, r) => s + (r.totalHours || 0), 0);

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-gray-800">רשומות נוכחות</h2>
        {filtered.length > 0 && (
          <span className="text-xs text-gray-500 bg-gray-100 rounded-full px-3 py-1">
            {filtered.length} רשומות · {totalHours.toFixed(1)}ש' סה"כ
          </span>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl shadow-sm p-4 mb-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">מתאריך</label>
            <input type="date" value={filters.from}
              onChange={e => setFilters(f => ({ ...f, from: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">עד תאריך</label>
            <input type="date" value={filters.to}
              onChange={e => setFilters(f => ({ ...f, to: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">עובד</label>
            <select value={filters.employeeId}
              onChange={e => setFilters(f => ({ ...f, employeeId: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white">
              <option value="">כל העובדים</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">אתר</label>
            <select value={filters.site}
              onChange={e => setFilters(f => ({ ...f, site: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white">
              <option value="">כל האתרים</option>
              {sites.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={loadRecords}
            className="flex-1 bg-indigo-600 text-white rounded-xl py-2.5 text-sm font-semibold">
            סנן
          </button>
          <button onClick={exportExcel}
            className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-600 text-white rounded-xl py-2.5 text-sm font-semibold">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 15V3m0 12l-4-4m4 4l4-4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M2 17l.621 2.485A2 2 0 004.561 21h14.878a2 2 0 001.94-1.515L22 17" strokeLinecap="round" />
            </svg>
            ייצוא Excel
          </button>
        </div>
      </div>

      <SearchBar value={search} onChange={setSearch} placeholder="חיפוש לפי שם או ת.ז." />

      {loading && <Spinner />}
      {!loading && filtered.length === 0 && <EmptyState icon="📋" text="לא נמצאו רשומות" />}

      <div className="space-y-2">
        {filtered.map(r => (
          <div key={r.id} className="bg-white rounded-2xl shadow-sm p-4">
            <div className="flex items-center gap-3 mb-2">
              <Avatar name={r.employeeName} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-800 text-sm truncate">{r.employeeName}</p>
                <p className="text-xs text-gray-400 truncate">{r.workSite}</p>
              </div>
              <div className="shrink-0">
                {r.totalHours != null
                  ? <span className="bg-indigo-50 text-indigo-700 text-sm font-bold px-2.5 py-1 rounded-xl">{r.totalHours.toFixed(2)}ש'</span>
                  : <span className="bg-emerald-50 text-emerald-700 text-xs font-bold px-2.5 py-1 rounded-xl">נוכח</span>
                }
              </div>
            </div>
            <div className="flex gap-3 text-xs text-gray-400 pt-2 border-t border-gray-50">
              <span>{r.clockIn ? new Date(r.clockIn).toLocaleDateString('he-IL') : ''}</span>
              <span dir="ltr">{r.clockIn ? new Date(r.clockIn).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) : ''} → {r.clockOut ? new Date(r.clockOut).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) : '—'}</span>
              {r.locationVerified && <span className="text-emerald-500">✓ מיקום</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Employees Tab ────────────────────────────────────────────────────────────
function EmployeesTab() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', idNumber: '', phone: '', workSite: '', address: '' });
  const [formError, setFormError] = useState('');
  const [geocodeResult, setGeocodeResult] = useState(null);
  const [geocoding, setGeocoding] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => { loadEmployees(); }, []);

  async function loadEmployees() {
    setLoading(true);
    try { setEmployees(await api.getEmployees()); }
    catch { /* ignore */ } finally { setLoading(false); }
  }

  async function geocodeAddress(address) {
    setGeocoding(true); setGeocodeResult(null);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`, { headers: { 'Accept-Language': 'he' } });
      const data = await res.json();
      if (!data.length) throw new Error('הכתובת לא נמצאה');
      const { lat, lon, display_name } = data[0];
      const result = { lat: parseFloat(lat), lng: parseFloat(lon), display_name };
      setGeocodeResult(result);
      return result;
    } finally { setGeocoding(false); }
  }

  async function handleCreate(e) {
    e.preventDefault(); setFormError('');
    if (!/^\d{9}$/.test(form.idNumber)) { setFormError('תעודת זהות חייבת להיות 9 ספרות'); return; }
    try {
      const geo = geocodeResult || await geocodeAddress(form.address);
      await api.createEmployee({ ...form, location: { lat: geo.lat, lng: geo.lng }, allowedRadius: 200, active: true });
      setForm({ name: '', idNumber: '', phone: '', workSite: '', address: '' });
      setGeocodeResult(null); setShowForm(false); loadEmployees();
    } catch (err) { setFormError(err.message); }
  }

  async function handleDeactivate(id) {
    if (!confirm('האם להסיר עובד זה?')) return;
    await api.deleteEmployee(id); loadEmployees();
  }

  async function handleCSVUpload(e) {
    const file = e.target.files[0]; if (!file) return;
    setUploading(true); setUploadResult(null);
    try { const r = await api.uploadCSV(file); setUploadResult(r); loadEmployees(); }
    catch (err) { alert('שגיאה: ' + err.message); }
    finally { setUploading(false); e.target.value = ''; }
  }

  const filtered = search
    ? employees.filter(e => e.name?.includes(search) || e.idNumber?.includes(search) || e.workSite?.includes(search))
    : employees;

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-gray-800">ניהול עובדים ({employees.length})</h2>
        <button onClick={() => setShowForm(!showForm)}
          className="bg-indigo-600 text-white rounded-xl px-4 py-2 text-sm font-semibold flex items-center gap-1.5">
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
          עובד חדש
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="bg-white rounded-2xl shadow-sm p-4 mb-4 border border-indigo-100">
          <h3 className="font-semibold text-gray-700 mb-3">הוספת עובד חדש</h3>
          <form onSubmit={handleCreate} className="space-y-2.5">
            {[
              { key: 'name', placeholder: 'שם מלא', type: 'text' },
              { key: 'idNumber', placeholder: 'תעודת זהות (9 ספרות)', type: 'text', maxLength: 9 },
              { key: 'phone', placeholder: '0501234567', type: 'tel' },
              { key: 'workSite', placeholder: 'אתר עבודה', type: 'text' },
            ].map(f => (
              <input key={f.key} type={f.type} maxLength={f.maxLength}
                value={form[f.key]} placeholder={f.placeholder} required
                onChange={e => setForm(p => ({ ...p, [f.key]: f.key === 'idNumber' ? e.target.value.replace(/\D/g, '') : e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200" />
            ))}
            <div className="flex gap-2">
              <input value={form.address}
                onChange={e => { setForm(p => ({ ...p, address: e.target.value })); setGeocodeResult(null); }}
                placeholder="כתובת מיקום העבודה" required
                className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200" />
              <button type="button" onClick={() => geocodeAddress(form.address)} disabled={geocoding || !form.address}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl px-3 text-sm disabled:opacity-40 whitespace-nowrap">
                {geocoding ? '...' : '📍 אמת'}
              </button>
            </div>
            {geocodeResult && (
              <p className="text-xs text-emerald-700 bg-emerald-50 rounded-xl px-3 py-2">
                ✓ {geocodeResult.display_name}<br />
                <span className="text-gray-400">({geocodeResult.lat.toFixed(5)}, {geocodeResult.lng.toFixed(5)})</span>
              </p>
            )}
            {formError && <p className="text-red-500 text-sm">{formError}</p>}
            <div className="flex gap-2 pt-1">
              <button type="submit" className="flex-1 bg-indigo-600 text-white rounded-xl py-2.5 text-sm font-semibold">שמור</button>
              <button type="button" onClick={() => setShowForm(false)} className="flex-1 bg-gray-100 text-gray-600 rounded-xl py-2.5 text-sm">ביטול</button>
            </div>
          </form>
        </div>
      )}

      {/* CSV Upload */}
      <div className="bg-white rounded-2xl shadow-sm p-4 mb-4">
        <h3 className="font-semibold text-gray-700 mb-1 text-sm">ייבוא מ-CSV</h3>
        <p className="text-xs text-gray-400 mb-3">שם, תעודת_זהות, מספר_טלפון, אתר_עבודה, קו_רוחב, קו_אורך</p>
        <label className={`flex items-center justify-center gap-2 w-full py-3 rounded-xl border-2 border-dashed cursor-pointer transition-colors text-sm font-medium ${uploading ? 'border-gray-200 text-gray-400' : 'border-indigo-300 text-indigo-600 hover:border-indigo-400 hover:bg-indigo-50'}`}>
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
          </svg>
          {uploading ? 'מעלה...' : 'בחר קובץ CSV'}
          <input type="file" accept=".csv" onChange={handleCSVUpload} className="hidden" disabled={uploading} />
        </label>
        {uploadResult && (
          <p className="text-emerald-600 text-sm mt-2 text-center font-medium">✓ יובאו {uploadResult.imported} רשומות</p>
        )}
      </div>

      <SearchBar value={search} onChange={setSearch} placeholder="חיפוש עובד לפי שם, ת.ז. או אתר" />

      {loading && <Spinner />}

      <div className="space-y-2">
        {filtered.map(emp => (
          <div key={emp.id} className="bg-white rounded-2xl shadow-sm p-4 flex items-center gap-3">
            <Avatar name={emp.name} />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-800 text-sm">{emp.name}</p>
              <p className="text-xs text-gray-400 truncate">{emp.idNumber} · {emp.workSite}</p>
              <p className="text-xs text-gray-400" dir="ltr">{emp.phone}</p>
            </div>
            <button onClick={() => handleDeactivate(emp.id)}
              className="text-gray-300 hover:text-red-500 transition-colors p-1.5 rounded-lg hover:bg-red-50">
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        ))}
        {!loading && filtered.length === 0 && <EmptyState icon="👥" text="לא נמצאו עובדים" />}
      </div>
    </div>
  );
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────
function SettingsTab() {
  const [spreadsheetId, setSpreadsheetId] = useState(localStorage.getItem('spreadsheetId') || '');
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState('');

  async function handleSync() {
    if (!spreadsheetId.trim()) { alert('נא להזין מזהה גיליון Google Sheets'); return; }
    localStorage.setItem('spreadsheetId', spreadsheetId);
    setSyncing(true); setSyncResult('');
    try {
      const result = await api.syncSheets(spreadsheetId);
      setSyncResult(`✓ סונכרנו ${result.synced} רשומות`);
    } catch (err) { setSyncResult('שגיאה: ' + err.message); }
    finally { setSyncing(false); }
  }

  return (
    <div className="p-4 space-y-4">
      <h2 className="font-bold text-gray-800">הגדרות</h2>

      <div className="bg-white rounded-2xl shadow-sm p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
            <svg className="w-5 h-5 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" />
            </svg>
          </div>
          <div>
            <h3 className="font-semibold text-gray-800">סנכרון Google Sheets</h3>
            <p className="text-xs text-gray-400">ייצוא רשומות לגיליון אלקטרוני</p>
          </div>
        </div>
        <label className="text-xs text-gray-400 mb-1 block">מזהה גיליון (מה-URL)</label>
        <input value={spreadsheetId} onChange={e => setSpreadsheetId(e.target.value)}
          placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-emerald-200" dir="ltr" />
        <button onClick={handleSync} disabled={syncing}
          className="w-full bg-emerald-600 text-white rounded-xl py-3 font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2">
          <svg className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {syncing ? 'מסנכרן...' : 'סנכרן לגיליון'}
        </button>
        {syncResult && (
          <p className={`text-sm mt-3 text-center font-medium ${syncResult.startsWith('✓') ? 'text-emerald-600' : 'text-red-500'}`}>
            {syncResult}
          </p>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-5">
        <h3 className="font-semibold text-gray-800 mb-1">אודות המערכת</h3>
        <p className="text-sm text-gray-500">מעקב שעות עבודה v1.0</p>
        <p className="text-xs text-gray-400 mt-1">Firebase · React · Railway · Vercel</p>
      </div>
    </div>
  );
}
