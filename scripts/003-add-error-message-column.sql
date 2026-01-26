-- Add error_message column to generations table
ALTER TABLE generations 
ADD COLUMN IF NOT EXISTS error_message TEXT;
