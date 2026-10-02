import { describe, expect, it } from 'vitest';
import { evaluate } from '../engine/cards';
import { legalActionsFor, newHand, resolveHand, shouldDealerHit } from '../engine/game';
import { CASINO_RULES, LIBERAL_RULES, type Action, type Card, type Rank, type Rules } from '../engine/types';
import { getAdvice, resolvedPairs, type LegalActions } from '../strategy';
import { DEALER_COLUMNS, HARD, PAIRS, SOFT } from '../strategy/tables';

let n = 0;
const c = (rank: Rank): Card => ({ id: `t${n++}`, rank, suit: 'S' });

const ALL_LEGAL: LegalActions = { hit: true, stand: true, double: true, split: true, surrender: true };
const NO_EXTRAS: LegalActions = { hit: true, stand: true, double: false, split: false, surrender: false };

// La tabla de referencia se comprueba sobre una mesa permisiva; las mesas
// restrictivas tienen su propio bloque al final del fichero.
const S17: Rules = { ...LIBERAL_RULES, dealerHitsSoft17: false };
const H17: Rules = { ...LIBERAL_RULES, dealerHitsSoft17: true };

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
  it('A,8 solo dobla contra 6', () => {
    expect(advice(['A', '8'], '6', S17)).toBe('double');
    expect(advice(['A', '8'], '6', H17)).toBe('double');
    for (const d of ['2', '5', '7', 'T', 'A'] as Rank[]) {
      expect(advice(['A', '8'], d)).toBe('stand');
    }
  });

  it('A,9 se planta contra todo', () => {
    for (const d of ['2', '5', '6', '9', 'A'] as Rank[]) {
      expect(advice(['A', '9'], d)).toBe('stand');
    }
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

/* ------------------------------------------------------------------ *
 * Mesa de referencia: casino de Madrid.
 * 6 barajas · S17 · doble solo con 9/10/11 · sin rendicion ·
 * una sola division · blackjack 3:2.
 * ------------------------------------------------------------------ */
describe('reglas del casino', () => {
  const C = CASINO_RULES;
  // En esta mesa doblar y rendirse no dependen del momento, sino de la casa.
  const legal: LegalActions = { hit: true, stand: true, double: true, split: true, surrender: false };
  const cas = (player: Rank[], dealer: Rank) => advice(player, dealer, C, legal);

  it('la banca se planta con 17, incluido el 17 blando', () => {
    expect(shouldDealerHit([c('A'), c('6')], C)).toBe(false);
    expect(shouldDealerHit([c('T'), c('7')], C)).toBe(false);
    expect(shouldDealerHit([c('T'), c('6')], C)).toBe(true);
  });

  it('juega siempre con 6 barajas', () => {
    expect(C.decks).toBe(6);
  });

  it('paga el blackjack a 3:2', () => {
    expect(C.blackjackPayout).toBe(1.5);
  });

  describe('solo se doblan 9, 10 y 11', () => {
    it('mantiene los dobles de 9, 10 y 11 duros', () => {
      expect(cas(['5', '4'], '4')).toBe('double');
      expect(cas(['6', '4'], '9')).toBe('double');
      expect(cas(['6', '5'], '5')).toBe('double');
    });

    it('elimina los dobles de A,2 a A,7, cuyo total duro no llega a 9', () => {
      expect(cas(['A', '2'], '5')).toBe('hit');
      expect(cas(['A', '3'], '6')).toBe('hit');
      expect(cas(['A', '4'], '4')).toBe('hit');
      expect(cas(['A', '5'], '6')).toBe('hit');
      expect(cas(['A', '6'], '3')).toBe('hit');
    });

    it('conserva el doble de A,8, que vale 9 contando el As como 1', () => {
      expect(cas(['A', '8'], '6')).toBe('double');
      // Solo contra el 6: el resto de la fila se planta.
      for (const d of ['2', '5', '7', 'T'] as Rank[]) expect(cas(['A', '8'], d)).toBe('stand');
    });

    it('permite doblar A,8 y A,9 pero no A,7', () => {
      const legalFor = (cards: Rank[]) =>
        legalActionsFor({
          hand: newHand(10, cards.map(c)),
          totalHands: 1,
          rules: C,
          available: 1000,
          dealerHasBlackjack: false,
        }).double;

      expect(legalFor(['A', '8'])).toBe(true); // 9 o 19
      expect(legalFor(['A', '9'])).toBe(true); // 10 o 20
      expect(legalFor(['A', '7'])).toBe(false); // 8 o 18
      expect(legalFor(['A', '2'])).toBe(false); // 3 o 13
    });

    it('A,7 contra 3-6 se planta en vez de doblar', () => {
      for (const d of ['3', '4', '5', '6'] as Rank[]) expect(cas(['A', '7'], d)).toBe('stand');
      // El resto de la fila no cambia.
      expect(cas(['A', '7'], '2')).toBe('stand');
      expect(cas(['A', '7'], '7')).toBe('stand');
      expect(cas(['A', '7'], '9')).toBe('hit');
    });

    it('5,5 sigue doblandose porque suma 10', () => {
      expect(cas(['5', '5'], '6')).toBe('double');
      expect(cas(['5', '5'], 'T')).toBe('hit');
    });

    it('no permite doblar un total fuera de 9, 10 u 11', () => {
      const l = legalActionsFor({
        hand: newHand(10, [c('T'), c('2')]),
        totalHands: 1,
        rules: C,
        available: 1000,
        dealerHasBlackjack: false,
      });
      expect(l.double).toBe(false);
    });
  });

  describe('sin rendicion', () => {
    it('16 contra 9, 10 y A pasa a pedir', () => {
      for (const d of ['9', 'T', 'A'] as Rank[]) expect(cas(['T', '6'], d)).toBe('hit');
    });

    it('15 contra 10 pasa a pedir', () => {
      expect(cas(['T', '5'], 'T')).toBe('hit');
    });

    it('17 duro se planta siempre', () => {
      expect(cas(['T', '7'], 'A')).toBe('stand');
    });

    it('8,8 contra A se divide', () => {
      expect(cas(['8', '8'], 'A')).toBe('split');
    });

    it('la mesa no ofrece rendirse en ningun momento', () => {
      const l = legalActionsFor({
        hand: newHand(10, [c('T'), c('6')]),
        totalHands: 1,
        rules: C,
        available: 1000,
        dealerHasBlackjack: false,
      });
      expect(l.surrender).toBe(false);
    });
  });

  describe('division a dos manos', () => {
    it('permite la primera division', () => {
      const l = legalActionsFor({
        hand: newHand(10, [c('8'), c('8')]),
        totalHands: 1,
        rules: C,
        available: 1000,
        dealerHasBlackjack: false,
      });
      expect(l.split).toBe(true);
    });

    it('no permite volver a dividir una vez hay dos manos', () => {
      const l = legalActionsFor({
        hand: newHand(10, [c('8'), c('8')], { fromSplit: true }),
        totalHands: 2,
        rules: C,
        available: 1000,
        dealerHasBlackjack: false,
      });
      expect(l.split).toBe(false);
    });

    it('mantiene las divisiones obligatorias y las prohibidas', () => {
      expect(cas(['A', 'A'], 'T')).toBe('split');
      expect(cas(['8', '8'], 'T')).toBe('split');
      expect(cas(['T', 'K'], '6')).toBe('stand');
      expect(cas(['9', '9'], '7')).toBe('stand');
    });
  });

  it('el resto de la tabla dura no se mueve', () => {
    expect(cas(['T', '2'], '4')).toBe('stand');
    expect(cas(['T', '2'], '2')).toBe('hit');
    expect(cas(['T', '3'], '5')).toBe('stand');
    expect(cas(['T', '4'], '7')).toBe('hit');
    expect(cas(['T', '9'], 'A')).toBe('stand');
  });

  it('un 21 tras dividir Ases no es blackjack: paga 1:1', () => {
    const hand = newHand(10, [c('A'), c('K')], { fromSplit: true, splitAces: true });
    expect(resolveHand(hand, [c('T'), c('8')], C)).toEqual({ outcome: 'win', net: 10 });
  });
});

describe('tabla de parejas resuelta', () => {
  const RULE_SETS: Array<[string, Rules]> = [
    ['casino', CASINO_RULES],
    ['permisiva S17', LIBERAL_RULES],
    ['permisiva H17', { ...LIBERAL_RULES, dealerHitsSoft17: true }],
    ['sin DAS', { ...CASINO_RULES, doubleAfterSplit: false }],
  ];

  it('no deja ninguna casilla sin resolver', () => {
    for (const [name, rules] of RULE_SETS) {
      for (const [pair, cells] of Object.entries(resolvedPairs(rules))) {
        for (const cell of cells) {
          expect(cell, `${name} · par ${pair}`).not.toBe('N');
        }
      }
    }
  });

  it('un par de doses que no se divide se juega como 4 y por tanto se pide', () => {
    const cells = resolvedPairs(CASINO_RULES)[2];
    // Contra 8, 9, 10 y As no se divide: queda un 4, que siempre pide.
    for (const i of [6, 7, 8, 9]) expect(cells[i]).toBe('H');
  });

  it('coincide celda a celda con lo que recomienda el motor', () => {
    // Si la tabla que se muestra y el corrector se separasen, la pantalla
    // estaria ensenando una jugada y el entrenador exigiendo otra.
    const expected: Record<string, Action> = {
      H: 'hit',
      S: 'stand',
      Dh: 'double',
      Ds: 'double',
      P: 'split',
      Ph: 'split',
      Rh: 'surrender',
      Rs: 'surrender',
      Rp: 'surrender',
    };

    for (const [name, rules] of RULE_SETS) {
      const table = resolvedPairs(rules);
      for (const [pair, cells] of Object.entries(table)) {
        const value = Number(pair);
        const rank: Rank = value === 11 ? 'A' : value === 10 ? 'T' : (String(value) as Rank);

        cells.forEach((cell, i) => {
          const dealerValue = DEALER_COLUMNS[i];
          const dealerRank: Rank =
            dealerValue === 11 ? 'A' : dealerValue === 10 ? 'T' : (String(dealerValue) as Rank);

          const legal: LegalActions = {
            hit: true,
            stand: true,
            double: rules.doubleAnyTotal || [9, 10, 11].includes(value * 2),
            split: true,
            surrender: rules.lateSurrender,
          };
          const got = getAdvice([c(rank), c(rank)], c(dealerRank), rules, legal);
          expect(got.action, `${name} · ${pair},${pair} vs ${dealerValue} (celda ${cell})`).toBe(
            expected[cell],
          );
        });
      }
    }
  });
});
