import { AnimatePresence, motion } from 'framer-motion';
import { evaluate } from '../engine/cards';
import { OUTCOME_LABEL } from '../engine/game';
import type { Card, Hand } from '../engine/types';
import { PlayingCard } from './PlayingCard';

interface Props {
  cards: Card[];
  /** Mano del jugador; ausente en la del crupier. */
  hand?: Hand;
  active?: boolean;
  dimmed?: boolean;
  instant?: boolean;
  /** Oculta el total mientras la carta tapada siga boca abajo. */
  hideTotal?: boolean;
  label?: string;
}

export function HandView({ cards, hand, active, dimmed, instant, hideTotal, label }: Props) {
  const visible = cards.filter((c) => !c.hidden);
  const value = evaluate(hideTotal ? visible : cards);
  const showTotal = cards.length > 0;

  let totalClass = '';
  if (!hideTotal && value.isBust) totalClass = ' is-bust';
  else if (!hideTotal && value.isBlackjack) totalClass = ' is-bj';

  return (
    <div className={`hand-slot${active ? ' is-active' : ''}${dimmed ? ' is-dimmed' : ''}`}>
      <AnimatePresence>
        {hand?.outcome && (
          <motion.span
            className={`hand-outcome ${hand.outcome}`}
            initial={{ opacity: 0, y: 8, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 400, damping: 26 }}
          >
            {OUTCOME_LABEL[hand.outcome]}
            {hand.net !== undefined && hand.net !== 0 && (
              <span className="num">
                {' '}
                {hand.net > 0 ? '+' : ''}
                {hand.net.toFixed(2).replace(/\.00$/, '')}
              </span>
            )}
          </motion.span>
        )}
      </AnimatePresence>

      <div className="hand">
        <AnimatePresence initial={false}>
          {cards.map((card, i) => (
            <PlayingCard key={card.id} card={card} index={i} instant={instant} />
          ))}
        </AnimatePresence>
      </div>

      {showTotal && (
        <div className="hand-meta">
          <span className={`hand-total num${totalClass}`}>
            {hideTotal && visible.length < cards.length ? (
              <>{value.total}<span className="soft-mark">+</span></>
            ) : (
              <>
                {value.isBlackjack ? 'BLACKJACK' : value.total}
                {value.soft && !value.isBlackjack && <span className="soft-mark">blando</span>}
              </>
            )}
          </span>
          {hand && (
            <span className="hand-bet num">
              <b>{hand.bet}</b> EUR{hand.doubled ? ' · doblada' : ''}
            </span>
          )}
          {label && <span className="hand-bet">{label}</span>}
        </div>
      )}
    </div>
  );
}
