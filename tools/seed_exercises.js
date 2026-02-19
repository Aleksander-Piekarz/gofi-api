const fs = require('fs');
const path = require('path');
require('dotenv').config(); 

const { pool } = require('../lib/db'); 

// Pomocnicza funkcja do konwersji tablic na stringi CSV
const arrayToCsv = (val) => {
  if (!val) return '';
  if (Array.isArray(val)) return val.join(',');
  return String(val);
};

// Pomocnicza funkcja do mapowania trudności (słowa -> liczby)
const parseDifficulty = (val) => {
  if (typeof val === 'number') return val;
  if (!val) return 2; // Domyślnie średni
  
  const lower = String(val).toLowerCase();
  if (lower.includes('beginner') || lower.includes('easy')) return 1;
  if (lower.includes('intermediate') || lower.includes('medium')) return 2;
  if (lower.includes('advanced') || lower.includes('hard')) return 3;
  
  return 2; // Fallback
};

// Pomocnicza funkcja do wyciągania nazwy z obiektu wielojęzycznego
const getLocalizedName = (nameObj) => {
  if (typeof nameObj === 'string') return nameObj;
  if (nameObj && typeof nameObj === 'object') {
    return nameObj.en || nameObj.pl || '';
  }
  return '';
};

// Pomocnicza funkcja do konwersji obiektu/tablicy na JSON string
const toJsonString = (val) => {
  if (!val) return null;
  if (typeof val === 'string') return val;
  return JSON.stringify(val);
};

