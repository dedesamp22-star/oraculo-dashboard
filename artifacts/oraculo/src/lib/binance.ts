// Binance market data – routed through the local API proxy to avoid CORS.
// The proxy forwards to https://api.binance.com/api/v3 (read-only, no auth).

const PROXY = `${import.meta.env.BASE_URL}api/binance`.replace(/\/+/g, '/');

export interface Candle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

export type Interval = '1h' | '15m' | '5m';

/** Current price for a symbol, e.g. BTCUSDT */
export async function fetchPrice(symbol: string): Promise<number> {
  const res = await fetch(`${PROXY}/price?symbol=${symbol}`);
  if (!res.ok) throw new Error(`Price fetch failed: ${res.status}`);
  const data = await res.json();
  return parseFloat(data.price);
}

/** OHLCV candlestick data for a symbol and interval */
export async function fetchKlines(
  symbol: string,
  interval: Interval,
  limit = 50,
): Promise<Candle[]> {
  const url = `${PROXY}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Klines fetch failed: ${res.status}`);
  const raw: unknown[][] = await res.json();
  return raw.map((row) => ({
    openTime:  Number(row[0]),
    open:      parseFloat(row[1] as string),
    high:      parseFloat(row[2] as string),
    low:       parseFloat(row[3] as string),
    close:     parseFloat(row[4] as string),
    volume:    parseFloat(row[5] as string),
    closeTime: Number(row[6]),
  }));
}
