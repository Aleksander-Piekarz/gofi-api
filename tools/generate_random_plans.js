/**
 * Generator losowych planów treningowych
 * Uruchom: node tools/generate_random_plans.js [liczba_planów]
 */

const fs = require('fs');
const path = require('path');
const algorithm = require('../lib/algorithm');

// Załaduj ćwiczenia
const exercisesPath = path.join(__dirname, '../data/exercises.json');
const exercises = JSON.parse(fs.readFileSync(exercisesPath, 'utf-8'));

// Opcje do losowania
const OPTIONS = {
  experience: ['beginner', 'intermediate', 'advanced'],
  goal: ['mass', 'strength', 'recomposition', 'endurance', 'reduction'],
  days_per_week: [2, 3, 4, 5, 6],
  location: ['gym', 'home'],
  session_time: [30, 45, 60, 75, 90],
  focus_body: ['balanced', 'upper', 'lower', 'core'],
  fatigue_tolerance: ['low', 'medium', 'high'],
  
  // Sprzęt - różne kombinacje
  equipment_sets: {
    gym_full: ['bodyweight', 'barbell', 'dumbbell', 'cable', 'machine', 'kettlebell', 'pull_up_bar'],
    gym_basic: ['bodyweight', 'barbell', 'dumbbell', 'machine'],
    gym_free_weights: ['bodyweight', 'barbell', 'dumbbell'],
    home_equipped: ['bodyweight', 'dumbbell', 'kettlebell', 'pull_up_bar', 'band'],
    home_minimal: ['bodyweight', 'dumbbell', 'band'],
    bodyweight_only: ['bodyweight'],
    calisthenics: ['bodyweight', 'pull_up_bar'],
  },
  
  // Kontuzje
  injuries_options: [
    [],
    ['knees'],
    ['shoulders'],
    ['lower_back'],
    ['knees', 'lower_back'],
    ['shoulders', 'wrists'],
    ['none'],
  ],
  
  // Słabe punkty
  weak_points_options: [
    [],
    ['chest'],
    ['back'],
    ['shoulders'],
    ['arms'],
    ['legs'],
    ['chest', 'shoulders'],
    ['back', 'biceps'],
    ['quads', 'glutes'],
  ],
  
  // Preferowane dni
  preferred_days_options: [
    [],
    ['mon', 'wed', 'fri'],
    ['mon', 'tue', 'thu', 'fri'],
    ['mon', 'tue', 'wed', 'thu', 'fri'],
    ['tue', 'thu', 'sat'],
    ['sat', 'sun'],
  ],
};

// Funkcja losująca element z tablicy
function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Generuj losowy profil użytkownika
function generateRandomProfile() {
  const location = randomChoice(OPTIONS.location);
  const experience = randomChoice(OPTIONS.experience);
  
  // Wybierz zestaw sprzętu odpowiedni do lokalizacji
  let equipmentSetName;
  if (location === 'gym') {
    equipmentSetName = randomChoice(['gym_full', 'gym_basic', 'gym_free_weights']);
  } else {
    equipmentSetName = randomChoice(['home_equipped', 'home_minimal', 'bodyweight_only', 'calisthenics']);
  }
  
  const equipment = OPTIONS.equipment_sets[equipmentSetName];
  const daysPerWeek = randomChoice(OPTIONS.days_per_week);
  
  return {
    // Podstawowe
    experience,
    goal: randomChoice(OPTIONS.goal),
    daysPerWeek,
    location,
    sessionTime: randomChoice(OPTIONS.session_time),
    
    // Sprzęt
    equipment,
    equipmentSetName, // dla logowania
    
    // Kontuzje i słabe punkty
    injuries: randomChoice(OPTIONS.injuries_options),
    weakPoints: randomChoice(OPTIONS.weak_points_options),
    
    // Preferencje
    focusBody: randomChoice(OPTIONS.focus_body),
    fatigueTolerance: randomChoice(OPTIONS.fatigue_tolerance),
    preferUnilateral: Math.random() > 0.7,
    includeWarmup: Math.random() > 0.5,
    preferredDays: randomChoice(OPTIONS.preferred_days_options),
  };
}

