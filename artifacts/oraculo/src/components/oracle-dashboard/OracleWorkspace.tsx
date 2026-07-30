import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  Bot,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  Clock3,
  FileBarChart,
  Gauge,
  LayoutDashboard,
  LogOut,
  Menu,
  RefreshCw,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Target,
  TrendingDown,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react';
import type { OracleVisualState } from '@shared/oracleVisualState';
import type { AuthUser, EngineAuditEntry } from '../../lib/demoApi';
import type { DemoSession, DemoTrade } from '../../lib/demo';
import { fmtDuration } from '../../lib/demo';
import { fetchKlines, type Candle, type Interval } from '../../lib/binance';
import type { RadarSymbol } from '../../lib/marketRadar';
import type { useApiHealth } from '../../hooks/useApiHealth';
import type { useBinanceData } from '../../hooks/useBinanceData';
import type { useDemoAgents } from '../../hooks/useDemoAgents';
import type { useMarketRadar } from '../../hooks/useMarketRadar';
import type { DemoTradingState } from '../../hooks/useDemoTrading';
import { ControlledSimulationPanel } from '../ControlledSimulationPanel';
import { DemoAgentsPanel } from '../DemoAgentsPanel';
import { DemoHistoryPanel } from '../DemoHistoryPanel';
import { DemoStatsPanel } from '../DemoStatsPanel';
import { EngineAuditPanel } from '../EngineAuditPanel';
import { MarketRadarPanel } from '../MarketRadarPanel';
import { NotificationsPanel } from '../NotificationsPanel';
import { ObservabilityPanel } from '../ObservabilityPanel';
import { RobotDiagnosticsPanel } from '../RobotDiagnosticsPanel';
import { OracleCandlestickChart } from './OracleCandlestickChart';
import { OperationJourney } from './OperationJourney';
import { RobotDaySummary } from './RobotDaySummary';
import './oracle-workspace.css';

type DashboardArea = 'dashboard' | 'operations' | 'markets' | 'strategy' | 'reports' | 'alerts' | 'system';
type TableTab = 'positions' | 'orders' | 'history' | 'audit';
type ApiHealthState = ReturnType<typeof useApiHealth>;
type BinanceDataState = ReturnType<typeof useBinanceData>;
type MarketRadarState = ReturnType<typeof useMarketRadar>;
type DemoAgentsState = ReturnType<typeof useDemoAgents>;

interface OracleWorkspaceProps {
  user: AuthUser;
  onLogout: () => void;
  oracleState: OracleVisualState;
  apiHealth: ApiHealthState;
  market: BinanceDataState;
  radar: MarketRadarState;
  demoAgents: DemoAgentsState;
  demoTrading: DemoTradingState;
  openTrades: DemoTrade[];
  pricesByPair: Record<string, number | null>;
  auditEntries: EngineAuditEntry[];
  auditLoading: boolean;
  auditError: string | null;
  selectedPair: RadarSymbol;
  onSelectedPairChange: (pair: RadarSymbol) => void;
  analyzing: boolean;
  canAnalyze: boolean;
  onAnalyze: () => void;
  manualResult: { decision?: string; decisiveReason?: string } | null;
  lastAnalyzeAt: Date | null;
}

interface PairChartState {
  candles: Candle[];
  price: number | null;
  loading: boolean;
  error: string | null;
  updatedAt: Date | null;
}

const PAIRS: RadarSymbol[] = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
const NAV_ITEMS: Array<{ key: DashboardArea; label: string; icon: typeof LayoutDashboard }> = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'operations', label: 'Operações', icon: ClipboardList },
  { key: 'markets', label: 'Mercados', icon: BarChart3 },
  { key: 'strategy', label: 'Estratégia', icon: Target },
  { key: 'reports', label: 'Relatórios', icon: FileBarChart },
  { key: 'alerts', label: 'Alertas', icon: Bell },
  { key: 'system', label: 'Sistema', icon: Settings },
];

function validNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function validPrice(value: number | null | undefined): value is number {
  return validNumber(value) && value > 0;
}

function formatUsd(value: number | null | undefined, signed = false): string {
  if (!validNumber(value)) return '—';
  const formatted = Math.abs(value).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (!signed) return formatted;
  return `${value >= 0 ? '+' : '-'}${formatted}`;
}

function formatPrice(value: number | null | undefined, pair: string): string {
  if (!validNumber(value)) return '—';
  const digits = pair.startsWith('SOL') ? 3 : 2;
  return value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function tradePnl(trade: DemoTrade, price: number | null): number | null {
  if (!validPrice(price)) return null;
  const size = trade.remainingPositionSize ?? trade.positionSize;
  if (!validNumber(size)) return null;
  return trade.direction === 'BUY'
    ? (price - trade.entry) * size
    : (trade.entry - price) * size;
}

function mergeTrades(session: DemoSession, positions: DemoTrade[]): DemoTrade[] {
  const map = new Map<string, DemoTrade>();
  for (const trade of positions) map.set(trade.id, trade);
  if (session.activeTrade) map.set(session.activeTrade.id, session.activeTrade);
  return Array.from(map.values()).sort((a, b) => b.openTime - a.openTime);
}

function oracleLabel(state: OracleVisualState): string {
  if (state === 'buy') return 'Compra ativa';
  if (state === 'sell') return 'Venda ativa';
  if (state === 'analyzing') return 'Analisando';
  return 'Aguardando setup';
}

function decisionTone(value: string | null | undefined): string {
  const normalized = value?.toUpperCase() ?? '';
  if (normalized.includes('BUY') || normalized.includes('COMPRA')) return 'positive';
  if (normalized.includes('SELL') || normalized.includes('VENDA')) return 'negative';
  return 'neutral';
}

function marketCandles(market: BinanceDataState, interval: Interval): Candle[] {
  if (interval === '1h') return market.candles1h;
  if (interval === '15m') return market.candles15m;
  return market.candles5m;
}

function usePairChart(
  pair: RadarSymbol,
  interval: Interval,
  market: BinanceDataState,
  fallbackPrice: number | null,
): PairChartState {
  const [state, setState] = useState<PairChartState>({
    candles: [],
    price: null,
    loading: true,
    error: null,
    updatedAt: null,
  });

  useEffect(() => {
    if (pair === 'BTCUSDT') {
      const candles = marketCandles(market, interval);
      setState({
        candles,
        price: validPrice(market.price) ? market.price : fallbackPrice,
        loading: market.loading && candles.length === 0,
        error: market.error,
        updatedAt: market.lastUpdate,
      });
      return;
    }

    let cancelled = false;
    let controller: AbortController | null = null;

    const refresh = async (): Promise<void> => {
      controller?.abort();
      controller = new AbortController();
      setState((current) => ({ ...current, loading: current.candles.length === 0, error: null }));
      try {
        const candles = await fetchKlines(pair, interval, interval === '1h' ? 180 : 120, controller.signal);
        if (cancelled) return;
        setState({
          candles,
          price: fallbackPrice,
          loading: false,
          error: null,
          updatedAt: new Date(),
        });
      } catch (error) {
        if (cancelled || controller?.signal.aborted) return;
        setState((current) => ({
          ...current,
          loading: false,
          error: error instanceof Error ? error.message : 'Falha ao carregar candles do ativo.',
        }));
      }
    };

    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      controller?.abort();
    };
  }, [fallbackPrice, interval, market.candles15m, market.candles1h, market.candles5m, market.error, market.lastUpdate, market.loading, market.price, pair]);

  return state;
}

