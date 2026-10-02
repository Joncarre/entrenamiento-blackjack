import { motion } from 'framer-motion';
import { useEffect } from 'react';
import { actionLabel, type HandAction } from '../strategy';
import { useGame } from '../store/useGame';

interface ActionDef {
  action: HandAction;
  key: string;
  /** Teclas que disparan la accion. */
  codes: string[];
}

/** La tecla es la inicial de la jugada y coincide con su simbolo en la tabla. */
const ACTIONS: ActionDef[] = [
  { action: 'hit', key: 'P', codes: ['p', 'arrowup'] },
  { action: 'stand', key: 'Q', codes: ['q', 'arrowdown'] },
  { action: 'double', key: 'D', codes: ['d'] },
  { action: 'split', key: 'S', codes: ['s'] },
  { action: 'surrender', key: 'R', codes: ['r'] },
];

export function ActionBar() {
  const phase = useGame((s) => s.phase);
  const legal = useGame((s) => s.legal);
  const advice = useGame((s) => s.advice);
  const assistMode = useGame((s) => s.settings.assistMode);
  const act = useGame((s) => s.act);

  const live = phase === 'playerTurn';
  const hinting = assistMode === 'hint' && live && advice;

  useEffect(() => {
    if (!live) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && /input|select|textarea/i.test(target.tagName)) return;
      const hit = ACTIONS.find((a) => a.codes.includes(e.key.toLowerCase()));
      if (hit && legal[hit.action]) {
        e.preventDefault();
        void act(hit.action);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [live, legal, act]);

  return (
    <div className="actionbar" role="group" aria-label="Acciones de la mano">
      {ACTIONS.map(({ action, key }) => {
        const enabled = live && legal[action];
        const suggested = hinting && advice?.action === action;
        return (
          <motion.button
            key={action}
            className={`abtn abtn--${action}${suggested ? ' is-suggested' : ''}`}
            disabled={!enabled}
            onClick={() => void act(action)}
            whileTap={enabled ? { scale: 0.96 } : undefined}
            aria-keyshortcuts={key}
          >
            <span className="abtn__label">{actionLabel(action)}</span>
            <kbd className="abtn__key">{key}</kbd>
          </motion.button>
        );
      })}
    </div>
  );
}
