import { useCallback, useEffect, useState } from 'react';
import { LineChart, type Point } from '../components/LineChart';
import {
  api,
  type BankrollPoint,
  type MistakeStat,
  type ProgressPoint,
  type SituationStat,
  type StatsSummary,
} from '../lib/api';
import { actionLabel, describeSituation } from '../strategy';
import type { Action } from '../engine/types';
import { useGame } from '../store/useGame';

/** Paleta de datos validada para superficie oscura (ver README). */
const DV = {
  teal: '#27a983',
  blue: '#5a86d8',
  amber: '#c9791f',
};

const pct = (v: number) => `${(v * 100).toFixed(0)}%`;
const pct1 = (v: number) => `${(v * 100).toFixed(1)}%`;
const eur = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(2).replace(/\.00$/, '')} EUR`;

const ACT: Record<string, string> = {
  'insurance-yes': 'aceptar seguro',
  'insurance-no': 'rechazar seguro',
};
const act = (v: string) => ACT[v] ?? actionLabel(v as Action).toLowerCase();

export function StatsView() {
  const [summary, setSummary] = useState<StatsSummary | null>(null);
  const [progress, setProgress] = useState<ProgressPoint[]>([]);
  const [bankroll, setBankroll] = useState<BankrollPoint[]>([]);
  const [situations, setSituations] = useState<SituationStat[]>([]);
  const [mistakes, setMistakes] = useState<MistakeStat[]>([]);
  const [bucket, setBucket] = useState(25);
  const [loading, setLoading] = useState(true);
  const [showTable, setShowTable] = useState(false);
  const bankrollStart = useGame((s) => s.settings.bankrollStart);

  const load = useCallback(async () => {
    setLoading(true);
    const [s, p, b, sit, m] = await Promise.all([
      api.summary(),
      api.progress(bucket),
      api.bankroll(),
      api.situations(),
      api.mistakes(8),
    ]);
    setSummary(s);
    setProgress(p ?? []);
    setBankroll(b ?? []);
    setSituations(sit ?? []);
    setMistakes(m ?? []);
    setLoading(false);
  }, [bucket]);

  useEffect(() => {
    void load();
  }, [load]);

  const reset = async () => {
    if (!confirm('Esto borra todo el historial de entrenamiento. No se puede deshacer.')) return;
    await api.resetAll();
    void load();
  };

  if (loading && !summary) {
    return (
      <div className="page">
        <p className="page__sub">Cargando estadisticas...</p>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="page">
        <header className="page__head">
          <h1 className="page__title">Progreso</h1>
        </header>
        <div className="panel">
          <p className="page__sub">
            No hay conexion con el servidor de estadisticas. La mesa sigue funcionando, pero el historial no se esta
            guardando. Arranca el backend con <code>npm run dev</code>.
          </p>
        </div>
      </div>
    );
  }

  const progressPoints: Point[] = progress.map((p) => ({
    x: p.to,
    y: p.accuracy,
    label: `Decisiones ${p.from}-${p.to}`,
    value: `${pct1(p.accuracy)} · ${p.correct}/${p.total}`,
  }));

  const bankrollPoints: Point[] = bankroll.map((b, i) => ({
    x: i + 1,
    y: b.bankroll,
    label: `Mano ${i + 1}`,
    value: `${b.bankroll.toFixed(2).replace(/\.00$/, '')} EUR (${eur(b.net)})`,
  }));

  // Casillas con muestra suficiente y mal rendimiento: donde conviene entrenar.
  const weak = situations.filter((s) => s.total >= 3 && s.accuracy < 0.9).slice(0, 12);
  const trend =
    progress.length >= 2 ? progress[progress.length - 1].accuracy - progress[0].accuracy : 0;

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <h1 className="page__title">Progreso</h1>
          <p className="page__sub">
            Todo el historico, de todas las sesiones. El objetivo es que la curva llegue y se mantenga en el 100%.
          </p>
        </div>
        <button className="btn btn--ghost btn--sm" onClick={reset}>
          Borrar historial
        </button>
      </header>

      <section className="tiles">
        <Tile
          label="Tasa de jugadas teoricas"
          value={summary.decisions > 0 ? pct1(summary.accuracy) : '--'}
          hint={`${summary.correct} de ${summary.decisions} decisiones`}
          hero
        />
        <Tile
          label="Ultimas 100 decisiones"
          value={summary.recentSample > 0 ? pct1(summary.recentAccuracy) : '--'}
          hint={
            summary.recentSample > 0
              ? `tu nivel actual${summary.recentAccuracy > summary.accuracy ? ' · mejorando' : ''}`
              : 'sin datos'
          }
        />
        <Tile label="Manos jugadas" value={String(summary.hands)} hint={`${summary.rounds} rondas`} />
        <Tile
          label="Resultado"
          value={eur(summary.net)}
          hint={`sobre ${summary.wagered.toFixed(0)} EUR apostados`}
          tone={summary.net > 0 ? 'good' : summary.net < 0 ? 'bad' : undefined}
        />
        <Tile
          label="Ventaja real"
          value={summary.wagered > 0 ? `${(summary.edge * 100).toFixed(2)}%` : '--'}
          hint="por euro apostado"
          tone={summary.edge > 0 ? 'good' : summary.edge < -0.02 ? 'bad' : undefined}
        />
        <Tile
          label="Tiempo por decision"
          value={summary.avgMs > 0 ? `${(summary.avgMs / 1000).toFixed(1)}s` : '--'}
          hint="media"
        />
      </section>

      <section className="panel">
        <div className="panel__head">
          <div>
            <h2 className="panel__title">Curva de aprendizaje</h2>
            <p className="panel__note">
              Precision en bloques de {bucket} decisiones consecutivas.
              {progress.length >= 2 && (
                <>
                  {' '}
                  Del primer bloque al ultimo:{' '}
                  <b className={trend >= 0 ? 'delta-good' : 'delta-bad'}>
                    {trend >= 0 ? '+' : ''}
                    {(trend * 100).toFixed(1)} puntos
                  </b>
                  .
                </>
              )}
            </p>
          </div>
          <div className="segmented segmented--sm">
            {[10, 25, 50].map((b) => (
              <button
                key={b}
                className={`segmented__opt num${bucket === b ? ' is-on' : ''}`}
                onClick={() => setBucket(b)}
              >
                {b}
              </button>
            ))}
          </div>
        </div>
        <LineChart
          points={progressPoints}
          color={DV.teal}
          domain={[0, 1]}
          formatY={pct}
          reference={{ y: 1, label: 'juego optimo' }}
          ariaLabel="Precision por bloques de decisiones"
        />
        {progressPoints.length > 0 && (
          <button className="btn btn--ghost btn--sm" onClick={() => setShowTable((v) => !v)}>
            {showTable ? 'Ocultar datos' : 'Ver datos'}
          </button>
        )}
        {showTable && (
          <div className="chart-scroll">
            <table className="datatable">
              <thead>
                <tr>
                  <th>Bloque</th>
                  <th className="num">Aciertos</th>
                  <th className="num">Precision</th>
                </tr>
              </thead>
              <tbody>
                {progress.map((p) => (
                  <tr key={p.bucket}>
                    <td className="num">
                      {p.from}-{p.to}
                    </td>
                    <td className="num">
                      {p.correct}/{p.total}
                    </td>
                    <td className="num">{pct1(p.accuracy)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel__head">
          <div>
            <h2 className="panel__title">Evolucion de la cartera</h2>
            <p className="panel__note">
              Saldo despues de cada mano. Con juego optimo la linea baja despacio: la casa conserva una ventaja de
              alrededor del 0,5%.
            </p>
          </div>
        </div>
        <LineChart
          points={bankrollPoints}
          color={DV.blue}
          formatY={(v) => v.toFixed(0)}
          reference={{ y: bankrollStart, label: 'capital inicial' }}
          ariaLabel="Evolucion del saldo mano a mano"
        />
      </section>

      <section className="panel">
        <h2 className="panel__title">Tus puntos debiles</h2>
        <p className="panel__note">
          Casillas con al menos 3 intentos y menos del 90% de acierto, ordenadas por urgencia.
        </p>
        {weak.length === 0 ? (
          <p className="empty">
            {situations.length === 0
              ? 'Juega algunas manos para que aparezcan datos aqui.'
              : 'Ninguna casilla con fallos repetidos. Buen trabajo.'}
          </p>
        ) : (
          <ul className="weaklist">
            {weak.map((s) => (
              <li key={s.key} className="weak">
                <div className="weak__head">
                  <span className="weak__name">{describeSituation(s.key)}</span>
                  <span className="weak__score num">
                    {pct(s.accuracy)}
                    <small>
                      {' '}
                      ({s.correct}/{s.total})
                    </small>
                  </span>
                </div>
                <div className="weak__bar">
                  <div
                    className="weak__fill"
                    style={{
                      width: `${Math.max(s.accuracy * 100, 2)}%`,
                      background: s.accuracy >= 0.6 ? DV.teal : DV.amber,
                    }}
                  />
                </div>
                <span className="weak__fix">Lo correcto es {act(s.optimal)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <h2 className="panel__title">Errores mas repetidos</h2>
        {mistakes.length === 0 ? (
          <p className="empty">Sin errores registrados.</p>
        ) : (
          <ul className="mistakes">
            {mistakes.map((m, i) => {
              const max = mistakes[0].count;
              return (
                <li key={`${m.key}-${i}`} className="mistake">
                  <span className="mistake__name">{describeSituation(m.key)}</span>
                  <span className="mistake__swap">
                    <s>{act(m.chosen)}</s> &rarr; <b>{act(m.optimal)}</b>
                  </span>
                  <span className="mistake__track">
                    <span
                      className="mistake__bar"
                      style={{ width: `${(m.count / max) * 100}%`, background: DV.amber }}
                    />
                  </span>
                  <span className="mistake__count num">{m.count}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function Tile({
  label,
  value,
  hint,
  tone,
  hero,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'good' | 'bad';
  hero?: boolean;
}) {
  return (
    <div className={`tile${hero ? ' tile--hero' : ''}${tone ? ` tile--${tone}` : ''}`}>
      <span className="tile__label">{label}</span>
      <span className="tile__value num">{value}</span>
      {hint && <span className="tile__hint">{hint}</span>}
    </div>
  );
}
