/**
 * GoFi - Exercise Filter Module
 * 
 * Odpowiedzialny TYLKO za bezpieczne filtrowanie ćwiczeń.
 * Cała inteligencja (wybór splitu, kolejność) idzie do AI.
 * 
 * Ten moduł gwarantuje, że użytkownik:
 * - Dostaje tylko ćwiczenia dostępne na jego sprzęcie
 * - Nie dostaje ćwiczeń niebezpiecznych dla jego kontuzji
 * - Nie dostaje ćwiczeń powyżej swojego poziomu (beginner)
 */

const fs = require("fs");
const path = require("path");

// ============================================================================
// KONFIGURACJA KONTUZJI - BLOKOWANE WZORCE
// ============================================================================
const INJURY_BLOCKED_PATTERNS = {
  lower_back: {
    patterns: [
      'deadlift', 'good_morning', 'bent_over_row', 'pendlay',
      'barbell_squat', 'front_squat', 'back_squat', 'overhead_squat',
      't_bar_row', 'barbell_shrug', 'upright_row',
      'snatch', 'clean_and', 'power_clean', 'hang_clean',
      'hyperextension', 'reverse_hyperextension', 'superman',
      'barbell_lunge', 'walking_lunge_barbell',
      'jefferson', 'zercher', 'atlas_stone'
    ],
    excludedInjuries: ['Lower back pain', 'Herniated disc', 'Sciatica', 'Spinal']
  },

  knees: {
    patterns: [
      'jump_squat', 'box_jump', 'depth_jump', 'plyometric',
      'sissy_squat', 'pistol_squat', 'deep_squat', 'ass_to_grass', 'atg',
      'lunge_jump', 'split_jump', 'jump_lunge'
    ],
    excludedInjuries: ['Knee pain', 'ACL', 'MCL', 'Meniscus', 'Patella']
  },

  shoulders: {
    patterns: [
      'behind_neck', 'behind_the_neck', 'upright_row',
      'arnold_press', 'bradford_press',
      'dip', 'chest_dip', 'triceps_dip', 'ring_dip',
      'muscle_up', 'handstand',
      'wide_grip_pull', 'wide_grip_lat',
      'overhead_press_barbell', 'military_press', 'push_press',
      'snatch', 'jerk', 'clean_and_press',
      'incline_bench', 'decline_bench_press',
      'fly', 'dumbbell_fly', 'cable_fly'
    ],
    excludedInjuries: ['Shoulder pain', 'Rotator cuff', 'Impingement', 'Labrum']
  },

  wrists: {
    patterns: [
      'barbell_curl', 'preacher_curl_barbell', 
      'front_squat', 'clean', 'snatch',
      'plank', 'push_up', 'handstand',
      'wrist_curl', 'reverse_wrist', 'skullcrusher', 'skull_crusher',
      'barbell_incline', 'barbell_decline', 'barbell_overhead',
      'military_press', 'close_grip_bench', 'barbell_floor_press',
      'barbell_bench'
    ],
    excludedInjuries: ['Wrist pain', 'Carpal tunnel', 'TFCC']
  },

  elbows: {
    patterns: [
      'skull_crusher', 'skullcrusher', 'overhead_tricep', 'french_press',
      'close_grip_bench', 'dip',
      'preacher_curl', 'concentration_curl'
    ],
    excludedInjuries: ['Elbow pain', 'Tennis elbow', 'Golfer elbow', 'Epicondylitis']
  },

  hips: {
    patterns: [
      'deep_squat', 'sumo_deadlift', 'wide_stance',
      'hip_adductor', 'hip_abductor',
      'butterfly', 'frog_stretch',
      'side_lunge', 'cossack_squat'
    ],
    excludedInjuries: ['Hip pain', 'Hip impingement', 'Labral tear', 'Bursitis']
  },

  neck: {
    patterns: [
      'behind_neck', 'behind_the_neck',
      'shrug', 'upright_row',
      'neck_curl', 'neck_extension',
      'shoulder_press_behind'
    ],
    excludedInjuries: ['Neck pain', 'Cervical', 'Whiplash']
  },

  ankles: {
    patterns: [
      'jump', 'hop', 'skip', 'plyometric',
      'calf_raise', 'toe_raise',
      'pistol', 'single_leg_squat'
    ],
    excludedInjuries: ['Ankle sprain', 'Achilles', 'Plantar fasciitis']
  }
};

