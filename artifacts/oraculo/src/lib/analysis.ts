// Technical analysis helpers – pure functions, no external deps.
import type { Candle } from './binance';

// ── EMA ──────────────────────────────────────────────────────────────────────
function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const result: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    result.push(values[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

// ── ATR (Average True Range) ─────────────────────────────────────────────────
function atr(candles: Candle[], period = 14): number {
  const trs = candles.slice(1).map((c, i) => {
    const prev = candles[i];
    return Math.max(
      c.high - c.low,
      Math.abs(c.high - prev.close),
      Math.abs(c.low  - prev.close),
    );
  });
  const slice = trs.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

// ── RSI ───────────────────────────────────────────────────────────────────────
function rsi(candles: Candle[], period = 14): number {
  const changes = candles.slice(1).map((c, i) => c.close - candles[i].close);
  const slice = changes.slice(-period);
  const gains = slice.filter((x) => x > 0).reduce((a, b) => a + b, 0) / period;
  const losses = slice.filter((x) => x < 0).reduce((a, b) => a - b, 0) / period;
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

// ── Trend from 1H candles ────────────────────────────────────────────────────
function trend1h(candles: Candle[]): { label: string; bullish: boolean } {
  const closes = candles.map((c) => c.close);
  const fast = ema(closes, 9);
  const slow = ema(closes, 21);
  const lastFast = fast[fast.length - 1];
  const lastSlow = slow[slow.length - 1];
  const prevFast = fast[fast.length - 2];
  const prevSlow = slow[slow.length - 2];
  const bullish = lastFast > lastSlow;
  const crossing = bullish && prevFast <= prevSlow;
  const label = crossing ? 'CRUZAMENTO ALTA' : bullish ? 'ALTA' : 'BAIXA';
  return { label, bullish };
}

// ── Market structure from 15M candles ────────────────────────────────────────
function structure15m(candles: Candle[]): { label: string } {
  const recent = candles.slice(-10);
  const highs = recent.map((c) => c.high);
  const lows  = recent.map((c) => c.low);
  const risingHighs = highs[highs.length - 1] > highs[0];
  const risingLows  = lows[lows.length  - 1] > lows[0];
  if (risingHighs && risingLows)  return { label: 'ROMPIMENTO' };
  if (!risingHighs && !risingLows) return { label: 'PRESSÃO VENDEDORA' };
  return { label: 'CONSOLIDAÇÃO' };
}

// ── Entry confirmation from 5M candles ───────────────────────────────────────
function confirmation5m(candles: Candle[], bullish: boolean): { label: string; confirmed: boolean } {
  const last3 = candles.slice(-3);
  const bullishBars = last3.filter((c) => c.close > c.open).length;
  const bearishBars = last3.filter((c) => c.close < c.open).length;
  if (bullish && bullishBars >= 2) return { label: 'CONFIRMADO', confirmed: true };
  if (!bullish && bearishBars >= 2) return { label: 'CONFIRMADO', confirmed: true };
  return { label: 'AGUARDANDO', confirmed: false };
}

// ── Format price ─────────────────────────────────────────────────────────────
function fmt(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Main analysis entry point ─────────────────────────────────────────────────
export interface AnalysisResult {
  status: 'SINAL DETECTADO' | 'SEM SINAL' | 'AGUARDANDO';
  trend1h: string;
  structure15m: string;
  confirmation5m: string;
  entry: string;
  stopLoss: string;
  target1: string;
  target2: string;
  riskReward: string;
  notes: string;
  bullish: boolean;
}

export function analyze(
  candles1h: Candle[],
  candles15m: Candle[],
  candles5m: Candle[],
  currentPrice: number,
): AnalysisResult {
  const t1h = trend1h(candles1h);
  const str15 = structure15m(candles15m);
  const conf5 = confirmation5m(candles5m, t1h.bullish);

  const atr1h = atr(candles1h);
  const rsiVal = rsi(candles1h);

  const entry = currentPrice;
  const sl = t1h.bullish ? entry - 1.5 * atr1h : entry + 1.5 * atr1h;
  const t1 = t1h.bullish ? entry + 2.0 * atr1h : entry - 2.0 * atr1h;
  const t2 = t1h.bullish ? entry + 3.5 * atr1h : entry - 3.5 * atr1h;

  const risk = Math.abs(entry - sl);
  const reward = Math.abs(t1 - entry);
  const rrRaw = reward / risk;

  const hasSignal = conf5.confirmed && str15.label !== 'CONSOLIDAÇÃO';
  const status: AnalysisResult['status'] = hasSignal ? 'SINAL DETECTADO' : 'AGUARDANDO';

  const rsiNote = rsiVal > 70
    ? 'RSI em sobrecompra — atenção ao risco de reversão.'
    : rsiVal < 30
    ? 'RSI em sobrevenda — possível reversão de alta.'
    : `RSI em ${fmt(rsiVal)} — momentum neutro.`;

  const trendNote = t1h.bullish
    ? 'EMA9 acima da EMA21 no 1H — tendência de alta ativa.'
    : 'EMA9 abaixo da EMA21 no 1H — tendência de baixa ativa.';

  const strNote =
    str15.label === 'ROMPIMENTO'
      ? 'Estrutura de 15M mostra rompimento com topos e fundos ascendentes.'
      : str15.label === 'PRESSÃO VENDEDORA'
      ? 'Estrutura de 15M sob pressão vendedora.'
      : 'Mercado em consolidação no 15M.';

  return {
    status,
    trend1h: t1h.label,
    structure15m: str15.label,
    confirmation5m: conf5.label,
    entry: `$${fmt(entry)}`,
    stopLoss: `$${fmt(sl)}`,
    target1: `$${fmt(t1)}`,
    target2: `$${fmt(t2)}`,
    riskReward: `1:${rrRaw.toFixed(1)}`,
    notes: `${trendNote} ${strNote} ${rsiNote}`,
    bullish: t1h.bullish,
  };
}
