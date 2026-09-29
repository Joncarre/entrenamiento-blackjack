import { create } from 'zustand';
import { evaluate, hiLoValue, strategyRank } from '../engine/cards';
import {
  anyHandLive,
  createShoe,
  draw,
  isCutCardReached,
  legalActionsFor,
  newHand,
  settleHands,
  shouldDealerHit,
  type ShoeState,
} from '../engine/game';
import type { Action, Card, Hand, RoundPhase, Rules } from '../engine/types';
import { api, type DecisionPayload } from '../lib/api';
import { getAdvice, type LegalActions, type StrategyAdvice } from '../strategy';
import {
  DEFAULT_SETTINGS,
  loadBankroll,
  loadSettings,
  SPEED_MS,
  saveBankroll,
  saveSettings,
  type Settings,
} from './settings';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface Feedback {
  id: number;
  correct: boolean;
  chosen: Action | 'insurance-yes' | 'insurance-no';
  optimal: Action | 'insurance-no';
  handLabel: string;
  reason: string;
}

export interface SessionStats {
  rounds: number;
  decisions: number;
  correct: number;
  net: number;
  wagered: number;
  /** Aciertos consecutivos actuales. */
  streak: number;
  bestStreak: number;
  /** Ultimas 20 decisiones (true = acierto) para la barra de forma reciente. */
  recent: boolean[];
}

const EMPTY_STATS: SessionStats = {
  rounds: 0,
  decisions: 0,
  correct: 0,
  net: 0,
  wagered: 0,
  streak: 0,
  bestStreak: 0,
  recent: [],
};

interface GameState {
  settings: Settings;
  sessionId: number | null;

  shoeState: ShoeState;
  cardsSeen: number;
  runningCount: number;

  dealer: Card[];
  dealerRevealed: boolean;
  hands: Hand[];
  activeIndex: number;
  phase: RoundPhase;

  bankroll: number;
  /** Apuesta seleccionada para la proxima mano. */
  pendingBet: number;
  insuranceBet: number;

  feedback: Feedback | null;
  /** Consejo de la mano activa; se usa en modo aprendizaje y para validar. */
  advice: StrategyAdvice | null;
  legal: LegalActions;

  stats: SessionStats;
  roundDecisions: DecisionPayload[];
  /** Momento en que se pidio la decision actual, para medir el tiempo de reaccion. */
  decisionStartedAt: number;
  /** Cancela secuencias animadas obsoletas tras un reset. */
  epoch: number;
  /** Mensaje efimero de mesa (rebarajado, sin fondos...). */
  notice: string | null;

  init: () => Promise<void>;
  updateSettings: (patch: Partial<Settings>, patchRules?: Partial<Rules>) => void;
  setPendingBet: (amount: number) => void;
  adjustBet: (delta: number) => void;
  deal: () => Promise<void>;
  act: (action: Action) => Promise<void>;
  takeInsurance: (take: boolean) => Promise<void>;
  nextRound: () => void;
  rebuyBankroll: () => void;
  shuffleNow: () => void;
  dismissFeedback: () => void;
}

const NO_LEGAL: LegalActions = { hit: false, stand: false, double: false, split: false, surrender: false };

let feedbackSeq = 0;