// Generuj plan i zwróć podsumowanie
function generatePlanWithSummary(profile, index) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`PLAN #${index + 1}`);
  console.log(`${'='.repeat(60)}`);
  
  console.log('\n📋 PROFIL:');
  console.log(`  Poziom: ${profile.experience}`);
  console.log(`  Cel: ${profile.goal}`);
  console.log(`  Dni/tydzień: ${profile.daysPerWeek}`);
  console.log(`  Lokalizacja: ${profile.location}`);
  console.log(`  Sprzęt: ${profile.equipmentSetName} (${profile.equipment.join(', ')})`);
  console.log(`  Kontuzje: ${profile.injuries.length ? profile.injuries.join(', ') : 'brak'}`);
  console.log(`  Słabe punkty: ${profile.weakPoints.length ? profile.weakPoints.join(', ') : 'brak'}`);
  console.log(`  Focus: ${profile.focusBody}`);
  console.log(`  Czas sesji: ${profile.sessionTime} min`);
  
  try {
    const plan = algorithm.generateAdvancedPlan(profile, exercises, {});
    
    if (!plan || !plan.week) {
      console.log('\n❌ Nie udało się wygenerować planu!');
      return { profile, plan: null, error: 'Brak planu' };
    }
    
    console.log('\n📅 WYGENEROWANY PLAN:');
    console.log(`  Split: ${plan.meta?.splitName || 'N/A'}`);
    
    // Statystyki sprzętu
    const equipmentStats = {};
    let totalExercises = 0;
    
    plan.week.forEach(day => {
      console.log(`\n  ${day.day} (${day.type}):`);
      day.exercises.forEach(ex => {
        const orig = exercises.find(e => e.code === ex.code);
        const eq = (orig?.equipment || 'unknown').toLowerCase();
        equipmentStats[eq] = (equipmentStats[eq] || 0) + 1;
        totalExercises++;
        console.log(`    - ${ex.code} [${eq}]`);
      });
    });
    
    console.log('\n📊 STATYSTYKI SPRZĘTU:');
    Object.entries(equipmentStats)
      .sort((a, b) => b[1] - a[1])
      .forEach(([eq, count]) => {
        const pct = ((count / totalExercises) * 100).toFixed(1);
        console.log(`    ${eq}: ${count} (${pct}%)`);
      });
    
    return { 
      profile, 
      plan, 
      stats: {
        totalExercises,
        equipmentStats,
        daysGenerated: plan.week.length,
      }
    };
    
  } catch (err) {
    console.log(`\n❌ BŁĄD: ${err.message}`);
    return { profile, plan: null, error: err.message };
  }
}

// MAIN
async function main() {
  const numPlans = parseInt(process.argv[2]) || 5;
  
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     GENERATOR LOSOWYCH PLANÓW TRENINGOWYCH                 ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`\nGeneruję ${numPlans} losowych planów...\n`);
  
  const results = [];
  
  for (let i = 0; i < numPlans; i++) {
    const profile = generateRandomProfile();
    const result = generatePlanWithSummary(profile, i);
    results.push(result);
  }
  
  // Podsumowanie końcowe
  console.log('\n\n' + '═'.repeat(60));
  console.log('PODSUMOWANIE KOŃCOWE');
  console.log('═'.repeat(60));
  
  const successful = results.filter(r => r.plan !== null);
  const failed = results.filter(r => r.plan === null);
  
  console.log(`\n✅ Udane: ${successful.length}/${numPlans}`);
  console.log(`❌ Nieudane: ${failed.length}/${numPlans}`);
  
  if (failed.length > 0) {
    console.log('\n⚠️  Nieudane profile:');
    failed.forEach((f, i) => {
      console.log(`  ${i + 1}. ${f.profile.experience}/${f.profile.goal}/${f.profile.equipmentSetName} - ${f.error}`);
    });
  }
  
  // Agregowane statystyki sprzętu
  const globalEquipmentStats = {};
  let globalTotal = 0;
  
  successful.forEach(r => {
    Object.entries(r.stats.equipmentStats).forEach(([eq, count]) => {
      globalEquipmentStats[eq] = (globalEquipmentStats[eq] || 0) + count;
      globalTotal += count;
    });
  });
  
  console.log('\n📊 GLOBALNE STATYSTYKI SPRZĘTU (wszystkie plany):');
  Object.entries(globalEquipmentStats)
    .sort((a, b) => b[1] - a[1])
    .forEach(([eq, count]) => {
      const pct = ((count / globalTotal) * 100).toFixed(1);
      const bar = '█'.repeat(Math.round(pct / 5));
      console.log(`  ${eq.padEnd(15)} ${count.toString().padStart(4)} (${pct.padStart(5)}%) ${bar}`);
    });
  
  // Zapisz wyniki do pliku JSON
  const outputPath = path.join(__dirname, '../data/generated_plans.json');
  const output = {
    generatedAt: new Date().toISOString(),
    totalPlans: numPlans,
    successful: successful.length,
    failed: failed.length,
    globalEquipmentStats,
    plans: results.map(r => ({
      profile: r.profile,
      success: r.plan !== null,
      error: r.error || null,
      stats: r.stats || null,
      plan: r.plan ? {
        splitName: r.plan.meta?.splitName,
        days: r.plan.week?.map(d => ({
          day: d.day,
          type: d.type,
          exercises: d.exercises.map(e => e.code),
          duration: d.estimatedDuration,
        }))
      } : null,
    }))
  };
  
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`\n💾 Wyniki zapisane do: ${outputPath}`);
}

main().catch(console.error);
