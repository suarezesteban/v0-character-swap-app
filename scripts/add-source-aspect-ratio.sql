-- Add source_video_aspect_ratio column to store the aspect ratio of the original recorded video
-- This is separate from aspect_ratio which stores the generated video's aspect ratio (from character image)

ALTER TABLE generations 
ADD COLUMN IF NOT EXISTS source_video_aspect_ratio VARCHAR(10) DEFAULT 'fill';

-- Add comment for clarity
COMMENT ON COLUMN generations.source_video_aspect_ratio IS 'Aspect ratio of the original source/recorded video (9:16, 16:9, or fill)';
COMMENT ON COLUMN generations.aspect_ratio IS 'Aspect ratio of the generated video (from character image)';
