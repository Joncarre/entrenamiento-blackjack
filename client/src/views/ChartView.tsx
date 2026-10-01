import { useEffect, useMemo, useState } from 'react';
import { api, type SituationStat } from '../lib/api';
import { useGame } from '../store/useGame';
import { type Cell, DEALER_COLUMNS, resolvedTables } from '../strategy';

/** Etiqueta corta que se pinta dentro de cada celda. */
const CELL_TEXT: Record<Cell, string> = {
  H: 'P',
  S: 'Q',
  Dh: 'D',
  Ds: 'D',
  P: 'V',
  Ph: 'V*',
  N: '·',
  Rh: 'R',
  Rs: 'R',
  Rp: 'R',
};

const LEGEND: Array<{ cell: Cell; text: string }> = [
  { cell: 'H', text: 'Pedir' },
  { cell: 'S', text: 'Plantarse' },
  { cell: 'Dh', text: 'Doblar (si no, pedir)' },
  { cell: 'Ds', text: 'Doblar (si no, plantarse)' },
  { cell: 'P', text: 'Dividir' },
  { cell: 'Ph', text: 'Dividir solo con DAS' },
  { cell: 'Rh', text: 'Rendirse' },
];

/** Agrupa las celdas por familia de color. */
function family(cell: Cell): string {
  if (cell === 'H') return 'hit';
  if (cell === 'S') return 'stand';
  if (cell === 'Dh' || cell === 'Ds') return 'double';
  if (cell === 'P' || cell === 'Ph') return 'split';
  if (cell === 'Rh' || cell === 'Rs' || cell === 'Rp') return 'surrender';
  return 'none';
}

const softLabel = (total: number) => `A,${total - 11}`;
const pairLabel = (v: number) => (v === 11 ? 'A,A' : v === 10 ? '10,10' : `${v},${v}`);

type Section = 'hard' | 'soft' | 'pairs';

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

  const sections: Array<{ id: Section; title: string; note: string; rows: Array<[string, string, Cell[]]> }> = [
    {
      id: 'hard',
      title: 'Totales duros',
      note: 'Manos sin As, o con el As contando como 1.',
      // Se listan todas las filas jugables para que el mapa de calor case
      // exactamente con las claves que registra la partida.
      rows: Object.entries(tables.hard)
        .filter(([k]) => Number(k) >= 5 && Number(k) <= 20)
        .map(([k, cells]) => [k, k, cells] as [string, string, Cell[]]),
    },
    {
      id: 'soft',
      title: 'Totales blandos',
      note: 'Con un As que todavia puede valer 11.',
      rows: Object.entries(tables.soft)
        .filter(([k]) => Number(k) <= 20)
        .map(([k, cells]) => [k, softLabel(Number(k)), cells] as [string, string, Cell[]]),
    },
    {
      id: 'pairs',
      title: 'Parejas',
      note: 'Se consultan antes que el total. Un punto significa "no dividir": juega el total.',
      rows: Object.entries(tables.pairs)
        .sort((a, b) => Number(b[0]) - Number(a[0]))
        .map(([k, cells]) => [k, pairLabel(Number(k)), cells] as [string, string, Cell[]]),
    },
  ];

  const usedCells = new Set<Cell>(sections.flatMap((s) => s.rows.flatMap(([, , cells]) => cells)));

  const keyFor = (section: Section, rowKey: string, dealer: number) => {
    const d = dealer === 11 ? 'A' : String(dealer);
    const prefix = section === 'hard' ? 'H' : section === 'soft' ? 'S' : 'P';
    return `${prefix}${rowKey}v${d}`;
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
        {LEGEND.filter(({ cell }) => usedCells.has(cell)).map(({ cell, text }) => (
          <span key={cell} className="legend__item">
            <span className={`legend__swatch is-${family(cell)}`}>{CELL_TEXT[cell]}</span>
            {text}
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
                {section.rows.map(([rowKey, label, cells]) => (
                  <tr key={rowKey}>
                    <th className="chart__rowhead num">{label}</th>
                    {cells.map((cell, i) => {
                      const dealer = DEALER_COLUMNS[i];
                      const stat = heat ? stats.get(keyFor(section.id, rowKey, dealer)) : undefined;
                      const acc = stat ? stat.accuracy : undefined;
                      const tone =
                        acc === undefined ? '' : acc >= 0.9 ? ' heat-good' : acc >= 0.6 ? ' heat-mid' : ' heat-bad';
                      return (
                        <td
                          key={dealer}
                          className={`chart__cell is-${family(cell)}${tone}`}
                          title={stat ? `${stat.correct}/${stat.total} aciertos` : undefined}
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
