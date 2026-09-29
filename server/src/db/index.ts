import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** Ubicacion del fichero SQLite. Configurable por si se quiere mover fuera del repo. */
const DB_PATH = process.env.BJ_DB_PATH ?? join(here, '..', '..', 'data', 'blackjack.sqlite');

mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// El esquema vive junto al fuente en dev y junto al build en produccion.
function loadSchema(): string {
  for (const candidate of [join(here, 'schema.sql'), join(here, '..', '..', 'src', 'db', 'schema.sql')]) {
    try {
      return readFileSync(candidate, 'utf8');
    } catch {
      /* siguiente candidato */
    }
  }
  throw new Error('No se encuentra schema.sql');
}

db.exec(loadSchema());

export type SqliteDb = typeof db;
