import { AnimatePresence, motion } from 'framer-motion';
import { useEffect } from 'react';
import { useGame } from '../store/useGame';

/** Denominaciones clasicas de ficha. El color sigue la convencion de casino. */
const CHIPS = [1, 5, 25, 100] as const;

export function BetPanel() {
  const phase = useGame((s) => s.phase);
  const bankroll = useGame((s) => s.bankroll);
  const pendingBet = useGame((s) => s.pendingBet);
  const baseBet = useGame((s) => s.settings.baseBet);
  const adjustBet = useGame((s) => s.adjustBet);
  const setPendingBet = useGame((s) => s.setPendingBet);
  const deal = useGame((s) => s.deal);
  const nextRound = useGame((s) => s.nextRound);
  const rebuy = useGame((s) => s.rebuyBankroll);

  const betting = phase === 'betting';
  const over = phase === 'roundOver';
  const broke = bankroll < 1;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /input|select|textarea/i.test(target.tagName)) return;
      if (e.key !== ' ' && e.key !== 'Enter') return;
      if (betting && !broke) {
        e.preventDefault();
        void deal();
      } else if (over) {
        e.preventDefault();
        nextRound();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [betting, over, broke, deal, nextRound]);

  if (!betting && !over) return null;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={betting ? 'bet' : 'next'}
        className="betpanel"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      >
        {betting ? (
          broke ? (
            <div className="betpanel__broke">
              <p>Te has quedado sin saldo.</p>
              <button className="btn btn--gold" onClick={rebuy}>
                Recargar cartera
              </button>
            </div>
          ) : (
            <>
              <div className="chips">
                {CHIPS.map((value) => (
                  <motion.button
                    key={value}
                    className={`chip chip--${value}`}
                    onClick={() => adjustBet(value)}
                    disabled={pendingBet + value > bankroll}
                    whileTap={{ scale: 0.9 }}
                    whileHover={{ y: -4 }}
                    aria-label={`Anadir ${value} euros`}
                  >
                    <span className="chip__value num">{value}</span>
                  </motion.button>
                ))}
              </div>

              <div className="betpanel__row">
                <div className="betamount">
                  <span className="betamount__label">Apuesta</span>
                  <span className="betamount__value num">{pendingBet} EUR</span>
                </div>
                <div className="betpanel__mini">
                  <button className="btn btn--ghost btn--sm" onClick={() => setPendingBet(baseBet)}>
                    Base
                  </button>
                  <button
                    className="btn btn--ghost btn--sm"
                    onClick={() => setPendingBet(pendingBet * 2)}
                    disabled={pendingBet * 2 > bankroll}
                  >
                    x2
                  </button>
                  <button
                    className="btn btn--ghost btn--sm"
                    onClick={() => setPendingBet(bankroll)}
                    disabled={pendingBet >= bankroll}
                  >
                    Todo
                  </button>
                </div>
              </div>

              <motion.button className="btn btn--gold btn--lg" onClick={() => void deal()} whileTap={{ scale: 0.97 }}>
                Repartir
                <kbd className="btn__key">Espacio</kbd>
              </motion.button>
            </>
          )
        ) : (
          <motion.button className="btn btn--gold btn--lg" onClick={nextRound} whileTap={{ scale: 0.97 }}>
            Siguiente mano
            <kbd className="btn__key">Espacio</kbd>
          </motion.button>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
