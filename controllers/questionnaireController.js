const { pool } = require("../lib/db");
const algorithm = require("../lib/algorithm"); // Importujemy nasz nowy moduł
const { generatePlan } = require("../lib/aiPlanner"); // AI Planner z fallback
const fs = require('fs');
const path = require('path');

// Ścieżki do plików JSON z ćwiczeniami (fallback gdy baza niedostępna)
const EXERCISES_JSON_PATHS = [
    path.join(__dirname, '../data/exercises_final.json'),
    path.join(__dirname, '../data/exercises.json')
];

// Helper do pobrania wszystkich ćwiczeń (potrzebne dla algorytmu)
async function getAllExercises(poolPromise) {
    // Próbuj najpierw z bazy danych
    try {
        const sql = `
          SELECT 
            code, name_en, name_pl, primary_muscle, secondary_muscles, pattern, 
            equipment, location, difficulty, unilateral, is_machine, 
            minutes_est, instructions_en, instructions_pl, video_url,
            mechanics, safety_data, body_part, detailed_muscle, tier,
            fatigue_score, rep_range_type, avg_time_per_set
          FROM exercises
        `;
        const [rows] = await poolPromise.query(sql);
        
        if (rows.length > 0) {
            console.log(`Załadowano ${rows.length} ćwiczeń z bazy danych`);
            // Parsowanie danych z bazy (stringi 'a,b,c' na tablice ['a','b','c'])
            return rows.map(ex => {
                // Parsuj safety_data JSON aby wyciągnąć excluded_injuries
                let excludedInjuries = [];
                if (ex.safety_data) {
                    try {
                        const safety = JSON.parse(ex.safety_data);
                        excludedInjuries = safety.excluded_injuries || [];
                    } catch (e) { /* ignore parse errors */ }
                }
                return {
                    ...ex,
                    name: ex.name_en || ex.name_pl, // Kompatybilność wsteczna
                    description: ex.instructions_en || ex.instructions_pl,
                    equipment: ex.equipment ? ex.equipment.split(',') : [],
                    location: ex.location ? ex.location.split(',') : [],
                    excluded_injuries: excludedInjuries,
                    difficulty: parseInt(ex.difficulty) || 2,
                    body_part: ex.body_part || 'LEGS', // Fallback dla starych rekordów
                    tier: ex.tier || 'standard',
                    fatigue_score: ex.fatigue_score || 3,
                    avg_time_per_set: ex.avg_time_per_set || 40
                };
            });
        }
    } catch (dbError) {
        console.warn('Baza danych niedostępna, próbuję załadować z JSON:', dbError.code);
    }
    
    // Fallback: ładuj z pliku JSON
    return loadExercisesFromJson();
}

