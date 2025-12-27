#!/usr/bin/env sqlite3
-- Manual migration script for swarm-mail.db
-- Initializes empty swarm-mail database with required schema
-- Run with: sqlite3 ~/.config/swarm-tools/swarm-mail.db < migrate-swarmmail.sql

-- Hive cells table (mirrors beads table from swarm.db)
CREATE TABLE IF NOT EXISTS hive_cells (
  id TEXT PRIMARY KEY,
  project_key TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('bug', 'feature', 'task', 'epic', 'chore')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'blocked', 'closed')),
  title TEXT NOT NULL CHECK (length(title) <= 500),
  description TEXT,
  priority INTEGER NOT NULL DEFAULT 2 CHECK (priority BETWEEN 0 AND 3),
  parent_id TEXT REFERENCES hive_cells(id) ON DELETE SET NULL,
  assignee TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  closed_at INTEGER,
  closed_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_hive_cells_project ON hive_cells(project_key);
CREATE INDEX IF NOT EXISTS idx_hive_cells_status ON hive_cells(status);
CREATE INDEX IF NOT EXISTS idx_hive_cells_type ON hive_cells(type);
CREATE INDEX IF NOT EXISTS idx_hive_cells_priority ON hive_cells(priority);
CREATE INDEX IF NOT EXISTS idx_hive_cells_parent ON hive_cells(parent_id);
CREATE INDEX IF NOT EXISTS idx_hive_cells_created ON hive_cells(created_at);

-- Hive events table (event sourcing for cells)
CREATE TABLE IF NOT EXISTS hive_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cell_id TEXT NOT NULL REFERENCES hive_cells(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_data TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_hive_events_cell ON hive_events(cell_id);
CREATE INDEX IF NOT EXISTS idx_hive_events_created ON hive_events(created_at DESC);

-- Hive messages table (Swarm Mail inter-agent communication)
CREATE TABLE IF NOT EXISTS hive_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_key TEXT NOT NULL,
  from_agent TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  thread_id TEXT,
  importance TEXT DEFAULT 'normal' CHECK (importance IN ('low', 'normal', 'high', 'urgent')),
  ack_required INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_hive_messages_project ON hive_messages(project_key);
CREATE INDEX IF NOT EXISTS idx_hive_messages_thread ON hive_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_hive_messages_created ON hive_messages(created_at DESC);

-- Hive message recipients (for multi-agent messages)
CREATE TABLE IF NOT EXISTS hive_message_recipients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NOT NULL REFERENCES hive_messages(id) ON DELETE CASCADE,
  to_agent TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_hive_message_recipients_message ON hive_message_recipients(message_id);
CREATE INDEX IF NOT EXISTS idx_hive_message_recipients_to_agent ON hive_message_recipients(to_agent);

-- Hive reservations table (file locking for parallel workers)
CREATE TABLE IF NOT EXISTS hive_reservations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_key TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  path_pattern TEXT NOT NULL,
  exclusive INTEGER DEFAULT 1,
  reason TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  released_at INTEGER,
  lock_holder_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_hive_reservations_file ON hive_reservations(path_pattern);
CREATE INDEX IF NOT EXISTS idx_hive_reservations_agent ON hive_reservations(agent_name);
CREATE INDEX IF NOT EXISTS idx_hive_reservations_expires ON hive_reservations(expires_at);

-- Schema version for future migrations
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO schema_version (version, applied_at) VALUES (1, strftime('%s', 'now'));
