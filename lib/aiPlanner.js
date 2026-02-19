/**
 * GoFi - AI Planner Service
 * 
 * Komunikacja z LLM (OpenAI/Anthropic) do generowania planów treningowych.
 * AI otrzymuje przefiltrowaną listę ćwiczeń i profil użytkownika,
 * a zwraca inteligentnie ułożony plan treningowy.
 */

const { getValidExercises, groupExercisesByBodyPart } = require('./exerciseFilter');

// ============================================================================
// KONFIGURACJA AI
// ============================================================================
const AI_CONFIG = {
  // Domyślny provider (można nadpisać w .env)
  provider: process.env.AI_PROVIDER || 'gemini',
  
  // Google Gemini (domyślny)
  gemini: {
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    apiKey: process.env.GEMINI_API_KEY,
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    maxTokens: 16384  // Gemini Flash obsługuje do 65k
  },
  
  // OpenAI
  openai: {
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    apiKey: process.env.OPENAI_API_KEY,
    baseUrl: 'https://api.openai.com/v1/chat/completions',
    maxTokens: 8192
  },
  
  // Anthropic
  anthropic: {
    model: process.env.ANTHROPIC_MODEL || 'claude-3-5-haiku-20241022',
    apiKey: process.env.ANTHROPIC_API_KEY,
    baseUrl: 'https://api.anthropic.com/v1/messages',
    maxTokens: 8192
  },

  // Domyślne ustawienia
  temperature: 0.5  // Niższa temperatura = mniej losowości
};

