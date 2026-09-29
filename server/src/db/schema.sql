PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- Una sesion = una tanda de entrenamiento con una configuracion concreta.
CREATE TABLE IF NOT EXISTS sessions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  ended_at        TEXT,
  mode            TEXT    NOT NULL DEFAULT 'game',   -- 'game' | 'drill'
  decks           INTEGER NOT NULL,
  dealer_h17      INTEGER NOT NULL,
  das             INTEGER NOT NULL,
  late_surrender  INTEGER NOT NULL,
  blackjack_payout REAL   NOT NULL DEFAULT 1.5,
  starting_bankroll REAL  NOT NULL,
  base_bet        REAL    NOT NULL,
  assist_mode     TEXT    NOT NULL DEFAULT 'feedback' -- 'off' | 'feedback' | 'hint'
);

-- Una ronda jugada completa.
CREATE TABLE IF NOT EXISTS rounds (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id    INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  played_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  bet           REAL    NOT NULL,
  net           REAL    NOT NULL,   -- ganancia/perdida neta de la ronda
  bankroll_after REAL   NOT NULL,
  dealer_upcard TEXT    NOT NULL,
  dealer_final  INTEGER NOT NULL,
  hands_played  INTEGER NOT NULL DEFAULT 1,
  outcomes      TEXT    NOT NULL,   -- JSON: ["win","bust"]
  decisions     INTEGER NOT NULL DEFAULT 0,
  correct       INTEGER NOT NULL DEFAULT 0
);

-- Cada decision individual del jugador: la unidad de medida del entrenamiento.
CREATE TABLE IF NOT EXISTS decisions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id     INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  round_id       INTEGER REFERENCES rounds(id) ON DELETE CASCADE,
  decided_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  situation_key  TEXT    NOT NULL,  -- 'H16v10', 'S18v3', 'P8v11'
  hand_kind      TEXT    NOT NULL,  -- 'hard' | 'soft' | 'pair'
  player_total   INTEGER NOT NULL,
  dealer_value   INTEGER NOT NULL,
  chosen         TEXT    NOT NULL,
  optimal        TEXT    NOT NULL,
  is_correct     INTEGER NOT NULL,
  ms_to_decide   INTEGER,
  mode           TEXT    NOT NULL DEFAULT 'game'
);

CREATE INDEX IF NOT EXISTS idx_rounds_session   ON rounds(session_id);
CREATE INDEX IF NOT EXISTS idx_decisions_session ON decisions(session_id);
CREATE INDEX IF NOT EXISTS idx_decisions_key     ON decisions(situation_key);
CREATE INDEX IF NOT EXISTS idx_decisions_time    ON decisions(decided_at);
