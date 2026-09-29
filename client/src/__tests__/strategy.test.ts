import { describe, expect, it } from 'vitest';
import { evaluate } from '../engine/cards';
import { legalActionsFor, newHand, resolveHand, shouldDealerHit } from '../engine/game';
import { DEFAULT_RULES, type Card, type Rank, type Rules } from '../engine/types';
import { getAdvice, type LegalActions } from '../strategy';
import { DEALER_COLUMNS, HARD, PAIRS, SOFT } from '../strategy/tables';

let n = 0;
const c = (rank: Rank): Card => ({ id: `t${n++}`, rank, suit: 'S' });

const ALL_LEGAL: LegalActions = { hit: true, stand: true, double: true, split: true, surrender: true };
const NO_EXTRAS: LegalActions = { hit: true, stand: true, double: false, split: false, surrender: false };

const S17: Rules = { ...DEFAULT_RULES, dealerHitsSoft17: false };
const H17: Rules = { ...DEFAULT_RULES, dealerHitsSoft17: true };

const advice = (player: Rank[], dealer: Rank, rules = S17, legal = ALL_LEGAL) =>
  getAdvice(player.map(c), c(dealer), rules, legal).action;

describe('evaluate', () => {
  it('cuenta el as como 11 cuando cabe', () => {
    expect(evaluate([c('A'), c('6')])).toMatchObject({ total: 17, soft: true, hard: 7 });
  });
  it('degrada el as a 1 cuando se pasaria', () => {
    expect(evaluate([c('A'), c('6'), c('T')])).toMatchObject({ total: 17, soft: false });
  });
  it('detecta blackjack solo con dos cartas', () => {
    expect(evaluate([c('A'), c('K')]).isBlackjack).toBe(true);
    expect(evaluate([c('5'), c('6'), c('T')]).isBlackjack).toBe(false);
  });
  it('maneja multiples ases', () => {
    expect(evaluate([c('A'), c('A')])).toMatchObject({ total: 12, soft: true });
    expect(evaluate([c('A'), c('A'), c('A'), c('A')])).toMatchObject({ total: 14, soft: true });
  });
  it('marca bust por encima de 21', () => {
    expect(evaluate([c('T'), c('K'), c('5')]).isBust).toBe(true);
  });
});

describe('integridad de las tablas', () => {
  it('toda fila tiene exactamente 10 columnas', () => {
    for (const table of [HARD, SOFT, PAIRS]) {
      for (const [key, cells] of Object.entries(table)) {
        expect(cells, `fila ${key}`).toHaveLength(DEALER_COLUMNS.length);
      }
    }
  });
  it('no hay celdas con codigos desconocidos', () => {
    const valid = new Set(['H', 'S', 'Dh', 'Ds', 'P', 'Ph', 'N', 'Rh', 'Rs', 'Rp']);
    for (const table of [HARD, SOFT, PAIRS]) {
      for (const cells of Object.values(table)) {
        for (const cell of cells) expect(valid.has(cell)).toBe(true);
      }
    }
  });
});

describe('estrategia basica: totales duros', () => {
  it('siempre pide con 8 o menos', () => {
    for (const d of ['2', '7', 'T', 'A'] as Rank[]) expect(advice(['5', '3'], d)).toBe('hit');
  });
  it('9 dobla solo contra 3-6', () => {
    expect(advice(['5', '4'], '2')).toBe('hit');
    expect(advice(['5', '4'], '3')).toBe('double');
    expect(advice(['5', '4'], '6')).toBe('double');
    expect(advice(['5', '4'], '7')).toBe('hit');
  });
  it('11 dobla contra todo menos el As en S17', () => {
    for (const d of ['2', '5', '9', 'T'] as Rank[]) expect(advice(['6', '5'], d)).toBe('double');
    expect(advice(['6', '5'], 'A', S17)).toBe('hit');
  });
  it('11 dobla tambien contra el As en H17', () => {
    expect(advice(['6', '5'], 'A', H17)).toBe('double');
  });
  it('12 se planta solo contra 4-6', () => {
    expect(advice(['T', '2'], '2')).toBe('hit');
    expect(advice(['T', '2'], '3')).toBe('hit');
    expect(advice(['T', '2'], '4')).toBe('stand');
    expect(advice(['T', '2'], '6')).toBe('stand');
    expect(advice(['T', '2'], '7')).toBe('hit');
  });
  it('13-16 se plantan contra 2-6 y piden contra 7+', () => {
    expect(advice(['T', '3'], '5')).toBe('stand');
    expect(advice(['T', '4'], '7')).toBe('hit');
    expect(advice(['T', '6'], '6')).toBe('stand');
  });
  it('16 se rinde contra 9, 10 y A', () => {
    for (const d of ['9', 'T', 'A'] as Rank[]) expect(advice(['T', '6'], d)).toBe('surrender');
    expect(advice(['T', '6'], '8')).toBe('hit');
  });
  it('15 se rinde solo contra 10 en S17, y tambien contra A en H17', () => {
    expect(advice(['T', '5'], 'T')).toBe('surrender');
    expect(advice(['T', '5'], 'A', S17)).toBe('hit');
    expect(advice(['T', '5'], 'A', H17)).toBe('surrender');
  });
  it('17 duro se rinde contra A solo en H17', () => {
    expect(advice(['T', '7'], 'A', S17)).toBe('stand');
    expect(advice(['T', '7'], 'A', H17)).toBe('surrender');
  });
  it('19 siempre se planta', () => {
    for (const d of ['2', '6', 'T', 'A'] as Rank[]) expect(advice(['T', '9'], d)).toBe('stand');
  });
});

