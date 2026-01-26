-- Add run_id column to track fal job ID
ALTER TABLE generations ADD COLUMN IF NOT EXISTS run_id VARCHAR(255);

-- Add cancelled status if not exists (alter check constraint)
-- Note: PostgreSQL doesn't support ALTER CHECK directly, so we handle this in app code
