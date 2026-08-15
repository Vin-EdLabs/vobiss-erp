-- Forward message support
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS forwarded_from UUID
    REFERENCES chat_messages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_chat_messages_forwarded_from
  ON chat_messages(forwarded_from)
  WHERE forwarded_from IS NOT NULL;
