/**
 * Test nowego systemu generowania planów (Hybrid: JS Filter + AI)
 * 
 * Uruchom: node tools/test_new_planner.js
 */

const path = require('path');

// Dodaj .env jeśli istnieje
try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch (e) {}

const { generateTrainingPlan, getFilteredExercises } = require('../lib/planGenerator');

// ============================================================================
// TEST CASES
// ============================================================================

const TEST_PROFILES = [
  {
    name: "Początkujący - Redukcja - Home",
    profile: {
      experience: 'beginner',
      goal: 'reduction',
      daysPerWeek: 3,
      sessionTime: 45,
      equipment: ['bodyweight', 'dumbbell'],
      injuries: [],
      location: 'home',
      focusBody: null
    }
  },
  {
    name: "Średnio-zaawansowany - Masa - Gym Full",
    profile: {
      experience: 'intermediate',
      goal: 'mass',
      daysPerWeek: 4,
      sessionTime: 60,
      equipment: ['bodyweight', 'barbell', 'dumbbell', 'cable', 'machine'],
      injuries: [],
      location: 'gym',
      focusBody: 'upper',
      weakPoints: ['arms']
    }
  },
  {
    name: "Zaawansowany - Siła - Kontuzja pleców",
    profile: {
      experience: 'advanced',
      goal: 'strength',
      daysPerWeek: 5,
      sessionTime: 75,
      equipment: ['bodyweight', 'barbell', 'dumbbell', 'cable', 'machine'],
      injuries: ['lower_back'],
      location: 'gym',
      focusBody: 'lower'
    }
  },
  {
    name: "Kalistenika - Wytrzymałość",
    profile: {
      experience: 'intermediate',
      goal: 'endurance',
      daysPerWeek: 4,
      sessionTime: 45,
      equipment: ['bodyweight', 'pull_up_bar'],
      injuries: [],
      location: 'home',
      focusBody: null
    }
  }
];

// ============================================================================
// RUNNER
// ============================================================================

async function runTests() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     TEST NOWEGO PLANERA (JS Filter + AI/Local)             ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const hasApiKey = process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY;
  console.log(`🔑 API Key: ${hasApiKey ? 'TAK - użyję AI' : 'NIE - użyję lokalnego generatora'}\n`);

  for (const testCase of TEST_PROFILES) {
    console.log('═'.repeat(60));
    console.log(`📋 ${testCase.name}`);
    console.log('═'.repeat(60));
    
    // Test 1: Filtrowanie
    console.log('\n--- FILTROWANIE ĆWICZEŃ ---');
    const filtered = getFilteredExercises(testCase.profile);
    console.log(`✓ Ćwiczeń po filtrowaniu: ${filtered.length}`);
    
    // Statystyki
    const stats = {
      compound: filtered.filter(e => e.mechanics === 'compound').length,
      isolation: filtered.filter(e => e.mechanics === 'isolation').length,
      optimal: filtered.filter(e => e.tier === 'optimal').length,
      bodyParts: {}
    };
    
    for (const ex of filtered) {
      const part = ex.body_part || 'OTHER';
      stats.bodyParts[part] = (stats.bodyParts[part] || 0) + 1;
    }
    
    console.log(`  Compound: ${stats.compound}, Isolation: ${stats.isolation}`);
    console.log(`  Optimal tier: ${stats.optimal}`);
    console.log(`  Body parts:`, stats.bodyParts);

    // Test 2: Generowanie planu
    console.log('\n--- GENEROWANIE PLANU ---');
    try {
      const startTime = Date.now();
      const result = await generateTrainingPlan(testCase.profile, { forceLocal: !hasApiKey });
      const elapsed = Date.now() - startTime;
      
      if (result.success) {
        console.log(`✓ Plan wygenerowany w ${elapsed}ms`);
        console.log(`  Provider: ${result.metadata?.provider}`);
        console.log(`  Split: ${result.plan?.splitName}`);
        
        if (result.plan?.week) {
          console.log(`\n📅 PLAN TYGODNIOWY:`);
          for (const day of result.plan.week) {
            const exCodes = day.exercises?.map(e => e.code).join(', ') || 'brak';
            console.log(`  ${day.day} (${day.dayName || 'N/A'}): ${day.exercises?.length || 0} ćwiczeń`);
            console.log(`    Czas: ~${day.estimatedDuration || '?'} min`);
            console.log(`    ${exCodes.substring(0, 80)}${exCodes.length > 80 ? '...' : ''}`);
          }
        }
      } else {
        console.log(`✗ Błąd: ${result.error}`);
      }
    } catch (err) {
      console.log(`✗ Exception: ${err.message}`);
    }

    console.log('\n');
  }

  // Test Elite Exercises Block
  console.log('═'.repeat(60));
  console.log('🔒 TEST BLOKADY ELITE EXERCISES');
  console.log('═'.repeat(60));
  
  const intermediateFiltered = getFilteredExercises({
    experience: 'intermediate',
    equipment: ['bodyweight', 'pull_up_bar'],
    injuries: []
  });
  
  const eliteFound = intermediateFiltered.filter(e => 
    e.code.includes('l_pull') || 
    e.code.includes('muscle_up') || 
    e.code.includes('planche') ||
    e.code.includes('front_lever')
  );
  
  if (eliteFound.length === 0) {
    console.log('✓ Elite exercises poprawnie zablokowane dla intermediate');
  } else {
    console.log(`✗ BŁĄD! Znaleziono elite exercises: ${eliteFound.map(e => e.code).join(', ')}`);
  }

  console.log('\n✅ Testy zakończone!\n');
}

// Run
runTests().catch(console.error);