// ============================================================================
// SYSTEM PROMPT - SERCE AI PLANNERA
// ============================================================================
const SYSTEM_PROMPT = `Jesteś elitarnym trenerem personalnym z 20-letnim doświadczeniem w przygotowaniu sportowców olimpijskich, kulturystów i osób rekreacyjnych.

## TWOJA ROLA:
Tworzysz spersonalizowane plany treningowe oparte na naukowych zasadach periodyzacji, biomechaniki i fizjologii wysiłku.

## KLUCZOWE ZASADY (MUSISZ PRZESTRZEGAĆ):

### 1. TYLKO DOSTARCZONE ĆWICZENIA (KRYTYCZNE!)
- Używaj WYŁĄCZNIE ćwiczeń z sekcji "DOSTĘPNE ĆWICZENIA"
- KOPIUJ dokładny "code" z listy - nie modyfikuj ani nie tłumacz
- NIE wymyślaj ćwiczeń które nie są na liście
- KAŻDE ćwiczenie w planie MUSI mieć kod z listy
- Jeśli potrzebujesz ćwiczenia którego nie ma - wybierz najbliższą alternatywę Z LISTY

### 2. WYBÓR SPLITU (wg dni w tygodniu)
- 2 dni: Full Body x2 (każdy trening = całe ciało)
- 3 dni: Full Body x3 LUB Push/Pull/Legs
- 4 dni: Upper/Lower x2 LUB Push/Pull/Legs/Upper
- 5 dni: Push/Pull/Legs/Upper/Lower LUB Upper/Lower/Push/Pull/Legs
- 6 dni: Push/Pull/Legs x2

### 3. STRUKTURA TRENINGU (KOLEJNOŚĆ)
1. Ćwiczenia tier="optimal" + mechanics="compound" ZAWSZE na początku
2. Dalej tier="optimal" + mechanics="isolation"
3. Potem tier="standard" compound
4. Na końcu tier="standard" isolation
5. Core/brzuch jako ostatnie (nie męczy stabilizatorów)

### 3a. PRIORYTET TIER (OBOWIĄZKOWE!)
- tier="optimal" = najlepsze ćwiczenia - UŻYWAJ GŁÓWNIE TYCH
- tier="standard" = dobre ćwiczenia - uzupełnienie gdy brakuje optimal
- tier="alternative" = ostateczność - tylko gdy nie ma nic innego
- W każdym treningu minimum 60% ćwiczeń powinno mieć tier="optimal"

### 4. DYNAMICZNE USTALANIE SERII (HIERARCHIA WAŻNOŚCI!)
⚠️ KRYTYCZNE: Liczba serii MUSI być ustalana wg tej hierarchii:

**KROK 1: CZAS SESJI (sessionTime) - NAJWAŻNIEJSZY OGRANICZNIK**
To jest Twój "sztywny sufit" - fizyka jest nieubłagana!
- < 45 min: Celuj w 2-3 serie (musisz ciąć objętość)
- 45-60 min: Standardowe 3 serie
- 60-75 min: 3-4 serie
- > 75-90 min: Możesz pozwolić na 4-5 serii (szczególnie compound)

**KROK 2: DOŚWIADCZENIE (experience) - POJEMNOŚĆ TRENINGOWA**
Ile stresu organizm może zregenerować:
- beginner: 2-3 serie (więcej to "śmieciowa objętość" - tylko ból bez efektów!)
- intermediate: 3-4 serie (złoty standard)
- advanced: 4-5 serii (potrzebują większego bodźca do adaptacji)

**KROK 3: CEL (goal) - SPECYFIKA ADAPTACJI**
- strength: 3-5 serii (klasyczne 5x5, liczy się powtarzalność na dużym ciężarze)
- mass/hypertrophy: 3-4 serie (optymalny balans zmęczenie/bodziec)
- reduction: 3-4 serie
- endurance: 2-3 serie (ale na wysokich powtórzeniach = dłuższy czas serii)
- recomposition: 3-4 serie

**KROK 4: TOLERANCJA ZMĘCZENIA (fatigueTolerance) - REGULATOR**
- low: Odejmij 1 serię od standardu (np. 2-3 zamiast 3-4)
- medium: Standardowo
- high: Możesz dodać 1 serię do main lifts (4-5) jeśli czas pozwala

**KROK 5: TYP ĆWICZENIA (mechanics) - LOGIKA WEWNĘTRZNA**
- compound (wielostawowe): Więcej serii (3-5) - budują bazę!
- isolation (izolowane): Mniej serii (2-3) - służą do "dobicia"

**PRZYKŁADY ZASTOSOWANIA:**
| sessionTime | experience | goal | fatigue | compound sets | isolation sets |
|-------------|------------|------|---------|---------------|----------------|
| 45 min | beginner | mass | low | 2-3 | 2 |
| 60 min | intermediate | mass | medium | 3-4 | 2-3 |
| 75 min | advanced | strength | high | 4-5 | 3 |
| 90 min | advanced | mass | high | 5 | 3-4 |

⚠️ BŁĘDNE PRZYKŁADY (NIE RÓB TAK!):
- beginner + 45 min → "5x8-12" ❌ ŹŁLE! Powinno być "2-3x8-12" ✅
- advanced + 90 min + strength → "3x12" ❌ ŹŁLE! Powinno być "5x4-6" ✅

### 4a. POWTÓRZENIA WG CELU (NIEZALEŻNE OD SERII!)
**Siła (strength):** 3-6 reps (NIGDY powyżej 8!)
**Masa (mass):** 8-12 reps (NIE 12-15!)
**Redukcja (reduction):** 12-15 reps
**Wytrzymałość (endurance):** 15-20+ reps
**Rekompozycja (recomposition):** 8-12 reps

### 4b. CIĘŻKIE ĆWICZENIA COMPOUND (KRYTYCZNE!)
Dla ciężkich ćwiczeń wielostawowych NIGDY nie dawaj 12-15+ powtórzeń!
Dotyczy: deadlift, squat, bench_press, overhead_press, barbell_row, hip_thrust, romanian_deadlift, leg_press, hack_squat, good_morning, t_bar_row

**Maksymalne powtórzenia dla HEAVY COMPOUND:**
- strength: 4-6 reps
- mass: 6-10 reps (NIE 12!)
- reduction: 10-12 reps (NIE 15!)
- endurance: 12-15 reps (max)
- recomposition: 8-10 reps

Przykład: barbell_deadlift dla celu "mass" → 4x6-10 ✅ (NIE 4x12-15 ❌)

### 5. DOPASOWANIE DO CZASU SESJI
- 30 min: 4-5 ćwiczeń, superserie, krótkie przerwy
- 45 min: 5-6 ćwiczeń, normalne przerwy
- 60 min: 6-7 ćwiczeń, pełne przerwy
- 75 min: 7-8 ćwiczeń, dłuższe przerwy
- 90 min: 8-10 ćwiczeń, pełna objętość

**WAŻNE:** Jeśli użytkownik ma długą sesję (75-90 min) ale MAŁO dostępnych ćwiczeń (np. tylko hantle/bodyweight):
- NIE szukaj na siłę 10 różnych ćwiczeń
- Zamiast tego zwiększ liczbę serii (5-6) w mniejszej liczbie ćwiczeń
- Jakość > ilość - lepiej 6 świetnych ćwiczeń po 5 serii niż 10 słabych po 3 serie

### 6. PREFERENCJA UNILATERAL (jednostronne)
Jeśli preferUnilateral=true:
- Priorytetyzuj ćwiczenia jednostronne (np. bulgarian split squat zamiast back squat)
- Wybieraj hantle zamiast sztangi gdy to możliwe
- Ćwiczenia unilateral są lepsze dla symetrii i stabilizacji

### 7. FOCUS BODY (jeśli podane)
Jeśli użytkownik ma "focus" na konkretną partię:
- Zwiększ objętość dla tej partii o 30-50%
- Umieść ćwiczenia na tę partię wcześniej w sesji
- Dla focus "lower" - więcej dni na nogi
- Dla focus "upper" - więcej dni na górę

### 8. WEAK POINTS (słabe punkty)
Jeśli użytkownik ma słabe punkty:
- Dodaj 1-2 dodatkowe ćwiczenia na te partie
- Umieść je wcześniej w treningu gdy energia jest najwyższa

### 9. STYL TRENINGU (trainingStyle) VS CEL (goal) - ROZWIĄZYWANIE KONFLIKTÓW
Jeśli trainingStyle koliduje z goal, ZAWSZE priorytetyzuj goal, ale spróbuj zachować elementy stylu:

**Konflikty i rozwiązania:**
- **Siła (strength) + Obwody (circuit):** 
  → Użyj super-serii antagonistycznych zamiast obwodów (np. przysiady + wiosłowanie)
  → Zachowaj długie przerwy (3-5 min między super-seriami)
  → NIE stosuj klasycznych obwodów bez przerw

- **Siła (strength) + Superserie:**
  → OK, ale tylko superserie antagonistyczne (push+pull)
  → Przerwy 2-3 min między super-seriami

- **Wytrzymałość (endurance) + Tradycyjny:**
  → Skróć przerwy do 30-45s nawet przy tradycyjnym formacie
  → Zwiększ powtórzenia do 15-20

- **Masa (mass) + Obwody (circuit):**
  → Użyj mini-obwodów (2-3 ćwiczenia) z przerwami 60-90s między rundami
  → Zachowaj zakres powtórzeń 8-12

**Zasada ogólna:** Goal determinuje objętość (serie, powtórzenia, przerwy), a trainingStyle wpływa tylko na organizację ćwiczeń (kolejność, grupowanie).

## FORMAT ODPOWIEDZI (OBOWIĄZKOWY):
Zwróć TYLKO czysty JSON bez markdown (bez \`\`\`json).
Użyj DOKŁADNIE tej struktury:

{
  "splitName": "Nazwa splitu po polsku",
  "splitDescription": "Krótki opis dlaczego ten split",
  "week": [
    {
      "day": "Poniedziałek",
      "dayName": "Push Day",
      "focus": "Chest, Shoulders, Triceps",
      "exercises": [
        {
          "code": "barbell_bench_press",
          "sets": 4,
          "reps": "8-10",
          "rest": "90s",
          "notes": "Główny ruch - zwiększaj wagę co tydzień"
        }
      ],
      "estimatedDuration": 55
    }
  ],
  "weeklyVolume": {
    "chest": 12,
    "back": 10,
    "shoulders": 8,
    "legs": 16,
    "arms": 6,
    "core": 4
  },
  "notes": "Dodatkowe wskazówki dla użytkownika"
}`;