// ============================================================================
// ĆWICZENIA ELITARNE - BLOKOWANE DLA NIE-ZAAWANSOWANYCH
// ============================================================================
const ELITE_EXERCISES = [
  'l_pull', 'muscle_up', 'pistol', 'planche', 'front_lever', 
  'back_lever', 'human_flag', 'iron_cross', 'one_arm_pull', 
  'one_arm_chin', 'full_planche', 'straddle_planche', 'maltese'
];

const HARD_CALISTHENICS = ['pull_up', 'chin_up', 'dip', 'hanging_leg_raise'];

// ============================================================================
// NORMALIZACJA SPRZĘTU
// ============================================================================
const EQUIPMENT_ALIASES = {
  'body weight': 'bodyweight',
  'body_weight': 'bodyweight',
  'bodyweight_only': 'bodyweight',
  'ez bar': 'ez_bar',
  'ez-bar': 'ez_bar',
  'pull up bar': 'pull_up_bar',
  'pull-up bar': 'pull_up_bar',
  'pullup bar': 'pull_up_bar',
  'resistance band': 'band',
  'resistance_band': 'band',
  'elastic band': 'band',
  'dumbell': 'dumbbell',
  'dumbells': 'dumbbell',
  'dumbbells': 'dumbbell',
  'barbells': 'barbell',
  'cables': 'cable',
  'machines': 'machine',
  'kettlebells': 'kettlebell'
};

function normalizeEquipment(equipment) {
  if (!equipment) return [];
  const items = Array.isArray(equipment) ? equipment : [equipment];
  
  return items
    .map(e => {
      if (!e) return null;
      const lower = String(e).toLowerCase().trim();
      return EQUIPMENT_ALIASES[lower] || lower;
    })
    .filter(Boolean);
}

// ============================================================================
// GŁÓWNA FUNKCJA FILTROWANIA
// ============================================================================

/**
 * Filtruje ćwiczenia na podstawie profilu użytkownika.
 * 
 * @param {Array} allExercises - Pełna baza ćwiczeń
 * @param {Object} userProfile - Profil użytkownika
 * @param {string} userProfile.experience - 'beginner' | 'intermediate' | 'advanced'
 * @param {string} userProfile.goal - 'mass' | 'strength' | 'reduction' | 'endurance' | 'recomposition'
 * @param {Array<string>} userProfile.equipment - Lista dostępnego sprzętu
 * @param {Array<string>} userProfile.injuries - Lista kontuzji
 * @param {string} [userProfile.location] - 'gym' | 'home'
 * 
 * @returns {Array} - Przefiltrowana lista ćwiczeń z uproszczoną strukturą
 */
