-- Vobiss Community Chat schema
-- Run against the vobiss PostgreSQL database (requires pgcrypto for gen_random_uuid)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS chat_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  channel_type VARCHAR(20) DEFAULT 'department',
  unit_id INTEGER,
  created_by INTEGER,
  is_archived BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS channel_members (
  channel_id UUID REFERENCES chat_channels(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL,
  role VARCHAR(20) DEFAULT 'member',
  last_read_at TIMESTAMP DEFAULT NOW(),
  joined_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (channel_id, user_id)
);

CREATE TABLE IF NOT EXISTS dm_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dm_participants (
  dm_id UUID REFERENCES dm_conversations(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL,
  last_read_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (dm_id, user_id)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID REFERENCES chat_channels(id) ON DELETE CASCADE,
  dm_id UUID REFERENCES dm_conversations(id) ON DELETE CASCADE,
  sender_id INTEGER,
  body TEXT NOT NULL,
  message_type VARCHAR(20) DEFAULT 'user',
  reply_to UUID REFERENCES chat_messages(id),
  forwarded_from UUID REFERENCES chat_messages(id) ON DELETE SET NULL,
  edited_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  CHECK (
    (channel_id IS NOT NULL AND dm_id IS NULL) OR
    (dm_id IS NOT NULL AND channel_id IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS message_reactions (
  message_id UUID REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL,
  emoji VARCHAR(10) NOT NULL,
  PRIMARY KEY (message_id, user_id, emoji)
);

CREATE TABLE IF NOT EXISTS chat_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID REFERENCES chat_messages(id) ON DELETE CASCADE,
  file_name VARCHAR(255),
  file_url TEXT,
  file_size INTEGER,
  mime_type VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS message_mentions (
  message_id UUID REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL,
  PRIMARY KEY (message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_channel ON chat_messages(channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_dm ON chat_messages(dm_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_channel_members_user ON channel_members(user_id);

CREATE TABLE IF NOT EXISTS message_pins (
  message_id UUID PRIMARY KEY REFERENCES chat_messages(id) ON DELETE CASCADE,
  channel_id UUID REFERENCES chat_channels(id) ON DELETE CASCADE,
  dm_id UUID REFERENCES dm_conversations(id) ON DELETE CASCADE,
  pinned_by INTEGER NOT NULL,
  pinned_at TIMESTAMP DEFAULT NOW(),
  CHECK (
    (channel_id IS NOT NULL AND dm_id IS NULL) OR
    (dm_id IS NOT NULL AND channel_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_message_pins_channel ON message_pins(channel_id, pinned_at DESC);
CREATE INDEX IF NOT EXISTS idx_message_pins_dm ON message_pins(dm_id, pinned_at DESC);

CREATE TABLE IF NOT EXISTS chat_bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (user_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_bookmarks_user
  ON chat_bookmarks(user_id, created_at DESC);
