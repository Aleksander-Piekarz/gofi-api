/**
 * GoFi - Zaawansowany algorytm generowania planów treningowych
 * Oparty na najnowszych badaniach naukowych i najlepszych praktykach
 * 
 * Główne założenia:
 * - Priorytet dla ćwiczeń tier="optimal" (compound, sprawdzone)
 * - Zarządzanie zmęczeniem (fatigue_score)
 * - Inteligentne dopasowanie do celów i poziomu użytkownika
 * - GWARANTOWANA liczba ćwiczeń zgodna z obietnicą
 */

const fs = require("fs");
const path = require("path");

// ============================================================================
// 1. ŁADOWANIE ALTERNATYW ĆWICZEŃ
// ============================================================================
let ALTERNATIVES_MAP = new Map();

function loadAlternatives() {
  try {
    const altPath = path.join(__dirname, "..", "data", "exercise_alternatives.json");
    if (fs.existsSync(altPath)) {
      const altData = fs.readFileSync(altPath, "utf8");
      const pairs = JSON.parse(altData);
      const map = new Map();

      for (const pairList of pairs) {
        for (const exerciseCode of pairList) {
          if (!map.has(exerciseCode)) map.set(exerciseCode, new Set());
          const alternatives = map.get(exerciseCode);
          for (const altCode of pairList) {
            if (exerciseCode !== altCode) alternatives.add(altCode);
          }
        }
      }
      ALTERNATIVES_MAP = map;
      console.log(`[Algorithm] Załadowano alternatywy dla ${map.size} ćwiczeń.`);
    }
  } catch (err) {
    console.error("[Algorithm] Błąd ładowania alternatyw:", err.message);
  }
}
loadAlternatives();

// ============================================================================
// 2. KONFIGURACJA KWESTIONARIUSZA
// ============================================================================
const QUESTIONS = [
  // === SEKCJA 1: PODSTAWOWE INFORMACJE ===
  {
    id: "section_basics",
    type: "header",
    label: "📋 Podstawowe informacje",
    description: "Pomóż nam lepiej poznać Twój profil treningowy"
  },
  {
    id: "goal",
    type: "single",
    label: "Jaki jest Twój główny cel?",
    icon: "🎯",
    options: [
      { value: "reduction", label: "🔥 Redukcja tkanki tłuszczowej", description: "Schudnąć zachowując mięśnie" },
      { value: "mass", label: "💪 Budowa masy mięśniowej", description: "Przyrost siły i mięśni" },
      { value: "recomposition", label: "⚖️ Rekompozycja", description: "Spalanie tłuszczu + budowa mięśni" },
      { value: "strength", label: "🏋️ Siła", description: "Maksymalna siła w głównych bojach" },
      { value: "endurance", label: "🏃 Wytrzymałość", description: "Lepsze wyniki cardio + siła" },
    ],
  },
  {
    id: "experience",
    type: "single",
    label: "Jakie jest Twoje doświadczenie treningowe?",
    icon: "📊",
    options: [
      { value: "beginner", label: "🌱 Początkujący", description: "0-6 miesięcy regularnego treningu" },
      { value: "intermediate", label: "📈 Średnio-zaawansowany", description: "6 miesięcy - 2 lata" },
      { value: "advanced", label: "🏆 Zaawansowany", description: "Ponad 2 lata regularnych treningów" },
    ],
  },
  {
    id: "age_range",
    type: "single",
    label: "Twój przedział wiekowy",
    icon: "🎂",
    options: [
      { value: "18-25", label: "18-25 lat" },
      { value: "26-35", label: "26-35 lat" },
      { value: "36-45", label: "36-45 lat" },
      { value: "46-55", label: "46-55 lat" },
      { value: "55+", label: "55+ lat" },
    ],
  },
  {
    id: "gender",
    type: "single",
    label: "Płeć",
    icon: "👤",
    optional: true,
    options: [
      { value: "male", label: "Mężczyzna" },
      { value: "female", label: "Kobieta" },
      { value: "other", label: "Wolę nie podawać" },
    ],
  },

  // === SEKCJA 2: HARMONOGRAM ===
  {
    id: "section_schedule",
    type: "header",
    label: "📅 Harmonogram treningów",
    description: "Dostosujemy plan do Twojego rytmu życia"
  },
  { 
    id: "days_per_week", 
    type: "number", 
    label: "Ile dni w tygodniu możesz trenować?", 
    icon: "📆",
    min: 2, 
    max: 7,
    hint: "Optymalna częstotliwość to 3-5 dni"
  },
  { 
    id: "session_time", 
    type: "number", 
    label: "Ile minut trwa Twoja sesja treningowa?", 
    icon: "⏱️",
    min: 20, 
    max: 120,
    hint: "Wlicz rozgrzewkę i stretching"
  },
  {
    id: "preferred_days",
    type: "multi",
    label: "Które dni preferujesz na trening?",
    icon: "🗓️",
    optional: true,
    options: [
      { value: "mon", label: "Pon" },
      { value: "tue", label: "Wt" },
      { value: "wed", label: "Śr" },
      { value: "thu", label: "Czw" },
      { value: "fri", label: "Pt" },
      { value: "sat", label: "Sob" },
      { value: "sun", label: "Ndz" },
    ],
  },

  // === SEKCJA 3: MIEJSCE I SPRZĘT ===
  {
    id: "section_equipment",
    type: "header",
    label: "🏠 Miejsce i sprzęt",
    description: "Dobierzemy ćwiczenia do Twoich możliwości"
  },
  {
    id: "location",
    type: "single",
    label: "Gdzie głównie ćwiczysz?",
    icon: "📍",
    options: [
      { value: "gym", label: "🏢 Siłownia", description: "Pełne wyposażenie" },
      { value: "home", label: "🏠 Dom", description: "Ograniczony sprzęt" },
      { value: "outdoor", label: "🌳 Na zewnątrz", description: "Parki, boiska" },
    ],
  },
  {
    id: "equipment",
    type: "multi",
    label: "Jaki sprzęt masz do dyspozycji?",
    icon: "🏋️",
    showIf: { location: ["home", "gym", "outdoor"] },
    options: [
      { value: "bodyweight", label: "Brak (kalistenika)" },
      { value: "dumbbell", label: "Hantle" },
      { value: "barbell", label: "Sztanga + obciążenia" },
      { value: "kettlebell", label: "Kettlebell" },
      { value: "band", label: "Gumy oporowe" },
      { value: "pull_up_bar", label: "Drążek do podciągania" },
      { value: "bench", label: "Ławka" },
      { value: "rack", label: "Stojaki/Rack" },
      { value: "machine", label: "Maszyny" },
      { value: "cable", label: "Wyciągi" },
      { value: "ez_bar", label: "Gryf łamany (EZ bar)" },
      { value: "medicine_ball", label: "Piłka lekarska" },
      { value: "stability_ball", label: "Piłka gimnastyczna" },
      { value: "foam_roller", label: "Roller do masażu" },
      { value: "rope", label: "Lina do wyciągu" },
    ],
  },

  // === SEKCJA 4: ZDROWIE I OGRANICZENIA ===
  {
    id: "section_health",
    type: "header",
    label: "🩺 Zdrowie i ograniczenia",
    description: "Twoje bezpieczeństwo jest priorytetem"
  },
  {
    id: "injuries",
    type: "multi",
    label: "Czy masz kontuzje lub obszary wymagające ostrożności?",
    icon: "⚠️",
    description: "Wyklucza ćwiczenia obciążające te obszary",
    options: [
      { value: "none", label: "✅ Brak ograniczeń" },
      { value: "knees", label: "🦵 Kolana" },
      { value: "shoulders", label: "💪 Barki" },
      { value: "lower_back", label: "🔙 Dolny odcinek pleców" },
      { value: "upper_back", label: "⬆️ Górna część pleców/kark" },
      { value: "wrists", label: "✋ Nadgarstki" },
      { value: "elbows", label: "💪 Łokcie" },
      { value: "hips", label: "🦴 Biodra" },
      { value: "ankles", label: "🦶 Kostki" },
      { value: "herniated_disc", label: "🪻 Przepuklina kręgosłupa" },
      { value: "neck", label: "🧍 Szyja" },
    ],
  },
  {
    id: "mobility_issues",
    type: "multi",
    label: "Czy masz problemy z mobilnością?",
    icon: "🧘",
    optional: true,
    options: [
      { value: "none", label: "✅ Brak problemów" },
      { value: "hip_flexors", label: "Napięte biodra" },
      { value: "hamstrings", label: "Sztywne dwugłowe" },
      { value: "thoracic", label: "Ograniczona mobilność kręgosłupa piersiowego" },
      { value: "ankles", label: "Ograniczona dorsifleksja kostek" },
    ],
  },

  // === SEKCJA 5: PREFERENCJE TRENINGOWE ===
  {
    id: "section_preferences",
    type: "header",
    label: "⚡ Preferencje treningowe",
    description: "Spersonalizuj swój trening"
  },
  {
    id: "focus_body",
    type: "single",
    label: "Na jakich partiach chcesz się skupić?",
    icon: "🎯",
    options: [
      { value: "balanced", label: "⚖️ Całe ciało równomiernie" },
      { value: "upper", label: "💪 Akcent na górę ciała" },
      { value: "lower", label: "🦵 Akcent na dół ciała" },
      { value: "core", label: "🎯 Akcent na core/brzuch" },
    ],
  },
  {
    id: "training_style",
    type: "single",
    label: "Jaki styl treningu preferujesz?",
    icon: "🔥",
    optional: true,
    options: [
      { value: "traditional", label: "Tradycyjny (serie/powtórzenia)" },
      { value: "circuit", label: "Obwodowy (circuit training)" },
      { value: "supersets", label: "Superserie" },
      { value: "mixed", label: "Zmieszany" },
    ],
  },
  {
    id: "cardio_preference",
    type: "single",
    label: "Czy chcesz włączyć cardio do planu?",
    icon: "🏃",
    optional: true,
    options: [
      { value: "none", label: "❌ Nie, tylko siłówka" },
      { value: "light", label: "🚶 Lekkie (spacery, rower)" },
      { value: "moderate", label: "🏃 Umiarkowane (2-3x tydzień)" },
      { value: "hiit", label: "🔥 HIIT (intensywne interwały)" },
    ],
  },
  {
    id: "weak_points",
    type: "multi",
    label: "Jakie partie ciała uważasz za słabe punkty?",
    icon: "📉",
    description: "Dodamy więcej ćwiczeń na te partie",
    optional: true,
    options: [
      { value: "none", label: "Brak - wszystko równo" },
      { value: "chest", label: "Klatka piersiowa" },
      { value: "back", label: "Plecy" },
      { value: "shoulders", label: "Barki" },
      { value: "biceps", label: "Biceps" },
      { value: "triceps", label: "Triceps" },
      { value: "quads", label: "Mięsień czworogłowy" },
      { value: "hamstrings", label: "Dwugłowy uda" },
      { value: "glutes", label: "Pośladki" },
      { value: "abs", label: "Brzuch" },
      { value: "calves", label: "Łydki" },
      { value: "forearms", label: "Przedramiona" },
      { value: "traps", label: "Czworoboczne" },
    ],
  },
  
  // === SEKCJA 6: PREFERENCJE ZAAWANSOWANE ===
  {
    id: "section_advanced",
    type: "header",
    label: "🔧 Preferencje zaawansowane",
    description: "Opcjonalne - dla bardziej doświadczonych"
  },
  {
    id: "prefer_unilateral",
    type: "single",
    label: "Czy chcesz włączyć więcej ćwiczeń jednostronnych?",
    icon: "🔀",
    optional: true,
    options: [
      { value: "no", label: "Standardowo (mix)" },
      { value: "yes", label: "Tak, preferuję jednostronne" },
    ],
  },
  {
    id: "fatigue_tolerance",
    type: "single",
    label: "Jak oceniasz swoją tolerancję na zmęczenie?",
    icon: "⚡",
    optional: true,
    options: [
      { value: "low", label: "Niska - wolę krótsze treningi" },
      { value: "medium", label: "Średnia - standardowe treningi" },
      { value: "high", label: "Wysoka - mogę dużo trenować" },
    ],
  },
  {
    id: "include_warmup",
    type: "single",
    label: "Czy chcesz uwzględnić rozgrzewkę w planie?",
    icon: "🔥",
    optional: true,
    options: [
      { value: "no", label: "Nie, rozgrzewam się samodzielnie" },
      { value: "yes", label: "Tak, dodaj ćwiczenia rozgrzewkowe" },
    ],
  },
];

// ============================================================================
// DURATION & VOLUME CONSTANTS - Kalkulacja czasu i objętości
// ============================================================================

// Bazowy czas na ćwiczenie (w minutach) wliczając przerwy
const BASE_TIME_PER_EXERCISE = {
  compound_strength: 8,    // Ciężkie compound z długimi przerwami (3-5min)
  compound_mass: 6,        // Compound dla masy (90-120s przerwy)
  compound_endurance: 5,   // Compound z krótkimi przerwami
  isolation_strength: 5,   // Izolacja dla siły
  isolation_mass: 4,       // Izolacja dla masy
  isolation_endurance: 3,  // Izolacja z krótkimi przerwami
  warmup: 3,               // Rozgrzewka
  core: 3                  // Core/brzuch
};

// Minimalna i maksymalna liczba ćwiczeń
const EXERCISE_COUNT_LIMITS = {
  min: 4,
  max: 12,
  // Sugerowana liczba w zależności od czasu sesji
  byDuration: {
    30: { min: 4, max: 5, ideal: 4 },
    45: { min: 5, max: 7, ideal: 6 },
    60: { min: 6, max: 9, ideal: 7 },
    75: { min: 7, max: 10, ideal: 8 },
    90: { min: 8, max: 12, ideal: 10 }
  }
};

// Proporcje compound vs isolation w zależności od celu
const COMPOUND_RATIO = {
  strength: 0.75,      // 75% compound dla siły
  mass: 0.60,          // 60% compound dla masy
  hypertrophy: 0.60,   // 60% compound
  endurance: 0.50,     // 50% compound dla wytrzymałości
  reduction: 0.55,     // 55% compound dla redukcji
  recomposition: 0.60  // 60% dla rekompozycji
};

// Mnożniki objętości (serie) w zależności od celu
const VOLUME_MULTIPLIER = {
  strength: { compound: 1.2, isolation: 0.8 },      // Więcej serii compound
  mass: { compound: 1.0, isolation: 1.1 },          // Więcej izolacji
  hypertrophy: { compound: 1.0, isolation: 1.1 },
  endurance: { compound: 1.3, isolation: 1.3 },     // Dużo serii wszędzie
  reduction: { compound: 1.1, isolation: 1.0 },
  recomposition: { compound: 1.0, isolation: 1.0 }
};

// ============================================================================
// EQUIPMENT-SPECIFIC PATTERNS - Ćwiczenia wymagające specjalnego sprzętu
// ============================================================================

// Wzorce wymagające kółek gimnastycznych (rings)
const RINGS_REQUIRED_PATTERNS = [
  'ring_dip', 'ring_row', 'ring_push', 'ring_fly', 'ring_curl',
  'muscle_up_ring', 'iron_cross', 'maltese', 'l_sit_ring',
  'false_grip', 'rings_', '_ring_', '_rings'
];

// ============================================================================
// INJURY MOVEMENT PATTERN BLOCKING - Zakazane wzorce ruchowe przy kontuzjach
// ============================================================================

/**
 * Mapowanie kontuzji na zakazane wzorce ruchowe i ćwiczenia
 * Dla każdej kontuzji definiujemy:
 * - blockedPatterns: wzorce w nazwach ćwiczeń które są zakazane
 * - blockedMovements: typy ruchów/patterns do blokady
 * - preferredAlternatives: preferowane zamienniki (unilateral, machine)
 * - maxLoadReduction: % redukcji maksymalnego obciążenia
 */
