-- Create reference_images table to store user's custom character images
CREATE TABLE IF NOT EXISTS reference_images (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  image_url TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster user lookups
CREATE INDEX IF NOT EXISTS idx_reference_images_user_id ON reference_images(user_id);
