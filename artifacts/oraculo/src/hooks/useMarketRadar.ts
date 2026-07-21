import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchKlines, fetchPrice } from '../lib/binance';
import { analyzeMarketRadar, type MarketRadarAnalysis, type RadarSymbol } from '../lib/marketRadar';

interface MarketRadarState {
  analysis: MarketRadarAnalysis | null;
  loading: boolean;
  error: string | null;
  lastUpdate: Date | null;
  symbol: RadarSymbol;
  setSymbol: (symbol: RadarSymbol) => void;
  refresh: () => Promise<void>;
}

type MarketRadarDataState = Omit<MarketRadarState, 'symbol' | 'setSymbol' | 'refresh'>;

export const RADAR_SYMBOLS: RadarSymbol[] = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];

const STORAGE_KEY = 'oraculo:radar:symbol';
const DEFAULT_SYMBOL: RadarSymbol = 'BTCUSDT';
const POLL_MS = 30_000;

function isRadarSymbol(value: string | null): value is RadarSymbol {
  return value !== null && RADAR_SYMBOLS.includes(value as RadarSymbol);
}

function initialSymbol(): RadarSymbol {
  if (typeof window === 'undefined') return DEFAULT_SYMBOL;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return isRadarSymbol(stored) ? stored : DEFAULT_SYMBOL;
}

export function useMarketRadar(enabled = true): MarketRadarState {
  const [symbol, setSymbolState] = useState<RadarSymbol>(() => initialSymbol());
  const [state, setState] = useState<MarketRadarDataState>({
    analysis: null,
    loading: true,
    error: null,
    lastUpdate: null,
  });
  const lastSignalKeyRef = useRef<string | null>(null);
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const setSymbol = useCallback((nextSymbol: RadarSymbol) => {
    setSymbolState((current) => {
      if (current === nextSymbol) return current;
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_KEY, nextSymbol);
      }
      lastSignalKeyRef.current = null;
      setState((prev) => ({
        ...prev,
        analysis: null,
        loading: true,
        error: null,
      }));
      return nextSymbol;
    });
  }, []);

  const refresh = useCallback(async (activeSymbol: RadarSymbol) => {
    if (!enabled) return;
    const requestId = ++requestIdRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState((prev) => ({
      ...prev,
      loading: true,
      error: null,
      analysis: prev.analysis?.symbol === activeSymbol ? prev.analysis : null,
    }));

    try {
      const [displayPrice, candles1h, candles15m, candles5m] = await Promise.all([
        fetchPrice(activeSymbol, controller.signal),
        fetchKlines(activeSymbol, '1h', 240, controller.signal),
        fetchKlines(activeSymbol, '15m', 120, controller.signal),
        fetchKlines(activeSymbol, '5m', 80, controller.signal),
      ]);

      if (controller.signal.aborted || requestId !== requestIdRef.current) return;

      const next = analyzeMarketRadar({ symbol: activeSymbol, displayPrice, candles1h, candles15m, candles5m });
      const lastUpdate = new Date();

      setState((prev) => {
        if (lastSignalKeyRef.current === next.signalKey && prev.analysis?.symbol === activeSymbol) {
          return {
            analysis: {
              ...next,
              generatedAt: prev.analysis.generatedAt,
            },
            loading: false,
            error: null,
            lastUpdate,
          };
        }
        lastSignalKeyRef.current = next.signalKey;
        return { analysis: next, loading: false, error: null, lastUpdate };
      });
    } catch (err) {
      if (controller.signal.aborted || requestId !== requestIdRef.current) return;
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Falha ao atualizar o Radar do Mercado.',
        lastUpdate: new Date(),
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
      lastSignalKeyRef.current = null;
      setState({
        analysis: null,
        loading: false,
        error: null,
        lastUpdate: null,
      });
      return;
    }
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, symbol);
    }
    refresh(symbol);
    const id = window.setInterval(() => refresh(symbol), POLL_MS);
    return () => {
      window.clearInterval(id);
      requestIdRef.current += 1;
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [enabled, refresh, symbol]);

  return { ...state, symbol, setSymbol, refresh: () => refresh(symbol) };
}
