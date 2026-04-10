const express = require('express');
const router = express.Router();
const { db } = require('../firebase');
const verifyToken = require('../middleware/verifyToken');
const requireManager = require('../middleware/requireManager');
const { writeAuditLog } = require('../utils/auditLog');
const { normalizePhone, validateIsraeliPhone, phoneVariants } = require('../utils/phone');

// ─── POST /api/signup ─────────────────────────────────────────────────────────
// Public — no authentication required.
// Creates a pending signup request in the employeeSignupRequests collection.
// Does NOT create the employee directly.
router.post('/', async (req, res) => {
  const { fullName, idNumber, phone, note } = req.body;

  // ── Validation ────────────────────────────────────────────────────────────
  if (!fullName || !fullName.trim()) {
    return res.status(400).json({ error: 'שם מלא הוא שדה חובה' });
  }
  if (!idNumber || !/^\d{9}$/.test(String(idNumber).trim())) {
    return res.status(400).json({ error: 'מספר תעודת זהות לא תקין — נדרשות בדיוק 9 ספרות' });
  }
  const phoneError = validateIsraeliPhone(phone);
  if (phoneError) return res.status(400).json({ error: phoneError });

  const normalizedPhone = normalizePhone(phone);
  const normalizedId = String(idNumber).trim();

  try {
    // ── Duplicate checks ─────────────────────────────────────────────────────
    // 1. Active employee with same ID number?
    const empByIdSnap = await db.collection('employees')
      .where('idNumber', '==', normalizedId)
      .limit(5)
      .get();
    const activeEmpById = empByIdSnap.docs.find(d => d.data().active !== false);
    if (activeEmpById) {
      return res.status(409).json({ error: 'קיים כבר עובד פעיל במערכת עם תעודת זהות זו' });
    }

    // 2. ACTIVE employee with same phone?
    // Inactive employees (active === false) do not block re-registration —
    // the approval flow will reactivate the existing record instead.
    const empByPhoneSnap = await db.collection('employees')
      .where('phone', 'in', phoneVariants(normalizedPhone))
      .limit(5)
      .get();
    const activeEmpByPhone = empByPhoneSnap.docs.find(d => d.data().active !== false);
    if (activeEmpByPhone) {
      return res.status(409).json({ error: 'קיים כבר עובד פעיל במערכת עם מספר טלפון זה' });
    }

    // 3. Pending signup request with same ID number?
    const dupByIdSnap = await db.collection('employeeSignupRequests')
      .where('idNumber', '==', normalizedId)
      .limit(10)
      .get();
    const pendingDupById = dupByIdSnap.docs.find(d => d.data().status === 'pending');
    if (pendingDupById) {
      return res.status(409).json({ error: 'קיימת כבר בקשת הצטרפות פתוחה עם תעודת זהות זו' });
    }

    // 4. Pending signup request with same phone?
    const dupByPhoneSnap = await db.collection('employeeSignupRequests')
      .where('phone', 'in', phoneVariants(normalizedPhone))
      .limit(10)
      .get();
    const pendingDupByPhone = dupByPhoneSnap.docs.find(d => d.data().status === 'pending');
    if (pendingDupByPhone) {
      return res.status(409).json({ error: 'קיימת כבר בקשת הצטרפות פתוחה עם מספר טלפון זה' });
    }

    // ── Create the pending request ────────────────────────────────────────────
    const ref = db.collection('employeeSignupRequests').doc();
    await ref.set({
      fullName: fullName.trim(),
      idNumber: normalizedId,
      phone:    normalizedPhone,   // stored as E.164 — same format as all employees
      note:     (note || '').trim(),
      status:   'pending',
      createdAt: new Date(),
    });

    res.json({ requestId: ref.id });
  } catch (err) {
    console.error('[POST /signup]', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/signup/requests ─────────────────────────────────────────────────
// Manager only — returns all pending signup requests, sorted oldest first.
router.get('/requests', verifyToken, requireManager, async (req, res) => {
  try {
    const snap = await db.collection('employeeSignupRequests')
      .where('status', '==', 'pending')
      .limit(200)
      .get();
    const requests = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0));
    res.json(requests);
  } catch (err) {
    console.error('[GET /signup/requests]', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/signup/requests/:id/approve ────────────────────────────────────
// Manager approves a signup request:
//   1. Re-validates no conflicting employee was added in the meantime
//   2. Batch: marks request approved + creates employee record
router.post('/requests/:id/approve', verifyToken, requireManager, async (req, res) => {
  try {
    const reqDoc = await db.collection('employeeSignupRequests').doc(req.params.id).get();
    if (!reqDoc.exists) return res.status(404).json({ error: 'בקשה לא נמצאה' });
    const r = reqDoc.data();
    if (r.status !== 'pending') return res.status(409).json({ error: 'בקשה זו כבר טופלה' });

    // Re-check conflicts (another employee may have been added since the request was submitted)
    const empByIdSnap = await db.collection('employees')
      .where('idNumber', '==', r.idNumber)
      .limit(5)
      .get();
    const activeEmpById = empByIdSnap.docs.find(d => d.data().active !== false);
    if (activeEmpById) {
      return res.status(409).json({ error: 'כבר קיים עובד פעיל עם תעודת זהות זו — לא ניתן לאשר' });
    }

    const empByPhoneSnap = await db.collection('employees')
      .where('phone', 'in', phoneVariants(r.phone))
      .limit(5)
      .get();
    // Only active employees block approval — inactive records will be reactivated below.
    const activeEmpByPhone = empByPhoneSnap.docs.find(d => d.data().active !== false);
    if (activeEmpByPhone) {
      return res.status(409).json({ error: 'כבר קיים עובד פעיל עם מספר טלפון זה — לא ניתן לאשר' });
    }

    // ── Reactivate existing inactive employee, or create a new record ─────────
    // Prefer reactivation: the old doc ID is already referenced in shifts and
    // timeRecords for this person, so reusing it restores their full history.
    const inactiveEmployee =
      empByIdSnap.docs.find(d => d.data().active === false) ||
      empByPhoneSnap.docs.find(d => d.data().active === false);

    const batch = db.batch();
    batch.update(reqDoc.ref, { status: 'approved', reviewedAt: new Date() });

    let resolvedEmployeeId;

    if (inactiveEmployee) {
      // Reactivation path — update existing record, preserve doc ID and history
      batch.update(inactiveEmployee.ref, {
        name:              r.fullName,
        idNumber:          r.idNumber,
        phone:             r.phone,
        active:            true,
        reactivatedAt:     new Date(),
        fromSignupRequest: req.params.id,
      });
      resolvedEmployeeId = inactiveEmployee.id;
    } else {
      // New-record path — no prior employee found at all
      const empRef = db.collection('employees').doc();
      batch.set(empRef, {
        name:               r.fullName,
        idNumber:           r.idNumber,
        phone:              r.phone,        // already E.164 from submission
        workSite:           '',             // no work site during self-registration
        locationRestricted: false,
        active:             true,
        createdAt:          new Date(),
        fromSignupRequest:  req.params.id,
      });
      resolvedEmployeeId = empRef.id;
    }

    await batch.commit();

    writeAuditLog({
      action:     'signup_request_approved',
      actorUid:   req.user.uid,
      actorEmail: req.user.email || null,
      targetType: 'employeeSignupRequest',
      targetId:   req.params.id,
      meta:       {
        fullName:            r.fullName,
        idNumber:            r.idNumber,
        employeeId:          resolvedEmployeeId,
        reactivated:         !!inactiveEmployee,
      },
    });

    res.json({ employeeId: resolvedEmployeeId });
  } catch (err) {
    console.error('[POST /signup/requests/:id/approve]', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/signup/requests/:id/reject ─────────────────────────────────────
// Manager rejects a signup request — no employee is created.
router.post('/requests/:id/reject', verifyToken, requireManager, async (req, res) => {
  try {
    const reqDoc = await db.collection('employeeSignupRequests').doc(req.params.id).get();
    if (!reqDoc.exists) return res.status(404).json({ error: 'בקשה לא נמצאה' });
    if (reqDoc.data().status !== 'pending') {
      return res.status(409).json({ error: 'בקשה זו כבר טופלה' });
    }
    const rData = reqDoc.data();
    await reqDoc.ref.update({ status: 'rejected', reviewedAt: new Date() });

    writeAuditLog({
      action:     'signup_request_rejected',
      actorUid:   req.user.uid,
      actorEmail: req.user.email || null,
      targetType: 'employeeSignupRequest',
      targetId:   req.params.id,
      meta:       { fullName: rData.fullName, idNumber: rData.idNumber },
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('[POST /signup/requests/:id/reject]', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
