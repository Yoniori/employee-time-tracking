'use strict';
/**
 * Q2 — Signup & Duplicate Detection
 *
 * Tests the POST /api/signup endpoint logic:
 *   - Input validation
 *   - Duplicate active employee by ID / phone → 409
 *   - Inactive employee does NOT block re-registration (reactivation path)
 *   - Pending-request duplicates → 409
 *   - Phone normalisation (V1 centralisation): local "0..." → E.164 "+972..."
 */

// ── Firestore mock setup ──────────────────────────────────────────────────────
//
// signup.js issues up to 4 sequential Firestore reads in POST /:
//   1. employees   where idNumber == ?      (active dup by ID)
//   2. employees   where phone in [...]     (active dup by phone)
//   3. signupReqs  where idNumber == ?      (pending dup by ID)
//   4. signupReqs  where phone in [...]     (pending dup by phone)
//
// We model each collection as an independent query object whose .get() is a
// jest.fn() — tests queue results via mockResolvedValueOnce().

const mockEmployeeGet  = jest.fn();
const mockRequestGet   = jest.fn();
const mockDocSet       = jest.fn().mockResolvedValue(undefined);
const mockBatchCommit  = jest.fn().mockResolvedValue(undefined);
const mockVerifyIdToken = jest.fn();

jest.mock('../src/firebase', () => {
  const employeeQuery = {
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    get:   mockEmployeeGet,
  };

  const requestDocRef = { id: 'new-req-id', set: mockDocSet };

  const requestQuery = {
    where:  jest.fn().mockReturnThis(),
    limit:  jest.fn().mockReturnThis(),
    get:    mockRequestGet,
    doc:    jest.fn().mockReturnValue(requestDocRef),
  };

  const mockBatch = {
    set:    jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    commit: mockBatchCommit,
  };

  return {
    db: {
      collection: jest.fn(name =>
        name === 'employees' ? employeeQuery : requestQuery
      ),
      batch: jest.fn().mockReturnValue(mockBatch),
    },
    auth:  { verifyIdToken: mockVerifyIdToken },
    admin: {},
  };
});

jest.mock('../src/utils/auditLog', () => ({ writeAuditLog: jest.fn() }));

// ── App setup ─────────────────────────────────────────────────────────────────

const express    = require('express');
const request    = require('supertest');
const signupRouter = require('../src/routes/signup');

const app = express();
app.use(express.json());
app.use('/api/signup', signupRouter);

// ── Test helpers ──────────────────────────────────────────────────────────────

/**
 * Build a Firestore-snapshot-like object from an array of plain data objects.
 */
function makeSnap(rows = []) {
  return {
    empty: rows.length === 0,
    docs:  rows.map((data, i) => ({
      id:   `doc-${i}`,
      data: () => data,
      ref:  {
        update: jest.fn().mockResolvedValue(undefined),
        set:    jest.fn().mockResolvedValue(undefined),
      },
    })),
  };
}

/**
 * Prime the mocks for a fully clean signup:
 * no existing employees, no existing pending requests.
 */
function setCleanSignup() {
  mockEmployeeGet
    .mockResolvedValueOnce(makeSnap([]))   // check by ID
    .mockResolvedValueOnce(makeSnap([]));  // check by phone
  mockRequestGet
    .mockResolvedValueOnce(makeSnap([]))   // pending by ID
    .mockResolvedValueOnce(makeSnap([]));  // pending by phone
}

