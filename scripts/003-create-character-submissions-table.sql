CREATE TABLE IF NOT EXISTS character_submissions (
  id SERIAL PRIMARY KEY,
  image_url TEXT NOT NULL,
  suggested_name TEXT,
  suggested_category TEXT,
  user_id TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW()
);
