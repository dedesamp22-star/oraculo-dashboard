/**
 * useDemoTrading — full demo trade state machine.
 *
 * Responsibilities:
 *  · Open simulated trades when the engine fires BUY / SELL
 *  · Monitor price tick-by-tick (every 30 s poll) for SL / T1 / T2
 *  · Move stop to breakeven once T1 is hit
 *  · Calculate unrealized and realized P&L
 *  · Enforce all safety rules (max 8 / day, 3 consec losses, 3% drawdown)
 *  · Persist every state change to localStorage
 *  · Reset daily stats when the SP calendar date rolls over
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { EngineResult } from '../lib/analysis';
import {
  type DemoSession,
  type DemoTrade,
  type DailyStats,
  type TradeExitReason,
  makeSession,
  makeDailyStats,
  loadSession,
  saveSession,
  clearSession,
  todaySP,
  isSafetyLimited,
} from '../lib/demo';

// ── Position sizing ───────────────────────────────────────────────────────────

function calcPositionSize(balance: number, entry: number, stop: number): {
  riskAmount: number;
  positionSize: number;
} {
  const riskAmount = balance * 0.01;                  // 1% of balance
  const dist       = Math.abs(entry - stop);
  const positionSize = dist > 0 ? riskAmount / dist : 0;
  return { riskAmount, positionSize };
}

// ── ID generator ──────────────────────────────────────────────────────────────

let _tradeIdSeq = 0;
function newTradeId(): string {
  return `demo_${Date.now()}_${++_tradeIdSeq}`;
}

// ── Hook exports ──────────────────────────────────────────────────────────────

export interface DemoTradingState {
  session: DemoSession;
  /** Feed a new engine result. Call from the demo auto-analysis callback. */
  feedSignal: (result: EngineResult, pair: string) => void;
  /** Update current price — checks SL/T1/T2 for the active trade. */
  updatePrice: (price: number) => void;
  /** Reset the session to a fresh state with the given starting balance. */
  resetSession: (startingBalance: number) => void;
  /** Change the configured (target) balance without wiping history. */
  setConfiguredBalance: (balance: number) => void;
}