// Ładuje ćwiczenia z pliku JSON
function loadExercisesFromJson() {
    for (const jsonPath of EXERCISES_JSON_PATHS) {
        try {
            if (fs.existsSync(jsonPath)) {
                const data = fs.readFileSync(jsonPath, 'utf8');
                const exercises = JSON.parse(data);
                console.log(`Załadowano ${exercises.length} ćwiczeń z JSON: ${path.basename(jsonPath)}`);
                
                // Normalizuj dane z JSON do formatu oczekiwanego przez algorytm
                return exercises.map(ex => {
                    // Obsługa wielojęzycznych nazw
                    const nameEn = typeof ex.name === 'object' ? ex.name.en : (ex.name_en || ex.name);
                    const namePl = typeof ex.name === 'object' ? ex.name.pl : (ex.name_pl || ex.name);
                    
                    // Obsługa wielojęzycznych instrukcji
                    const instructionsEn = typeof ex.instructions === 'object' ? ex.instructions.en : ex.instructions_en;
                    const instructionsPl = typeof ex.instructions === 'object' ? ex.instructions.pl : ex.instructions_pl;
                    
                    // Mapowanie pattern z nowego formatu
                    const patternMapping = {
                        'pull_vertical': 'pull_v',
                        'pull_horizontal': 'pull_h',
                        'push_vertical': 'push_v',
                        'push_horizontal': 'push_h',
                        'knee_dominant': 'squat',
                        'hip_dominant': 'hinge'
                    };
                    const normalizedPattern = patternMapping[ex.pattern] || ex.pattern || 'accessory';
                    
                    // Mapowanie difficulty na wartości liczbowe
                    const difficultyMapping = {
                        'beginner': 1,
                        'intermediate': 2,
                        'advanced': 3
                    };
                    const difficultyValue = typeof ex.difficulty === 'string' 
                        ? difficultyMapping[ex.difficulty] || 2 
                        : (parseInt(ex.difficulty) || 2);
                    
                    return {
                        ...ex,
                        code: ex.code,
                        name: nameEn || namePl,
                        name_en: nameEn,
                        name_pl: namePl,
                        body_part: ex.body_part,
                        detailed_muscle: ex.detailed_muscle,
                        primary_muscle: ex.primary_muscle,
                        secondary_muscles: ex.secondary_muscles || [],
                        tier: ex.tier || 'standard', // optimal, standard, warmup
                        fatigue_score: ex.fatigue_score || 3,
                        rep_range_type: ex.rep_range_type || 'hypertrophy', // strength, hypertrophy, endurance
                        unilateral: ex.unilateral || false,
                        avg_time_per_set: ex.avg_time_per_set || 30,
                        mechanics: ex.mechanics || 'compound',
                        pattern: normalizedPattern,
                        original_pattern: ex.pattern, // zachowaj oryginalny pattern
                        difficulty: difficultyValue,
                        difficulty_label: ex.difficulty, // zachowaj etykietę
                        description: Array.isArray(instructionsEn) ? instructionsEn.join(' ') : instructionsEn,
                        instructions_en: instructionsEn,
                        instructions_pl: instructionsPl,
                        common_mistakes_en: typeof ex.common_mistakes === 'object' ? ex.common_mistakes.en : ex.common_mistakes_en,
                        common_mistakes_pl: typeof ex.common_mistakes === 'object' ? ex.common_mistakes.pl : ex.common_mistakes_pl,
                        // Normalizacja equipment - może być string lub tablica
                        equipment: normalizeToArray(ex.equipment),
                        // Lokalizacja na podstawie sprzętu
                        location: determineLocationFromEquipment(ex.equipment),
                        excluded_injuries: ex.excluded_injuries || ex.safety?.excluded_injuries || [],
                        requires_spotter: ex.safety?.requires_spotter || false,
                        images: ex.images || []
                    };
                });
            }
        } catch (err) {
            console.warn(`Nie udało się załadować ${jsonPath}:`, err.message);
        }
    }
    console.error('Nie znaleziono żadnego pliku z ćwiczeniami!');
    return [];
}

// Określa lokalizację na podstawie wymaganego sprzętu
function determineLocationFromEquipment(equipment) {
    if (!equipment) return ['gym', 'home'];
    const eq = typeof equipment === 'string' ? equipment.toLowerCase() : '';
    const eqArray = Array.isArray(equipment) ? equipment.map(e => e.toLowerCase()) : [eq];
    
    // Sprzęt typowo domowy
    const homeEquipment = ['body weight', 'bodyweight', 'none', 'band', 'bands', 'dumbbell', 'dumbbells', 'kettlebell'];
    // Sprzęt typowo siłowniowy
    const gymOnlyEquipment = ['cable', 'machine', 'smith machine', 'lat pulldown', 'leg press', 'hack squat'];
    
    const isHomeCompatible = eqArray.some(e => homeEquipment.includes(e));
    const isGymOnly = eqArray.some(e => gymOnlyEquipment.includes(e));
    
    if (isGymOnly) return ['gym'];
    if (isHomeCompatible) return ['gym', 'home', 'outdoor'];
    return ['gym', 'home'];
}

// Normalizuje wartość do tablicy
function normalizeToArray(value, defaultValue = []) {
    if (!value) return defaultValue;
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
        // Obsłuż różne formaty: "gym,home" lub "body weight" itp.
        return value.split(',').map(s => s.trim().toLowerCase());
    }
    return defaultValue;
}

