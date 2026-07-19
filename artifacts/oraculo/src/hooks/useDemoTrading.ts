import { useCallback, useEffect, useRef, useState } from 'react';
import type { EngineResult } from '../lib/analysis';
import { type DemoSession, makeSession, loadSession } from '../lib/demo';
import {
  getAuth,
  getDemoAutomation,
  loadServerSession,
  loginDemoAdmin,
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
  updatePrice: (price: number, pair?: string) => void;
  resetSession: (startingBalance: number) => void;
  setConfiguredBalance: (balance: number) => void;
  setAutomationEnabled: (enabled: boolean, symbol?: string) => void;
  refreshSession: () => void;
}

export function useDemoTrading(): DemoTradingState {
  const [session, setSession] = useState<DemoSession>(() => makeSession());
  const [automationEnabled, setAutomationEnabledState] = useState(false);
  const [serverAvailable, setServerAvailable] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const authenticatedRef = useRef(false);
  const sessionRef = useRef(session);
  const writeInFlightRef = useRef(false);

  useEffect(() => { sessionRef.current = session; }, [session]);

  const applyRemoteSession = useCallback((next: DemoSession) => {
    setSession(next);
    setServerAvailable(true);
    setServerError(null);
  }, []);

  const markError = useCallback((err: unknown) => {
    setServerAvailable(false);
    setServerError(err instanceof Error ? err.message : 'API demo indisponivel.');
  }, []);

  const ensureWritable = useCallback(async (): Promise<boolean> => {
    if (authenticatedRef.current) return true;
    try {
      const authenticated = await getAuth();
      if (authenticated) {
        authenticatedRef.current = true;
        return true;
      }
      const password = window.prompt('Senha administrativa para controlar o modo demo no servidor:');
      if (!password) return false;
      authenticatedRef.current = await loginDemoAdmin(password);
      return authenticatedRef.current;
    } catch (err) {
      markError(err);
      return false;
    }
  }, [markError]);

  const refreshSession = useCallback(() => {
    void loadServerSession()
      .then(applyRemoteSession)
      .catch(markError);
  }, [applyRemoteSession, markError]);

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      try {
        authenticatedRef.current = await getAuth();
        const local = loadSession();
        const hasLocalState = !!local && (
          local.history.length > 0 ||
          local.activeTrade !== null ||
          local.balance !== local.configuredBalance ||
          local.configuredBalance !== 1000
        );

        if (hasLocalState && authenticatedRef.current && local) {
          const migrated = await migrateLocalSession(local);
          if (!cancelled) applyRemoteSession(migrated);
        } else {
          const remote = await loadServerSession();
          if (!cancelled) applyRemoteSession(remote);
        }

        const automation = await getDemoAutomation();
        if (!cancelled) setAutomationEnabledState(automation.enabled);
      } catch (err) {
        if (!cancelled) markError(err);
      }
    }
    void bootstrap();
    return () => { cancelled = true; };
  }, [applyRemoteSession, markError]);

  useEffect(() => {
    const id = setInterval(refreshSession, 5_000);
    return () => clearInterval(id);
  }, [refreshSession]);

  const feedSignal = useCallback((result: EngineResult, pair: string) => {
    if (result.decision === 'SEM ENTRADA') return;
    void (async () => {
      if (!(await ensureWritable())) return;
      try {
        const next = await submitDemoSignal(result, pair);
        applyRemoteSession(next);
      } catch (err) {
        markError(err);
      }
    })();
  }, [applyRemoteSession, ensureWritable, markError]);

  const updatePrice = useCallback((price: number, pair?: string) => {
    if (!Number.isFinite(price) || price <= 0 || writeInFlightRef.current) return;
    writeInFlightRef.current = true;
    void (async () => {
      try {
        if (!(await ensureWritable())) return;
        const next = await submitDemoPrice(price, pair ?? sessionRef.current.activeTrade?.pair);
        applyRemoteSession(next);
      } catch (err) {
        markError(err);
      } finally {
        writeInFlightRef.current = false;
      }
    })();
  }, [applyRemoteSession, ensureWritable, markError]);

  const resetSession = useCallback((startingBalance: number) => {
    void (async () => {
      if (!(await ensureWritable())) return;
      try {
        const next = await resetServerSession(startingBalance);
        applyRemoteSession(next);
      } catch (err) {
        markError(err);
      }
    })();
  }, [applyRemoteSession, ensureWritable, markError]);

  const setConfiguredBalance = useCallback((balance: number) => {
    void (async () => {
      if (!(await ensureWritable())) return;
      try {
        await persistAccount({ ...sessionRef.current, configuredBalance: balance });
        refreshSession();
      } catch (err) {
        markError(err);
      }
    })();
  }, [ensureWritable, markError, refreshSession]);

  const setAutomationEnabled = useCallback((enabled: boolean, symbol = 'BTCUSDT') => {
    void (async () => {
      if (!(await ensureWritable())) return;
      try {
        const next = await setDemoAutomation(enabled, symbol);
        setAutomationEnabledState(next.enabled);
        refreshSession();
      } catch (err) {
        markError(err);
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