const INJURY_BLOCKED_PATTERNS = {
  lower_back: {
    // Blokada: Osiowe obciążenie kręgosłupa (High Axial Loading)
    blockedPatterns: [
      'deadlift', 'good_morning', 'bent_over_row', 'pendlay',
      'barbell_squat', 'front_squat', 'back_squat', 'overhead_squat',
      't_bar_row', 'barbell_shrug', 'upright_row',
      'snatch', 'clean_and', 'power_clean', 'hang_clean',
      'hyperextension', 'reverse_hyperextension', 'superman',
      'barbell_lunge', 'walking_lunge_barbell',
      'jefferson', 'zercher', 'atlas_stone'
    ],
    blockedMovements: ['hip_dominant'],  // Martwe ciągi obciążają plecy
    preferUnilateral: true,   // Preferuj jednostronne (mniejsze obciążenie)
    preferMachines: true,     // Preferuj maszyny (stabilizacja zewnętrzna)
    maxLoadReduction: 0.6,    // 40% redukcja maksymalnego obciążenia
    // Dozwolone alternatywy
    allowedAlternatives: [
      'leg_press', 'hack_squat', 'smith_machine', 'belt_squat',
      'bulgarian_split_squat', 'goblet_squat', 'dumbbell_squat',
      'leg_extension', 'leg_curl', 'hip_thrust_machine',
      'seated_row', 'chest_supported_row', 'cable_row',
      'lat_pulldown', 'pull_up', 'chin_up'
    ]
  },
  
  knees: {
    blockedPatterns: [
      'jump_squat', 'box_jump', 'depth_jump', 'plyometric',
      'sissy_squat', 'pistol_squat',
      'deep_squat', 'ass_to_grass', 'atg',
      'lunge_jump', 'split_jump'
    ],
    blockedMovements: [],
    preferUnilateral: false,
    preferMachines: true,     // Maszyny = kontrolowany ROM
    maxLoadReduction: 0.8,
    allowedAlternatives: [
      'leg_press', 'leg_extension', 'leg_curl', 'hip_thrust',
      'box_squat', 'goblet_squat', 'smith_machine_squat'
    ]
  },
  
  shoulders: {
    blockedPatterns: [
      'behind_neck', 'behind_the_neck', 'upright_row',
      'arnold_press', 'bradford_press',
      'dip', 'chest_dip', 'triceps_dip', 'ring_dip',  // DIPY obciążają barki!
      'muscle_up', 'handstand',
      'wide_grip_pull', 'wide_grip_lat',
      'overhead_press_barbell', 'military_press', 'push_press',
      'snatch', 'jerk', 'clean_and_press',
      // DODATKOWE BLOKADY
      'incline_bench',  // Wysokie nachylenie stresuje barki
      'decline_bench_press',  // Decline = ryzyko rotacji
      'fly', 'dumbbell_fly', 'cable_fly'  // Rozpiętki = stres na stawy
    ],
    blockedMovements: ['push_vertical'],  // Ograniczone wciskanie nad głowę
    preferUnilateral: true,
    preferMachines: true,
    maxLoadReduction: 0.7,
    allowedAlternatives: [
      'dumbbell_shoulder_press', 'machine_shoulder_press',
      'lateral_raise', 'front_raise_cable',
      'face_pull', 'rear_delt_fly',
      'flat_bench_press', 'machine_chest_press'  // Płaskie wyciskanie OK
    ]
  },
  
  wrists: {
    blockedPatterns: [
      'barbell_curl', 'preacher_curl_barbell', 'barbell_bench', 'barbell_press',
      'front_squat', 'clean', 'snatch',
      'plank', 'push_up', 'handstand',
      'wrist_curl', 'reverse_wrist', 'skullcrusher', 'skull_crusher',
      // BLOKADA BARBELL W PRESSING!
      'barbell_incline', 'barbell_decline', 'barbell_overhead', 'military_press',
      'close_grip_bench', 'barbell_floor_press'
    ],
    // BLOKADA SPRZĘTU: zakaz sztangi w ruchach pressing
    blockedEquipmentForPatterns: {
      'push_horizontal': ['barbell'],
      'push_vertical': ['barbell']
    },
    blockedMovements: [],
    preferUnilateral: false,
    preferMachines: true,
    preferNeutralGrip: true,  // NOWE: preferuj neutralny chwyt
    preferredGripTypes: ['neutral'],  // NOWE: preferowane typy chwytu
    blockedGripTypes: ['pronated', 'supinated'],  // NOWE: zablokowane chwyty
    maxLoadReduction: 0.8,
    allowedAlternatives: [
      'ez_bar_curl', 'dumbbell_curl', 'hammer_curl',
      'cable_curl', 'machine_curl',
      'neutral_grip', 'dumbbell_bench', 'dumbbell_press', 'machine_press'
    ]
  },
  
  elbows: {
    blockedPatterns: [
      'skull_crusher', 'overhead_tricep', 'french_press',
      'close_grip_bench', 'dip',
      'preacher_curl', 'concentration_curl'
    ],
    blockedMovements: [],
    preferUnilateral: false,
    preferMachines: true,
    maxLoadReduction: 0.8,
    allowedAlternatives: [
      'pushdown', 'cable_tricep', 'machine_tricep',
      'cable_curl', 'machine_curl'
    ]
  },
  
  hips: {
    blockedPatterns: [
      'deep_squat', 'sumo_deadlift', 'wide_stance',
      'hip_adductor', 'hip_abductor',
      'butterfly', 'frog_stretch',
      'side_lunge', 'cossack_squat'
    ],
    blockedMovements: ['lunge'],  // Wykroki mogą drażnić biodra
    preferUnilateral: false,
    preferMachines: true,
    maxLoadReduction: 0.7,
    allowedAlternatives: [
      'leg_press', 'leg_extension', 'leg_curl',
      'hip_thrust', 'glute_bridge',
      'goblet_squat'
    ]
  },
  
  neck: {
    blockedPatterns: [
      'shrug', 'upright_row', 'behind_neck',
      'neck_curl', 'neck_extension',
      'overhead_press', 'military_press'
    ],
    blockedMovements: [],
    preferUnilateral: false,
    preferMachines: true,
    maxLoadReduction: 0.8,
    allowedAlternatives: [
      'seated_row', 'lat_pulldown', 'cable_row'
    ]
  },
  
  ankles: {
    blockedPatterns: [
      'calf_raise', 'jump', 'box_jump', 'skip',
      'sprint', 'running', 'burpee',
      'deep_squat'
    ],
    blockedMovements: [],
    preferUnilateral: false,
    preferMachines: true,
    maxLoadReduction: 0.7,
    allowedAlternatives: [
      'seated_calf', 'leg_press_calf',
      'leg_press', 'leg_extension', 'leg_curl'
    ]
  },
  
  herniated_disc: {
    // Przepuklina = maksymalna ostrożność z kręgosłupem
    blockedPatterns: [
      'deadlift', 'squat', 'good_morning', 'bent_over',
      'row_barbell', 't_bar', 'shrug',
      'clean', 'snatch', 'jerk',
      'crunch', 'sit_up', 'leg_raise',
      'hyperextension', 'superman'
    ],
    blockedMovements: ['hip_dominant', 'core'],
    preferUnilateral: true,
    preferMachines: true,
    maxLoadReduction: 0.5,
    allowedAlternatives: [
      'leg_press', 'hack_squat', 'belt_squat',
      'machine_row', 'chest_supported_row',
      'lat_pulldown', 'cable_work',
      'plank', 'bird_dog', 'dead_bug'  // Bezpieczne core
    ]
  }
};

// ============================================================================
// MOBILITY REQUIREMENTS MAPPING - Mapowanie problemów mobilności
// ============================================================================

/**
 * Mapowanie problemów mobilności na wymagania w exercises.json
 * Użytkownik zgłasza problem -> blokujemy ćwiczenia wymagające tej mobilności
 */
const MOBILITY_ISSUE_TO_REQUIREMENT = {
  'hip_flexors': ['hip_mobility', 'hip_flexor_flexibility'],
  'hamstrings': ['hamstring_flexibility', 'hip_hinge_mobility'],
  'thoracic': ['thoracic_mobility', 'upper_back_mobility', 'shoulder_mobility'],
  'ankles': ['ankle_mobility', 'ankle_dorsiflexion'],
  'shoulders': ['shoulder_mobility', 'overhead_mobility']
};

// ============================================================================
// EXOTIC EXERCISES FILTER - Unikaj dziwnych ćwiczeń
// ============================================================================

// Wzorce w nazwach ćwiczeń, które są "egzotyczne" i powinny mieć niski priorytet
const EXOTIC_EXERCISE_PATTERNS = [
  '_female', '_male',           // Warianty płciowe
  'exercise_ball', 'swiss_ball', 'stability_ball', 'bosu',  // Piłki
  'trx', 'suspension',          // TRX
  'kettlebell_windmill', 'turkish_get_up',  // Skomplikowane KB
  'sissy_squat',                // Egzotyczne przysiady
  'jefferson',                  // Jefferson deadlift
  'zercher',                    // Zercher (egzotyczny)
];

// Ćwiczenia "klasyczne" - powinny mieć DUŻY bonus
const CLASSIC_EXERCISES = [
  // Compound główne
  'barbell_bench_press', 'barbell_squat', 'barbell_deadlift', 'barbell_row',
  'overhead_press', 'barbell_hip_thrust', 'romanian_deadlift',
  'incline_bench_press', 'decline_bench_press',
  // Hantle
  'dumbbell_bench_press', 'dumbbell_row', 'dumbbell_shoulder_press',
  'dumbbell_curl', 'dumbbell_lateral_raise', 'dumbbell_lunges',
  'dumbbell_fly', 'dumbbell_pullover',
  // Maszyny/kable
  'lat_pulldown', 'cable_row', 'leg_press', 'leg_curl', 'leg_extension',
  'cable_crossover', 'tricep_pushdown', 'cable_curl', 'face_pull',
  'chest_press_machine', 'shoulder_press_machine', 'pec_deck',
  // Bodyweight klasyczne
  'pull_up', 'chin_up', 'dip', 'push_up',
];

// ============================================================================
// 3. SZABLONY SPLITÓW - OPARTE NA BADANIACH NAUKOWYCH
// ============================================================================

/**
 * Każdy split definiuje:
 * - schedule: nazwy bloków treningowych
 * - days: domyślne dni tygodnia
 * - blocks: definicja każdego dnia z:
 *   - muscleGroups: docelowe partie mięśniowe (priorytetowe)
 *   - patterns: wzorce ruchowe do pokrycia
 *   - exerciseCount: BAZOWA liczba ćwiczeń (będzie skalowana do sessionTime)
 *   - compoundFirst: czy zacząć od compound
 */
