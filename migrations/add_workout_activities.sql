-- Migration: Add workout_activities table for detailed time tracking
-- Run: mysql -u gofi_user -p gofi_db < migrations/add_workout_activities.sql

-- Workout sessions (parent table for grouping activities)
CREATE TABLE IF NOT EXISTS workout_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    status ENUM('in_progress', 'completed', 'abandoned') DEFAULT 'in_progress',
    started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME NULL,
    total_duration_seconds INT DEFAULT 0,
    plan_name VARCHAR(255) NULL,
    notes TEXT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_user_status (user_id, status),
    INDEX idx_user_date (user_id, started_at)
);

-- Individual activities within a workout session
CREATE TABLE IF NOT EXISTS workout_activities (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id INT NOT NULL,
    user_id INT NOT NULL,
    activity_type ENUM('preparation', 'training', 'rest', 'cooldown') NOT NULL,
    start_time DATETIME NOT NULL,
    end_time DATETIME NULL,
    duration_seconds INT DEFAULT 0,
    is_active BOOLEAN DEFAULT FALSE,
    metadata JSON NULL COMMENT 'Additional data like exercise_code for training phases',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (session_id) REFERENCES workout_sessions(id) ON DELETE CASCADE,
    INDEX idx_session (session_id),
    INDEX idx_user_active (user_id, is_active),
    INDEX idx_activity_type (activity_type)
);

-- View for easy statistics
CREATE OR REPLACE VIEW workout_stats_daily AS
SELECT 
    user_id,
    DATE(start_time) as workout_date,
    activity_type,
    SUM(duration_seconds) as total_seconds,
    COUNT(*) as activity_count
FROM workout_activities
WHERE end_time IS NOT NULL
GROUP BY user_id, DATE(start_time), activity_type;

-- View for weekly summary
CREATE OR REPLACE VIEW workout_stats_weekly AS
SELECT 
    user_id,
    YEARWEEK(start_time, 1) as year_week,
    activity_type,
    SUM(duration_seconds) as total_seconds,
    COUNT(DISTINCT DATE(start_time)) as workout_days
FROM workout_activities
WHERE end_time IS NOT NULL
GROUP BY user_id, YEARWEEK(start_time, 1), activity_type;
