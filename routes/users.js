const express = require("express");
const { pool } = require("../lib/db"); // ⭐️ ZMIANA: Importujemy 'pool'
const { auth } = require("../middleware/auth");
const router = express.Router();
const bcrypt = require('bcryptjs');

// Stare definicje (można usunąć, jeśli questionnaire.js już ich nie używa)
const REQUIRED = [
  'age','weight','height','gender','goal','motivation','experience',
  'activityLevel','sleepHours','workType','availableDays','sessionLength'
];
const isMissing = (v) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
const norm = (v) => (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) ? null : v;


// Te endpointy /questionnaire są teraz w questionnaireController.js
// Usuwamy je, aby uniknąć konfliktu.

// ... (Usunięto stare /:id/questionnaire, /:id/questionnaire, /:id/questionnaire/submit) ...


router.put('/me/settings', auth(true), (req, res) => {
  const { unitSystem, notifEnabled, dailySteps } = req.body ?? {};
  const allowedUnits = ['metric','imperial'];

  const fields = [];
  const values = [];

  if (unitSystem && allowedUnits.includes(unitSystem)) {
    fields.push('unit_system=?');
    values.push(unitSystem);
  }
  if (typeof notifEnabled === 'boolean') {
    fields.push('notif_enabled=?');
    values.push(notifEnabled ? 1 : 0);
  }
  if (typeof dailySteps === 'number' && dailySteps > 0) {
    fields.push('daily_steps=?');
    values.push(dailySteps);
  }

  if (!fields.length) {
    return res.status(400).json({ error: 'Brak poprawnych pól do aktualizacji' });
  }

  values.push(req.user.id);
  const sql = `UPDATE users SET ${fields.join(', ')} WHERE id=?`;

  // ⭐️ ZMIANA: db.query -> pool.query
  pool.query(sql, values, (err) => {
    if (err) return res.status(500).json({ error: 'Błąd serwera' });
    res.json({ ok: true });
  });
});

router.post('/me/change-password', auth(true), (req, res) => {
  const { currentPassword, newPassword } = req.body ?? {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Brak wymaganych pól' });
  }

  const q = "SELECT password FROM users WHERE id=? LIMIT 1";
  
  // ⭐️ ZMIANA: db.query -> pool.query
  pool.query(q, [req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Błąd serwera' });
    if (!rows.length) return res.status(404).json({ error: 'Użytkownik nie istnieje' });

    const hash = rows[0].password;
    const ok = bcrypt.compareSync(currentPassword, hash);
    if (!ok) return res.status(401).json({ error: 'Nieprawidłowe aktualne hasło' });

    const newHash = bcrypt.hashSync(newPassword, 10);
    
    // ⭐️ ZMIANA: db.query -> pool.query
    pool.query("UPDATE users SET password=? WHERE id=?", [newHash, req.user.id], (err2) => {
      if (err2) return res.status(500).json({ error: 'Błąd serwera' });
      res.json({ ok: true });
    });
  });
});

module.exports = router;