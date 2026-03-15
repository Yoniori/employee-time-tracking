import { auth } from './firebase';

const BASE = import.meta.env.VITE_API_URL ?? '';

async function getToken() {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  return user.getIdToken();
}

async function request(path, options = {}) {
  const token = await getToken();
  const res = await fetch(BASE + path, {
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

  getMyRecords: () =>
    request('/api/time-records/my'),

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
    const res = await fetch(`${BASE}/api/employees/upload-csv`, {
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
    fetch(`${BASE}/api/auth/lookup-employee`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idNumber }),
    }).then(async r => {
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      return d;
    }),

  seedData: () =>
    fetch(`${BASE}/api/auth/seed-manager`, { method: 'POST' }).then(r => r.json()),

  // Shifts
  createShift: (data) =>
    request('/api/shifts', { method: 'POST', body: data }),

  getShifts: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/api/shifts${qs ? '?' + qs : ''}`);
  },

  deleteShift: (id) =>
    request(`/api/shifts/${id}`, { method: 'DELETE' }),

  importShifts: (shifts) =>
    request('/api/shifts/import', { method: 'POST', body: { shifts } }),

  getMyShifts: () =>
    request('/api/shifts/my'),

  // Shift slots (manager)
  createSlot: (data) =>
    request('/api/shifts/slots', { method: 'POST', body: data }),

  getSlots: () =>
    request('/api/shifts/slots'),

  deleteSlot: (id) =>
    request(`/api/shifts/slots/${id}`, { method: 'DELETE' }),

  // Shift requests (employee)
  getOpenSlots: () =>
    request('/api/shifts/open-slots'),

  requestSlot: (slotId) =>
    request(`/api/shifts/open-slots/${slotId}/request`, { method: 'POST' }),

  // Shift requests (manager)
  getShiftRequests: () =>
    request('/api/shifts/requests'),

  approveRequest: (id) =>
    request(`/api/shifts/requests/${id}/approve`, { method: 'POST' }),

  rejectRequest: (id) =>
    request(`/api/shifts/requests/${id}/reject`, { method: 'POST' }),

  // Sheets
  syncSheets: (spreadsheetId) =>
    request('/api/sheets/sync', { method: 'POST', body: { spreadsheetId } }),
};
