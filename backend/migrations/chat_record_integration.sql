-- Chat ↔ operational records integration

ALTER TABLE chat_channels
  ADD COLUMN IF NOT EXISTS record_type VARCHAR(40),
  ADD COLUMN IF NOT EXISTS record_id VARCHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_channels_record
  ON chat_channels (record_type, record_id)
  WHERE record_type IS NOT NULL AND record_id IS NOT NULL AND COALESCE(is_archived, false) = false;

ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS meta JSONB DEFAULT NULL;

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS chat_channel_id UUID REFERENCES chat_channels(id) ON DELETE SET NULL;

ALTER TABLE requests
  ADD COLUMN IF NOT EXISTS chat_channel_id UUID REFERENCES chat_channels(id) ON DELETE SET NULL;

ALTER TABLE project_requests
  ADD COLUMN IF NOT EXISTS chat_channel_id UUID REFERENCES chat_channels(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_chat_channel ON tickets(chat_channel_id);
CREATE INDEX IF NOT EXISTS idx_requests_chat_channel ON requests(chat_channel_id);
CREATE INDEX IF NOT EXISTS idx_project_requests_chat_channel ON project_requests(chat_channel_id);
