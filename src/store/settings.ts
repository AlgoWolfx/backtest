// Kullanıcı ayarları: grafik teması, seans katmanı, varsayılan risk / lot / Fib seviyeleri.

import { saveTheme, type ChartTheme } from '../prefs/chartTheme';
import { saveSessionSettings } from '../prefs/sessionSettings';
import { type SessionSettings } from '../core/sessions';
import { type Session } from '../core/types';
import { set, patchSession } from './state';

export function setSessionSettings(s: SessionSettings) {
  saveSessionSettings(s);
  set({ sessionSettings: s });
}

export function setChartTheme(t: ChartTheme) {
  saveTheme(t);
  set({ chartTheme: t });
}

export function setRiskPct(riskPct: number) {
  patchSession(() => ({ riskPct }));
}

export function setLots(lots: number) {
  patchSession(() => ({ lots }));
}

export function setFibDefaults(levels: Session['fibDefaults']) {
  patchSession(() => ({ fibDefaults: levels }));
}
