import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { onConnectionChange } from './lib/api';
import { useGame } from './store/useGame';
import { ChartView } from './views/ChartView';
import { DrillView } from './views/DrillView';
import { GameView } from './views/GameView';
import { SettingsView } from './views/SettingsView';
import { StatsView } from './views/StatsView';

type Tab = 'game' | 'drill' | 'chart' | 'stats' | 'settings';

const TABS: Array<{ id: Tab; label: string; short: string }> = [
  { id: 'game', label: 'Mesa', short: 'Mesa' },
  { id: 'drill', label: 'Entrenar', short: 'Drill' },
  { id: 'chart', label: 'Tabla', short: 'Tabla' },
  { id: 'stats', label: 'Progreso', short: 'Datos' },
  { id: 'settings', label: 'Ajustes', short: 'Ajustes' },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('game');
  const [offline, setOffline] = useState(false);
  const init = useGame((s) => s.init);

  useEffect(() => {
    void init();
    const unsubscribe = onConnectionChange((online) => setOffline(!online));
    return () => {
      unsubscribe();
    };
  }, [init]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand__mark" aria-hidden>
            21
          </span>
          <span className="brand__text">
            Blackjack <em>Entrenamiento</em>
          </span>
        </div>

        <nav className="tabs" aria-label="Secciones">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`tab${tab === t.id ? ' is-on' : ''}`}
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? 'page' : undefined}
            >
              {tab === t.id && (
                <motion.span className="tab__pill" layoutId="tabpill" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />
              )}
              <span className="tab__label">{t.label}</span>
              <span className="tab__label tab__label--short">{t.short}</span>
            </button>
          ))}
        </nav>

        {offline && (
          <span className="offline" title="El historial no se esta guardando">
            Sin servidor
          </span>
        )}
      </header>

      <main className="main">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="main__inner"
          >
            {tab === 'game' && <GameView />}
            {tab === 'drill' && <DrillView />}
            {tab === 'chart' && <ChartView />}
            {tab === 'stats' && <StatsView />}
            {tab === 'settings' && <SettingsView />}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