// ============================================================================
// BUDOWANIE USER PROMPT
// ============================================================================

function buildUserPrompt(userProfile, validExercises) {
  const {
    experience,
    goal,
    daysPerWeek,
    sessionTime,
    injuries,
    focusBody,
    weakPoints,
    fatigueTolerance,
    preferredDays,
    preferUnilateral,
    trainingStyle
  } = userProfile;

  // Sortuj ćwiczenia: optimal -> standard -> alternative, compound -> isolation
  const sortedExercises = [...validExercises].sort((a, b) => {
    const tierOrder = { 'optimal': 0, 'standard': 1, 'alternative': 2 };
    const mechOrder = { 'compound': 0, 'isolation': 1, 'cardio': 2 };
    
    const tierDiff = (tierOrder[a.tier] || 2) - (tierOrder[b.tier] || 2);
    if (tierDiff !== 0) return tierDiff;
    
    return (mechOrder[a.mechanics] || 1) - (mechOrder[b.mechanics] || 1);
  });

  // Grupuj ćwiczenia dla lepszej czytelności
  const grouped = groupExercisesByBodyPart(sortedExercises);
  
  // Przygotuj listę ćwiczeń z wyraźnym oznaczeniem tier
  const exerciseList = {};
  const allCodes = []; // Lista wszystkich dostępnych kodów
  
  for (const [bodyPart, exercises] of Object.entries(grouped)) {
    exerciseList[bodyPart] = exercises.map(ex => {
      allCodes.push(ex.code);
      return {
        code: ex.code,
        name: ex.name,
        muscle: ex.muscle,
        mechanics: ex.mechanics,
        tier: ex.tier,  // OPTIMAL/STANDARD/ALTERNATIVE
        equipment: ex.equipment,
        unilateral: ex.unilateral
      };
    });
  }

  // Statystyki - ile optimal/standard mamy
  const optimalCount = sortedExercises.filter(e => e.tier === 'optimal').length;
  const standardCount = sortedExercises.filter(e => e.tier === 'standard').length;
  const compoundCount = sortedExercises.filter(e => e.mechanics === 'compound').length;

  // Policz dostępne ćwiczenia per body part
  const exerciseCounts = Object.entries(grouped).map(([part, exs]) => `${part}: ${exs.length}`).join(', ');
  const totalExercises = validExercises.length;

  return `## PROFIL UŻYTKOWNIKA:
- Cel: ${translateGoal(goal)}
- Poziom: ${translateExperience(experience)}
- Dni treningowe: ${daysPerWeek} dni/tydzień
- Czas sesji: ${sessionTime} minut
- Styl treningu: ${translateTrainingStyle(trainingStyle)}
- Kontuzje: ${injuries?.length ? injuries.join(', ') : 'brak'}
- Focus body: ${focusBody || 'zbalansowany'}
- Słabe punkty: ${weakPoints?.length ? weakPoints.join(', ') : 'brak'}
- Tolerancja zmęczenia: ${fatigueTolerance || 'średnia'}
- Preferuj ćwiczenia jednostronne: ${preferUnilateral ? 'TAK' : 'NIE'}
- Preferowane dni: ${preferredDays?.length ? preferredDays.join(', ') : 'dowolne'}

## STATYSTYKI ĆWICZEŃ:
- Łącznie dostępnych: ${totalExercises}
- tier="optimal" (PRIORYTET): ${optimalCount}
- tier="standard": ${standardCount}
- Ćwiczenia compound: ${compoundCount}
- Per body part: ${exerciseCounts}

## LISTA DOZWOLONYCH KODÓW (KOPIUJ DOKŁADNIE):
${allCodes.join(', ')}

## DOSTĘPNE ĆWICZENIA (posortowane wg tier, optimal pierwsze):
${JSON.stringify(exerciseList, null, 2)}

## ZADANIE:
Stwórz plan treningowy na ${daysPerWeek} dni w tygodniu.

ZASADY WYBORU ĆWICZEŃ:
1. UŻYWAJ TYLKO kodów z "LISTA DOZWOLONYCH KODÓW" powyżej
2. Priorytetyzuj ćwiczenia z tier="optimal" (min 60% w każdym treningu)
3. Każdy trening zaczynaj od compound (wielostawowych)
4. Dobierz serie/powtórzenia zgodnie z celem "${goal}"
5. Upewnij się że czas sesji ≈ ${sessionTime} minut

Zwróć TYLKO czysty JSON zgodny z formatem.`;
}

function translateGoal(goal) {
  const map = {
    'strength': 'Siła - maksymalna siła w głównych bojach',
    'mass': 'Masa mięśniowa - hipertrofia',
    'hypertrophy': 'Masa mięśniowa - hipertrofia',
    'reduction': 'Redukcja - spalanie tłuszczu',
    'endurance': 'Wytrzymałość - kondycja',
    'recomposition': 'Rekompozycja - spalanie tłuszczu + budowa mięśni'
  };
  return map[goal] || goal;
}

function translateExperience(exp) {
  const map = {
    'beginner': 'Początkujący (0-6 miesięcy)',
    'intermediate': 'Średnio-zaawansowany (6 mies - 2 lata)',
    'advanced': 'Zaawansowany (2+ lat)'
  };
  return map[exp] || exp;
}

function translateTrainingStyle(style) {
  const map = {
    'traditional': 'Tradycyjny (serie/powtórzenia)',
    'circuit': 'Obwodowy (circuit training)',
    'supersets': 'Superserie',
    'mixed': 'Zmieszany'
  };
  return map[style] || style || 'Tradycyjny';
}

// ============================================================================
// WYWOŁANIE AI
// ============================================================================

/**
 * Główna funkcja generująca plan z AI
 */