export const useGame = create<GameState>((set, get) => {
  /** Espera el tiempo de reparto configurado. */
  const pause = (factor = 1) => sleep(SPEED_MS[get().settings.speed] * factor);

  /** Saca una carta del mazo y actualiza el conteo si es visible. */
  function takeCard(hidden = false): Card {
    const { shoeState } = get();
    const { card, index } = draw(shoeState);
    const dealt: Card = { ...card, hidden };
    set({
      shoeState: { ...shoeState, index },
      cardsSeen: get().cardsSeen + 1,
      runningCount: hidden ? get().runningCount : get().runningCount + hiLoValue(card.rank),
    });
    return dealt;
  }

  function reshuffle(silent = false) {
    const { settings, shoeState } = get();
    set({
      shoeState: createShoe(settings.rules, shoeState.shuffles),
      runningCount: 0,
      cardsSeen: 0,
      notice: silent ? get().notice : 'Barajando el mazo',
    });
    if (!silent) setTimeout(() => set((s) => (s.notice === 'Barajando el mazo' ? { notice: null } : s)), 1600);
  }

  /** Recalcula que acciones estan disponibles y cual es la jugada teorica. */
  function refreshAdvice() {
    const { hands, activeIndex, dealer, settings, bankroll } = get();
    const hand = hands[activeIndex];
    if (!hand || dealer.length === 0) {
      set({ legal: NO_LEGAL, advice: null });
      return;
    }
    const legal = legalActionsFor({
      hand,
      totalHands: hands.length,
      rules: settings.rules,
      available: bankroll,
      dealerHasBlackjack: false,
    });
    const advice = getAdvice(hand.cards, dealer[0], settings.rules, legal);
    set({ legal, advice, decisionStartedAt: Date.now() });
  }

  function registerDecision(chosen: Action, advice: StrategyAdvice, hand: Hand) {
    const isCorrect = chosen === advice.action;
    const value = evaluate(hand.cards);
    const kind: DecisionPayload['handKind'] = advice.situationKey.startsWith('P')
      ? 'pair'
      : advice.situationKey.startsWith('S')
        ? 'soft'
        : 'hard';

    const payload: DecisionPayload = {
      situationKey: advice.situationKey,
      handKind: kind,
      playerTotal: value.total,
      dealerValue: strategyRank(get().dealer[0].rank),
      chosen,
      optimal: advice.action,
      isCorrect,
      msToDecide: Date.now() - get().decisionStartedAt,
      mode: 'game',
    };

    const stats = get().stats;
    const streak = isCorrect ? stats.streak + 1 : 0;
    set({
      roundDecisions: [...get().roundDecisions, payload],
      stats: {
        ...stats,
        decisions: stats.decisions + 1,
        correct: stats.correct + (isCorrect ? 1 : 0),
        streak,
        bestStreak: Math.max(stats.bestStreak, streak),
        recent: [...stats.recent, isCorrect].slice(-20),
      },
      feedback:
        get().settings.assistMode === 'off'
          ? null
          : {
              id: ++feedbackSeq,
              correct: isCorrect,
              chosen,
              optimal: advice.action,
              handLabel: advice.handLabel,
              reason: advice.reason,
            },
    });
    return isCorrect;
  }

  /** Reparte la segunda carta a una mano recien dividida. */
  async function completeSplitHand() {
    const { hands, activeIndex } = get();
    const hand = hands[activeIndex];
    if (!hand || hand.cards.length !== 1) return;
    await pause();
    const card = takeCard();
    const updated = [...get().hands];
    const target = { ...updated[activeIndex], cards: [...updated[activeIndex].cards, card] };
    // Los ases divididos reciben una sola carta y se quedan quietos.
    if (target.splitAces) target.finished = true;
    updated[activeIndex] = target;
    set({ hands: updated });
  }

  /** Pasa a la siguiente mano pendiente; si no queda ninguna, juega el crupier. */
  async function advance() {
    const epoch = get().epoch;
    let guard = 0;
    while (guard++ < 12) {
      if (get().epoch !== epoch) return;
      const { hands } = get();
      const next = hands.findIndex((h) => !h.finished && !evaluate(h.cards).isBust);
      if (next === -1) break;

      set({ activeIndex: next });
      await completeSplitHand();
      if (get().epoch !== epoch) return;

      const hand = get().hands[next];
      const v = evaluate(hand.cards);
      // 21 o bust no admiten decision: se cierran solas.
      if (v.isBust || v.total === 21 || hand.finished) {
        const updated = [...get().hands];
        updated[next] = { ...updated[next], finished: true };
        set({ hands: updated });
        continue;
      }
      refreshAdvice();
      set({ phase: 'playerTurn' });
      return;
    }
    await dealerTurn();
  }

  async function dealerTurn() {
    const epoch = get().epoch;
    set({ phase: 'dealerTurn', legal: NO_LEGAL, advice: null });
    await pause(0.6);
    if (get().epoch !== epoch) return;

    // Revelar la carta tapada y anotarla en el conteo.
    const revealed = get().dealer.map((c) => ({ ...c, hidden: false }));
    const hole = get().dealer.find((c) => c.hidden);
    set({
      dealer: revealed,
      dealerRevealed: true,
      runningCount: get().runningCount + (hole ? hiLoValue(hole.rank) : 0),
    });

    if (anyHandLive(get().hands)) {
      while (shouldDealerHit(get().dealer, get().settings.rules)) {
        await pause();
        if (get().epoch !== epoch) return;
        set({ dealer: [...get().dealer, takeCard()] });
      }
    }
    await pause(0.5);
    if (get().epoch !== epoch) return;
    settle();
  }

  function settle() {
    const { hands, dealer, settings, bankroll, insuranceBet, roundDecisions, stats, sessionId } = get();
    const settled = settleHands(hands, dealer, settings.rules);

    const dealerBJ = evaluate(dealer).isBlackjack;
    // El seguro paga 2:1 cuando el crupier tiene blackjack.
    const insuranceNet = insuranceBet > 0 ? (dealerBJ ? insuranceBet * 2 : -insuranceBet) : 0;

    const handsNet = settled.reduce((sum, h) => sum + (h.net ?? 0), 0);
    const net = handsNet + insuranceNet;
    const wagered = settled.reduce((sum, h) => sum + h.bet, 0) + insuranceBet;

    // El dinero apostado se descontó al comprometerlo: ahora se devuelve lo que corresponda.
    const returned = settled.reduce((sum, h) => {
      if (h.outcome === 'surrender') return sum + h.bet / 2;
      if (h.outcome === 'bust' || h.outcome === 'lose') return sum;
      return sum + h.bet + (h.net ?? 0);
    }, 0);
    const insuranceReturn = insuranceBet > 0 && dealerBJ ? insuranceBet * 3 : 0;

    const newBankroll = bankroll + returned + insuranceReturn;
    saveBankroll(newBankroll);

    const nextStats: SessionStats = {
      ...stats,
      rounds: stats.rounds + 1,
      net: stats.net + net,
      wagered: stats.wagered + wagered,
    };

    set({
      hands: settled,
      bankroll: newBankroll,
      phase: 'roundOver',
      stats: nextStats,
      legal: NO_LEGAL,
    });

    if (sessionId !== null) {
      void api.saveRound({
        sessionId,
        bet: wagered,
        net,
        bankrollAfter: newBankroll,
        dealerUpcard: String(strategyRank(dealer[0].rank)),
        dealerFinal: evaluate(dealer).total,
        handsPlayed: settled.length,
        outcomes: settled.map((h) => h.outcome ?? 'push'),
        decisions: roundDecisions,
      });
    }
  }

  async function resolveNaturals() {
    const epoch = get().epoch;
    const dealerBJ = evaluate(get().dealer.map((c) => ({ ...c, hidden: false }))).isBlackjack;
    const playerBJ = get().hands.some((h) => evaluate(h.cards).isBlackjack);

    if (dealerBJ || playerBJ) {
      await pause(0.5);
      if (get().epoch !== epoch) return;
      // La carta tapada se localiza antes de descubrirla, o el conteo la perderia.
      const hole = get().dealer.find((c) => c.hidden);
      set({
        dealer: get().dealer.map((c) => ({ ...c, hidden: false })),
        dealerRevealed: true,
        hands: get().hands.map((h) => ({ ...h, finished: true })),
        runningCount: get().runningCount + (hole ? hiLoValue(hole.rank) : 0),
      });
      await pause(0.6);
      if (get().epoch !== epoch) return;
      settle();
      return;
    }
    await advance();
  }

  return {
    settings: DEFAULT_SETTINGS,
    sessionId: null,
    shoeState: createShoe(DEFAULT_SETTINGS.rules),
    cardsSeen: 0,
    runningCount: 0,
    dealer: [],
    dealerRevealed: false,
    hands: [],
    activeIndex: 0,
    phase: 'betting',
    bankroll: DEFAULT_SETTINGS.bankrollStart,
    pendingBet: DEFAULT_SETTINGS.baseBet,
    insuranceBet: 0,
    feedback: null,
    advice: null,
    legal: NO_LEGAL,
    stats: EMPTY_STATS,
    roundDecisions: [],
    decisionStartedAt: Date.now(),
    epoch: 0,
    notice: null,

    async init() {
      const settings = loadSettings();
      const bankroll = loadBankroll(settings.bankrollStart);
      set({
        settings,
        bankroll,
        pendingBet: Math.min(settings.baseBet, Math.max(bankroll, 0)),
        shoeState: createShoe(settings.rules),
      });
      const created = await api.createSession({
        decks: settings.rules.decks,
        dealerHitsSoft17: settings.rules.dealerHitsSoft17,
        doubleAfterSplit: settings.rules.doubleAfterSplit,
        lateSurrender: settings.rules.lateSurrender,
        blackjackPayout: settings.rules.blackjackPayout,
        bankroll,
        baseBet: settings.baseBet,
        assistMode: settings.assistMode,
      });
      if (created) set({ sessionId: created.id });
    },

    updateSettings(patch, patchRules) {
      const prev = get().settings;
      const next: Settings = {
        ...prev,
        ...patch,
        rules: { ...prev.rules, ...(patchRules ?? {}) },
      };
      saveSettings(next);

      // Solo las reglas invalidan una mano en curso. Cambiar la velocidad o el
      // nivel de ayuda tiene efecto inmediato sin interrumpir el juego.
      const rulesChanged = (Object.keys(patchRules ?? {}) as Array<keyof Rules>).some(
        (k) => prev.rules[k] !== next.rules[k],
      );
      set({ settings: next });

      if (!rulesChanged) {
        set({ pendingBet: Math.max(1, Math.min(get().pendingBet, Math.max(get().bankroll, 1))) });
        return;
      }

      set({ epoch: get().epoch + 1 });
      if (next.rules.decks !== prev.rules.decks) {
        set({ shoeState: createShoe(next.rules), runningCount: 0, cardsSeen: 0 });
      }

      const midRound = get().phase !== 'betting' && get().phase !== 'roundOver';
      if (midRound) {
        // La mano se cancela, asi que se devuelve todo el dinero comprometido.
        const committed = get().hands.reduce((sum, h) => sum + h.bet, 0) + get().insuranceBet;
        set({
          phase: 'betting',
          hands: [],
          dealer: [],
          dealerRevealed: false,
          insuranceBet: 0,
          roundDecisions: [],
          legal: NO_LEGAL,
          advice: null,
          bankroll: get().bankroll + committed,
          notice: 'Mano cancelada: han cambiado las reglas',
        });
        saveBankroll(get().bankroll);
        setTimeout(() => set((s) => (s.notice?.startsWith('Mano cancelada') ? { notice: null } : s)), 2200);
      }
      set({ pendingBet: Math.max(1, Math.min(get().pendingBet, Math.max(get().bankroll, 1))) });
    },

    setPendingBet(amount) {
      const max = get().bankroll;
      set({ pendingBet: Math.max(1, Math.min(Math.round(amount), Math.max(max, 1))) });
    },

    adjustBet(delta) {
      get().setPendingBet(get().pendingBet + delta);
    },

    async deal() {
      const { phase, pendingBet, bankroll, settings } = get();
      if (phase !== 'betting' && phase !== 'roundOver') return;
      if (pendingBet > bankroll) {
        set({ notice: 'No tienes saldo suficiente para esa apuesta' });
        return;
      }

      const epoch = get().epoch + 1;
      set({ epoch });

      if (isCutCardReached(get().shoeState, settings.rules)) reshuffle();

      set({
        phase: 'dealing',
        dealer: [],
        dealerRevealed: false,
        hands: [newHand(pendingBet)],
        activeIndex: 0,
        bankroll: bankroll - pendingBet,
        insuranceBet: 0,
        feedback: null,
        advice: null,
        legal: NO_LEGAL,
        roundDecisions: [],
      });

      // Reparto alterno, como en una mesa real: jugador, crupier, jugador, tapada.
      const steps: Array<'player' | 'dealer' | 'hole'> = ['player', 'dealer', 'player', 'hole'];
      for (const step of steps) {
        await pause();
        if (get().epoch !== epoch) return;
        if (step === 'player') {
          const hands = [...get().hands];
          hands[0] = { ...hands[0], cards: [...hands[0].cards, takeCard()] };
          set({ hands });
        } else {
          set({ dealer: [...get().dealer, takeCard(step === 'hole')] });
        }
      }

      await pause(0.4);
      if (get().epoch !== epoch) return;

      const upcard = get().dealer[0];
      const canInsure = get().settings.offerInsurance && upcard.rank === 'A' && get().bankroll >= pendingBet / 2;
      if (canInsure) {
        set({ phase: 'insurance', decisionStartedAt: Date.now() });
        return;
      }
      await resolveNaturals();
    },

    async takeInsurance(take) {
      const { pendingBet, settings, stats } = get();
      const amount = pendingBet / 2;

      // La estrategia basica nunca acepta el seguro: es una apuesta con ventaja para la casa.
      const isCorrect = !take;
      const streak = isCorrect ? stats.streak + 1 : 0;
      const payload: DecisionPayload = {
        situationKey: 'INSvA',
        handKind: 'insurance',
        playerTotal: evaluate(get().hands[0].cards).total,
        dealerValue: 11,
        chosen: take ? 'insurance-yes' : 'insurance-no',
        optimal: 'insurance-no',
        isCorrect,
        msToDecide: Date.now() - get().decisionStartedAt,
        mode: 'game',
      };

      set({
        insuranceBet: take ? amount : 0,
        bankroll: take ? get().bankroll - amount : get().bankroll,
        roundDecisions: [...get().roundDecisions, payload],
        stats: {
          ...stats,
          decisions: stats.decisions + 1,
          correct: stats.correct + (isCorrect ? 1 : 0),
          streak,
          bestStreak: Math.max(stats.bestStreak, streak),
          recent: [...stats.recent, isCorrect].slice(-20),
        },
        feedback:
          settings.assistMode === 'off'
            ? null
            : {
                id: ++feedbackSeq,
                correct: isCorrect,
                chosen: take ? 'insurance-yes' : 'insurance-no',
                optimal: 'insurance-no',
                handLabel: 'Seguro',
                reason: take
                  ? 'El seguro tiene ventaja para la casa en todas las barajas: la estrategia basica nunca lo acepta'
                  : 'Correcto: el seguro es una apuesta perdedora a largo plazo',
              },
      });
      await resolveNaturals();
    },

    async act(action) {
      const { phase, hands, activeIndex, advice, legal, settings } = get();
      if (phase !== 'playerTurn' || !advice) return;
      if (action !== 'insurance' && !legal[action]) return;

      const hand = hands[activeIndex];
      const wasCorrect = registerDecision(action, advice, hand);

      // Modo estricto: la jugada queda registrada como fallo, pero no se ejecuta.
      if (settings.strictMode && !wasCorrect) {
        set({ decisionStartedAt: Date.now() });
        return;
      }

      const epoch = get().epoch;

      if (action === 'stand') {
        const updated = [...get().hands];
        updated[activeIndex] = { ...updated[activeIndex], finished: true };
        set({ hands: updated, legal: NO_LEGAL });
        await advance();
        return;
      }

      if (action === 'surrender') {
        const updated = [...get().hands];
        updated[activeIndex] = { ...updated[activeIndex], finished: true, outcome: 'surrender' };
        set({ hands: updated, legal: NO_LEGAL });
        await pause(0.5);
        if (get().epoch !== epoch) return;
        await advance();
        return;
      }

      if (action === 'hit') {
        set({ legal: NO_LEGAL });
        await pause(0.7);
        if (get().epoch !== epoch) return;
        const updated = [...get().hands];
        const card = takeCard();
        const cards = [...updated[activeIndex].cards, card];
        const v = evaluate(cards);
        updated[activeIndex] = { ...updated[activeIndex], cards, finished: v.isBust || v.total === 21 };
        set({ hands: updated });
        if (updated[activeIndex].finished) {
          await pause(0.6);
          if (get().epoch !== epoch) return;
          await advance();
        } else {
          refreshAdvice();
        }
        return;
      }

      if (action === 'double') {
        const updated = [...get().hands];
        const target = updated[activeIndex];
        set({ bankroll: get().bankroll - target.bet, legal: NO_LEGAL });
        await pause(0.7);
        if (get().epoch !== epoch) return;
        const cards = [...target.cards, takeCard()];
        const after = [...get().hands];
        after[activeIndex] = { ...target, cards, bet: target.bet * 2, doubled: true, finished: true };
        set({ hands: after });
        await pause(0.7);
        if (get().epoch !== epoch) return;
        await advance();
        return;
      }

      if (action === 'split') {
        const current = get().hands[activeIndex];
        const [first, second] = current.cards;
        const aces = strategyRank(first.rank) === 11;
        const left: Hand = { ...current, cards: [first], fromSplit: true, splitAces: aces };
        const right = newHand(current.bet, [second], { fromSplit: true, splitAces: aces });
        const updated = [...get().hands];
        updated.splice(activeIndex, 1, left, right);
        set({ hands: updated, bankroll: get().bankroll - current.bet, legal: NO_LEGAL });
        await pause(0.6);
        if (get().epoch !== epoch) return;
        await advance();
      }
    },

    nextRound() {
      set({
        phase: 'betting',
        hands: [],
        dealer: [],
        dealerRevealed: false,
        activeIndex: 0,
        feedback: null,
        advice: null,
        legal: NO_LEGAL,
        insuranceBet: 0,
        roundDecisions: [],
        pendingBet: Math.max(1, Math.min(get().pendingBet, Math.max(get().bankroll, 1))),
      });
    },

    rebuyBankroll() {
      const amount = get().settings.bankrollStart;
      saveBankroll(amount);
      set({ bankroll: amount, notice: `Cartera recargada a ${amount} EUR`, pendingBet: get().settings.baseBet });
      setTimeout(() => set((s) => (s.notice?.startsWith('Cartera') ? { notice: null } : s)), 2000);
    },

    shuffleNow() {
      reshuffle();
    },

    dismissFeedback() {
      set({ feedback: null });
    },

  };
});
