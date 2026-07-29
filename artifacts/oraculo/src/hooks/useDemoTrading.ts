import { useCallback, useEffect, useRef, useState } from 'react';
import type { EngineResult } from '../lib/analysis';
import { type DemoSession, makeSession, loadSession } from '../lib/demo';
import {
  getDemoAutomation,
  loadServerSession,
  migrateLocalSession,
  persistAccount,
  resetServerSession,
  setDemoAutomation,
  submitDemoPrice,
  submitDemoSignal,
} from '../lib/demoApi';

export interface DemoTradingState {
  session: DemoSession;
  automationEnabled: boolean;
  serverAvailable: boolean;
  serverError: string | null;
  feedSignal: (result: EngineResult, pair: string) => void;
  updatePrice: (price: number, pair: string) => void;
  resetSession: (startingBalance: number) => void;
  setConfiguredBalance: (balance: number) => void;
  setAutomationEnabled: (enabled: boolean, symbol?: string) => void;
  refreshSession: () => void;
}

export function useDemoTrading(authenticated: boolean): DemoTradingState {
  const [session, setSession] = useState<DemoSession>(() => makeSession());
  const [automationEnabled, setAutomationEnabledState] = useState(false);
  const [serverAvailable, setServerAvailable] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const sessionRef = useRef(session);
  const writeInFlightRef = useRef(false);
  const generationRef = useRef(0);

  useEffect(() => { sessionRef.current = session; }, [session]);

  const applyRemoteSession = useCallback((next: DemoSession) => {
    if (!authenticated) return;
    setSession(next);
    setServerAvailable(true);
    setServerError(null);
  }, [authenticated]);

  const markError = useCallback((err: unknown) => {
    if (!authenticated) return;
    setServerAvailable(false);
    setServerError(err instanceof Error ? err.message : 'API demo indisponivel.');
  }, [authenticated]);

  const ensureWritable = useCallback(async (): Promise<boolean> => {
    if (authenticated) return true;
    setServerError('Login necessario para acessar o modo demo no servidor.');
    return false;
  }, [authenticated]);

  const refreshSession = useCallback(() => {
    if (!authenticated) return;
    const generation = generationRef.current;
    void loadServerSession()
      .then((next) => {
        if (generation === generationRef.current) applyRemoteSession(next);
      })
      .catch((err) => {
        if (generation === generationRef.current) markError(err);
      });
  }, [authenticated, applyRemoteSession, markError]);

  useEffect(() => {
    generationRef.current += 1;
    if (!authenticated) {
      setSession(makeSession());
      setAutomationEnabledState(false);
      setServerAvailable(false);
      setServerError(null);
      writeInFlightRef.current = false;
      return;
    }
    let cancelled = false;
    const generation = generationRef.current;
    async function bootstrap() {
      try {
        const local = loadSession();
        const hasLocalState = !!local && (
          local.history.length > 0 ||
          local.activeTrade !== null ||
          local.balance !== local.configuredBalance ||
          local.configuredBalance !== 1000
        );

        if (hasLocalState && local) {
          const migrated = await migrateLocalSession(local);
          if (!cancelled && generation === generationRef.current) applyRemoteSession(migrated);
        } else {
          const remote = await loadServerSession();
          if (!cancelled && generation === generationRef.current) applyRemoteSession(remote);
        }

        const automation = await getDemoAutomation();
        if (!cancelled && generation === generationRef.current) setAutomationEnabledState(automation.enabled);
      } catch (err) {
        if (!cancelled && generation === generationRef.current) markError(err);
      }
    }
    void bootstrap();
    return () => { cancelled = true; };
  }, [authenticated, applyRemoteSession, markError]);

  useEffect(() => {
    if (!authenticated) return;
    const id = setInterval(refreshSession, 5_000);
    return () => clearInterval(id);
  }, [authenticated, refreshSession]);

  const feedSignal = useCallback((result: EngineResult, pair: string) => {
    if (result.decision === 'SEM ENTRADA') return;
    void (async () => {
      if (!(await ensureWritable())) return;
      const generation = generationRef.current;
      try {
        const next = await submitDemoSignal(result, pair);
        if (generation === generationRef.current) applyRemoteSession(next);
      } catch (err) {
        if (generation === generationRef.current) markError(err);
      }
    })();
  }, [applyRemoteSession, ensureWritable, markError]);

  const updatePrice = useCallback((price: number, pair: string) => {
    if (!Number.isFinite(price) || price <= 0 || pair.trim().length === 0 || automationEnabled || writeInFlightRef.current) return;
    writeInFlightRef.current = true;
    void (async () => {
      const generation = generationRef.current;
      try {
        if (!(await ensureWritable())) return;
        const next = await submitDemoPrice(price, pair);
        if (generation === generationRef.current) applyRemoteSession(next);
      } catch (err) {
        if (generation === generationRef.current) markError(err);
      } finally {
        if (generation === generationRef.current) writeInFlightRef.current = false;
      }
    })();
  }, [applyRemoteSession, automationEnabled, ensureWritable, markError]);

  const resetSession = useCallback((startingBalance: number) => {
    void (async () => {
      if (!(await ensureWritable())) return;
      const generation = generationRef.current;
      try {
        const next = await resetServerSession(startingBalance);
        if (generation === generationRef.current) applyRemoteSession(next);
      } catch (err) {
        if (generation === generationRef.current) markError(err);
      }
    })();
  }, [applyRemoteSession, ensureWritable, markError]);

  const setConfiguredBalance = useCallback((balance: number) => {
    void (async () => {
      if (!(await ensureWritable())) return;
      const generation = generationRef.current;
      try {
        await persistAccount({ ...sessionRef.current, configuredBalance: balance });
        if (generation === generationRef.current) refreshSession();
      } catch (err) {
        if (generation === generationRef.current) markError(err);
      }
    })();
  }, [ensureWritable, markError, refreshSession]);

  const setAutomationEnabled = useCallback((enabled: boolean, symbol = 'BTCUSDT') => {
    void (async () => {
      if (!(await ensureWritable())) return;
      const generation = generationRef.current;
      try {
        const next = await setDemoAutomation(enabled, symbol);
        if (generation === generationRef.current) {
          setAutomationEnabledState(next.enabled);
          refreshSession();
        }
      } catch (err) {
        if (generation === generationRef.current) markError(err);
      }
    })();
  }, [ensureWritable, markError, refreshSession]);

  return {
    session,
    automationEnabled,
    serverAvailable,
    serverError,
    feedSignal,
    updatePrice,
    resetSession,
    setConfiguredBalance,
    setAutomationEnabled,
    refreshSession,
  };
}
