-- Migracja: Dodanie nowych pól z exercises.json
-- Data: 2026-01-28
-- Opis: Dodaje pola tier, fatigue_score, rep_range_type, body_part, detailed_muscle, avg_time_per_set

-- ==========================================
-- NOWE KOLUMNY Z EXERCISES.JSON
-- ==========================================

-- Tier (optimal, standard, warmup) - jakość/priorytet ćwiczenia
ALTER TABLE exercises 
ADD COLUMN IF NOT EXISTS tier VARCHAR(20) DEFAULT 'standard' COMMENT 'Tier ćwiczenia: optimal, standard, warmup';

-- Fatigue score (1-7) - poziom zmęczenia generowany przez ćwiczenie
ALTER TABLE exercises 
ADD COLUMN IF NOT EXISTS fatigue_score TINYINT DEFAULT 3 COMMENT 'Poziom zmęczenia (1-7)';

-- Rep range type - zalecany typ zakresu powtórzeń
ALTER TABLE exercises 
ADD COLUMN IF NOT EXISTS rep_range_type VARCHAR(20) DEFAULT 'hypertrophy' COMMENT 'Typ zakresu: strength, hypertrophy, endurance';

-- Body part - główna część ciała (CORE, BACK, CHEST, LEGS, etc.)
ALTER TABLE exercises 
ADD COLUMN IF NOT EXISTS body_part VARCHAR(50) DEFAULT NULL COMMENT 'Główna część ciała (CORE, BACK, CHEST, LEGS, SHOULDERS, ARMS)';

-- Detailed muscle - szczegółowy mięsień
ALTER TABLE exercises 
ADD COLUMN IF NOT EXISTS detailed_muscle VARCHAR(100) DEFAULT NULL COMMENT 'Szczegółowy mięsień (np. Rectus Abdominis, Lats)';

-- Average time per set - średni czas na serię w sekundach
ALTER TABLE exercises 
ADD COLUMN IF NOT EXISTS avg_time_per_set INT DEFAULT 30 COMMENT 'Średni czas na serię w sekundach';

-- ==========================================
-- INDEKSY DLA NOWYCH KOLUMN
-- ==========================================

CREATE INDEX IF NOT EXISTS idx_exercises_tier ON exercises(tier);
CREATE INDEX IF NOT EXISTS idx_exercises_body_part ON exercises(body_part);
CREATE INDEX IF NOT EXISTS idx_exercises_fatigue_score ON exercises(fatigue_score);
CREATE INDEX IF NOT EXISTS idx_exercises_rep_range_type ON exercises(rep_range_type);

-- ==========================================
-- DLA MySQL < 8.0 (bez IF NOT EXISTS):
-- ==========================================
/*
ALTER TABLE exercises ADD COLUMN tier VARCHAR(20) DEFAULT 'standard';
ALTER TABLE exercises ADD COLUMN fatigue_score TINYINT DEFAULT 3;
ALTER TABLE exercises ADD COLUMN rep_range_type VARCHAR(20) DEFAULT 'hypertrophy';
ALTER TABLE exercises ADD COLUMN body_part VARCHAR(50) DEFAULT NULL;
ALTER TABLE exercises ADD COLUMN detailed_muscle VARCHAR(100) DEFAULT NULL;
ALTER TABLE exercises ADD COLUMN avg_time_per_set INT DEFAULT 30;

CREATE INDEX idx_exercises_tier ON exercises(tier);
CREATE INDEX idx_exercises_body_part ON exercises(body_part);
CREATE INDEX idx_exercises_fatigue_score ON exercises(fatigue_score);
CREATE INDEX idx_exercises_rep_range_type ON exercises(rep_range_type);
*/
