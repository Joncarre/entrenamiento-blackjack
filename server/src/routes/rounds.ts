import { Router } from 'express';
import { db } from '../db/index.js';

export const roundsRouter = Router();

const insertRound = db.prepare(`
  INSERT INTO rounds (session_id, bet, net, bankroll_after, dealer_upcard, dealer_final,
                      hands_played, outcomes, decisions, correct)
  VALUES (@session_id, @bet, @net, @bankroll_after, @dealer_upcard, @dealer_final,
          @hands_played, @outcomes, @decisions, @correct)
`);

const insertDecision = db.prepare(`
  INSERT INTO decisions (session_id, round_id, situation_key, hand_kind, player_total,
                         dealer_value, chosen, optimal, is_correct, ms_to_decide, mode)
  VALUES (@session_id, @round_id, @situation_key, @hand_kind, @player_total,
          @dealer_value, @chosen, @optimal, @is_correct, @ms_to_decide, @mode)
`);

/**
 * Guarda una ronda completa junto con sus decisiones en una sola transaccion,
 * para que las estadisticas nunca queden a medias.
 */
const saveRound = db.transaction((payload: any) => {
  const decisions = Array.isArray(payload.decisions) ? payload.decisions : [];
  const correct = decisions.filter((d: any) => d.isCorrect).length;

  const info = insertRound.run({
    session_id: payload.sessionId,
    bet: Number(payload.bet ?? 0),
    net: Number(payload.net ?? 0),
    bankroll_after: Number(payload.bankrollAfter ?? 0),
    dealer_upcard: String(payload.dealerUpcard ?? ''),
    dealer_final: Number(payload.dealerFinal ?? 0),
    hands_played: Number(payload.handsPlayed ?? 1),
    outcomes: JSON.stringify(payload.outcomes ?? []),
    decisions: decisions.length,
    correct,
  });

  const roundId = Number(info.lastInsertRowid);
  for (const d of decisions) {
    insertDecision.run({
      session_id: payload.sessionId,
      round_id: roundId,
      situation_key: d.situationKey,
      hand_kind: d.handKind,
      player_total: Number(d.playerTotal ?? 0),
      dealer_value: Number(d.dealerValue ?? 0),
      chosen: d.chosen,
      optimal: d.optimal,
      is_correct: d.isCorrect ? 1 : 0,
      ms_to_decide: d.msToDecide ?? null,
      mode: d.mode ?? 'game',
    });
  }
  return roundId;
});

roundsRouter.post('/', (req, res) => {
  if (!req.body?.sessionId) return res.status(400).json({ error: 'Falta sessionId' });
  const id = saveRound(req.body);
  return res.status(201).json({ id });
});

/** Decisiones sueltas del modo Drill (no pertenecen a una ronda jugada). */
roundsRouter.post('/decisions', (req, res) => {
  const list = Array.isArray(req.body?.decisions) ? req.body.decisions : [];
  if (!req.body?.sessionId) return res.status(400).json({ error: 'Falta sessionId' });
  const tx = db.transaction(() => {
    for (const d of list) {
      insertDecision.run({
        session_id: req.body.sessionId,
        round_id: null,
        situation_key: d.situationKey,
        hand_kind: d.handKind,
        player_total: Number(d.playerTotal ?? 0),
        dealer_value: Number(d.dealerValue ?? 0),
        chosen: d.chosen,
        optimal: d.optimal,
        is_correct: d.isCorrect ? 1 : 0,
        ms_to_decide: d.msToDecide ?? null,
        mode: d.mode ?? 'drill',
      });
    }
  });
  tx();
  return res.status(201).json({ saved: list.length });
});
