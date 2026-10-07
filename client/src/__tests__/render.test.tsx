// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { CASINO_RULES, LIBERAL_RULES, type Card, type Rank } from '../engine/types';
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

const __dirname = dirname(fileURLToPath(import.meta.url));

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
    // 10 duros (5-8 y 17-20 fusionados) + 8 blandos + 10 parejas.
    expect(rows).toHaveLength(28);
    for (const row of rows) {
      expect(row.querySelectorAll('.chart__cell')).toHaveLength(10);
    }
  });

  it('ordena las tres tablas de menor a mayor', async () => {
    useGame.setState({ settings: { ...DEFAULT_SETTINGS, rules: CASINO_RULES } });
    await mount(<ChartView />);

    const bodies = [...document.querySelectorAll('.chart tbody')];
    const headsOf = (i: number) =>
      [...bodies[i].querySelectorAll('.chart__rowhead')].map((el) => el.textContent);

    expect(headsOf(0)).toEqual(['5-8', '9', '10', '11', '12', '13', '14', '15', '16', '17-20']);
    expect(headsOf(1)).toEqual(['A,2', 'A,3', 'A,4', 'A,5', 'A,6', 'A,7', 'A,8', 'A,9']);
    expect(headsOf(2)).toEqual([
      '2,2', '3,3', '4,4', '5,5', '6,6', '7,7', '8,8', '9,9', '10,10', 'A,A',
    ]);
  });

  it('fusiona los tramos de duros que se juegan igual', async () => {
    useGame.setState({ settings: { ...DEFAULT_SETTINGS, rules: CASINO_RULES } });
    await mount(<ChartView />);

    const heads = [...document.querySelectorAll('.chart__rowhead')].map((el) => el.textContent);
    expect(heads).toContain('5-8');
    expect(heads).toContain('17-20');
    // Los totales con decision propia siguen teniendo su fila.
    for (const t of ['9', '10', '11', '12', '16']) expect(heads).toContain(t);
    // Y ya no aparecen sueltos los que se han fusionado.
    for (const t of ['5', '6', '7', '8', '18', '19', '20']) expect(heads).not.toContain(t);
  });

  it('etiqueta cada casilla con su jugada y su alternativa', async () => {
    // Con rendicion disponible, 16 contra 10 se rinde o, si no se puede, pide.
    useGame.setState({ settings: { ...DEFAULT_SETTINGS, rules: LIBERAL_RULES } });
    await mount(<ChartView />);

    const cells = [...document.querySelectorAll('.chart__cell')].map((el) => el.textContent);
    expect(cells).toContain('Rp'); // retirarse, si no pedir
    expect(cells).toContain('Dp'); // doblar, si no pedir
    expect(cells).toContain('Dq'); // doblar, si no plantarse
    // Ya no queda ninguna 'R' ni 'D' suelta sin indicar la alternativa.
    expect(cells).not.toContain('R');
    expect(cells).not.toContain('D');
    // Y separar se marca con S, no con V.
    expect(cells).not.toContain('V');
    expect(cells).not.toContain('Vp');
    expect(cells).not.toContain('Sp');

    const legend = [...document.querySelectorAll('.legend__item')].map((el) => el.textContent);
    expect(legend.some((t) => t?.includes('Retirarse; si no se puede, pedir'))).toBe(true);

    useGame.setState({ settings: { ...DEFAULT_SETTINGS, rules: CASINO_RULES } });
  });

  it('da color distinto a los dos tipos de doble', async () => {
    await mount(<ChartView />);

    const dp = [...document.querySelectorAll('.chart__cell')].filter((el) => el.textContent === 'Dp');
    const dq = [...document.querySelectorAll('.chart__cell')].filter((el) => el.textContent === 'Dq');
    expect(dp.length).toBeGreaterThan(0);

    // Comparten la letra D, asi que no pueden compartir tambien la familia de color.
    for (const el of dp) expect(el.classList.contains('is-double-hit')).toBe(true);
    for (const el of dq) expect(el.classList.contains('is-double-stand')).toBe(true);

    // Y ninguna celda conserva la clase generica antigua, que las igualaba.
    const generic = [...document.querySelectorAll('.chart__cell')].filter((el) =>
      el.classList.contains('is-double'),
    );
    expect(generic).toHaveLength(0);
  });

  it('da color distinto a los dos tipos de division', async () => {
    useGame.setState({ settings: { ...DEFAULT_SETTINGS, rules: CASINO_RULES } });
    await mount(<ChartView />);

    const cells = [...document.querySelectorAll('.chart__cell')];
    const v = cells.filter((el) => el.textContent === 'S');
    const vp = cells.filter((el) => el.textContent === 'SDp');
    expect(v.length).toBeGreaterThan(0);
    expect(vp.length).toBeGreaterThan(0);

    for (const el of v) expect(el.classList.contains('is-split')).toBe(true);
    for (const el of vp) expect(el.classList.contains('is-split-hit')).toBe(true);
    // La division condicionada no debe quedarse con el azul de la incondicional.
    for (const el of vp) expect(el.classList.contains('is-split')).toBe(false);
  });

  it('no fusiona un tramo cuando las reglas separan alguna fila', async () => {
    // Con H17 y rendicion, 17 duro se rinde contra As: deja de ser igual a 18-20.
    useGame.setState({
      settings: {
        ...DEFAULT_SETTINGS,
        rules: { ...LIBERAL_RULES, dealerHitsSoft17: true, lateSurrender: true },
      },
    });
    await mount(<ChartView />);

    const heads = [...document.querySelectorAll('.chart__rowhead')].map((el) => el.textContent);
    expect(heads).toContain('17');
    expect(heads).toContain('18-20');
    expect(heads).not.toContain('17-20');
    // El tramo bajo no depende de esas reglas y sigue fusionado.
    expect(heads).toContain('5-8');

    useGame.setState({ settings: { ...DEFAULT_SETTINGS, rules: CASINO_RULES } });
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

  it('el progreso avisa si no hay base de datos en vez de romperse', async () => {
    await mount(<StatsView />);
    expect(screen.getByText(/No hay conexion con la base de datos/)).toBeTruthy();
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
    expect(screen.getByText('Quedarse')).toBeTruthy();
    // La mesa de referencia no ofrece rendicion: el boton queda desactivado.
    expect(screen.getByText('Retirarse').closest('button')?.disabled).toBe(true);
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

describe('codigos de retirada', () => {
  it('van en morado y se separan entre si por trama', async () => {
    useGame.setState({ settings: { ...DEFAULT_SETTINGS, rules: LIBERAL_RULES } });
    await mount(<ChartView />);

    const cells = [...document.querySelectorAll('.chart__cell')];
    const rp = cells.filter((el) => el.textContent === 'Rp');
    expect(rp.length).toBeGreaterThan(0);
    for (const el of rp) expect(el.classList.contains('is-surrender-hit')).toBe(true);
    // Rp va liso, asi que no debe llevar la clase rayada.
    for (const el of rp) expect(el.classList.contains('is-surrender')).toBe(false);

    useGame.setState({ settings: { ...DEFAULT_SETTINGS, rules: CASINO_RULES } });
  });

  it('marca Rq con la variante rayada', async () => {
    useGame.setState({
      settings: {
        ...DEFAULT_SETTINGS,
        rules: { ...LIBERAL_RULES, dealerHitsSoft17: true },
      },
    });
    await mount(<ChartView />);

    const rq = [...document.querySelectorAll('.chart__cell')].filter((el) => el.textContent === 'Rq');
    expect(rq.length).toBeGreaterThan(0);
    for (const el of rq) expect(el.classList.contains('is-surrender')).toBe(true);

    useGame.setState({ settings: { ...DEFAULT_SETTINGS, rules: CASINO_RULES } });
  });
});

describe('coherencia entre la mesa y la tabla', () => {
  it('usa las mismas palabras para cada jugada en los dos sitios', async () => {
    // Con rendicion disponible la leyenda muestra los cinco codigos.
    useGame.setState({ settings: { ...DEFAULT_SETTINGS, rules: LIBERAL_RULES } });
    await mount(<ChartView />);
    const legend = [...document.querySelectorAll('.legend__item')].map((el) => el.textContent ?? '');
    cleanup();

    await mount(<DrillView />);
    const buttons = [...document.querySelectorAll('.abtn .abtn__label')].map((el) => el.textContent);

    // Lo que dice el boton tiene que aparecer tal cual en la leyenda.
    for (const word of ['Pedir', 'Quedarse', 'Doblar', 'Separar', 'Retirarse']) {
      expect(buttons, `boton ${word}`).toContain(word);
      expect(
        legend.some((t) => t.includes(word)),
        `leyenda ${word}`,
      ).toBe(true);
    }

    useGame.setState({ settings: { ...DEFAULT_SETTINGS, rules: CASINO_RULES } });
  });

  it('pinta cada jugada del mismo color en los dos sitios', () => {
    // Botones y casillas beben del mismo token, asi que basta comprobar que
    // ningun boton se quedo con un color propio escrito a mano.
    const css = readFileSync(join(__dirname, '..', 'styles', 'controls.css'), 'utf8');

    for (const token of ['--act-hit', '--act-stand', '--act-double', '--act-split', '--act-surrender']) {
      expect(css, token).toContain(`var(${token})`);
    }

    const actionBlock = css.slice(css.indexOf('.abtn--hit'), css.indexOf('.abtn.is-suggested'));
    expect(actionBlock).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(actionBlock).not.toMatch(/rgba?\(\s*\d/);
  });
});

describe('disposicion del drill', () => {
  it('pone al crupier a la izquierda y la mano propia a la derecha', async () => {
    await mount(<DrillView />);

    const board = document.querySelector('.drill__board');
    expect(board).toBeTruthy();
    const captions = [...board!.querySelectorAll('.drill__caption')].map((el) => el.textContent);
    expect(captions).toEqual(['Crupier', 'Tu mano']);

    // El orden del DOM manda: la rejilla no invierte columnas en ningun sitio.
    const sides = [...board!.children];
    expect(sides).toHaveLength(2);
    expect(sides[0].textContent).toContain('Crupier');
    expect(sides[1].textContent).toContain('Tu mano');
  });
});

describe('encadenar manos', () => {
  async function playOneHand() {
    await act(async () => {
      useGame.setState({
        settings: { ...DEFAULT_SETTINGS, rules: { ...CASINO_RULES, penetration: 1 }, speed: 'instant' },
        shoeState: {
          shoe: (['T', 'T', '9', '8', '5', '6', '7', '4', '3', '2'] as Rank[]).map((rank, i) => ({
            id: `n${i}`,
            rank,
            suit: 'S' as const,
          })),
          index: 0,
          shuffles: 1,
        },
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
  }

  it('reparte al pulsar Siguiente mano, sin pasar por la apuesta', async () => {
    await mount(<GameView />);
    await playOneHand();
    expect(useGame.getState().phase).toBe('roundOver');

    const boton = screen.getByText(/Siguiente mano/).closest('button');
    expect(boton).toBeTruthy();

    await act(async () => {
      boton!.click();
      // El reparto encadena un temporizador por carta, aun en instantaneo.
      await new Promise((r) => setTimeout(r, 150));
    });

    // Mano nueva ya repartida: ni fase de apuesta ni un segundo toque.
    // Se mira el estado y no el DOM porque las cartas de la mano anterior
    // siguen montadas mientras dura su animacion de salida, que en jsdom no
    // llega a completarse.
    const s = useGame.getState();
    expect(s.phase).toBe('playerTurn');
    expect(s.hands).toHaveLength(1);
    expect(s.hands[0].cards).toHaveLength(2);
    expect(s.dealer).toHaveLength(2);
    expect(s.hands[0].outcome).toBeUndefined();
  });

  it('deja volver a la apuesta cuando se quiere cambiar', async () => {
    await mount(<GameView />);
    await playOneHand();

    const boton = screen.getByText('Cambiar apuesta').closest('button');
    await act(async () => {
      boton!.click();
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(useGame.getState().phase).toBe('betting');
    // Y sin repartir: la mano siguiente espera a que se ajuste la apuesta.
    expect(useGame.getState().hands).toHaveLength(0);
  });
});
