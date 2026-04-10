'use strict';
/**
 * Q3 — Geofencing & Clock-In
 *
 * 1. Unit-tests haversineDistance() with known geographic coordinates.
 * 2. Integration-tests clock-in geofencing via HTTP:
 *      - within radius  → 200
 *      - outside radius → 403 with distance in body
 *      - locationRestricted=false → bypass geofence
 *      - no location set on employee → bypass geofence
 * 3. Duplicate-clock-in prevention (Firestore transaction guard) → 400
 * 4. Shift requirement → 403 noShift when no shift scheduled today
 * 5. Non-numeric lat/lng → 400
 */

// ── Firestore mock setup ──────────────────────────────────────────────────────

const mockVerifyIdToken  = jest.fn();
const mockEmployeeDocGet = jest.fn();   // db.collection('employees').doc(id).get()
const mockShiftGet       = jest.fn();   // db.collection('shifts').where(...).get()
const mockTxGet          = jest.fn();   // tx.get() inside runTransaction (dup check)
const mockTxSet          = jest.fn();   // tx.set() inside runTransaction

jest.mock('../src/firebase', () => {
  const empDocRef = { get: mockEmployeeDocGet };

  const employeeCollection = {
    doc:   jest.fn().mockReturnValue(empDocRef),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    get:   jest.fn(),   // used by clock-out's where-query (not exercised here)
  };

  const shiftQuery = {
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    get:   mockShiftGet,
  };

  // The new time-record doc reference created inside the transaction
  const newRecordRef = { id: 'new-record-id' };

  const timeRecordQuery = {
    where:   jest.fn().mockReturnThis(),
    limit:   jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    get:     jest.fn(),
    doc:     jest.fn().mockReturnValue(newRecordRef),
  };

  return {
    db: {
      collection: jest.fn(name => {
        if (name === 'employees')   return employeeCollection;
        if (name === 'shifts')      return shiftQuery;
        if (name === 'timeRecords') return timeRecordQuery;
        return {};
      }),
      runTransaction: jest.fn().mockImplementation(async (fn) => {
        const tx = { get: mockTxGet, set: mockTxSet };
        return fn(tx);
      }),
    },
    auth:  { verifyIdToken: mockVerifyIdToken },
    admin: {},
  };
});

// ── App setup ─────────────────────────────────────────────────────────────────

const { haversineDistance } = require('../src/utils/haversine');
const express  = require('express');
const request  = require('supertest');
const timeRecordsRouter = require('../src/routes/timeRecords');

const app = express();
app.use(express.json());
app.use('/api/time-records', timeRecordsRouter);

// ── Shared fixtures ───────────────────────────────────────────────────────────

// Work-site anchor used throughout geofencing tests
const WORK_LAT = 32.0;
const WORK_LNG = 35.0;

const BASE_EMP = {
  name:               'ישראל ישראלי',
  idNumber:           '123456789',
  phone:              '+972501234567',
  workSite:           'משרד',
  locationRestricted: true,
  allowedRadius:      200,          // metres
  location:           { lat: WORK_LAT, lng: WORK_LNG },
};

// ── Setup helpers ─────────────────────────────────────────────────────────────

function authAs(phone = '+972501234567') {
  mockVerifyIdToken.mockResolvedValue({ uid: 'u1', phone_number: phone });
}

function withEmployee(data) {
  mockEmployeeDocGet.mockResolvedValue({ exists: true, data: () => data });
}

function withShiftToday() {
  mockShiftGet.mockResolvedValue({ empty: false, docs: [{ id: 'shift-1' }] });
}

function withNoActiveRecord() {
  mockTxGet.mockResolvedValue({ empty: true, docs: [] });
}

function withActiveRecord() {
  mockTxGet.mockResolvedValue({
    empty: false,
    docs:  [{ id: 'existing-record', data: () => ({}) }],
  });
}

// ── Q3-A: haversineDistance unit tests ────────────────────────────────────────

describe('haversineDistance()', () => {
  test('returns 0 for identical points', () => {
    expect(haversineDistance(32.0, 35.0, 32.0, 35.0)).toBe(0);
  });

  test('returns ~100 m for a point 100 m due north (lat +0.0009°)', () => {
    // 1° latitude ≈ 111 111 m  →  100 m ≈ +0.0009°
    const dist = haversineDistance(WORK_LAT, WORK_LNG, WORK_LAT + 0.0009, WORK_LNG);
    expect(dist).toBeGreaterThan(95);
    expect(dist).toBeLessThan(105);
  });

  test('returns ~350 m for a point 350 m due north (lat +0.00315°)', () => {
    const dist = haversineDistance(WORK_LAT, WORK_LNG, WORK_LAT + 0.00315, WORK_LNG);
    expect(dist).toBeGreaterThan(340);
    expect(dist).toBeLessThan(360);
  });

  test('returns ~54.6 km between Tel Aviv and Jerusalem', () => {
    // Tel Aviv: 32.0853, 34.7818 / Jerusalem: 31.7683, 35.2137
    // Straight-line haversine ≈ 53.9 km (road distance is ~60 km)
    const dist = haversineDistance(32.0853, 34.7818, 31.7683, 35.2137);
    expect(dist).toBeGreaterThan(53_000);
    expect(dist).toBeLessThan(55_000);
  });

  test('is symmetric — dist(A, B) === dist(B, A)', () => {
    const d1 = haversineDistance(32.0, 35.0, 32.5, 35.5);
    const d2 = haversineDistance(32.5, 35.5, 32.0, 35.0);
    expect(Math.abs(d1 - d2)).toBeLessThan(0.001);
  });
});

