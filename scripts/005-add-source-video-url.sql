-- Add source_video_url column to store the original recorded video
ALTER TABLE generations ADD COLUMN IF NOT EXISTS source_video_url TEXT;
