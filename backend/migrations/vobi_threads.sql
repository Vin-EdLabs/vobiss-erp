-- Vobi personal assistant threads (one channel per user)
ALTER TABLE chat_channels
  ADD COLUMN IF NOT EXISTS vobi_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_chat_channels_vobi_user
  ON chat_channels(vobi_user_id)
  WHERE channel_type = 'vobi';
