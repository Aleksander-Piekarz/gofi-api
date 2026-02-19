-- Aktualizacja schematu tabeli exercises
-- Dodanie kolumn wielojęzycznych i usunięcie zbędnych

-- ==========================================
-- ZWIĘKSZENIE ROZMIARU KOLUMNY CODE
-- ==========================================

-- Niektóre kody ćwiczeń są bardzo długie (np. 67 znaków)
ALTER TABLE exercises MODIFY COLUMN code VARCHAR(100) NOT NULL;

-- ==========================================
-- DODANIE NOWYCH KOLUMN
-- ==========================================

ALTER TABLE exercises ADD COLUMN name_en VARCHAR(255) DEFAULT NULL;
ALTER TABLE exercises ADD COLUMN name_pl VARCHAR(255) DEFAULT NULL;
ALTER TABLE exercises ADD COLUMN instructions_en TEXT DEFAULT NULL;
ALTER TABLE exercises ADD COLUMN instructions_pl TEXT DEFAULT NULL;
ALTER TABLE exercises ADD COLUMN common_mistakes_en TEXT DEFAULT NULL;
ALTER TABLE exercises ADD COLUMN common_mistakes_pl TEXT DEFAULT NULL;
ALTER TABLE exercises ADD COLUMN images TEXT DEFAULT NULL;
ALTER TABLE exercises ADD COLUMN safety_data TEXT DEFAULT NULL;

-- ==========================================
-- USUNIĘCIE ZBĘDNYCH KOLUMN
-- ==========================================

-- Stara kolumna name (zastąpiona przez name_en/name_pl)
ALTER TABLE exercises DROP COLUMN name;

-- Stara kolumna description (zastąpiona przez instructions_en/instructions_pl)
ALTER TABLE exercises DROP COLUMN description;

-- Kolumna notes (prawdopodobnie nieużywana)
ALTER TABLE exercises DROP COLUMN notes;

-- Kolumna excluded_injuries (przeniesiona do safety_data jako JSON)
ALTER TABLE exercises DROP COLUMN excluded_injuries;

-- ==========================================
-- INDEKSY
-- ==========================================

CREATE INDEX idx_exercises_name_en ON exercises(name_en);
CREATE INDEX idx_exercises_name_pl ON exercises(name_pl);
