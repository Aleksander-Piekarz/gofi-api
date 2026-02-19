/**
 * Test seed_exercises.js - tryb dry-run (bez połączenia z bazą)
 * Sprawdza czy wszystkie ćwiczenia z JSON są prawidłowo parsowane
 */

const fs = require('fs');
const path = require('path');

// Pomocnicze funkcje z seed_exercises.js
const arrayToCsv = (val) => {
  if (!val) return '';
  if (Array.isArray(val)) return val.join(',');
  return String(val);
};

const parseDifficulty = (val) => {
  if (typeof val === 'number') return val;
  if (!val) return 2;
  
  const lower = String(val).toLowerCase();
  if (lower.includes('beginner') || lower.includes('easy')) return 1;
  if (lower.includes('intermediate') || lower.includes('medium')) return 2;
  if (lower.includes('advanced') || lower.includes('hard')) return 3;
  
  return 2;
};

const toJsonString = (val) => {
  if (!val) return null;
  if (typeof val === 'string') return val;
  return JSON.stringify(val);
};

// Test
(async () => {
  console.log('=== TEST SEED EXERCISES (DRY RUN) ===\n');
  
  const exPath = path.join(__dirname, '..', 'data', 'exercises.json');
  
  if (!fs.existsSync(exPath)) {
    console.error('BŁĄD: Brak pliku exercises.json');
    process.exit(1);
  }
  
  const exercises = JSON.parse(fs.readFileSync(exPath, 'utf8'));
  console.log(`Załadowano ${exercises.length} ćwiczeń\n`);
  
  let errors = [];
  let warnings = [];
  
  // Statystyki
  const stats = {
    tiers: {},
    bodyParts: {},
    difficulties: {},
    repRangeTypes: {},
    fatigueScores: {},
    patterns: {},
    equipment: {},
    withInstructions: 0,
    withCommonMistakes: 0,
    withImages: 0,
    withSafety: 0,
    unilateral: 0
  };
  
  for (const e of exercises) {
    try {
      // Walidacja wymaganych pól
      if (!e.code) {
        errors.push(`Brak code w ćwiczeniu: ${JSON.stringify(e).slice(0, 100)}`);
        continue;
      }
      
      // Parsowanie pól jak w seed
      const nameEn = e.name?.en || (typeof e.name === 'string' ? e.name : '');
      const namePl = e.name?.pl || nameEn;
      const equip = typeof e.equipment === 'string' ? e.equipment : arrayToCsv(e.equipment);
      const secondary = arrayToCsv(e.secondary_muscles);
      const diff = parseDifficulty(e.difficulty);
      const mechanics = e.mechanics || 'compound';
      const pattern = e.pattern || 'accessory';
      const instructionsEn = toJsonString(e.instructions?.en);
      const instructionsPl = toJsonString(e.instructions?.pl);
      const mistakesEn = toJsonString(e.common_mistakes?.en);
      const mistakesPl = toJsonString(e.common_mistakes?.pl);
      const images = toJsonString(e.images);
      const safetyData = toJsonString(e.safety);
      const tier = e.tier || 'standard';
      const fatigueScore = e.fatigue_score || 3;
      const repRangeType = e.rep_range_type || 'hypertrophy';
      const bodyPart = e.body_part || null;
      const detailedMuscle = e.detailed_muscle || null;
      const avgTimePerSet = e.avg_time_per_set || 30;
      
      // Zbieranie statystyk
      stats.tiers[tier] = (stats.tiers[tier] || 0) + 1;
      if (bodyPart) stats.bodyParts[bodyPart] = (stats.bodyParts[bodyPart] || 0) + 1;
      stats.difficulties[diff] = (stats.difficulties[diff] || 0) + 1;
      stats.repRangeTypes[repRangeType] = (stats.repRangeTypes[repRangeType] || 0) + 1;
      stats.fatigueScores[fatigueScore] = (stats.fatigueScores[fatigueScore] || 0) + 1;
      stats.patterns[pattern] = (stats.patterns[pattern] || 0) + 1;
      if (equip) stats.equipment[equip] = (stats.equipment[equip] || 0) + 1;
      if (instructionsEn) stats.withInstructions++;
      if (mistakesEn) stats.withCommonMistakes++;
      if (images) stats.withImages++;
      if (safetyData) stats.withSafety++;
      if (e.unilateral) stats.unilateral++;
      
      // Ostrzeżenia
      if (!nameEn && !namePl) {
        warnings.push(`${e.code}: Brak nazwy (en/pl)`);
      }
      if (!e.primary_muscle) {
        warnings.push(`${e.code}: Brak primary_muscle`);
      }
      
    } catch (err) {
      errors.push(`${e.code}: ${err.message}`);
    }
  }
  
  // Wyświetl wyniki
  console.log('📊 STATYSTYKI:\n');
  
  console.log('Tiers:');
  Object.entries(stats.tiers).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
    console.log(`  ${k}: ${v}`);
  });
  
  console.log('\nBody Parts:');
  Object.entries(stats.bodyParts).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
    console.log(`  ${k}: ${v}`);
  });
  
  console.log('\nDifficulties:');
  Object.entries(stats.difficulties).sort((a, b) => a[0] - b[0]).forEach(([k, v]) => {
    const label = { 1: 'beginner', 2: 'intermediate', 3: 'advanced' }[k] || k;
    console.log(`  ${label}: ${v}`);
  });
  
  console.log('\nRep Range Types:');
  Object.entries(stats.repRangeTypes).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
    console.log(`  ${k}: ${v}`);
  });
  
  console.log('\nFatigue Scores (1-7):');
  Object.entries(stats.fatigueScores).sort((a, b) => a[0] - b[0]).forEach(([k, v]) => {
    console.log(`  ${k}: ${v}`);
  });
  
  console.log('\nPatterns (top 10):');
  Object.entries(stats.patterns).sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([k, v]) => {
    console.log(`  ${k}: ${v}`);
  });
  
  console.log('\nEquipment (top 10):');
  Object.entries(stats.equipment).sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([k, v]) => {
    console.log(`  ${k}: ${v}`);
  });
  
  console.log('\nDane dodatkowe:');
  console.log(`  Z instrukcjami: ${stats.withInstructions}`);
  console.log(`  Z common_mistakes: ${stats.withCommonMistakes}`);
  console.log(`  Z obrazami: ${stats.withImages}`);
  console.log(`  Z safety: ${stats.withSafety}`);
  console.log(`  Unilateral: ${stats.unilateral}`);
  
  console.log('\n========================================');
  
  if (errors.length > 0) {
    console.log(`\n❌ BŁĘDY (${errors.length}):`);
    errors.slice(0, 10).forEach(e => console.log(`  - ${e}`));
    if (errors.length > 10) console.log(`  ... i ${errors.length - 10} więcej`);
  }
  
  if (warnings.length > 0) {
    console.log(`\n⚠️  OSTRZEŻENIA (${warnings.length}):`);
    warnings.slice(0, 10).forEach(w => console.log(`  - ${w}`));
    if (warnings.length > 10) console.log(`  ... i ${warnings.length - 10} więcej`);
  }
  
  if (errors.length === 0) {
    console.log('\n✅ SEED EXERCISES GOTOWY DO URUCHOMIENIA');
    console.log('   Wszystkie ćwiczenia mogą być prawidłowo sparsowane.');
  } else {
    console.log('\n❌ WYKRYTO BŁĘDY - popraw je przed uruchomieniem seed');
    process.exit(1);
  }
})();
