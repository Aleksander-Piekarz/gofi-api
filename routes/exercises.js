const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const ctrl = require('../controllers/exerciseController');
const { pool } = require('../lib/db'); 

// =====================================================
// Custom Exercises - własne ćwiczenia użytkownika
// UWAGA: Te routes MUSZĄ być przed /:code, inaczej "custom" zostanie potraktowane jako code!
// =====================================================

// Pobierz własne ćwiczenia użytkownika
router.get('/custom/list', auth(true), ctrl.getUserCustomExercises);

// Utwórz nowe własne ćwiczenie
router.post('/custom', auth(true), ctrl.createCustomExercise);

// Aktualizuj własne ćwiczenie
router.put('/custom/:id', auth(true), ctrl.updateCustomExercise);

// Usuń własne ćwiczenie
router.delete('/custom/:id', auth(true), ctrl.deleteCustomExercise);

// =====================================================
// Standard Exercises
// =====================================================

// Pobierz listę wszystkich ćwiczeń (z filtrowaniem i paginacją)
router.get('/', auth(true), ctrl.getAllExercises);

// Pobierz unikalne partie mięśniowe
router.get('/muscles', auth(true), ctrl.getMuscleGroups);

// Pobierz unikalne typy sprzętu
router.get('/equipment', auth(true), ctrl.getEquipmentTypes);

// Wyszukiwanie ćwiczeń (stara wersja dla kompatybilności)
router.get('/search', auth(true), async (req,res) => {
  const { pattern, muscle, equip, loc } = req.query;
  const where = [];
  const args = [];
  
  if (pattern) { where.push('pattern=?'); args.push(pattern); }
  
  if (muscle)  { 
    where.push('(primary_muscle = ? OR FIND_IN_SET(?, secondary_muscles))'); 
    args.push(muscle, muscle); 
  }
  if (equip)   { where.push('FIND_IN_SET(?, equipment)'); args.push(equip); }
  if (loc)     { where.push('FIND_IN_SET(?, location)'); args.push(loc); }

  const sql = `SELECT code, name_en, name_pl, primary_muscle, pattern, equipment, location, difficulty FROM exercises` +
              (where.length ? ` WHERE ${where.join(' AND ')}` : '') + ` LIMIT 100`;
  
  
  const [rows] = await pool.promise().query(sql, args);
  res.json(rows);
});

// Pobierz pełne dane ćwiczenia po kodzie (MUSI BYĆ NA KOŃCU - bo /:code łapie wszystko)
router.get('/:code', auth(true), ctrl.getExerciseByCode);

// Pobierz alternatywy dla ćwiczenia
router.get('/:code/alternatives', auth(true), ctrl.getAlternatives);

module.exports = router;