import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  limit as qLimit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  type Firestore,
} from 'firebase/firestore';
import { BUCKET_UNIT, COL, db, GLOBAL_DOC, isConfigured } from './firebase';

/**
 * Historial de entrenamiento sobre Firestore.
 *
 * Dos decisiones gobiernan el diseno:
 *
 * 1. Los totales se llevan preagregados en contadores que se incrementan al
 *    guardar. Firestore cobra por documento leido y no sabe agrupar, asi que
 *    recalcular desde el detalle costaria una lectura por decision jugada.
 *
 * 2. Nada se borra nunca. "Borrar historial" avanza un contador de epoca y
 *    todo lo anterior deja de consultarse, lo que permite que las reglas de
 *    seguridad prohiban el borrado por completo.
 *
 * Todo es tolerante a fallos: si Firestore no responde o no esta configurado,
 * la mesa tiene que seguir siendo jugable. Solo se pierde el historial.
 */

export interface DecisionPayload {
  situationKey: string;
  handKind: 'hard' | 'soft' | 'pair' | 'insurance';
  playerTotal: number;
  dealerValue: number;
  chosen: string;
  optimal: string;
  isCorrect: boolean;
  msToDecide?: number;
  mode?: 'game' | 'drill';
}

export interface RoundPayload {
  sessionId: number;
  bet: number;
  net: number;
  bankrollAfter: number;
  dealerUpcard: string;
  dealerFinal: number;
  handsPlayed: number;
  outcomes: string[];
  decisions: DecisionPayload[];
}

export interface StatsSummary {
  sessions: number;
  rounds: number;
  hands: number;
  net: number;
  wagered: number;
  edge: number;
  decisions: number;
  correct: number;
  accuracy: number;
  recentAccuracy: number;
  recentSample: number;
  avgMs: number;
  outcomes: Record<string, number>;
}

export interface ProgressPoint {
  bucket: number;
  from: number;
  to: number;
  total: number;
  correct: number;
  accuracy: number;
  at: string;
}

export interface BankrollPoint {
  id: number;
  sessionId: number;
  net: number;
  bankroll: number;
  at: string;
}

export interface SituationStat {
  key: string;
  kind: string;
  playerTotal: number;
  dealerValue: number;
  total: number;
  correct: number;
  accuracy: number;
  optimal: string;
}

export interface MistakeStat {
  key: string;
  chosen: string;
  optimal: string;
  count: number;
}

/* ------------------------------------------------------------------ *
 * Estado de conexion
 * ------------------------------------------------------------------ */

let online = isConfigured;
const listeners = new Set<(v: boolean) => void>();

export function onConnectionChange(fn: (v: boolean) => void) {
  listeners.add(fn);
  // Si falta configuracion se avisa ya: no hay nada que esperar.
  if (!isConfigured) queueMicrotask(() => fn(false));
  return () => listeners.delete(fn);
}

function setOnline(v: boolean) {
  if (online === v) return;
  online = v;
  listeners.forEach((fn) => fn(v));
}

export const isOnline = () => online;

