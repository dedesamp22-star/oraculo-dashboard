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
}

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

export function useMarketRadar(): MarketRadarState {
  const [symbol, setSymbolState] = useState<RadarSymbol>(() => initialSymbol());
  const [state, setState] = useState<Omit<MarketRadarState, 'symbol' | 'setSymbol'>>({
    analysis: null,
    loading: true,
    error: null,
    lastUpdate: null,
  });
  const lastSignalKeyRef = useRef<string | null>(null);
  const requestIdRef = useRef(0);

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
    const requestId = ++requestIdRef.current;
    setState((prev) => ({
      ...prev,
      loading: true,
      error: null,
      analysis: prev.analysis?.symbol === activeSymbol ? prev.analysis : null,
    }));

    try {
      const [displayPrice, candles1h, candles15m, candles5m] = await Promise.all([
        fetchPrice(activeSymbol),
        fetchKlines(activeSymbol, '1h', 240),
        fetchKlines(activeSymbol, '15m', 120),
        fetchKlines(activeSymbol, '5m', 80),
      ]);

      if (requestId !== requestIdRef.current) return;

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
      if (requestId !== requestIdRef.current) return;
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Falha ao atualizar o Radar do Mercado.',
        lastUpdate: new Date(),
      }));
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, symbol);
    }
    refresh(symbol);
    const id = window.setInterval(() => refresh(symbol), POLL_MS);
    return () => window.clearInterval(id);
  }, [refresh, symbol]);

  return { ...state, symbol, setSymbol };
}
