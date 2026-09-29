import { Router } from 'express';
import { db } from '../db/index.js';

export const statsRouter = Router();

/** Resumen global: la foto de conjunto del entrenamiento. */
statsRouter.get('/summary', (_req, res) => {
  const rounds = db
    .prepare(
      `SELECT COUNT(*)                AS rounds,
              COALESCE(SUM(net), 0)   AS net,
              COALESCE(SUM(bet), 0)   AS wagered,
              COALESCE(SUM(hands_played), 0) AS hands
         FROM rounds`,
    )
    .get() as any;

  const decisions = db
    .prepare(
      `SELECT COUNT(*)                     AS total,
              COALESCE(SUM(is_correct), 0) AS correct,
              COALESCE(AVG(ms_to_decide), 0) AS avg_ms
         FROM decisions`,
    )
    .get() as any;

  // Precision de las ultimas 100 decisiones: mide el nivel ACTUAL, no el historico.
  const recent = db
    .prepare(
      `SELECT COUNT(*) AS total, COALESCE(SUM(is_correct), 0) AS correct
         FROM (SELECT is_correct FROM decisions ORDER BY id DESC LIMIT 100)`,
    )
    .get() as any;

  const outcomes = db.prepare(`SELECT outcomes FROM rounds`).all() as Array<{ outcomes: string }>;
  const tally: Record<string, number> = {};
  for (const row of outcomes) {
    try {
      for (const o of JSON.parse(row.outcomes) as string[]) tally[o] = (tally[o] ?? 0) + 1;
    } catch {
      /* fila corrupta: se ignora */
    }
  }

  const sessions = db.prepare(`SELECT COUNT(*) AS n FROM sessions`).get() as any;

  res.json({
    sessions: sessions.n,
    rounds: rounds.rounds,
    hands: rounds.hands,
    net: rounds.net,
    wagered: rounds.wagered,
    // Ventaja real obtenida sobre el dinero apostado.
    edge: rounds.wagered > 0 ? rounds.net / rounds.wagered : 0,
    decisions: decisions.total,
    correct: decisions.correct,
    accuracy: decisions.total > 0 ? decisions.correct / decisions.total : 0,
    recentAccuracy: recent.total > 0 ? recent.correct / recent.total : 0,
    recentSample: recent.total,
    avgMs: decisions.avg_ms,
    outcomes: tally,
  });
});

/**
 * Curva de aprendizaje: precision agrupada en bloques consecutivos de decisiones.
 * Es la grafica que muestra si el juego se acerca de verdad al optimo.
 */
statsRouter.get('/progress', (req, res) => {
  const bucket = Math.max(10, Math.min(500, Number(req.query.bucket ?? 25)));
  const rows = db
    .prepare(
      `SELECT CAST((rn - 1) / CAST(? AS INTEGER) AS INTEGER) AS bucket,
              COUNT(*)     AS total,
              SUM(is_correct) AS correct,
              MIN(decided_at) AS from_at
         FROM (SELECT is_correct, decided_at, ROW_NUMBER() OVER (ORDER BY id) AS rn FROM decisions)
        GROUP BY bucket
        ORDER BY bucket`,
    )
    .all(bucket) as any[];

  res.json(
    rows.map((r) => ({
      bucket: r.bucket,
      from: r.bucket * bucket + 1,
      to: r.bucket * bucket + r.total,
      total: r.total,
      correct: r.correct,
      accuracy: r.correct / r.total,
      at: r.from_at,
    })),
  );
});

/** Evolucion del bankroll ronda a ronda. */
statsRouter.get('/bankroll', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT id, session_id AS sessionId, net, bankroll_after AS bankroll, played_at AS at
         FROM rounds ORDER BY id`,
    )
    .all();
  res.json(rows);
});

/** Precision por situacion: alimenta el mapa de calor de puntos debiles. */
statsRouter.get('/situations', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT situation_key AS key,
              hand_kind     AS kind,
              player_total  AS playerTotal,
              dealer_value  AS dealerValue,
              COUNT(*)      AS total,
              SUM(is_correct) AS correct,
              MAX(optimal)  AS optimal
         FROM decisions
        GROUP BY situation_key
        ORDER BY (CAST(SUM(is_correct) AS REAL) / COUNT(*)) ASC, total DESC`,
    )
    .all() as any[];
  res.json(rows.map((r) => ({ ...r, accuracy: r.correct / r.total })));
});

/** Errores mas frecuentes, con la jugada elegida frente a la correcta. */
statsRouter.get('/mistakes', (req, res) => {
  const limit = Math.max(1, Math.min(50, Number(req.query.limit ?? 10)));
  const rows = db
    .prepare(
      `SELECT situation_key AS key, chosen, optimal, COUNT(*) AS count
         FROM decisions
        WHERE is_correct = 0
        GROUP BY situation_key, chosen, optimal
        ORDER BY count DESC
        LIMIT ?`,
    )
    .all(limit);
  res.json(rows);
});

/** Borra todo el historial. Pensado para empezar un entrenamiento limpio. */
statsRouter.delete('/', (_req, res) => {
  db.exec('DELETE FROM decisions; DELETE FROM rounds; DELETE FROM sessions;');
  res.json({ ok: true });
});
