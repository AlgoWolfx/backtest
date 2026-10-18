import { createRoot } from 'react-dom/client';
import { App } from './App';
import { chartRef } from './chart/chartRef';
import * as store from './store';
import { startTradeShots } from './lib/shots';
import './styles.css';

// Hata ayıklama için: tarayıcı konsolunda window.__bt
(window as unknown as { __bt: unknown }).__bt = { store, chartRef };

startTradeShots();

createRoot(document.getElementById('root')!).render(<App />);
