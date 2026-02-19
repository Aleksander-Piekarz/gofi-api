const { pool } = require("../lib/db");
const fs = require('fs');
const path = require('path');

// Ścieżki do plików JSON z ćwiczeniami (w kolejności preferencji)
const EXERCISES_JSON_PATHS = [
  path.join(__dirname, '../data/exercises_final.json'),
  path.join(__dirname, '../data/exercises.json')
];

// Cache dla ćwiczeń z JSON (ładowane raz)
let exercisesCache = null;

/**
 * Ładuje ćwiczenia z pliku JSON do pamięci cache
 */
function loadExercisesFromJson() {
  if (exercisesCache === null) {
    for (const jsonPath of EXERCISES_JSON_PATHS) {
      try {
        if (fs.existsSync(jsonPath)) {
          const data = fs.readFileSync(jsonPath, 'utf8');
          exercisesCache = JSON.parse(data);
          console.log(`Załadowano ${exercisesCache.length} ćwiczeń z ${path.basename(jsonPath)}`);
          break;
        }
      } catch (error) {
        console.error(`Błąd ładowania ${path.basename(jsonPath)}:`, error.message);
      }
    }
    if (exercisesCache === null) {
      console.error('Nie znaleziono żadnego pliku z ćwiczeniami!');
      exercisesCache = [];
    }
  }
  return exercisesCache;
}

/**
 * Pobiera pełne dane ćwiczenia po kodzie
 */
exports.getExerciseByCode = async (req, res) => {
  const { code } = req.params;
  
  if (!code) {
    return res.status(400).json({ error: "Brak kodu ćwiczenia" });
  }

  try {
    const exercises = loadExercisesFromJson();
    const exercise = exercises.find(ex => ex.code === code);
    
    if (!exercise) {
      return res.status(404).json({ error: "Nie znaleziono ćwiczenia" });
    }

    res.json(exercise);
  } catch (error) {
    console.error("Błąd pobierania ćwiczenia:", error);
    res.status(500).json({ error: "Błąd serwera" });
  }
};

/**
 * Pobiera listę wszystkich ćwiczeń z filtrowaniem
 */
exports.getAllExercises = async (req, res) => {
  const { 
    page = 1, 
    limit = 50, 
    muscle, 
    equipment, 
    difficulty, 
    search,
    pattern 
  } = req.query;

  try {
    let exercises = loadExercisesFromJson();

    // Filtrowanie
    if (muscle) {
      exercises = exercises.filter(ex => {
        if (ex.primary_muscle?.toLowerCase() === muscle.toLowerCase()) return true;
        // secondary_muscles może być: tablicą, stringiem, lub obiektem {en: [], pl: []}
        const secondary = ex.secondary_muscles;
        if (!secondary) return false;
        
        // Obiekt z en/pl (nowy format)
        if (secondary.en && Array.isArray(secondary.en)) {
          return secondary.en.some(m => m.toLowerCase() === muscle.toLowerCase());
        }
        // Tablica
        if (Array.isArray(secondary)) {
          return secondary.some(m => m.toLowerCase() === muscle.toLowerCase());
        }
        // String
        if (typeof secondary === 'string') {
          return secondary.toLowerCase().split(',').map(s => s.trim()).includes(muscle.toLowerCase());
        }
        return false;
      });
    }

    if (equipment) {
      exercises = exercises.filter(ex => 
        ex.equipment?.toLowerCase().includes(equipment.toLowerCase())
      );
    }

    if (difficulty) {
      exercises = exercises.filter(ex => 
        ex.difficulty?.toLowerCase() === difficulty.toLowerCase()
      );
    }

    if (pattern) {
      exercises = exercises.filter(ex => 
        ex.pattern?.toLowerCase() === pattern.toLowerCase()
      );
    }

    if (search) {
      const searchLower = search.toLowerCase();
      exercises = exercises.filter(ex => 
        ex.code?.toLowerCase().includes(searchLower) ||
        ex.name?.en?.toLowerCase().includes(searchLower) ||
        ex.name?.pl?.toLowerCase().includes(searchLower) ||
        ex.primary_muscle?.toLowerCase().includes(searchLower)
      );
    }

    // Paginacja
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const endIndex = startIndex + parseInt(limit);
    const paginatedExercises = exercises.slice(startIndex, endIndex);

    res.json({
      data: paginatedExercises,
      total: exercises.length,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(exercises.length / parseInt(limit))
    });
  } catch (error) {
    console.error("Błąd pobierania listy ćwiczeń:", error);
    res.status(500).json({ error: "Błąd serwera" });
  }
};

