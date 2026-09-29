import { buildShoe, cutCardIndex, evaluate, isSplittablePair, strategyRank } from './cards';
import type { Card, Hand, HandOutcome, Rules } from './types';

export interface ShoeState {
  shoe: Card[];
  /** Indice de la siguiente carta a repartir. */
  index: number;
  /** Numero de barajados realizados (para animar el corte). */
  shuffles: number;
}

export function createShoe(rules: Rules, shuffles = 0): ShoeState {
  return { shoe: buildShoe(rules.decks), index: 0, shuffles: shuffles + 1 };
}

/** Se ha alcanzado la carta de corte: toca rebarajar al final de la mano. */
export function isCutCardReached(shoeState: ShoeState, rules: Rules): boolean {
  return shoeState.shoe.length - shoeState.index <= cutCardIndex(rules);
}

/** Saca una carta. Devuelve la carta y el nuevo indice (no muta el mazo). */
export function draw(shoeState: ShoeState): { card: Card; index: number } {
  const card = shoeState.shoe[shoeState.index];
  if (!card) throw new Error('Mazo agotado: habia que rebarajar antes de repartir.');
  return { card, index: shoeState.index + 1 };
}

let handSeq = 0;
export function newHand(bet: number, cards: Card[] = [], opts: Partial<Hand> = {}): Hand {
  handSeq += 1;
  return {
    id: `h${handSeq}`,
    cards,
    bet,
    doubled: false,
    fromSplit: false,
    splitAces: false,
    finished: false,
    ...opts,
  };
}

/* ------------------------------------------------------------------ *
 * Legalidad de acciones
 * ------------------------------------------------------------------ */

export interface LegalityContext {
  hand: Hand;
  totalHands: number;
  rules: Rules;
  /** Dinero libre disponible para comprometer mas apuesta. */
  available: number;
  /** El crupier ya ha revelado blackjack. */
  dealerHasBlackjack: boolean;
}

export function legalActionsFor(ctx: LegalityContext) {
  const { hand, totalHands, rules, available, dealerHasBlackjack } = ctx;
  const value = evaluate(hand.cards);
  const fresh = hand.cards.length === 2;
  const playable = !hand.finished && !value.isBust && !value.isBlackjack && !dealerHasBlackjack;

  if (!playable || hand.splitAces) {
    return { hit: false, stand: false, double: false, split: false, surrender: false };
  }

  const canAffordExtra = available >= hand.bet;
  const doubleTotalOk = rules.doubleAnyTotal || [9, 10, 11].includes(value.total);
  const doubleSplitOk = !hand.fromSplit || rules.doubleAfterSplit;

  return {
    hit: true,
    stand: true,
    double: fresh && canAffordExtra && doubleTotalOk && doubleSplitOk,
    split:
      fresh &&
      isSplittablePair(hand.cards) &&
      totalHands < rules.maxSplitHands &&
      canAffordExtra &&
      // No se vuelven a dividir Ases ya divididos.
      !(hand.fromSplit && strategyRank(hand.cards[0].rank) === 11),
    surrender: fresh && !hand.fromSplit && rules.lateSurrender,
  };
}

/* ------------------------------------------------------------------ *
 * Turno del crupier
 * ------------------------------------------------------------------ */

export function shouldDealerHit(cards: Card[], rules: Rules): boolean {
  const { total, soft } = evaluate(cards);
  if (total < 17) return true;
  if (total === 17 && soft && rules.dealerHitsSoft17) return true;
  return false;
}

/* ------------------------------------------------------------------ *
 * Liquidacion
 * ------------------------------------------------------------------ */

/** Resuelve una mano contra la del crupier y devuelve resultado + ganancia neta. */
export function resolveHand(hand: Hand, dealerCards: Card[], rules: Rules): { outcome: HandOutcome; net: number } {
  if (hand.outcome === 'surrender') return { outcome: 'surrender', net: -hand.bet / 2 };

  const p = evaluate(hand.cards);
  const d = evaluate(dealerCards);

  if (p.isBust) return { outcome: 'bust', net: -hand.bet };

  // El blackjack natural solo cuenta si no viene de un split.
  const playerBJ = p.isBlackjack && !hand.fromSplit;
  const dealerBJ = d.isBlackjack;

  if (playerBJ && dealerBJ) return { outcome: 'push', net: 0 };
  if (playerBJ) return { outcome: 'blackjack', net: hand.bet * rules.blackjackPayout };
  if (dealerBJ) return { outcome: 'lose', net: -hand.bet };

  if (d.isBust) return { outcome: 'win', net: hand.bet };
  if (p.total > d.total) return { outcome: 'win', net: hand.bet };
  if (p.total < d.total) return { outcome: 'lose', net: -hand.bet };
  return { outcome: 'push', net: 0 };
}

export function settleHands(hands: Hand[], dealerCards: Card[], rules: Rules): Hand[] {
  return hands.map((hand) => {
    const { outcome, net } = resolveHand(hand, dealerCards, rules);
    return { ...hand, outcome, net, finished: true };
  });
}

/** El crupier solo juega si queda alguna mano viva del jugador. */
export function anyHandLive(hands: Hand[]): boolean {
  return hands.some(
    (h) => h.outcome !== 'surrender' && !evaluate(h.cards).isBust && !evaluate(h.cards).isBlackjack,
  );
}

/** Texto del resultado para la UI. */
export const OUTCOME_LABEL: Record<HandOutcome, string> = {
  blackjack: 'Blackjack',
  win: 'Ganas',
  push: 'Empate',
  lose: 'Pierdes',
  bust: 'Te pasas',
  surrender: 'Rendida',
};
