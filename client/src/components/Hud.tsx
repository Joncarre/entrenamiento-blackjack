import { motion } from 'framer-motion';
import { useGame } from '../store/useGame';

const pct = (v: number) => `${(v * 100).toFixed(v >= 0.995 ? 0 : 1)}%`;

const money = (v: number) => {
  const sign = v > 0 ? '+' : v < 0 ? '-' : '';
  return `${sign}${Math.abs(v).toFixed(2).replace(/\.00$/, '')}`;
};

/**
 * Barra de estado permanente. La cifra grande es la tasa de jugadas teoricas:
 * es el objetivo del entrenamiento, asi que domina la jerarquia visual.
 */
export function Hud() {
  const bankroll = useGame((s) => s.bankroll);
  const stats = useGame((s) => s.stats);
  const showCount = useGame((s) => s.settings.showCount);
  const runningCount = useGame((s) => s.runningCount);
  const shoeState = useGame((s) => s.shoeState);
  const decks = useGame((s) => s.settings.rules.decks);

  const accuracy = stats.decisions > 0 ? stats.correct / stats.decisions : 0;
  const remaining = shoeState.shoe.length - shoeState.index;
  const trueCount = remaining > 0 ? runningCount / Math.max(remaining / 52, 0.25) : 0;
  const used = shoeState.shoe.length > 0 ? shoeState.index / shoeState.shoe.length : 0;

  return (
    <div className="hud">
      <div className="hud__primary">
        <span className="hud__label">Jugadas teoricas</span>
        <div className="hud__accuracy">
          <motion.span
            className="hud__accuracy-value num"
            key={stats.correct}
            initial={{ scale: 1.08 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 26 }}
          >
            {stats.decisions > 0 ? pct(accuracy) : '--'}
          </motion.span>
          <span className="hud__accuracy-sub num">
            {stats.correct}/{stats.decisions}
          </span>
        </div>
        <div className="hud__bar" aria-hidden>
          <motion.div
            className="hud__bar-fill"
            animate={{ width: `${accuracy * 100}%` }}
            transition={{ type: 'spring', stiffness: 160, damping: 26 }}
          />
          {/* Marca del 100%: el objetivo del entrenamiento. */}
          <span className="hud__bar-goal" />
        </div>
        <div className="hud__recent" aria-label="Ultimas jugadas">
          {Array.from({ length: 20 }).map((_, i) => {
            const offset = stats.recent.length - 20 + i;
            const v = offset >= 0 ? stats.recent[offset] : undefined;
            return (
              <span
                key={i}
                className={`tick${v === true ? ' is-ok' : v === false ? ' is-bad' : ''}`}
              />
            );
          })}
        </div>
      </div>

      <div className="hud__grid">
        <Stat label="Cartera" value={`${bankroll.toFixed(2).replace(/\.00$/, '')} EUR`} tone="plain" />
        <Stat
          label="Sesion"
          value={`${money(stats.net)} EUR`}
          tone={stats.net > 0 ? 'good' : stats.net < 0 ? 'bad' : 'plain'}
        />
        <Stat label="Manos" value={String(stats.rounds)} tone="plain" />
        <Stat
          label="Racha"
          value={String(stats.streak)}
          hint={stats.bestStreak > 0 ? `max ${stats.bestStreak}` : undefined}
          tone={stats.streak >= 10 ? 'good' : 'plain'}
        />
        {showCount && (
          <Stat
            label="Conteo Hi-Lo"
            value={`${runningCount > 0 ? '+' : ''}${runningCount}`}
            hint={`real ${trueCount >= 0 ? '+' : ''}${trueCount.toFixed(1)}`}
            tone={runningCount > 0 ? 'good' : runningCount < 0 ? 'bad' : 'plain'}
          />
        )}
      </div>

      <div className="shoe">
        <div className="shoe__meter" role="img" aria-label={`Mazo consumido al ${Math.round(used * 100)}%`}>
          <motion.div
            className="shoe__fill"
            animate={{ width: `${used * 100}%` }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          />
        </div>
        <span className="shoe__text num">
          {remaining} cartas · {decks} {decks === 1 ? 'baraja' : 'barajas'}
        </span>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone: 'plain' | 'good' | 'bad';
}) {
  return (
    <div className={`stat stat--${tone}`}>
      <span className="stat__label">{label}</span>
      <span className="stat__value num">{value}</span>
      {hint && <span className="stat__hint num">{hint}</span>}
    </div>
  );
}
