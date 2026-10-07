import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/tokens.css';
import './styles/layout.css';
import './styles/table.css';
import './styles/cards.css';
import './styles/controls.css';
import './styles/stats.css';
// La ultima: la escala movil tiene que ganar a las reglas de las anteriores.
import './styles/mobile.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
