/**
 * Cliente de la API de estadisticas.
 *
 * Todo es tolerante a fallos a proposito: si el servidor no esta levantado,
 * la mesa debe seguir siendo jugable. Solo se pierde la persistencia.
 */

export interface DecisionPayload {
  situationKey: string;
  handKind: 'hard' | 'soft' | 'pair' | 'insurance';
  playerTotal: number;
  dealerValue: number;
  chosen: string;
  optimal: string;
  isCorrect: boolean;
  msToDecide?: number;
  mode?: 'game' | 'drill';
}

export interface RoundPayload {
  sessionId: number;
  bet: number;
  net: number;
  bankrollAfter: number;
  dealerUpcard: string;
  dealerFinal: number;
  handsPlayed: number;
  outcomes: string[];
  decisions: DecisionPayload[];
}

export interface StatsSummary {
  sessions: number;
  rounds: number;
  hands: number;
  net: number;
  wagered: number;
  edge: number;
  decisions: number;
  correct: number;
  accuracy: number;
  recentAccuracy: number;
  recentSample: number;
  avgMs: number;
  outcomes: Record<string, number>;
}

export interface ProgressPoint {
  bucket: number;
  from: number;
  to: number;
  total: number;
  correct: number;
  accuracy: number;
  at: string;
}

export interface BankrollPoint {
  id: number;
  sessionId: number;
  net: number;
  bankroll: number;
  at: string;
}

export interface SituationStat {
  key: string;
  kind: string;
  playerTotal: number;
  dealerValue: number;
  total: number;
  correct: number;
  accuracy: number;
  optimal: string;
}

export interface MistakeStat {
  key: string;
  chosen: string;
  optimal: string;
  count: number;
}

/** Estado de conexion con el backend, para avisar en la UI sin bloquear el juego. */
let online = true;
const listeners = new Set<(v: boolean) => void>();

export function onConnectionChange(fn: (v: boolean) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function setOnline(v: boolean) {
  if (online === v) return;
  online = v;
  listeners.forEach((fn) => fn(v));
}

export const isOnline = () => online;

async function request<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(`/api${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    setOnline(true);
    return (await res.json()) as T;
  } catch {
    setOnline(false);
    return null;
  }
}

export const api = {
  createSession: (body: Record<string, unknown>) =>
    request<{ id: number }>('/sessions', { method: 'POST', body: JSON.stringify(body) }),

  saveRound: (body: RoundPayload) =>
    request<{ id: number }>('/rounds', { method: 'POST', body: JSON.stringify(body) }),

  saveDecisions: (sessionId: number, decisions: DecisionPayload[]) =>
    request<{ saved: number }>('/rounds/decisions', {
      method: 'POST',
      body: JSON.stringify({ sessionId, decisions }),
    }),

  summary: () => request<StatsSummary>('/stats/summary'),
  progress: (bucket = 25) => request<ProgressPoint[]>(`/stats/progress?bucket=${bucket}`),
  bankroll: () => request<BankrollPoint[]>('/stats/bankroll'),
  situations: () => request<SituationStat[]>('/stats/situations'),
  mistakes: (limit = 10) => request<MistakeStat[]>(`/stats/mistakes?limit=${limit}`),
  resetAll: () => request<{ ok: boolean }>('/stats', { method: 'DELETE' }),
};
