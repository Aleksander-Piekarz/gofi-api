-- Migracja: Dodanie kolumn wielojęzycznych do tabeli exercises
-- Data: 2026-01-11
-- Opis: Rozszerza tabelę exercises o pola dla nazw, instrukcji, błędów w wielu językach

-- Sprawdź czy kolumny istnieją przed dodaniem (MySQL 8.0+)
-- Dla starszych wersji MySQL, usuń IF NOT EXISTS i uruchom ręcznie

-- Kolumny wielojęzyczne dla nazwy
ALTER TABLE exercises 
ADD COLUMN IF NOT EXISTS name_en VARCHAR(255) DEFAULT NULL COMMENT 'Nazwa ćwiczenia po angielsku';

ALTER TABLE exercises 
ADD COLUMN IF NOT EXISTS name_pl VARCHAR(255) DEFAULT NULL COMMENT 'Nazwa ćwiczenia po polsku';

-- Kolumny wielojęzyczne dla instrukcji (JSON array kroków)
ALTER TABLE exercises 
ADD COLUMN IF NOT EXISTS instructions_en TEXT DEFAULT NULL COMMENT 'Instrukcje po angielsku (JSON array)';

ALTER TABLE exercises 
ADD COLUMN IF NOT EXISTS instructions_pl TEXT DEFAULT NULL COMMENT 'Instrukcje po polsku (JSON array)';

-- Kolumny wielojęzyczne dla typowych błędów (JSON array)
ALTER TABLE exercises 
ADD COLUMN IF NOT EXISTS common_mistakes_en TEXT DEFAULT NULL COMMENT 'Typowe błędy po angielsku (JSON array)';

ALTER TABLE exercises 
ADD COLUMN IF NOT EXISTS common_mistakes_pl TEXT DEFAULT NULL COMMENT 'Typowe błędy po polsku (JSON array)';

-- Kolumna dla obrazów (JSON array ścieżek do plików)
ALTER TABLE exercises 
ADD COLUMN IF NOT EXISTS images TEXT DEFAULT NULL COMMENT 'Tablica obrazów/GIF (JSON array)';

-- Kolumna dla danych bezpieczeństwa (JSON object)
ALTER TABLE exercises 
ADD COLUMN IF NOT EXISTS safety_data TEXT DEFAULT NULL COMMENT 'Dane bezpieczeństwa (JSON object z excluded_injuries, precautions, itp.)';

-- Indeksy dla szybszego wyszukiwania po nazwach
CREATE INDEX IF NOT EXISTS idx_exercises_name_en ON exercises(name_en);
CREATE INDEX IF NOT EXISTS idx_exercises_name_pl ON exercises(name_pl);

-- ============================================
-- Dla MySQL < 8.0 (bez IF NOT EXISTS), użyj:
-- ============================================
/*
-- Najpierw sprawdź czy kolumny istnieją:
SELECT COLUMN_NAME 
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME = 'exercises' 
  AND COLUMN_NAME IN ('name_en', 'name_pl', 'instructions_en', 'instructions_pl', 
                      'common_mistakes_en', 'common_mistakes_pl', 'images', 'safety_data');

-- Jeśli kolumny nie istnieją, uruchom:
ALTER TABLE exercises 
ADD COLUMN name_en VARCHAR(255) DEFAULT NULL,
ADD COLUMN name_pl VARCHAR(255) DEFAULT NULL,
ADD COLUMN instructions_en TEXT DEFAULT NULL,
ADD COLUMN instructions_pl TEXT DEFAULT NULL,
ADD COLUMN common_mistakes_en TEXT DEFAULT NULL,
ADD COLUMN common_mistakes_pl TEXT DEFAULT NULL,
ADD COLUMN images TEXT DEFAULT NULL,
ADD COLUMN safety_data TEXT DEFAULT NULL;
*/

-- ============================================
-- Weryfikacja po migracji
-- ============================================
-- SELECT 
--   COLUMN_NAME, 
--   DATA_TYPE, 
--   IS_NULLABLE,
--   COLUMN_COMMENT
-- FROM INFORMATION_SCHEMA.COLUMNS 
-- WHERE TABLE_SCHEMA = DATABASE() 
--   AND TABLE_NAME = 'exercises'
-- ORDER BY ORDINAL_POSITION;