const SPLIT_TEMPLATES = {
  // 2 dni: Full Body z pełnym pokryciem
  FBW_2: {
    name: "Full Body Workout (2x/tydzień)",
    schedule: ["A", "B"],
    days: ["Poniedziałek", "Czwartek"],
    blocks: {
      A: { 
        muscleGroups: ["quads", "chest", "back", "shoulders", "core"],
        patterns: ["knee_dominant", "push_horizontal", "pull_horizontal", "push_vertical", "core"],
        exerciseCount: 6,
        compoundFirst: true
      },
      B: { 
        muscleGroups: ["hamstrings", "glutes", "back", "chest", "arms"],
        patterns: ["hip_dominant", "pull_vertical", "push_horizontal", "lunge", "accessory"],
        exerciseCount: 6,
        compoundFirst: true
      },
    },
  },
  
  // 3 dni: Full Body lub PPL
  FBW_3: {
    name: "Full Body Workout (3x/tydzień)",
    schedule: ["A", "B", "C"],
    days: ["Poniedziałek", "Środa", "Piątek"],
    blocks: {
      A: { 
        muscleGroups: ["quads", "chest", "back", "shoulders"],
        patterns: ["knee_dominant", "push_horizontal", "pull_horizontal", "accessory"],
        exerciseCount: 5,
        compoundFirst: true
      },
      B: { 
        muscleGroups: ["hamstrings", "back", "chest", "core"],
        patterns: ["hip_dominant", "pull_vertical", "push_vertical", "core"],
        exerciseCount: 5,
        compoundFirst: true
      },
      C: { 
        muscleGroups: ["glutes", "back", "chest", "arms"],
        patterns: ["lunge", "pull_horizontal", "push_horizontal", "accessory"],
        exerciseCount: 5,
        compoundFirst: true
      },
    },
  },
  
  PPL_3: {
    name: "Push/Pull/Legs (3x/tydzień)",
    schedule: ["Push", "Pull", "Legs"],
    days: ["Poniedziałek", "Środa", "Piątek"],
    blocks: {
      Push: { 
        muscleGroups: ["chest", "shoulders", "triceps"],
        patterns: ["push_horizontal", "push_vertical", "accessory"],
        exerciseCount: 6,
        compoundFirst: true
      },
      Pull: { 
        muscleGroups: ["back", "biceps", "rear_delts"],
        patterns: ["pull_horizontal", "pull_vertical", "accessory"],
        exerciseCount: 6,
        compoundFirst: true
      },
      Legs: { 
        muscleGroups: ["quads", "hamstrings", "glutes", "calves", "core"],
        patterns: ["knee_dominant", "hip_dominant", "lunge", "accessory", "core"],
        exerciseCount: 6,
        compoundFirst: true
      },
    },
  },

  // 4 dni: Upper/Lower - optymalny dla większości
  ULUL_4: {
    name: "Upper/Lower Split (4x/tydzień)",
    schedule: ["Upper A", "Lower A", "Upper B", "Lower B"],
    days: ["Poniedziałek", "Wtorek", "Czwartek", "Piątek"],
    blocks: {
      "Upper A": { 
        muscleGroups: ["chest", "back", "shoulders", "triceps", "biceps"],
        patterns: ["push_horizontal", "pull_horizontal", "push_vertical", "pull_vertical", "accessory"],
        exerciseCount: 6,
        compoundFirst: true
      },
      "Lower A": { 
        muscleGroups: ["quads", "hamstrings", "glutes", "calves", "core"],
        patterns: ["knee_dominant", "hip_dominant", "lunge", "accessory", "core"],
        exerciseCount: 6,
        compoundFirst: true
      },
      "Upper B": { 
        muscleGroups: ["back", "chest", "shoulders", "biceps", "triceps"],
        patterns: ["pull_vertical", "push_horizontal", "pull_horizontal", "push_vertical", "accessory"],
        exerciseCount: 6,
        compoundFirst: true
      },
      "Lower B": { 
        muscleGroups: ["hamstrings", "glutes", "quads", "calves", "core"],
        patterns: ["hip_dominant", "lunge", "knee_dominant", "accessory", "core"],
        exerciseCount: 6,
        compoundFirst: true
      },
    },
  },

  // 5 dni: Upper/Lower/Push/Pull/Legs lub Bro Split
  ULPPL_5: {
    name: "Upper/Lower + PPL (5x/tydzień)",
    schedule: ["Upper", "Lower", "Push", "Pull", "Legs"],
    days: ["Poniedziałek", "Wtorek", "Czwartek", "Piątek", "Sobota"],
    blocks: {
      Upper: { 
        muscleGroups: ["chest", "back", "shoulders"],
        patterns: ["push_horizontal", "pull_horizontal", "push_vertical", "pull_vertical"],
        exerciseCount: 5,
        compoundFirst: true
      },
      Lower: { 
        muscleGroups: ["quads", "hamstrings", "glutes", "core"],
        patterns: ["knee_dominant", "hip_dominant", "lunge", "core"],
        exerciseCount: 5,
        compoundFirst: true
      },
      Push: { 
        muscleGroups: ["chest", "shoulders", "triceps"],
        patterns: ["push_horizontal", "push_vertical", "accessory"],
        exerciseCount: 5,
        compoundFirst: true
      },
      Pull: { 
        muscleGroups: ["back", "biceps", "rear_delts"],
        patterns: ["pull_horizontal", "pull_vertical", "accessory"],
        exerciseCount: 5,
        compoundFirst: true
      },
      Legs: { 
        muscleGroups: ["quads", "hamstrings", "glutes", "calves"],
        patterns: ["knee_dominant", "hip_dominant", "lunge", "accessory"],
        exerciseCount: 5,
        compoundFirst: true
      },
    },
  },

  // 6 dni: PPL x2 - maksymalna częstotliwość
  PPL_6: {
    name: "Push/Pull/Legs x2 (6x/tydzień)",
    schedule: ["Push A", "Pull A", "Legs A", "Push B", "Pull B", "Legs B"],
    days: ["Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota"],
    blocks: {
      "Push A": { 
        muscleGroups: ["chest", "shoulders", "triceps"],
        patterns: ["push_horizontal", "push_vertical", "accessory"],
        exerciseCount: 5,
        compoundFirst: true
      },
      "Pull A": { 
        muscleGroups: ["back", "biceps"],
        patterns: ["pull_horizontal", "pull_vertical", "accessory"],
        exerciseCount: 5,
        compoundFirst: true
      },
      "Legs A": { 
        muscleGroups: ["quads", "glutes", "calves", "core"],
        patterns: ["knee_dominant", "lunge", "accessory", "core"],
        exerciseCount: 5,
        compoundFirst: true
      },
      "Push B": { 
        muscleGroups: ["shoulders", "chest", "triceps"],
        patterns: ["push_vertical", "push_horizontal", "accessory"],
        exerciseCount: 5,
        compoundFirst: true
      },
      "Pull B": { 
        muscleGroups: ["back", "biceps", "rear_delts"],
        patterns: ["pull_vertical", "pull_horizontal", "accessory"],
        exerciseCount: 5,
        compoundFirst: true
      },
      "Legs B": { 
        muscleGroups: ["hamstrings", "glutes", "quads", "core"],
        patterns: ["hip_dominant", "lunge", "knee_dominant", "core"],
        exerciseCount: 5,
        compoundFirst: true
      },
    },
  },
  
  // ============================================================================
  // SPLITY DLA KONTUZJI DOLNYCH PLECÓW
  // ============================================================================
  
  // 4-6 dni: Modified Push/Pull (nogi rozbite między dni) - dla lower_back
  MODIFIED_PP_4: {
    name: "Modified Push/Pull (4x/tydzień) - Safe for Lower Back",
    schedule: ["Push + Quads", "Pull + Hams", "Push + Quads B", "Pull + Hams B"],
    days: ["Poniedziałek", "Wtorek", "Czwartek", "Piątek"],
    forInjury: ["lower_back", "herniated_disc"],
    blocks: {
      "Push + Quads": {
        muscleGroups: ["chest", "shoulders", "triceps", "quads"],
        patterns: ["push_horizontal", "push_vertical", "accessory", "knee_dominant"],
        exerciseCount: 6,
        compoundFirst: true,
        // Preferowane ćwiczenia - bez obciążenia kręgosłupa
        preferPatterns: ['leg_press', 'leg_extension', 'hack_squat', 'smith_machine']
      },
      "Pull + Hams": {
        muscleGroups: ["back", "biceps", "hamstrings", "glutes"],
        patterns: ["pull_horizontal", "pull_vertical", "accessory"],
        exerciseCount: 6,
        compoundFirst: true,
        // Bezpieczne dla pleców - maszyny i cable
        preferPatterns: ['lat_pulldown', 'cable_row', 'seated_row', 'leg_curl', 'hip_thrust']
      },
      "Push + Quads B": {
        muscleGroups: ["shoulders", "chest", "triceps", "quads", "core"],
        patterns: ["push_vertical", "push_horizontal", "accessory", "core"],
        exerciseCount: 6,
        compoundFirst: true,
        preferPatterns: ['leg_press', 'goblet_squat', 'bulgarian_split', 'plank', 'bird_dog']
      },
      "Pull + Hams B": {
        muscleGroups: ["back", "biceps", "rear_delts", "hamstrings"],
        patterns: ["pull_vertical", "pull_horizontal", "accessory"],
        exerciseCount: 6,
        compoundFirst: true,
        preferPatterns: ['chest_supported_row', 'lat_pulldown', 'leg_curl', 'glute_bridge']
      },
    },
  },
  
  MODIFIED_PP_5: {
    name: "Modified Push/Pull (5x/tydzień) - Safe for Lower Back",
    schedule: ["Push", "Pull", "Legs (Machine)", "Push B", "Pull B"],
    days: ["Poniedziałek", "Wtorek", "Środa", "Piątek", "Sobota"],
    forInjury: ["lower_back", "herniated_disc"],
    blocks: {
      "Push": {
        muscleGroups: ["chest", "shoulders", "triceps"],
        patterns: ["push_horizontal", "push_vertical", "accessory"],
        exerciseCount: 5,
        compoundFirst: true
      },
      "Pull": {
        muscleGroups: ["back", "biceps"],
        patterns: ["pull_horizontal", "pull_vertical", "accessory"],
        exerciseCount: 5,
        compoundFirst: true,
        preferPatterns: ['lat_pulldown', 'cable_row', 'seated_row', 'chest_supported']
      },
      "Legs (Machine)": {
        muscleGroups: ["quads", "hamstrings", "glutes", "calves"],
        patterns: ["knee_dominant", "accessory"],
        exerciseCount: 5,
        compoundFirst: true,
        // TYLKO maszyny - zero obciążenia osiowego
        preferPatterns: ['leg_press', 'hack_squat', 'leg_extension', 'leg_curl', 'hip_thrust_machine', 'calf_raise_machine']
      },
      "Push B": {
        muscleGroups: ["shoulders", "chest", "triceps", "core"],
        patterns: ["push_vertical", "push_horizontal", "accessory", "core"],
        exerciseCount: 5,
        compoundFirst: true,
        preferPatterns: ['plank', 'bird_dog', 'dead_bug']  // Bezpieczne core
      },
      "Pull B": {
        muscleGroups: ["back", "biceps", "rear_delts"],
        patterns: ["pull_vertical", "pull_horizontal", "accessory"],
        exerciseCount: 5,
        compoundFirst: true,
        preferPatterns: ['lat_pulldown', 'cable_row', 'face_pull']
      },
    },
  },
  
  MODIFIED_PP_6: {
    name: "Modified Push/Pull x2 (6x/tydzień) - Safe for Lower Back",
    schedule: ["Push A", "Pull A", "Legs A (Machine)", "Push B", "Pull B", "Legs B (Machine)"],
    days: ["Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota"],
    forInjury: ["lower_back", "herniated_disc"],
    blocks: {
      "Push A": {
        muscleGroups: ["chest", "shoulders", "triceps"],
        patterns: ["push_horizontal", "push_vertical", "accessory"],
        exerciseCount: 5,
        compoundFirst: true
      },
      "Pull A": {
        muscleGroups: ["back", "biceps"],
        patterns: ["pull_horizontal", "pull_vertical", "accessory"],
        exerciseCount: 5,
        compoundFirst: true,
        preferPatterns: ['lat_pulldown', 'cable_row', 'seated_row', 'chest_supported']
      },
      "Legs A (Machine)": {
        muscleGroups: ["quads", "glutes", "calves"],
        patterns: ["knee_dominant", "accessory"],
        exerciseCount: 4,
        compoundFirst: true,
        preferPatterns: ['leg_press', 'hack_squat', 'leg_extension', 'calf_raise']
      },
      "Push B": {
        muscleGroups: ["shoulders", "chest", "triceps"],
        patterns: ["push_vertical", "push_horizontal", "accessory"],
        exerciseCount: 5,
        compoundFirst: true
      },
      "Pull B": {
        muscleGroups: ["back", "biceps", "rear_delts"],
        patterns: ["pull_vertical", "pull_horizontal", "accessory"],
        exerciseCount: 5,
        compoundFirst: true,
        preferPatterns: ['lat_pulldown', 'cable_row', 'face_pull']
      },
      "Legs B (Machine)": {
        muscleGroups: ["hamstrings", "glutes", "calves", "core"],
        patterns: ["accessory", "core"],
        exerciseCount: 4,
        compoundFirst: true,
        preferPatterns: ['leg_curl', 'hip_thrust', 'glute_bridge', 'plank', 'bird_dog']
      },
    },
  },
  
  // Torso-Limb Split - alternatywa dla kontuzji (wysoka częstotliwość, niskie obciążenie)
  TORSO_LIMB_4: {
    name: "Torso/Limb Split (4x/tydzień)",
    schedule: ["Torso A", "Limbs A", "Torso B", "Limbs B"],
    days: ["Poniedziałek", "Wtorek", "Czwartek", "Piątek"],
    forInjury: ["lower_back", "herniated_disc"],
    blocks: {
      "Torso A": {
        muscleGroups: ["chest", "back", "shoulders"],
        patterns: ["push_horizontal", "pull_horizontal", "push_vertical"],
        exerciseCount: 6,
        compoundFirst: true
      },
      "Limbs A": {
        muscleGroups: ["quads", "hamstrings", "biceps", "triceps"],
        patterns: ["knee_dominant", "accessory"],
        exerciseCount: 6,
        compoundFirst: true,
        preferPatterns: ['leg_press', 'leg_extension', 'leg_curl', 'cable']
      },
      "Torso B": {
        muscleGroups: ["back", "chest", "rear_delts", "core"],
        patterns: ["pull_vertical", "push_horizontal", "accessory", "core"],
        exerciseCount: 6,
        compoundFirst: true,
        preferPatterns: ['lat_pulldown', 'cable_row', 'plank', 'bird_dog']
      },
      "Limbs B": {
        muscleGroups: ["glutes", "hamstrings", "calves", "biceps", "triceps"],
        patterns: ["accessory"],
        exerciseCount: 6,
        compoundFirst: true,
        preferPatterns: ['hip_thrust', 'leg_curl', 'calf_raise', 'cable']
      },
    },
  },

  // ============================================================================
  // FOCUS BODY SPLITS - Ukierunkowane na konkretną część ciała
  // ============================================================================
  
  // LOWER FOCUS - 3 dni nóg, 1 dzień upper (dla osób chcących rozwinąć nogi)
  LOWER_FOCUS_4: {
    name: "Lower Body Focus (4x/tydzień)",
    schedule: ["Lower A (Quads)", "Upper Full", "Lower B (Glutes/Hams)", "Lower C (Power)"],
    days: ["Poniedziałek", "Wtorek", "Czwartek", "Piątek"],
    focusBody: "lower",
    blocks: {
      "Lower A (Quads)": {
        muscleGroups: ["quads", "glutes", "calves"],
        patterns: ["knee_dominant", "lunge", "accessory"],
        exerciseCount: 6,
        compoundFirst: true
      },
      "Upper Full": {
        muscleGroups: ["chest", "back", "shoulders", "arms"],
        patterns: ["push_horizontal", "pull_horizontal", "push_vertical", "pull_vertical", "accessory"],
        exerciseCount: 6,
        compoundFirst: true
      },
      "Lower B (Glutes/Hams)": {
        muscleGroups: ["hamstrings", "glutes", "core"],
        patterns: ["hip_dominant", "lunge", "core"],
        exerciseCount: 6,
        compoundFirst: true
      },
      "Lower C (Power)": {
        muscleGroups: ["quads", "hamstrings", "glutes", "calves"],
        patterns: ["knee_dominant", "hip_dominant", "accessory"],
        exerciseCount: 5,
        compoundFirst: true
      },
    },
  },

  // LOWER FOCUS 5 dni - 4 dni nóg, 1 dzień upper
  LOWER_FOCUS_5: {
    name: "Lower Body Focus (5x/tydzień)",
    schedule: ["Lower A (Quads)", "Lower B (Glutes)", "Upper Full", "Lower C (Hams)", "Lower D (Power)"],
    days: ["Poniedziałek", "Wtorek", "Środa", "Piątek", "Sobota"],
    focusBody: "lower",
    blocks: {
      "Lower A (Quads)": {
        muscleGroups: ["quads", "glutes", "calves"],
        patterns: ["knee_dominant", "lunge", "accessory"],
        exerciseCount: 5,
        compoundFirst: true
      },
      "Lower B (Glutes)": {
        muscleGroups: ["glutes", "hamstrings", "core"],
        patterns: ["hip_dominant", "lunge", "core"],
        exerciseCount: 5,
        compoundFirst: true
      },
      "Upper Full": {
        muscleGroups: ["chest", "back", "shoulders", "arms"],
        patterns: ["push_horizontal", "pull_horizontal", "push_vertical", "pull_vertical", "accessory"],
        exerciseCount: 6,
        compoundFirst: true
      },
      "Lower C (Hams)": {
        muscleGroups: ["hamstrings", "glutes", "calves"],
        patterns: ["hip_dominant", "accessory"],
        exerciseCount: 5,
        compoundFirst: true
      },
      "Lower D (Power)": {
        muscleGroups: ["quads", "hamstrings", "glutes"],
        patterns: ["knee_dominant", "hip_dominant", "lunge"],
        exerciseCount: 5,
        compoundFirst: true
      },
    },
  },

  // UPPER FOCUS - 3 dni upper, 1 dzień lower (dla osób chcących rozwinąć górę)
  UPPER_FOCUS_4: {
    name: "Upper Body Focus (4x/tydzień)",
    schedule: ["Upper A (Push)", "Lower Full", "Upper B (Pull)", "Upper C (Shoulders/Arms)"],
    days: ["Poniedziałek", "Wtorek", "Czwartek", "Piątek"],
    focusBody: "upper",
    blocks: {
      "Upper A (Push)": {
        muscleGroups: ["chest", "shoulders", "triceps"],
        patterns: ["push_horizontal", "push_vertical", "accessory"],
        exerciseCount: 6,
        compoundFirst: true
      },
      "Lower Full": {
        muscleGroups: ["quads", "hamstrings", "glutes", "calves", "core"],
        patterns: ["knee_dominant", "hip_dominant", "lunge", "core"],
        exerciseCount: 6,
        compoundFirst: true
      },
      "Upper B (Pull)": {
        muscleGroups: ["back", "biceps", "rear_delts"],
        patterns: ["pull_horizontal", "pull_vertical", "accessory"],
        exerciseCount: 6,
        compoundFirst: true
      },
      "Upper C (Shoulders/Arms)": {
        muscleGroups: ["shoulders", "biceps", "triceps", "chest"],
        patterns: ["push_vertical", "accessory"],
        exerciseCount: 5,
        compoundFirst: true
      },
    },
  },

  // UPPER FOCUS 5 dni - 4 dni upper, 1 dzień lower
  UPPER_FOCUS_5: {
    name: "Upper Body Focus (5x/tydzień)",
    schedule: ["Upper A (Push H)", "Upper B (Pull)", "Lower Full", "Upper C (Push V)", "Upper D (Arms)"],
    days: ["Poniedziałek", "Wtorek", "Środa", "Piątek", "Sobota"],
    focusBody: "upper",
    blocks: {
      "Upper A (Push H)": {
        muscleGroups: ["chest", "triceps", "shoulders"],
        patterns: ["push_horizontal", "accessory"],
        exerciseCount: 5,
        compoundFirst: true
      },
      "Upper B (Pull)": {
        muscleGroups: ["back", "biceps", "rear_delts"],
        patterns: ["pull_horizontal", "pull_vertical", "accessory"],
        exerciseCount: 5,
        compoundFirst: true
      },
      "Lower Full": {
        muscleGroups: ["quads", "hamstrings", "glutes", "calves", "core"],
        patterns: ["knee_dominant", "hip_dominant", "lunge", "core"],
        exerciseCount: 6,
        compoundFirst: true
      },
      "Upper C (Push V)": {
        muscleGroups: ["shoulders", "chest", "triceps"],
        patterns: ["push_vertical", "push_horizontal", "accessory"],
        exerciseCount: 5,
        compoundFirst: true
      },
      "Upper D (Arms)": {
        muscleGroups: ["biceps", "triceps", "forearms", "shoulders"],
        patterns: ["accessory"],
        exerciseCount: 5,
        compoundFirst: true
      },
    },
  },

  // CORE FOCUS - Dla osób chcących wzmocnić core (np. po ciąży, ból pleców)
  CORE_FOCUS_3: {
    name: "Core Focus (3x/tydzień)",
    schedule: ["Full Body + Core A", "Full Body + Core B", "Full Body + Core C"],
    days: ["Poniedziałek", "Środa", "Piątek"],
    focusBody: "core",
    blocks: {
      "Full Body + Core A": {
        muscleGroups: ["quads", "chest", "back", "core"],
        patterns: ["knee_dominant", "push_horizontal", "pull_horizontal", "core", "core"],
        exerciseCount: 6,
        compoundFirst: true
      },
      "Full Body + Core B": {
        muscleGroups: ["hamstrings", "shoulders", "back", "core"],
        patterns: ["hip_dominant", "push_vertical", "pull_vertical", "core", "core"],
        exerciseCount: 6,
        compoundFirst: true
      },
      "Full Body + Core C": {
        muscleGroups: ["glutes", "chest", "back", "core"],
        patterns: ["lunge", "push_horizontal", "pull_horizontal", "core", "core"],
        exerciseCount: 6,
        compoundFirst: true
      },
    },
  },
};

// ============================================================================
// 4. POPULARNE/OPTYMALNE ĆWICZENIA - PREDEFINIOWANE PRIORYTETY
// ============================================================================

/**
 * Najlepsze ćwiczenia dla każdego wzorca - te będą wybierane jako pierwsze
 * Oparte na: EMG studies, popularności, efektywności
 */
const PRIORITY_EXERCISES = {
  // NOGI - Compound
  knee_dominant: [
    'barbell_squat', 'barbell_back_squat', 'barbell_front_squat', 'goblet_squat',
    'leg_press', 'hack_squat', 'smith_machine_squat', 'bulgarian_split_squat',
    'dumbbell_squat', 'sumo_squat', 'front_squat', 'back_squat'
  ],
  hip_dominant: [
    'barbell_deadlift', 'romanian_deadlift', 'stiff_leg_deadlift', 'sumo_deadlift',
    'hip_thrust', 'barbell_hip_thrust', 'glute_bridge', 'good_morning',
    'cable_pull_through', 'hyperextension', 'deadlift', 'rdl'
  ],
  lunge: [
    'walking_lunge', 'reverse_lunge', 'forward_lunge', 'dumbbell_lunge',
    'barbell_lunge', 'step_up', 'lateral_lunge', 'curtsy_lunge',
    'bulgarian_split_squat', 'split_squat'
  ],
  
  // PUSH
  push_horizontal: [
    'barbell_bench_press', 'dumbbell_bench_press', 'incline_bench_press',
    'incline_dumbbell_press', 'dumbbell_press', 'push_up', 'chest_dip',
    'machine_chest_press', 'cable_crossover', 'dumbbell_fly', 'bench_press',
    'flat_bench_press', 'decline_bench_press'
  ],
  push_vertical: [
    'overhead_press', 'barbell_overhead_press', 'dumbbell_shoulder_press',
    'military_press', 'arnold_press', 'seated_dumbbell_press',
    'machine_shoulder_press', 'pike_push_up', 'handstand_push_up',
    'shoulder_press', 'ohp'
  ],
  
  // PULL
  pull_horizontal: [
    'barbell_row', 'bent_over_row', 'dumbbell_row', 'cable_row', 'seated_cable_row',
    't_bar_row', 'pendlay_row', 'chest_supported_row', 'machine_row',
    'one_arm_dumbbell_row', 'row', 'cable_seated_row'
  ],
  pull_vertical: [
    'pull_up', 'chin_up', 'lat_pulldown', 'wide_grip_pulldown',
    'close_grip_pulldown', 'assisted_pull_up', 'neutral_grip_pull_up',
    'straight_arm_pulldown', 'pulldown', 'pullup'
  ],
  
  // CORE
  core: [
    'plank', 'dead_bug', 'ab_wheel', 'hanging_leg_raise', 'cable_crunch',
    'russian_twist', 'bicycle_crunch', 'mountain_climber', 'side_plank',
    'reverse_crunch', 'leg_raise', 'crunch', 'sit_up', 'ab_rollout'
  ],
  
  // ACCESSORY - Ramiona, łydki, etc.
  accessory: [
    // Biceps
    'barbell_curl', 'dumbbell_curl', 'hammer_curl', 'preacher_curl', 'cable_curl',
    'concentration_curl', 'incline_dumbbell_curl', 'ez_bar_curl',
    // Triceps
    'tricep_pushdown', 'tricep_dip', 'skull_crusher', 'overhead_tricep_extension', 
    'close_grip_bench_press', 'tricep_extension', 'rope_pushdown',
    // Shoulders
    'lateral_raise', 'front_raise', 'face_pull', 'rear_delt_fly', 'upright_row',
    'cable_lateral_raise', 'dumbbell_lateral_raise',
    // Calves
    'calf_raise', 'seated_calf_raise', 'standing_calf_raise',
    // Forearms
    'wrist_curl', 'reverse_wrist_curl', 'farmers_walk'
  ]
};

