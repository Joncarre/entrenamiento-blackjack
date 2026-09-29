import { AnimatePresence, motion } from 'framer-motion';
import { ActionBar } from '../components/ActionBar';
import { BetPanel } from '../components/BetPanel';
import { FeedbackToast } from '../components/FeedbackToast';
import { HandView } from '../components/HandView';
import { Hud } from '../components/Hud';
import { actionLabel } from '../strategy';
import { useGame } from '../store/useGame';

export function GameView() {
  const phase = useGame((s) => s.phase);
  const dealer = useGame((s) => s.dealer);
  const hands = useGame((s) => s.hands);
  const activeIndex = useGame((s) => s.activeIndex);
  const speed = useGame((s) => s.settings.speed);
  const assistMode = useGame((s) => s.settings.assistMode);
  const advice = useGame((s) => s.advice);
  const notice = useGame((s) => s.notice);
  const insuranceBet = useGame((s) => s.insuranceBet);
  const pendingBet = useGame((s) => s.pendingBet);
  const takeInsurance = useGame((s) => s.takeInsurance);
  const h17 = useGame((s) => s.settings.rules.dealerHitsSoft17);
  const payout = useGame((s) => s.settings.rules.blackjackPayout);

  const instant = speed === 'instant';
  const holeHidden = dealer.some((c) => c.hidden);
  const multi = hands.length > 1;

  return (
    <div className="game">
      <Hud />

      <div className="felt">
        <div className="felt__glow" aria-hidden />
        <div className="felt__arc" aria-hidden>
          <span>{h17 ? 'El crupier pide con 17 blando' : 'El crupier se planta en 17'}</span>
          <span>Blackjack paga {payout === 1.5 ? '3:2' : '6:5'}</span>
        </div>

        <section className="felt__row felt__row--dealer" aria-label="Mano del crupier">
          {dealer.length > 0 && (
            <HandView cards={dealer} instant={instant} hideTotal={holeHidden} />
          )}
        </section>

        <AnimatePresence>
          {notice && (
            <motion.div
              className="felt__notice"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              {notice}
            </motion.div>
          )}
        </AnimatePresence>

        <section className={`felt__row felt__row--player${multi ? ' is-split' : ''}`} aria-label="Tus manos">
          <AnimatePresence initial={false}>
            {hands.map((hand, i) => (
              <motion.div
                key={hand.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 320, damping: 30 }}
              >
                <HandView
                  cards={hand.cards}
                  hand={hand}
                  instant={instant}
                  active={phase === 'playerTurn' && i === activeIndex}
                  dimmed={multi && phase === 'playerTurn' && i !== activeIndex}
                  label={multi ? `Mano ${i + 1}` : undefined}
                />
              </motion.div>
            ))}
          </AnimatePresence>

          {hands.length === 0 && phase === 'betting' && (
            <p className="felt__empty">Elige tu apuesta y reparte.</p>
          )}
        </section>
      </div>

      <div className="controls">
        <AnimatePresence mode="wait">
          {phase === 'insurance' && (
            <motion.div
              key="insurance"
              className="insurance"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <div className="insurance__text">
                <strong>El crupier ensena un As.</strong>
                <span>Seguro por {(pendingBet / 2).toFixed(2).replace(/\.00$/, '')} EUR</span>
              </div>
              <div className="insurance__actions">
                <button className="btn btn--ghost" onClick={() => void takeInsurance(true)}>
                  Aceptar
                </button>
                <button className="btn btn--gold" onClick={() => void takeInsurance(false)}>
                  Rechazar
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {phase === 'playerTurn' && <ActionBar />}
        <BetPanel />

        {phase === 'dealing' && <p className="controls__status">Repartiendo...</p>}
        {phase === 'dealerTurn' && <p className="controls__status">Juega el crupier...</p>}

        {assistMode === 'hint' && phase === 'playerTurn' && advice && (
          <p className="hintline">
            <strong>{advice.handLabel}</strong> &rarr;{' '}
            <span className="hintline__action">{actionLabel(advice.action)}</span>
          </p>
        )}

        {insuranceBet > 0 && (
          <p className="controls__status">Seguro activo: {insuranceBet.toFixed(2).replace(/\.00$/, '')} EUR</p>
        )}
      </div>

      <FeedbackToast />
    </div>
  );
}
