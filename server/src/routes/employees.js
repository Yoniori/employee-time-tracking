const express = require('express');
const router = express.Router();
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const { db } = require('../firebase');
const verifyToken = require('../middleware/verifyToken');
const requireManager = require('../middleware/requireManager');

// Normalise any Israeli phone number to E.164 (+972...).
// All employee records are stored in this format so that the Firebase phone_number
// JWT claim (always E.164) can be compared against Firestore data correctly.
function normalizePhone(phone) {
  if (!phone) return phone;
  const digits = String(phone).replace(/[\s\-().]/g, '');
  if (digits.startsWith('+')) return digits;           // already E.164
  if (digits.startsWith('972')) return '+' + digits;   // 972501234567
  if (digits.startsWith('0')) return '+972' + digits.slice(1); // 0501234567
  return '+972' + digits;                              // bare local digits
}

// Validate that the normalised number looks like a real Israeli mobile number.
// Israeli mobiles are +972 5X XXXXXXX — 9 digits after the country code, starting with 5.
function validateIsraeliPhone(phone) {
  if (!phone) return 'מספר טלפון הוא שדה חובה';
  const e164 = normalizePhone(phone);
  // +972 followed by exactly 9 digits starting with 5 (e.g. +972501234567)
  if (!/^\+9725\d{8}$/.test(e164)) {
    return 'מספר טלפון לא תקין — יש להזין מספר נייד ישראלי (לדוגמה: 0501234567 או +972501234567)';
  }
  return null; // valid
}

const upload = multer({ storage: multer.memoryStorage() });

// GET all employees (manager only)
router.get('/', verifyToken, requireManager, async (req, res) => {
  try {
    const snap = await db.collection('employees').orderBy('name').get();
    const employees = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json(employees);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create employee
router.post('/', verifyToken, requireManager, async (req, res) => {
  try {
    const data = { ...req.body, active: true, createdAt: new Date() };
    if (data.phone) {
      const phoneError = validateIsraeliPhone(data.phone);
      if (phoneError) return res.status(400).json({ error: phoneError });
      data.phone = normalizePhone(data.phone);
    }
    const ref = await db.collection('employees').add(data);
    res.json({ id: ref.id, ...data });
  } catch (err) {
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
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE (deactivate) employee
router.delete('/:id', verifyToken, requireManager, async (req, res) => {
  try {
    await db.collection('employees').doc(req.params.id).update({ active: false });
    res.json({ success: true });
  } catch (err) {
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
