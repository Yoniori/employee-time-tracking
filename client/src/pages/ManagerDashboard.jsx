import { useState, useEffect, useCallback } from 'react';
import { signOut } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { auth } from '../lib/firebase';
import { api } from '../lib/api';

const TABS = ['live', 'records', 'employees', 'settings'];
const TAB_LABELS = { live: 'נוכחים כעת', records: 'רשומות', employees: 'עובדים', settings: 'הגדרות' };
const TAB_ICONS = { live: '🟢', records: '📋', employees: '👥', settings: '⚙️' };

export default function ManagerDashboard() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('live');

  async function handleLogout() {
    await signOut(auth);
    navigate('/manager/login', { replace: true });
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-gray-800 text-white px-4 py-4 flex items-center justify-between">
        <div>
          <h1 className="font-bold text-lg">דשבורד מנהל</h1>
          <p className="text-gray-400 text-xs">מעקב שעות עבודה</p>
        </div>
        <button
          onClick={handleLogout}
          className="text-gray-300 hover:text-white text-sm border border-gray-600 rounded-lg px-3 py-1"
        >
          יציאה
        </button>
      </header>

      {/* Tab content */}
      <div className="flex-1 overflow-auto">
        {tab === 'live' && <LiveTab />}
        {tab === 'records' && <RecordsTab />}
        {tab === 'employees' && <EmployeesTab />}
        {tab === 'settings' && <SettingsTab />}
      </div>

      {/* Bottom nav */}
      <nav className="bg-white border-t border-gray-200 flex">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-3 flex flex-col items-center gap-0.5 text-xs transition-colors ${
              tab === t ? 'text-blue-600 font-medium' : 'text-gray-400'
            }`}
          >
            <span className="text-xl">{TAB_ICONS[t]}</span>
            {TAB_LABELS[t]}
          </button>
        ))}
      </nav>
    </div>
  );
}

// ─── Live Tab ───────────────────────────────────────────────────────────────
function LiveTab() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await api.getLiveRecords();
      setRecords(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-800">עובדים נוכחים</h2>
        <div className="flex items-center gap-2">
          <span className="bg-green-100 text-green-700 text-sm font-semibold px-3 py-1 rounded-full">
            {records.length} נוכחים
          </span>
          <button onClick={load} className="text-gray-400 hover:text-gray-600 text-xl">↻</button>
        </div>
      </div>

      {loading && <Spinner />}

      {!loading && records.length === 0 && (
        <EmptyState icon="😴" text="אין עובדים נוכחים כרגע" />
      )}

      <div className="space-y-3">
        {records.map(r => {
          const clockIn = new Date(r.clockIn);
          const elapsed = Date.now() - clockIn;
          const h = Math.floor(elapsed / 3600000);
          const m = Math.floor((elapsed % 3600000) / 60000);
          return (
            <div key={r.id} className="bg-white rounded-xl shadow-sm p-4 border-r-4 border-green-400">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-800">{r.employeeName}</p>
                  <p className="text-sm text-gray-500">{r.workSite}</p>
                </div>
                <div className="text-left text-xs text-gray-500">
                  <p>כניסה: {clockIn.toLocaleTimeString('he-IL')}</p>
                  <p className="font-mono font-bold text-green-600 text-sm mt-0.5">
                    {String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Records Tab ─────────────────────────────────────────────────────────────
function RecordsTab() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ from: '', to: '', employeeId: '', site: '' });
  const [employees, setEmployees] = useState([]);

  useEffect(() => {
    api.getEmployees().then(setEmployees).catch(() => {});
    loadRecords();
  }, []);

  async function loadRecords() {
    setLoading(true);
    try {
      const params = {};
      if (filters.from) params.from = filters.from;
      if (filters.to) params.to = filters.to;
      if (filters.employeeId) params.employeeId = filters.employeeId;
      if (filters.site) params.site = filters.site;
      const data = await api.getRecords(params);
      setRecords(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  function exportCSV() {
    const header = ['שם', 'ת.ז.', 'אתר', 'תאריך', 'כניסה', 'יציאה', 'שעות'];
    const rows = records.map(r => [
      r.employeeName,
      r.idNumber,
      r.workSite,
      r.clockIn ? new Date(r.clockIn).toLocaleDateString('he-IL') : '',
      r.clockIn ? new Date(r.clockIn).toLocaleTimeString('he-IL') : '',
      r.clockOut ? new Date(r.clockOut).toLocaleTimeString('he-IL') : '',
      r.totalHours?.toFixed(2) || '',
    ]);
    const csv = [header, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'records.csv';
    a.click();
  }

  const sites = [...new Set(employees.map(e => e.workSite).filter(Boolean))];

  return (
    <div className="p-4">
      <h2 className="text-lg font-bold text-gray-800 mb-4">רשומות נוכחות</h2>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm p-4 mb-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">מתאריך</label>
            <input type="date" value={filters.from}
              onChange={e => setFilters(f => ({ ...f, from: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">עד תאריך</label>
            <input type="date" value={filters.to}
              onChange={e => setFilters(f => ({ ...f, to: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">עובד</label>
            <select value={filters.employeeId}
              onChange={e => setFilters(f => ({ ...f, employeeId: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
              <option value="">כל העובדים</option>
              {employees.map(e => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">אתר</label>
            <select value={filters.site}
              onChange={e => setFilters(f => ({ ...f, site: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
              <option value="">כל האתרים</option>
              {sites.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={loadRecords}
            className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium">
            סנן
          </button>
          <button onClick={exportCSV}
            className="flex-1 bg-green-600 text-white rounded-lg py-2 text-sm font-medium">
            ייצוא CSV
          </button>
        </div>
      </div>

      {loading && <Spinner />}

      {!loading && records.length === 0 && (
        <EmptyState icon="📋" text="לא נמצאו רשומות" />
      )}

      <div className="space-y-2">
        {records.map(r => (
          <div key={r.id} className="bg-white rounded-xl shadow-sm p-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-semibold text-gray-800 text-sm">{r.employeeName}</p>
                <p className="text-xs text-gray-400">{r.workSite}</p>
              </div>
              <div className="text-left text-xs">
                {r.totalHours != null && (
                  <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-bold">
                    {r.totalHours.toFixed(2)}ש'
                  </span>
                )}
                {!r.clockOut && (
                  <span className="bg-green-50 text-green-700 px-2 py-0.5 rounded-full text-xs font-bold">נוכח</span>
                )}
              </div>
            </div>
            <div className="mt-2 flex gap-4 text-xs text-gray-500">
              <span>📅 {r.clockIn ? new Date(r.clockIn).toLocaleDateString('he-IL') : ''}</span>
              <span>▶ {r.clockIn ? new Date(r.clockIn).toLocaleTimeString('he-IL') : ''}</span>
              <span>⏹ {r.clockOut ? new Date(r.clockOut).toLocaleTimeString('he-IL') : '—'}</span>
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
  const [form, setForm] = useState({ name: '', idNumber: '', phone: '', workSite: '', lat: '', lng: '' });
  const [formError, setFormError] = useState('');
  const [uploadResult, setUploadResult] = useState(null);

  useEffect(() => { loadEmployees(); }, []);

  async function loadEmployees() {
    setLoading(true);
    try {
      const data = await api.getEmployees();
      setEmployees(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    setFormError('');
    if (!/^\d{9}$/.test(form.idNumber)) { setFormError('תעודת זהות חייבת להיות 9 ספרות'); return; }
    try {
      await api.createEmployee({
        ...form,
        location: { lat: parseFloat(form.lat) || 0, lng: parseFloat(form.lng) || 0 },
        allowedRadius: 200,
        active: true,
      });
      setForm({ name: '', idNumber: '', phone: '', workSite: '', lat: '', lng: '' });
      setShowForm(false);
      loadEmployees();
    } catch (err) {
      setFormError(err.message);
    }
  }

  async function handleDeactivate(id) {
    if (!confirm('האם למחוק עובד זה?')) return;
    await api.deleteEmployee(id);
    loadEmployees();
  }

  async function handleCSVUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setUploadResult(null);
    try {
      const result = await api.uploadCSV(file);
      setUploadResult(result);
      loadEmployees();
    } catch (err) {
      alert('שגיאה: ' + err.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-800">ניהול עובדים</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-blue-600 text-white rounded-xl px-4 py-2 text-sm font-medium"
        >
          + עובד חדש
        </button>
      </div>

      {/* Add Employee Form */}
      {showForm && (
        <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
          <h3 className="font-semibold text-gray-700 mb-3">הוספת עובד</h3>
          <form onSubmit={handleCreate} className="space-y-3">
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="שם מלא" required
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            <input value={form.idNumber} onChange={e => setForm(f => ({ ...f, idNumber: e.target.value.replace(/\D/g, '') }))}
              placeholder="תעודת זהות (9 ספרות)" maxLength={9} required
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              placeholder="+972501234567" required
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            <input value={form.workSite} onChange={e => setForm(f => ({ ...f, workSite: e.target.value }))}
              placeholder="אתר עבודה" required
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            <div className="grid grid-cols-2 gap-2">
              <input value={form.lat} onChange={e => setForm(f => ({ ...f, lat: e.target.value }))}
                placeholder="קו רוחב" type="number" step="any"
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              <input value={form.lng} onChange={e => setForm(f => ({ ...f, lng: e.target.value }))}
                placeholder="קו אורך" type="number" step="any"
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            {formError && <p className="text-red-500 text-sm">{formError}</p>}
            <div className="flex gap-2">
              <button type="submit" className="flex-1 bg-green-600 text-white rounded-lg py-2 text-sm font-medium">שמור</button>
              <button type="button" onClick={() => setShowForm(false)} className="flex-1 bg-gray-100 text-gray-700 rounded-lg py-2 text-sm">ביטול</button>
            </div>
          </form>
        </div>
      )}

      {/* CSV Upload */}
      <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
        <h3 className="font-semibold text-gray-700 mb-2">העלאת רשימה מ-CSV</h3>
        <p className="text-xs text-gray-400 mb-3">פורמט: שם,תעודת_זהות,מספר_טלפון,אתר_עבודה,קו_רוחב,קו_אורך</p>
        <label className={`block w-full text-center py-3 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${uploading ? 'border-gray-200 text-gray-400' : 'border-blue-300 text-blue-500 hover:border-blue-400'}`}>
          {uploading ? 'מעלה...' : '📂 בחר קובץ CSV'}
          <input type="file" accept=".csv" onChange={handleCSVUpload} className="hidden" disabled={uploading} />
        </label>
        {uploadResult && (
          <p className="text-green-600 text-sm mt-2 text-center">
            ✓ יובאו {uploadResult.imported} רשומות
          </p>
        )}
      </div>

      {loading && <Spinner />}

      <div className="space-y-2">
        {employees.map(emp => (
          <div key={emp.id} className="bg-white rounded-xl shadow-sm p-4 flex items-center justify-between">
            <div>
              <p className="font-semibold text-gray-800">{emp.name}</p>
              <p className="text-xs text-gray-400">{emp.idNumber} · {emp.workSite}</p>
              <p className="text-xs text-gray-400" dir="ltr">{emp.phone}</p>
            </div>
            <button
              onClick={() => handleDeactivate(emp.id)}
              className="text-red-400 hover:text-red-600 text-sm px-2 py-1"
            >
              הסר
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────
function SettingsTab() {
  const [spreadsheetId, setSpreadsheetId] = useState(
    localStorage.getItem('spreadsheetId') || ''
  );
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState('');

  async function handleSync() {
    if (!spreadsheetId.trim()) {
      alert('נא להזין מזהה גיליון Google Sheets');
      return;
    }
    localStorage.setItem('spreadsheetId', spreadsheetId);
    setSyncing(true);
    setSyncResult('');
    try {
      const result = await api.syncSheets(spreadsheetId);
      setSyncResult(`✓ סונכרנו ${result.synced} רשומות`);
    } catch (err) {
      setSyncResult('שגיאה: ' + err.message);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="p-4">
      <h2 className="text-lg font-bold text-gray-800 mb-4">הגדרות</h2>

      <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
        <h3 className="font-semibold text-gray-700 mb-3">סנכרון Google Sheets</h3>
        <p className="text-xs text-gray-400 mb-3">
          הזן את מזהה הגיליון (מה-URL של Google Sheets)
        </p>
        <input
          value={spreadsheetId}
          onChange={e => setSpreadsheetId(e.target.value)}
          placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-3"
        />
        <button
          onClick={handleSync}
          disabled={syncing}
          className="w-full bg-green-600 text-white rounded-xl py-3 font-semibold disabled:opacity-50"
        >
          {syncing ? 'מסנכרן...' : '🔄 סנכרן לגיליון'}
        </button>
        {syncResult && (
          <p className={`text-sm mt-2 text-center ${syncResult.startsWith('✓') ? 'text-green-600' : 'text-red-500'}`}>
            {syncResult}
          </p>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm p-4">
        <h3 className="font-semibold text-gray-700 mb-2">אודות המערכת</h3>
        <p className="text-sm text-gray-500">מעקב שעות עבודה v1.0</p>
        <p className="text-xs text-gray-400 mt-1">Firebase · React · PWA</p>
      </div>
    </div>
  );
}

// ─── Shared Components ────────────────────────────────────────────────────────
function Spinner() {
  return (
    <div className="flex justify-center py-8">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
    </div>
  );
}

function EmptyState({ icon, text }) {
  return (
    <div className="text-center py-12 text-gray-400">
      <div className="text-4xl mb-3">{icon}</div>
      <p>{text}</p>
    </div>
  );
}
