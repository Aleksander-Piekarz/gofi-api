const algorithm = require("../lib/algorithm");

const { validateAnswers, pickSplit, configureVolume, generateAdvancedPlan } = algorithm.helpers;

describe("Algorytm Personalizacji (Logic Only)", () => {
  test("Powinien odrzucić niekompletną ankietę", () => {
    const badAnswers = { goal: "mass" };
    const errors = validateAnswers(badAnswers);

    expect(errors.length).toBeGreaterThan(0);
    // Nowy algorytm zwraca komunikaty po polsku
    expect(errors).toContain("Brak dni treningowych");
  });

  test("Powinien dobrać split FBW dla 2 dni treningowych", () => {
    const split = pickSplit("mass", 2);
    expect(split.name).toContain("Full Body Workout");
    expect(split.schedule.length).toBe(2);
  });

  test('Powinien dobrać split PPL dla 3 dni i celu "mass"', () => {
    const split = pickSplit("mass", 3);
    expect(split.name).toContain("Push/Pull/Legs");
  });

  test('Powinien dobrać split FBW dla 3 dni i celu "reduction" (logika biznesowa)', () => {
    const split = pickSplit("reduction", 3);
    expect(split.name).toContain("Full Body Workout");
  });

  test("Powinien sugerować zakres powtórzeń 6-10 dla masy w ćwiczeniach złożonych (zgodnie z NSCA)", () => {
    const mockCompound = {
      code: "squat",
      mechanics: "compound",
      difficulty: 3,
      rep_range_type: "hypertrophy", // nowe pole
      tier: "optimal"
    };

    const result = configureVolume(mockCompound, "intermediate", "mass");

    // Zaktualizowane wartości: compound dla masy = 6-10 reps, 4 serie
    expect(result.reps).toBe("6-10");
    expect(result.sets).toBe(4);
  });

  test("Powinien sugerować zakres 15-20 dla początkującego na redukcji (isolation)", () => {
    const mockExercise = {
      code: "dummy_push",
      mechanics: "isolation",
      difficulty: 1,
      rep_range_type: "hypertrophy"
    };

    const result = configureVolume(mockExercise, "beginner", "reduction");

    // Redukcja z isolation = 15-20 reps (wyższa metaboliczność)
    expect(result.reps).toBe("15-20");
  });

  // Nowe testy dla rozszerzonych funkcjonalności
  test("Powinien uwzględniać fatigue_score przy konfiguracji objętości", () => {
    const highFatigueExercise = {
      code: "deadlift",
      mechanics: "compound",
      fatigue_score: 7,
      rep_range_type: "strength"
    };

    const result = configureVolume(highFatigueExercise, "intermediate", "strength", {}, "low");
    
    // Przy wysokim fatigue i niskiej tolerancji powinno być mniej serii
    expect(result.sets).toBeLessThanOrEqual(4);
  });

  test("Powinien prawidłowo konfigurować ćwiczenia warmup", () => {
    const warmupExercise = {
      code: "ankle_circles",
      tier: "warmup",
      mechanics: "compound",
      rep_range_type: "endurance"
    };

    const result = configureVolume(warmupExercise, "beginner", "mass");
    
    expect(result.sets).toBe(2);
    expect(result.reps).toBe("10-15");
    expect(result.rest).toBe("30s");
  });

  test("Powinien wykorzystywać nowe pola z exercises.json", () => {
    const fullExercise = {
      code: "bench_press",
      mechanics: "compound",
      difficulty: 2,
      tier: "optimal",
      fatigue_score: 5,
      rep_range_type: "hypertrophy",
      body_part: "CHEST",
      primary_muscle: "chest",
      secondary_muscles: ["triceps", "shoulders"],
      unilateral: false,
      avg_time_per_set: 35
    };

    const result = configureVolume(fullExercise, "intermediate", "hypertrophy");
    
    expect(result.body_part).toBe("CHEST");
    expect(result.primary_muscle).toBe("chest");
    expect(result.fatigue_score).toBe(5);
    expect(result.tier).toBe("optimal");
    expect(result.estimated_time).toBeDefined();
  });
});

