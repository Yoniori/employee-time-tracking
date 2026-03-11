const express = require('express');
const router = express.Router();
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const { db } = require('../firebase');
const verifyToken = require('../middleware/verifyToken');

const upload = multer({ storage: multer.memoryStorage() });

// GET all employees (manager only)
router.get('/', verifyToken, async (req, res) => {
  try {
    const snap = await db.collection('employees').orderBy('name').get();
    const employees = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json(employees);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create employee
router.post('/', verifyToken, async (req, res) => {
  try {
    const data = { ...req.body, active: true, createdAt: new Date() };
    const ref = await db.collection('employees').add(data);
    res.json({ id: ref.id, ...data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update employee
router.put('/:id', verifyToken, async (req, res) => {
  try {
    await db.collection('employees').doc(req.params.id).update(req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE (deactivate) employee
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    await db.collection('employees').doc(req.params.id).update({ active: false });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST CSV upload
// CSV format: שם,תעודת_זהות,מספר_טלפון,אתר_עבודה,קו_רוחב,קו_אורך
router.post('/upload-csv', verifyToken, upload.single('file'), async (req, res) => {
  try {
    const content = req.file.buffer.toString('utf-8');
    const records = parse(content, { columns: true, skip_empty_lines: true, trim: true });

    const batch = db.batch();
    const results = [];

    for (const row of records) {
      const name = row['שם'] || row['name'];
      const idNumber = row['תעודת_זהות'] || row['idNumber'];
      const phone = row['מספר_טלפון'] || row['phone'];
      const workSite = row['אתר_עבודה'] || row['workSite'];
      const lat = parseFloat(row['קו_רוחב'] || row['lat'] || 0);
      const lng = parseFloat(row['קו_אורך'] || row['lng'] || 0);

      if (!name || !idNumber || !phone) continue;

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