// ── Q3-B: geofencing via the clock-in endpoint ────────────────────────────────

describe('POST /api/time-records/clock-in — geofencing', () => {
  beforeEach(() => {
    authAs();
    withEmployee(BASE_EMP);
    withShiftToday();
    withNoActiveRecord();
    mockTxSet.mockImplementation(() => {});   // tx.set() is fire-and-forget
  });

  test('allows clock-in from within the 200 m radius (~100 m away)', async () => {
    const res = await request(app)
      .post('/api/time-records/clock-in')
      .set('Authorization', 'Bearer tok')
      .send({ employeeId: 'emp-id', lat: WORK_LAT + 0.0009, lng: WORK_LNG });

    expect(res.status).toBe(200);
    expect(res.body.recordId).toBe('new-record-id');
  });

  test('rejects clock-in from outside the 200 m radius (~350 m away)', async () => {
    const res = await request(app)
      .post('/api/time-records/clock-in')
      .set('Authorization', 'Bearer tok')
      .send({ employeeId: 'emp-id', lat: WORK_LAT + 0.00315, lng: WORK_LNG });

    expect(res.status).toBe(403);
    expect(res.body.distance).toBeGreaterThan(200);
    expect(res.body.allowed).toBe(200);
  });

  test('allows clock-in from any location when locationRestricted=false', async () => {
    withEmployee({ ...BASE_EMP, locationRestricted: false });
    const res = await request(app)
      .post('/api/time-records/clock-in')
      .set('Authorization', 'Bearer tok')
      .send({ employeeId: 'emp-id', lat: 33.0, lng: 36.0 });   // kilometres away

    expect(res.status).toBe(200);
  });

  test('allows clock-in when employee has no location set (new employee)', async () => {
    withEmployee({ ...BASE_EMP, location: undefined });
    const res = await request(app)
      .post('/api/time-records/clock-in')
      .set('Authorization', 'Bearer tok')
      .send({ employeeId: 'emp-id', lat: 33.0, lng: 36.0 });

    expect(res.status).toBe(200);
  });

  test('respects a custom allowedRadius larger than the default 200 m', async () => {
    withEmployee({ ...BASE_EMP, allowedRadius: 500 });
    // ~350 m away — would fail the 200 m default but pass a 500 m radius
    const res = await request(app)
      .post('/api/time-records/clock-in')
      .set('Authorization', 'Bearer tok')
      .send({ employeeId: 'emp-id', lat: WORK_LAT + 0.00315, lng: WORK_LNG });

    expect(res.status).toBe(200);
  });
});

// ── Q3-C: duplicate clock-in prevention ──────────────────────────────────────

describe('POST /api/time-records/clock-in — duplicate prevention', () => {
  beforeEach(() => {
    authAs();
    withEmployee(BASE_EMP);
    withShiftToday();
  });

  test('rejects a second clock-in when already clocked in (transaction guard)', async () => {
    withActiveRecord();   // tx.get() returns a non-empty snapshot

    const res = await request(app)
      .post('/api/time-records/clock-in')
      .set('Authorization', 'Bearer tok')
      .send({ employeeId: 'emp-id', lat: WORK_LAT + 0.0009, lng: WORK_LNG });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/כבר רשום/);
  });

  test('returns 403 noShift when the employee has no shift scheduled today', async () => {
    mockShiftGet.mockResolvedValue({ empty: true, docs: [] });
    withNoActiveRecord();

    const res = await request(app)
      .post('/api/time-records/clock-in')
      .set('Authorization', 'Bearer tok')
      .send({ employeeId: 'emp-id', lat: WORK_LAT + 0.0009, lng: WORK_LNG });

    expect(res.status).toBe(403);
    expect(res.body.noShift).toBe(true);
  });
});

// ── Q3-D: input validation ────────────────────────────────────────────────────

describe('POST /api/time-records/clock-in — input validation', () => {
  beforeEach(() => {
    authAs();
  });

  test('returns 400 when lat is a string instead of a number', async () => {
    const res = await request(app)
      .post('/api/time-records/clock-in')
      .set('Authorization', 'Bearer tok')
      .send({ employeeId: 'emp-id', lat: 'not-a-number', lng: WORK_LNG });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/מיקום/);
  });

  test('returns 400 when lng is NaN', async () => {
    const res = await request(app)
      .post('/api/time-records/clock-in')
      .set('Authorization', 'Bearer tok')
      .send({ employeeId: 'emp-id', lat: WORK_LAT, lng: NaN });

    expect(res.status).toBe(400);
  });

  test('returns 401 when no Authorization header is provided', async () => {
    const res = await request(app)
      .post('/api/time-records/clock-in')
      .send({ employeeId: 'emp-id', lat: WORK_LAT, lng: WORK_LNG });

    expect(res.status).toBe(401);
  });
});