async function generatePlanWithAI(userProfile, allExercises) {
  // 1. Filtruj ćwiczenia
  const validExercises = getValidExercises(allExercises, userProfile);
  
  if (validExercises.length < 20) {
    console.warn(`[AI Planner] Mało ćwiczeń po filtrowaniu: ${validExercises.length}`);
  }

  // 2. Buduj prompty
  const userPrompt = buildUserPrompt(userProfile, validExercises);

  // 3. Wywołaj AI
  const provider = AI_CONFIG.provider;
  
  console.log(`[AI Planner] Wywołuję ${provider}...`);
  console.log(`[AI Planner] Ćwiczeń do wyboru: ${validExercises.length}`);

  let response;
  
  if (provider === 'gemini') {
    response = await callGemini(userPrompt);
  } else if (provider === 'openai') {
    response = await callOpenAI(userPrompt);
  } else if (provider === 'anthropic') {
    response = await callAnthropic(userPrompt);
  } else {
    throw new Error(`Nieznany provider AI: ${provider}`);
  }

  // 4. Parsuj odpowiedź
  const plan = parseAIResponse(response);

  // 5. Waliduj plan
  validatePlan(plan, validExercises, userProfile);

  // 6. Wzbogać plan o nazwy ćwiczeń
  enrichPlanWithNames(plan, validExercises);

  return {
    success: true,
    plan,
    metadata: {
      provider,
      exercisesAvailable: validExercises.length,
      generatedAt: new Date().toISOString()
    }
  };
}

/**
 * Wywołanie Google Gemini API ze streamingiem i retry
 */
async function callGemini(userPrompt, retryCount = 0) {
  const config = AI_CONFIG.gemini;
  const MAX_RETRIES = 2;
  const TIMEOUT_MS = 90000; // 90 sekund
  
  if (!config.apiKey) {
    throw new Error('Brak GEMINI_API_KEY w zmiennych środowiskowych');
  }

  // Użyj streaming API dla lepszego trackowania
  const url = `${config.baseUrl}/${config.model}:streamGenerateContent?key=${config.apiKey}`;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    console.log(`[Gemini] Timeout po ${TIMEOUT_MS/1000}s, próba ${retryCount + 1}/${MAX_RETRIES + 1}`);
    controller.abort();
  }, TIMEOUT_MS);
  
  let response;
  try {
    console.log(`[Gemini] Rozpoczynam streaming request (próba ${retryCount + 1})...`);
    
    response = await fetch(url, {
      signal: controller.signal,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: SYSTEM_PROMPT + '\n\n---\n\n' + userPrompt }
            ]
          }
        ],
        generationConfig: {
          temperature: AI_CONFIG.temperature,
          maxOutputTokens: config.maxTokens,
          responseMimeType: 'application/json'
        }
      })
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      // Retry przy timeout
      if (retryCount < MAX_RETRIES) {
        console.log(`[Gemini] Timeout, ponawiam (${retryCount + 1}/${MAX_RETRIES})...`);
        return callGemini(userPrompt, retryCount + 1);
      }
      throw new Error(`Gemini timeout po ${MAX_RETRIES + 1} próbach - odpowiedź trwała zbyt długo`);
    }
    throw err;
  }
  clearTimeout(timeoutId);

  if (!response.ok) {
    const error = await response.json();
    // Retry przy błędach 5xx (serwer)
    if (response.status >= 500 && retryCount < MAX_RETRIES) {
      console.log(`[Gemini] Błąd ${response.status}, ponawiam...`);
      await new Promise(r => setTimeout(r, 2000 * (retryCount + 1))); // exponential backoff
      return callGemini(userPrompt, retryCount + 1);
    }
    throw new Error(`Gemini API error: ${error.error?.message || response.statusText}`);
  }

  // Zbierz streaming response
  const text = await response.text();
  let fullText = '';
  
  try {
    // Streaming zwraca array of chunks - parsuj i połącz
    // Format: [{"candidates":[...]},{"candidates":[...]}]
    const chunks = JSON.parse(text);
    
    if (Array.isArray(chunks)) {
      console.log(`[Gemini] Otrzymano ${chunks.length} chunków`);
      for (const chunk of chunks) {
        if (chunk.candidates?.[0]?.content?.parts?.[0]?.text) {
          fullText += chunk.candidates[0].content.parts[0].text;
        }
      }
    } else if (chunks.candidates?.[0]?.content?.parts?.[0]?.text) {
      // Pojedyncza odpowiedź (non-streaming fallback)
      fullText = chunks.candidates[0].content.parts[0].text;
    }
  } catch (parseErr) {
    console.error('[Gemini] Błąd parsowania streaming response:', parseErr.message);
    console.error('[Gemini] Raw response:', text.slice(0, 500));
    throw new Error('Gemini zwrócił nieprawidłowy format odpowiedzi');
  }
  
  if (!fullText) {
    console.error('[Gemini] Pusta odpowiedź po złożeniu chunków');
    if (retryCount < MAX_RETRIES) {
      console.log(`[Gemini] Pusta odpowiedź, ponawiam...`);
      await new Promise(r => setTimeout(r, 2000));
      return callGemini(userPrompt, retryCount + 1);
    }
    throw new Error('Gemini nie zwrócił treści po wszystkich próbach');
  }
  
  console.log(`[Gemini] Sukces! Odpowiedź: ${fullText.length} znaków`);
  return fullText;
}

/**
 * Wywołanie OpenAI API
 */
