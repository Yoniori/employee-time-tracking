import { auth } from './firebase';

async function getToken() {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  return user.getIdToken();
}

async function request(path, options = {}) {
  const token = await getToken();
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'שגיאת שרת');
  return data;
}

export const api = {
  // Time records
  clockIn: (employeeId, lat, lng) =>
    request('/api/time-records/clock-in', { method: 'POST', body: { employeeId, lat, lng } }),

  clockOut: (employeeId, lat, lng) =>
    request('/api/time-records/clock-out', { method: 'POST', body: { employeeId, lat, lng } }),

  getStatus: (employeeId) =>
    request(`/api/time-records/status/${employeeId}`),

  getLiveRecords: () =>
    request('/api/time-records/live'),

  getRecords: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/api/time-records${qs ? '?' + qs : ''}`);
  },

  // Employees
  getEmployees: () => request('/api/employees'),

  createEmployee: (data) =>
    request('/api/employees', { method: 'POST', body: data }),

  updateEmployee: (id, data) =>
    request(`/api/employees/${id}`, { method: 'PUT', body: data }),

  deleteEmployee: (id) =>
    request(`/api/employees/${id}`, { method: 'DELETE' }),

  uploadCSV: async (file) => {
    const token = await getToken();
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/employees/upload-csv', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'שגיאה בהעלאת קובץ');
    return data;
  },

  // Auth
  lookupEmployee: (idNumber) =>
    fetch('/api/auth/lookup-employee', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idNumber }),
    }).then(async r => {
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      return d;
    }),

  seedData: () =>
    fetch('/api/auth/seed-manager', { method: 'POST' }).then(r => r.json()),

  // Sheets
  syncSheets: (spreadsheetId) =>
    request('/api/sheets/sync', { method: 'POST', body: { spreadsheetId } }),
};