// ============================================================================
// 4B. DEFINICJE UPPER/LOWER BODY PARTS
// ============================================================================

const UPPER_BODY_PARTS = ['CHEST', 'BACK', 'SHOULDERS', 'ARMS'];
const LOWER_BODY_PARTS = ['LEGS', 'GLUTES'];
const CORE_BODY_PARTS = ['CORE'];

const UPPER_MUSCLES = [
  'pectorals', 'chest', 'lats', 'back', 'upper back', 'rhomboids', 
  'shoulders', 'deltoids', 'rear deltoids', 'front deltoids',
  'biceps', 'triceps', 'forearms', 'traps', 'trapezius'
];
const LOWER_MUSCLES = [
  'quads', 'quadriceps', 'hamstrings', 'glutes', 'calves', 
  'hip flexors', 'adductors', 'abductors'
];

// Ćwiczenia do wykluczenia (nonsensowne lub niebezpieczne)
const BLACKLISTED_EXERCISES = [
  'one_arm_dip', // Zbyt zaawansowane, często błędnie tagowane
  'one_arm_chin_up', // Zbyt zaawansowane dla większości
];

// Ćwiczenia wymagające specjalnego traktowania (nie na koniec treningu)
const HIGH_SKILL_EXERCISES = [
  'handstand_push_up', 'pike_push_up', 'muscle_up', 'front_lever', 
  'back_lever', 'planche', 'one_arm_push_up'
];

// ============================================================================
// 4C. GRUPY PODOBNYCH ĆWICZEŃ (nie wybieraj więcej niż 1 z grupy)
// ============================================================================

// MAKSYMALNA LICZBA ĆWICZEŃ NA TEN SAM PATTERN (np. max 2 brzuszki)
const PATTERN_MAX_COUNT = {
  'core': 2,           // Max 2 ćwiczenia na brzuch w jednej sesji
  'accessory': 3,      // Max 3 izolacje
  'push_horizontal': 2,
  'push_vertical': 2,
  'pull_horizontal': 2,
  'pull_vertical': 2,
  'knee_dominant': 2,
  'hip_dominant': 2,
  'lunge': 2,
  'default': 2         // Domyślnie max 2
};

// Grupy ćwiczeń które są de facto tym samym ruchem - MAX 1 z grupy
const MUTUALLY_EXCLUSIVE_EXERCISES = [
  // Martwe ciągi - TYLKO 1 w treningu!
  ['barbell_deadlift', 'romanian_deadlift', 'stiff_leg_deadlift', 'sumo_deadlift', 
   'trap_bar_deadlift', 'good_morning', 'rack_pull', 'straight_leg_deadlift',
   'dumbbell_deadlift', 'dumbbell_romanian_deadlift', 'dumbbell_stiff_leg'],
  // Przysiady - max 1 wariant
  ['barbell_squat', 'back_squat', 'front_squat', 'narrow_stance_squat', 'one_leg_squat'],
  // Wyciskanie leżąc - max 1 wariant
  ['barbell_bench_press', 'close_grip_bench_press', 'wide_grip_bench_press'],
];

// Grupy podobnych ćwiczeń - MAX 2 ze wszystkich grup wiosłowań łącznie
const ROW_EXERCISES = [
  'barbell_row', 'bent_over_row', 'pendlay_row', 't_bar_row',
  'dumbbell_row', 'one_arm_dumbbell_row', 'chest_supported_row',
  'cable_row', 'seated_cable_row', 'machine_row', 'meadows_row', 'seal_row'
];

const PULLDOWN_EXERCISES = [
  'pull_up', 'chin_up', 'neutral_grip_pull_up', 'wide_grip_pull_up',
  'lat_pulldown', 'wide_grip_pulldown', 'close_grip_pulldown', 'straight_arm_pulldown'
];

const SQUAT_EXERCISES = [
  'barbell_squat', 'barbell_back_squat', 'barbell_front_squat', 'smith_machine_squat',
  'goblet_squat', 'dumbbell_squat', 'hack_squat', 'leg_press', 'belt_squat'
];

const BENCH_EXERCISES = [
  'barbell_bench_press', 'dumbbell_bench_press', 'machine_chest_press',
  'incline_bench_press', 'incline_dumbbell_press', 'decline_bench_press'
];

const SHOULDER_PRESS_EXERCISES = [
  'overhead_press', 'barbell_overhead_press', 'military_press',
  'dumbbell_shoulder_press', 'seated_dumbbell_press', 'arnold_press', 'machine_shoulder_press'
];

const LUNGE_EXERCISES = [
  'walking_lunge', 'forward_lunge', 'reverse_lunge', 'dumbbell_lunge', 'barbell_lunge',
  'bulgarian_split_squat', 'split_squat', 'step_up'
];

const HIP_THRUST_EXERCISES = [
  'hip_thrust', 'barbell_hip_thrust', 'glute_bridge', 'single_leg_hip_thrust'
];

// Limity dla grup (klucz = lista ćwiczeń, wartość = max dozwolone)
const EXERCISE_GROUP_LIMITS = [
  { exercises: ROW_EXERCISES, maxCount: 2, name: 'rows' },
  { exercises: PULLDOWN_EXERCISES, maxCount: 2, name: 'pulldowns/pullups' },
  { exercises: SQUAT_EXERCISES, maxCount: 2, name: 'squats' },
  { exercises: BENCH_EXERCISES, maxCount: 2, name: 'bench presses' },
  { exercises: SHOULDER_PRESS_EXERCISES, maxCount: 2, name: 'shoulder presses' },
  { exercises: LUNGE_EXERCISES, maxCount: 2, name: 'lunges' },
  { exercises: HIP_THRUST_EXERCISES, maxCount: 1, name: 'hip thrusts' },
];

// ============================================================================
// 4D. REGRESJE DLA POCZĄTKUJĄCYCH (Beginner Regressions)
// ============================================================================

// Mapowanie trudnych ćwiczeń na łatwiejsze alternatywy dla początkujących
const BEGINNER_REGRESSION_MAP = {
  // Pull-upy -> łatwiejsze warianty
  'pull_up': ['lat_pulldown', 'assisted_pull_up', 'negative_pull_up', 'inverted_row'],
  'chin_up': ['lat_pulldown', 'assisted_chin_up', 'negative_chin_up', 'inverted_row'],
  'wide_grip_pull_up': ['lat_pulldown', 'inverted_row'],
  // Dipy -> łatwiejsze warianty
  'chest_dip': ['bench_dip', 'push_up', 'assisted_dip', 'machine_chest_press'],
  'triceps_dip': ['bench_dip', 'triceps_pushdown', 'close_grip_push_up'],
  'ring_dip': ['bench_dip', 'push_up'],
  // Inne trudne ćwiczenia
  'muscle_up': ['pull_up', 'lat_pulldown'],
  'pistol_squat': ['bodyweight_squat', 'assisted_pistol', 'box_squat'],
  'handstand_push_up': ['pike_push_up', 'dumbbell_shoulder_press'],
  'l_sit': ['knee_raise', 'hanging_knee_raise'],
};

// Ćwiczenia ZAKAZANE dla początkujących (bez względu na to co wybierze algorytm)
const BEGINNER_BANNED_EXERCISES = [
  'muscle_up', 'iron_cross', 'planche', 'front_lever', 'back_lever',
  'one_arm_pull_up', 'one_arm_push_up', 'pistol_squat', 'dragon_flag',
  'handstand_push_up', 'strict_muscle_up', 'ring_muscle_up',
  // Trudne ćwiczenia ze sztangą
  'snatch', 'clean_and_jerk', 'power_clean', 'hang_clean',
  'overhead_squat', 'zercher_squat', 'jefferson_deadlift'
];

// ============================================================================
// 5. HELPERY - NORMALIZACJA I MAPOWANIA
// ============================================================================

const DAY_NAMES = {
  'mon': 'Poniedziałek', 'tue': 'Wtorek', 'wed': 'Środa',
  'thu': 'Czwartek', 'fri': 'Piątek', 'sat': 'Sobota', 'sun': 'Niedziela'
};
const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function normalizeEquipment(name) {
  if (!name) return 'bodyweight';
  
  // Jeśli to tablica, normalizuj pierwszy element lub zwróć 'bodyweight'
  if (Array.isArray(name)) {
    if (name.length === 0) return 'bodyweight';
    name = name[0];
  }
  
  // Upewnij się że to string
  if (typeof name !== 'string') {
    return 'bodyweight';
  }
  
  const normalized = name.toLowerCase().trim();
  const mapping = {
    'body weight': 'bodyweight', 'body_weight': 'bodyweight', 'none': 'bodyweight',
    'dumbells': 'dumbbell', 'dumbbells': 'dumbbell',
    'barbells': 'barbell', 'cables': 'cable', 'machines': 'machine',
    'bands': 'band', 'resistance band': 'band', 'kettlebells': 'kettlebell',
    'pull up bar': 'pull_up_bar', 'pullup bar': 'pull_up_bar', 'pull-up bar': 'pull_up_bar',
    'ez bar': 'ez_bar', 'smith machine': 'smith_machine',
  };
  return mapping[normalized] || normalized;
}

// Sprzęt z ciężarami (priorytetowy) - od najlepszego do najgorszego
const WEIGHTED_EQUIPMENT_PRIORITY = [
  'barbell',      // Najlepszy - największe obciążenia, progresja
  'dumbbell',     // Bardzo dobry - unilateralne, zakres ruchu
  'machine',      // Dobry - bezpieczny, izolacja
  'cable',        // Dobry - stałe napięcie
  'smith_machine',// OK - prowadzony ruch
  'ez_bar',       // OK - specjalistyczny
  'kettlebell',   // OK - funkcjonalny
  'pull_up_bar',  // Bodyweight ale z obciążeniem możliwym
  'band',         // Słaby - ograniczona progresja
  'bodyweight'    // Ostateczność - tylko gdy brak sprzętu
];

// Sprzęt który umożliwia prawdziwe ciężary
const TRUE_WEIGHTED_EQUIPMENT = ['barbell', 'dumbbell', 'machine', 'cable', 'smith_machine', 'ez_bar', 'kettlebell'];

// Ćwiczenia bodyweight które są DOZWOLONE nawet gdy użytkownik ma ciężary
// (klasyki, których nie da się zastąpić lub są bardzo wartościowe dla core)
const ALLOWED_BODYWEIGHT_EXERCISES = [
  // Pull-upy i chin-upy - klasyki górnej partii pleców
  'pull_up', 'chin_up', 'wide_grip_pull_up', 'neutral_grip_pull_up',
  'assisted_pull_up', 'band_assisted_pull_up',
  // Dipy - klasyka triceps/klatka
  'dip', 'chest_dip', 'tricep_dip', 'bench_dip',
  // Core - bodyweight jest tu OK
  'plank', 'dead_bug', 'side_plank', 'hanging_leg_raise', 'leg_raise',
  'crunch', 'sit_up', 'bicycle_crunch', 'mountain_climber', 'russian_twist',
  'ab_wheel', 'ab_rollout', 'reverse_crunch', 'v_up',
  // Hyperextensions
  'hyperextension', 'back_extension', 'reverse_hyperextension'
];

// Wzorce nazw ćwiczeń bodyweight do zablokowania (kalistenika zaawansowana)
const BLOCKED_CALISTHENICS_PATTERNS = [
  'planche', 'lever', 'muscle_up', 'handstand', 'l_sit', 'human_flag',
  'pistol_squat', 'one_arm_push', 'one_arm_pull', 'maltese', 'iron_cross',
  'dragon_flag', 'front_lever', 'back_lever', 'straddle', 'archer'
];

// Wzorce ćwiczeń do zablokowania w trybie siłowym/masy (zbyt egzotyczne)
const BLOCKED_FOR_STRENGTH_MASS = [
  'exercise_ball', 'swiss_ball', 'stability_ball', 'bosu',
  'trx', 'suspension', 'balance_board', 'wobble'
];

// Wzorce ćwiczeń do ZAWSZE blokowania (zbyt egzotyczne dla zwykłych użytkowników)
const ALWAYS_BLOCKED_PATTERNS = [
  'exercise_ball', 'swiss_ball', 'stability_ball', 'bosu'
];

function normalizePattern(pattern) {
  if (!pattern) return 'accessory';
  const mapping = {
    'pull_vertical': 'pull_vertical', 'pull_horizontal': 'pull_horizontal',
    'push_vertical': 'push_vertical', 'push_horizontal': 'push_horizontal',
    'knee_dominant': 'knee_dominant', 'hip_dominant': 'hip_dominant',
    'lunge': 'lunge', 'core': 'core', 'accessory': 'accessory',
    'carry': 'accessory', 'isolation': 'accessory'
  };
  return mapping[pattern] || pattern;
}

// Mapowanie kontuzji
const INJURY_MAPPING = {
  'knees': ['knee', 'knees', 'patella', 'acl', 'mcl'],
  'shoulders': ['shoulder', 'shoulders', 'rotator cuff', 'rotator', 'deltoid'],
  'lower_back': ['lower back', 'lumbar', 'herniated disc', 'disc'],
  'upper_back': ['upper back', 'thoracic', 'neck', 'cervical'],
  'wrists': ['wrist', 'wrists', 'carpal'],
  'elbows': ['elbow', 'elbows', 'tennis elbow', 'golfers elbow'],
  'hips': ['hip', 'hips', 'hip flexor'],
  'ankles': ['ankle', 'ankles', 'ankle sprain'],
  'herniated_disc': ['herniated disc', 'disc herniation', 'lower back'],
  'neck': ['neck', 'cervical', 'neck strain']
};

// ============================================================================
// 6. GŁÓWNY ALGORYTM GENEROWANIA PLANU
// ============================================================================

function validateAnswers(a) {
  const errors = [];
  if (!a.goal) errors.push("Brak celu");
  if (!a.days_per_week) errors.push("Brak dni treningowych");
  return errors;
}

/**
 * Wybór splitu z uwzględnieniem kontuzji i focus body
 * @param {string} goal - cel treningowy
 * @param {number} days - dni w tygodniu
 * @param {string} experience - poziom doświadczenia
 * @param {string[]} injuries - lista kontuzji użytkownika
 * @param {string} focusBody - część ciała do rozwinięcia (upper/lower/core/balanced)
 * @returns {Object} - wybrany szablon splitu
 */
