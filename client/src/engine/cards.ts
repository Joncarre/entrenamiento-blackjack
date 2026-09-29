import type { Card, Hand, HandValue, Rank, Rules, Suit } from './types';

export const SUITS: Suit[] = ['S', 'H', 'D', 'C'];
export const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K'];

export const SUIT_GLYPH: Record<Suit, string> = { S: '\u2660', H: '\u2665', D: '\u2666', C: '\u2663' };
export const RANK_LABEL: Record<Rank, string> = {
  A: 'A', '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7',
  '8': '8', '9': '9', T: '10', J: 'J', Q: 'Q', K: 'K',
};

export const isRedSuit = (suit: Suit) => suit === 'H' || suit === 'D';

/** Valor nominal de la carta. El As cuenta 11 y se ajusta despues. */
export function cardValue(rank: Rank): number {
  if (rank === 'A') return 11;
  if (rank === 'T' || rank === 'J' || rank === 'Q' || rank === 'K') return 10;
  return Number(rank);
}

/** Rango normalizado para la tabla de estrategia: todas las figuras son 10. */
export function strategyRank(rank: Rank): number {
  if (rank === 'A') return 11;
  return cardValue(rank);
}

/** Etiqueta de la columna del crupier en la tabla: 2..10 o 'A'. */
export function dealerKey(card: Card): number {
  return strategyRank(card.rank);
}

export function evaluate(cards: Card[]): HandValue {
  let hard = 0;
  let aces = 0;
  for (const card of cards) {
    const v = cardValue(card.rank);
    hard += v === 11 ? 1 : v;
    if (card.rank === 'A') aces += 1;
  }
  const soft = aces > 0 && hard + 10 <= 21;
  const total = soft ? hard + 10 : hard;
  return {
    total,
    hard,
    soft,
    isBlackjack: cards.length === 2 && total === 21,
    isBust: hard > 21,
  };
}

export function handValue(hand: Hand): HandValue {
  return evaluate(hand.cards);
}

/** Es un par apto para dividir (mismo valor de estrategia). */
export function isSplittablePair(cards: Card[]): boolean {
  if (cards.length !== 2) return false;
  return strategyRank(cards[0].rank) === strategyRank(cards[1].rank);
}

let cardSeq = 0;
export function resetCardSeq() {
  cardSeq = 0;
}

function makeCard(rank: Rank, suit: Suit): Card {
  cardSeq += 1;
  return { id: `c${cardSeq}-${rank}${suit}`, rank, suit };
}

/** Construye un mazo de `decks` barajas ya mezclado (Fisher-Yates). */
export function buildShoe(decks: number, rng: () => number = Math.random): Card[] {
  const shoe: Card[] = [];
  for (let d = 0; d < decks; d += 1) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        shoe.push(makeCard(rank, suit));
      }
    }
  }
  for (let i = shoe.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
  }
  return shoe;
}

/** Numero de cartas restantes tras el cual hay que rebarajar. */
export function cutCardIndex(rules: Rules): number {
  const total = rules.decks * 52;
  return Math.floor(total * (1 - rules.penetration));
}

/** Valor Hi-Lo de una carta (para el contador opcional de entrenamiento). */
export function hiLoValue(rank: Rank): number {
  const v = strategyRank(rank);
  if (v >= 2 && v <= 6) return 1;
  if (v >= 7 && v <= 9) return 0;
  return -1;
}
