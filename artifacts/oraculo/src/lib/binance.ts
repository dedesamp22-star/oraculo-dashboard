// Binance market data – routed through the local API proxy to avoid CORS.
// The proxy forwards to https://api.binance.com/api/v3 (read-only, no auth).

import { apiJson } from './apiClient';

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
  const data = await apiJson<{ price: string }>(`${PROXY}/price?symbol=${symbol}`);
  return parseFloat(data.price);
}

/** OHLCV candlestick data for a symbol and interval */
export async function fetchKlines(
  symbol: string,
  interval: Interval,
  limit = 50,
): Promise<Candle[]> {
  const url = `${PROXY}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const raw = await apiJson<unknown[][]>(url);
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