// Helper do historii ciężarów
async function getUserMaxWeights(poolPromise, userId) {
    try {
        const [rows] = await poolPromise.query(`
            SELECT exercise_code, MAX(weight) as max_weight
            FROM workout_log_sets WHERE user_id = ? GROUP BY exercise_code
        `, [userId]);
        const map = {};
        rows.forEach(r => map[r.exercise_code] = r.max_weight);
        return map;
    } catch (e) {
        console.error("History fetch error:", e);
        return {};
    }
}

// --- HANDLERY ---

exports.getQuestions = async (req, res) => {
    res.json(algorithm.QUESTIONS);
};

exports.submitAnswers = async (req, res) => {
    try {
        const answers = req.body || {};
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ error: "Unauthorized" });

        // Walidacja
        const errors = algorithm.validateAnswers(answers);
        if (errors.length) return res.status(400).json({ error: "Validation failed", details: errors });

        const poolPromise = pool.promise();

        // 1. Zapis Ankiety
        const [qResult] = await poolPromise.query(
            "INSERT INTO questionnaires (user_id, answers_json, created_at) VALUES (?, ?, NOW())",
            [userId, JSON.stringify(answers)]
        );

        // 2. Przygotowanie danych dla algorytmu
        const allExercises = await getAllExercises(poolPromise);
        const historyMap = await getUserMaxWeights(poolPromise, userId);
        
        // Normalizacja sprzętu (dodajemy bodyweight zawsze)
        let userEquipment = answers.equipment || [];
        if (!userEquipment.includes('bodyweight')) userEquipment.push('bodyweight');

        // Przetworzenie kontuzji - usuń "none" jeśli jest z innymi wartościami
        let injuries = answers.injuries || [];
        if (injuries.includes('none') && injuries.length > 1) {
            injuries = injuries.filter(i => i !== 'none');
        }
        if (injuries.includes('none')) {
            injuries = [];
        }

        // Przetworzenie słabych punktów
        let weakPoints = answers.weak_points || [];
        if (weakPoints.includes('none')) {
            weakPoints = [];
        }

        const userProfile = {
            experience: answers.experience || 'beginner',
            daysPerWeek: parseInt(answers.days_per_week) || 3,
            injuries: injuries,
            equipment: userEquipment,
            goal: answers.goal || 'recomposition',
            location: answers.location || 'gym',
            preferredDays: answers.preferred_days || [],
            sessionTime: parseInt(answers.session_time) || 60,
            // Nowe pola z rozszerzonego kwestionariusza
            focusBody: answers.focus_body || 'balanced',
            weakPoints: weakPoints,
            trainingStyle: answers.training_style || 'traditional',
            cardioPreference: answers.cardio_preference || 'none',
            preferUnilateral: answers.prefer_unilateral === 'yes',
            fatigueTolerance: answers.fatigue_tolerance || 'medium',
            includeWarmup: answers.include_warmup === 'yes',
            ageRange: answers.age_range,
            gender: answers.gender,
            mobilityIssues: answers.mobility_issues || []
        };

        // 3. Generowanie Planu (AI Planner z fallback na lokalny algorytm)
        const aiResult = await generatePlan(userProfile, allExercises);
        
        if (!aiResult || !aiResult.plan) {
            return res.status(500).json({ error: "Nie udało się wygenerować planu. Sprawdź kryteria." });
        }

        // Przygotuj plan z informacją o fallback
        const plan = {
            ...aiResult.plan,
            usedFallback: aiResult.usedFallback,
            fallbackReason: aiResult.fallbackReason,
            metadata: aiResult.metadata
        };

        // 4. Zapis Planu
        const [pResult] = await poolPromise.query(
            "INSERT INTO plans (user_id, source_questionnaire_id, plan_json, created_at) VALUES (?, ?, ?, NOW())",
            [userId, qResult.insertId, JSON.stringify(plan)]
        );

        res.json({
            ok: true,
            planId: pResult.insertId,
            plan: plan,
            usedFallback: aiResult.usedFallback,
            fallbackReason: aiResult.fallbackReason
        });

    } catch (error) {
        console.error("Błąd w submitAnswers:", error);
        res.status(500).json({ error: "Błąd serwera." });
    }
};

