// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { CASINO_RULES, type Card, type Rank } from '../engine/types';
import { DEFAULT_SETTINGS } from '../store/settings';
import { useGame } from '../store/useGame';
import { ChartView } from '../views/ChartView';
import { DrillView } from '../views/DrillView';
import { GameView } from '../views/GameView';
import { SettingsView } from '../views/SettingsView';
import { StatsView } from '../views/StatsView';

beforeAll(() => {
  // jsdom no implementa estas dos APIs que usan las graficas y framer-motion.
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;

  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });

  // El backend no esta levantado en los tests: la app tiene que aguantarlo.
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('sin servidor'))));
});

afterEach(cleanup);

/** Monta un componente y deja que terminen sus efectos de arranque. */
async function mount(ui: React.ReactElement) {
  render(ui);
  await act(async () => {
    await new Promise((r) => setTimeout(r, 25));
  });
}

let seq = 0;
const deck = (ranks: Rank[]): Card[] => ranks.map((rank) => ({ id: `x${seq++}`, rank, suit: 'S' }));

describe('el armazon de la aplicacion monta', () => {
  it('arranca en la mesa con todas las secciones accesibles', async () => {
    await mount(<App />);
    expect(screen.getByText('Jugadas teoricas')).toBeTruthy();
    for (const label of ['Mesa', 'Entrenar', 'Tabla', 'Progreso', 'Ajustes']) {
      expect(screen.getAllByText(label).length, label).toBeGreaterThan(0);
    }
  });
});

describe('cada vista se renderiza sin errores', () => {
  it('la mesa ofrece apostar y repartir', async () => {
    await mount(<GameView />);
    expect(screen.getByText(/Repartir/)).toBeTruthy();
    expect(screen.getByText(/Elige tu apuesta/)).toBeTruthy();
    // Las cuatro fichas de apuesta.
    expect(document.querySelectorAll('.chip')).toHaveLength(4);
  });

  it('la tabla de estrategia pinta 10 columnas en todas las filas', async () => {
    await mount(<ChartView />);
    expect(screen.getByText('Totales duros')).toBeTruthy();
    expect(screen.getByText('Totales blandos')).toBeTruthy();
    expect(screen.getByText('Parejas')).toBeTruthy();

    const rows = document.querySelectorAll('.chart tbody tr');
    // 16 duros + 8 blandos + 10 parejas.
    expect(rows).toHaveLength(34);
    for (const row of rows) {
      expect(row.querySelectorAll('.chart__cell')).toHaveLength(10);
    }
  });

  it('el drill propone una situacion jugable con sus acciones', async () => {
    await mount(<DrillView />);
    expect(screen.getByText('Crupier')).toBeTruthy();
    expect(screen.getByText('Tu mano')).toBeTruthy();
    // Una carta del crupier y al menos dos del jugador.
    expect(document.querySelectorAll('.pcard').length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText('Pedir')).toBeTruthy();
  });

  it('los ajustes muestran los bloques de configuracion', async () => {
    await mount(<SettingsView />);
    expect(screen.getByText('Entrenamiento')).toBeTruthy();
    expect(screen.getByText('Mesa')).toBeTruthy();
    expect(screen.getByText('Reglas de la casa')).toBeTruthy();
    expect(screen.getByText(/Apuesta base/)).toBeTruthy();
  });

  it('el progreso avisa si no hay servidor en vez de romperse', async () => {
    await mount(<StatsView />);
    expect(screen.getByText(/No hay conexion con el servidor/)).toBeTruthy();
  });
});

describe('la mesa reacciona al juego', () => {
  it('pinta las cuatro cartas y habilita las acciones en el turno del jugador', async () => {
    await mount(<GameView />);

    // El estado se fija despues de montar: init() reconstruye el mazo al arrancar.
    await act(async () => {
      useGame.setState({
        settings: { ...DEFAULT_SETTINGS, rules: { ...CASINO_RULES, penetration: 1 }, speed: 'instant' },
        shoeState: { shoe: deck(['T', '9', '6', '8', '5']), index: 0, shuffles: 1 },
        bankroll: 100,
        pendingBet: 10,
        phase: 'betting',
        hands: [],
        dealer: [],
        epoch: 0,
      });
      await useGame.getState().deal();
    });

    expect(useGame.getState().phase).toBe('playerTurn');
    // Dos cartas del jugador y dos del crupier.
    expect(document.querySelectorAll('.pcard')).toHaveLength(4);
    expect(screen.getByText('Pedir')).toBeTruthy();
    expect(screen.getByText('Plantarse')).toBeTruthy();
    // La mesa de referencia no ofrece rendicion: el boton queda desactivado.
    expect(screen.getByText('Rendirse').closest('button')?.disabled).toBe(true);
    // 16 duro tampoco se puede doblar: solo se dobla con 9, 10 u 11.
    expect(screen.getByText('Doblar').closest('button')?.disabled).toBe(true);
  });

  it('muestra el resultado de la mano al terminar la ronda', async () => {
    await mount(<GameView />);

    await act(async () => {
      useGame.setState({
        settings: { ...DEFAULT_SETTINGS, rules: { ...CASINO_RULES, penetration: 1 }, speed: 'instant' },
        shoeState: { shoe: deck(['T', 'T', '9', '8']), index: 0, shuffles: 1 },
        bankroll: 100,
        pendingBet: 10,
        phase: 'betting',
        hands: [],
        dealer: [],
        epoch: 0,
      });
      await useGame.getState().deal();
      await useGame.getState().act('stand');
    });

    expect(useGame.getState().phase).toBe('roundOver');
    expect(screen.getByText(/Ganas/)).toBeTruthy();
    expect(screen.getByText(/Siguiente mano/)).toBeTruthy();
  });
});
