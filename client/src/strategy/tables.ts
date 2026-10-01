/**
 * Tabla de estrategia basica para Blackjack multi-baraja (4-8 mazos).
 *
 * Referencia: Wizard of Odds / Blackjack Apprenticeship (estrategia basica compuesta
 * por total, no por composicion de cartas).
 *
 * Codigos de celda:
 *   H  = Pedir (Hit)
 *   S  = Plantarse (Stand)
 *   Dh = Doblar; si no se puede doblar -> Pedir
 *   Ds = Doblar; si no se puede doblar -> Plantarse
 *   P  = Dividir (Split)
 *   Ph = Dividir si el doble tras split esta permitido (DAS); si no -> Pedir
 *   N  = No dividir (se resuelve como total duro/blando)
 *   Rh = Rendirse; si no se puede -> Pedir
 *   Rs = Rendirse; si no se puede -> Plantarse
 *   Rp = Rendirse; si no se puede -> Dividir
 *
 * Columnas = carta descubierta del crupier, en orden: 2 3 4 5 6 7 8 9 10 A
 */

import type { Rules } from '../engine/types';

export type Cell =
  | 'H' | 'S' | 'Dh' | 'Ds' | 'P' | 'Ph' | 'N' | 'Rh' | 'Rs' | 'Rp';

/** Orden de columnas: valor de la carta del crupier (11 = As). */
export const DEALER_COLUMNS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;

const row = (spec: string): Cell[] => spec.trim().split(/\s+/) as Cell[];

/* ------------------------------------------------------------------ *
 * TOTALES DUROS  (clave = total duro, 5..21)
 * ------------------------------------------------------------------ */
export const HARD: Record<number, Cell[]> = {
  //          2   3   4   5   6   7   8   9   10  A
  5:  row('  H   H   H   H   H   H   H   H   H   H '),
  6:  row('  H   H   H   H   H   H   H   H   H   H '),
  7:  row('  H   H   H   H   H   H   H   H   H   H '),
  8:  row('  H   H   H   H   H   H   H   H   H   H '),
  9:  row('  H   Dh  Dh  Dh  Dh  H   H   H   H   H '),
  10: row('  Dh  Dh  Dh  Dh  Dh  Dh  Dh  Dh  H   H '),
  11: row('  Dh  Dh  Dh  Dh  Dh  Dh  Dh  Dh  Dh  H '),
  12: row('  H   H   S   S   S   H   H   H   H   H '),
  13: row('  S   S   S   S   S   H   H   H   H   H '),
  14: row('  S   S   S   S   S   H   H   H   H   H '),
  15: row('  S   S   S   S   S   H   H   H   Rh  H '),
  16: row('  S   S   S   S   S   H   H   Rh  Rh  Rh'),
  17: row('  S   S   S   S   S   S   S   S   S   S '),
  18: row('  S   S   S   S   S   S   S   S   S   S '),
  19: row('  S   S   S   S   S   S   S   S   S   S '),
  20: row('  S   S   S   S   S   S   S   S   S   S '),
  21: row('  S   S   S   S   S   S   S   S   S   S '),
};

/* ------------------------------------------------------------------ *
 * TOTALES BLANDOS  (clave = total blando, 13..21 -> A,2 .. A,10)
 * ------------------------------------------------------------------ */
export const SOFT: Record<number, Cell[]> = {
  //             2   3   4   5   6   7   8   9   10  A
  13: row('     H   H   H   Dh  Dh  H   H   H   H   H '), // A,2
  14: row('     H   H   H   Dh  Dh  H   H   H   H   H '), // A,3
  15: row('     H   H   Dh  Dh  Dh  H   H   H   H   H '), // A,4
  16: row('     H   H   Dh  Dh  Dh  H   H   H   H   H '), // A,5
  17: row('     H   Dh  Dh  Dh  Dh  H   H   H   H   H '), // A,6
  18: row('     S   Ds  Ds  Ds  Ds  S   S   H   H   H '), // A,7
  19: row('     S   S   S   S   S   S   S   S   S   S '), // A,8
  20: row('     S   S   S   S   S   S   S   S   S   S '), // A,9
  21: row('     S   S   S   S   S   S   S   S   S   S '),
};

/* ------------------------------------------------------------------ *
 * PAREJAS  (clave = valor de estrategia de cada carta; 11 = A,A)
 * ------------------------------------------------------------------ */
export const PAIRS: Record<number, Cell[]> = {
  //             2   3   4   5   6   7   8   9   10  A
  11: row('     P   P   P   P   P   P   P   P   P   P '), // A,A
  10: row('     N   N   N   N   N   N   N   N   N   N '), // 10,10
  9:  row('     P   P   P   P   P   N   P   P   N   N '), // 9,9
  8:  row('     P   P   P   P   P   P   P   P   P   P '), // 8,8
  7:  row('     P   P   P   P   P   P   N   N   N   N '), // 7,7
  6:  row('     Ph  P   P   P   P   N   N   N   N   N '), // 6,6
  5:  row('     N   N   N   N   N   N   N   N   N   N '), // 5,5 -> doblar como 10 duro
  4:  row('     N   N   N   Ph  Ph  N   N   N   N   N '), // 4,4
  3:  row('     Ph  Ph  P   P   P   P   N   N   N   N '), // 3,3
  2:  row('     Ph  Ph  P   P   P   P   N   N   N   N '), // 2,2
};

