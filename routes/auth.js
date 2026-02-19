const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { pool } = require("../lib/db"); 
const { auth } = require('../middleware/auth');
const router = express.Router();


router.post("/register", (req, res) => {
  const { email, username, password } = req.body ?? {};
  if (!email || !username || !password) {
    return res.status(400).json({ error: "Brak wymaganych pól" });
  }
  const sel = "SELECT id FROM users WHERE email=? LIMIT 1";
  
  
  pool.query(sel, [email], (e, rows) => {
    if (e) return res.status(500).json({ error: "Błąd serwera" });
    if (rows.length) return res.status(409).json({ error: "Email zajęty" });

    const hash = bcrypt.hashSync(password, 10);
    const ins = "INSERT INTO users (username,email,password) VALUES (?,?,?)";
    
    
    pool.query(ins, [username, email, hash], (err, result) => {
      if (err) return res.status(500).json({ error: "Błąd serwera" });
      const userId = result.insertId;
      const token = jwt.sign({ sub: userId, role: "free" }, process.env.JWT_SECRET, { expiresIn: "7d" });
      res.json({ message: "Użytkownik zarejestrowany", token, user: { id: userId, email, username, role: "free" } });
    });
  });
});


router.post("/login", (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) return res.status(400).json({ error: "Brak wymaganych pól" });

  const q = "SELECT id, username, email, password, role FROM users WHERE email=? LIMIT 1";
  
  
  pool.query(q, [email], (err, rows) => {
    if (err) {
      console.error("Login DB error:", err);
      return res.status(500).json({ error: "Błąd serwera" });
    }
    if (!rows.length) return res.status(401).json({ error: "Nieprawidłowy login lub hasło" });

    const u = rows[0];
    const ok = bcrypt.compareSync(password, u.password);
    if (!ok) return res.status(401).json({ error: "Nieprawidłowy login lub hasło" });

    const token = jwt.sign(
      { sub: u.id, email: u.email, username: u.username || null, role: u.role || 'user' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    console.log("JWT:", token);
    res.json({ message: "Zalogowano", token, user: { id: u.id, email: u.email, username: u.username, role: u.role || "free" } });
  });
});

router.get('/me', auth(true), (req, res) => {
  const userId = req.user.id;
  
  const q = `
    SELECT 
      u.id, u.username, u.email, u.role, u.unit_system, u.notif_enabled, u.daily_steps,
      (SELECT w.weight FROM weight_logs w WHERE w.user_id = u.id ORDER BY w.date_logged DESC LIMIT 1) AS latest_weight
    FROM users u 
    WHERE u.id = ? 
    LIMIT 1
  `;
  
  
  pool.query(q, [userId], (err, rows) => {
    if (err) {
      console.error("Błąd /me:", err);
      return res.status(500).json({ error: "Błąd serwera" });
    }
    if (!rows.length) return res.status(404).json({ error: "Użytkownik nie istnieje" });

    const u = rows[0];
    res.json({
      id: u.id,
      email: u.email,
      username: u.username,
      role: u.role,
      unitSystem: u.unit_system || 'metric',
      notifEnabled: !!u.notif_enabled,
      dailySteps: u.daily_steps || 10000,
      latestWeight: u.latest_weight 
    });
  });
});

module.exports = router;