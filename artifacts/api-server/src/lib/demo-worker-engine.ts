export {
  DEMO_EXHAUSTION_CONFIG,
  analyzeDemoCandles,
  blockingQualityFailures,
  qualityFilters,
  riskRewardMeetsMinimum,
  type Candle,
  type QualityFilter,
  type RadarLikeAnalysis,
} from "@shared/marketDecisionEngine";

import {
  analyzeDemoCandles,
  type Candle,
  type DemoSignalInput,
  type DemoSymbol,
  type LastTradeContext,
  type QualityFilter,
  type RadarLikeAnalysis,
} from "@shared/marketDecisionEngine";

const BINANCE_BASE = "https://api.binance.us/api/v3";
const ALLOWED_SYMBOLS = new Set<DemoSymbol>(["BTCUSDT", "ETHUSDT", "SOLUSDT"]);

function validCandle(candle: Candle): boolean {
  const values = [candle.openTime, candle.open, candle.high, candle.low, candle.close, candle.volume, candle.closeTime];
  if (values.some((value) => !Number.isFinite(value))) return false;
  if (candle.closeTime <= candle.openTime) return false;
  if (candle.open < 0 || candle.high < 0 || candle.low < 0 || candle.close < 0 || candle.volume < 0) return false;
  if (candle.high < Math.max(candle.open, candle.close, candle.low)) return false;
  if (candle.low > Math.min(candle.open, candle.close, candle.high)) return false;
  return true;
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
  return validCandle(candle) ? candle : null;
}

async function binanceJson(path: string): Promise<unknown> {
  const res = await fetch(`${BINANCE_BASE}${path}`);
  if (!res.ok) throw new Error(`Binance upstream error ${res.status}: ${res.statusText}`);
  return await res.json();
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

export async function analyzeDemoSignal(symbol: string, options: { lastTrade?: LastTradeContext | null } = {}): Promise<{ price: number; signal: DemoSignalInput; analysis: RadarLikeAnalysis; filters: QualityFilter[] }> {
  const normalized = symbol.toUpperCase() as DemoSymbol;
  if (!ALLOWED_SYMBOLS.has(normalized)) throw new Error(`Unsupported demo symbol ${symbol}`);
  const [price, candles1h, candles15m, candles5m] = await Promise.all([
    fetchDisplayPrice(normalized),
    fetchKlines(normalized, "1h", 240),
    fetchKlines(normalized, "15m", 90),
    fetchKlines(normalized, "5m", 80),
  ]);
  return analyzeDemoCandles({ symbol: normalized, displayPrice: price, candles1h, candles15m, candles5m, lastTrade: options.lastTrade ?? null });
}