function MetricCard({
  label,
  value,
  note,
  tone = 'neutral',
  icon: Icon,
}: {
  label: string;
  value: string;
  note: string;
  tone?: 'neutral' | 'gold' | 'positive' | 'negative' | 'blue';
  icon: typeof Wallet;
}) {
  return (
    <article className={`oracle-metric oracle-tone-${tone}`}>
      <div className="oracle-metric-icon"><Icon size={17} /></div>
      <div className="oracle-metric-copy">
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{note}</small>
      </div>
      <div className="oracle-metric-bars" aria-hidden="true"><i /><i /><i /><i /></div>
    </article>
  );
}

function TradeTable({
  trades,
  prices,
  selectedTradeId,
  onSelect,
}: {
  trades: DemoTrade[];
  prices: Record<string, number | null>;
  selectedTradeId: string | null;
  onSelect: (tradeId: string) => void;
}) {
  if (trades.length === 0) {
    return <div className="oracle-empty-state">Nenhuma posição aberta no momento.</div>;
  }

  return (
    <div className="oracle-table-wrap">
      <table className="oracle-table">
        <thead>
          <tr>
            <th>Ativo</th>
            <th>Direção</th>
            <th>Entrada</th>
            <th>Atual</th>
            <th>Stop</th>
            <th>Alvo 1</th>
            <th>Alvo 2</th>
            <th>PnL</th>
            <th>R/R</th>
            <th>Aberta</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((trade) => {
            const price = prices[trade.pair] ?? null;
            const pnl = tradePnl(trade, price);
            return (
              <tr
                key={trade.id}
                className={trade.id === selectedTradeId ? 'selected' : ''}
                onClick={() => onSelect(trade.id)}
              >
                <td><b>{trade.pair.replace('USDT', '')}</b><span>/USDT</span></td>
                <td className={trade.direction === 'BUY' ? 'positive' : 'negative'}>{trade.direction}</td>
                <td>{formatPrice(trade.entry, trade.pair)}</td>
                <td className="blue">{formatPrice(price, trade.pair)}</td>
                <td className="negative">{formatPrice(trade.stopLoss, trade.pair)}</td>
                <td className="positive">{formatPrice(trade.target1, trade.pair)}</td>
                <td className="positive">{formatPrice(trade.target2, trade.pair)}</td>
                <td className={(pnl ?? 0) >= 0 ? 'positive' : 'negative'}>{formatUsd(pnl, true)}</td>
                <td className="gold">{trade.riskReward?.trim() || '—'}</td>
                <td>{new Date(trade.openTime).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function HistoryTable({
  history,
  selectedTradeId,
  onSelect,
}: {
  history: DemoTrade[];
  selectedTradeId: string | null;
  onSelect: (tradeId: string) => void;
}) {
  if (history.length === 0) return <div className="oracle-empty-state">O histórico ainda está vazio.</div>;
  return (
    <div className="oracle-table-wrap">
      <table className="oracle-table">
        <thead><tr><th>Ativo</th><th>Direção</th><th>Resultado</th><th>PnL</th><th>MFE</th><th>MAE</th><th>Duração</th><th>Encerrada</th></tr></thead>
        <tbody>
          {history.slice(0, 40).map((trade) => (
            <tr
              key={trade.id}
              className={trade.id === selectedTradeId ? 'selected' : ''}
              onClick={() => onSelect(trade.id)}
            >
              <td><b>{trade.pair.replace('USDT', '')}</b><span>/USDT</span></td>
              <td className={trade.direction === 'BUY' ? 'positive' : 'negative'}>{trade.direction}</td>
              <td>{trade.exitReason ?? trade.status}</td>
              <td className={(trade.pnlUSDC ?? 0) >= 0 ? 'positive' : 'negative'}>{formatUsd(trade.pnlUSDC, true)}</td>
              <td className="positive">{formatUsd(trade.mfeUSDC)}</td>
              <td className="negative">{formatUsd(trade.maeUSDC)}</td>
              <td>{trade.closeTime ? fmtDuration(trade.closeTime - trade.openTime) : '—'}</td>
              <td>{trade.closeTime ? new Date(trade.closeTime).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AuditTable({ entries, loading, error }: { entries: EngineAuditEntry[]; loading: boolean; error: string | null }) {
  if (loading) return <div className="oracle-empty-state">Carregando auditoria...</div>;
  if (error) return <div className="oracle-empty-state error">{error}</div>;
  if (entries.length === 0) return <div className="oracle-empty-state">Sem decisões recentes.</div>;
  return (
    <div className="oracle-table-wrap">
      <table className="oracle-table">
        <thead><tr><th>Ativo</th><th>Decisão</th><th>Estado</th><th>Score</th><th>Motivo decisivo</th><th>Horário</th></tr></thead>
        <tbody>
          {entries.slice(0, 20).map((entry) => (
            <tr key={entry.id}>
              <td><b>{entry.symbol}</b></td>
              <td className={decisionTone(entry.decision)}>{entry.decision}</td>
              <td>{entry.decisionState}</td>
              <td className="gold">{entry.score}</td>
              <td>{entry.decisiveReason || '—'}</td>
              <td>{new Date(entry.analyzedAt).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function OracleWorkspace({
  user,
  onLogout,
  oracleState,
  apiHealth,
  market,
  radar,
  demoAgents,
  demoTrading,
  openTrades: serverOpenTrades,
  pricesByPair,
  auditEntries,
  auditLoading,
  auditError,
  selectedPair,
  onSelectedPairChange,
  analyzing,
  canAnalyze,
  onAnalyze,
  manualResult,
  lastAnalyzeAt,
}: OracleWorkspaceProps) {
  const [area, setArea] = useState<DashboardArea>('dashboard');
  const [tableTab, setTableTab] = useState<TableTab>('positions');
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(null);
  const [interval, setInterval] = useState<Interval>('5m');
  const [menuOpen, setMenuOpen] = useState(false);

  const openTrades = useMemo(
    () => mergeTrades(demoTrading.session, serverOpenTrades),
    [demoTrading.session, serverOpenTrades],
  );

  const knownTrades = useMemo(() => {
    const map = new Map<string, DemoTrade>();
    for (const trade of demoTrading.session.history) map.set(trade.id, trade);
    for (const trade of openTrades) map.set(trade.id, trade);
    return Array.from(map.values()).sort((a, b) => b.openTime - a.openTime);
  }, [demoTrading.session.history, openTrades]);

  const selectedTrade = useMemo(
    () => knownTrades.find((trade) => trade.id === selectedTradeId) ?? null,
    [knownTrades, selectedTradeId],
  );

  useEffect(() => {
    if (selectedTradeId && knownTrades.some((trade) => trade.id === selectedTradeId)) return;
    setSelectedTradeId(openTrades[0]?.id ?? null);
  }, [knownTrades, openTrades, selectedTradeId]);

  const chartPair = (selectedTrade?.pair as RadarSymbol | undefined) ?? selectedPair;
  const pairPrice = pricesByPair[chartPair] ?? null;
  const pairChart = usePairChart(chartPair, interval, market, pairPrice);
  const chartPrice = validPrice(pairPrice) ? pairPrice : pairChart.price;
  const session = demoTrading.session;
  const totalTrades = session.dailyStats.totalTrades;
  const winRate = totalTrades > 0 ? (session.dailyStats.wins / totalTrades) * 100 : null;
  const openCount = session.openPositionsCount ?? openTrades.length;
  const workerDecision = apiHealth.health?.worker?.lastDecision ?? manualResult?.decision ?? 'AGUARDAR';
  const marketRegime = radar.analysis?.trend1h ?? 'NEUTRO';
  const agentList = Object.values(demoAgents.agents) as Array<{ symbol?: string; lastDecision?: string; status?: string }>;
  const safeLimited = session.safetyLimit?.limited ?? false;
  const unreadAlerts = apiHealth.health?.notifications?.unread ?? 0;

  const navigate = (next: DashboardArea): void => {
    setArea(next);
    setMenuOpen(false);
  };

  const selectPair = (pair: RadarSymbol): void => {
    setSelectedTradeId(null);
    onSelectedPairChange(pair);
  };

  const renderTableContent = () => {
    if (tableTab === 'positions') {
      return <TradeTable trades={openTrades} prices={pricesByPair} selectedTradeId={selectedTrade?.id ?? null} onSelect={setSelectedTradeId} />;
    }
    if (tableTab === 'history') {
      return (
        <HistoryTable
          history={session.history}
          selectedTradeId={selectedTrade?.id ?? null}
          onSelect={setSelectedTradeId}
        />
      );
    }
    if (tableTab === 'audit') return <AuditTable entries={auditEntries} loading={auditLoading} error={auditError} />;
    return <div className="oracle-empty-state">Sem ordens pendentes no ambiente DEMO.</div>;
  };

  return (
    <div className="oracle-shell">
      <div className={`oracle-ambient-guardian ${oracleState}`} aria-hidden="true">
        <img src={`${import.meta.env.BASE_URL}brand/oraculo-guardian.png`} alt="" />
        <i className="oracle-ambient-core" />
        <i className="oracle-ambient-scan" />
      </div>
      {menuOpen && <button type="button" className="oracle-sidebar-backdrop" aria-label="Fechar menu" onClick={() => setMenuOpen(false)} />}
      <aside className={`oracle-sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="oracle-brand">
          <img className="oracle-brand-mark" src={`${import.meta.env.BASE_URL}brand/oraculo-mark.svg`} alt="Símbolo do Oráculo" />
          <div><strong>ORÁCULO</strong><span>TRADER</span></div>
          <button type="button" className="oracle-sidebar-close" onClick={() => setMenuOpen(false)} aria-label="Fechar menu"><X size={18} /></button>
        </div>

        <div className="oracle-guardian">
          <img src={`${import.meta.env.BASE_URL}brand/oraculo-guardian.png`} alt="Guardião do Oráculo" />
          <div><span className="oracle-status-dot" /> Sistema operacional</div>
        </div>

        <nav className="oracle-nav" aria-label="Navegação principal">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.key} type="button" className={area === item.key ? 'active' : ''} onClick={() => navigate(item.key)}>
                <Icon size={17} />
                <span>{item.label}</span>
                <ChevronRight size={14} />
              </button>
            );
          })}
        </nav>

        <div className="oracle-sidebar-footer">
          <div><span>{user.role === 'admin' ? 'Administrador' : 'Operador'}</span><strong>{user.username}</strong></div>
          <button type="button" onClick={onLogout}><LogOut size={16} /> Sair</button>
        </div>
      </aside>

      <div className="oracle-page">
        <header className="oracle-topbar">
          <div className="oracle-topbar-left">
            <button type="button" className="oracle-mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Abrir menu"><Menu size={20} /></button>
            <div className="oracle-pair-switcher">
              {PAIRS.map((pair) => (
                <button key={pair} type="button" className={chartPair === pair ? 'active' : ''} onClick={() => selectPair(pair)}>
                  <b>{pair.replace('USDT', '')}</b><span>/USDT</span>
                </button>
              ))}
            </div>
            <div className="oracle-top-price">
              <span>Preço atual</span>
              <strong>{formatPrice(pricesByPair[selectedPair] ?? market.price, selectedPair)}</strong>
            </div>
          </div>
          <div className="oracle-topbar-status">
            <div className={apiHealth.error ? 'negative' : 'positive'}><span /> API {apiHealth.error ? 'DEGRADADA' : 'ONLINE'}</div>
            <div className={`oracle-state ${oracleState}`}><Bot size={15} /> {oracleLabel(oracleState)}</div>
            <button type="button" className="oracle-refresh-button" onClick={() => { void market.refresh(); void radar.refresh(); demoTrading.refreshSession(); }}><RefreshCw size={15} /></button>
          </div>
        </header>

        <main className="oracle-content">
          {area === 'dashboard' && (
            <div className="oracle-dashboard-view">
              <section className="oracle-metrics-grid">
                <MetricCard label="Banca total" value={formatUsd(session.balance)} note="Saldo DEMO disponível" tone="gold" icon={Wallet} />
                <MetricCard label="PnL do dia" value={formatUsd(session.dailyStats.dailyPnL, true)} note="Resultado realizado" tone={(session.dailyStats.dailyPnL ?? 0) >= 0 ? 'positive' : 'negative'} icon={(session.dailyStats.dailyPnL ?? 0) >= 0 ? TrendingUp : TrendingDown} />
                <MetricCard label="Win rate" value={winRate === null ? '—' : `${winRate.toFixed(1)}%`} note={`${session.dailyStats.wins} ganhos em ${totalTrades} trades`} tone="blue" icon={Gauge} />
                <MetricCard label="Operações abertas" value={String(openCount)} note="Posições monitoradas" tone={openCount > 0 ? 'blue' : 'neutral'} icon={Activity} />
                <MetricCard label="Regime do mercado" value={marketRegime} note={`${radar.symbol} · 1H`} tone="positive" icon={BarChart3} />
                <MetricCard label="Motor ativo" value="Adaptive V1" note={`Decisão: ${workerDecision}`} tone="gold" icon={ShieldCheck} />
              </section>

              <RobotDaySummary
                session={session}
                openTrades={openTrades}
                auditEntries={auditEntries}
                workerLastCycleAt={apiHealth.health?.worker?.lastCycleAt}
              />

              <section className="oracle-trading-grid">
                <OracleCandlestickChart
                  candles={pairChart.candles}
                  pair={chartPair}
                  interval={interval}
                  loading={pairChart.loading}
                  error={pairChart.error}
                  currentPrice={chartPrice}
                  trade={selectedTrade}
                  history={session.history}
                  onIntervalChange={setInterval}
                />

                <aside className="oracle-right-column">
                  <article className="oracle-side-card oracle-state-card">
                    <div className="oracle-side-card-title"><span>Status do Oráculo</span><Bot size={18} /></div>
                    <strong className={oracleState}>{oracleLabel(oracleState)}</strong>
                    <dl>
                      <div><dt>Decisão atual</dt><dd className={decisionTone(workerDecision)}>{workerDecision}</dd></div>
                      <div><dt>Score</dt><dd>{apiHealth.health?.worker?.lastScore ?? '—'}</dd></div>
                      <div><dt>Próximo ciclo</dt><dd>{apiHealth.health?.worker?.nextCycleAt ? new Date(apiHealth.health.worker.nextCycleAt).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}</dd></div>
                      <div><dt>Latência</dt><dd>{apiHealth.health?.worker?.lastLatencyMs ?? apiHealth.health?.binance.latencyMs ?? '—'} ms</dd></div>
                    </dl>
                  </article>

                  <article className="oracle-side-card">
                    <div className="oracle-side-card-title"><span>Watchlist</span><Activity size={17} /></div>
                    <div className="oracle-watchlist">
                      {PAIRS.map((pair) => {
                        const agent = agentList.find((item) => item.symbol === pair);
                        const decision = agent?.lastDecision ?? (radar.analysis?.symbol === pair ? radar.analysis.suggestedDirection : 'MONITORANDO');
                        return (
                          <button key={pair} type="button" onClick={() => selectPair(pair)} className={chartPair === pair ? 'active' : ''}>
                            <span><b>{pair.replace('USDT', '')}</b><small>/USDT</small></span>
                            <span className="watch-price">{formatPrice(pricesByPair[pair], pair)}</span>
                            <em className={decisionTone(decision)}>{decision}</em>
                          </button>
                        );
                      })}
                    </div>
                  </article>

                  <article className="oracle-side-card">
                    <div className="oracle-side-card-title"><span>Alertas</span><Bell size={17} /></div>
                    <div className="oracle-alert-list">
                      {demoTrading.serverError && <div className="negative"><AlertTriangle size={15} /><span>{demoTrading.serverError}</span></div>}
                      {apiHealth.error && <div className="negative"><AlertTriangle size={15} /><span>{apiHealth.error}</span></div>}
                      {safeLimited && <div className="gold"><ShieldCheck size={15} /><span>{session.safetyLimit?.reason}</span></div>}
                      {!demoTrading.serverError && !apiHealth.error && !safeLimited && <div className="positive"><ShieldCheck size={15} /><span>Sem falhas críticas.</span></div>}
                    </div>
                    <button type="button" className="oracle-card-link" onClick={() => navigate('alerts')}>Abrir central · {unreadAlerts} não lidos</button>
                  </article>

                  <article className="oracle-side-card oracle-quick-actions">
                    <div className="oracle-side-card-title"><span>Ações rápidas</span><SlidersHorizontal size={17} /></div>
                    <button type="button" disabled={!canAnalyze || analyzing} onClick={onAnalyze}>{analyzing ? 'Analisando...' : 'Analisar agora'}</button>
                    <button type="button" className={demoTrading.automationEnabled ? 'active' : ''} onClick={() => demoTrading.setAutomationEnabled(!demoTrading.automationEnabled, selectedPair)}>
                      Automação {demoTrading.automationEnabled ? 'ativa' : 'inativa'}
                    </button>
                    {lastAnalyzeAt && <small>Última análise: {lastAnalyzeAt.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</small>}
                  </article>
                </aside>
              </section>

              <section className="oracle-bottom-panel">
                <div className="oracle-tabs">
                  {([
                    ['positions', 'Posições abertas'],
                    ['orders', 'Ordens'],
                    ['history', 'Histórico'],
                    ['audit', 'Auditoria'],
                  ] as Array<[TableTab, string]>).map(([key, label]) => (
                    <button key={key} type="button" className={tableTab === key ? 'active' : ''} onClick={() => setTableTab(key)}>{label}</button>
                  ))}
                </div>
                <div className="oracle-tab-content">{renderTableContent()}</div>
              </section>
            </div>
          )}

          {area === 'operations' && (
            <section className="oracle-section-stack">
              <div className="oracle-section-heading"><div><span className="oracle-eyebrow">Operações</span><h1>O que está acontecendo com cada operação</h1></div><div className="oracle-heading-stat"><span>Risco aberto</span><strong>{formatUsd(session.openRiskUSDC)}</strong></div></div>
              <OperationJourney trade={selectedTrade} currentPrice={chartPrice} openCount={openTrades.length} />
              <OracleCandlestickChart candles={pairChart.candles} pair={chartPair} interval={interval} loading={pairChart.loading} error={pairChart.error} currentPrice={chartPrice} trade={selectedTrade} history={session.history} onIntervalChange={setInterval} />
              <TradeTable trades={openTrades} prices={pricesByPair} selectedTradeId={selectedTrade?.id ?? null} onSelect={setSelectedTradeId} />
              <HistoryTable history={session.history} selectedTradeId={selectedTrade?.id ?? null} onSelect={setSelectedTradeId} />
            </section>
          )}

          {area === 'markets' && (
            <section className="oracle-section-stack">
              <div className="oracle-section-heading"><div><span className="oracle-eyebrow">Mercados</span><h1>Radar e agentes por ativo</h1></div></div>
              <MarketRadarPanel analysis={radar.analysis} loading={radar.loading} error={radar.error} lastUpdate={radar.lastUpdate} symbol={radar.symbol} onSymbolChange={radar.setSymbol} />
              <DemoAgentsPanel agents={demoAgents.agents} configs={demoAgents.configs} portfolio={demoAgents.portfolio} globalRisk={demoAgents.globalRisk} selectedSymbol={radar.symbol} onSelectSymbol={radar.setSymbol} />
            </section>
          )}

          {area === 'strategy' && (
            <section className="oracle-section-stack">
              <div className="oracle-section-heading"><div><span className="oracle-eyebrow">Estratégia</span><h1>Leitura operacional do Adaptive V1</h1></div></div>
              <div className="oracle-strategy-grid">
                <article><ShieldCheck /><span>Motor</span><strong>{apiHealth.health?.worker?.engineVersion ?? 'Adaptive V1'}</strong><p>Execução sistemática em ambiente DEMO, independente desta interface.</p></article>
                <article><Target /><span>Direção</span><strong className={decisionTone(workerDecision)}>{workerDecision}</strong><p>{manualResult?.decisiveReason ?? radar.analysis?.decisiveReason ?? 'Aguardando confirmação completa do setup.'}</p></article>
                <article><CircleDollarSign /><span>Risco global</span><strong>{formatUsd(session.openRiskUSDC)}</strong><p>{safeLimited ? session.safetyLimit?.reason : 'Gestão operacional disponível e monitorada.'}</p></article>
                <article><Clock3 /><span>Último ciclo</span><strong>{apiHealth.health?.worker?.lastCycleAt ? new Date(apiHealth.health.worker.lastCycleAt).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}</strong><p>{apiHealth.health?.worker?.lastStatus ?? 'Sem diagnóstico recente.'}</p></article>
              </div>
              <AuditTable entries={auditEntries} loading={auditLoading} error={auditError} />
            </section>
          )}

          {area === 'reports' && (
            <section className="oracle-section-stack">
              <div className="oracle-section-heading"><div><span className="oracle-eyebrow">Relatórios</span><h1>Desempenho e histórico consolidado</h1></div><button type="button" className="oracle-primary-button" onClick={() => { window.location.href = '/relatorio-operacoes'; }}>Relatório completo</button></div>
              <DemoStatsPanel
                stats={session.dailyStats}
                currentBalance={session.balance}
                configuredBalance={session.configuredBalance}
                realizedPnl={session.realizedPnlUSDC ?? 0}
                unrealizedPnl={session.unrealizedPnlUSDC ?? 0}
                partialPnl={session.partialPnlUSDC ?? 0}
                openRisk={session.openRiskUSDC ?? 0}
                maxDailyTrades={session.settings?.maxDailyTrades ?? 0}
                onReset={() => demoTrading.resetSession(session.configuredBalance)}
                onBalanceChange={(balance: number) => { demoTrading.setConfiguredBalance(balance); demoTrading.resetSession(balance); }}
              />
              <DemoHistoryPanel history={session.history} />
            </section>
          )}

          {area === 'alerts' && (
            <section className="oracle-section-stack">
              <div className="oracle-section-heading"><div><span className="oracle-eyebrow">Alertas</span><h1>Central de notificações</h1></div><div className="oracle-heading-stat"><span>Não lidos</span><strong>{unreadAlerts}</strong></div></div>
              <NotificationsPanel />
            </section>
          )}

          {area === 'system' && (
            <section className="oracle-section-stack">
              <div className="oracle-section-heading"><div><span className="oracle-eyebrow">Sistema</span><h1>Controles e diagnóstico</h1></div></div>
              <div className="oracle-system-control">
                <div><span>Modo DEMO automático 24h</span><strong>{demoTrading.automationEnabled ? 'ATIVO' : 'INATIVO'}</strong><p>{demoTrading.serverError ?? 'Worker e sessão monitorados pela API oficial.'}</p></div>
                <button type="button" className={demoTrading.automationEnabled ? 'active' : ''} onClick={() => demoTrading.setAutomationEnabled(!demoTrading.automationEnabled, selectedPair)}>{demoTrading.automationEnabled ? 'Desativar' : 'Ativar'}</button>
              </div>
              <RobotDiagnosticsPanel user={user} />
              {user.role === 'admin' && <ControlledSimulationPanel />}
              {user.role === 'admin' && <ObservabilityPanel publicHealth={apiHealth.health} publicError={apiHealth.error} />}
              {user.role === 'admin' && <EngineAuditPanel />}
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