/**
 * Pobiera unikalne partie mięśniowe
 */
exports.getMuscleGroups = async (req, res) => {
  try {
    const exercises = loadExercisesFromJson();
    const muscles = new Set();
    
    exercises.forEach(ex => {
      if (ex.primary_muscle) {
        muscles.add(ex.primary_muscle.toLowerCase());
      }
    });

    res.json({ data: Array.from(muscles).sort() });
  } catch (error) {
    console.error("Błąd pobierania partii mięśniowych:", error);
    res.status(500).json({ error: "Błąd serwera" });
  }
};

/**
 * Pobiera unikalne typy sprzętu
 */
exports.getEquipmentTypes = async (req, res) => {
  try {
    const exercises = loadExercisesFromJson();
    const equipment = new Set();
    
    exercises.forEach(ex => {
      if (ex.equipment) {
        equipment.add(ex.equipment.toLowerCase());
      }
    });

    res.json({ data: Array.from(equipment).sort() });
  } catch (error) {
    console.error("Błąd pobierania typów sprzętu:", error);
    res.status(500).json({ error: "Błąd serwera" });
  }
};

exports.getAlternatives = async (req, res) => {
  const { code } = req.params;
  
  if (!code) {
    return res.status(400).json({ error: "Brak kodu ćwiczenia" });
  }

  try {
    // Najpierw spróbuj z bazy danych
    const poolPromise = pool.promise();
    
    const [altRows] = await poolPromise.query(
      "SELECT alt_code FROM exercise_alternatives WHERE exercise_code = ?",
      [code]
    );

    if (altRows.length > 0) {
      const altCodes = altRows.map(row => row.alt_code);
      
      // Pobierz pełne dane z JSON
      const exercises = loadExercisesFromJson();
      const alternatives = exercises.filter(ex => altCodes.includes(ex.code));
      
      return res.json(alternatives);
    }

    // Jeśli nie ma w bazie, znajdź podobne ćwiczenia z JSON
    const exercises = loadExercisesFromJson();
    const currentExercise = exercises.find(ex => ex.code === code);
    
    if (!currentExercise) {
      return res.json([]);
    }

    // Znajdź alternatywy na podstawie tej samej partii mięśniowej i wzorca
    const alternatives = exercises.filter(ex => 
      ex.code !== code &&
      ex.primary_muscle === currentExercise.primary_muscle &&
      ex.pattern === currentExercise.pattern
    ).slice(0, 5); // Ogranicz do 5 alternatyw

    res.json(alternatives);

  } catch (error) {
    console.error("Błąd pobierania alternatyw:", error);
    res.status(500).json({ error: "Błąd serwera" });
  }
};

// =====================================================
// Custom Exercises - CRUD dla ćwiczeń użytkownika
// =====================================================

/**
 * Pobiera wszystkie własne ćwiczenia użytkownika
 */
exports.getUserCustomExercises = async (req, res) => {
  const userId = req.user?.id;
  
  if (!userId) {
    return res.status(401).json({ error: "Brak autoryzacji" });
  }

  try {
    const poolPromise = pool.promise();
    const [rows] = await poolPromise.query(
      `SELECT id, name_en, name_pl, primary_muscle, secondary_muscles,
              equipment, pattern, sets_default, reps_default, notes, created_at
       FROM user_custom_exercises
       WHERE user_id = ?
       ORDER BY created_at DESC`,
      [userId]
    );

    // Konwertuj secondary_muscles na tablicę
    const exercises = rows.map(row => ({
      ...row,
      secondary_muscles: row.secondary_muscles ? row.secondary_muscles.split(',') : [],
      is_custom: true
    }));

    res.json({ data: exercises });
  } catch (error) {
    console.error("Błąd pobierania własnych ćwiczeń:", error);
    res.status(500).json({ error: "Błąd serwera" });
  }
};

