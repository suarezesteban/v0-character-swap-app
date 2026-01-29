-- Add aspect_ratio column to generations table
ALTER TABLE generations ADD COLUMN IF NOT EXISTS aspect_ratio TEXT DEFAULT 'fill';

-- Update existing generations to have a default aspect ratio
UPDATE generations SET aspect_ratio = 'fill' WHERE aspect_ratio IS NULL;