function pickSplit(goal, days, experience, injuries = [], focusBody = 'balanced') {
  // Sprawdź czy użytkownik ma kontuzję wymagającą modyfikacji splitu
  const hasLowerBackInjury = injuries.some(inj => 
    inj === 'lower_back' || inj === 'herniated_disc'
  );
  
  // ============================================================================
  // KONFLIKT: FOCUS BODY vs KONTUZJA
  // ============================================================================
  // Jeśli użytkownik chce focus:lower ale ma kontuzję dolnych pleców,
  // NIE możemy tego zrealizować - bezpieczeństwo > preferencje
  if (hasLowerBackInjury && focusBody === 'lower') {
    console.warn(`⚠️ [KONFLIKT] Focus: lower + kontuzja dolnych pleców`);
    console.warn(`   -> Nie można bezpiecznie zwiększyć treningu nóg przy kontuzji kręgosłupa`);
    console.warn(`   -> Ignoruję focus body, używam bezpiecznego splitu`);
    // Resetuj focusBody do balanced dla bezpieczeństwa
    focusBody = 'balanced';
  }
  
  // ============================================================================
  // SPLIT OVERRIDE DLA KONTUZJI DOLNYCH PLECÓW
  // ============================================================================
  // Blokujemy klasyczne PPL (Push/Pull/Legs) bo:
  // - 2 dni Legs = ciężkie obciążenie kręgosłupa (przysiady, martwe ciągi)
  // - 2 dni Pull = martwe ciągi, wiosłowania = ryzyko kumulacji zmęczenia lędźwi
  // Zamiast tego: Modified Push/Pull gdzie nogi są rozbite lub na maszynach
  
  if (hasLowerBackInjury) {
    console.log(`[Split Override] Kontuzja dolnych pleców - blokada klasycznego PPL`);
    
    // Początkujący z kontuzją - Full Body (mniej intensywne)
    if (experience === 'beginner') {
      if (days <= 2) return SPLIT_TEMPLATES.FBW_2;
      if (days <= 3) return SPLIT_TEMPLATES.FBW_3;
      // 4+ dni - Modified Push/Pull zamiast Upper/Lower
      return SPLIT_TEMPLATES.MODIFIED_PP_4;
    }
    
    // Średnio/zaawansowani z kontuzją
    if (days <= 2) return SPLIT_TEMPLATES.FBW_2;
    if (days === 3) return SPLIT_TEMPLATES.FBW_3;  // FBW zamiast PPL
    if (days === 4) return SPLIT_TEMPLATES.MODIFIED_PP_4;  // Modified PP zamiast ULUL
    if (days === 5) return SPLIT_TEMPLATES.MODIFIED_PP_5;
    // 6 dni - Modified PP x2 zamiast PPL x2
    return SPLIT_TEMPLATES.MODIFIED_PP_6;
  }
  
  // ============================================================================
  // FOCUS BODY SPLIT SELECTION
  // ============================================================================
  // Jeśli użytkownik chce skupić się na konkretnej części ciała, wybierz
  // odpowiedni split z większą liczbą dni na tę część
  
  if (focusBody && focusBody !== 'balanced') {
    console.log(`[Focus Body] Wybieramy split ukierunkowany na: ${focusBody}`);
    
    // LOWER BODY FOCUS - więcej dni nóg
    if (focusBody === 'lower') {
      if (days <= 3) {
        // Przy 2-3 dniach Full Body i tak ćwiczymy nogi każdego dnia
        console.log(`  -> 2-3 dni: Full Body (nogi w każdym dniu)`);
        if (days <= 2) return SPLIT_TEMPLATES.FBW_2;
        return SPLIT_TEMPLATES.FBW_3;
      }
      if (days === 4) {
        console.log(`  -> 4 dni: Lower Focus (3 dni nóg, 1 upper)`);
        return SPLIT_TEMPLATES.LOWER_FOCUS_4;
      }
      if (days >= 5) {
        console.log(`  -> 5+ dni: Lower Focus (4 dni nóg, 1 upper)`);
        return SPLIT_TEMPLATES.LOWER_FOCUS_5;
      }
    }
    
    // UPPER BODY FOCUS - więcej dni górnych partii
    if (focusBody === 'upper') {
      if (days <= 3) {
        // Przy 2-3 dniach Full Body, ale możemy dać PPL z dodatkowym Push/Pull
        console.log(`  -> 2-3 dni: Full Body lub PPL`);
        if (days <= 2) return SPLIT_TEMPLATES.FBW_2;
        return SPLIT_TEMPLATES.PPL_3; // PPL daje 2 dni upper (Push+Pull), 1 Legs
      }
      if (days === 4) {
        console.log(`  -> 4 dni: Upper Focus (3 dni upper, 1 lower)`);
        return SPLIT_TEMPLATES.UPPER_FOCUS_4;
      }
      if (days >= 5) {
        console.log(`  -> 5+ dni: Upper Focus (4 dni upper, 1 lower)`);
        return SPLIT_TEMPLATES.UPPER_FOCUS_5;
      }
    }
    
    // CORE FOCUS - wzmocnienie core (po ciąży, ból pleców)
    if (focusBody === 'core') {
      console.log(`  -> Core Focus (Full Body + extra core każdego dnia)`);
      // Dla core focus zawsze używamy Full Body z dodatkowym core
      // bo chcemy trenować core w każdym dniu, nie tylko w dni Lower
      if (days <= 3) return SPLIT_TEMPLATES.CORE_FOCUS_3;
      if (days === 4) return SPLIT_TEMPLATES.CORE_FOCUS_3; // Użyj 3-dniowego, bo nie mamy 4-dniowego
      // Dla 5+ dni - Full Body 3x + core każdego dnia
      return SPLIT_TEMPLATES.CORE_FOCUS_3;
    }
  }
  
  // ============================================================================
  // STANDARDOWY WYBÓR SPLITU (balanced focus)
  // ============================================================================
  
  // Początkujący - zawsze Full Body
  if (experience === 'beginner') {
    if (days <= 2) return SPLIT_TEMPLATES.FBW_2;
    if (days <= 3) return SPLIT_TEMPLATES.FBW_3;
    return SPLIT_TEMPLATES.ULUL_4;
  }
  
  // Średniozaawansowani i zaawansowani
  if (days <= 2) return SPLIT_TEMPLATES.FBW_2;
  if (days === 3) {
    return (goal === 'mass' || goal === 'strength') ? SPLIT_TEMPLATES.PPL_3 : SPLIT_TEMPLATES.FBW_3;
  }
  if (days === 4) return SPLIT_TEMPLATES.ULUL_4;
  if (days === 5) return SPLIT_TEMPLATES.ULPPL_5;
  return SPLIT_TEMPLATES.PPL_6;
}

function selectTrainingDays(daysNeeded, preferredDays = []) {
  const sortedPreferred = preferredDays
    .filter(d => DAY_ORDER.includes(d))
    .sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));
  
  if (sortedPreferred.length === 0) {
    const defaultSpreads = {
      2: ['mon', 'thu'],
      3: ['mon', 'wed', 'fri'],
      4: ['mon', 'tue', 'thu', 'fri'],
      5: ['mon', 'tue', 'wed', 'fri', 'sat'],
      6: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
      7: DAY_ORDER
    };
    return (defaultSpreads[daysNeeded] || defaultSpreads[3]).map(d => DAY_NAMES[d]);
  }
  
  let selectedDays = [];
  
  if (sortedPreferred.length >= daysNeeded) {
    // Wybierz równomiernie rozłożone dni
    const step = sortedPreferred.length / daysNeeded;
    for (let i = 0; i < daysNeeded; i++) {
      const idx = Math.floor(i * step);
      selectedDays.push(sortedPreferred[idx]);
    }
  } else {
    // Za mało preferowanych - uzupełnij
    selectedDays = [...sortedPreferred];
    const remaining = DAY_ORDER.filter(d => !selectedDays.includes(d));
    while (selectedDays.length < daysNeeded && remaining.length > 0) {
      selectedDays.push(remaining.shift());
    }
    selectedDays.sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));
  }
  
  return selectedDays.map(d => DAY_NAMES[d]);
}

/**
 * NOWA FUNKCJA: Oblicza optymalną liczbę ćwiczeń na podstawie sessionTime i celu
 * @param {number} sessionTime - czas sesji w minutach
 * @param {string} goal - cel treningowy
 * @param {string} experience - poziom doświadczenia
 * @returns {{ exerciseCount: number, compoundCount: number, isolationCount: number, avgTimePerExercise: number }}
 */
function calculateSessionExerciseCount(sessionTime, goal, experience) {
  // BAZA: 1 ćwiczenie = ok. 8-10 minut (z rozgrzewką, seriami, zmianą sprzętu)
  // Dla 90 minut celujemy w 7-9 ćwiczeń + rozgrzewka
  
  let baseCount = 0;
  
  if (sessionTime <= 30) baseCount = 3;
  else if (sessionTime <= 45) baseCount = 4;
  else if (sessionTime <= 60) baseCount = 5;
  else if (sessionTime <= 75) baseCount = 6;
  else if (sessionTime <= 90) baseCount = 7;
  else baseCount = 8;

  // Modyfikatory na podstawie celu
  if (goal === 'endurance' || goal === 'reduction') {
    baseCount += 1; // Krótsze przerwy = więcej ćwiczeń
  }
  if (goal === 'strength') {
    baseCount -= 1; // Długie przerwy = mniej ćwiczeń
  }
  
  // Modyfikatory na podstawie doświadczenia
  if (experience === 'beginner') {
    baseCount -= 1; // Mniejsza pojemność treningowa
  }
  if (experience === 'advanced') {
    baseCount += 1; // Większa pojemność
  }

  // Hard limits
  baseCount = Math.max(3, Math.min(baseCount, 10));

  // Oblicz proporcję compound vs isolation
  const compoundRatio = COMPOUND_RATIO[goal] || 0.6;
  const compoundCount = Math.round(baseCount * compoundRatio);
  const isolationCount = baseCount - compoundCount;
  
  // Średni czas na ćwiczenie
  const avgTimePerExercise = sessionTime / baseCount;
  
  return {
    exerciseCount: baseCount,
    compoundCount,
    isolationCount,
    avgTimePerExercise,
    sessionTime
  };
}

/**
 * GŁÓWNA FUNKCJA - Generuje zaawansowany plan treningowy
 */