describe('estrategia basica: totales blandos', () => {
  it('A,2 y A,3 doblan contra 5-6', () => {
    expect(advice(['A', '2'], '4')).toBe('hit');
    expect(advice(['A', '2'], '5')).toBe('double');
    expect(advice(['A', '3'], '6')).toBe('double');
    expect(advice(['A', '3'], '7')).toBe('hit');
  });
  it('A,4 y A,5 doblan contra 4-6', () => {
    expect(advice(['A', '4'], '3')).toBe('hit');
    expect(advice(['A', '4'], '4')).toBe('double');
    expect(advice(['A', '5'], '6')).toBe('double');
  });
  it('A,6 dobla contra 3-6', () => {
    expect(advice(['A', '6'], '2')).toBe('hit');
    expect(advice(['A', '6'], '3')).toBe('double');
    expect(advice(['A', '6'], '6')).toBe('double');
  });
  it('A,7 es el caso delicado: 18 blando', () => {
    expect(advice(['A', '7'], '2', S17)).toBe('stand');
    expect(advice(['A', '7'], '2', H17)).toBe('double');
    expect(advice(['A', '7'], '3')).toBe('double');
    expect(advice(['A', '7'], '7')).toBe('stand');
    expect(advice(['A', '7'], '9')).toBe('hit');
    expect(advice(['A', '7'], 'A')).toBe('hit');
  });
  it('A,8 se planta salvo contra 6 en H17', () => {
    expect(advice(['A', '8'], '6', S17)).toBe('stand');
    expect(advice(['A', '8'], '6', H17)).toBe('double');
  });
  it('si no se puede doblar, A,7 vs 3 se planta (Ds)', () => {
    expect(advice(['A', '7'], '3', S17, NO_EXTRAS)).toBe('stand');
  });
  it('si no se puede doblar, A,2 vs 5 pide (Dh)', () => {
    expect(advice(['A', '2'], '5', S17, NO_EXTRAS)).toBe('hit');
  });
});

describe('estrategia basica: parejas', () => {
  it('siempre divide ases y ochos', () => {
    for (const d of ['2', '7', 'T', 'A'] as Rank[]) {
      expect(advice(['A', 'A'], d)).toBe('split');
    }
    for (const d of ['2', '7', 'T'] as Rank[]) {
      expect(advice(['8', '8'], d)).toBe('split');
    }
  });
  it('nunca divide dieces ni cincos', () => {
    expect(advice(['T', 'K'], '6')).toBe('stand');
    expect(advice(['5', '5'], '6')).toBe('double');
    expect(advice(['5', '5'], 'T')).toBe('hit');
  });
  it('9,9 se planta contra 7, 10 y A en S17', () => {
    expect(advice(['9', '9'], '7')).toBe('stand');
    expect(advice(['9', '9'], 'T')).toBe('stand');
    expect(advice(['9', '9'], 'A', S17)).toBe('stand');
    expect(advice(['9', '9'], 'A', H17)).toBe('split');
    expect(advice(['9', '9'], '6')).toBe('split');
  });
  it('8,8 contra A se rinde en H17 con rendicion disponible', () => {
    expect(advice(['8', '8'], 'A', S17)).toBe('split');
    expect(advice(['8', '8'], 'A', H17)).toBe('surrender');
    const noSurrender: Rules = { ...H17, lateSurrender: false };
    expect(advice(['8', '8'], 'A', noSurrender, { ...ALL_LEGAL, surrender: false })).toBe('split');
  });
  it('7,7 divide hasta el 7 del crupier', () => {
    expect(advice(['7', '7'], '7')).toBe('split');
    expect(advice(['7', '7'], '8')).toBe('hit');
  });
  it('4,4 solo divide contra 5-6 y con DAS', () => {
    expect(advice(['4', '4'], '5')).toBe('split');
    const noDas: Rules = { ...S17, doubleAfterSplit: false };
    expect(advice(['4', '4'], '5', noDas)).toBe('hit');
  });
  it('2,2 y 3,3 contra 2-3 dependen del DAS', () => {
    expect(advice(['2', '2'], '2')).toBe('split');
    expect(advice(['3', '3'], '3')).toBe('split');
    const noDas: Rules = { ...S17, doubleAfterSplit: false };
    expect(advice(['2', '2'], '2', noDas)).toBe('hit');
  });
  it('6,6 contra 2 depende del DAS', () => {
    expect(advice(['6', '6'], '2')).toBe('split');
    const noDas: Rules = { ...S17, doubleAfterSplit: false };
    expect(advice(['6', '6'], '2', noDas)).toBe('hit');
    expect(advice(['6', '6'], '7')).toBe('hit');
  });
  it('si no se puede dividir, el par cae a su total', () => {
    expect(advice(['8', '8'], 'T', S17, { ...ALL_LEGAL, split: false })).toBe('surrender');
  });
});

