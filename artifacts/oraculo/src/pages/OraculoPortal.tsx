import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { resolveOracleVisualState } from '@shared/oracleVisualState';
import { PremiumLanding } from '../components/PremiumLanding';
import { DashboardErrorBoundary } from '../components/oracle-dashboard/DashboardErrorBoundary';
import { OracleWorkspace } from '../components/oracle-dashboard/OracleWorkspace';
import { useApiHealth } from '../hooks/useApiHealth';
import { useBinanceData } from '../hooks/useBinanceData';
import { useDemoAgents } from '../hooks/useDemoAgents';
import { useDemoTrading } from '../hooks/useDemoTrading';
import { useMarketRadar } from '../hooks/useMarketRadar';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useOracleGlobalState } from '../hooks/useOracleGlobalState';
import { runEngine } from '../lib/analysis';
import { fetchKlines, fetchPrice } from '../lib/binance';
import {
  fetchEngineAuditLog,
  getAuth,
  loadOpenDemoPositions,
  loginUser,
  logoutUser,
  type AuthUser,
  type EngineAuditEntry,
} from '../lib/demoApi';
import type { DemoTrade } from '../lib/demo';
import type { RadarSymbol } from '../lib/marketRadar';
import '../components/oracle-dashboard/oracle-workspace.css';

const PAIRS: RadarSymbol[] = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];

interface ManualResultSummary {
  decision: string;
  decisiveReason: string;
}

function OfflineScreen() {
  return (
    <main className="oracle-fallback">
      <section className="oracle-fallback-card">
        <img src={`${import.meta.env.BASE_URL}brand/oraculo-mark.svg`} alt="Oráculo" />
        <p className="oracle-eyebrow">Conexão interrompida</p>
        <h1>O Oráculo está sem acesso ao servidor.</h1>
        <p>Reconecte para carregar sessão, posições, histórico e dados oficiais.</p>
        <button type="button" onClick={() => window.location.reload()}><RefreshCw size={16} /> Tentar novamente</button>
      </section>
    </main>
  );
}