function generateAdvancedPlan(userProfile, allExercises, historyMap = {}) {
  const {
    experience = 'intermediate',
    daysPerWeek = 4,
    injuries = [],
    equipment = ['bodyweight'],
    goal = 'mass',
    location = 'gym',
    preferredDays = [],
    sessionTime = 60,
    focusBody = 'balanced',
    weakPoints = [],
    fatigueTolerance = 'medium',
    preferUnilateral = false,
    includeWarmup = false
  } = userProfile;

  console.log(`\n=== GENEROWANIE PLANU TRENINGOWEGO ===`);
  console.log(`Cel: ${goal}, Dni: ${daysPerWeek}, Poziom: ${experience}`);
  console.log(`Sprzęt: ${equipment.join(', ')}, Lokalizacja: ${location}`);
  console.log(`Dostępne ćwiczenia: ${allExercises.length}`);

  // 1. NORMALIZACJA SPRZĘTU
  // Obsłuż przypadek gdy equipment zawiera obiekty lub zagnieżdżone tablice
  const flatEquipment = equipment.flat().map(e => {
    if (typeof e === 'object' && e !== null) {
      return e.en || e.pl || e.name || String(e);
    }
    return e;
  });
  const normalizedEquipment = flatEquipment.map(normalizeEquipment);
  
  // Sprawdź czy użytkownik ma dostęp do prawdziwych ciężarów
  const hasWeightedEquipment = normalizedEquipment.some(eq => TRUE_WEIGHTED_EQUIPMENT.includes(eq));
  const bodyweightOnly = normalizedEquipment.length === 1 && normalizedEquipment[0] === 'bodyweight';
  
  console.log(`Sprzęt z ciężarami: ${hasWeightedEquipment}, Tylko bodyweight: ${bodyweightOnly}`);
  
  // 2. ROZSZERZENIE KONTUZJI
  const expandedInjuries = injuries.flatMap(inj => INJURY_MAPPING[inj] || [inj]);
  
  // 2b. PRZYGOTUJ BLOKADY WZORCÓW RUCHOWYCH DLA KONTUZJI
  const blockedPatternsFromInjuries = new Set();
  const blockedMovementsFromInjuries = new Set();
  const blockedGripTypes = new Set();
  const preferredGripTypes = new Set();
  const injuryPreferUnilateral = injuries.some(inj => INJURY_BLOCKED_PATTERNS[inj]?.preferUnilateral);
  const injuryPreferMachines = injuries.some(inj => INJURY_BLOCKED_PATTERNS[inj]?.preferMachines);
  const injuryPreferNeutralGrip = injuries.some(inj => INJURY_BLOCKED_PATTERNS[inj]?.preferNeutralGrip);
  
  for (const injury of injuries) {
    const injuryConfig = INJURY_BLOCKED_PATTERNS[injury];
    if (injuryConfig) {
      injuryConfig.blockedPatterns?.forEach(p => blockedPatternsFromInjuries.add(p.toLowerCase()));
      injuryConfig.blockedMovements?.forEach(m => blockedMovementsFromInjuries.add(m.toLowerCase()));
      injuryConfig.blockedGripTypes?.forEach(g => blockedGripTypes.add(g.toLowerCase()));
      injuryConfig.preferredGripTypes?.forEach(g => preferredGripTypes.add(g.toLowerCase()));
    }
  }
  
  // 2c. PRZYGOTUJ BLOKADY MOBILNOŚCI
  const mobilityIssues = userProfile.mobilityIssues || [];
  const blockedMobilityRequirements = new Set();
  
  for (const issue of mobilityIssues) {
    const requirements = MOBILITY_ISSUE_TO_REQUIREMENT[issue] || [];
    requirements.forEach(req => blockedMobilityRequirements.add(req.toLowerCase()));
  }
  
  if (blockedPatternsFromInjuries.size > 0) {
    console.log(`[Injury Filter] Zablokowane wzorce: ${[...blockedPatternsFromInjuries].slice(0, 10).join(', ')}...`);
  }
  
  // 2c. SPRAWDŹ CZY UŻYTKOWNIK MA KÓŁKA (rings)
  const hasRings = normalizedEquipment.some(eq => 
    eq === 'rings' || eq === 'gymnastic_rings' || eq === 'gymnastics_rings'
  );

  // 3. FILTROWANIE ĆWICZEŃ
  const validExercises = allExercises.filter(ex => {
    // Wyklucz warmup z głównych ćwiczeń
    if (ex.tier === 'warmup') return false;
    
    // Sprawdź kontuzje (oryginalne pole safety.excluded_injuries)
    if (ex.safety?.excluded_injuries) {
      const hasConflict = ex.safety.excluded_injuries.some(exInj => {
        const normalizedExInj = exInj.toLowerCase();
        return expandedInjuries.some(userInj => 
          normalizedExInj.includes(userInj.toLowerCase()) ||
          userInj.toLowerCase().includes(normalizedExInj)
        );
      });
      if (hasConflict) return false;
    }
    
    const exCode = (ex.code || '').toLowerCase();
    const exPattern = (ex.pattern || '').toLowerCase();
    
    // ============================================================================
    // NOWE: BLOKADA WZORCÓW RUCHOWYCH PRZY KONTUZJACH
    // ============================================================================
    // Sprawdź czy ćwiczenie zawiera zablokowany wzorzec w nazwie
    const hasBlockedPatternInName = [...blockedPatternsFromInjuries].some(pattern =>
      exCode.includes(pattern)
    );
    if (hasBlockedPatternInName) return false;
    
    // Sprawdź czy pattern ćwiczenia jest zablokowany
    if (blockedMovementsFromInjuries.has(exPattern)) {
      // Nie blokuj całkowicie - sprawdź czy to bezpieczna alternatywa
      // (np. leg_press jest OK dla hip_dominant przy lower_back)
      const isSafeAlternative = injuries.some(inj => {
        const config = INJURY_BLOCKED_PATTERNS[inj];
        return config?.allowedAlternatives?.some(alt => exCode.includes(alt));
      });
      if (!isSafeAlternative) return false;
    }
    
    // ============================================================================
    // BLOKADA ĆWICZEŃ WYMAGAJĄCYCH KÓŁEK (rings)
    // ============================================================================
    if (!hasRings) {
      const requiresRings = RINGS_REQUIRED_PATTERNS.some(pattern =>
        exCode.includes(pattern)
      );
      if (requiresRings) return false;
    }
    
    // Sprawdź sprzęt
    const exEquipment = normalizeEquipment(ex.equipment);
    
    // Jeśli ćwiczenie wymaga sprzętu, którego użytkownik nie ma - wyklucz
    if (exEquipment && exEquipment !== 'bodyweight') {
      if (!normalizedEquipment.includes(exEquipment)) return false;
    }
    
    // BLOKADA EXERCISE_BALL - zawsze (te ćwiczenia są zbyt niestabilne)
    const hasExerciseBall = ALWAYS_BLOCKED_PATTERNS.some(pattern => 
      exCode.includes(pattern)
    );
    if (hasExerciseBall) return false;
    
    // BLOKADA ĆWICZEŃ NA PIŁKACH I NIESTABILNYCH POWIERZCHNIACH dla strength/mass
    // (te ćwiczenia nie budują siły ani masy - lepsze dla rehabilitacji)
    if (['strength', 'mass', 'hypertrophy'].includes(goal)) {
      const hasUnstableEquipment = BLOCKED_FOR_STRENGTH_MASS.some(pattern => 
        exCode.includes(pattern)
      );
      if (hasUnstableEquipment) return false;
    }
    
    // BLOKADA BODYWEIGHT gdy użytkownik ma ciężary!
    // Chyba że ćwiczenie jest na liście dozwolonych (pull-upy, dipy, core)
    if (hasWeightedEquipment && exEquipment === 'bodyweight') {
      // Sprawdź czy to dozwolone ćwiczenie bodyweight
      const isAllowed = ALLOWED_BODYWEIGHT_EXERCISES.some(allowed => 
        exCode.includes(allowed) || allowed.includes(exCode)
      );
      
      // Sprawdź czy to zablokowana kalistenika (planche, lever, muscle-up, etc.)
      const isBlockedCalisthenics = BLOCKED_CALISTHENICS_PATTERNS.some(pattern =>
        exCode.includes(pattern)
      );
      
      // Blokuj jeśli to kalistenika lub nie jest na liście dozwolonych
      if (isBlockedCalisthenics) return false;
      if (!isAllowed) return false;
    }
    
    // Blokuj zaawansowaną kalistytnikę nawet gdy user nie ma ciężarów
    // (to są bardzo trudne ruchy, nie dla typowego użytkownika)
    if (experience !== 'advanced') {
      const isAdvancedCalisthenics = BLOCKED_CALISTHENICS_PATTERNS.some(pattern =>
        exCode.includes(pattern)
      );
      if (isAdvancedCalisthenics) return false;
    }
    
    // --- STRICT FILTERS DLA POCZĄTKUJĄCYCH I INTERMEDIATE (CRITICAL FIX) ---
    // Ćwiczenia ELITE - zawsze blokuj dla nie-zaawansowanych
    const eliteExercises = ['l_pull', 'muscle_up', 'pistol', 'planche', 'front_lever', 'back_lever', 'human_flag', 'iron_cross', 'one_arm_pull', 'one_arm_chin'];
    if (experience !== 'advanced' && eliteExercises.some(c => exCode.includes(c))) {
      return false;
    }
    
    if (experience === 'beginner') {
      // Blokada ćwiczeń advanced/elite dla beginners
      if (['advanced', 'elite'].includes(ex.difficulty)) return false;
      
      // Dodatkowa blokada dla trudnej kalisteniki bez asysty
      const hardCalisthenics = ['pull_up', 'chin_up', 'dip', 'hanging_leg_raise'];
      if (hardCalisthenics.some(c => exCode.includes(c))) {
        // Pozwól tylko jeśli są gumy (bands) lub maszyny do asysty
        if (!normalizedEquipment.includes('band') && !normalizedEquipment.includes('machine')) {
          return false;
        }
      }
    }
    
    // --- STRICT FILTERS DLA CELU TRENINGOWEGO ---
    if (goal === 'strength') {
      // Siła = zero cardio/plyo
      if (ex.mechanics === 'cardio') return false;
      if (ex.pattern === 'plyometric') return false;
      const cardioPatterns = ['burpee', 'jump', 'run', 'sprint', 'jog', 'skip', 'hop'];
      if (cardioPatterns.some(w => exCode.includes(w))) return false;
    }
    
    if (goal === 'endurance' || goal === 'reduction') {
      // Endurance = możemy użyć więcej izolacji i cardio
      // Nie blokujemy, ale zmniejszymy score dla heavy compound w calculateExerciseScore
    }
    
    // ============================================================================
    // NOWE: FILTROWANIE PO grip_type (dla kontuzji nadgarstków)
    // ============================================================================
    if (blockedGripTypes.size > 0 && ex.grip_type) {
      const exGrip = ex.grip_type.toLowerCase();
      if (blockedGripTypes.has(exGrip)) {
        return false; // Blokuj ćwiczenie z zakazanym chwytem
      }
    }
    
    // ============================================================================
    // NOWE: FILTROWANIE PO mobility_requirements (dla problemów z mobilnością)
    // ============================================================================
    if (blockedMobilityRequirements.size > 0 && ex.mobility_requirements) {
      const exMobility = ex.mobility_requirements || [];
      const hasBlockedMobility = exMobility.some(req => 
        blockedMobilityRequirements.has(req.toLowerCase())
      );
      if (hasBlockedMobility) {
        return false; // Blokuj ćwiczenie wymagające mobilności której user nie ma
      }
    }
    
    return true;
  });

  console.log(`Po filtrowaniu: ${validExercises.length} ćwiczeń`);

  if (validExercises.length < 20) {
    console.warn('UWAGA: Mało ćwiczeń po filtrowaniu!');
  }

  // 4. WYBÓR SPLITU (z uwzględnieniem kontuzji i focus body!)
  const splitTemplate = pickSplit(goal, daysPerWeek, experience, injuries, focusBody);
  console.log(`Wybrany split: ${splitTemplate.name}`);
  if (focusBody && focusBody !== 'balanced') {
    console.log(`Focus body: ${focusBody} - split dostosowany do priorytetów`);
  }
  // 5. WYBÓR DNI TRENINGOWYCH
  const trainingDays = selectTrainingDays(splitTemplate.schedule.length, preferredDays);
  console.log(`Dni: ${trainingDays.join(', ')}`);

  // 6. OBLICZ OPTYMALNĄ LICZBĘ ĆWICZEŃ NA PODSTAWIE sessionTime
  const sessionConfig = calculateSessionExerciseCount(sessionTime, goal, experience);
  console.log(`Session config: ${sessionConfig.exerciseCount} ćwiczeń (${sessionConfig.compoundCount} compound, ${sessionConfig.isolationCount} izolacja)`);
  console.log(`Cel czasowy: ${sessionTime} min, średnio ${sessionConfig.avgTimePerExercise.toFixed(1)} min/ćwiczenie`);
  
  // 7. GENEROWANIE PLANU TYGODNIOWEGO
  const weekPlan = [];
  const usedCodesWeekly = new Set(); // Unikaj powtórzeń w tygodniu

  for (let i = 0; i < splitTemplate.schedule.length; i++) {
    const blockName = splitTemplate.schedule[i];
    const dayLabel = trainingDays[i];
    const blockDef = splitTemplate.blocks[blockName];
    
    // NOWE: Nadpisz exerciseCount na podstawie sessionTime
    const adjustedBlockDef = {
      ...blockDef,
      exerciseCount: sessionConfig.exerciseCount,
      targetCompoundCount: sessionConfig.compoundCount,
      targetIsolationCount: sessionConfig.isolationCount
    };
    
    const dayExercises = selectExercisesForDay(
      validExercises,
      adjustedBlockDef,
      usedCodesWeekly,
      {
        experience, goal, focusBody, weakPoints,
        fatigueTolerance, preferUnilateral,
        hasWeightedEquipment, bodyweightOnly,
        sessionTime // Przekaż sessionTime do funkcji
      },
      blockName // Przekaż nazwę bloku do filtrowania Upper/Lower
    );

    // Oznacz użyte ćwiczenia
    dayExercises.forEach(ex => {
      usedCodesWeekly.add(ex.code);
      // Zablokuj też alternatywy
      const alts = ALTERNATIVES_MAP.get(ex.code);
      if (alts) alts.forEach(alt => usedCodesWeekly.add(alt));
      
      // Zablokuj wzajemnie wykluczające się ćwiczenia (np. jeśli wybrano romanian_deadlift, zablokuj wszystkie inne martwe ciągi)
      for (const group of MUTUALLY_EXCLUSIVE_EXERCISES) {
        const exInGroup = group.some(code => (ex.code || '').includes(code) || code.includes(ex.code || ''));
        if (exInGroup) {
          group.forEach(code => usedCodesWeekly.add(code));
        }
      }
    });

    // Dodaj rozgrzewkę jeśli wymagana
    let warmupExercises = [];
    if (includeWarmup) {
      warmupExercises = selectWarmupExercises(allExercises, blockDef.muscleGroups, usedCodesWeekly);
    }

    // NOWE: Konfiguruj objętość z uwzględnieniem sessionTime
    let configuredExercises = dayExercises.map((ex, idx) => 
      configureVolume(ex, experience, goal, historyMap, fatigueTolerance, sessionTime, dayExercises.length, idx)
    );

    // --- CRITICAL FIX: Skaluj objętość żeby wypełnić czas sesji ---
    let dayDraft = {
      day: dayLabel,
      exercises: configuredExercises
    };
    
    // Skalujemy objętość (serie/przerwy) żeby dobić do sessionTime
    dayDraft = adjustVolumeToDuration(dayDraft, sessionTime, goal, experience);
    
    // Przypisz przeskalowane ćwiczenia
    configuredExercises = dayDraft.exercises;
    const estimatedDuration = dayDraft.estimatedDuration;
    // ----------------------------------------------------------

    const totalFatigue = configuredExercises.reduce((sum, ex) => 
      sum + (ex.fatigue_score || 3), 0);

    console.log(`${dayLabel} (${blockName}): ${configuredExercises.length} ćwiczeń, REAL TIME: ${estimatedDuration} min`);

    weekPlan.push({
      day: dayLabel,
      block: blockName,
      warmup: warmupExercises.map(ex => configureVolume(ex, experience, goal, historyMap, fatigueTolerance)),
      exercises: configuredExercises,
      estimatedDuration: estimatedDuration,
      totalFatigue
    });
  }

  return {
    split: splitTemplate.name,
    userProfile: { experience, goal, daysPerWeek, focusBody, weakPoints, fatigueTolerance },
    week: weekPlan,
    progression: generateProgressionModel(experience),
    summary: {
      totalExercisesPerWeek: weekPlan.reduce((sum, day) => sum + day.exercises.length, 0),
      avgExercisesPerDay: Math.round(weekPlan.reduce((sum, day) => sum + day.exercises.length, 0) / weekPlan.length),
      avgDuration: Math.round(weekPlan.reduce((sum, day) => sum + day.estimatedDuration, 0) / weekPlan.length),
      musclesCovered: [...new Set(weekPlan.flatMap(d => d.exercises.map(e => e.primary_muscle)).filter(Boolean))]
    }
  };
}

/**
 * Wybiera ćwiczenia dla danego dnia treningowego
 * GWARANTUJE exerciseCount ćwiczeń
 * Z WALIDACJĄ: body_part, podobne ćwiczenia, blacklist
 */
