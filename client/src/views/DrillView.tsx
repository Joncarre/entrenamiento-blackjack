import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HandView } from '../components/HandView';
import { evaluate, strategyRank } from '../engine/cards';
import type { Card, Rank } from '../engine/types';
import { api, type DecisionPayload, type SituationStat } from '../lib/api';
import { actionLabel, getAdvice, type HandAction, type LegalActions, type StrategyAdvice } from '../strategy';
import { useGame } from '../store/useGame';

type Focus = 'all' | 'hard' | 'soft' | 'pairs' | 'weak';

const FOCUS_LABEL: Record<Focus, string> = {
  all: 'Todo',
  hard: 'Duros',
  soft: 'Blandos',
  pairs: 'Parejas',
  weak: 'Mis fallos',
};

/** Inicial de cada jugada: es el atajo de teclado y su simbolo en la tabla. */
const INITIAL: Record<HandAction, string> = {
  hit: 'P',
  stand: 'Q',
  double: 'D',
  split: 'S',
  surrender: 'R',
};

const SUITS = ['S', 'H', 'D', 'C'] as const;
let uid = 0;
const card = (rank: Rank): Card => ({
  id: `d${uid++}`,
  rank,
  suit: SUITS[Math.floor(Math.random() * 4)],
});

const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

/** Rangos que valen 10, para que salgan figuras variadas y no siempre el 10. */
const TENS: Rank[] = ['T', 'J', 'Q', 'K'];
const rankFor = (value: number): Rank => (value === 10 ? pick(TENS) : (String(value) as Rank));

interface Situation {
  player: Card[];
  dealer: Card;
  kind: 'hard' | 'soft' | 'pair';
}

/** Construye una mano concreta que produzca el total pedido. */
function buildHard(total: number): Card[] {
  const options: Array<[number, number]> = [];
  for (let a = 2; a <= 10; a += 1) {
    const b = total - a;
    // Se evita el par: esa situacion pertenece a la tabla de parejas.
    if (b >= 2 && b <= 10 && a !== b) options.push([a, b]);
  }
  if (options.length > 0) {
    const [a, b] = pick(options);
    return [card(rankFor(a)), card(rankFor(b))];
  }
  // Totales que no salen con dos cartas distintas (5, 20): se usan tres.
  for (let a = 2; a <= 10; a += 1) {
    for (let b = 2; b <= 10; b += 1) {
      const c = total - a - b;
      if (c >= 2 && c <= 10) return [card(rankFor(a)), card(rankFor(b)), card(rankFor(c))];
    }
  }
  return [card('T'), card(rankFor(total - 10))];
}

function randomSituation(focus: Focus, weakKeys: string[]): Situation {
  const dealerValue = 2 + Math.floor(Math.random() * 10); // 2..11
  const dealer = card(dealerValue === 11 ? 'A' : rankFor(dealerValue));

  if (focus === 'weak' && weakKeys.length > 0) {
    const key = pick(weakKeys);
    const m = /^([HSP])(\d+)v(\d+|A)$/.exec(key);
    if (m) {
      const [, kind, totalStr, d] = m;
      const dv = d === 'A' ? 11 : Number(d);
      const dcard = card(dv === 11 ? 'A' : rankFor(dv));
      const total = Number(totalStr);
      if (kind === 'S') return { player: [card('A'), card(rankFor(total - 11))], dealer: dcard, kind: 'soft' };
      if (kind === 'P') {
        const r = total === 11 ? 'A' : rankFor(total);
        return { player: [card(r), card(total === 10 ? pick(TENS) : r)], dealer: dcard, kind: 'pair' };
      }
      return { player: buildHard(total), dealer: dcard, kind: 'hard' };
    }
  }

  const kinds: Array<'hard' | 'soft' | 'pair'> =
    focus === 'hard' ? ['hard'] : focus === 'soft' ? ['soft'] : focus === 'pairs' ? ['pair'] : ['hard', 'hard', 'soft', 'pair'];
  const kind = pick(kinds);

  if (kind === 'soft') {
    const second = 2 + Math.floor(Math.random() * 8); // A,2 .. A,9
    return { player: [card('A'), card(rankFor(second))], dealer, kind };
  }
  if (kind === 'pair') {
    const v = 2 + Math.floor(Math.random() * 10); // 2..11
    const r = v === 11 ? 'A' : rankFor(v);
    return { player: [card(r), card(v === 10 ? pick(TENS) : r)], dealer, kind };
  }
  const total = 5 + Math.floor(Math.random() * 13); // 5..17
  return { player: buildHard(total), dealer, kind };
}

/**
 * Entrenamiento por repeticion: solo la decision, sin resolver la mano.
 * Multiplica por cinco o mas las situaciones vistas por minuto frente a la mesa.
 */
