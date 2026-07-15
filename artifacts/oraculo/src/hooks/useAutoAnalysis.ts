/**
 * useAutoAnalysis — automatic rule-engine scheduling.
 *
 * Behaviour:
 *  · Runs the engine immediately when auto mode is activated.
 *  · Re-runs once per 5-minute candle close (detected via UTC epoch buckets).
 *  · Skips analysis outside the Mon–Fri 08:30–17:00 SP window.
 *  · Guarantees at most ONE analysis per candle (duplicate-safe).
 *  · Exposes countdown, isOperational, and lastAnalysisTime for UI display.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Candle } from '../lib/binance';
import { runEngine, type EngineResult } from '../lib/analysis';
import {
  isOperational,
  secsUntilNextCandle,
  currentCandleOpenMs,
  fmtCountdown,
} from '../lib/schedule';

export interface AutoState {
  countdown: string;          // "04:32"
  isOperational: boolean;
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

export function useAutoAnalysis({
  enabled,
  candles1h,
  candles15m,
  candles5m,
  price,
  onResult,
}: Props): AutoState {
  const [countdown,        setCountdown]        = useState('--:--');
  const [operational,      setOperational]      = useState(false);
  const [lastAnalysisTime, setLastAnalysisTime] = useState<Date | null>(null);

  // --- Keep latest market data in a ref so the interval never sees stale data ---
  const dataRef = useRef({ candles1h, candles15m, candles5m, price });
  useEffect(() => {
    dataRef.current = { candles1h, candles15m, candles5m, price };
  }, [candles1h, candles15m, candles5m, price]);

  // Keep onResult stable inside the interval
  const onResultRef = useRef(onResult);
  useEffect(() => { onResultRef.current = onResult; }, [onResult]);

  // Track the last candle we analysed so we don't run twice on the same candle
  const lastAnalysedCandleRef = useRef<number | null>(null);

  // --- Core analysis runner (pure side-effect, no React state deps) ---
  const runAnalysis = useCallback(() => {
    const { candles1h, candles15m, candles5m, price } = dataRef.current;
    if (
      price === null ||
      candles1h.length  < 30 ||
      candles15m.length < 25 ||
      candles5m.length  < 12
    ) return;

    const result = runEngine(candles1h, candles15m, candles5m, price);
    const now = new Date();
    setLastAnalysisTime(now);
    onResultRef.current(result);
  }, []);                          // stable — uses refs only

  // --- Immediate run when auto mode is activated ---
  useEffect(() => {
    if (!enabled) {
      // Reset candle tracker when mode is turned off
      lastAnalysedCandleRef.current = null;
      setCountdown('--:--');
      return;
    }

    const op = isOperational();
    setOperational(op);

    // Seed the candle tracker with the current candle so the ticker
    // doesn't immediately fire again on the first tick
    lastAnalysedCandleRef.current = currentCandleOpenMs();

    if (op) runAnalysis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);  // only run when `enabled` flips

  // --- 1-second ticker: countdown + candle-close detection ---
  useEffect(() => {
    if (!enabled) return;

    const tick = () => {
      const op = isOperational();
      setOperational(op);
      setCountdown(fmtCountdown(secsUntilNextCandle()));

      const candle = currentCandleOpenMs();

      // New candle just opened  →  previous candle just closed
      if (
        lastAnalysedCandleRef.current !== null &&
        candle !== lastAnalysedCandleRef.current
      ) {
        lastAnalysedCandleRef.current = candle;
        if (op) runAnalysis();
      } else if (lastAnalysedCandleRef.current === null) {
        // Safety seed (shouldn't happen if the activation effect ran first)
        lastAnalysedCandleRef.current = candle;
      }
    };

    tick();                                          // first tick immediately
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, [enabled, runAnalysis]);

  return { countdown, isOperational: operational, lastAnalysisTime };
}
