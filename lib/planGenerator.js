/**
 * GoFi - Nowy algorytm treningowy (Hybrid: JS Filter + AI Planner)
 * 
 * Ten plik jest głównym entry point dla nowego systemu.
 * Zachowuje kompatybilność wsteczną z API.
 */

const fs = require('fs');
const path = require('path');

// Nowe moduły
const { getValidExercises, normalizeEquipment } = require('./exerciseFilter');
const { generatePlan, generatePlanLocally, generatePlanWithAI } = require('./aiPlanner');

// Ładowanie bazy ćwiczeń
let exercisesDatabase = null;

function loadExercisesDatabase() {
  if (exercisesDatabase) return exercisesDatabase;
  
  const exercisesPath = path.join(__dirname, '..', 'data', 'exercises.json');
  
  try {
    const data = fs.readFileSync(exercisesPath, 'utf8');
    exercisesDatabase = JSON.parse(data);
    console.log(`[GoFi] Załadowano ${exercisesDatabase.length} ćwiczeń`);
    return exercisesDatabase;
  } catch (err) {
    console.error('[GoFi] Błąd ładowania bazy ćwiczeń:', err.message);
    throw err;
  }
}

// ============================================================================
// GŁÓWNA FUNKCJA API
// ============================================================================

/**
 * Generuje plan treningowy na podstawie profilu użytkownika.
 * 
 * @param {Object} userProfile - Profil użytkownika
 * @param {Object} options - Opcje generowania
 * @param {boolean} options.useAI - Czy użyć AI (default: true jeśli jest API key)
 * @param {boolean} options.forceLocal - Wymuś lokalny generator
 * 
 * @returns {Promise<Object>} - Wygenerowany plan
 */
async function generateTrainingPlan(userProfile, options = {}) {
  const exercises = loadExercisesDatabase();
  
  // Normalizuj profil
  const normalizedProfile = normalizeUserProfile(userProfile);
  
  console.log('[GoFi] Generuję plan dla:', {
    goal: normalizedProfile.goal,
    experience: normalizedProfile.experience,
    days: normalizedProfile.daysPerWeek,
    time: normalizedProfile.sessionTime
  });

  // Wybierz metodę generowania
  if (options.forceLocal) {
    return generatePlanLocally(normalizedProfile, exercises);
  }

  return generatePlan(normalizedProfile, exercises);
}

/**
 * Zwraca tylko przefiltrowane ćwiczenia (bez generowania planu)
 */
function getFilteredExercises(userProfile) {
  const exercises = loadExercisesDatabase();
  const normalizedProfile = normalizeUserProfile(userProfile);
  return getValidExercises(exercises, normalizedProfile);
}

/**
 * Normalizacja profilu użytkownika
 */
function normalizeUserProfile(profile) {
  return {
    experience: profile.experience || 'intermediate',
    goal: profile.goal || 'mass',
    daysPerWeek: profile.daysPerWeek || profile.days_per_week || 4,
    sessionTime: profile.sessionTime || profile.session_time || 60,
    equipment: normalizeEquipment(profile.equipment || ['bodyweight', 'dumbbell']),
    injuries: Array.isArray(profile.injuries) ? profile.injuries : [],
    location: profile.location || 'gym',
    focusBody: profile.focusBody || profile.focus_body || null,
    weakPoints: profile.weakPoints || profile.weak_points || [],
    fatigueTolerance: profile.fatigueTolerance || profile.fatigue_tolerance || 'medium',
    preferredDays: profile.preferredDays || profile.preferred_days || [],
    preferUnilateral: profile.preferUnilateral || profile.prefer_unilateral || false
  };
}

// ============================================================================
// KOMPATYBILNOŚĆ WSTECZNA
// ============================================================================

// Stary QUESTIONS export (dla frontendu)
const QUESTIONS = require('./algorithm').QUESTIONS;

// Stara funkcja (wrapper)
async function generateAdvancedPlan(params) {
  console.log('[GoFi] Wywołano generateAdvancedPlan (legacy) - przekierowuję do nowego systemu');
  
  const userProfile = {
    experience: params.experience,
    goal: params.goal,
    daysPerWeek: params.daysPerWeek,
    sessionTime: params.sessionTime,
    equipment: params.equipment,
    injuries: params.injuries,
    location: params.location,
    focusBody: params.focusBody,
    weakPoints: params.weakPoints,
    fatigueTolerance: params.fatigueTolerance,
    preferredDays: params.preferredDays
  };

  const result = await generateTrainingPlan(userProfile);
  
  // Konwertuj na stary format jeśli potrzeba
  return convertToLegacyFormat(result);
}

function convertToLegacyFormat(result) {
  if (!result.success || !result.plan) return result;

  const plan = result.plan;
  
  // Stary format miał "week" jako array dni z "exercises" jako array obiektów
  const legacyWeek = plan.week?.map(day => ({
    day: day.day,
    block: day.dayName || day.focus,
    exercises: day.exercises?.map(ex => ({
      code: ex.code,
      name: ex.code, // będzie uzupełnione przez frontend
      sets: ex.sets,
      reps: ex.reps,
      rest: ex.rest,
      weight: '', // placeholder
      notes: ex.notes || ''
    })) || [],
    estimatedDuration: day.estimatedDuration
  })) || [];

  return {
    success: true,
    split: plan.splitName,
    week: legacyWeek,
    notes: plan.notes,
    metadata: result.metadata
  };
}

// ============================================================================
// EKSPORT
// ============================================================================
module.exports = {
  // Nowy API
  generateTrainingPlan,
  getFilteredExercises,
  normalizeUserProfile,
  loadExercisesDatabase,
  
  // Kompatybilność wsteczna
  generateAdvancedPlan,
  QUESTIONS,
  
  // Re-export z podmodułów
  getValidExercises,
  normalizeEquipment
};