export function useDemoTrading(): DemoTradingState {
  // ── Bootstrap from localStorage ───────────────────────────────────────────

  const [session, setSession] = useState<DemoSession>(() => {
    const saved = loadSession();
    if (!saved) return makeSession();

    // If the saved session is from a previous day, roll over daily stats
    const today = todaySP();
    if (saved.dailyStats.date !== today) {
      return {
        ...saved,
        dailyStats: makeDailyStats(today, saved.balance),
      };
    }
    return saved;
  });

  // Persist on every state change
  useEffect(() => {
    saveSession(session);
  }, [session]);

  // Stable ref so callbacks don't capture stale session
  const sessionRef = useRef(session);
  useEffect(() => { sessionRef.current = session; }, [session]);

  // ── Day-rollover watchdog ─────────────────────────────────────────────────

  useEffect(() => {
    const id = setInterval(() => {
      const today = todaySP();
      setSession(prev => {
        if (prev.dailyStats.date === today) return prev;
        // New day — reset daily stats, keep balance & history
        return {
          ...prev,
          dailyStats: makeDailyStats(today, prev.balance),
        };
      });
    }, 60_000);          // check every minute
    return () => clearInterval(id);
  }, []);

  // ── Mutator helpers ───────────────────────────────────────────────────────

  /** Update session immutably and persist. */
  const update = useCallback((updater: (prev: DemoSession) => DemoSession) => {
    setSession(prev => {
      const next = updater(prev);
      saveSession(next);
      return next;
    });
  }, []);

  // ── Close trade ───────────────────────────────────────────────────────────

  const closeTrade = useCallback((
    trade: DemoTrade,
    closePrice: number,
    exitReason: TradeExitReason,
    prevSession: DemoSession,
  ): DemoSession => {
    const isBuy = trade.direction === 'BUY';
    const pnlUSDC = isBuy
      ? (closePrice - trade.entry) * trade.positionSize
      : (trade.entry - closePrice) * trade.positionSize;
    const pnlPct = (pnlUSDC / trade.balanceAtOpen) * 100;

    // Status
    let status: DemoTrade['status'];
    if (exitReason === 'TARGET_1' || exitReason === 'TARGET_2') {
      status = 'WIN';
    } else if (exitReason === 'BREAKEVEN') {
      status = 'BREAKEVEN';
    } else {
      status = 'LOSS';
    }

    const closedTrade: DemoTrade = {
      ...trade,
      status,
      closeTime: Date.now(),
      closePrice,
      exitReason,
      pnlUSDC,
      pnlPct,
    };

    const newBalance = prevSession.balance + pnlUSDC;
    const prev       = prevSession.dailyStats;

    // Update consecutive loss counter
    const consecutiveLosses = status === 'LOSS'
      ? prev.consecutiveLosses + 1
      : 0;
    const maxConsecutiveLosses = Math.max(prev.maxConsecutiveLosses, consecutiveLosses);

    // Update daily P&L + drawdown
    const dailyPnL = prev.dailyPnL + pnlUSDC;
    const peakBalance = Math.max(prev.peakBalance, newBalance);
    const drawdownNow = peakBalance - newBalance;
    const maxDrawdown = Math.max(prev.maxDrawdown, drawdownNow);

    const wins       = prev.wins       + (status === 'WIN'       ? 1 : 0);
    const losses     = prev.losses     + (status === 'LOSS'      ? 1 : 0);
    const breakevens = prev.breakevens + (status === 'BREAKEVEN' ? 1 : 0);

    // Check safety limits after close
    const updatedStats: DailyStats = {
      ...prev,
      wins, losses, breakevens,
      consecutiveLosses,
      maxConsecutiveLosses,
      dailyPnL,
      peakBalance,
      maxDrawdown,
      safetyLimited: isSafetyLimited({
        ...prev,
        consecutiveLosses,
        dailyPnL,
        wins, losses, breakevens,
        peakBalance,
        maxDrawdown,
        maxConsecutiveLosses,
      }),
    };

    return {
      ...prevSession,
      balance:     newBalance,
      activeTrade: null,
      history:     [closedTrade, ...prevSession.history],
      dailyStats:  updatedStats,
    };
  }, []);

  // ── updatePrice ───────────────────────────────────────────────────────────

  const updatePrice = useCallback((price: number) => {
    setSession(prev => {
      const trade = prev.activeTrade;
      if (!trade) return prev;

      const isBuy = trade.direction === 'BUY';

      // ── Target 2 check (highest priority) ─────────────────────────────
      if (isBuy ? price >= trade.target2 : price <= trade.target2) {
        return closeTrade(trade, trade.target2, 'TARGET_2', prev);
      }

      // ── T1 touch: move stop to breakeven ──────────────────────────────
      let updatedTrade = trade;
      if (!trade.target1Hit) {
        if (isBuy ? price >= trade.target1 : price <= trade.target1) {
          updatedTrade = {
            ...trade,
            target1Hit:       true,
            stopLoss:         trade.entry,   // move stop to breakeven
            isBreakevenStop:  true,
          };
        }
      }

      // ── Stop loss / breakeven check ───────────────────────────────────
      if (isBuy ? price <= updatedTrade.stopLoss : price >= updatedTrade.stopLoss) {
        const reason: TradeExitReason = updatedTrade.isBreakevenStop ? 'BREAKEVEN' : 'STOP_LOSS';
        return closeTrade(updatedTrade, updatedTrade.stopLoss, reason, prev);
      }

      // ── No level hit — just update the trade state (for breakeven flag) ─
      if (updatedTrade !== trade) {
        const next = { ...prev, activeTrade: updatedTrade };
        saveSession(next);
        return next;
      }

      return prev;
    });
  }, [closeTrade]);

  // ── feedSignal ────────────────────────────────────────────────────────────

  const feedSignal = useCallback((result: EngineResult, pair: string) => {
    setSession(prev => {
      // Must have a real BUY or SELL signal with numeric levels
      if (result.decision === 'SEM ENTRADA') return prev;
      if (
        result.entryNum    === null ||
        result.stopLossNum === null ||
        result.target1Num  === null ||
        result.target2Num  === null
      ) return prev;

      // Enforce safety rules
      if (isSafetyLimited(prev.dailyStats)) return prev;
      if (prev.dailyStats.totalTrades >= 8)  return prev;

      // No duplicate open trades
      if (prev.activeTrade !== null) return prev;

      const entry   = result.entryNum;
      const stop    = result.stopLossNum;
      const target1 = result.target1Num;
      const target2 = result.target2Num;

      const { riskAmount, positionSize } = calcPositionSize(prev.balance, entry, stop);

      // Collect signal context
      const signalReasons = result.steps
        .filter(s => s.number < 7)
        .map(s => `[${s.number}] ${s.name}: ${s.value} — ${s.reason}`);

      const isBuy = result.decision === 'BUY';
      const marketConditions = [
        `Tendência 1H: ${result.steps[0]?.value ?? '—'}`,
        `Momentum 15M: ${result.steps[1]?.value ?? '—'}`,
        `Confirmação 5M: ${result.steps[2]?.value ?? '—'}`,
        `Volume: ${result.steps[4]?.value ?? '—'}`,
        `R/R: ${result.riskReward ?? '—'}`,
        isBuy ? 'Direção: COMPRA' : 'Direção: VENDA',
      ].join(' · ');

      const trade: DemoTrade = {
        id:              newTradeId(),
        pair,
        direction:       result.decision as 'BUY' | 'SELL',
        openTime:        Date.now(),
        entry,
        stopLoss:        stop,
        stopLossOriginal: stop,
        target1,
        target2,
        balanceAtOpen:   prev.balance,
        riskAmount,
        positionSize,
        riskReward:      result.riskReward ?? '—',
        status:          'OPEN',
        target1Hit:      false,
        isBreakevenStop: false,
        signalReasons,
        marketConditions,
      };

      const updatedStats: DailyStats = {
        ...prev.dailyStats,
        totalTrades: prev.dailyStats.totalTrades + 1,
        safetyLimited: isSafetyLimited({
          ...prev.dailyStats,
          totalTrades: prev.dailyStats.totalTrades + 1,
        }),
      };

      const next: DemoSession = {
        ...prev,
        activeTrade: trade,
        dailyStats:  updatedStats,
      };
      saveSession(next);
      return next;
    });
  }, []);

  // ── resetSession ──────────────────────────────────────────────────────────

  const resetSession = useCallback((startingBalance: number) => {
    clearSession();
    const fresh = makeSession(startingBalance);
    setSession(fresh);
    saveSession(fresh);
  }, []);

  // ── setConfiguredBalance ──────────────────────────────────────────────────

  const setConfiguredBalance = useCallback((balance: number) => {
    update(prev => ({ ...prev, configuredBalance: balance }));
  }, [update]);

  return { session, feedSignal, updatePrice, resetSession, setConfiguredBalance };
}
