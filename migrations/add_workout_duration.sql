-- Migration: Add duration tracking to workout_logs
-- Run: mysql -u gofi_user -p gofi_db < migrations/add_workout_duration.sql

ALTER TABLE workout_logs 
ADD COLUMN duration_seconds INT DEFAULT NULL COMMENT 'Total workout duration in seconds',
ADD COLUMN rest_time_seconds INT DEFAULT NULL COMMENT 'Total rest time in seconds';

-- Example: A 45 minute workout with 10 minutes rest
-- duration_seconds = 2700
-- rest_time_seconds = 600
