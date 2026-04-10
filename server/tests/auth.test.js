'use strict';
/**
 * Q1 — Auth & Security
 *
 * Tests verifyToken and requireManager middleware in isolation.
 * Firebase is fully mocked — no real credentials needed.
 */

// mock-prefixed variables are accessible inside jest.mock factories
// even after hoisting, per Jest's CommonJS module mock behaviour.
const mockVerifyIdToken = jest.fn();

jest.mock('../src/firebase', () => ({
  auth: { verifyIdToken: mockVerifyIdToken },
  db: {},
  admin: {},
}));

const verifyToken  = require('../src/middleware/verifyToken');
const requireManager = require('../src/middleware/requireManager');

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeRes() {
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
}

// ── verifyToken ───────────────────────────────────────────────────────────────

describe('verifyToken middleware', () => {
  test('returns 401 when Authorization header is absent', async () => {
    const req  = { headers: {} };
    const res  = makeRes();
    const next = jest.fn();

    await verifyToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 401 when scheme is not Bearer', async () => {
    const req  = { headers: { authorization: 'Basic dXNlcjpwYXNz' } };
    const res  = makeRes();
    const next = jest.fn();

    await verifyToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 401 when Firebase rejects the token', async () => {
    mockVerifyIdToken.mockRejectedValue(
      Object.assign(new Error('Token expired'), { code: 'auth/id-token-expired' })
    );
    const req  = { headers: { authorization: 'Bearer expired.token.here' } };
    const res  = makeRes();
    const next = jest.fn();

    await verifyToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid token' });
    expect(next).not.toHaveBeenCalled();
  });

  test('calls next() and attaches decoded payload to req.user on a valid token', async () => {
    const decoded = { uid: 'user-abc', phone_number: '+972501234567', role: 'employee' };
    mockVerifyIdToken.mockResolvedValue(decoded);
    const req  = { headers: { authorization: 'Bearer valid.id.token' } };
    const res  = makeRes();
    const next = jest.fn();

    await verifyToken(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toEqual(decoded);
    expect(res.status).not.toHaveBeenCalled();
  });

  test('preserves all custom claims (role, email, phone_number) on req.user', async () => {
    const decoded = {
      uid:          'mgr-xyz',
      email:        'manager@company.com',
      phone_number: '+972521111111',
      role:         'manager',
    };
    mockVerifyIdToken.mockResolvedValue(decoded);
    const req  = { headers: { authorization: 'Bearer manager.token' } };
    const res  = makeRes();
    const next = jest.fn();

    await verifyToken(req, res, next);

    expect(req.user.role).toBe('manager');
    expect(req.user.email).toBe('manager@company.com');
    expect(req.user.phone_number).toBe('+972521111111');
  });
});

// ── requireManager ────────────────────────────────────────────────────────────

describe('requireManager middleware', () => {
  test('returns 403 when req.user is absent (verifyToken was skipped)', () => {
    const req  = {};
    const res  = makeRes();
    const next = jest.fn();

    requireManager(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Manager access required' });
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 403 when req.user has no role claim', () => {
    const req  = { user: { uid: 'u1', phone_number: '+972501111111' } };
    const res  = makeRes();
    const next = jest.fn();

    requireManager(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 403 for role="employee"', () => {
    const req  = { user: { uid: 'u2', role: 'employee' } };
    const res  = makeRes();
    const next = jest.fn();

    requireManager(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('calls next() when role is exactly "manager"', () => {
    const req  = { user: { uid: 'mgr-1', role: 'manager' } };
    const res  = makeRes();
    const next = jest.fn();

    requireManager(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  test('returns 403 for role="MANAGER" — check is case-sensitive', () => {
    const req  = { user: { uid: 'u3', role: 'MANAGER' } };
    const res  = makeRes();
    const next = jest.fn();

    requireManager(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