function selectExercisesForDay(validExercises, blockDef, usedCodes, options, blockName = '') {
  const { experience, goal, focusBody, weakPoints, fatigueTolerance, preferUnilateral, hasWeightedEquipment, bodyweightOnly } = options;
  const targetCount = blockDef.exerciseCount;
  const selectedExercises = [];
  const usedPatterns = new Set();
  const usedDetailedMuscles = new Map(); // detailed_muscle -> count
  const patternCounts = new Map(); // pattern -> count (dla limitów redundancji)

  // Określ czy to dzień Upper, Lower, Push, Pull, Legs etc.
  const isUpperDay = /upper|push|pull/i.test(blockName);
  const isLowerDay = /lower|legs/i.test(blockName);
  const isPushDay = /push/i.test(blockName);
  const isPullDay = /pull/i.test(blockName);
  const isFullBodyDay = blockName.toLowerCase().includes('full') || (!isUpperDay && !isLowerDay);

  console.log(`  [${blockName}] Upper: ${isUpperDay}, Lower: ${isLowerDay}, Push: ${isPushDay}, Pull: ${isPullDay}, FullBody: ${isFullBodyDay}`);

  // ==================== FOCUS BODY CONFIGURATION ====================
  // Focus body wpływa głównie na WYBÓR SPLITU (więcej dni na focus body)
  // Na poziomie dnia dajemy tylko BONUS w scoring dla focus body ćwiczeń
  // NIE WYMUSZAMY 60% - to byłoby niemożliwe (Upper day nie ma ćwiczeń na nogi!)
  const focusBodyParts = {
    'upper': ['CHEST', 'BACK', 'SHOULDERS', 'ARMS'],
    'lower': ['LEGS', 'GLUTES'],
    'core': ['CORE'],
    'balanced': null
  };
  const focusParts = focusBodyParts[focusBody];
  
  // Dla Full Body dni - wymuszamy min ćwiczeń na focus body
  // Dla specjalistycznych dni (Upper/Lower) - nie wymuszamy (split już to robi)
  let minFocusExercises = 0;
  if (focusParts && focusBody !== 'balanced' && isFullBodyDay) {
    // Tylko dla Full Body - wymuszamy 40% na focus (nie 60%, bo musi być miejsce na inne)
    minFocusExercises = Math.ceil(targetCount * 0.4);
    console.log(`  [${blockName}] Focus (Full Body): ${focusBody} - wymuszamy min ${minFocusExercises}/${targetCount} ćwiczeń`);
  } else if (focusParts && focusBody !== 'balanced') {
    // Dla specjalistycznych dni - tylko log, split już załatwia focus
    console.log(`  [${blockName}] Focus: ${focusBody} - split już dostosowany, nie wymuszamy %`);
  }

  // ==================== FATIGUE TOLERANCE LOGIC ====================
  // Jeśli fatigueTolerance == 'low', blokuj kumulację ciężkich ćwiczeń
  const maxHighFatigueExercises = fatigueTolerance === 'low' ? 2 : (fatigueTolerance === 'medium' ? 4 : 6);
  let highFatigueCount = 0;

  // Mapowanie weak points na mięśnie
  const weakMuscles = (weakPoints || []).filter(w => w !== 'none').flatMap(w => {
    const mapping = {
      'chest': ['pectorals', 'chest'], 'back': ['lats', 'back', 'upper back'],
      'shoulders': ['shoulders', 'deltoids'], 'biceps': ['biceps'],
      'triceps': ['triceps'], 'quads': ['quads', 'quadriceps'],
      'hamstrings': ['hamstrings'], 'glutes': ['glutes'],
      'abs': ['abs', 'core'], 'calves': ['calves'],
      'forearms': ['forearms'], 'traps': ['traps', 'trapezius']
    };
    return mapping[w] || [w];
  });

  // ==================== HELPER FUNCTIONS ====================
  
  /**
   * Sprawdza czy ćwiczenie pasuje do focus body
   */
  function matchesFocusBody(ex) {
    if (!focusParts) return true; // balanced = wszystko OK
    const bodyPart = (ex.body_part || '').toUpperCase();
    return focusParts.includes(bodyPart);
  }
  
  /**
   * Sprawdza czy ćwiczenie pasuje do dnia (Upper/Lower filtering)
   */
  function matchesBodyPartForDay(ex) {
    const bodyPart = (ex.body_part || '').toUpperCase();
    const detailedMuscle = (ex.detailed_muscle || '').toLowerCase();
    
    // FBW - wszystko dozwolone
    if (!isUpperDay && !isLowerDay) return true;
    
    if (isUpperDay) {
      // Upper day: tylko CHEST, BACK, SHOULDERS, ARMS
      if (LOWER_BODY_PARTS.includes(bodyPart)) return false;
      if (LOWER_MUSCLES.some(m => detailedMuscle.includes(m))) return false;
      // Wyjątek: Core może być wszędzie
      if (bodyPart === 'CORE') return true;
      return true;
    }
    
    if (isLowerDay) {
      // Lower day: tylko LEGS, GLUTES, CORE
      if (UPPER_BODY_PARTS.includes(bodyPart)) return false;
      if (UPPER_MUSCLES.some(m => detailedMuscle.includes(m))) return false;
      // Core jest OK
      if (bodyPart === 'CORE') return true;
      return true;
    }
    
    return true;
  }

  /**
   * Sprawdza czy ćwiczenie jest na blacklisted
   */
  function isBlacklisted(ex) {
    return BLACKLISTED_EXERCISES.includes(ex.code);
  }

  /**
   * Sprawdza czy dodanie ćwiczenia spowoduje za dużo podobnych
   */
  function wouldCreateTooManySimilar(ex, selectedList) {
    const exCode = ex.code || '';
    
    // 1. Sprawdź wzajemnie wykluczające się (np. martwe ciągi - tylko 1!)
    for (const group of MUTUALLY_EXCLUSIVE_EXERCISES) {
      const exInGroup = group.some(code => exCode.includes(code) || code.includes(exCode));
      if (exInGroup) {
        const alreadyHaveOne = selectedList.some(s => 
          group.some(code => (s.code || '').includes(code) || code.includes(s.code || ''))
        );
        if (alreadyHaveOne) return true;
      }
    }
    
    // 2. Sprawdź limity grup ćwiczeń
    for (const groupDef of EXERCISE_GROUP_LIMITS) {
      const exInGroup = groupDef.exercises.some(code => exCode.includes(code) || code.includes(exCode));
      if (exInGroup) {
        const countFromGroup = selectedList.filter(s => 
          groupDef.exercises.some(code => (s.code || '').includes(code) || code.includes(s.code || ''))
        ).length;
        
        if (countFromGroup >= groupDef.maxCount) {
          return true;
        }
      }
    }
    
    // 3. NOWE: Sprawdź limit pattern (max 2 brzuszki, max 2 izolacje tego samego typu)
    const exPattern = normalizePattern(ex.pattern);
    const patternMax = PATTERN_MAX_COUNT[exPattern] || PATTERN_MAX_COUNT['default'];
    const currentPatternCount = patternCounts.get(exPattern) || 0;
    if (currentPatternCount >= patternMax) {
      return true;
    }
    
    return false;
  }

  /**
   * Sprawdza czy mięsień nie jest już przeciążony
   */
  function wouldOverloadMuscle(ex, usedMusclesMap) {
    const muscle = ex.detailed_muscle || ex.primary_muscle || 'unknown';
    const currentCount = usedMusclesMap.get(muscle) || 0;
    // Max 2 ćwiczenia na ten sam detailed_muscle
    return currentCount >= 2;
  }
  
  /**
   * NOWE: Sprawdza fatigue - czy dodanie ćwiczenia przekroczy limit zmęczenia
   */
  function wouldExceedFatigue(ex) {
    const fatigueScore = ex.fatigue_score || 3;
    if (fatigueScore >= 6 && highFatigueCount >= maxHighFatigueExercises) {
      return true; // Za dużo ciężkich ćwiczeń
    }
    return false;
  }
  
  /**
   * NOWE: Sprawdza czy ćwiczenie jest odpowiednie dla poziomu
   */
  function isAppropriateForLevel(ex) {
    const exCode = (ex.code || '').toLowerCase();
    
    // Dla początkujących - blokuj zaawansowane ćwiczenia
    if (experience === 'beginner') {
      // Sprawdź czy to zakazane ćwiczenie dla beginnera
      if (BEGINNER_BANNED_EXERCISES.some(banned => exCode.includes(banned))) {
        return false;
      }
      
      // Sprawdź czy to trudne ćwiczenie (pull-up, dip dla bodyweight)
      if (bodyweightOnly) {
        const needsRegression = Object.keys(BEGINNER_REGRESSION_MAP).some(hard => exCode.includes(hard));
        // Nie blokuj całkowicie, ale daj dużą karę (obsłużone w score)
      }
    }
    
    return true;
  }

  // ==================== KROK 1: PRZYGOTUJ KANDYDATÓW ====================
  
  const candidates = validExercises
    .filter(ex => {
      // Podstawowe filtry
      if (usedCodes.has(ex.code)) return false;
      if (isBlacklisted(ex)) return false;
      if (!matchesBodyPartForDay(ex)) return false;
      if (!isAppropriateForLevel(ex)) return false;
      return true;
    })
    .map(ex => ({
      ...ex,
      score: calculateExerciseScore(ex, {
        patterns: blockDef.patterns,
        muscleGroups: blockDef.muscleGroups,
        experience, goal, weakMuscles, focusParts, preferUnilateral, hasWeightedEquipment,
        bodyweightOnly, fatigueTolerance // NOWE: przekaż dodatkowe parametry
      })
    }))
    .sort((a, b) => b.score - a.score);

  console.log(`  [${blockName}] Kandydaci po filtrowaniu body_part: ${candidates.length}`);

  // ==================== KROK 1.5: WYMUŚ FOCUS BODY (jeśli ustawiony) ====================
  // Podziel kandydatów na focus i non-focus
  const focusCandidates = focusParts ? candidates.filter(ex => matchesFocusBody(ex)) : [];
  const nonFocusCandidates = focusParts ? candidates.filter(ex => !matchesFocusBody(ex)) : candidates;
  
  let focusExercisesSelected = 0;

  // ==================== KROK 2: WYBIERZ GŁÓWNE ĆWICZENIA (PO 1 NA WZORZEC) ====================
  
  for (const pattern of blockDef.patterns) {
    if (selectedExercises.length >= targetCount) break;
    
    // Znajdź najlepsze ćwiczenie dla tego wzorca
    let patternExercises = candidates.filter(ex => {
      if (normalizePattern(ex.pattern) !== pattern) return false;
      if (selectedExercises.find(s => s.code === ex.code)) return false;
      if (wouldCreateTooManySimilar(ex, selectedExercises)) return false;
      if (wouldOverloadMuscle(ex, usedDetailedMuscles)) return false;
      if (wouldExceedFatigue(ex)) return false; // NOWE: sprawdź fatigue
      return true;
    });
    
    // NOWE: Jeśli potrzebujemy więcej focus exercises, priorytetyzuj je
    if (focusParts && focusExercisesSelected < minFocusExercises) {
      const focusPatternEx = patternExercises.filter(ex => matchesFocusBody(ex));
      if (focusPatternEx.length > 0) {
        patternExercises = focusPatternEx; // Preferuj focus exercises
      }
    }

    // Priorytet: optimal > standard, compound > isolation
    const sorted = patternExercises.sort((a, b) => {
      // Tier priority
      const tierOrder = { 'optimal': 3, 'standard': 2, 'warmup': 0 };
      const tierDiff = (tierOrder[b.tier] || 1) - (tierOrder[a.tier] || 1);
      if (tierDiff !== 0) return tierDiff;
      
      // Compound first dla głównych wzorców
      if (blockDef.compoundFirst && !['accessory', 'core'].includes(pattern)) {
        if (a.mechanics === 'compound' && b.mechanics !== 'compound') return -1;
        if (b.mechanics === 'compound' && a.mechanics !== 'compound') return 1;
      }
      
      return b.score - a.score;
    });

    if (sorted.length > 0) {
      const chosen = sorted[0];
      selectedExercises.push(chosen);
      usedPatterns.add(pattern);
      
      // Zapisz użyty mięsień
      const muscle = chosen.detailed_muscle || chosen.primary_muscle || 'unknown';
      usedDetailedMuscles.set(muscle, (usedDetailedMuscles.get(muscle) || 0) + 1);
      
      // Zapisz pattern count
      const exPattern = normalizePattern(chosen.pattern);
      patternCounts.set(exPattern, (patternCounts.get(exPattern) || 0) + 1);
      
      // NOWE: Sprawdź czy to focus exercise
      if (matchesFocusBody(chosen)) focusExercisesSelected++;
      
      // NOWE: Aktualizuj fatigue count
      if ((chosen.fatigue_score || 3) >= 6) highFatigueCount++;
      
      console.log(`    + ${chosen.code} (pattern: ${pattern}, muscle: ${muscle})`);
    }
  }

  // ==================== KROK 3: UZUPEŁNIJ DO targetCount ====================
  
  let fillAttempts = 0;
  while (selectedExercises.length < targetCount && fillAttempts < 100) {
    fillAttempts++;
    
    // NOWE: Jeśli brakuje focus exercises, szukaj tylko wśród focus
    const needMoreFocus = focusParts && focusExercisesSelected < minFocusExercises;
    
    // Znajdź ćwiczenie, które jeszcze nie zostało wybrane
    let remaining = candidates.filter(ex => {
      if (selectedExercises.find(s => s.code === ex.code)) return false;
      if (usedCodes.has(ex.code)) return false;
      if (wouldCreateTooManySimilar(ex, selectedExercises)) return false;
      if (wouldOverloadMuscle(ex, usedDetailedMuscles)) return false;
      if (wouldExceedFatigue(ex)) return false; // NOWE
      return true;
    });
    
    // Jeśli potrzebujemy więcej focus, filtruj tylko focus
    if (needMoreFocus && remaining.some(ex => matchesFocusBody(ex))) {
      remaining = remaining.filter(ex => matchesFocusBody(ex));
    }

    if (remaining.length === 0) {
      // FALLBACK: Rozluźnij ograniczenia overload, ale ZAWSZE respektuj similar (żadnych dubli martwych ciągów!)
      const fallback = candidates.filter(ex => {
        if (selectedExercises.find(s => s.code === ex.code)) return false;
        if (usedCodes.has(ex.code)) return false;
        // NADAL blokuj podobne ćwiczenia (martwe ciągi, wiosłowania etc.)
        if (wouldCreateTooManySimilar(ex, selectedExercises)) return false;
        return true;
      });
      
      if (fallback.length === 0) {
        console.warn(`  [${blockName}] Nie można znaleźć więcej ćwiczeń. Mamy ${selectedExercises.length}/${targetCount}`);
        break;
      }
      
      // Wybierz z fallback
      const chosen = fallback[0];
      selectedExercises.push(chosen);
      const muscle = chosen.detailed_muscle || chosen.primary_muscle || 'unknown';
      usedDetailedMuscles.set(muscle, (usedDetailedMuscles.get(muscle) || 0) + 1);
      console.log(`    + ${chosen.code} (FALLBACK, muscle: ${muscle})`);
      continue;
    }

    // Preferuj ćwiczenia na właściwe grupy mięśniowe, słabe punkty i różne mięśnie
    const prioritized = remaining.sort((a, b) => {
      let aScore = a.score;
      let bScore = b.score;
      
      // DUŻY bonus za pasowanie do grupy mięśniowej bloku
      const aMatchesMuscle = blockDef.muscleGroups.some(m => 
        a.primary_muscle?.toLowerCase().includes(m.toLowerCase()) ||
        m.toLowerCase().includes(a.primary_muscle?.toLowerCase() || '')
      );
      const bMatchesMuscle = blockDef.muscleGroups.some(m => 
        b.primary_muscle?.toLowerCase().includes(m.toLowerCase()) ||
        m.toLowerCase().includes(b.primary_muscle?.toLowerCase() || '')
      );
      if (aMatchesMuscle) aScore += 50;
      if (bMatchesMuscle) bScore += 50;
      
      // Bonus za pasowanie do wzorca bloku
      if (blockDef.patterns.includes(normalizePattern(a.pattern))) aScore += 30;
      if (blockDef.patterns.includes(normalizePattern(b.pattern))) bScore += 30;
      
      // Bonus za NOWY mięsień (różnorodność) - WAŻNE!
      const aIsNew = !usedDetailedMuscles.has(a.detailed_muscle || a.primary_muscle);
      const bIsNew = !usedDetailedMuscles.has(b.detailed_muscle || b.primary_muscle);
      if (aIsNew) aScore += 25;
      if (bIsNew) bScore += 25;
      
      // Bonus za słabe punkty
      if (weakMuscles.includes(a.primary_muscle)) aScore += 20;
      if (weakMuscles.includes(b.primary_muscle)) bScore += 20;
      
      return bScore - aScore;
    });

    const chosen = prioritized[0];
    selectedExercises.push(chosen);
    const muscle = chosen.detailed_muscle || chosen.primary_muscle || 'unknown';
    usedDetailedMuscles.set(muscle, (usedDetailedMuscles.get(muscle) || 0) + 1);
    
    // NOWE: Aktualizuj pattern counts
    const exPattern = normalizePattern(chosen.pattern);
    patternCounts.set(exPattern, (patternCounts.get(exPattern) || 0) + 1);
    
    // NOWE: Aktualizuj focus i fatigue counts
    if (matchesFocusBody(chosen)) focusExercisesSelected++;
    if ((chosen.fatigue_score || 3) >= 6) highFatigueCount++;
    
    console.log(`    + ${chosen.code} (fill, muscle: ${muscle})`);
  }
  
  // NOWE: Podsumowanie focus
  if (focusParts && focusBody !== 'balanced') {
    console.log(`  [${blockName}] Focus ${focusBody}: ${focusExercisesSelected}/${targetCount} ćwiczeń (min ${minFocusExercises})`);
  }

  // ==================== KROK 4: SORTUJ FINALNIE ====================
  
  return selectedExercises.sort((a, b) => {
    // High skill exercises NIE na koniec (np. HSPU na początku gdy świeży)
    const aHighSkill = HIGH_SKILL_EXERCISES.some(code => (a.code || '').includes(code));
    const bHighSkill = HIGH_SKILL_EXERCISES.some(code => (b.code || '').includes(code));
    if (aHighSkill && !bHighSkill) return -1;
    if (bHighSkill && !aHighSkill) return 1;
    
    // Tier priority (optimal first)
    const tierOrder = { 'optimal': 3, 'standard': 2, 'warmup': 0 };
    const tierDiff = (tierOrder[b.tier] || 1) - (tierOrder[a.tier] || 1);
    if (tierDiff !== 0) return tierDiff;
    
    // Compound before isolation
    if (a.mechanics === 'compound' && b.mechanics !== 'compound') return -1;
    if (b.mechanics === 'compound' && a.mechanics !== 'compound') return 1;
    
    // Higher fatigue first (bardziej wymagające na początku)
    return (b.fatigue_score || 3) - (a.fatigue_score || 3);
  });
}

/**
 * Oblicza score ćwiczenia na podstawie wielu czynników
 */
function calculateExerciseScore(ex, context) {
  const { patterns, muscleGroups, experience, goal, weakMuscles, focusParts, preferUnilateral, hasWeightedEquipment, bodyweightOnly, fatigueTolerance } = context;
  let score = 50;
  
  const exCode = (ex.code || '').toLowerCase();

  // 0. PRIORYTET SPRZĘTU - CIĘŻARY NAD BODYWEIGHT (NAJWAŻNIEJSZE!)
  const exEquipment = normalizeEquipment(ex.equipment);
  const equipmentIndex = WEIGHTED_EQUIPMENT_PRIORITY.indexOf(exEquipment);
  
  if (hasWeightedEquipment) {
    // Użytkownik ma ciężary - mocno priorytetyzuj sprzęt z ciężarami
    if (TRUE_WEIGHTED_EQUIPMENT.includes(exEquipment)) {
      // Bonus za ciężary: barbell +50, dumbbell +45, machine +40, itd.
      score += 50 - (equipmentIndex * 5);
    } else if (exEquipment === 'bodyweight') {
      // Kara za bodyweight gdy mamy ciężary (chyba że to core/rozciąganie)
      const isCore = (ex.pattern === 'core' || ex.body_part?.toUpperCase() === 'CORE');
      const isPullUp = exCode.includes('pull_up') || exCode.includes('chin_up');
      
      if (isCore) {
        score -= 5; // Core bodyweight jest OK
      } else if (isPullUp) {
        score -= 10; // Pull-upy są klasyką
      } else {
        score -= 40; // Duża kara za zwykłe bodyweight
      }
    } else if (exEquipment === 'band') {
      score -= 20; // Gumy są słabe dla hipertrofii
    }
  }
  
  // 0.5 NOWE: BEGINNER PENALTY dla trudnych ćwiczeń bodyweight
  if (experience === 'beginner' && bodyweightOnly) {
    // Kara za trudne ćwiczenia wymagające regresji
    const needsRegression = Object.keys(BEGINNER_REGRESSION_MAP).some(hard => exCode.includes(hard));
    if (needsRegression) {
      score -= 60; // DUŻA kara - preferuj łatwiejsze alternatywy
    }
    
    // Bonus za ćwiczenia "regression-friendly"
    const regressionExercises = Object.values(BEGINNER_REGRESSION_MAP).flat();
    const isRegression = regressionExercises.some(reg => exCode.includes(reg));
    if (isRegression) {
      score += 30; // Bonus za łatwiejsze warianty
    }
  }
  
  // 0.6 NOWE: FATIGUE TOLERANCE - kara za ciężkie ćwiczenia przy niskiej tolerancji
  if (fatigueTolerance === 'low') {
    const fatigueScore = ex.fatigue_score || 3;
    if (fatigueScore >= 7) {
      score -= 40; // Duża kara za bardzo ciężkie ćwiczenia
    } else if (fatigueScore >= 5) {
      score -= 15; // Mniejsza kara za średnio ciężkie
    }
  }

  // 1. TIER - jakość ćwiczenia
  if (ex.tier === 'optimal') score += 40;
  else if (ex.tier === 'standard') score += 20;

  // 2. PATTERN match
  const exPattern = normalizePattern(ex.pattern);
  if (patterns.includes(exPattern)) score += 25;

  // 3. MUSCLE GROUP match
  if (muscleGroups.some(m => 
    ex.primary_muscle?.toLowerCase().includes(m.toLowerCase()) ||
    m.toLowerCase().includes(ex.primary_muscle?.toLowerCase() || '')
  )) {
    score += 20;
  }

  // 4. POZIOM DOŚWIADCZENIA
  const diffMap = { 'beginner': 1, 'intermediate': 2, 'advanced': 3 };
  const exDiff = diffMap[ex.difficulty] || 2;
  const userLevel = diffMap[experience] || 2;
  
  if (exDiff === userLevel) score += 15;
  else if (exDiff < userLevel) score += 5;
  else if (exDiff > userLevel + 1) score -= 20;

  // 5. CEL TRENINGOWY - WZMOCNIONE
  if (goal === 'strength') {
    if (ex.rep_range_type === 'strength') score += 25;
    if (ex.mechanics === 'compound') score += 25; // Siła = compound!
    if (ex.mechanics === 'isolation') score -= 10; // Mniej izolacji dla siły
  } else if (goal === 'mass' || goal === 'hypertrophy') {
    if (ex.rep_range_type === 'hypertrophy') score += 20;
    if (ex.mechanics === 'compound') score += 15;
  } else if (goal === 'endurance' || goal === 'reduction') {
    if (ex.rep_range_type === 'endurance') score += 20;
    // Dla endurance/reduction izolacja jest OK
  }

  // 6. SŁABE PUNKTY
  if (weakMuscles.includes(ex.primary_muscle)) score += 25;

  // 7. FOCUS BODY - DRASTYCZNIE ZWIĘKSZONY BONUS!
  if (focusParts && ex.body_part && focusParts.includes(ex.body_part.toUpperCase())) {
    score += 200; // Musi być OGROMNE, żeby przebić "popularne" ćwiczenia z innej partii
  }

  // 8. PREFERENCJA UNILATERAL
  if (preferUnilateral && ex.unilateral) score += 10;

  // 9. POPULARNOŚĆ (sprawdź czy jest w priority list) - DUŻY BONUS!
  const allPriority = Object.values(PRIORITY_EXERCISES).flat();
  const isPriorityExercise = allPriority.some(code => ex.code?.includes(code) || code.includes(ex.code || ''));
  if (isPriorityExercise) {
    score += 35; // Duży bonus dla popularnych ćwiczeń
  }
  
  // 10. DODATKOWY BONUS dla maszyn i ciężarów (promujemy je!)
  if (hasWeightedEquipment) {
    if (exEquipment === 'barbell' && isPriorityExercise) score += 20;
    if (exEquipment === 'dumbbell' && isPriorityExercise) score += 18;
    if (exEquipment === 'machine' && isPriorityExercise) score += 15;
    if (exEquipment === 'cable' && isPriorityExercise) score += 12;
  }

  // 11. NOWE: KLASYCZNE vs EGZOTYCZNE ćwiczenia
  // exCode już zdefiniowany na górze funkcji
  
  // Bonus za klasyczne ćwiczenia (fundament programu)
  const isClassic = CLASSIC_EXERCISES.some(classic => exCode.includes(classic) || classic.includes(exCode));
  if (isClassic) {
    score += 30; // Duży bonus za klasyki
  }
  
  // Kara za egzotyczne ćwiczenia
  const isExotic = EXOTIC_EXERCISE_PATTERNS.some(pattern => exCode.includes(pattern));
  if (isExotic) {
    score -= 40; // Znaczna kara za egzotyczne
  }

  // 12. Losowość dla różnorodności (mniejsza)
  score += Math.random() * 3;

  return score;
}

