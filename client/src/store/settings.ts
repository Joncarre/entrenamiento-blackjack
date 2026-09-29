import { DEFAULT_RULES, type Rules } from '../engine/types';

/** Velocidad de reparto. El valor es el retardo entre cartas, en ms. */
export type Speed = 'slow' | 'normal' | 'fast' | 'instant';

export const SPEED_MS: Record<Speed, number> = {
  slow: 700,
  normal: 360,
  fast: 170,
  instant: 0,
};

export const SPEED_LABEL: Record<Speed, string> = {
  slow: 'Lenta',
  normal: 'Normal',
  fast: 'Rapida',
  instant: 'Instantanea',
};

/**
 * Nivel de ayuda durante el entrenamiento:
 *  - off:      sin pistas ni correcciones. Modo examen.
 *  - feedback: te corrige despues de decidir. Modo por defecto.
 *  - hint:     te ensena la jugada correcta antes de decidir. Modo aprendizaje.
 */
export type AssistMode = 'off' | 'feedback' | 'hint';

export const ASSIST_LABEL: Record<AssistMode, string> = {
  off: 'Examen',
  feedback: 'Correccion',
  hint: 'Aprendizaje',
};

export const ASSIST_HELP: Record<AssistMode, string> = {
  off: 'Sin pistas ni correcciones. Mide tu nivel real.',
  feedback: 'Te corrige justo despues de cada jugada.',
  hint: 'Te marca la jugada correcta antes de decidir.',
};

export interface Settings {
  rules: Rules;
  speed: Speed;
  bankrollStart: number;
  baseBet: number;
  assistMode: AssistMode;
  /** Muestra el conteo Hi-Lo (entrenamiento avanzado). */
  showCount: boolean;
  /** Impide ejecutar una jugada incorrecta: la registra, la corrige y deja reintentar. */
  strictMode: boolean;
  /** Ofrece la decision de seguro cuando el crupier ensena un As. */
  offerInsurance: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  rules: DEFAULT_RULES,
  speed: 'normal',
  bankrollStart: 100,
  baseBet: 5,
  assistMode: 'feedback',
  showCount: false,
  strictMode: false,
  offerInsurance: true,
};

const KEY = 'bj-trainer-settings-v1';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      rules: { ...DEFAULT_RULES, ...(parsed.rules ?? {}) },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* modo privado o almacenamiento lleno: no es critico */
  }
}

/** El bankroll vivo se guarda aparte: sobrevive a un refresco de pagina. */
const BANKROLL_KEY = 'bj-trainer-bankroll-v1';

export function loadBankroll(fallback: number): number {
  try {
    const raw = localStorage.getItem(BANKROLL_KEY);
    if (raw === null) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}

export function saveBankroll(value: number) {
  try {
    localStorage.setItem(BANKROLL_KEY, String(value));
  } catch {
    /* ignorado */
  }
}
