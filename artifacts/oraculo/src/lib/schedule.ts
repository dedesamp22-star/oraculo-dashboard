/**
 * Operational schedule utilities — America/Sao_Paulo timezone.
 * Trading window: Monday–Friday, 08:30–17:00 (SP local time).
 * All functions are pure and deterministic given a Date input.
 */

export const TZ = 'America/Sao_Paulo';

/** Returns a Date object representing "now" in SP local wall-clock time.
 *  We use the trick of formatting then re-parsing so getHours()/getDay()
 *  read the SP local values instead of UTC or browser-local. */
export function nowInSP(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
}

/** True when the current moment is within the Mon–Fri 08:30–17:00 window. */
export function isOperational(): boolean {
  const sp = nowInSP();
  const day  = sp.getDay();                          // 0=Sun … 6=Sat
  const mins = sp.getHours() * 60 + sp.getMinutes(); // minutes since midnight
  return day >= 1 && day <= 5 && mins >= 8 * 60 + 30 && mins < 17 * 60;
}

/** Seconds remaining until the next 5-minute candle close.
 *  Candles close at :00, :05, :10 … of every UTC minute multiple of 5.
 *  We work in UTC epoch milliseconds so the calculation is timezone-agnostic. */
export function secsUntilNextCandle(): number {
  const CANDLE_MS = 5 * 60 * 1000;
  const now  = Date.now();
  const next = (Math.floor(now / CANDLE_MS) + 1) * CANDLE_MS;
  return Math.max(0, Math.floor((next - now) / 1000));
}

/** The UTC epoch ms for the open of the current 5-minute candle. */
export function currentCandleOpenMs(): number {
  const CANDLE_MS = 5 * 60 * 1000;
  return Math.floor(Date.now() / CANDLE_MS) * CANDLE_MS;
}

/** Format a countdown in seconds as "MM:SS". */
export function fmtCountdown(totalSecs: number): string {
  const m = Math.floor(totalSecs / 60);
  const s = totalSecs % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Format a Date as HH:MM:SS in the SP timezone. */
export function fmtTimeSP(date: Date): string {
  return date.toLocaleTimeString('pt-BR', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/** Human-readable day + time for display (e.g. "Seg 08:30"). */
export function fmtSPNow(): string {
  return new Date().toLocaleString('pt-BR', {
    timeZone: TZ,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
