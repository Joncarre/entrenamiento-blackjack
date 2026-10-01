import { CASINO_RULES, type Rules } from '../engine/types';
import { useGame } from '../store/useGame';
import {
  ASSIST_HELP,
  ASSIST_LABEL,
  SPEED_LABEL,
  type AssistMode,
  type Speed,
} from '../store/settings';

const SPEEDS: Speed[] = ['slow', 'normal', 'fast', 'instant'];
const ASSISTS: AssistMode[] = ['hint', 'feedback', 'off'];

/** Compara las reglas activas con un perfil, ignorando ajustes de ritmo. */
function sameRules(a: Rules, b: Rules) {
  return (
    a.dealerHitsSoft17 === b.dealerHitsSoft17 &&
    a.doubleAfterSplit === b.doubleAfterSplit &&
    a.lateSurrender === b.lateSurrender &&
    a.maxSplitHands === b.maxSplitHands &&
    a.doubleAnyTotal === b.doubleAnyTotal &&
    a.blackjackPayout === b.blackjackPayout
  );
}

export function SettingsView() {
  const settings = useGame((s) => s.settings);
  const bankroll = useGame((s) => s.bankroll);
  const update = useGame((s) => s.updateSettings);
  const rebuy = useGame((s) => s.rebuyBankroll);
  const shuffleNow = useGame((s) => s.shuffleNow);

  const { rules } = settings;
  const isCasino = sameRules(rules, CASINO_RULES);

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <h1 className="page__title">Configuracion</h1>
          <p className="page__sub">
            Las reglas cambian la tabla optima: el entrenador se recalcula solo al tocarlas.
          </p>
        </div>
      </header>

      <section className={`panel panel--profile${isCasino ? ' is-on' : ''}`}>
        <div className="panel__head">
          <div>
            <h2 className="panel__title">Mesa del casino</h2>
            <p className="panel__note">
              6 barajas · la banca se planta con 17 · solo se dobla con 9, 10 u 11 · una sola division ·
              blackjack 3:2 · seguro 2:1 · sin rendicion.
            </p>
          </div>
          {isCasino ? (
            <span className="badge">Reglas activas</span>
          ) : (
            <button className="btn btn--gold btn--sm" onClick={() => update({}, CASINO_RULES)}>
              Restaurar
            </button>
          )}
        </div>
        {!isCasino && (
          <p className="panel__warn">
            Estas entrenando con reglas distintas a las de tu mesa. La tabla optima no es la misma.
          </p>
        )}
      </section>

      <section className="panel">
        <h2 className="panel__title">Entrenamiento</h2>

        <Field label="Nivel de ayuda" hint={ASSIST_HELP[settings.assistMode]}>
          <div className="segmented">
            {ASSISTS.map((mode) => (
              <button
                key={mode}
                className={`segmented__opt${settings.assistMode === mode ? ' is-on' : ''}`}
                onClick={() => update({ assistMode: mode })}
              >
                {ASSIST_LABEL[mode]}
              </button>
            ))}
          </div>
        </Field>

        <Switch
          label="Modo estricto"
          hint="No deja ejecutar una jugada que se aparta de la tabla. La cuenta como fallo y te deja reintentar."
          checked={settings.strictMode}
          onChange={(v) => update({ strictMode: v })}
        />

        <Switch
          label="Mostrar conteo Hi-Lo"
          hint="Anade el conteo corriente y real a la barra superior. Entrenamiento avanzado."
          checked={settings.showCount}
          onChange={(v) => update({ showCount: v })}
        />

        <Switch
          label="Ofrecer seguro"
          hint="Pregunta por el seguro cuando el crupier ensena un As. La respuesta correcta siempre es rechazarlo."
          checked={settings.offerInsurance}
          onChange={(v) => update({ offerInsurance: v })}
        />
      </section>

      <section className="panel">
        <h2 className="panel__title">Mesa</h2>

        <Field label="Velocidad de reparto">
          <div className="segmented">
            {SPEEDS.map((s) => (
              <button
                key={s}
                className={`segmented__opt${settings.speed === s ? ' is-on' : ''}`}
                onClick={() => update({ speed: s })}
              >
                {SPEED_LABEL[s]}
              </button>
            ))}
          </div>
        </Field>

        <Field
          label="Barajas en juego"
          hint="Fijo en 6, como la mesa del casino: 3 barajas de un color y 3 de otro."
        >
          <span className="fixedvalue num">6 barajas · {6 * 52} cartas</span>
        </Field>

        <Field
          label="Penetracion"
          hint={`Se rebaraja cuando se ha jugado el ${Math.round(rules.penetration * 100)}% del mazo.`}
        >
          <input
            className="slider"
            type="range"
            min={0.5}
            max={0.9}
            step={0.05}
            value={rules.penetration}
            onChange={(e) => update({}, { penetration: Number(e.target.value) })}
          />
        </Field>

        <button className="btn btn--ghost" onClick={shuffleNow}>
          Barajar ahora
        </button>
      </section>

      <section className="panel">
        <h2 className="panel__title">Dinero</h2>

        <Field label="Cartera inicial" hint={`Saldo actual: ${bankroll.toFixed(2).replace(/\.00$/, '')} EUR`}>
          <div className="inputrow">
            <input
              className="input num"
              type="number"
              min={10}
              step={10}
              value={settings.bankrollStart}
              onChange={(e) => update({ bankrollStart: Math.max(10, Number(e.target.value) || 10) })}
            />
            <span className="inputrow__unit">EUR</span>
            <button className="btn btn--ghost btn--sm" onClick={rebuy}>
              Recargar
            </button>
          </div>
        </Field>

        <Field label="Apuesta base" hint="La que se propone al empezar cada mano.">
          <div className="inputrow">
            <input
              className="input num"
              type="number"
              min={1}
              step={1}
              value={settings.baseBet}
              onChange={(e) => update({ baseBet: Math.max(1, Number(e.target.value) || 1) })}
            />
            <span className="inputrow__unit">EUR</span>
          </div>
        </Field>
      </section>

      <section className="panel">
        <h2 className="panel__title">Reglas de la casa</h2>

        <Switch
          label="El crupier pide con 17 blando (H17)"
          hint="Tu casino usa S17: la banca se planta con 17 o mas y pide con 16 o menos."
          checked={rules.dealerHitsSoft17}
          onChange={(v) => update({}, { dealerHitsSoft17: v })}
        />
        <Switch
          label="Doblar tras dividir (DAS)"
          hint="Si se desactiva, varias parejas dejan de dividirse."
          checked={rules.doubleAfterSplit}
          onChange={(v) => update({}, { doubleAfterSplit: v })}
        />
        <Switch
          label="Rendicion tardia"
          hint="Tu casino no la ofrece: su reglamento no la contempla. Con ella, 15 y 16 contra cartas altas se abandonarian."
          checked={rules.lateSurrender}
          onChange={(v) => update({}, { lateSurrender: v })}
        />
        <Switch
          label="Doblar con cualquier total"
          hint="Tu casino NO lo permite: alli solo se dobla con 9, 10 u 11, y eso elimina todos los dobles de manos blandas."
          checked={rules.doubleAnyTotal}
          onChange={(v) => update({}, { doubleAnyTotal: v })}
        />

        <Field label="Pago del blackjack" hint="El 6:5 es una regla de casa mala: cuesta cerca de un 1.4% de ventaja.">
          <div className="segmented">
            {[
              { v: 1.5, t: '3:2' },
              { v: 1.2, t: '6:5' },
            ].map(({ v, t }) => (
              <button
                key={t}
                className={`segmented__opt${rules.blackjackPayout === v ? ' is-on' : ''}`}
                onClick={() => update({}, { blackjackPayout: v })}
              >
                {t}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Maximo de manos por division" hint="Tu casino permite jugar a dos manos: una sola division.">
          <div className="segmented">
            {[2, 3, 4].map((n) => (
              <button
                key={n}
                className={`segmented__opt num${rules.maxSplitHands === n ? ' is-on' : ''}`}
                onClick={() => update({}, { maxSplitHands: n })}
              >
                {n}
              </button>
            ))}
          </div>
        </Field>
      </section>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="field">
      <div className="field__head">
        <span className="field__label">{label}</span>
        {hint && <span className="field__hint">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Switch({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="switch">
      <span className="switch__text">
        <span className="field__label">{label}</span>
        {hint && <span className="field__hint">{hint}</span>}
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle__track">
        <span className="toggle__thumb" />
      </span>
    </label>
  );
}