/**
 * Wybiera ćwiczenia rozgrzewkowe
 */
function selectWarmupExercises(allExercises, muscleGroups, usedCodes) {
  const warmupExercises = allExercises.filter(ex => 
    ex.tier === 'warmup' && 
    !usedCodes.has(ex.code)
  );

  // Wybierz max 2 ćwiczenia rozgrzewkowe
  return warmupExercises.slice(0, 2);
}

/**
 * Konfiguruje objętość (serie, powtórzenia, odpoczynek)
 * NOWE: Skaluje objętość do sessionTime
 * @param {Object} ex - ćwiczenie
 * @param {string} level - poziom użytkownika
 * @param {string} goal - cel treningowy
 * @param {Object} historyMap - historia ćwiczeń
 * @param {string} fatigueTolerance - tolerancja zmęczenia
 * @param {number} sessionTime - docelowy czas sesji w minutach
 * @param {number} totalExercises - całkowita liczba ćwiczeń w dniu
 * @param {number} exerciseIndex - indeks ćwiczenia (0 = pierwsze)
 */
function configureVolume(ex, level, goal, historyMap, fatigueTolerance, sessionTime = 60, totalExercises = 6, exerciseIndex = 0) {
  let sets = 3;
  let reps = "8-12";
  let rest = "60-90s";

  const isCompound = ex.mechanics === 'compound';
  const fatigueScore = ex.fatigue_score || 3;
  
  // Oblicz ile czasu mamy na każde ćwiczenie (średnio)
  const avgTimePerExercise = sessionTime / totalExercises;
  
  // Oblicz bazowy czas na serię (w sekundach) w zależności od celu
  let baseTimePerSet;
  let baseRestSeconds;
  
  if (goal === 'strength') {
    baseTimePerSet = 45; // Wolniejsze tempo
    baseRestSeconds = 180; // 3 min przerwy
  } else if (goal === 'endurance' || goal === 'reduction') {
    baseTimePerSet = 30; // Szybsze tempo
    baseRestSeconds = 45; // 45s przerwy
  } else {
    baseTimePerSet = 35; // Standardowe tempo
    baseRestSeconds = 90; // 90s przerwy
  }
  
  // Oblicz ile serii możemy zrobić w dostępnym czasie na ćwiczenie
  // Czas na n serii = n * timePerSet + (n-1) * rest + 60s setup
  // Rozwiązujemy: n * (timePerSet + rest) - rest + 60 = avgTimePerExercise * 60
  const availableSeconds = avgTimePerExercise * 60 - 60; // 60s buffer na setup
  const timePerSetWithRest = baseTimePerSet + baseRestSeconds;
  const calculatedSets = Math.max(2, Math.round((availableSeconds + baseRestSeconds) / timePerSetWithRest));
  
  // Bazowe wartości wg celu - używamy calculatedSets jako bazy
  if (goal === 'strength') {
    // Siła: 4-6 serii dla compound, 3-4 dla izolacji
    sets = isCompound ? Math.min(6, Math.max(4, calculatedSets)) : Math.min(4, Math.max(3, calculatedSets));
    reps = isCompound ? "3-5" : "6-8";
    rest = "3-5min";
    
  } else if (goal === 'mass' || goal === 'hypertrophy') {
    // Masa: 4-5 serii dla compound, 3-4 dla izolacji
    sets = isCompound ? Math.min(5, Math.max(4, calculatedSets)) : Math.min(4, Math.max(3, calculatedSets));
    reps = isCompound ? "6-10" : "10-12";
    rest = "90-120s";
    
  } else if (goal === 'endurance' || goal === 'reduction') {
    // Wytrzymałość: DUŻO SERII (4-5), wysokie powtórzenia
    // Krótkie przerwy = więcej serii się zmieści
    sets = Math.min(5, Math.max(4, calculatedSets)); // Minimum 4 serie dla endurance!
    reps = isCompound ? "15-20" : "15-25";
    rest = "30-60s";
    
  } else { // recomposition
    sets = isCompound ? Math.min(5, Math.max(3, calculatedSets)) : Math.min(4, Math.max(3, calculatedSets));
    reps = "8-12";
    rest = "60-90s";
  }

  // Modyfikacja wg poziomu
  if (level === 'beginner') {
    sets = Math.max(2, sets - 1);
    rest = increaseRest(rest);
    if (goal === 'strength') reps = "5-8"; // Bezpieczniejsze dla początkujących
  } else if (level === 'advanced') {
    // Zaawansowani: więcej objętości
    if (isCompound && ex.tier === 'optimal') {
      sets = Math.min(6, sets + 1);
    }
    // Zaawansowani mogą mieć krótsze przerwy
    if (goal !== 'strength') {
      rest = decreaseRest(rest);
    }
  }

  // Modyfikacja wg fatigue tolerance
  if (fatigueTolerance === 'low') {
    if (fatigueScore >= 5) sets = Math.max(2, sets - 1);
    rest = increaseRest(rest);
  } else if (fatigueTolerance === 'high') {
    // Wysoka tolerancja = więcej objętości
    if (fatigueScore <= 4) {
      sets = Math.min(6, sets + 1);
    }
    rest = decreaseRest(rest);
  }

  // NOWE: Skalowanie na podstawie pozycji w treningu
  // Pierwsze ćwiczenia (compound) mogą mieć więcej serii
  if (exerciseIndex === 0 && isCompound) {
    sets = Math.min(6, sets + 1);
  }
  // Ostatnie ćwiczenia (accessory) mogą mieć mniej
  if (exerciseIndex >= totalExercises - 2 && !isCompound) {
    sets = Math.max(3, sets);
  }

  // Core - specjalne traktowanie
  if (ex.pattern === 'core') {
    reps = "12-20";
    sets = Math.min(sets, 3);
    rest = "45-60s";
  }

  // Warmup
  if (ex.tier === 'warmup') {
    sets = 2;
    reps = "10-15";
    rest = "30s";
  }

  // Progresja ciężaru
  let suggestedWeight = '';
  if (historyMap?.[ex.code]) {
    const lastMax = parseFloat(historyMap[ex.code]);
    if (!isNaN(lastMax) && lastMax > 0) {
      suggestedWeight = (Math.round(lastMax * 1.025 * 2) / 2).toFixed(1);
    }
  }

  // Szacowany czas - używamy wartości z calculatedSets
  // Czas powinien wypełniać avgTimePerExercise * 60 sekund
  const targetTimeForExercise = avgTimePerExercise * 60; // w sekundach
  
  // Oblicz realny czas na podstawie sets i rest
  const avgTimePerSet = ex.avg_time_per_set || 40; // Zwiększony default (40s na serię)
  const restSeconds = parseRestToSeconds(rest);
  // Czas = (serie * czas_serii) + ((serie-1) * przerwa) + 60s buffer na setup/zmianę
  const calculatedTime = (sets * avgTimePerSet) + ((sets - 1) * restSeconds) + 60;
  
  // Użyj większej z dwóch wartości: obliczonego lub docelowego
  const estimatedTime = Math.max(calculatedTime, targetTimeForExercise * 0.8);

  return {
    code: ex.code,
    name: ex.name?.pl || ex.name?.en || ex.name || ex.code,
    name_en: ex.name?.en,
    name_pl: ex.name?.pl,
    sets,
    reps,
    rest,
    weight: suggestedWeight,
    pattern: ex.pattern,
    body_part: ex.body_part,
    detailed_muscle: ex.detailed_muscle,
    primary_muscle: ex.primary_muscle,
    secondary_muscles: ex.secondary_muscles || [],
    mechanics: ex.mechanics,
    tier: ex.tier,
    fatigue_score: ex.fatigue_score,
    unilateral: ex.unilateral || false,
    estimated_time: estimatedTime,
    instructions_en: ex.instructions?.en,
    instructions_pl: ex.instructions?.pl,
    common_mistakes_en: ex.common_mistakes?.en,
    common_mistakes_pl: ex.common_mistakes?.pl,
    images: ex.images || [],
    video_url: ex.video_url,
    requires_spotter: ex.safety?.requires_spotter || false
  };
}

function parseRestToSeconds(rest) {
  if (!rest) return 60;
  const match = rest.match(/(\d+)/g);
  if (match?.length > 0) {
    const nums = match.map(Number);
    return nums.reduce((a, b) => a + b, 0) / nums.length;
  }
  return 60;
}

function increaseRest(rest) {
  if (!rest) return "90-120s";
  const match = rest.match(/(\d+)/g);
  if (match?.length > 0) {
    const nums = match.map(n => Math.round(Number(n) * 1.25));
    return nums.length === 2 ? `${nums[0]}-${nums[1]}s` : `${nums[0]}s`;
  }
  return rest;
}

function decreaseRest(rest) {
  if (!rest) return "45-60s";
  const match = rest.match(/(\d+)/g);
  if (match?.length > 0) {
    const nums = match.map(n => Math.max(30, Math.round(Number(n) * 0.8)));
    return nums.length === 2 ? `${nums[0]}-${nums[1]}s` : `${nums[0]}s`;
  }
  return rest;
}

function generateProgressionModel(level) {
  if (level === 'beginner') {
    return [
      { week: 1, note: "Tydzień 1: Naucz się techniki. Używaj lekkich ciężarów." },
      { week: 2, note: "Tydzień 2: Zwiększ ciężar o 2.5kg w głównych ćwiczeniach." },
      { week: 3, note: "Tydzień 3: Skup się na pełnym zakresie ruchu." },
      { week: 4, note: "Tydzień 4: Lżejszy tydzień - 75% normalnej objętości." }
    ];
  }
  return [
    { week: 1, note: "Tydzień 1: Adaptacja. RIR 3-4 (zostaw zapas)." },
    { week: 2, note: "Tydzień 2: Zwiększ ciężar o 2.5% lub +1 powtórzenie." },
    { week: 3, note: "Tydzień 3: Maksymalna intensywność (RIR 1-2)." },
    { week: 4, note: "Tydzień 4: Deload - 50% objętości, skup się na technice." }
  ];
}

// ============================================================================
// CRITICAL FIX: SKALOWANIE OBJĘTOŚCI DO CZASU SESJI
// ============================================================================

/**
 * Rekalkulacja czasu pojedynczego ćwiczenia
 * @param {Object} ex - ćwiczenie z sets, rest itp.
 * @returns {number} - czas w sekundach
 */
function recalculateExerciseTime(ex) {
  const avgWork = 50; // średni czas serii (s) - podwyższony bo uwzględnia warmup sets
  const restSeconds = parseRestToSeconds(ex.rest) || 90;
  // Czas = (serie * praca) + (serie * przerwa) + setup
  // Nie (serie-1) bo ostatnia seria też ma przerwa przed następnym ćwiczeniem
  return (ex.sets * avgWork) + (ex.sets * restSeconds) + 90; // +1.5 min na setup
}

/**
 * CRITICAL FIX: Skaluje objętość (serie i przerwy) aby wypełnić czas sesji
 * @param {Object} dayPlan - plan dnia z exercises
 * @param {number} sessionTime - docelowy czas sesji w minutach
 * @param {string} goal - cel treningowy
 * @param {string} experience - poziom doświadczenia
 * @returns {Object} - zaktualizowany plan dnia
 */
function adjustVolumeToDuration(dayPlan, sessionTime, goal, experience) {
  let attempts = 0;
  // Margines błędu: akceptujemy czas w zakresie 85% - 115% celu
  const minDuration = sessionTime * 0.85;
  const maxDuration = sessionTime * 1.15;

  // CRITICAL: Przelicz czasy na start - używaj recalculateExerciseTime dla spójności
  dayPlan.exercises.forEach(ex => {
    ex.estimated_time = recalculateExerciseTime(ex);
  });

  // Funkcja pomocnicza do obliczania czasu całego dnia (w minutach)
  const calculateTotalTime = () => {
    return dayPlan.exercises.reduce((sum, ex) => sum + (ex.estimated_time || 300), 0) / 60;
  };

  let currentDuration = calculateTotalTime();
  
  // Limity serii - bardziej agresywne dla długich sesji
  const maxCompoundSets = experience === 'advanced' ? 8 : (experience === 'intermediate' ? 7 : 5);
  const maxIsolationSets = experience === 'advanced' ? 6 : 5;
  const maxRestSeconds = goal === 'strength' ? 240 : 150; // max przerwy
  
  // JEŚLI CZAS JEST ZA KRÓTKI - ZWIĘKSZAJ OBJĘTOŚĆ
  while (currentDuration < minDuration && attempts < 50) {
    attempts++;
    let addedSomething = false;
    
    // Strategia 1: Zwiększ liczbę serii we WSZYSTKICH ćwiczeniach compound
    for (let ex of dayPlan.exercises) {
      if (ex.mechanics === 'compound' && ex.sets < maxCompoundSets) {
        ex.sets += 1;
        ex.estimated_time = recalculateExerciseTime(ex);
        addedSomething = true;
        break;
      }
    }

    // Strategia 2: Zwiększ serie w izolacjach
    if (!addedSomething) {
      for (let ex of dayPlan.exercises) {
        if (ex.mechanics !== 'compound' && ex.sets < maxIsolationSets) {
          ex.sets += 1;
          ex.estimated_time = recalculateExerciseTime(ex);
          addedSomething = true;
          break;
        }
      }
    }
    
    // Strategia 3: Wydłuż przerwy (szczególnie dla siły)
    if (!addedSomething) {
      for (let ex of dayPlan.exercises) {
        const currentRest = parseRestToSeconds(ex.rest) || 90;
        if (currentRest < maxRestSeconds) {
          ex.rest = increaseRest(ex.rest);
          ex.estimated_time = recalculateExerciseTime(ex);
          addedSomething = true;
          break;
        }
      }
    }
    
    // Strategia 4: Jeśli wszystko max - dodaj jeszcze po 1 serii do wszystkich
    if (!addedSomething && attempts < 30) {
      const absoluteMax = 10;
      for (let ex of dayPlan.exercises) {
        if (ex.sets < absoluteMax) {
          ex.sets += 1;
          ex.estimated_time = recalculateExerciseTime(ex);
          addedSomething = true;
          break;
        }
      }
    }
    
    if (!addedSomething) break;
    currentDuration = calculateTotalTime();
  }
  
  // JEŚLI CZAS JEST ZA DŁUGI - ZMNIEJSZ OBJĘTOŚĆ
  while (currentDuration > maxDuration && attempts < 70) {
    attempts++;
    
    let reducedSomething = false;
    
    // Zmniejsz serie w izolacjach najpierw
    for (let ex of dayPlan.exercises) {
      if (ex.mechanics !== 'compound' && ex.sets > 2) {
        ex.sets -= 1;
        ex.estimated_time = recalculateExerciseTime(ex);
        reducedSomething = true;
        break;
      }
    }
    
    // Potem compound (ale zachowaj min 3 serie)
    if (!reducedSomething) {
      for (let ex of dayPlan.exercises) {
        if (ex.mechanics === 'compound' && ex.sets > 3) {
          ex.sets -= 1;
          ex.estimated_time = recalculateExerciseTime(ex);
          reducedSomething = true;
          break;
        }
      }
    }
    
    if (!reducedSomething) break;
    
    currentDuration = calculateTotalTime();
  }
  
  dayPlan.estimatedDuration = Math.round(currentDuration);
  return dayPlan;
}

// ============================================================================
// EKSPORT
// ============================================================================
module.exports = {
  QUESTIONS,
  SPLIT_TEMPLATES,
  validateAnswers,
  generateAdvancedPlan,
  helpers: {
    validateAnswers,
    pickSplit,
    configureVolume,
    selectTrainingDays,
    normalizeEquipment,
    normalizePattern,
    generateAdvancedPlan
  }
};