/** Envuelve una operacion para que un fallo nunca tumbe la mesa. */
async function attempt<T>(run: (database: Firestore) => Promise<T>): Promise<T | null> {
  const database = db();
  if (!database) {
    setOnline(false);
    return null;
  }
  try {
    const result = await run(database);
    setOnline(true);
    return result;
  } catch (err) {
    console.warn('[historial] operacion fallida', err);
    setOnline(false);
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * Contadores agregados
 * ------------------------------------------------------------------ */

interface GlobalStats {
  /** Se avanza al borrar el historial; todo lo anterior deja de leerse. */
  epoch: number;
  sessions: number;
  rounds: number;
  hands: number;
  net: number;
  wagered: number;
  decisions: number;
  correct: number;
  msTotal: number;
  msCount: number;
  outcomes: Record<string, number>;
  /** Aciertos recientes como cadena de 1 y 0, los ultimos 100. */
  recent: string;
}

const EMPTY_GLOBAL: GlobalStats = {
  epoch: 1,
  sessions: 0,
  rounds: 0,
  hands: 0,
  net: 0,
  wagered: 0,
  decisions: 0,
  correct: 0,
  msTotal: 0,
  msCount: 0,
  outcomes: {},
  recent: '',
};

const globalRef = (database: Firestore) => doc(database, COL.stats, GLOBAL_DOC);

/** Raiz de la epoca viva: todo el detalle y los agregados cuelgan de aqui. */
const epochPath = (epoch: number) => `epochs/${epoch}`;

async function readGlobal(database: Firestore): Promise<GlobalStats> {
  const snap = await getDoc(globalRef(database));
  return snap.exists() ? { ...EMPTY_GLOBAL, ...(snap.data() as Partial<GlobalStats>) } : EMPTY_GLOBAL;
}

/* ------------------------------------------------------------------ *
 * Escritura
 * ------------------------------------------------------------------ */

/**
 * Guarda decisiones y, opcionalmente, la ronda que las contiene.
 *
 * Va en una transaccion porque el indice de cada decision depende del total
 * acumulado: sin ella, dos pestanas jugando a la vez se pisarian el contador
 * y la curva de aprendizaje saldria mal.
 */
async function commit(
  database: Firestore,
  decisions: DecisionPayload[],
  round: RoundPayload | null,
) {
  await runTransaction(database, async (tx) => {
    const snap = await tx.get(globalRef(database));
    const current: GlobalStats = snap.exists()
      ? { ...EMPTY_GLOBAL, ...(snap.data() as Partial<GlobalStats>) }
      : EMPTY_GLOBAL;

    const root = epochPath(current.epoch);
    const startIndex = current.decisions;
    const correct = decisions.filter((d) => d.isCorrect).length;
    const msSum = decisions.reduce((s, d) => s + (d.msToDecide ?? 0), 0);
    const msCount = decisions.filter((d) => d.msToDecide !== undefined).length;

    let roundId: string | null = null;
    if (round) {
      const ref = doc(collection(database, `${root}/${COL.rounds}`));
      roundId = ref.id;
      tx.set(ref, {
        sessionId: round.sessionId,
        playedAt: serverTimestamp(),
        order: current.rounds,
        bet: round.bet,
        net: round.net,
        bankrollAfter: round.bankrollAfter,
        dealerUpcard: round.dealerUpcard,
        dealerFinal: round.dealerFinal,
        handsPlayed: round.handsPlayed,
        outcomes: round.outcomes,
        decisions: decisions.length,
        correct,
      });
    }

    decisions.forEach((d, i) => {
      const n = startIndex + i;

      tx.set(doc(collection(database, `${root}/${COL.decisions}`)), {
        ...d,
        roundId,
        index: n,
        decidedAt: serverTimestamp(),
      });

      // Bloque de la curva de aprendizaje al que pertenece esta decision.
      const bucket = Math.floor(n / BUCKET_UNIT);
      tx.set(
        doc(database, `${root}/${COL.progress}`, String(bucket)),
        {
          bucket,
          total: increment(1),
          correct: increment(d.isCorrect ? 1 : 0),
          at: serverTimestamp(),
        },
        { merge: true },
      );

      tx.set(
        doc(database, `${root}/${COL.situations}`, d.situationKey),
        {
          key: d.situationKey,
          kind: d.handKind,
          playerTotal: d.playerTotal,
          dealerValue: d.dealerValue,
          optimal: d.optimal,
          total: increment(1),
          correct: increment(d.isCorrect ? 1 : 0),
        },
        { merge: true },
      );

      if (!d.isCorrect) {
        tx.set(
          doc(database, `${root}/${COL.mistakes}`, `${d.situationKey}__${d.chosen}`),
          {
            key: d.situationKey,
            chosen: d.chosen,
            optimal: d.optimal,
            count: increment(1),
          },
          { merge: true },
        );
      }
    });

    const recent = (current.recent + decisions.map((d) => (d.isCorrect ? '1' : '0')).join('')).slice(
      -100,
    );

    const totals: Record<string, unknown> = {
      epoch: current.epoch,
      decisions: increment(decisions.length),
      correct: increment(correct),
      msTotal: increment(msSum),
      msCount: increment(msCount),
      recent,
    };

    if (round) {
      totals.rounds = increment(1);
      totals.hands = increment(round.handsPlayed);
      totals.net = increment(round.net);
      totals.wagered = increment(round.bet);
      const tally: Record<string, unknown> = {};
      for (const outcome of round.outcomes) tally[outcome] = increment(1);
      totals.outcomes = tally;
    }

    tx.set(globalRef(database), totals, { merge: true });
  });
}

/* ------------------------------------------------------------------ *
 * API publica
 * ------------------------------------------------------------------ */

export const api = {
  createSession: (body: Record<string, unknown>) =>
    attempt(async (database) => {
      const ref = await addDoc(collection(database, COL.sessions), {
        ...body,
        startedAt: serverTimestamp(),
      });
      await setDoc(globalRef(database), { sessions: increment(1) }, { merge: true });
      // La interfaz solo usa el id para agrupar: el de Firestore sirve igual.
      return { id: ref.id as unknown as number };
    }),

  saveRound: (body: RoundPayload) =>
    attempt(async (database) => {
      await commit(database, body.decisions ?? [], body);
      return { id: 0 };
    }),

  saveDecisions: (_sessionId: number, decisions: DecisionPayload[]) =>
    attempt(async (database) => {
      if (decisions.length === 0) return { saved: 0 };
      await commit(database, decisions, null);
      return { saved: decisions.length };
    }),

  summary: () =>
    attempt<StatsSummary>(async (database) => {
      const g = await readGlobal(database);
      const recentHits = [...g.recent].filter((c) => c === '1').length;
      return {
        sessions: g.sessions,
        rounds: g.rounds,
        hands: g.hands,
        net: g.net,
        wagered: g.wagered,
        edge: g.wagered > 0 ? g.net / g.wagered : 0,
        decisions: g.decisions,
        correct: g.correct,
        accuracy: g.decisions > 0 ? g.correct / g.decisions : 0,
        recentAccuracy: g.recent.length > 0 ? recentHits / g.recent.length : 0,
        recentSample: g.recent.length,
        avgMs: g.msCount > 0 ? g.msTotal / g.msCount : 0,
        outcomes: g.outcomes ?? {},
      };
    }),

  /**
   * Curva de aprendizaje. Los bloques se guardan de diez en diez y aqui se
   * agrupan al tamano pedido, que por eso es multiplo de diez.
   */
  progress: (bucket = 20) =>
    attempt<ProgressPoint[]>(async (database) => {
      const g = await readGlobal(database);
      const snap = await getDocs(
        query(collection(database, `${epochPath(g.epoch)}/${COL.progress}`), orderBy('bucket')),
      );

      const units = snap.docs.map((d) => d.data() as { bucket: number; total: number; correct: number; at?: { toDate(): Date } });
      const perGroup = Math.max(1, Math.round(bucket / BUCKET_UNIT));
      const groups = new Map<number, { total: number; correct: number; at?: Date }>();

      for (const unit of units) {
        const g2 = Math.floor(unit.bucket / perGroup);
        const acc = groups.get(g2) ?? { total: 0, correct: 0, at: undefined };
        acc.total += unit.total;
        acc.correct += unit.correct;
        acc.at ??= unit.at?.toDate();
        groups.set(g2, acc);
      }

      let seen = 0;
      return [...groups.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([index, acc]) => {
          const from = seen + 1;
          seen += acc.total;
          return {
            bucket: index,
            from,
            to: seen,
            total: acc.total,
            correct: acc.correct,
            accuracy: acc.total > 0 ? acc.correct / acc.total : 0,
            at: acc.at?.toISOString() ?? '',
          };
        });
    }),

  bankroll: () =>
    attempt<BankrollPoint[]>(async (database) => {
      const g = await readGlobal(database);
      // Solo las ultimas manos: la grafica no gana nada con mas y cada
      // documento leido cuenta en la cuota.
      const snap = await getDocs(
        query(
          collection(database, `${epochPath(g.epoch)}/${COL.rounds}`),
          orderBy('order', 'desc'),
          qLimit(300),
        ),
      );
      return snap.docs
        .map((d) => d.data() as { order: number; sessionId: number; net: number; bankrollAfter: number; playedAt?: { toDate(): Date } })
        .reverse()
        .map((r) => ({
          id: r.order,
          sessionId: r.sessionId,
          net: r.net,
          bankroll: r.bankrollAfter,
          at: r.playedAt?.toDate().toISOString() ?? '',
        }));
    }),

  situations: () =>
    attempt<SituationStat[]>(async (database) => {
      const g = await readGlobal(database);
      const snap = await getDocs(collection(database, `${epochPath(g.epoch)}/${COL.situations}`));
      return snap.docs
        .map((d) => d.data() as Omit<SituationStat, 'accuracy'>)
        .map((s) => ({ ...s, accuracy: s.total > 0 ? s.correct / s.total : 0 }))
        .sort((a, b) => a.accuracy - b.accuracy || b.total - a.total);
    }),

  mistakes: (limit = 10) =>
    attempt<MistakeStat[]>(async (database) => {
      const g = await readGlobal(database);
      const snap = await getDocs(
        query(
          collection(database, `${epochPath(g.epoch)}/${COL.mistakes}`),
          orderBy('count', 'desc'),
          qLimit(limit),
        ),
      );
      return snap.docs.map((d) => d.data() as MistakeStat);
    }),

  /**
   * Empieza un historial limpio. No borra nada: avanza la epoca, y con ella
   * todo lo anterior deja de consultarse. Asi las reglas pueden prohibir el
   * borrado, que sin autenticacion es la operacion mas peligrosa.
   */
  resetAll: () =>
    attempt(async (database) => {
      const g = await readGlobal(database);
      await setDoc(globalRef(database), { ...EMPTY_GLOBAL, epoch: g.epoch + 1 });
      return { ok: true };
    }),
};
