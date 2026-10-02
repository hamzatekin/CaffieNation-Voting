-- Applied to production on 2026-10-02. Makes ratings nullable ("didn't try"),
-- adds the bean preference column, and moves the first demo's votes from the
-- default "coffee-machine" slug to "avari-b20".
CREATE TABLE votes_new (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  machine    TEXT    NOT NULL,
  voter_id   TEXT    NOT NULL,
  taste      INTEGER CHECK (taste    BETWEEN 1 AND 5),
  milk       INTEGER CHECK (milk     BETWEEN 1 AND 5),
  ease       INTEGER CHECK (ease     BETWEEN 1 AND 5),
  speed      INTEGER CHECK (speed    BETWEEN 1 AND 5),
  cleaning   INTEGER CHECK (cleaning BETWEEN 1 AND 5),
  overall    INTEGER CHECK (overall  BETWEEN 1 AND 5),
  happy      TEXT    NOT NULL CHECK (happy IN ('no', 'okay', 'yes')),
  beans      TEXT    CHECK (beans IN ('red', 'black', 'any')),
  comment    TEXT,
  ip_hash    TEXT,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (machine, voter_id)
);
INSERT INTO votes_new (id, machine, voter_id, taste, milk, ease, speed, cleaning, overall, happy, comment, ip_hash, created_at)
  SELECT id, machine, voter_id, taste, milk, ease, speed, cleaning, overall, happy, comment, ip_hash, created_at FROM votes;
DROP TABLE votes;
ALTER TABLE votes_new RENAME TO votes;
CREATE INDEX IF NOT EXISTS votes_machine_ip ON votes (machine, ip_hash);
UPDATE votes SET machine = 'avari-b20' WHERE machine = 'coffee-machine';