function getValidExercises(allExercises, userProfile) {
  const {
    experience = 'intermediate',
    goal = 'mass',
    equipment = [],
    injuries = [],
    location = 'gym'
  } = userProfile;

  // Normalizuj sprzęt użytkownika
  const userEquipment = new Set(normalizeEquipment(equipment));
  const normalizedInjuries = injuries.map(i => i?.toLowerCase().trim()).filter(Boolean);

  // Zbierz wszystkie zablokowane wzorce z kontuzji
  const blockedPatterns = new Set();
  const blockedInjuryKeywords = new Set();

  for (const injury of normalizedInjuries) {
    const config = INJURY_BLOCKED_PATTERNS[injury];
    if (config) {
      config.patterns.forEach(p => blockedPatterns.add(p.toLowerCase()));
      config.excludedInjuries.forEach(e => blockedInjuryKeywords.add(e.toLowerCase()));
    }
  }

  // Sprawdź czy to tylko bodyweight (bez ciężarów)
  const hasWeightedEquipment = userEquipment.has('barbell') || 
                               userEquipment.has('dumbbell') || 
                               userEquipment.has('kettlebell');
  const hasAssistance = userEquipment.has('band') || userEquipment.has('machine');

  console.log(`[Filter] Sprzęt użytkownika: ${[...userEquipment].join(', ')}`);
  console.log(`[Filter] Kontuzje: ${normalizedInjuries.join(', ') || 'brak'}`);
  console.log(`[Filter] Zablokowane wzorce: ${blockedPatterns.size}`);

  // FILTROWANIE
  const validExercises = allExercises.filter(ex => {
    if (!ex || !ex.code) return false;

    const exCode = ex.code.toLowerCase();
    const exEquipment = normalizeEquipment(ex.equipment);

    // 1. FILTR SPRZĘTU
    // Ćwiczenie wymaga sprzętu którego użytkownik nie ma
    const hasRequiredEquipment = exEquipment.length === 0 || 
                                  exEquipment.some(eq => userEquipment.has(eq));
    if (!hasRequiredEquipment) return false;

    // 2. FILTR KONTUZJI - WZORCE
    // Sprawdź czy kod ćwiczenia zawiera zablokowany wzorzec
    for (const pattern of blockedPatterns) {
      if (exCode.includes(pattern)) return false;
    }

    // 3. FILTR KONTUZJI - EXCLUDED INJURIES Z ĆWICZENIA
    if (ex.safety?.excluded_injuries) {
      const exInjuries = ex.safety.excluded_injuries.map(i => i.toLowerCase());
      for (const keyword of blockedInjuryKeywords) {
        if (exInjuries.some(ei => ei.includes(keyword) || keyword.includes(ei))) {
          return false;
        }
      }
    }

    // 4. FILTR POZIOMU - ELITE EXERCISES
    // Elite ćwiczenia tylko dla advanced
    if (experience !== 'advanced') {
      if (ELITE_EXERCISES.some(elite => exCode.includes(elite))) {
        return false;
      }
    }

    // 5. FILTR POZIOMU - BEGINNER
    if (experience === 'beginner') {
      // Blokuj ćwiczenia oznaczone jako advanced/elite
      if (['advanced', 'elite'].includes(ex.difficulty)) return false;

      // Blokuj trudną kalisthenikę bez asysty
      if (!hasAssistance && HARD_CALISTHENICS.some(hard => exCode.includes(hard))) {
        return false;
      }
    }

    // 6. FILTR CELU - STRENGTH
    if (goal === 'strength') {
      // Dla siły nie chcemy cardio/plyometrycznych
      if (ex.mechanics === 'cardio') return false;
      if (ex.pattern === 'plyometric') return false;
      const cardioPatterns = ['burpee', 'run', 'sprint', 'jog', 'skip', 'hop', 'jumping_jack'];
      if (cardioPatterns.some(w => exCode.includes(w))) return false;
    }

    return true;
  });

  console.log(`[Filter] Ćwiczeń po filtrowaniu: ${validExercises.length}/${allExercises.length}`);

  // Zwróć uproszczoną strukturę dla AI
  return validExercises.map(ex => ({
    code: ex.code,
    name: ex.name?.en || ex.code,
    name_pl: ex.name?.pl,
    body_part: ex.body_part,
    muscle: ex.detailed_muscle || ex.primary_muscle,
    secondary_muscles: ex.secondary_muscles || [],
    mechanics: ex.mechanics, // 'compound' | 'isolation' | 'cardio'
    pattern: ex.pattern,     // 'push_horizontal', 'pull_vertical', etc.
    tier: ex.tier,           // 'optimal' | 'standard' | 'alternative'
    difficulty: ex.difficulty,
    equipment: ex.equipment,
    fatigue_score: ex.fatigue_score,
    unilateral: ex.unilateral || false,
    avg_time_per_set: ex.avg_time_per_set || 40
  }));
}

/**
 * Grupuje ćwiczenia według partii ciała dla łatwiejszego promptu AI
 * Normalizuje body_part do uppercase żeby Core i CORE były w jednej grupie
 */
function groupExercisesByBodyPart(exercises) {
  const groups = {};
  
  for (const ex of exercises) {
    // Normalizuj do uppercase (Core -> CORE, Legs -> LEGS)
    const rawPart = ex.body_part || 'OTHER';
    const part = rawPart.toUpperCase();
    if (!groups[part]) groups[part] = [];
    groups[part].push(ex);
  }

  return groups;
}

/**
 * Tworzy skrócony summary dla AI (oszczędza tokeny)
 */
function createExerciseSummary(exercises) {
  const groups = groupExercisesByBodyPart(exercises);
  const summary = {};

  for (const [part, exs] of Object.entries(groups)) {
    summary[part] = {
      count: exs.length,
      compounds: exs.filter(e => e.mechanics === 'compound').map(e => e.code),
      isolations: exs.filter(e => e.mechanics === 'isolation').map(e => e.code),
      optimal: exs.filter(e => e.tier === 'optimal').map(e => e.code)
    };
  }

  return summary;
}

// ============================================================================
// EKSPORT
// ============================================================================
module.exports = {
  getValidExercises,
  groupExercisesByBodyPart,
  createExerciseSummary,
  normalizeEquipment,
  INJURY_BLOCKED_PATTERNS,
  ELITE_EXERCISES,
  HARD_CALISTHENICS
};
