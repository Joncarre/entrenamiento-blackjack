import { Router } from 'express';
import { db } from '../db/index.js';

export const sessionsRouter = Router();

const insertSession = db.prepare(`
  INSERT INTO sessions (mode, decks, dealer_h17, das, late_surrender, blackjack_payout,
                        starting_bankroll, base_bet, assist_mode)
  VALUES (@mode, @decks, @dealer_h17, @das, @late_surrender, @blackjack_payout,
          @starting_bankroll, @base_bet, @assist_mode)
`);

sessionsRouter.post('/', (req, res) => {
  const b = req.body ?? {};
  const info = insertSession.run({
    mode: b.mode ?? 'game',
    decks: Number(b.decks ?? 6),
    dealer_h17: b.dealerHitsSoft17 ? 1 : 0,
    das: b.doubleAfterSplit === false ? 0 : 1,
    late_surrender: b.lateSurrender === false ? 0 : 1,
    blackjack_payout: Number(b.blackjackPayout ?? 1.5),
    starting_bankroll: Number(b.bankroll ?? 100),
    base_bet: Number(b.baseBet ?? 5),
    assist_mode: b.assistMode ?? 'feedback',
  });
  res.status(201).json({ id: Number(info.lastInsertRowid) });
});

sessionsRouter.patch('/:id/close', (req, res) => {
  db.prepare(`UPDATE sessions SET ended_at = datetime('now') WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});

sessionsRouter.get('/', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT s.*,
              (SELECT COUNT(*) FROM rounds r WHERE r.session_id = s.id)    AS rounds,
              (SELECT COALESCE(SUM(r.net), 0) FROM rounds r WHERE r.session_id = s.id) AS net,
              (SELECT COUNT(*) FROM decisions d WHERE d.session_id = s.id) AS decisions,
              (SELECT COALESCE(SUM(d.is_correct), 0) FROM decisions d WHERE d.session_id = s.id) AS correct
         FROM sessions s
        ORDER BY s.id DESC
        LIMIT 50`,
    )
    .all();
  res.json(rows);
});
