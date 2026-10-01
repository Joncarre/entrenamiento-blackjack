import { beforeEach, describe, expect, it } from 'vitest';
import { LIBERAL_RULES, type Card, type Rank } from '../engine/types';
import { DEFAULT_SETTINGS } from '../store/settings';
import { useGame } from '../store/useGame';

let n = 0;
const c = (rank: Rank): Card => ({ id: `f${n++}`, rank, suit: 'S' });

/** Penetracion total: evita que el motor rebaraje el mazo preparado del test. */
const TEST_RULES = { ...LIBERAL_RULES, penetration: 1 };

/**
 * Prepara una mesa determinista. El orden de reparto es
 * jugador, crupier, jugador, tapada, y despues las cartas extra en orden.
 */
function setupShoe(ranks: Rank[]) {
  useGame.setState({
    settings: { ...DEFAULT_SETTINGS, rules: TEST_RULES, speed: 'instant', assistMode: 'feedback' },
    shoeState: { shoe: ranks.map(c), index: 0, shuffles: 1 },
    bankroll: 100,
    pendingBet: 10,
    phase: 'betting',
    hands: [],
    dealer: [],
    roundDecisions: [],
    insuranceBet: 0,
    sessionId: null,
    stats: { rounds: 0, decisions: 0, correct: 0, net: 0, wagered: 0, streak: 0, bestStreak: 0, recent: [] },
  });
}

const g = () => useGame.getState();

describe('flujo de una ronda', () => {
  beforeEach(() => {
    useGame.setState({ epoch: 0 });
  });

  it('reparte dos cartas a cada uno y deja la del crupier tapada', async () => {
    setupShoe(['T', '9', '7', '8']);
    await g().deal();

    expect(g().hands[0].cards.map((x) => x.rank)).toEqual(['T', '7']);
    expect(g().dealer.map((x) => x.rank)).toEqual(['9', '8']);
    expect(g().dealer[1].hidden).toBe(true);
    expect(g().phase).toBe('playerTurn');
    // La apuesta se retira de la cartera al comprometerla.
    expect(g().bankroll).toBe(90);
  });

  it('plantarse cede el turno al crupier y liquida la mano', async () => {
    setupShoe(['T', 'T', '7', '8']); // jugador 17, crupier 18
    await g().deal();
    await g().act('stand');

    expect(g().phase).toBe('roundOver');
    expect(g().hands[0].outcome).toBe('lose');
    expect(g().bankroll).toBe(90);
    expect(g().stats.net).toBe(-10);
  });

  it('el crupier pide hasta 17 y paga si se pasa', async () => {
    setupShoe(['T', '6', '9', 'T', '9']); // jugador 19, crupier 16 -> +9 = 25
    await g().deal();
    await g().act('stand');

    expect(g().dealer.map((x) => x.rank)).toEqual(['6', 'T', '9']);
    expect(g().hands[0].outcome).toBe('win');
    expect(g().bankroll).toBe(110);
  });

  it('pasarse cierra la mano sin que juegue el crupier', async () => {
    setupShoe(['T', '9', '6', '8', 'K']); // jugador 16 + K = 26
    await g().deal();
    await g().act('hit');

    expect(g().phase).toBe('roundOver');
    expect(g().hands[0].outcome).toBe('bust');
    expect(g().dealer).toHaveLength(2);
    expect(g().bankroll).toBe(90);
  });

  it('el blackjack natural paga 3:2 y cierra la ronda al instante', async () => {
    setupShoe(['A', '9', 'K', '8']);
    await g().deal();

    expect(g().phase).toBe('roundOver');
    expect(g().hands[0].outcome).toBe('blackjack');
    // 100 - 10 apostados + 10 devueltos + 15 de premio.
    expect(g().bankroll).toBe(115);
  });

  it('doblar arriesga el doble y reparte una sola carta', async () => {
    setupShoe(['6', 'T', '5', '6', '9', '2']); // jugador 11 -> 20, crupier 16 -> 18
    await g().deal();
    await g().act('double');

    expect(g().hands[0].cards).toHaveLength(3);
    expect(g().hands[0].bet).toBe(20);
    expect(g().hands[0].doubled).toBe(true);
    expect(g().hands[0].outcome).toBe('win');
    expect(g().bankroll).toBe(120);
  });

  it('dividir crea dos manos y reparte una carta a cada una', async () => {
    setupShoe(['8', 'T', '8', '7', '3', '2']);
    await g().deal();
    await g().act('split');

    expect(g().hands).toHaveLength(2);
    expect(g().hands[0].cards.map((x) => x.rank)).toEqual(['8', '3']);
    expect(g().hands[1].cards.map((x) => x.rank)).toEqual(['8']);
    expect(g().hands[0].fromSplit).toBe(true);
    // Se ha comprometido una segunda apuesta.
    expect(g().bankroll).toBe(80);
    expect(g().phase).toBe('playerTurn');
  });

  it('los ases divididos reciben una sola carta y no admiten decision', async () => {
    setupShoe(['A', 'T', 'A', '7', '9', 'K', '5']);
    await g().deal();
    await g().act('split');

    expect(g().hands).toHaveLength(2);
    expect(g().hands.every((h) => h.splitAces)).toBe(true);
    expect(g().hands.every((h) => h.cards.length === 2)).toBe(true);
    expect(g().phase).toBe('roundOver');
  });

  it('la rendicion devuelve la mitad de la apuesta', async () => {
    setupShoe(['T', 'T', '6', '8']); // 16 contra 10
    await g().deal();
    await g().act('surrender');

    expect(g().hands[0].outcome).toBe('surrender');
    expect(g().bankroll).toBe(95);
    expect(g().stats.net).toBe(-5);
  });
});