/* ------------------------------------------------------------------ *
 * DESVIACIONES cuando el crupier PIDE con 17 blando (H17)
 * ------------------------------------------------------------------ */
export const H17_HARD_OVERRIDES: Array<[total: number, dealer: number, cell: Cell]> = [
  [11, 11, 'Dh'], // 11 vs A: doblar
  [15, 11, 'Rh'], // 15 vs A: rendirse
  [17, 11, 'Rs'], // 17 vs A: rendirse
];

export const H17_SOFT_OVERRIDES: Array<[total: number, dealer: number, cell: Cell]> = [
  [18, 2, 'Ds'], // A,7 vs 2: doblar / plantarse
  [19, 6, 'Ds'], // A,8 vs 6: doblar / plantarse
];

export const H17_PAIR_OVERRIDES: Array<[pair: number, dealer: number, cell: Cell]> = [
  [8, 11, 'Rp'], // 8,8 vs A: rendirse; si no, dividir
  [9, 11, 'P'],  // 9,9 vs A: dividir
];

/** Indice de columna (0..9) para el valor de la carta del crupier. */
export function dealerColumn(dealerValue: number): number {
  const idx = DEALER_COLUMNS.indexOf(dealerValue as (typeof DEALER_COLUMNS)[number]);
  if (idx === -1) throw new Error(`Carta de crupier no valida: ${dealerValue}`);
  return idx;
}

/** Totales con los que las mesas restrictivas permiten doblar. */
export const RESTRICTED_DOUBLE_TOTALS = [9, 10, 11];

/** Subconjunto de reglas que determina la forma de la tabla. */
export type TableRules = Pick<
  Rules,
  'dealerHitsSoft17' | 'doubleAnyTotal' | 'doubleAfterSplit' | 'lateSurrender'
>;

const mapRow = (cells: Cell[], fn: (c: Cell) => Cell): Cell[] => cells.map(fn);

/** Una casilla de doble se convierte en la jugada que indica su sufijo. */
const dropDouble = (c: Cell): Cell => (c === 'Dh' ? 'H' : c === 'Ds' ? 'S' : c);

/** Una casilla de rendicion cae a su alternativa cuando la mesa no la ofrece. */
const dropSurrender = (c: Cell): Cell =>
  c === 'Rh' ? 'H' : c === 'Rs' ? 'S' : c === 'Rp' ? 'P' : c;

/**
 * Devuelve la tabla que realmente aplica en una mesa concreta.
 *
 * No se limita a las desviaciones H17: tambien colapsa las casillas que las
 * reglas de la casa hacen imposibles, para que lo que se muestra y lo que se
 * corrige sea exactamente lo que hay que memorizar para esa mesa.
 */
export function resolvedTables(rules: TableRules) {
  const hard: Record<number, Cell[]> = {};
  const soft: Record<number, Cell[]> = {};
  const pairs: Record<number, Cell[]> = {};
  for (const [k, v] of Object.entries(HARD)) hard[Number(k)] = [...v];
  for (const [k, v] of Object.entries(SOFT)) soft[Number(k)] = [...v];
  for (const [k, v] of Object.entries(PAIRS)) pairs[Number(k)] = [...v];

  if (rules.dealerHitsSoft17) {
    for (const [total, dealer, cell] of H17_HARD_OVERRIDES) hard[total][dealerColumn(dealer)] = cell;
    for (const [total, dealer, cell] of H17_SOFT_OVERRIDES) soft[total][dealerColumn(dealer)] = cell;
    for (const [pair, dealer, cell] of H17_PAIR_OVERRIDES) pairs[pair][dealerColumn(dealer)] = cell;
  }

  // Mesa sin rendicion: cada casilla R pasa a su jugada alternativa.
  if (!rules.lateSurrender) {
    for (const t of Object.keys(hard)) hard[Number(t)] = mapRow(hard[Number(t)], dropSurrender);
    for (const t of Object.keys(soft)) soft[Number(t)] = mapRow(soft[Number(t)], dropSurrender);
    for (const p of Object.keys(pairs)) pairs[Number(p)] = mapRow(pairs[Number(p)], dropSurrender);
  }

  // Mesa que solo deja doblar con 9, 10 u 11 puntos. Como ningun total blando
  // cae en ese rango, desaparecen todos los dobles de manos blandas.
  if (!rules.doubleAnyTotal) {
    for (const t of Object.keys(hard)) {
      if (!RESTRICTED_DOUBLE_TOTALS.includes(Number(t))) {
        hard[Number(t)] = mapRow(hard[Number(t)], dropDouble);
      }
    }
    for (const t of Object.keys(soft)) {
      if (!RESTRICTED_DOUBLE_TOTALS.includes(Number(t))) {
        soft[Number(t)] = mapRow(soft[Number(t)], dropDouble);
      }
    }
  }

  // Sin doble tras dividir, las divisiones marginales dejan de compensar.
  if (!rules.doubleAfterSplit) {
    for (const p of Object.keys(pairs)) {
      pairs[Number(p)] = mapRow(pairs[Number(p)], (c) => (c === 'Ph' ? 'H' : c));
    }
  }

  return { hard, soft, pairs };
}