export function DrillView() {
  const rules = useGame((s) => s.settings.rules);
  const sessionId = useGame((s) => s.sessionId);
  const [focus, setFocus] = useState<Focus>('all');
  const [weakKeys, setWeakKeys] = useState<string[]>([]);
  const [situation, setSituation] = useState<Situation | null>(null);
  const [answered, setAnswered] = useState<{ chosen: HandAction; correct: boolean } | null>(null);
  const [score, setScore] = useState({ total: 0, correct: 0, streak: 0, best: 0 });
  const startedAt = useRef(Date.now());
  const pending = useRef<DecisionPayload[]>([]);

  const legal: LegalActions = useMemo(() => {
    if (!situation) return { hit: false, stand: false, double: false, split: false, surrender: false };
    const isPair = strategyRank(situation.player[0].rank) === strategyRank(situation.player[1]?.rank ?? 'A');
    const fresh = situation.player.length === 2;
    return {
      hit: true,
      stand: true,
      double: fresh,
      split: fresh && isPair,
      surrender: fresh && rules.lateSurrender,
    };
  }, [situation, rules.lateSurrender]);

  const advice: StrategyAdvice | null = useMemo(
    () => (situation ? getAdvice(situation.player, situation.dealer, rules, legal) : null),
    [situation, rules, legal],
  );

  const next = useCallback(() => {
    setAnswered(null);
    setSituation(randomSituation(focus, weakKeys));
    startedAt.current = Date.now();
  }, [focus, weakKeys]);

  useEffect(() => {
    void api.situations().then((rows: SituationStat[] | null) => {
      if (rows) setWeakKeys(rows.filter((r) => r.total >= 2 && r.accuracy < 0.9).map((r) => r.key));
    });
  }, []);

  useEffect(() => {
    next();
  }, [next]);

  // Las decisiones se agrupan y se envian en lotes para no saturar la red.
  const flush = useCallback(() => {
    if (sessionId === null || pending.current.length === 0) return;
    const batch = pending.current;
    pending.current = [];
    void api.saveDecisions(sessionId, batch);
  }, [sessionId]);

  useEffect(() => {
    const t = setInterval(flush, 8000);
    return () => {
      clearInterval(t);
      flush();
    };
  }, [flush]);

  const answer = useCallback(
    (action: HandAction) => {
      if (!situation || !advice || answered) return;
      const correct = action === advice.action;
      pending.current.push({
        situationKey: advice.situationKey,
        handKind: situation.kind,
        playerTotal: evaluate(situation.player).total,
        dealerValue: strategyRank(situation.dealer.rank),
        chosen: action,
        optimal: advice.action,
        isCorrect: correct,
        msToDecide: Date.now() - startedAt.current,
        mode: 'drill',
      });
      if (pending.current.length >= 20) flush();

      setAnswered({ chosen: action, correct });
      setScore((s) => {
        const streak = correct ? s.streak + 1 : 0;
        return {
          total: s.total + 1,
          correct: s.correct + (correct ? 1 : 0),
          streak,
          best: Math.max(s.best, streak),
        };
      });
      // Un acierto encadena rapido; un fallo deja tiempo para leer la correccion.
      setTimeout(next, correct ? 620 : 2300);
    },
    [situation, advice, answered, next, flush],
  );

  useEffect(() => {
    const keys: Record<string, HandAction> = { p: 'hit', q: 'stand', d: 'double', s: 'split', r: 'surrender' };
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /input|select|textarea/i.test(target.tagName)) return;
      const action = keys[e.key.toLowerCase()];
      if (action && legal[action]) {
        e.preventDefault();
        answer(action);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [answer, legal]);

  const accuracy = score.total > 0 ? score.correct / score.total : 0;

  return (
    <div className="page page--drill">
      <header className="page__head">
        <div>
          <h1 className="page__title">Entrenamiento rapido</h1>
          <p className="page__sub">
            Solo la decision, sin repartir la mano entera. La via mas rapida para memorizar la tabla.
          </p>
        </div>
      </header>

      <div className="drill__focus">
        <div className="segmented">
          {(Object.keys(FOCUS_LABEL) as Focus[]).map((f) => (
            <button
              key={f}
              className={`segmented__opt${focus === f ? ' is-on' : ''}`}
              onClick={() => setFocus(f)}
              disabled={f === 'weak' && weakKeys.length === 0}
              title={f === 'weak' && weakKeys.length === 0 ? 'Aun no hay fallos registrados' : undefined}
            >
              {FOCUS_LABEL[f]}
            </button>
          ))}
        </div>
        <div className="drill__score num">
          <span className={accuracy >= 0.9 ? 'delta-good' : ''}>
            {score.total > 0 ? `${(accuracy * 100).toFixed(0)}%` : '--'}
          </span>
          <small>
            {score.correct}/{score.total} · racha {score.streak}
            {score.best > 0 ? ` (max ${score.best})` : ''}
          </small>
        </div>
      </div>

      <div className="drill__board">
        <div className="drill__side">
          <span className="drill__caption">Crupier</span>
          {situation && <HandView cards={[situation.dealer]} instant />}
        </div>
        <div className="drill__side">
          <span className="drill__caption">Tu mano</span>
          {situation && <HandView cards={situation.player} instant />}
        </div>
      </div>

      <div className="drill__actions">
        {(['hit', 'stand', 'double', 'split', 'surrender'] as HandAction[]).map((action) => {
          const enabled = legal[action] && !answered;
          const isChosen = answered?.chosen === action;
          const isRight = answered && advice?.action === action;
          return (
            <button
              key={action}
              className={`abtn abtn--${action}${isChosen && !answered?.correct ? ' is-wrong' : ''}${
                isRight && answered ? ' is-right' : ''
              }`}
              disabled={!enabled}
              onClick={() => answer(action)}
              aria-label={actionLabel(action)}
            >
              <span className="abtn__initial" aria-hidden>
                {INITIAL[action]}
              </span>
              <span className="abtn__label">{actionLabel(action)}</span>
              <kbd className="abtn__key">{INITIAL[action]}</kbd>
            </button>
          );
        })}
      </div>

      <div className="drill__feedback">
        <AnimatePresence mode="wait">
          {answered && advice && (
            <motion.p
              key={`${score.total}`}
              className={answered.correct ? 'drill__ok' : 'drill__bad'}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              {answered.correct ? (
                <>Correcto · {advice.handLabel}</>
              ) : (
                <>
                  {advice.handLabel}: lo correcto es <b>{actionLabel(advice.action)}</b>, no{' '}
                  {actionLabel(answered.chosen).toLowerCase()}
                </>
              )}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
