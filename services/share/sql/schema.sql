-- Current initial schema. Run once on an empty, independently provisioned D1.
PRAGMA foreign_keys = ON;

CREATE TABLE service_capacity (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  held_bytes INTEGER NOT NULL DEFAULT 0 CHECK (held_bytes >= 0)
) STRICT;
INSERT INTO service_capacity (id, held_bytes) VALUES (1, 0);

CREATE TABLE shares (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE,
  ip_key TEXT NOT NULL,
  management_hash TEXT NOT NULL,
  file_name TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  sha256 TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('reserved', 'uploading', 'active', 'retired')),
  created_at INTEGER NOT NULL,
  reservation_until INTEGER NOT NULL CHECK (reservation_until > created_at),
  expires_at INTEGER,
  retired_at INTEGER,
  cleanup_after INTEGER NOT NULL DEFAULT 0,
  cleanup_attempts INTEGER NOT NULL DEFAULT 0 CHECK (cleanup_attempts >= 0),
  cleanup_mode TEXT NOT NULL DEFAULT 'delete' CHECK (cleanup_mode IN ('delete', 'fence')),
  storage_released INTEGER NOT NULL DEFAULT 0 CHECK (storage_released IN (0, 1)),
  released_at INTEGER,
  CHECK (state <> 'active' OR expires_at IS NOT NULL),
  CHECK (state <> 'retired' OR retired_at IS NOT NULL),
  CHECK (storage_released = 0 OR (state = 'retired' AND released_at IS NOT NULL))
) STRICT;

CREATE INDEX shares_ip_capacity ON shares (ip_key, state, expires_at, reservation_until);
CREATE INDEX shares_ip_rate ON shares (ip_key, created_at);
CREATE INDEX shares_expiry ON shares (state, expires_at, reservation_until);
CREATE INDEX shares_cleanup ON shares (state, storage_released, cleanup_after);
CREATE INDEX shares_retention ON shares (storage_released, released_at);

CREATE TRIGGER forbid_identity_changes BEFORE UPDATE OF
  id, request_id, ip_key, management_hash, file_name, size_bytes, sha256, created_at, reservation_until
ON shares BEGIN
  SELECT RAISE(ABORT, 'share_identity_and_payload_are_immutable');
END;

CREATE TRIGGER enforce_state_transitions BEFORE UPDATE OF state ON shares
WHEN NOT (
  OLD.state = NEW.state OR
  (OLD.state = 'reserved' AND NEW.state IN ('uploading', 'retired')) OR
  (OLD.state = 'uploading' AND NEW.state IN ('active', 'retired')) OR
  (OLD.state = 'active' AND NEW.state = 'retired')
) BEGIN
  SELECT RAISE(ABORT, 'invalid_share_state_transition');
END;

CREATE TRIGGER preserve_retirement_fence BEFORE UPDATE OF cleanup_mode ON shares
WHEN OLD.state = 'retired' AND OLD.cleanup_mode <> NEW.cleanup_mode BEGIN
  SELECT RAISE(ABORT, 'retirement_cleanup_mode_is_final');
END;

-- Every admitted reservation holds physical capacity until its R2 deletion or
-- write fence is acknowledged, including expired uploads and failed requests.
CREATE TRIGGER hold_storage AFTER INSERT ON shares BEGIN
  UPDATE service_capacity SET held_bytes = held_bytes + NEW.size_bytes WHERE id = 1;
END;

CREATE TRIGGER release_storage AFTER UPDATE OF storage_released ON shares
WHEN OLD.storage_released = 0 AND NEW.storage_released = 1 BEGIN
  UPDATE service_capacity SET held_bytes = held_bytes - OLD.size_bytes WHERE id = 1;
END;

CREATE TRIGGER forbid_storage_reacquisition BEFORE UPDATE OF storage_released ON shares
WHEN OLD.storage_released = 1 AND NEW.storage_released = 0 BEGIN
  SELECT RAISE(ABORT, 'released_storage_is_final');
END;

CREATE TRIGGER forbid_unreleased_delete BEFORE DELETE ON shares
WHEN OLD.storage_released = 0 BEGIN
  SELECT RAISE(ABORT, 'storage_must_be_released_before_record_deletion');
END;
