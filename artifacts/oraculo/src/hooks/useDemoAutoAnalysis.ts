/**
 * useDemoAutoAnalysis — 24/7 candle-close engine trigger for demo mode.
 *
 * Unlike useAutoAnalysis, there is NO operational-hours gate here.
 * Analysis fires on every 5-minute candle close, 24 hours a day, 7 days a week.
 * Still deduplicates per candle bucket — at most one analysis per 5M candle.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Candle } from '../lib/binance';
import { runEngine, type EngineResult } from '../lib/analysis';
import {
  secsUntilNextCandle,
  currentCandleOpenMs,
  fmtCountdown,
} from '../lib/schedule';

export interface DemoAutoState {
  countdown: string;        // "04:32"
  lastAnalysisTime: Date | null;
}

interface Props {
  enabled: boolean;
  candles1h:  Candle[];
  candles15m: Candle[];
  candles5m:  Candle[];
  price: number | null;
  onResult: (result: EngineResult) => void;
}

export function useDemoAutoAnalysis({
  enabled,
  candles1h,
  candles15m,
  candles5m,
  price,
  onResult,
}: Props): DemoAutoState {
  const [countdown,        setCountdown]        = useState('--:--');
  const [lastAnalysisTime, setLastAnalysisTime] = useState<Date | null>(null);

  // Keep latest market data in a ref — interval never sees stale closures
  const dataRef = useRef({ candles1h, candles15m, candles5m, price });
  useEffect(() => {
    dataRef.current = { candles1h, candles15m, candles5m, price };
  }, [candles1h, candles15m, candles5m, price]);

  const onResultRef = useRef(onResult);
  useEffect(() => { onResultRef.current = onResult; }, [onResult]);

  // Track last analysed candle to avoid duplicate runs
  const lastAnalysedCandleRef = useRef<number | null>(null);

  const runAnalysis = useCallback(() => {
    const { candles1h, candles15m, candles5m, price } = dataRef.current;
    if (
      price === null ||
      candles1h.length  < 30 ||
      candles15m.length < 25 ||
      candles5m.length  < 12
    ) return;

    const result = runEngine(candles1h, candles15m, candles5m, price);
    setLastAnalysisTime(new Date());
    onResultRef.current(result);
  }, []);

  // Seed + immediate run on activation
  useEffect(() => {
    if (!enabled) {
      lastAnalysedCandleRef.current = null;
      setCountdown('--:--');
      return;
    }
    lastAnalysedCandleRef.current = currentCandleOpenMs();
    runAnalysis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // 1-second ticker: countdown + candle-close detection
  useEffect(() => {
    if (!enabled) return;

    const tick = () => {
      setCountdown(fmtCountdown(secsUntilNextCandle()));
      const candle = currentCandleOpenMs();

      if (
        lastAnalysedCandleRef.current !== null &&
        candle !== lastAnalysedCandleRef.current
      ) {
        lastAnalysedCandleRef.current = candle;
        runAnalysis();      // NO isOperational() check — 24/7
      } else if (lastAnalysedCandleRef.current === null) {
        lastAnalysedCandleRef.current = candle;
      }
    };

    tick();
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, [enabled, runAnalysis]);

  return { countdown, lastAnalysisTime };
}
