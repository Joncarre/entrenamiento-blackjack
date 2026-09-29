import { motion } from 'framer-motion';
import { isRedSuit, RANK_LABEL, SUIT_GLYPH } from '../engine/cards';
import type { Card } from '../engine/types';

interface Props {
  card: Card;
  /** Posicion dentro de la mano: escalona el solape y el retardo de entrada. */
  index: number;
  /** Desactiva la animacion de entrada (velocidad instantanea). */
  instant?: boolean;
  small?: boolean;
}

/**
 * Carta con volteo 3D real. La animacion de entrada simula el lanzamiento
 * desde el zapato del crupier, arriba a la derecha.
 */
export function PlayingCard({ card, index, instant = false, small = false }: Props) {
  const red = isRedSuit(card.suit);
  const glyph = SUIT_GLYPH[card.suit];

  return (
    <motion.div
      className={`pcard${small ? ' pcard--sm' : ''}`}
      initial={instant ? false : { x: 260, y: -220, rotate: 24, opacity: 0, scale: 0.85 }}
      animate={{ x: 0, y: 0, rotate: (index - 1) * 1.6, opacity: 1, scale: 1 }}
      transition={
        instant
          ? { duration: 0 }
          : { type: 'spring', stiffness: 420, damping: 34, mass: 0.7 }
      }
      style={{ zIndex: index + 1 }}
    >
      <motion.div
        className="pcard__inner"
        initial={false}
        animate={{ rotateY: card.hidden ? 180 : 0 }}
        transition={{ duration: instant ? 0 : 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className={`pcard__face pcard__front${red ? ' is-red' : ''}`}>
          <span className="pcard__corner pcard__corner--tl">
            <b>{RANK_LABEL[card.rank]}</b>
            <i>{glyph}</i>
          </span>
          <span className="pcard__pip">{glyph}</span>
          <span className="pcard__corner pcard__corner--br">
            <b>{RANK_LABEL[card.rank]}</b>
            <i>{glyph}</i>
          </span>
        </div>
        <div className="pcard__face pcard__back">
          <div className="pcard__pattern" />
          <div className="pcard__monogram">BJ</div>
        </div>
      </motion.div>
    </motion.div>
  );
}
