-- Allow video_url to be NULL for pending/uploading generations
ALTER TABLE generations ALTER COLUMN video_url DROP NOT NULL;