export default function OraculoPortal() {
  const online = useOnlineStatus();
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [openTrades, setOpenTrades] = useState<DemoTrade[]>([]);
  const [pricesByPair, setPricesByPair] = useState<Record<string, number | null>>({});
  const [auditEntries, setAuditEntries] = useState<EngineAuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [manualResult, setManualResult] = useState<ManualResultSummary | null>(null);
  const [lastAnalyzeAt, setLastAnalyzeAt] = useState<Date | null>(null);

  const authenticated = authUser !== null;
  const market = useBinanceData(authenticated);
  const apiHealth = useApiHealth(authenticated);
  const radar = useMarketRadar(authenticated);
  const demoAgents = useDemoAgents(radar.analysis);
  const demoTrading = useDemoTrading(authenticated);
  const publicOracle = useOracleGlobalState(!authenticated);

  useEffect(() => {
    let cancelled = false;
    void getAuth()
      .then((auth) => {
        if (cancelled) return;
        setAuthUser(auth.authenticated ? auth.user ?? null : null);
        setAuthError(null);
      })
      .catch((error) => {
        if (cancelled) return;
        setAuthUser(null);
        setAuthError(error instanceof Error ? error.message : 'Falha ao verificar sessão.');
      })
      .finally(() => {
        if (!cancelled) setAuthLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const handleLogin = useCallback((username: string, password: string): void => {
    setAuthLoading(true);
    setAuthError(null);
    void loginUser(username, password)
      .then((auth) => {
        setAuthUser(auth.authenticated ? auth.user ?? null : null);
        if (!auth.authenticated) setAuthError('Credenciais inválidas.');
      })
      .catch((error) => {
        setAuthUser(null);
        setAuthError(error instanceof Error ? error.message : 'Credenciais inválidas.');
      })
      .finally(() => setAuthLoading(false));
  }, []);

  const handleLogout = useCallback((): void => {
    setAuthLoading(true);
    setAuthUser(null);
    setOpenTrades([]);
    setPricesByPair({});
    setAuditEntries([]);
    setManualResult(null);
    void logoutUser()
      .catch(() => undefined)
      .finally(() => setAuthLoading(false));
  }, []);

  useEffect(() => {
    if (!authenticated) {
      setOpenTrades([]);
      return;
    }
    let cancelled = false;
    const refresh = async (): Promise<void> => {
      try {
        const positions = await loadOpenDemoPositions();
        if (!cancelled) setOpenTrades(positions.sort((a, b) => b.openTime - a.openTime));
      } catch {
        if (!cancelled) setOpenTrades([]);
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [authenticated]);

  useEffect(() => {
    if (!authenticated) {
      setPricesByPair({});
      return;
    }
    let cancelled = false;
    let controller: AbortController | null = null;
    const refresh = async (): Promise<void> => {
      controller?.abort();
      controller = new AbortController();
      const entries = await Promise.all(PAIRS.map(async (pair) => {
        try {
          const price = await fetchPrice(pair, controller?.signal);
          return [pair, Number.isFinite(price) && price > 0 ? price : null] as const;
        } catch {
          return [pair, null] as const;
        }
      }));
      if (!cancelled) setPricesByPair(Object.fromEntries(entries));
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      controller?.abort();
    };
  }, [authenticated]);

  useEffect(() => {
    if (!authenticated) {
      setAuditEntries([]);
      setAuditError(null);
      setAuditLoading(false);
      return;
    }
    let cancelled = false;
    const refresh = async (): Promise<void> => {
      setAuditLoading(true);
      setAuditError(null);
      try {
        const response = await fetchEngineAuditLog({ limit: 20 });
        if (!cancelled) setAuditEntries(response.entries);
      } catch (error) {
        if (!cancelled) setAuditError(error instanceof Error ? error.message : 'Falha ao carregar auditoria.');
      } finally {
        if (!cancelled) setAuditLoading(false);
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [authenticated]);

  const activeTradePair = demoTrading.session.activeTrade?.pair ?? null;
  const activeTradePrice = activeTradePair ? pricesByPair[activeTradePair] ?? null : null;

  useEffect(() => {
    if (!authenticated || demoTrading.automationEnabled || !activeTradePair || activeTradePrice === null) return;
    demoTrading.updatePrice(activeTradePrice, activeTradePair);
  }, [activeTradePair, activeTradePrice, authenticated, demoTrading.automationEnabled, demoTrading.updatePrice]);

  const oracleState = useMemo(
    () => resolveOracleVisualState({
      authenticated,
      apiError: apiHealth.error || demoTrading.serverError,
      activeTrade: demoTrading.session.activeTrade,
      worker: apiHealth.health?.worker,
    }),
    [apiHealth.error, apiHealth.health?.worker, authenticated, demoTrading.serverError, demoTrading.session.activeTrade],
  );

  const handleAnalyze = useCallback((): void => {
    if (!authenticated || analyzing) return;
    const pair = radar.symbol;
    setAnalyzing(true);
    setManualResult(null);
    const controller = new AbortController();
    void Promise.all([
      fetchPrice(pair, controller.signal),
      fetchKlines(pair, '1h', 220, controller.signal),
      fetchKlines(pair, '15m', 100, controller.signal),
      fetchKlines(pair, '5m', 80, controller.signal),
    ])
      .then(([price, candles1h, candles15m, candles5m]) => {
        const result = runEngine(candles1h, candles15m, candles5m, price);
        const decisive = result.steps.find((step) => step.status === 'FAIL')
          ?? result.steps.find((step) => step.status === 'PASS')
          ?? result.steps[0];
        setManualResult({
          decision: result.decision,
          decisiveReason: decisive?.reason ?? 'Análise concluída.',
        });
        setLastAnalyzeAt(new Date());
      })
      .catch((error) => {
        setManualResult({
          decision: 'ERRO',
          decisiveReason: error instanceof Error ? error.message : 'Falha ao analisar o mercado.',
        });
      })
      .finally(() => setAnalyzing(false));
  }, [analyzing, authenticated, radar.symbol]);

  if (!online) return <OfflineScreen />;

  if (!authUser) {
    return (
      <PremiumLanding
        loading={authLoading}
        error={authError}
        onLogin={handleLogin}
        state={publicOracle.state}
      />
    );
  }

  return (
    <DashboardErrorBoundary>
      <OracleWorkspace
        user={authUser}
        onLogout={handleLogout}
        oracleState={oracleState}
        apiHealth={apiHealth}
        market={market}
        radar={radar}
        demoAgents={demoAgents}
        demoTrading={demoTrading}
        openTrades={openTrades}
        pricesByPair={pricesByPair}
        auditEntries={auditEntries}
        auditLoading={auditLoading}
        auditError={auditError}
        selectedPair={radar.symbol}
        onSelectedPairChange={radar.setSymbol}
        analyzing={analyzing}
        canAnalyze={authenticated && !analyzing}
        onAnalyze={handleAnalyze}
        manualResult={manualResult}
        lastAnalyzeAt={lastAnalyzeAt}
      />
    </DashboardErrorBoundary>
  );
}