exports.getLatestPlan = async (req, res) => {
    try {
        const userId = req.user?.id;
        const [rows] = await pool.promise().query(
            "SELECT plan_json FROM plans WHERE user_id=? ORDER BY id DESC LIMIT 1", [userId]
        );
        if (!rows.length) return res.json({});
        const plan = typeof rows[0].plan_json === 'string' ? JSON.parse(rows[0].plan_json) : rows[0].plan_json;
        res.json(plan);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Błąd pobierania planu" });
    }
};

// Zapisz tylko odpowiedzi (bez generowania planu - bezpłatne)
exports.saveAnswers = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ error: "Unauthorized" });
        
        const answers = req.body || {};
        
        // Walidacja podstawowa
        const errors = algorithm.validateAnswers(answers);
        if (errors.length) return res.status(400).json({ error: "Validation failed", details: errors });
        
        await pool.promise().query(
            "INSERT INTO questionnaires (user_id, answers_json, created_at) VALUES (?, ?, NOW())",
            [userId, JSON.stringify(answers)]
        );
        res.json({ ok: true, message: "Odpowiedzi zapisane pomyślnie" });
    } catch (e) {
        console.error("Błąd w saveAnswers:", e);
        res.status(500).json({ error: "Błąd zapisu" });
    }
};

exports.getLatestAnswers = async (req, res) => {
    try {
        const userId = req.user?.id;
        const [rows] = await pool.promise().query(
            "SELECT answers_json FROM questionnaires WHERE user_id=? ORDER BY id DESC LIMIT 1", [userId]
        );
        if (!rows.length) return res.json({});
        res.json(typeof rows[0].answers_json === 'string' ? JSON.parse(rows[0].answers_json) : rows[0].answers_json);
    } catch (e) {
        res.status(500).json({ error: "Błąd pobierania odpowiedzi" });
    }
};

// --- AKTUALIZACJA AKTUALNEGO PLANU ---
exports.updateLatestPlan = async (req, res) => {
    try {
        const userId = req.user?.id;
        let plan = req.body;
        
        if (!userId) return res.status(401).json({ error: "Unauthorized" });

        // Usuwamy duplikaty dni (bezpiecznik przed Twoim błędem w JSON)
        if (plan && plan.week) {
            const uniqueDays = {};
            plan.week.forEach(d => { uniqueDays[d.day] = d; });
            plan.week = Object.values(uniqueDays);
        }

        const poolPromise = pool.promise();

        // KLUCZOWE: Robimy INSERT zamiast UPDATE
        const [result] = await poolPromise.query(
            "INSERT INTO plans (user_id, plan_json, created_at) VALUES (?, ?, NOW())",
            [userId, JSON.stringify(plan)]
        );

        res.json({ ok: true, planId: result.insertId, plan });
    } catch (error) {
        console.error("Błąd zapisu:", error);
        res.status(500).json({ error: "Błąd serwera." });
    }
};

// --- WŁASNY PLAN ---
exports.saveCustomPlan = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ error: "Unauthorized" });
        
        const plan = req.body;
        if (!plan || !plan.week || !Array.isArray(plan.week)) {
            return res.status(400).json({ error: "Nieprawidłowy format planu" });
        }

        const poolPromise = pool.promise();

        // Zapisz plan z flagą custom=true
        const [pResult] = await poolPromise.query(
            "INSERT INTO plans (user_id, source_questionnaire_id, plan_json, created_at) VALUES (?, NULL, ?, NOW())",
            [userId, JSON.stringify({ ...plan, custom: true })]
        );

        res.json({
            ok: true,
            planId: pResult.insertId,
            plan: plan
        });

    } catch (error) {
        console.error("Błąd w saveCustomPlan:", error);
        res.status(500).json({ error: "Błąd serwera." });
    }
};
