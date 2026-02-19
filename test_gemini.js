// Test Gemini AI Planner
// Uruchom: node test_gemini.js

require('dotenv').config();
const { generateTrainingPlan } = require('./lib/planGenerator');

console.log('=== TEST GEMINI AI ===');
console.log('Provider:', process.env.AI_PROVIDER || 'gemini');
console.log('Model:', process.env.GEMINI_MODEL || 'gemini-2.5-flash');
console.log('API Key:', process.env.GEMINI_API_KEY ? '✓ ustawiony' : '✗ BRAK!');
console.log('');

async function test() {
  try {
    const result = await generateTrainingPlan({
      experience: 'intermediate',
      goal: 'mass',
      daysPerWeek: 3,
      sessionTime: 45,
      equipment: ['dumbbell'],
      injuries: [],
    });

    console.log('\n=== WYNIK ===');
    console.log('Provider:', result.metadata.provider);
    console.log('Split:', result.plan.splitName);
    console.log('');
    
    result.plan.week.forEach((day, i) => {
      console.log(`Dzień ${i + 1} (${day.dayName}):`);
      day.exercises.forEach(e => {
        console.log(`  - ${e.code} | ${e.sets}x${e.reps}`);
      });
      console.log('');
    });

  } catch (err) {
    console.error('BŁĄD:', err.message);
  }
}

test();