describe('crupier', () => {
  it('se planta con 17 duro', () => {
    expect(shouldDealerHit([c('T'), c('7')], S17)).toBe(false);
  });
  it('pide con 16', () => {
    expect(shouldDealerHit([c('T'), c('6')], S17)).toBe(true);
  });
  it('trata el 17 blando segun la regla de la mesa', () => {
    expect(shouldDealerHit([c('A'), c('6')], S17)).toBe(false);
    expect(shouldDealerHit([c('A'), c('6')], H17)).toBe(true);
  });
});

describe('liquidacion', () => {
  const mk = (cards: Rank[], extra = {}) => newHand(10, cards.map(c), extra);

  it('el blackjack natural paga 3:2', () => {
    expect(resolveHand(mk(['A', 'K']), [c('T'), c('8')], S17)).toEqual({ outcome: 'blackjack', net: 15 });
  });
  it('21 tras split no es blackjack: paga 1:1', () => {
    expect(resolveHand(mk(['A', 'K'], { fromSplit: true }), [c('T'), c('8')], S17)).toEqual({
      outcome: 'win',
      net: 10,
    });
  });
  it('blackjack contra blackjack empata', () => {
    expect(resolveHand(mk(['A', 'K']), [c('A'), c('Q')], S17)).toEqual({ outcome: 'push', net: 0 });
  });
  it('pasarse pierde aunque el crupier tambien se pase', () => {
    expect(resolveHand(mk(['T', 'K', '5']), [c('T'), c('K'), c('5')], S17)).toEqual({
      outcome: 'bust',
      net: -10,
    });
  });
  it('el crupier pasado paga la mano viva', () => {
    expect(resolveHand(mk(['T', '5']), [c('T'), c('6'), c('9')], S17)).toEqual({ outcome: 'win', net: 10 });
  });
  it('la rendicion devuelve la mitad', () => {
    expect(resolveHand(mk(['T', '6'], { outcome: 'surrender' }), [c('T'), c('9')], S17)).toEqual({
      outcome: 'surrender',
      net: -5,
    });
  });
  it('el doblado arriesga y cobra el doble', () => {
    const hand = newHand(20, [c('5'), c('6'), c('T')], { doubled: true });
    expect(resolveHand(hand, [c('T'), c('9')], S17)).toEqual({ outcome: 'win', net: 20 });
  });
  it('el pago 6:5 se respeta si la mesa lo usa', () => {
    const rules: Rules = { ...S17, blackjackPayout: 1.2 };
    expect(resolveHand(mk(['A', 'K']), [c('T'), c('8')], rules)).toEqual({ outcome: 'blackjack', net: 12 });
  });
});

describe('acciones legales', () => {
  const base = { totalHands: 1, rules: S17, available: 1000, dealerHasBlackjack: false };

  it('permite doblar y dividir con un par inicial', () => {
    const l = legalActionsFor({ ...base, hand: newHand(10, [c('8'), c('8')]) });
    expect(l).toMatchObject({ hit: true, stand: true, double: true, split: true, surrender: true });
  });
  it('prohibe doblar y rendirse con tres cartas', () => {
    const l = legalActionsFor({ ...base, hand: newHand(10, [c('4'), c('4'), c('3')]) });
    expect(l.double).toBe(false);
    expect(l.surrender).toBe(false);
  });
  it('prohibe doblar sin fondos', () => {
    const l = legalActionsFor({ ...base, available: 5, hand: newHand(10, [c('6'), c('5')]) });
    expect(l.double).toBe(false);
  });
  it('bloquea el doble tras split si la mesa no lo permite', () => {
    const rules: Rules = { ...S17, doubleAfterSplit: false };
    const l = legalActionsFor({ ...base, rules, hand: newHand(10, [c('6'), c('5')], { fromSplit: true }) });
    expect(l.double).toBe(false);
  });
  it('no deja actuar sobre ases divididos', () => {
    const hand = newHand(10, [c('A'), c('9')], { fromSplit: true, splitAces: true });
    expect(legalActionsFor({ ...base, hand }).hit).toBe(false);
  });
  it('no deja rendirse tras dividir', () => {
    const hand = newHand(10, [c('T'), c('6')], { fromSplit: true });
    expect(legalActionsFor({ ...base, hand }).surrender).toBe(false);
  });
  it('respeta el limite de manos divididas', () => {
    const l = legalActionsFor({ ...base, totalHands: 4, hand: newHand(10, [c('8'), c('8')]) });
    expect(l.split).toBe(false);
  });
  it('permite dividir figuras distintas del mismo valor', () => {
    const l = legalActionsFor({ ...base, hand: newHand(10, [c('K'), c('Q')]) });
    expect(l.split).toBe(true);
  });
});
