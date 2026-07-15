// Polls Binance public market data at a fixed interval.
import { useState, useEffect, useCallback } from 'react';
import { fetchPrice, fetchKlines, type Candle } from '../lib/binance';

export interface BinanceData {
  price: number | null;
  candles1h: Candle[];
  candles15m: Candle[];
  candles5m: Candle[];
  lastUpdate: Date | null;
  error: string | null;
  loading: boolean;
}

const SYMBOL  = 'BTCUSDT';
const POLL_MS = 30_000;

export function useBinanceData(): BinanceData {
  const [state, setState] = useState<BinanceData>({
    price: null,
    candles1h: [],
    candles15m: [],
    candles5m: [],
    lastUpdate: null,
    error: null,
    loading: true,
  });

  const fetchAll = useCallback(async () => {
    try {
      const [price, candles1h, candles15m, candles5m] = await Promise.all([
        fetchPrice(SYMBOL),
        fetchKlines(SYMBOL, '1h',  220), // 220 candles for accurate EMA 200 warm-up
        fetchKlines(SYMBOL, '15m', 80),  // 80 candles for EMA 9 & 21
        fetchKlines(SYMBOL, '5m',  50),  // 50 candles for EMA 9
      ]);
      setState({
        price,
        candles1h,
        candles15m,
        candles5m,
        lastUpdate: new Date(),
        error: null,
        loading: false,
      });
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Erro ao buscar dados.',
      }));
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, POLL_MS);
    return () => clearInterval(id);
  }, [fetchAll]);

  return state;
}
