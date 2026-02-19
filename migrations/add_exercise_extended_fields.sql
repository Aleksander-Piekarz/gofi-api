-- Migracja: Dodanie rozszerzonych pól z exercises.json
-- Data: 2026-02-16
-- Opis: Dodaje grip_type, force_type, force_direction, mobility_requirements, secondary_muscles_en/pl

-- ==========================================
-- NOWE KOLUMNY Z EXERCISES.JSON
-- ==========================================

-- Grip type (pronated, supinated, neutral, mixed) - typ chwytu
ALTER TABLE exercises ADD COLUMN grip_type VARCHAR(30) DEFAULT NULL;

-- Force type (push, pull) - typ siły
ALTER TABLE exercises ADD COLUMN force_type VARCHAR(20) DEFAULT NULL;

-- Force direction - kierunek siły
ALTER TABLE exercises ADD COLUMN force_direction VARCHAR(50) DEFAULT NULL;

-- Mobility requirements (JSON array) - wymagania mobilności
ALTER TABLE exercises ADD COLUMN mobility_requirements TEXT DEFAULT NULL;

-- Secondary muscles en/pl (JSON) - mięśnie pomocnicze wielojęzyczne
ALTER TABLE exercises ADD COLUMN secondary_muscles_en TEXT DEFAULT NULL;

ALTER TABLE exercises ADD COLUMN secondary_muscles_pl TEXT DEFAULT NULL;

-- ==========================================
-- TABELA DLA WŁASNYCH ĆWICZEŃ UŻYTKOWNIKA
-- ==========================================

CREATE TABLE IF NOT EXISTS user_custom_exercises (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  
  -- Podstawowe dane
  name_en VARCHAR(255) NOT NULL,
  name_pl VARCHAR(255) NOT NULL,
  
  -- Kategoryzacja
  primary_muscle VARCHAR(100) DEFAULT 'other',
  secondary_muscles TEXT DEFAULT NULL,
  pattern VARCHAR(50) DEFAULT 'accessory',
  equipment VARCHAR(100) DEFAULT 'body weight',
  
  -- Domyślne parametry treningowe
  sets_default INT DEFAULT 3,
  reps_default INT DEFAULT 10,
  
  -- Notatki
  notes TEXT DEFAULT NULL,
  
  -- Metadane
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- Klucze
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_custom_exercises_user (user_id),
  INDEX idx_user_custom_exercises_muscle (primary_muscle)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- INDEKSY DLA NOWYCH KOLUMN
-- ==========================================

CREATE INDEX idx_exercises_grip_type ON exercises(grip_type);
CREATE INDEX idx_exercises_force_type ON exercises(force_type);

-- Migracja zakończona
