// Polls Binance public market data at a fixed interval.
import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchPrice, fetchKlines, type Candle } from '../lib/binance';

export interface BinanceData {
  price: number | null;
  candles1h: Candle[];
  candles15m: Candle[];
  candles5m: Candle[];
  lastUpdate: Date | null;
  error: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

type BinanceDataState = Omit<BinanceData, 'refresh'>;

const SYMBOL  = 'BTCUSDT';
const POLL_MS = 30_000;

export function useBinanceData(enabled = true): BinanceData {
  const [state, setState] = useState<BinanceDataState>({
    price: null,
    candles1h: [],
    candles15m: [],
    candles5m: [],
    lastUpdate: null,
    error: null,
    loading: true,
  });
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const fetchAll = useCallback(async () => {
    if (!enabled) return;
    const requestId = ++requestIdRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const [price, candles1h, candles15m, candles5m] = await Promise.all([
        fetchPrice(SYMBOL, controller.signal),
        fetchKlines(SYMBOL, '1h',  220, controller.signal), // 220 candles for accurate EMA 200 warm-up
        fetchKlines(SYMBOL, '15m', 80, controller.signal),  // 80 candles for EMA 9 & 21
        fetchKlines(SYMBOL, '5m',  50, controller.signal),  // 50 candles for EMA 9
      ]);
      if (controller.signal.aborted || requestId !== requestIdRef.current) return;
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
      if (controller.signal.aborted || requestId !== requestIdRef.current) return;
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Erro ao buscar dados.',
      }));
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      requestIdRef.current += 1;
      abortRef.current?.abort();
      abortRef.current = null;
      setState({
        price: null,
        candles1h: [],
        candles15m: [],
        candles5m: [],
        lastUpdate: null,
        error: null,
        loading: false,
      });
      return;
    }
    fetchAll();
    const id = setInterval(fetchAll, POLL_MS);
    return () => {
      clearInterval(id);
      requestIdRef.current += 1;
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [enabled, fetchAll]);

  return { ...state, refresh: fetchAll };
}
