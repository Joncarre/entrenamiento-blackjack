/** Tipos base del dominio Blackjack. */

export type Suit = 'S' | 'H' | 'D' | 'C';

/** Rango de carta. 'T' agrupa el 10 numerico; J/Q/K se representan aparte para mostrarlas. */
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K';

export interface Card {
  /** Identificador unico e irrepetible dentro de una sesion (clave de animacion). */
  id: string;
  rank: Rank;
  suit: Suit;
  /** Si esta boca abajo (carta oculta del crupier). */
  hidden?: boolean;
}

/** Acciones que puede tomar el jugador. */
export type Action = 'hit' | 'stand' | 'double' | 'split' | 'surrender' | 'insurance';

/** Resultado de una mano ya resuelta. */
export type HandOutcome =
  | 'blackjack'
  | 'win'
  | 'push'
  | 'lose'
  | 'bust'
  | 'surrender';

export interface Hand {
  id: string;
  cards: Card[];
  /** Apuesta comprometida en esta mano concreta. */
  bet: number;
  /** Se ha doblado. */
  doubled: boolean;
  /** Proviene de un split. */
  fromSplit: boolean;
  /** Es un par de Ases dividido (solo recibe una carta). */
  splitAces: boolean;
  /** El jugador ya no puede actuar sobre ella. */
  finished: boolean;
  outcome?: HandOutcome;
  /** Ganancia neta (negativa si pierde). Se rellena al resolver. */
  net?: number;
}

export interface HandValue {
  /** Mejor total valido (<= 21 si es posible). */
  total: number;
  /** Total contando todos los ases como 1. */
  hard: number;
  /** El total usa un As como 11. */
  soft: boolean;
  isBlackjack: boolean;
  isBust: boolean;
}

/** Reglas de la mesa. Determinan la tabla de estrategia optima aplicable. */
export interface Rules {
  decks: number;
  /** true = el crupier pide con 17 blando (H17); false = se planta (S17). */
  dealerHitsSoft17: boolean;
  /** Se puede doblar tras dividir. */
  doubleAfterSplit: boolean;
  /** Rendicion tardia disponible. */
  lateSurrender: boolean;
  /** Numero maximo de manos simultaneas via split. */
  maxSplitHands: number;
  /** Se puede doblar con cualquier total (true) o solo 9/10/11 (false). */
  doubleAnyTotal: boolean;
  /** Pago del blackjack: 1.5 = 3:2, 1.2 = 6:5. */
  blackjackPayout: number;
  /** Penetracion: fraccion del mazo jugada antes de barajar. */
  penetration: number;
}

export const DEFAULT_RULES: Rules = {
  decks: 6,
  dealerHitsSoft17: false,
  doubleAfterSplit: true,
  lateSurrender: true,
  maxSplitHands: 4,
  doubleAnyTotal: true,
  blackjackPayout: 1.5,
  penetration: 0.75,
};

export type RoundPhase =
  | 'betting'
  | 'dealing'
  | 'insurance'
  | 'playerTurn'
  | 'dealerTurn'
  | 'settling'
  | 'roundOver';
