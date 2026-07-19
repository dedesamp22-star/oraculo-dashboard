import type { DemoSignalInput } from "./demo-store";

interface Candle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

const BINANCE_BASE = "https://api.binance.us/api/v3";

async function binanceJson(path: string): Promise<unknown> {
  const res = await fetch(`${BINANCE_BASE}${path}`);
  if (!res.ok) throw new Error(`Binance upstream error ${res.status}: ${res.statusText}`);
  return await res.json();
}

function toCandle(row: unknown): Candle | null {
  if (!Array.isArray(row) || row.length < 7) return null;
  const candle: Candle = {
    openTime: Number(row[0]),
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[5]),
    closeTime: Number(row[6]),
  };
  const values = [candle.openTime, candle.open, candle.high, candle.low, candle.close, candle.volume, candle.closeTime];
  if (values.some((value) => !Number.isFinite(value))) return null;
  if (candle.closeTime <= candle.openTime) return null;
  if (candle.open < 0 || candle.high < 0 || candle.low < 0 || candle.close < 0 || candle.volume < 0) return null;
  if (candle.high < Math.max(candle.open, candle.close, candle.low)) return null;
  if (candle.low > Math.min(candle.open, candle.close, candle.high)) return null;
  return candle;
}

async function fetchKlines(symbol: string, interval: string, limit: number): Promise<Candle[]> {
  const raw = await binanceJson(`/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
  if (!Array.isArray(raw)) return [];
  return raw.map(toCandle).filter((candle): candle is Candle => candle !== null);
}

export async function fetchDisplayPrice(symbol: string): Promise<number> {
  const data = await binanceJson(`/ticker/price?symbol=${symbol}`) as { price?: unknown };
  const price = Number(data.price);
  if (!Number.isFinite(price) || price <= 0) throw new Error("Invalid Binance price");
  return price;
}

function ema(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const out = [values[0]];
  for (let i = 1; i < values.length; i++) out.push(values[i] * k + out[i - 1] * (1 - k));
  return out;
}

function lastEma(candles: Candle[], period: number): number {
  const series = ema(candles.map((c) => c.close), period);
  return series[series.length - 1];
}

function avgVolume(candles: Candle[], period: number): number {
  const slice = candles.slice(-period - 1, -1);
  return slice.length > 0 ? slice.reduce((sum, c) => sum + c.volume, 0) / slice.length : 0;
}

function atr(candles: Candle[], period: number): number {
  const trs = candles.slice(1).map((c, index) => {
    const prev = candles[index];
    return Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close));
  });
  const slice = trs.slice(-period);
  return slice.length > 0 ? slice.reduce((sum, value) => sum + value, 0) / slice.length : 0;
}

function pivots(candles: Candle[], kind: "high" | "low"): number[] {
  const out: number[] = [];
  for (let i = 2; i < candles.length - 2; i++) {
    const value = kind === "high" ? candles[i].high : candles[i].low;
    const before = candles.slice(i - 2, i);
    const after = candles.slice(i + 1, i + 3);
    const ok = kind === "high"
      ? before.every((c) => c.high < value) && after.every((c) => c.high < value)
      : before.every((c) => c.low > value) && after.every((c) => c.low > value);
    if (ok) out.push(value);
  }
  return out;
}

export async function analyzeLegacyDemoSignal(symbol: string): Promise<{ price: number; signal: DemoSignalInput }> {
  const [price, candles1h, candles15m, candles5m] = await Promise.all([
    fetchDisplayPrice(symbol),
    fetchKlines(symbol, "1h", 220),
    fetchKlines(symbol, "15m", 80),
    fetchKlines(symbol, "5m", 50),
  ]);

  const none = (reason: string): DemoSignalInput => ({
    pair: symbol,
    decision: "SEM ENTRADA",
    entryNum: null,
    stopLossNum: null,
    target1Num: null,
    target2Num: null,
    riskReward: null,
    signalKey: `none:${symbol}:${candles5m.at(-1)?.closeTime ?? Date.now()}`,
    steps: [{ number: 0, name: "Servidor demo", value: "SEM ENTRADA", reason }],
  });

  if (candles1h.length < 200 || candles15m.length < 25 || candles5m.length < 12) {
    return { price, signal: none("Dados insuficientes para processar demo no servidor.") };
  }

  const close1h = candles1h.at(-1)!.close;
  const ema200 = lastEma(candles1h, 200);
  const ema9_15 = lastEma(candles15m, 9);
  const ema21_15 = lastEma(candles15m, 21);
  const ema9_5 = lastEma(candles5m, 9);
  const close5 = candles5m.at(-1)!.close;
  const direction = close1h > ema200 && ema9_15 > ema21_15 && close5 > ema9_5
    ? "BUY"
    : close1h < ema200 && ema9_15 < ema21_15 && close5 < ema9_5
      ? "SELL"
      : "SEM ENTRADA";

  const avg20 = avgVolume(candles15m, 20);
  const lastVolume = candles15m.at(-1)!.volume;
  if (direction === "SEM ENTRADA") return { price, signal: none("Tendencia, momentum e gatilho 5m nao estao alinhados.") };
  if (avg20 <= 0 || lastVolume / avg20 < 1.2) return { price, signal: none("Volume abaixo de 120% da media de 20 candles.") };

  const support = pivots(candles15m, "low").filter((level) => level < close5 * 0.9997).sort((a, b) => b - a)[0] ?? null;
  const resistance = pivots(candles15m, "high").filter((level) => level > close5 * 1.0003).sort((a, b) => a - b)[0] ?? null;
  const currentAtr = atr(candles15m, 14);
  const isBuy = direction === "BUY";
  const entry = close5;
  const stop = isBuy
    ? support === null ? entry - 1.5 * currentAtr : Math.max(support * 0.999, entry - 2 * currentAtr)
    : resistance === null ? entry + 1.5 * currentAtr : Math.min(resistance * 1.001, entry + 2 * currentAtr);
  const risk = Math.abs(entry - stop);
  const target1 = isBuy
    ? resistance === null ? entry + 2 * risk : resistance * 0.9995
    : support === null ? entry - 2 * risk : support * 1.0005;
  const target2 = isBuy ? entry + 3 * risk : entry - 3 * risk;
  const rr = risk > 0 ? Math.abs(target1 - entry) / risk : 0;
  if (!Number.isFinite(rr) || rr < 1.5) return { price, signal: none("Risco/retorno abaixo do minimo legado 1:1.5.") };

  return {
    price,
    signal: {
      pair: symbol,
      decision: direction,
      entryNum: entry,
      stopLossNum: stop,
      target1Num: target1,
      target2Num: target2,
      riskReward: `1:${rr.toFixed(2)}`,
      signalKey: `${symbol}:${direction}:${candles5m.at(-1)!.closeTime}`,
      steps: [
        { number: 1, name: "Servidor demo legado", value: direction, reason: "Sinal processado no backend para manter o demo ativo sem navegador." },
      ],
    },
  };
}
