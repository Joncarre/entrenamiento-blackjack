import { useEffect, useMemo, useState } from 'react';
import { api, type SituationStat } from '../lib/api';
import { useGame } from '../store/useGame';
import { type Cell, DEALER_COLUMNS, resolvedTables } from '../strategy';

/**
 * Etiqueta que se pinta dentro de cada celda.
 *
 * Mayuscula = jugada que quieres hacer. Minuscula = a que recurres si la mesa
 * o la mano no te dejan hacerla. Asi "Rp" se lee "rendirse; si no se puede,
 * pedir", sin tener que recordar ninguna nota al pie.
 *
 * Ojo: la minuscula de la etiqueta no sigue el codigo interno de la tabla,
 * que esta en ingles. El 'Rh' del fuente se muestra aqui como "Rp".
 */
const CELL_TEXT: Record<Cell, string> = {
  H: 'P',
  S: 'Q',
  Dh: 'Dp',
  Ds: 'Dq',
  P: 'V',
  Ph: 'Vp',
  N: '·',
  Rh: 'Rp',
  Rs: 'Rq',
  Rp: 'Rv',
};

/** Texto largo de cada codigo. Alimenta la leyenda y el tooltip de la celda. */
const CELL_HELP: Record<Cell, string> = {
  H: 'Pedir',
  S: 'Plantarse',
  Dh: 'Doblar; si no se puede, pedir',
  Ds: 'Doblar; si no se puede, plantarse',
  P: 'Dividir',
  Ph: 'Dividir si se puede doblar despues; si no, pedir',
  N: 'No dividir: juega el total',
  Rh: 'Rendirse; si no se puede, pedir',
  Rs: 'Rendirse; si no se puede, plantarse',
  Rp: 'Rendirse; si no se puede, dividir',
};

const LEGEND: Cell[] = ['H', 'S', 'Dh', 'Ds', 'P', 'Ph', 'Rh', 'Rs', 'Rp'];

/**
 * Familia de color de cada celda.
 *
 * Los dos dobles van separados a proposito: comparten la D, asi que si
 * compartieran tambien el color no habria forma de distinguirlos de un vistazo.
 */
function family(cell: Cell): string {
  if (cell === 'H') return 'hit';
  if (cell === 'S') return 'stand';
  if (cell === 'Dh') return 'double-hit';
  if (cell === 'Ds') return 'double-stand';
  if (cell === 'P' || cell === 'Ph') return 'split';
  if (cell === 'Rh' || cell === 'Rs' || cell === 'Rp') return 'surrender';
  return 'none';
}

const softLabel = (total: number) => `A,${total - 11}`;
const pairLabel = (v: number) => (v === 11 ? 'A,A' : v === 10 ? '10,10' : `${v},${v}`);

type Section = 'hard' | 'soft' | 'pairs';

interface ChartRow {
  /** Etiqueta visible: un total suelto o un rango fusionado. */
  label: string;
  /** Totales que representa la fila. Varios si esta fusionada. */
  totals: number[];
  cells: Cell[];
}

/**
 * Tramos de totales duros candidatos a fusionarse. Los extremos se juegan
 * siempre igual, asi que ocupar cuatro filas para repetir la misma jugada
 * solo estorba al memorizarla.
 */
const HARD_GROUPS: number[][] = [[5, 6, 7, 8], [9], [10], [11], [12], [13], [14], [15], [16], [17, 18, 19, 20]];

/**
 * Fusiona un tramo solo si la jugada es identica en todas sus filas. Con H17 y
 * rendicion, por ejemplo, el 17 se rinde contra As y se separa del 18-20 solo.
 */
function buildHardRows(hard: Record<number, Cell[]>): ChartRow[] {
  const out: ChartRow[] = [];

  for (const group of HARD_GROUPS) {
    let run: number[] = [];

    const flush = () => {
      if (run.length === 0) return;
      out.push({
        label: run.length > 1 ? `${run[0]}-${run[run.length - 1]}` : String(run[0]),
        totals: run,
        cells: hard[run[0]],
      });
      run = [];
    };

    for (const total of group) {
      if (!hard[total]) continue;
      // Al primer total que se juegue distinto se cierra el tramo abierto, de
      // modo que un grupo parcialmente distinto se parte en vez de deshacerse.
      if (run.length > 0 && hard[total].join() !== hard[run[0]].join()) flush();
      run.push(total);
    }
    flush();
  }
  return out;
}

