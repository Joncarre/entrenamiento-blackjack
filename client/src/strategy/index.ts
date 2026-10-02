import { evaluate, isSplittablePair, strategyRank } from '../engine/cards';
import type { Action, Card, Rules } from '../engine/types';
import { type Cell, dealerColumn, resolvedTables } from './tables';

export * from './tables';

/** Acciones con casilla propia en la tabla. El seguro se decide aparte. */
export type HandAction = Exclude<Action, 'insurance'>;

/** Contexto de legalidad: que acciones permite la mesa en este instante. */
export type LegalActions = Record<HandAction, boolean>;

export interface StrategyAdvice {
  /** Accion optima segun la tabla, ya ajustada a lo que es legal ahora. */
  action: Action;
  /** Accion ideal antes de ajustar por legalidad (para explicar el fallback). */
  ideal: Action;
  /** Celda cruda de la tabla. */
  cell: Cell;
  /** Etiqueta de la mano: "16 duro", "A,7 (18 blando)", "Par de 8". */
  handLabel: string;
  /** Clave canonica de la situacion, para agrupar estadisticas. Ej: "H16v10". */
  situationKey: string;
  /** Explicacion breve en castellano. */
  reason: string;
}

/** Mismas palabras que la leyenda de la tabla, para no entrenar dos nombres. */
const ACTION_LABEL: Record<Action, string> = {
  hit: 'Pedir',
  stand: 'Quedarse',
  double: 'Doblar',
  split: 'Separar',
  surrender: 'Retirarse',
  insurance: 'Seguro',
};

export const actionLabel = (a: Action) => ACTION_LABEL[a];

function dealerLabel(dealerValue: number) {
  return dealerValue === 11 ? 'A' : String(dealerValue);
}

/** Traduce una celda de la tabla a la accion realmente ejecutable. */
function cellToAction(cell: Cell, legal: LegalActions, rules: Rules): { action: Action; ideal: Action } {
  switch (cell) {
    case 'H':
      return { action: 'hit', ideal: 'hit' };
    case 'S':
      return { action: 'stand', ideal: 'stand' };
    case 'Dh':
      return { action: legal.double ? 'double' : 'hit', ideal: 'double' };
    case 'Ds':
      return { action: legal.double ? 'double' : 'stand', ideal: 'double' };
    case 'P':
      return { action: legal.split ? 'split' : 'hit', ideal: 'split' };
    case 'Ph':
      if (rules.doubleAfterSplit && legal.split) return { action: 'split', ideal: 'split' };
      return { action: 'hit', ideal: rules.doubleAfterSplit ? 'split' : 'hit' };
    case 'Rh':
      return { action: legal.surrender ? 'surrender' : 'hit', ideal: 'surrender' };
    case 'Rs':
      return { action: legal.surrender ? 'surrender' : 'stand', ideal: 'surrender' };
    case 'Rp':
      if (legal.surrender) return { action: 'surrender', ideal: 'surrender' };
      return { action: legal.split ? 'split' : 'hit', ideal: 'surrender' };
    case 'N':
    default:
      return { action: 'hit', ideal: 'hit' };
  }
}

const REASONS: Partial<Record<Action, string>> = {
  hit: 'el total es demasiado bajo para aguantar contra esta carta del crupier',
  stand: 'arriesgarse a pasarse cuesta mas de lo que aporta mejorar la mano',
  double: 'la mano tiene ventaja y conviene poner mas dinero en juego',
  split: 'dos manos separadas valen mas que este par junto',
  surrender: 'recuperar la mitad pierde menos dinero a largo plazo que jugarla',
};

/**
 * Devuelve la jugada teoricamente optima para una mano concreta.
 *
 * Orden de evaluacion (importante): rendicion -> division -> doblar -> pedir/plantarse.
 */
export function getAdvice(
  playerCards: Card[],
  dealerUpcard: Card,
  rules: Rules,
  legal: LegalActions,
): StrategyAdvice {
  const { hard, soft, pairs } = resolvedTables(rules);
  const dv = strategyRank(dealerUpcard.rank);
  const col = dealerColumn(dv);
  const value = evaluate(playerCards);
  const dealerTxt = dealerLabel(dv);

  // --- 1. Parejas (la tabla de pares incluye ya los casos de rendicion tipo 8,8 vs A)
  if (isSplittablePair(playerCards) && legal.split) {
    const pv = strategyRank(playerCards[0].rank);
    const cell = pairs[pv][col];
    if (cell !== 'N') {
      const { action, ideal } = cellToAction(cell, legal, rules);
      const handLabel = pv === 11 ? 'Par de Ases' : `Par de ${pv === 10 ? '10/figuras' : pv}`;
      return {
        action,
        ideal,
        cell,
        handLabel,
        situationKey: `P${pv}v${dealerTxt}`,
        reason: buildReason(handLabel, dealerTxt, ideal, action),
      };
    }
  }

  // --- 2. Rendicion sobre totales duros (15/16/17 segun reglas)
  const hardTotal = value.hard;

  // --- 3. Total blando (hay un As contando como 11)
  if (value.soft && value.total >= 13 && value.total <= 21) {
    const cell = soft[value.total][col];
    const { action, ideal } = cellToAction(cell, legal, rules);
    const others = playerCards.length === 2
      ? playerCards.find((c) => c.rank !== 'A')
      : undefined;
    const handLabel = others
      ? `A,${strategyRank(others.rank) === 10 ? '10' : strategyRank(others.rank)} (${value.total} blando)`
      : `${value.total} blando`;
    return {
      action,
      ideal,
      cell,
      handLabel,
      situationKey: `S${value.total}v${dealerTxt}`,
      reason: buildReason(handLabel, dealerTxt, ideal, action),
    };
  }

  // --- 4. Total duro
  const clamped = Math.min(Math.max(hardTotal, 5), 21);
  const cell = hard[clamped][col];
  const { action, ideal } = cellToAction(cell, legal, rules);
  const handLabel = `${hardTotal} duro`;
  return {
    action,
    ideal,
    cell,
    handLabel,
    situationKey: `H${clamped}v${dealerTxt}`,
    reason: buildReason(handLabel, dealerTxt, ideal, action),
  };
}

function buildReason(handLabel: string, dealerTxt: string, ideal: Action, action: Action): string {
  const base = `${handLabel} contra ${dealerTxt}: ${ACTION_LABEL[ideal].toLowerCase()} porque ${REASONS[ideal] ?? ''}`;
  if (ideal !== action) {
    return `${base}. Aqui no se puede ${ACTION_LABEL[ideal].toLowerCase()}, asi que la jugada correcta es ${ACTION_LABEL[action].toLowerCase()}`;
  }
  return base;
}

/** Descripcion textual corta de una situacion a partir de su clave canonica. */
export function describeSituation(key: string): string {
  if (key === 'INSvA') return 'seguro contra A';
  const m = /^([HSP])(\d+)v(\d+|A)$/.exec(key);
  if (!m) return key;
  const [, kind, total, dealer] = m;
  const label =
    kind === 'H' ? `${total} duro` : kind === 'S' ? `${total} blando` : `par de ${total === '11' ? 'A' : total}`;
  return `${label} vs ${dealer}`;
}
