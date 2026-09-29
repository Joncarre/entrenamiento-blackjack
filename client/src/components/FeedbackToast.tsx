import { AnimatePresence, motion } from 'framer-motion';
import { useEffect } from 'react';
import { actionLabel } from '../strategy';
import { useGame } from '../store/useGame';
import type { Action } from '../engine/types';

const LABELS: Record<string, string> = {
  'insurance-yes': 'Aceptar seguro',
  'insurance-no': 'Rechazar seguro',
};

const label = (v: string) => LABELS[v] ?? actionLabel(v as Action);

/**
 * Corrector de jugada. Aparece tras cada decision en los modos de ayuda
 * y es la pieza que convierte "jugar" en "entrenar".
 */
export function FeedbackToast() {
  const feedback = useGame((s) => s.feedback);
  const strictMode = useGame((s) => s.settings.strictMode);
  const dismiss = useGame((s) => s.dismissFeedback);

  useEffect(() => {
    if (!feedback) return;
    // Un acierto se despacha rapido; un fallo se queda para poder leerlo.
    const ms = feedback.correct ? 1400 : strictMode ? 5200 : 4200;
    const t = setTimeout(dismiss, ms);
    return () => clearTimeout(t);
  }, [feedback, strictMode, dismiss]);

  return (
    <div className="feedback-layer" aria-live="polite">
      <AnimatePresence>
        {feedback && (
          <motion.div
            key={feedback.id}
            className={`feedback ${feedback.correct ? 'is-ok' : 'is-bad'}`}
            initial={{ opacity: 0, y: 22, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            onClick={dismiss}
          >
            <div className="feedback__mark" aria-hidden>
              {feedback.correct ? '✓' : '✕'}
            </div>
            <div className="feedback__body">
              <div className="feedback__head">
                {feedback.correct ? 'Jugada teorica' : 'Se aparta de la tabla'}
                <span className="feedback__hand">{feedback.handLabel}</span>
              </div>
              {!feedback.correct && (
                <div className="feedback__diff">
                  <span className="feedback__chosen">{label(feedback.chosen)}</span>
                  <span className="feedback__arrow" aria-hidden>
                    &rarr;
                  </span>
                  <span className="feedback__right">{label(feedback.optimal)}</span>
                </div>
              )}
              <p className="feedback__reason">{feedback.reason}</p>
              {!feedback.correct && strictMode && (
                <p className="feedback__strict">Modo estricto: repite con la jugada correcta.</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