export function ChartView() {
  const rules = useGame((s) => s.settings.rules);
  const [heat, setHeat] = useState(false);
  const [stats, setStats] = useState<Map<string, SituationStat>>(new Map());

  const tables = useMemo(() => resolvedTables(rules), [rules]);

  useEffect(() => {
    if (!heat) return;
    void api.situations().then((rows) => {
      if (rows) setStats(new Map(rows.map((r) => [r.key, r])));
    });
  }, [heat]);

  const sections: Array<{ id: Section; title: string; note: string; rows: ChartRow[] }> = [
    {
      id: 'hard',
      title: 'Totales duros',
      note: 'Manos sin As, o con el As contando como 1. Los tramos que se juegan igual van en una sola fila.',
      rows: buildHardRows(tables.hard),
    },
    {
      id: 'soft',
      title: 'Totales blandos',
      note: 'Con un As que todavia puede valer 11.',
      rows: Object.entries(tables.soft)
        .filter(([k]) => Number(k) <= 20)
        .map(([k, cells]) => ({ label: softLabel(Number(k)), totals: [Number(k)], cells })),
    },
    {
      id: 'pairs',
      title: 'Parejas',
      note: 'Se consultan antes que el total. Un punto significa "no dividir": juega el total.',
      rows: Object.entries(tables.pairs)
        .sort((a, b) => Number(b[0]) - Number(a[0]))
        .map(([k, cells]) => ({ label: pairLabel(Number(k)), totals: [Number(k)], cells })),
    },
  ];

  const usedCells = new Set<Cell>(sections.flatMap((s) => s.rows.flatMap((r) => r.cells)));

  const keyFor = (section: Section, total: number, dealer: number) => {
    const d = dealer === 11 ? 'A' : String(dealer);
    const prefix = section === 'hard' ? 'H' : section === 'soft' ? 'S' : 'P';
    return `${prefix}${total}v${d}`;
  };

  /** Suma los aciertos de todos los totales que agrupa una fila fusionada. */
  const heatFor = (section: Section, row: ChartRow, dealer: number) => {
    if (!heat) return undefined;
    let total = 0;
    let correct = 0;
    for (const t of row.totals) {
      const stat = stats.get(keyFor(section, t, dealer));
      if (stat) {
        total += stat.total;
        correct += stat.correct;
      }
    }
    return total > 0 ? { total, correct, accuracy: correct / total } : undefined;
  };

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <h1 className="page__title">Tabla de estrategia</h1>
          <p className="page__sub">
            Esta es la tabla que aplica <strong>con las reglas que tienes puestas</strong>, no la tabla
            generica: las casillas que tu mesa no permite ya vienen resueltas.
          </p>
          <p className="chart-rules num">
            {rules.decks} barajas · la banca {rules.dealerHitsSoft17 ? 'pide' : 'se planta'} con 17 blando ·
            dobla {rules.doubleAnyTotal ? 'cualquier total' : 'solo 9/10/11'} ·{' '}
            {rules.doubleAfterSplit ? 'con' : 'sin'} doble tras dividir ·{' '}
            {rules.lateSurrender ? 'con' : 'sin'} rendicion · hasta {rules.maxSplitHands} manos ·
            blackjack {rules.blackjackPayout === 1.5 ? '3:2' : '6:5'}
          </p>
        </div>
        <label className="toggle">
          <input type="checkbox" checked={heat} onChange={(e) => setHeat(e.target.checked)} />
          <span className="toggle__track">
            <span className="toggle__thumb" />
          </span>
          <span className="toggle__text">Mis aciertos</span>
        </label>
      </header>

      {/* Solo se explican los codigos que de verdad aparecen en esta mesa. */}
      <div className="legend">
        {LEGEND.filter((cell) => usedCells.has(cell)).map((cell) => (
          <span key={cell} className="legend__item">
            <span className={`legend__swatch is-${family(cell)}`}>{CELL_TEXT[cell]}</span>
            {CELL_HELP[cell]}
          </span>
        ))}
      </div>

      {heat && (
        <p className="chart-hint">
          El borde marca tu acierto en cada casilla: verde si la dominas, rojo si falla. Sin borde = sin datos todavia.
        </p>
      )}

      {sections.map((section) => (
        <section key={section.id} className="chart-section">
          <h2 className="chart-section__title">{section.title}</h2>
          <p className="chart-section__note">{section.note}</p>
          <div className="chart-scroll">
            <table className="chart">
              <thead>
                <tr>
                  <th className="chart__corner">Tu mano</th>
                  {DEALER_COLUMNS.map((d) => (
                    <th key={d} className="num">
                      {d === 11 ? 'A' : d}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {section.rows.map((row) => (
                  <tr key={row.label}>
                    <th className="chart__rowhead num">{row.label}</th>
                    {row.cells.map((cell, i) => {
                      const dealer = DEALER_COLUMNS[i];
                      const stat = heatFor(section.id, row, dealer);
                      const acc = stat ? stat.accuracy : undefined;
                      const tone =
                        acc === undefined ? '' : acc >= 0.9 ? ' heat-good' : acc >= 0.6 ? ' heat-mid' : ' heat-bad';
                      return (
                        <td
                          key={dealer}
                          className={`chart__cell is-${family(cell)}${tone}`}
                          title={
                            stat
                              ? `${CELL_HELP[cell]} · ${stat.correct}/${stat.total} aciertos`
                              : CELL_HELP[cell]
                          }
                        >
                          {CELL_TEXT[cell]}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <section className="chart-section">
        <h2 className="chart-section__title">Reglas que no aparecen en la tabla</h2>
        <ul className="rulelist">
          <li>
            <b>Nunca aceptes el seguro.</b> Paga 2:1, pero el crupier completa blackjack menos de un tercio de
            las veces: a la larga siempre pierde dinero, incluso con una mano buena.
          </li>
          <li>
            <b>Divide siempre Ases y ochos.</b> Y nunca dividas dieces ni cincos.
          </li>
          <li>
            <b>Orden de decision:</b> {rules.lateSurrender ? 'primero mira si toca rendirse, luego ' : 'primero mira si toca '}
            dividir, luego doblar y por ultimo pedir o plantarse.
          </li>
          {!rules.doubleAnyTotal && (
            <li>
              <b>En esta mesa solo se dobla con 9, 10 u 11.</b> Por eso no veras ningun doble en las manos
              blandas: A,7 contra 3-6 se planta y A,2 a A,6 simplemente piden.
            </li>
          )}
          {!rules.lateSurrender && (
            <li>
              <b>Esta mesa no tiene rendicion.</b> 15 y 16 contra 9, 10 o As no se abandonan: se piden, aunque
              duela.
            </li>
          )}
          {rules.maxSplitHands <= 2 && (
            <li>
              <b>Solo se divide una vez.</b> Si tras dividir te vuelve a salir una pareja, se juega como un total
              normal.
            </li>
          )}
          <li>
            <b>Si no puedes doblar</b> por tener ya tres cartas o por falta de saldo, una D se convierte en pedir.
          </li>
        </ul>
      </section>
    </div>
  );
}