const VALID_BODY = { fullName: 'ישראל ישראלי', idNumber: '123456789', phone: '0501234567' };

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/signup — input validation', () => {
  test('returns 400 when fullName is missing', async () => {
    const res = await request(app).post('/api/signup')
      .send({ idNumber: '123456789', phone: '0501234567' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/שם מלא/);
  });

  test('returns 400 when fullName is whitespace-only', async () => {
    const res = await request(app).post('/api/signup')
      .send({ fullName: '   ', idNumber: '123456789', phone: '0501234567' });
    expect(res.status).toBe(400);
  });

  test('returns 400 when idNumber has fewer than 9 digits', async () => {
    const res = await request(app).post('/api/signup')
      .send({ fullName: 'ישראל', idNumber: '12345678', phone: '0501234567' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/תעודת זהות/);
  });

  test('returns 400 when idNumber has more than 9 digits', async () => {
    const res = await request(app).post('/api/signup')
      .send({ fullName: 'ישראל', idNumber: '1234567890', phone: '0501234567' });
    expect(res.status).toBe(400);
  });

  test('returns 400 when idNumber contains non-digits', async () => {
    const res = await request(app).post('/api/signup')
      .send({ fullName: 'ישראל', idNumber: 'ABCDEFGHI', phone: '0501234567' });
    expect(res.status).toBe(400);
  });

  test('returns 400 when phone is a landline (02-xxxxxxx)', async () => {
    const res = await request(app).post('/api/signup')
      .send({ fullName: 'ישראל', idNumber: '123456789', phone: '021234567' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  test('returns 400 when phone is missing', async () => {
    const res = await request(app).post('/api/signup')
      .send({ fullName: 'ישראל', idNumber: '123456789' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/signup — duplicate detection', () => {
  test('returns 409 when an ACTIVE employee with the same ID already exists', async () => {
    mockEmployeeGet.mockResolvedValueOnce(
      makeSnap([{ idNumber: '123456789', active: true, phone: '+972501111111' }])
    );
    const res = await request(app).post('/api/signup').send(VALID_BODY);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/תעודת זהות/);
  });

  test('returns 409 when an ACTIVE employee with the same phone already exists', async () => {
    mockEmployeeGet
      .mockResolvedValueOnce(makeSnap([]))   // no match by ID
      .mockResolvedValueOnce(
        makeSnap([{ phone: '+972501234567', active: true, idNumber: '999999999' }])
      );
    const res = await request(app).post('/api/signup').send(VALID_BODY);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/טלפון/);
  });

  test('does NOT block when the only matching employee is inactive (reactivation path)', async () => {
    // An inactive employee with the same ID should not block — they will be
    // reactivated at approval time instead of a new record being created.
    mockEmployeeGet
      .mockResolvedValueOnce(
        makeSnap([{ idNumber: '123456789', active: false, phone: '+972501234567' }])
      )
      .mockResolvedValueOnce(makeSnap([]));   // no active match by phone either
    mockRequestGet
      .mockResolvedValueOnce(makeSnap([]))
      .mockResolvedValueOnce(makeSnap([]));

    const res = await request(app).post('/api/signup').send(VALID_BODY);
    expect(res.status).toBe(200);
    expect(res.body.requestId).toBe('new-req-id');
  });

  test('returns 409 when a PENDING request with the same ID already exists', async () => {
    mockEmployeeGet
      .mockResolvedValueOnce(makeSnap([]))
      .mockResolvedValueOnce(makeSnap([]));
    mockRequestGet.mockResolvedValueOnce(
      makeSnap([{ idNumber: '123456789', status: 'pending' }])
    );
    const res = await request(app).post('/api/signup').send(VALID_BODY);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/בקשת הצטרפות/);
  });

  test('returns 409 when a PENDING request with the same phone already exists', async () => {
    mockEmployeeGet
      .mockResolvedValueOnce(makeSnap([]))
      .mockResolvedValueOnce(makeSnap([]));
    mockRequestGet
      .mockResolvedValueOnce(makeSnap([]))   // no pending by ID
      .mockResolvedValueOnce(
        makeSnap([{ phone: '+972501234567', status: 'pending' }])
      );
    const res = await request(app).post('/api/signup').send(VALID_BODY);
    expect(res.status).toBe(409);
  });

  test('does NOT block when the only matching request is already approved (not pending)', async () => {
    mockEmployeeGet
      .mockResolvedValueOnce(makeSnap([]))
      .mockResolvedValueOnce(makeSnap([]));
    mockRequestGet
      .mockResolvedValueOnce(
        makeSnap([{ idNumber: '123456789', status: 'approved' }])
      )
      .mockResolvedValueOnce(makeSnap([]));
    const res = await request(app).post('/api/signup').send(VALID_BODY);
    expect(res.status).toBe(200);
  });
});

describe('POST /api/signup — phone normalisation (V1)', () => {
  test('stores phone in E.164 format when submitted in local "05X" format', async () => {
    setCleanSignup();
    await request(app).post('/api/signup')
      .send({ fullName: 'ישראל', idNumber: '123456789', phone: '0501234567' });
    const stored = mockDocSet.mock.calls[0][0];
    expect(stored.phone).toBe('+972501234567');
  });

  test('accepts phone already in E.164 format and stores it unchanged', async () => {
    setCleanSignup();
    const res = await request(app).post('/api/signup')
      .send({ fullName: 'ישראל', idNumber: '123456789', phone: '+972501234567' });
    expect(res.status).toBe(200);
    const stored = mockDocSet.mock.calls[0][0];
    expect(stored.phone).toBe('+972501234567');
  });

  test('both formats of the same number are treated as identical (no double-registration)', async () => {
    // Active employee stored with E.164 phone — a signup with local format should still conflict.
    mockEmployeeGet
      .mockResolvedValueOnce(makeSnap([]))   // no match by ID
      .mockResolvedValueOnce(
        makeSnap([{ phone: '+972501234567', active: true, idNumber: '999999999' }])
      );
    // phoneVariants() produces both "+972..." and "0..." so the where-in query
    // will match the stored E.164 value even when the user submits "0501234567".
    const res = await request(app).post('/api/signup')
      .send({ fullName: 'ישראל', idNumber: '123456789', phone: '0501234567' });
    expect(res.status).toBe(409);
  });
});

describe('POST /api/signup — successful submission', () => {
  test('returns 200 with a requestId on a clean signup', async () => {
    setCleanSignup();
    const res = await request(app).post('/api/signup').send(VALID_BODY);
    expect(res.status).toBe(200);
    expect(res.body.requestId).toBe('new-req-id');
  });

  test('trims whitespace from fullName before storing', async () => {
    setCleanSignup();
    await request(app).post('/api/signup')
      .send({ fullName: '  ישראל ישראלי  ', idNumber: '123456789', phone: '0501234567' });
    const stored = mockDocSet.mock.calls[0][0];
    expect(stored.fullName).toBe('ישראל ישראלי');
  });

  test('stores status="pending" and a createdAt timestamp', async () => {
    setCleanSignup();
    await request(app).post('/api/signup').send(VALID_BODY);
    const stored = mockDocSet.mock.calls[0][0];
    expect(stored.status).toBe('pending');
    expect(stored.createdAt).toBeInstanceOf(Date);
  });
});
