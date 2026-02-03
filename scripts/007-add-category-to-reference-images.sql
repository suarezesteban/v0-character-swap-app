-- Add category column to reference_images table
ALTER TABLE reference_images ADD COLUMN IF NOT EXISTS category TEXT;