describe('registro de decisiones', () => {
  it('marca como correcta la jugada que dicta la tabla', async () => {
    setupShoe(['T', '6', '6', '8', '9']); // 16 contra 6 -> plantarse
    await g().deal();
    await g().act('stand');

    expect(g().roundDecisions).toHaveLength(1);
    expect(g().roundDecisions[0]).toMatchObject({
      situationKey: 'H16v6',
      chosen: 'stand',
      optimal: 'stand',
      isCorrect: true,
    });
    expect(g().stats.correct).toBe(1);
    expect(g().stats.streak).toBe(1);
  });

  it('marca el fallo, lo explica y rompe la racha', async () => {
    setupShoe(['T', '6', '6', '8', '2']); // 16 contra 6 -> lo correcto es plantarse
    await g().deal();
    await g().act('hit');

    expect(g().roundDecisions[0]).toMatchObject({ chosen: 'hit', optimal: 'stand', isCorrect: false });
    expect(g().stats.streak).toBe(0);
    expect(g().feedback?.correct).toBe(false);
    expect(g().feedback?.optimal).toBe('stand');
  });

  it('acumula una decision por cada accion de la mano', async () => {
    setupShoe(['5', 'T', '4', '8', '3', '2', 'K']); // 9 -> pide -> 12 -> pide -> 14
    await g().deal();
    await g().act('hit');
    await g().act('hit');

    expect(g().roundDecisions).toHaveLength(2);
    expect(g().stats.decisions).toBe(2);
  });

  it('el modo estricto registra el fallo pero no ejecuta la jugada', async () => {
    setupShoe(['T', '6', '6', '8', '2']);
    useGame.setState({ settings: { ...DEFAULT_SETTINGS, rules: TEST_RULES, speed: 'instant', strictMode: true } });
    await g().deal();
    const before = g().hands[0].cards.length;
    await g().act('hit');

    expect(g().hands[0].cards).toHaveLength(before);
    expect(g().phase).toBe('playerTurn');
    expect(g().stats.decisions).toBe(1);
    expect(g().stats.correct).toBe(0);
  });
});

describe('seguro', () => {
  it('lo ofrece cuando el crupier ensena un As y penaliza aceptarlo', async () => {
    setupShoe(['T', 'A', '7', '9']); // crupier: As + 9, sin blackjack
    await g().deal();
    expect(g().phase).toBe('insurance');

    await g().takeInsurance(true);
    // 100 - 10 de apuesta - 5 de seguro.
    expect(g().insuranceBet).toBe(5);
    expect(g().stats.correct).toBe(0);
    expect(g().roundDecisions[0]).toMatchObject({ situationKey: 'INSvA', isCorrect: false });
  });

  it('rechazarlo cuenta como jugada teorica', async () => {
    setupShoe(['T', 'A', '7', '9']);
    await g().deal();
    await g().takeInsurance(false);

    expect(g().insuranceBet).toBe(0);
    expect(g().stats.correct).toBe(1);
    expect(g().phase).toBe('playerTurn');
  });

  it('paga 2:1 si el crupier tiene blackjack', async () => {
    setupShoe(['T', 'A', '7', 'K']); // el crupier tiene blackjack
    await g().deal();
    await g().takeInsurance(true);

    expect(g().phase).toBe('roundOver');
    expect(g().hands[0].outcome).toBe('lose');
    // Pierde los 10 de la mano y cobra 10 por el seguro de 5: vuelve a 100.
    expect(g().bankroll).toBe(100);
    expect(g().stats.net).toBe(0);
  });
});