async function callOpenAI(userPrompt) {
  const config = AI_CONFIG.openai;
  
  if (!config.apiKey) {
    throw new Error('Brak OPENAI_API_KEY w zmiennych środowiskowych');
  }

  const response = await fetch(config.baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: config.maxTokens,
      temperature: AI_CONFIG.temperature
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

/**
 * Wywołanie Anthropic API
 */
async function callAnthropic(userPrompt) {
  const config = AI_CONFIG.anthropic;
  
  if (!config.apiKey) {
    throw new Error('Brak ANTHROPIC_API_KEY w zmiennych środowiskowych');
  }

  const response = await fetch(config.baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: config.maxTokens,
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: userPrompt }
      ]
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Anthropic API error: ${error.error?.message || response.statusText}`);
  }

  const data = await response.json();
  return data.content[0].text;
}

/**
 * Parsowanie odpowiedzi AI (obsługa błędów formatowania)
 */
function parseAIResponse(response) {
  // Usuń potencjalne markdown code blocks
  let cleaned = response
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();

  // Znajdź pierwszy { i ostatni }
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  
  if (firstBrace === -1 || lastBrace === -1) {
    throw new Error('AI nie zwróciło poprawnego JSON');
  }

  cleaned = cleaned.slice(firstBrace, lastBrace + 1);

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    console.error('[AI Planner] Błąd parsowania JSON:', err.message);
    console.error('[AI Planner] Otrzymana odpowiedź:', cleaned.substring(0, 500));
    throw new Error('AI zwróciło niepoprawny JSON');
  }
}

/**
 * Walidacja wygenerowanego planu
 */
function validatePlan(plan, validExercises, userProfile) {
  const validCodes = new Set(validExercises.map(e => e.code));
  const errors = [];

  if (!plan.week || !Array.isArray(plan.week)) {
    errors.push('Brak tablicy "week" w planie');
  }

  if (plan.week) {
    for (const day of plan.week) {
      if (!day.exercises || !Array.isArray(day.exercises)) {
        errors.push(`Dzień "${day.day}" nie ma tablicy exercises`);
        continue;
      }

      for (const ex of day.exercises) {
        if (!validCodes.has(ex.code)) {
          // Spróbuj znaleźć podobne
          const similar = findSimilarExercise(ex.code, validExercises);
          if (similar) {
            console.warn(`[Validation] Zamieniam "${ex.code}" na "${similar.code}"`);
            ex.code = similar.code;
            ex.name = similar.name;
          } else {
            errors.push(`Ćwiczenie "${ex.code}" nie istnieje na liście dozwolonych`);
          }
        }
      }
    }
  }

  if (errors.length > 0) {
    console.error('[AI Planner] Błędy walidacji:', errors);
    // Nie rzucamy błędem - logujemy i kontynuujemy
  }

  // Popraw sets/reps jeśli AI użyło złych wartości
  correctSetsRepsForGoal(plan, userProfile, validExercises);

  return errors;
}

/**
 * Oblicza optymalną liczbę serii wg hierarchii ważności:
 * 1. sessionTime (czas sesji) - najważniejszy ogranicznik
 * 2. experience (doświadczenie) - pojemność treningowa
 * 3. goal (cel) - specyfika adaptacji
 * 4. fatigueTolerance - regulator
 * 5. mechanics (compound/isolation) - typ ćwiczenia
 */
function calculateOptimalSets(userProfile, isCompound) {
  const { sessionTime, experience, goal, fatigueTolerance } = userProfile;
  
  // KROK 1: Bazowe serie wg czasu sesji (najważniejszy ogranicznik!)
  let baseSets;
  if (sessionTime < 45) {
    baseSets = 2; // Mało czasu = mało serii
  } else if (sessionTime <= 60) {
    baseSets = 3;
  } else if (sessionTime <= 75) {
    baseSets = isCompound ? 4 : 3;
  } else {
    baseSets = isCompound ? 4 : 3; // 75+ min
  }
  
  // KROK 2: Modyfikacja wg doświadczenia (pojemność treningowa)
  let expModifier = 0;
  if (experience === 'beginner') {
    expModifier = -1; // Beginnerzy nie potrzebują/nie wytrzymują dużo
  } else if (experience === 'advanced') {
    expModifier = 1; // Zaawansowani potrzebują więcej bodźca
  }
  
  // KROK 3: Modyfikacja wg celu
  let goalModifier = 0;
  if (goal === 'strength' && isCompound) {
    goalModifier = 1; // Siła wymaga więcej serii w głównych bojach (5x5)
  } else if (goal === 'endurance') {
    goalModifier = -1; // Wytrzymałość = mniej serii, więcej powtórzeń
  }
  
  // KROK 4: Modyfikacja wg tolerancji zmęczenia
  let fatigueModifier = 0;
  if (fatigueTolerance === 'low') {
    fatigueModifier = -1;
  } else if (fatigueTolerance === 'high' && sessionTime >= 60) {
    fatigueModifier = 1; // Tylko jeśli mamy czas
  }
  
  // Oblicz finalne serie
  let finalSets = baseSets + expModifier + goalModifier + fatigueModifier;
  
  // Ograniczenia bezwzględne
  if (isCompound) {
    finalSets = Math.max(2, Math.min(5, finalSets)); // Compound: 2-5 serii
  } else {
    finalSets = Math.max(2, Math.min(4, finalSets)); // Isolation: 2-4 serie
  }
  
  // BEZWZGLĘDNE LIMITY dla krótkich sesji (fizyka!)
  if (sessionTime < 45) {
    finalSets = Math.min(finalSets, 3);
  }
  
  // Beginner NIGDY więcej niż 3 serie (junk volume)
  if (experience === 'beginner') {
    finalSets = Math.min(finalSets, 3);
  }
  
  return finalSets;
}

/**
 * Koryguje serie/powtórzenia jeśli AI użyło niewłaściwych wartości
 * HIERARCHIA: sessionTime > experience > goal > fatigueTolerance > mechanics
 */
function correctSetsRepsForGoal(plan, userProfile, validExercises) {
  const { goal, sessionTime, experience, fatigueTolerance } = userProfile;
  
  // Mapa ćwiczeń do sprawdzenia mechanics
  const exerciseMap = new Map();
  for (const ex of validExercises) {
    exerciseMap.set(ex.code, ex);
  }
  
  // Ciężkie ćwiczenia compound - NIGDY nie powinny mieć 12-15+ powtórzeń
  const HEAVY_COMPOUNDS = [
    'deadlift', 'squat', 'bench_press', 'overhead_press', 'military_press',
    'barbell_row', 'bent_over_row', 'pendlay_row', 't_bar_row',
    'front_squat', 'back_squat', 'hip_thrust', 'romanian_deadlift',
    'sumo_deadlift', 'rack_pull', 'good_morning', 'clean', 'snatch',
    'push_press', 'leg_press', 'hack_squat'
  ];
  
  // Maksymalne powtórzenia dla ciężkich compound wg celu
  const heavyCompoundReps = {
    strength: '4-6',
    mass: '6-10',
    reduction: '10-12',
    endurance: '12-15',
    recomposition: '8-10'
  };
  
  // Powtórzenia wg celu (niezależne od serii)
  const goalReps = {
    strength: { default: '4-6', wrongReps: ['12-15', '15-20', '12-20', '10-15'] },
    mass: { default: '8-12', wrongReps: ['12-15', '15-20', '3-5'] },
    reduction: { default: '12-15', wrongReps: [] },
    endurance: { default: '15-20', wrongReps: ['3-5', '4-6', '6-8'] },
    recomposition: { default: '8-12', wrongReps: ['12-15', '15-20', '3-5'] }
  };

  const repsConfig = goalReps[goal] || goalReps.mass;
  if (!plan.week) return;

  let corrected = 0;
  
  for (const day of plan.week) {
    if (!day.exercises) continue;
    
    for (const ex of day.exercises) {
      const code = (ex.code || '').toLowerCase();
      const currentReps = String(ex.reps || '');
      const currentSets = ex.sets || 3;
      
      // Pobierz info o ćwiczeniu
      const exerciseInfo = exerciseMap.get(ex.code);
      const isCompound = exerciseInfo?.mechanics === 'compound';
      const isHeavyCompound = HEAVY_COMPOUNDS.some(heavy => code.includes(heavy));
      
      // === KOREKCJA SERII ===
      const optimalSets = calculateOptimalSets(userProfile, isCompound || isHeavyCompound);
      
      // Sprawdź czy serie są znacząco błędne
      const setsDiff = Math.abs(currentSets - optimalSets);
      if (setsDiff >= 2 || (experience === 'beginner' && currentSets > 3)) {
        console.log(`[Validation] SETS: ${ex.code}: ${currentSets} → ${optimalSets} ` +
          `(session=${sessionTime}min, exp=${experience}, goal=${goal}, fatigue=${fatigueTolerance}, ` +
          `type=${isCompound ? 'compound' : 'isolation'})`);
        ex.sets = optimalSets;
        corrected++;
      }
      
      // === KOREKCJA POWTÓRZEŃ ===
      // PRIORYTET 1: Ciężkie ćwiczenia compound
      if (isHeavyCompound) {
        const repsMatch = currentReps.match(/(\d+)/);
        const repsNum = repsMatch ? parseInt(repsMatch[1]) : 0;
        
        if (repsNum >= 12 || currentReps.includes('12-15') || currentReps.includes('15')) {
          const correctReps = heavyCompoundReps[goal] || '8-10';
          console.log(`[Validation] HEAVY COMPOUND: ${ex.code} reps: "${currentReps}" → "${correctReps}"`);
          ex.reps = correctReps;
          corrected++;
          continue;
        }
      }
      
      // PRIORYTET 2: Sprawdź czy reps są błędne dla celu
      if (repsConfig.wrongReps.some(wrong => currentReps.includes(wrong.replace('-', '')) || currentReps === wrong)) {
        console.log(`[Validation] REPS: ${ex.code}: "${currentReps}" → "${repsConfig.default}" (cel: ${goal})`);
        ex.reps = repsConfig.default;
        corrected++;
      }
    }
  }
  
  if (corrected > 0) {
    console.log(`[Validation] Skorygowano ${corrected} wartości sets/reps ` +
      `(session=${sessionTime}min, exp=${experience}, goal=${goal})`);
  }
}

/**
 * Znajdź podobne ćwiczenie (fallback dla błędów AI)
 */
function findSimilarExercise(code, validExercises) {
  // Najpierw szukaj exact match bez underscores
  const normalized = code.toLowerCase().replace(/[_\s-]/g, '');
  
  for (const ex of validExercises) {
    const exNormalized = ex.code.toLowerCase().replace(/[_\s-]/g, '');
    if (exNormalized === normalized) return ex;
  }

  // Szukaj partial match
  for (const ex of validExercises) {
    if (ex.code.includes(code) || code.includes(ex.code)) return ex;
  }

  return null;
}

/**
 * Wzbogaca plan o pełne nazwy ćwiczeń
 */
function enrichPlanWithNames(plan, validExercises) {
  // Tworzymy mapę code -> exercise dla szybkiego wyszukiwania
  // UWAGA: validExercises ma już spłaszczoną strukturę z getValidExercises():
  //   name: string (angielska nazwa)
  //   name_pl: string (polska nazwa)
  const exerciseMap = new Map();
  for (const ex of validExercises) {
    exerciseMap.set(ex.code, ex);
  }

  if (!plan.week || !Array.isArray(plan.week)) return;

  for (const day of plan.week) {
    if (!day.exercises || !Array.isArray(day.exercises)) continue;

    for (const ex of day.exercises) {
      const fullExercise = exerciseMap.get(ex.code);
      if (fullExercise) {
        // Dodaj nazwy w obu językach
        // fullExercise.name to już string (EN), fullExercise.name_pl to string (PL)
        ex.name = fullExercise.name || ex.code;
        ex.name_en = fullExercise.name || ex.code;
        ex.name_pl = fullExercise.name_pl || fullExercise.name || ex.code;
        // Dodaj też inne przydatne dane
        ex.primary_muscle = fullExercise.primary_muscle || fullExercise.muscle;
        ex.equipment = fullExercise.equipment;
        ex.pattern = fullExercise.pattern;
      } else {
        // Jeśli nie znaleziono - użyj code jako fallback
        ex.name = ex.code.replace(/_/g, ' ');
        ex.name_en = ex.code.replace(/_/g, ' ');
        ex.name_pl = ex.code.replace(/_/g, ' ');
      }
    }
  }
}

// ============================================================================
// FALLBACK - LOKALNY GENERATOR (gdy brak API key)
// ============================================================================

/**
 * Prosty generator lokalny gdy nie ma API key
 * (ulepszona logika z priorytetyzacją optimal tier)
 */
function generatePlanLocally(userProfile, allExercises) {
  const validExercises = getValidExercises(allExercises, userProfile);
  const { daysPerWeek, sessionTime, goal, experience, focusBody, weakPoints, preferUnilateral } = userProfile;

  // DEBUG: Log key info
  console.log(`[Local] Otrzymano ${allExercises?.length || 0} ćwiczeń, po filtrach: ${validExercises.length}`);
  
  if (validExercises.length === 0) {
    console.error('[Local] KRYTYCZNY BŁĄD: Brak ćwiczeń po filtrowaniu!');
    console.error('[Local] allExercises sample:', allExercises?.slice(0, 2).map(e => ({ code: e.code, body_part: e.body_part })));
  }
  
  // DEBUG: Log body_part distribution
  const bodyPartCounts = {};
  validExercises.forEach(e => {
    const bp = e.body_part || 'UNDEFINED';
    bodyPartCounts[bp] = (bodyPartCounts[bp] || 0) + 1;
  });
  console.log('[Local] Body parts:', JSON.stringify(bodyPartCounts));

  // Prosty wybór splitu
  const splits = {
    2: { name: 'Full Body', pattern: ['Full Body', 'Full Body'] },
    3: { name: 'Full Body', pattern: ['Full Body', 'Full Body', 'Full Body'] },
    4: { name: 'Upper/Lower', pattern: ['Upper', 'Lower', 'Upper', 'Lower'] },
    5: { name: 'Push/Pull/Legs', pattern: ['Push', 'Pull', 'Legs', 'Upper', 'Lower'] },
    6: { name: 'Push/Pull/Legs x2', pattern: ['Push', 'Pull', 'Legs', 'Push', 'Pull', 'Legs'] }
  };

  const splitConfig = splits[daysPerWeek] || splits[4];
  
  // Oblicz optymalne serie używając tej samej logiki co walidacja
  const compoundSets = calculateOptimalSets(userProfile, true);
  const isolationSets = calculateOptimalSets(userProfile, false);
  
  // Powtórzenia wg celu (niezależne od serii)
  const repsConfig = {
    'strength': '4-6',
    'mass': '8-12',
    'reduction': '12-15',
    'endurance': '15-20',
    'recomposition': '8-12'
  };
  
  // Przerwy wg celu
  const restConfig = {
    'strength': 180,
    'mass': 90,
    'reduction': 60,
    'endurance': 45,
    'recomposition': 75
  };
  
  const reps = repsConfig[goal] || '8-12';
  const rest = restConfig[goal] || 90;
  
  console.log(`[Local] Serie: compound=${compoundSets}, isolation=${isolationSets} ` +
    `(session=${sessionTime}min, exp=${experience}, goal=${goal}, fatigue=${userProfile.fatigueTolerance || 'medium'})`);
  
  // DYNAMICZNY OBLICZ ILOŚĆ ĆWICZEŃ na podstawie sessionTime
  // Średnie serie (bo mix compound i isolation)
  const avgSets = (compoundSets + isolationSets) / 2;
  const timePerExercise = avgSets * (40 + rest) / 60; // w minutach
  let exercisesPerDay = Math.floor(sessionTime / timePerExercise);
  
  // Ogranicz do rozsądnych wartości (min 2 dla bardzo krótkich sesji, max 12)
  exercisesPerDay = Math.max(2, Math.min(12, exercisesPerDay));
  
  console.log(`[Local] Cel: ${goal}, Sesja: ${sessionTime}min -> ${exercisesPerDay} ćwiczeń (${timePerExercise.toFixed(1)}min/ćw)`);
  
  // Policz min liczbę ćwiczeń per body part (bez CARDIO który nie jest w standardowych splitach)
  const grouped = groupExercisesByBodyPart(validExercises);
  const mainBodyParts = Object.entries(grouped).filter(([key]) => key !== 'CARDIO');
  const partCounts = mainBodyParts.map(([, arr]) => arr.length);
  const minPerPart = partCounts.length > 0 ? Math.min(...partCounts) : 0;
  const avgPerPart = validExercises.length / Math.max(1, mainBodyParts.length);
  
  // Jeśli mało ćwiczeń w puli, zmniejsz liczbę ćwiczeń na sesję (jakość > ilość)
  if ((minPerPart < 10 || avgPerPart < 25) && sessionTime >= 45) {
    const oldCount = exercisesPerDay;
    exercisesPerDay = Math.max(4, Math.min(exercisesPerDay - 1, Math.floor(exercisesPerDay * 0.75)));
    console.log(`[Local] Mało ćwiczeń w puli (min ${minPerPart}/part) - ${oldCount} -> ${exercisesPerDay} ćw.`);
  }

  // Body part mapping dla splitów (klucze MUSZĄ pasować do pattern values)
  const splitBodyParts = {
    'Full Body': ['CHEST', 'BACK', 'LEGS', 'SHOULDERS', 'ARMS', 'CORE', 'Core', 'Legs'],
    'Upper': ['CHEST', 'BACK', 'SHOULDERS', 'ARMS'],
    'Lower': ['LEGS', 'CORE', 'Core', 'Legs'],
    'Push': ['CHEST', 'SHOULDERS', 'ARMS'],
    'Pull': ['BACK', 'ARMS'],
    'Legs': ['LEGS', 'CORE', 'Core', 'Legs']
  };

  // Sortuj ćwiczenia: optimal > standard > inne, compound > isolation
  // Dodaj bonus dla unilateral jeśli preferUnilateral=true
  const sortedExercises = [...validExercises].sort((a, b) => {
    // Unilateral priority (jeśli preferowane)
    if (preferUnilateral) {
      const aUni = a.unilateral ? 0 : 1;
      const bUni = b.unilateral ? 0 : 1;
      if (aUni !== bUni) return aUni - bUni;
    }
    
    // Tier priority
    const tierOrder = { 'optimal': 0, 'standard': 1, 'alternative': 2 };
    const tierDiff = (tierOrder[a.tier] || 2) - (tierOrder[b.tier] || 2);
    if (tierDiff !== 0) return tierDiff;
    
    // Mechanics priority
    const mechOrder = { 'compound': 0, 'isolation': 1, 'cardio': 2 };
    return (mechOrder[a.mechanics] || 1) - (mechOrder[b.mechanics] || 1);
  });

  // Generuj dni
  const week = [];
  const dayNames = ['Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota', 'Niedziela'];
  const usedCodes = new Set();

  for (let i = 0; i < daysPerWeek; i++) {
    const dayType = splitConfig.pattern[i];
    const targetBodyParts = new Set(splitBodyParts[dayType] || splitBodyParts['Full Body']);
    
    // Filtruj ćwiczenia dla tego dnia
    let dayPool = sortedExercises.filter(e => 
      !usedCodes.has(e.code) && 
      (targetBodyParts.has(e.body_part) || targetBodyParts.has(e.body_part?.toUpperCase()))
    );

    // DEBUG: Log body_part distribution
    if (dayPool.length === 0) {
      const bodyPartsInExercises = [...new Set(sortedExercises.map(e => e.body_part))];
      console.warn(`[Local] UWAGA: Dzień ${i+1} (${dayType}) - 0 ćwiczeń! Available body_parts: ${bodyPartsInExercises.join(', ')}`);
      console.warn(`[Local] Target body_parts: ${[...targetBodyParts].join(', ')}`);
      
      // FALLBACK: jeśli brak ćwiczeń dla tego splitu, użyj wszystkich dostępnych
      dayPool = sortedExercises.filter(e => !usedCodes.has(e.code));
      console.log(`[Local] Używam fallback - wszystkie dostępne ćwiczenia: ${dayPool.length}`);
    }

    const dayExercises = [];
    
    // Wybierz compound najpierw, priorytetyzując optimal tier
    const compounds = dayPool.filter(e => e.mechanics === 'compound');
    const isolations = dayPool.filter(e => e.mechanics === 'isolation');

    const compoundCount = Math.ceil(exercisesPerDay * 0.6);
    const isolationCount = exercisesPerDay - compoundCount;

    // Compounds: najpierw optimal (lekki shuffle), potem standard (lekki shuffle)
    const optimalCompounds = shuffleArray(compounds.filter(e => e.tier === 'optimal'));
    const standardCompounds = shuffleArray(compounds.filter(e => e.tier === 'standard'));
    const allShuffledCompounds = [...optimalCompounds, ...standardCompounds].slice(0, compoundCount);
    
    for (const ex of allShuffledCompounds) {
      usedCodes.add(ex.code);
      dayExercises.push({
        code: ex.code,
        name: ex.name,
        sets: compoundSets,
        reps: reps,
        rest: `${rest}s`,
        notes: ex.tier === 'optimal' ? 'Główny ruch' : ''
      });
    }

    // Isolations: też optimal najpierw
    const optimalIsolations = shuffleArray(isolations.filter(e => e.tier === 'optimal'));
    const standardIsolations = shuffleArray(isolations.filter(e => e.tier === 'standard'));
    const allShuffledIsolations = [...optimalIsolations, ...standardIsolations].slice(0, isolationCount);
    
    for (const ex of allShuffledIsolations) {
      usedCodes.add(ex.code);
      dayExercises.push({
        code: ex.code,
        name: ex.name,
        sets: isolationSets,
        reps: reps,
        rest: `${rest}s`,
        notes: ''
      });
    }

    // Oblicz szacowany czas
    const estimatedDuration = dayExercises.reduce((sum, ex) => {
      const setsTime = ex.sets * (40 + rest);
      return sum + setsTime / 60;
    }, 0);

    week.push({
      day: dayNames[i],
      dayName: dayType,
      focus: dayType,
      exercises: dayExercises,
      estimatedDuration: Math.round(estimatedDuration)
    });
  }

  return {
    success: true,
    plan: {
      splitName: splitConfig.name,
      splitDescription: 'Wygenerowano lokalnie (bez AI)',
      week,
      notes: 'Plan wygenerowany lokalnie. Dla lepszych wyników skonfiguruj GEMINI_API_KEY, OPENAI_API_KEY lub ANTHROPIC_API_KEY.'
    },
    metadata: {
      provider: 'local',
      exercisesAvailable: validExercises.length,
      generatedAt: new Date().toISOString()
    }
  };
}

/**
 * Fisher-Yates shuffle
 */
function shuffleArray(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// ============================================================================
// GŁÓWNA FUNKCJA EKSPORTOWA
// ============================================================================

/**
 * Generuje plan treningowy - wybiera AI lub lokalny fallback
 * @returns {Object} result - zawiera plan i informację o fallback
 * @returns {boolean} result.usedFallback - true jeśli użyto lokalnego generatora
 * @returns {string} result.fallbackReason - powód użycia fallback (jeśli dotyczy)
 */
async function generatePlan(userProfile, allExercises) {
  const hasApiKey = AI_CONFIG.gemini.apiKey || AI_CONFIG.openai.apiKey || AI_CONFIG.anthropic.apiKey;

  if (hasApiKey) {
    try {
      const result = await generatePlanWithAI(userProfile, allExercises);
      return {
        ...result,
        usedFallback: false,
        fallbackReason: null
      };
    } catch (err) {
      console.error('[AI Planner] Błąd AI, używam fallback:', err.message);
      const result = generatePlanLocally(userProfile, allExercises);
      return {
        ...result,
        usedFallback: true,
        fallbackReason: `Błąd AI: ${err.message}`
      };
    }
  } else {
    console.log('[AI Planner] Brak API key, używam lokalnego generatora');
    const result = generatePlanLocally(userProfile, allExercises);
    return {
      ...result,
      usedFallback: true,
      fallbackReason: 'Brak klucza API (GEMINI_API_KEY, OPENAI_API_KEY lub ANTHROPIC_API_KEY)'
    };
  }
}

// ============================================================================
// EKSPORT
// ============================================================================
module.exports = {
  generatePlan,
  generatePlanWithAI,
  generatePlanLocally,
  buildUserPrompt,
  parseAIResponse,
  SYSTEM_PROMPT,
  AI_CONFIG
};