(async () => {
  const poolPromise = pool.promise();

  try {
    const connection = await poolPromise.getConnection();
    console.log("Pomyślnie połączono z bazą danych.");
    connection.release();

    // Najpierw sprawdź exercises_final.json, potem exercises.json
    const exFinalPath = path.join(__dirname, '..', 'data', 'exercises_final.json');
    const exPath = path.join(__dirname, '..', 'data', 'exercises.json');
    const altPath = path.join(__dirname, '..', 'data', 'exercise_alternatives.json');
    
    let exercisesFile = exFinalPath;
    if (!fs.existsSync(exFinalPath)) {
      if (!fs.existsSync(exPath)) {
        throw new Error("Brak pliku exercises_final.json ani exercises.json");
      }
      exercisesFile = exPath;
      console.log("Używam exercises.json (brak exercises_final.json)");
    } else {
      console.log("Używam exercises_final.json");
    }

    const EX = JSON.parse(fs.readFileSync(exercisesFile, 'utf8'));
    // Obsługa braku pliku z alternatywami (opcjonalny)
    const ALT = fs.existsSync(altPath) ? JSON.parse(fs.readFileSync(altPath, 'utf8')) : [];

    console.log(`Seeding ${EX.length} exercises...`);

    // Najpierw upewnij się, że tabela ma potrzebne kolumny
    // Dodajemy nowe kolumny jeśli nie istnieją (dla wielojęzycznych danych i nowych pól)
    try {
      await poolPromise.query(`
        ALTER TABLE exercises 
        ADD COLUMN IF NOT EXISTS name_en VARCHAR(255) DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS name_pl VARCHAR(255) DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS instructions_en TEXT DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS instructions_pl TEXT DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS common_mistakes_en TEXT DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS common_mistakes_pl TEXT DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS images TEXT DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS safety_data TEXT DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS tier VARCHAR(20) DEFAULT 'standard',
        ADD COLUMN IF NOT EXISTS fatigue_score TINYINT DEFAULT 3,
        ADD COLUMN IF NOT EXISTS rep_range_type VARCHAR(20) DEFAULT 'hypertrophy',
        ADD COLUMN IF NOT EXISTS body_part VARCHAR(50) DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS detailed_muscle VARCHAR(100) DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS avg_time_per_set INT DEFAULT 30,
        ADD COLUMN IF NOT EXISTS grip_type VARCHAR(30) DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS force_type VARCHAR(20) DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS force_direction VARCHAR(50) DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS mobility_requirements TEXT DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS secondary_muscles_en TEXT DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS secondary_muscles_pl TEXT DEFAULT NULL
      `);
      console.log("Sprawdzono/dodano kolumny wielojęzyczne i nowe pola.");
    } catch (alterErr) {
      // Ignoruj błędy ALTER TABLE (np. jeśli kolumny już istnieją w starszym MySQL)
      console.log("Info: ALTER TABLE (kolumny mogą już istnieć):", alterErr.message);
    }
    
    let successCount = 0;
    let errorCount = 0;

    for (const e of EX) {
      try {
        // 1. Obsługa nazwy wielojęzycznej
        const nameEn = e.name?.en || (typeof e.name === 'string' ? e.name : '');
        const namePl = e.name?.pl || nameEn;
        const displayName = nameEn || namePl || e.code; // Fallback dla głównego name

        // 2. Konwersja pól tablicowych na stringi (CSV)
        const equip = typeof e.equipment === 'string' ? e.equipment : arrayToCsv(e.equipment);
        const loc = arrayToCsv(e.location);
        const secondary = arrayToCsv(e.secondary_muscles);
        
        // 3. Excluded injuries z safety lub bezpośrednio
        const injuries = e.safety?.excluded_injuries 
          ? arrayToCsv(e.safety.excluded_injuries) 
          : arrayToCsv(e.excluded_injuries);
        
        // 4. Konwersja trudności na liczbę (dla algorytmu)
        const diff = parseDifficulty(e.difficulty);

        // 5. Domyślne wartości
        const mechanics = e.mechanics || 'compound';
        const pattern = e.pattern || 'accessory';

        // 6. Instrukcje i błędy jako JSON
        const instructionsEn = toJsonString(e.instructions?.en);
        const instructionsPl = toJsonString(e.instructions?.pl);
        const mistakesEn = toJsonString(e.common_mistakes?.en);
        const mistakesPl = toJsonString(e.common_mistakes?.pl);
        
        // 7. Obrazy i dane bezpieczeństwa
        const images = toJsonString(e.images);
        const safetyData = toJsonString(e.safety);
        
        // 8. Nowe pola z exercises.json
        const tier = e.tier || 'standard';
        const fatigueScore = e.fatigue_score || 3;
        const repRangeType = e.rep_range_type || 'hypertrophy';
        const bodyPart = e.body_part || null;
        const detailedMuscle = e.detailed_muscle || null;
        const avgTimePerSet = e.avg_time_per_set || 30;

        // 9. Nowe pola rozszerzone (grip, force, mobility)
        const gripType = e.grip_type || null;
        const forceType = e.force_type || null;
        const forceDirection = e.force_direction || null;
        const mobilityRequirements = arrayToCsv(e.mobility_requirements);
        
        // 10. Secondary muscles w obu językach
        const secondaryMusclesEn = Array.isArray(e.secondary_muscles?.en) 
          ? arrayToCsv(e.secondary_muscles.en) 
          : arrayToCsv(e.secondary_muscles);
        const secondaryMusclesPl = Array.isArray(e.secondary_muscles?.pl) 
          ? arrayToCsv(e.secondary_muscles.pl) 
          : secondaryMusclesEn;

        await poolPromise.query(
          `INSERT INTO exercises (
              code, name_en, name_pl, primary_muscle, secondary_muscles, pattern, 
              equipment, location, difficulty, unilateral, is_machine, 
              minutes_est, video_url, 
              mechanics,
              instructions_en, instructions_pl, common_mistakes_en, common_mistakes_pl,
              images, safety_data,
              tier, fatigue_score, rep_range_type, body_part, detailed_muscle, avg_time_per_set,
              grip_type, force_type, force_direction, mobility_requirements,
              secondary_muscles_en, secondary_muscles_pl
           )
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
           ON DUPLICATE KEY UPDATE
              name_en=VALUES(name_en),
              name_pl=VALUES(name_pl),
              primary_muscle=VALUES(primary_muscle),
              secondary_muscles=VALUES(secondary_muscles),
              pattern=VALUES(pattern),
              equipment=VALUES(equipment),
              location=VALUES(location),
              difficulty=VALUES(difficulty),
              unilateral=VALUES(unilateral),
              is_machine=VALUES(is_machine),
              minutes_est=VALUES(minutes_est),
              video_url=VALUES(video_url),
              mechanics=VALUES(mechanics),
              instructions_en=VALUES(instructions_en),
              instructions_pl=VALUES(instructions_pl),
              common_mistakes_en=VALUES(common_mistakes_en),
              common_mistakes_pl=VALUES(common_mistakes_pl),
              images=VALUES(images),
              safety_data=VALUES(safety_data),
              tier=VALUES(tier),
              fatigue_score=VALUES(fatigue_score),
              rep_range_type=VALUES(rep_range_type),
              body_part=VALUES(body_part),
              detailed_muscle=VALUES(detailed_muscle),
              avg_time_per_set=VALUES(avg_time_per_set),
              grip_type=VALUES(grip_type),
              force_type=VALUES(force_type),
              force_direction=VALUES(force_direction),
              mobility_requirements=VALUES(mobility_requirements),
              secondary_muscles_en=VALUES(secondary_muscles_en),
              secondary_muscles_pl=VALUES(secondary_muscles_pl)`,
          [
            e.code, nameEn, namePl, e.primary_muscle, secondary, pattern, 
            equip, loc, diff, !!e.unilateral, !!e.is_machine, 
            e.minutes_est || 6, e.video_url || null,
            mechanics,
            instructionsEn, instructionsPl, mistakesEn, mistakesPl,
            images, safetyData,
            tier, fatigueScore, repRangeType, bodyPart, detailedMuscle, avgTimePerSet,
            gripType, forceType, forceDirection, mobilityRequirements,
            secondaryMusclesEn, secondaryMusclesPl
          ]
        );
        successCount++;
        
        // Wyświetl postęp co 100 ćwiczeń
        if (successCount % 100 === 0) {
          console.log(`  Przetworzono ${successCount} ćwiczeń...`);
        }
      } catch (exErr) {
        errorCount++;
        console.error(`  Błąd dla ćwiczenia "${e.code}":`, exErr.message);
      }
    }

    console.log(`✓ Zapisano ${successCount} ćwiczeń (${errorCount} błędów)`);

    // Seedowanie alternatyw - BATCH INSERT dla wydajności
    if (ALT.length > 0) {
      console.log(`Seeding ${ALT.length} alternative groups...`);
      
      await poolPromise.query("DELETE FROM exercise_alternatives");
      
      // Zbierz wszystkie pary do batch insert
      const altPairs = [];
      for (const pairList of ALT) {
        for (const exerciseCode of pairList) {
          for (const altCode of pairList) {
            if (exerciseCode !== altCode) {
              altPairs.push([exerciseCode, altCode]);
            }
          }
        }
      }
      
      console.log(`  Przygotowano ${altPairs.length} par alternatyw...`);
      
      // Batch insert co 500 rekordów
      const BATCH_SIZE = 500;
      let insertedCount = 0;
      
      for (let i = 0; i < altPairs.length; i += BATCH_SIZE) {
        const batch = altPairs.slice(i, i + BATCH_SIZE);
        const placeholders = batch.map(() => '(?,?)').join(',');
        const values = batch.flat();
        
        await poolPromise.query(
          `INSERT IGNORE INTO exercise_alternatives (exercise_code, alt_code) VALUES ${placeholders}`,
          values
        );
        
        insertedCount += batch.length;
        if (insertedCount % 2000 === 0 || insertedCount === altPairs.length) {
          console.log(`  Wstawiono ${insertedCount}/${altPairs.length} alternatyw...`);
        }
      }
      
      console.log(`✓ Zapisano ${altPairs.length} powiązań alternatyw`);
    }

    // Generowanie automatycznych alternatyw na podstawie wzorca i partii mięśniowej
    console.log("Generowanie automatycznych alternatyw...");
    
    const [exercises] = await poolPromise.query(
      `SELECT code, primary_muscle, pattern FROM exercises WHERE primary_muscle IS NOT NULL`
    );
    
    // Grupuj ćwiczenia wg muscle+pattern
    const grouped = {};
    for (const ex of exercises) {
      const key = `${ex.primary_muscle}|${ex.pattern}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(ex.code);
    }
    
    // Zbierz pary alternatyw (max 5 alternatyw na ćwiczenie)
    const autoAltPairs = [];
    for (const codes of Object.values(grouped)) {
      if (codes.length < 2) continue;
      
      for (let i = 0; i < codes.length; i++) {
        // Dodaj max 5 alternatyw dla każdego ćwiczenia
        for (let j = 0; j < Math.min(5, codes.length); j++) {
          if (i !== j) {
            autoAltPairs.push([codes[i], codes[j]]);
          }
        }
      }
    }
    
    console.log(`  Przygotowano ${autoAltPairs.length} automatycznych alternatyw...`);
    
    // Batch insert
    const BATCH_SIZE_AUTO = 500;
    let autoInserted = 0;
    
    for (let i = 0; i < autoAltPairs.length; i += BATCH_SIZE_AUTO) {
      const batch = autoAltPairs.slice(i, i + BATCH_SIZE_AUTO);
      const placeholders = batch.map(() => '(?,?)').join(',');
      const values = batch.flat();
      
      await poolPromise.query(
        `INSERT IGNORE INTO exercise_alternatives (exercise_code, alt_code) VALUES ${placeholders}`,
        values
      );
      
      autoInserted += batch.length;
      if (autoInserted % 5000 === 0 || autoInserted === autoAltPairs.length) {
        console.log(`  Wstawiono ${autoInserted}/${autoAltPairs.length} auto-alternatyw...`);
      }
    }
    
    console.log(`✓ Wygenerowano ${autoAltPairs.length} automatycznych alternatyw`);

    console.log('\n========================================');
    console.log('Seed zakończony sukcesem!');
    console.log('========================================');
  } catch (err) {
    console.error("\nBŁĄD SEEDOWANIA:", err.message);
    if (err.sqlMessage) console.error("SQL Error:", err.sqlMessage);
  } finally {
    await pool.end();
  }
})();