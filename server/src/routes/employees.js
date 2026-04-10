const express = require('express');
const router = express.Router();
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const { db } = require('../firebase');
const verifyToken = require('../middleware/verifyToken');
const requireManager = require('../middleware/requireManager');
const { writeAuditLog } = require('../utils/auditLog');
const { normalizePhone, validateIsraeliPhone } = require('../utils/phone');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
});

// GET all employees (manager only) — active employees only
// Filter in JS to avoid requiring a Firestore composite index on (active + name)
router.get('/', verifyToken, requireManager, async (req, res) => {
  try {
    const snap = await db.collection('employees').orderBy('name').get();
    const employees = snap.docs
      .filter(d => d.data().active !== false)
      .map(d => ({ id: d.id, ...d.data() }));
    res.json(employees);
  } catch (err) {
    console.error('[GET /employees]', err);
    res.status(500).json({ error: err.message });
  }
});

// POST create employee
// location and allowedRadius are optional — employees without a location
// can clock in from anywhere (locationRestricted defaults to false when no location given)
router.post('/', verifyToken, requireManager, async (req, res) => {
  try {
    const data = { ...req.body, active: true, createdAt: new Date() };
    if (data.phone) {
      const phoneError = validateIsraeliPhone(data.phone);
      if (phoneError) return res.status(400).json({ error: phoneError });
      data.phone = normalizePhone(data.phone);
    }
    // If no location was supplied, mark as unrestricted
    if (!data.location?.lat && !data.location?.lng) {
      data.locationRestricted = false;
      delete data.location;
      delete data.allowedRadius;
    } else {
      // Location provided — enable restriction unless caller set it explicitly
      if (data.locationRestricted === undefined) data.locationRestricted = true;
      data.allowedRadius = data.allowedRadius || 200;
    }
    const ref = await db.collection('employees').add(data);
    res.json({ id: ref.id, ...data });
  } catch (err) {
    console.error('[POST /employees]', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT update employee
router.put('/:id', verifyToken, requireManager, async (req, res) => {
  try {
    const data = { ...req.body };
    if (data.phone) {
      const phoneError = validateIsraeliPhone(data.phone);
      if (phoneError) return res.status(400).json({ error: phoneError });
      data.phone = normalizePhone(data.phone);
    }
    await db.collection('employees').doc(req.params.id).update(data);

    // Log when location restriction settings are changed
    const locationFields = ['locationRestricted', 'location', 'allowedRadius'];
    if (locationFields.some(f => f in data)) {
      writeAuditLog({
        action:     'employee_location_restriction_changed',
        actorUid:   req.user.uid,
        actorEmail: req.user.email || null,
        targetType: 'employee',
        targetId:   req.params.id,
        meta: {
          locationRestricted: data.locationRestricted,
          allowedRadius:      data.allowedRadius,
          hasLocation:        !!(data.location?.lat || data.location?.lng),
        },
      });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[PUT /employees/:id]', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE (deactivate) employee
router.delete('/:id', verifyToken, requireManager, async (req, res) => {
  try {
    const empDoc = await db.collection('employees').doc(req.params.id).get();
    await db.collection('employees').doc(req.params.id).update({ active: false });

    writeAuditLog({
      action:     'employee_deactivated',
      actorUid:   req.user.uid,
      actorEmail: req.user.email || null,
      targetType: 'employee',
      targetId:   req.params.id,
      meta:       {
        name:     empDoc.exists ? empDoc.data().name     : null,
        idNumber: empDoc.exists ? empDoc.data().idNumber : null,
      },
    });

    res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /employees/:id]', err);
    res.status(500).json({ error: err.message });
  }
});

// POST CSV upload
// CSV format: שם,תעודת_זהות,מספר_טלפון,אתר_עבודה,קו_רוחב,קו_אורך
router.post('/upload-csv', verifyToken, requireManager, upload.single('file'), async (req, res) => {
  try {
    const content = req.file.buffer.toString('utf-8');
    const records = parse(content, { columns: true, skip_empty_lines: true, trim: true });

    const batch = db.batch();
    const results = [];

    for (const row of records) {
      const name = row['שם'] || row['name'];
      const idNumber = row['תעודת_זהות'] || row['idNumber'];
      const phone = normalizePhone(row['מספר_טלפון'] || row['phone']);
      const workSite = row['אתר_עבודה'] || row['workSite'];
      const lat = parseFloat(row['קו_רוחב'] || row['lat'] || 0);
      const lng = parseFloat(row['קו_אורך'] || row['lng'] || 0);

      if (!name || !idNumber || !phone) continue;

      // Validate phone before normalising — skip and report invalid rows
      const phoneError = validateIsraeliPhone(phone);
      if (phoneError) {
        results.push({ idNumber, action: 'skipped', reason: phoneError });
        continue;
      }

      // Check if exists
      const existing = await db.collection('employees')
        .where('idNumber', '==', String(idNumber))
        .limit(1).get();

      if (!existing.empty) {
        const ref = existing.docs[0].ref;
        batch.update(ref, { name, phone, workSite, location: { lat, lng }, active: true });
        results.push({ idNumber, action: 'updated' });
      } else {
        const ref = db.collection('employees').doc();
        batch.set(ref, {
          name,
          idNumber: String(idNumber),
          phone,
          workSite,
          location: { lat, lng },
          allowedRadius: 200,
          active: true,
          createdAt: new Date(),
        });
        results.push({ idNumber, action: 'created' });
      }
    }

    await batch.commit();
    res.json({ imported: results.length, results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