describe("Upper/Lower Body Part Separation", () => {
  // Przygotuj przykładowe ćwiczenia
  const mockExercises = [
    // UPPER body
    { code: "bench_press", body_part: "CHEST", detailed_muscle: "Pectorals", pattern: "push_horizontal", tier: "optimal", mechanics: "compound" },
    { code: "barbell_row", body_part: "BACK", detailed_muscle: "Lats", pattern: "pull_horizontal", tier: "optimal", mechanics: "compound" },
    { code: "overhead_press", body_part: "SHOULDERS", detailed_muscle: "Deltoids", pattern: "push_vertical", tier: "optimal", mechanics: "compound" },
    { code: "pull_up", body_part: "BACK", detailed_muscle: "Lats", pattern: "pull_vertical", tier: "optimal", mechanics: "compound" },
    { code: "bicep_curl", body_part: "ARMS", detailed_muscle: "Biceps", pattern: "accessory", tier: "standard", mechanics: "isolation" },
    { code: "tricep_pushdown", body_part: "ARMS", detailed_muscle: "Triceps", pattern: "accessory", tier: "standard", mechanics: "isolation" },
    { code: "lateral_raise", body_part: "SHOULDERS", detailed_muscle: "Deltoids", pattern: "accessory", tier: "standard", mechanics: "isolation" },
    { code: "face_pull", body_part: "BACK", detailed_muscle: "Rear Deltoids", pattern: "accessory", tier: "standard", mechanics: "isolation" },
    
    // LOWER body
    { code: "barbell_squat", body_part: "LEGS", detailed_muscle: "Quads", pattern: "knee_dominant", tier: "optimal", mechanics: "compound" },
    { code: "romanian_deadlift", body_part: "LEGS", detailed_muscle: "Hamstrings", pattern: "hip_dominant", tier: "optimal", mechanics: "compound" },
    { code: "leg_press", body_part: "LEGS", detailed_muscle: "Quads", pattern: "knee_dominant", tier: "standard", mechanics: "compound" },
    { code: "hip_thrust", body_part: "GLUTES", detailed_muscle: "Glutes", pattern: "hip_dominant", tier: "optimal", mechanics: "compound" },
    { code: "walking_lunge", body_part: "LEGS", detailed_muscle: "Quads", pattern: "lunge", tier: "optimal", mechanics: "compound" },
    { code: "calf_raise", body_part: "LEGS", detailed_muscle: "Calves", pattern: "accessory", tier: "standard", mechanics: "isolation" },
    { code: "leg_curl", body_part: "LEGS", detailed_muscle: "Hamstrings", pattern: "accessory", tier: "standard", mechanics: "isolation" },
    
    // CORE
    { code: "plank", body_part: "CORE", detailed_muscle: "Abs", pattern: "core", tier: "optimal", mechanics: "compound" },
    { code: "dead_bug", body_part: "CORE", detailed_muscle: "Abs", pattern: "core", tier: "standard", mechanics: "compound" },
  ];

  test("Upper day powinien zawierać TYLKO ćwiczenia na górę ciała", () => {
    const userProfile = {
      experience: "intermediate",
      daysPerWeek: 4,
      equipment: ["barbell", "dumbbell", "cable", "bodyweight"],
      goal: "mass",
    };

    const plan = generateAdvancedPlan(userProfile, mockExercises);
    
    // Znajdź Upper day
    const upperDay = plan.week.find(d => d.block.toLowerCase().includes("upper"));
    
    if (upperDay) {
      const lowerBodyExercises = upperDay.exercises.filter(ex => 
        ["LEGS", "GLUTES"].includes(ex.body_part?.toUpperCase())
      );
      
      // Nie powinno być ćwiczeń na nogi w dniu Upper
      expect(lowerBodyExercises.length).toBe(0);
      console.log(`Upper day exercises: ${upperDay.exercises.map(e => e.code).join(", ")}`);
    }
  });

  test("Lower day powinien zawierać TYLKO ćwiczenia na dół ciała", () => {
    const userProfile = {
      experience: "intermediate",
      daysPerWeek: 4,
      equipment: ["barbell", "dumbbell", "cable", "bodyweight"],
      goal: "mass",
    };

    const plan = generateAdvancedPlan(userProfile, mockExercises);
    
    // Znajdź Lower day
    const lowerDay = plan.week.find(d => d.block.toLowerCase().includes("lower"));
    
    if (lowerDay) {
      const upperBodyExercises = lowerDay.exercises.filter(ex => 
        ["CHEST", "BACK", "SHOULDERS", "ARMS"].includes(ex.body_part?.toUpperCase())
      );
      
      // Nie powinno być ćwiczeń na górę w dniu Lower
      expect(upperBodyExercises.length).toBe(0);
      console.log(`Lower day exercises: ${lowerDay.exercises.map(e => e.code).join(", ")}`);
    }
  });

  test("Nie powinien wybierać wielu wariantów tego samego ćwiczenia (np. 3 wiosłowania)", () => {
    // Dodaj wiele wariantów wiosłowania
    const exercisesWithRows = [
      ...mockExercises,
      { code: "bent_over_row", body_part: "BACK", detailed_muscle: "Lats", pattern: "pull_horizontal", tier: "optimal", mechanics: "compound" },
      { code: "t_bar_row", body_part: "BACK", detailed_muscle: "Lats", pattern: "pull_horizontal", tier: "optimal", mechanics: "compound" },
      { code: "cable_row", body_part: "BACK", detailed_muscle: "Lats", pattern: "pull_horizontal", tier: "optimal", mechanics: "compound" },
      { code: "dumbbell_row", body_part: "BACK", detailed_muscle: "Lats", pattern: "pull_horizontal", tier: "optimal", mechanics: "compound" },
    ];

    const userProfile = {
      experience: "intermediate",
      daysPerWeek: 4,
      equipment: ["barbell", "dumbbell", "cable", "bodyweight"],
      goal: "mass",
    };

    const plan = generateAdvancedPlan(userProfile, exercisesWithRows);
    
    // Sprawdź każdy dzień
    for (const day of plan.week) {
      const rowExercises = day.exercises.filter(ex => 
        ex.code?.includes("row")
      );
      
      // Max 2 wiosłowania w jednym dniu
      expect(rowExercises.length).toBeLessThanOrEqual(2);
    }
  });

  test("Nie powinien wybierać wielu martwych ciągów w jednym dniu", () => {
    const exercisesWithDeadlifts = [
      ...mockExercises,
      { code: "stiff_leg_deadlift", body_part: "LEGS", detailed_muscle: "Hamstrings", pattern: "hip_dominant", tier: "optimal", mechanics: "compound" },
      { code: "sumo_deadlift", body_part: "LEGS", detailed_muscle: "Hamstrings", pattern: "hip_dominant", tier: "optimal", mechanics: "compound" },
      { code: "good_morning", body_part: "LEGS", detailed_muscle: "Hamstrings", pattern: "hip_dominant", tier: "standard", mechanics: "compound" },
    ];

    const userProfile = {
      experience: "intermediate",
      daysPerWeek: 4,
      equipment: ["barbell", "dumbbell", "cable", "bodyweight"],
      goal: "mass",
    };

    const plan = generateAdvancedPlan(userProfile, exercisesWithDeadlifts);
    
    // Lista martwych ciągów (dokładne kody)
    const deadliftCodes = ["romanian_deadlift", "stiff_leg_deadlift", "sumo_deadlift", "barbell_deadlift", "good_morning"];
    
    // Sprawdź każdy dzień
    for (const day of plan.week) {
      const deadliftExercises = day.exercises.filter(ex => 
        deadliftCodes.some(dl => ex.code === dl)
      );
      
      // Max 1 martwy ciąg w jednym dniu
      if (deadliftExercises.length > 1) {
        console.log(`Day ${day.block} has ${deadliftExercises.length} deadlifts: ${deadliftExercises.map(e => e.code).join(', ')}`);
      }
      expect(deadliftExercises.length).toBeLessThanOrEqual(1);
    }
  });
});
