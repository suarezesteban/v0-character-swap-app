-- Create character_usage table to track popularity
CREATE TABLE IF NOT EXISTS character_usage (
  character_id TEXT PRIMARY KEY,
  usage_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for sorting by popularity
CREATE INDEX IF NOT EXISTS idx_character_usage_count ON character_usage(usage_count DESC);
