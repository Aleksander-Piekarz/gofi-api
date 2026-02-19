-- Add updated_at column to plans table
-- Run in MySQL Workbench or via mysql command

ALTER TABLE plans 
ADD COLUMN updated_at TIMESTAMP NULL DEFAULT NULL;

-- Optional: Set updated_at to created_at for existing rows
UPDATE plans SET updated_at = created_at WHERE updated_at IS NULL;
