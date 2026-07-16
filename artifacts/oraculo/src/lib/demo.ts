/**
 * Demo Trading — shared types and localStorage persistence.
 * Completely simulation-only; never touches real orders or API keys.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type TradeDirection = 'BUY' | 'SELL';

export type TradeStatus = 'OPEN' | 'WIN' | 'LOSS' | 'BREAKEVEN';

export type TradeExitReason =
  | 'STOP_LOSS'
  | 'BREAKEVEN'
  | 'TARGET_1'
  | 'TARGET_2';

export interface DemoTrade {
  id: string;
  pair: string;
  direction: TradeDirection;
  openTime: number;          // epoch ms
  closeTime?: number;        // epoch ms

  // Levels
  entry: number;
  stopLoss: number;          // current stop (moves to breakeven after T1)
  stopLossOriginal: number;  // original stop, never changes
  target1: number;
  target2: number;

  // Position
  balanceAtOpen: number;     // snapshot of balance when trade opened
  riskAmount: number;        // USDC at risk (1% of balance)
  positionSize: number;      // base-asset units (e.g. BTC)
  riskReward: string;        // e.g. "1:2.14"

  // State flags
  status: TradeStatus;
  target1Hit: boolean;       // true once T1 was reached
  isBreakevenStop: boolean;  // true once stop was moved to entry

  // Result (set on close)
  closePrice?: number;
  exitReason?: TradeExitReason;
  pnlUSDC?: number;
  pnlPct?: number;           // % of balance at open

  // Signal context
  signalReasons: string[];   // rule-engine step reasons
  marketConditions: string;  // human-readable summary
}

export interface DailyStats {
  date: string;              // 'YYYY-MM-DD' in SP timezone
  startOfDayBalance: number;
  totalTrades: number;
  wins: number;
  losses: number;
  breakevens: number;
  consecutiveLosses: number;
  maxConsecutiveLosses: number;
  dailyPnL: number;          // running P&L in USDC for the day
  peakBalance: number;       // for drawdown tracking
  maxDrawdown: number;       // max drawdown in USDC this day
  safetyLimited: boolean;    // locked by a safety rule
}

export interface DemoSession {
  balance: number;           // current simulated balance
  configuredBalance: number; // user-set value (used on reset)
  activeTrade: DemoTrade | null;
  history: DemoTrade[];      // closed trades, newest first
  dailyStats: DailyStats;
}

// ── Defaults ──────────────────────────────────────────────────────────────────

export const DEFAULT_BALANCE = 1_000;

export function makeDailyStats(date: string, balance: number): DailyStats {
  return {
    date,
    startOfDayBalance: balance,
    totalTrades: 0,
    wins: 0,
    losses: 0,
    breakevens: 0,
    consecutiveLosses: 0,
    maxConsecutiveLosses: 0,
    dailyPnL: 0,
    peakBalance: balance,
    maxDrawdown: 0,
    safetyLimited: false,
  };
}

export function makeSession(configuredBalance = DEFAULT_BALANCE): DemoSession {
  const today = todaySP();
  return {
    balance: configuredBalance,
    configuredBalance,
    activeTrade: null,
    history: [],
    dailyStats: makeDailyStats(today, configuredBalance),
  };
}

// ── Date helpers ──────────────────────────────────────────────────────────────

/** Current date in SP timezone as 'YYYY-MM-DD'. */
export function todaySP(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

/** Format an epoch-ms duration as "Xh Ym Zs" or "Ym Zs". */
export function fmtDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/** Format epoch ms as local timestamp in SP. */
export function fmtEpochSP(ms: number): string {
  return new Date(ms).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

// ── Safety rule evaluation ────────────────────────────────────────────────────

/** Returns true when no more demo trades can open today. */
export function isSafetyLimited(stats: DailyStats): boolean {
  if (stats.safetyLimited) return true;
  if (stats.totalTrades >= 8) return true;
  if (stats.consecutiveLosses >= 3) return true;
  if (stats.dailyPnL <= -(stats.startOfDayBalance * 0.03)) return true;
  return false;
}

/** Human-readable reason for safety limit (first applicable rule). */
export function safetyLimitReason(stats: DailyStats): string {
  if (stats.totalTrades >= 8) return 'Limite de 8 operações por dia atingido.';
  if (stats.consecutiveLosses >= 3) return '3 perdas consecutivas — operações pausadas.';
  if (stats.dailyPnL <= -(stats.startOfDayBalance * 0.03)) return 'Drawdown diário de 3% atingido.';
  return 'Limite de risco ativado.';
}

// ── localStorage ─────────────────────────────────────────────────────────────

const STORAGE_KEY = 'oraculo_demo_session_v1';

export function loadSession(): DemoSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DemoSession;
  } catch {
    return null;
  }
}

export function saveSession(session: DemoSession): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Storage quota or SSR — silently ignore
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch { /* ignore */ }
}