/**
 * Tworzy nowe własne ćwiczenie
 */
exports.createCustomExercise = async (req, res) => {
  const userId = req.user?.id;
  
  if (!userId) {
    return res.status(401).json({ error: "Brak autoryzacji" });
  }

  const { 
    name_en, name_pl, primary_muscle, secondary_muscles,
    equipment, pattern, sets_default, reps_default, notes 
  } = req.body;

  if (!name_en && !name_pl) {
    return res.status(400).json({ error: "Nazwa ćwiczenia jest wymagana" });
  }

  try {
    const poolPromise = pool.promise();
    
    const secondaryStr = Array.isArray(secondary_muscles) 
      ? secondary_muscles.join(',') 
      : (secondary_muscles || '');

    const [result] = await poolPromise.query(
      `INSERT INTO user_custom_exercises 
       (user_id, name_en, name_pl, primary_muscle, secondary_muscles,
        equipment, pattern, sets_default, reps_default, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId, 
        name_en || name_pl, 
        name_pl || name_en,
        primary_muscle || 'other',
        secondaryStr,
        equipment || 'bodyweight',
        pattern || 'accessory',
        sets_default || 3,
        reps_default || 10,
        notes || null
      ]
    );

    res.status(201).json({ 
      id: result.insertId,
      message: "Ćwiczenie utworzone pomyślnie" 
    });
  } catch (error) {
    console.error("Błąd tworzenia własnego ćwiczenia:", error);
    res.status(500).json({ error: "Błąd serwera" });
  }
};

/**
 * Aktualizuje własne ćwiczenie
 */
exports.updateCustomExercise = async (req, res) => {
  const userId = req.user?.id;
  const { id } = req.params;
  
  if (!userId) {
    return res.status(401).json({ error: "Brak autoryzacji" });
  }

  const { 
    name_en, name_pl, primary_muscle, secondary_muscles,
    equipment, pattern, sets_default, reps_default, notes 
  } = req.body;

  try {
    const poolPromise = pool.promise();
    
    // Sprawdź czy ćwiczenie należy do użytkownika
    const [existing] = await poolPromise.query(
      "SELECT id FROM user_custom_exercises WHERE id = ? AND user_id = ?",
      [id, userId]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: "Ćwiczenie nie znalezione" });
    }

    const secondaryStr = Array.isArray(secondary_muscles) 
      ? secondary_muscles.join(',') 
      : secondary_muscles;

    await poolPromise.query(
      `UPDATE user_custom_exercises SET
         name_en = COALESCE(?, name_en),
         name_pl = COALESCE(?, name_pl),
         primary_muscle = COALESCE(?, primary_muscle),
         secondary_muscles = COALESCE(?, secondary_muscles),
         equipment = COALESCE(?, equipment),
         pattern = COALESCE(?, pattern),
         sets_default = COALESCE(?, sets_default),
         reps_default = COALESCE(?, reps_default),
         notes = COALESCE(?, notes)
       WHERE id = ? AND user_id = ?`,
      [name_en, name_pl, primary_muscle, secondaryStr, 
       equipment, pattern, sets_default, reps_default, notes, id, userId]
    );

    res.json({ message: "Ćwiczenie zaktualizowane" });
  } catch (error) {
    console.error("Błąd aktualizacji własnego ćwiczenia:", error);
    res.status(500).json({ error: "Błąd serwera" });
  }
};

/**
 * Usuwa własne ćwiczenie
 */
exports.deleteCustomExercise = async (req, res) => {
  const userId = req.user?.id;
  const { id } = req.params;
  
  if (!userId) {
    return res.status(401).json({ error: "Brak autoryzacji" });
  }

  try {
    const poolPromise = pool.promise();
    
    const [result] = await poolPromise.query(
      "DELETE FROM user_custom_exercises WHERE id = ? AND user_id = ?",
      [id, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Ćwiczenie nie znalezione" });
    }

    res.json({ message: "Ćwiczenie usunięte" });
  } catch (error) {
    console.error("Błąd usuwania własnego ćwiczenia:", error);
    res.status(500).json({ error: "Błąd serwera" });
  }
};