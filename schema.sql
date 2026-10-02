-- One row per vote. UNIQUE(machine, voter_id) is what stops the same
-- device from voting twice for the same machine.
CREATE TABLE IF NOT EXISTS votes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  machine    TEXT    NOT NULL,
  voter_id   TEXT    NOT NULL,
  taste      INTEGER NOT NULL CHECK (taste    BETWEEN 1 AND 5),
  milk       INTEGER NOT NULL CHECK (milk     BETWEEN 1 AND 5),
  ease       INTEGER NOT NULL CHECK (ease     BETWEEN 1 AND 5),
  speed      INTEGER NOT NULL CHECK (speed    BETWEEN 1 AND 5),
  cleaning   INTEGER NOT NULL CHECK (cleaning BETWEEN 1 AND 5),
  overall    INTEGER NOT NULL CHECK (overall  BETWEEN 1 AND 5),
  happy      TEXT    NOT NULL CHECK (happy IN ('no', 'okay', 'yes')),
  comment    TEXT,
  ip_hash    TEXT,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (machine, voter_id)
);

CREATE INDEX IF NOT EXISTS votes_machine_ip ON votes (machine, ip_hash);

-- Holds the admin password hash (see isAdmin in src/worker.js).
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
