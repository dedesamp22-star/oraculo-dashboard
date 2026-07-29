import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertTriangle, BarChart2, Bell, Bot, CheckCircle2, Clock, Crosshair,
  Database, FileText, History, LineChart as LineChartIcon, LogOut, RefreshCw,
  Settings, Shield, Target, TrendingDown, TrendingUp, Zap,
} from 'lucide-react';
import {
  CartesianGrid, Line, LineChart, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import type { AuthUser, EngineAuditEntry } from '../lib/demoApi';
import { fetchKlines, type Candle } from '../lib/binance';
import type { DemoSession, DemoTrade } from '../lib/demo';
import { fmtDuration } from '../lib/demo';
import type { TVInterval } from './TradingViewChart';
import { DemoAgentsPanel } from './DemoAgentsPanel';
import { DemoHistoryPanel } from './DemoHistoryPanel';
import { DemoStatsPanel } from './DemoStatsPanel';
import { EngineAuditPanel } from './EngineAuditPanel';
import { MarketRadarPanel } from './MarketRadarPanel';
import { NotificationsPanel } from './NotificationsPanel';
import { ObservabilityPanel } from './ObservabilityPanel';
import { RobotDiagnosticsPanel } from './RobotDiagnosticsPanel';
import { ControlledSimulationPanel } from './ControlledSimulationPanel';
import type { OracleVisualState } from '@shared/oracleVisualState';

type DashboardArea = 'dashboard' | 'operations' | 'markets' | 'strategies' | 'reports' | 'alerts' | 'settings';
type Trade = NonNullable<DemoSession['activeTrade']>;

interface AuthenticatedTradingDashboardProps {
  user: AuthUser;
  onLogout: () => void;
  oracleVisualState: OracleVisualState;
  selectedPair: string;
  onSelectedPairChange: (pair: string) => void;
  tvInterval: TVInterval;
  onTvIntervalChange: (interval: TVInterval) => void;
  market: {
    price: number | null;
    candles5m: Candle[];
    lastUpdate: Date | null;
    error: string | null;
    loading: boolean;
    refresh: () => Promise<void>;
  };
  apiHealth: {
    loading: boolean;
    error: string | null;
    health?: {
      binance?: { ok: boolean; latencyMs?: number | null; error?: string | null };
      worker?: unknown;
    } | null;
  };
  radar: any;
  demoSession: DemoSession;
  demoEnabled: boolean;
  demoServerError: string | null;
  safeLimited: boolean;
  safeReason?: string;
  maxDailyTrades: number;
  demoAutoState: { countdown: string; lastAnalysisTime: Date | null };
  demoAgents: any;
  mobileOpenTrades: Trade[];
  mobilePricesByPair: Record<string, number | null>;
  mobileAuditEntries: EngineAuditEntry[];
  mobileAuditLoading: boolean;
  mobileAuditError: string | null;
  activeTradeCurrentPrice: number | null;
  canAnalyze: boolean;
  analyzing: boolean;
  result: any;
  resultTime: Date | null;
  onAnalyze: () => void;
  onAutomationChange: (enabled: boolean, symbol: string) => void;
  onResetSession: (startingBalance: number) => void;
  onConfiguredBalanceChange: (balance: number) => void;
}

const AREAS: Array<{ key: DashboardArea; label: string; icon: React.ReactNode }> = [
  { key: 'dashboard', label: 'Dashboard', icon: <BarChart2 className="h-4 w-4" /> },
  { key: 'operations', label: 'Operacoes', icon: <Activity className="h-4 w-4" /> },
  { key: 'markets', label: 'Mercados', icon: <LineChartIcon className="h-4 w-4" /> },
  { key: 'strategies', label: 'Estrategias', icon: <Crosshair className="h-4 w-4" /> },
  { key: 'reports', label: 'Relatorios', icon: <FileText className="h-4 w-4" /> },
  { key: 'alerts', label: 'Alertas', icon: <Bell className="h-4 w-4" /> },
  { key: 'settings', label: 'Configuracoes', icon: <Settings className="h-4 w-4" /> },
];

function fmtCurrency(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--';
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}

function fmtSignedCurrency(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--';
  const abs = fmtCurrency(Math.abs(value));
  return `${value >= 0 ? '+' : '-'}${abs}`;
}

function signedColor(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value === 0) return 'text-zinc-200';
  return value > 0 ? 'text-[#00ff88]' : 'text-[#ff4d4d]';
}

function isValidPrice(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function tradeCurrentPrice(
  trade: DemoTrade,
  prices: Record<string, number | null>,
  activePrice: number | null,
  activeTrade: DemoTrade | null,
): number | null {
  const pairPrice = prices[trade.pair];
  if (isValidPrice(pairPrice)) return pairPrice;

  const sameActiveTrade = activeTrade?.id === trade.id && activeTrade.pair === trade.pair;
  if (sameActiveTrade && isValidPrice(activePrice)) return activePrice;

  return null;
}

function tradePnl(trade: DemoTrade, price: number | null): number | null {
  if (typeof price !== 'number' || !Number.isFinite(price)) return null;
  const size = trade.remainingPositionSize ?? trade.positionSize;
  return trade.direction === 'BUY'
    ? (price - trade.entry) * size
    : (trade.entry - price) * size;
}

function rrLabel(trade: DemoTrade): string {
  if (typeof trade.riskReward === 'string' && trade.riskReward.trim().length > 0) {
    return trade.riskReward;
  }

  const entry = trade.entry;
  const stop = trade.stopLossOriginal ?? trade.stopLoss;
  const target = trade.target2;
  if (!isValidPrice(entry) || !isValidPrice(stop) || !isValidPrice(target)) return '--';

  const risk = Math.abs(entry - stop);
  const reward = Math.abs(target - entry);
  if (risk <= 0 || reward <= 0 || !Number.isFinite(risk) || !Number.isFinite(reward)) return '--';

  return `1:${(reward / risk).toFixed(2)}`;
}

function selectedTradeFrom(openTrades: Trade[], session: DemoSession, selectedId: string | null): Trade | null {
  if (selectedId) {
    const selected = openTrades.find((trade) => trade.id === selectedId);
    if (selected) return selected;
  }
  return openTrades[0] ?? session.activeTrade ?? null;
}

function makeChartData(candles: Candle[]) {
  return candles.slice(-90).map((candle) => ({
    name: new Date(candle.closeTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    price: candle.close,
    rawTime: candle.closeTime,
  }));
}

type ChartPoint = ReturnType<typeof makeChartData>[number];

function nearestPointByTime(data: ChartPoint[], timestamp: number): ChartPoint | null {
  if (data.length === 0 || !Number.isFinite(timestamp)) return null;
  return data.reduce((nearest, point) => (
    Math.abs(point.rawTime - timestamp) < Math.abs(nearest.rawTime - timestamp) ? point : nearest
  ));
}

function MiniMetric({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'gold' | 'green' | 'red' | 'blue' }) {
  const toneClass = {
    neutral: 'text-zinc-100',
    gold: 'text-[#d4af37]',
    green: 'text-[#00ff88]',
    red: 'text-[#ff4d4d]',
    blue: 'text-[#4fc3ff]',
  }[tone];
  return (
    <div className="min-w-0 border border-[#2a2419] bg-[#0f1011]/90 px-4 py-3">
      <p className="truncate text-[10px] uppercase tracking-[0.18em] text-zinc-500">{label}</p>
      <p className={`mt-1 truncate font-mono text-lg font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

function OracleMark() {
  return (
    <div className="relative flex h-11 w-11 items-center justify-center rounded-full border border-[#d4af37]/60 bg-[#d4af37]/10 shadow-[0_0_28px_rgba(212,175,55,0.18)]">
      <div className="h-7 w-[2px] bg-[#d4af37]" />
      <div className="absolute h-5 w-5 rounded-full border-2 border-[#d4af37]" />
      <div className="absolute bottom-1 h-3 w-[2px] bg-[#d4af37]" />
    </div>
  );
}

function Sidebar({ area, setArea, user, onLogout }: { area: DashboardArea; setArea: (area: DashboardArea) => void; user: AuthUser; onLogout: () => void }) {
  return (
    <aside className="flex min-h-screen w-full flex-col border-r border-[#2a2419] bg-[#070707] lg:w-72">
      <div className="border-b border-[#2a2419] px-5 py-5">
        <div className="flex items-center gap-3">
          <OracleMark />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold uppercase tracking-[0.22em] text-[#f4f4f5]">Oraculo</p>
            <p className="truncate text-[10px] uppercase tracking-[0.22em] text-[#d4af37]">Trade AI</p>
          </div>
        </div>
      </div>
      <div className="relative mx-5 my-5 h-36 overflow-hidden border border-[#2a2419] bg-[radial-gradient(circle_at_50%_20%,rgba(212,175,55,0.18),transparent_55%),#09090b]">
        <div className="absolute inset-x-10 top-5 h-24 rounded-t-full border border-[#d4af37]/25" />
        <div className="absolute left-1/2 top-9 h-10 w-10 -translate-x-1/2 rounded-full border border-[#d4af37]/60" />
        <div className="absolute bottom-5 left-1/2 h-16 w-28 -translate-x-1/2 rounded-t-full border border-[#d4af37]/20 bg-black/30" />
        <p className="absolute bottom-3 left-4 right-4 text-center text-[9px] uppercase tracking-[0.2em] text-[#d4af37]/70">Guardiao ativo</p>
      </div>
      <nav className="flex flex-1 flex-col gap-1 px-3">
        {AREAS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setArea(item.key)}
            className={`flex min-h-11 items-center gap-3 border px-4 text-left text-[12px] font-semibold uppercase tracking-[0.12em] transition-colors ${
              area === item.key
                ? 'border-[#d4af37]/55 bg-[#d4af37]/10 text-[#d4af37]'
                : 'border-transparent text-zinc-400 hover:border-[#2a2419] hover:bg-[#111114] hover:text-zinc-100'
            }`}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </nav>
      <div className="border-t border-[#2a2419] p-4">
        <p className="truncate text-xs text-zinc-400">{user.username}</p>
        <button type="button" onClick={onLogout} className="mt-3 flex min-h-10 w-full items-center justify-center gap-2 border border-[#2a2419] text-xs uppercase tracking-[0.14em] text-zinc-300 hover:border-[#d4af37]/50 hover:text-[#d4af37]">
          <LogOut className="h-4 w-4" /> Sair
        </button>
      </div>
    </aside>
  );
}

function TradingLevelsChart({ trade, currentPrice, selectedPair, candles, loading, error }: {
  trade: DemoTrade | null;
  currentPrice: number | null;
  selectedPair: string;
  candles: Candle[];
  loading: boolean;
  error: string | null;
}) {
  const data = useMemo(() => makeChartData(candles), [candles]);
  const directionColor = trade?.direction === 'SELL' ? '#ff4d4d' : '#00ff88';
  const entryPoint = trade ? nearestPointByTime(data, trade.openTime) : null;
  const levels = trade ? [trade.entry, trade.stopLoss, trade.target1, trade.target2, currentPrice].filter(isValidPrice) : [currentPrice].filter(isValidPrice);
  const chartValues = [...data.map((point) => point.price), ...levels];
  const minPrice = chartValues.length > 0 ? Math.min(...chartValues) : 0;
  const maxPrice = chartValues.length > 0 ? Math.max(...chartValues) : 1;
  const pricePadding = Math.max((maxPrice - minPrice) * 0.08, Math.abs(maxPrice) * 0.001, 0.01);

  return (
    <div className="h-[520px] min-h-[360px] w-full border border-[#2a2419] bg-[#08090a] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">Grafico principal</p>
          <p className="font-mono text-xl font-semibold text-zinc-100">{trade?.pair ?? selectedPair}</p>
        </div>
        {trade && (
          <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.12em]">
            <span className="border px-2 py-1" style={{ borderColor: directionColor, color: directionColor }}>{trade.direction}</span>
            <span className="border border-[#2a2419] px-2 py-1 text-zinc-400">ID {trade.id.slice(0, 8)}</span>
          </div>
        )}
      </div>
      {loading ? (
        <div className="flex h-[86%] items-center justify-center border border-[#171717] text-xs uppercase tracking-[0.18em] text-zinc-500">Carregando historico real...</div>
      ) : error ? (
        <div className="flex h-[86%] items-center justify-center border border-[#171717] px-4 text-center text-sm text-[#ff4d4d]">{error}</div>
      ) : data.length === 0 ? (
        <div className="flex h-[86%] items-center justify-center border border-[#171717] text-sm text-zinc-500">Historico indisponivel para este ativo.</div>
      ) : (
        <ResponsiveContainer width="100%" height="86%">
          <LineChart data={data} margin={{ top: 20, right: 34, bottom: 12, left: 6 }}>
            <CartesianGrid stroke="rgba(212,175,55,0.08)" vertical={false} />
            <XAxis dataKey="name" stroke="#71717a" tick={{ fontSize: 10 }} minTickGap={28} />
            <YAxis domain={[minPrice - pricePadding, maxPrice + pricePadding]} orientation="right" stroke="#71717a" tick={{ fontSize: 10 }} width={78} />
            <Tooltip
              contentStyle={{ background: '#09090b', border: '1px solid #2a2419', color: '#f4f4f5' }}
              formatter={(value) => [fmtCurrency(Number(value)), 'Preco']}
            />
            <Line type="monotone" dataKey="price" stroke="#d4af37" dot={false} strokeWidth={2} isAnimationActive={false} />
            {trade && (
              <>
                <ReferenceLine y={trade.entry} stroke="#f4f4f5" strokeDasharray="4 4" label={{ value: 'Entrada', fill: '#f4f4f5', fontSize: 11 }} />
                <ReferenceLine y={trade.stopLoss} stroke="#ff4d4d" strokeDasharray="6 4" label={{ value: 'Stop', fill: '#ff4d4d', fontSize: 11 }} />
                <ReferenceLine y={trade.target1} stroke="#00ff88" strokeDasharray="4 4" label={{ value: 'Alvo 1', fill: '#00ff88', fontSize: 11 }} />
                <ReferenceLine y={trade.target2} stroke="#00ff88" strokeDasharray="8 4" label={{ value: 'Alvo 2', fill: '#00ff88', fontSize: 11 }} />
                {entryPoint && <ReferenceDot x={entryPoint.name} y={trade.entry} r={5} fill={directionColor} stroke="#09090b" label={{ value: trade.direction, fill: directionColor, fontSize: 11, position: 'top' }} />}
              </>
            )}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function TradeTable({ trades, prices, activePrice, activeTrade, selectedId, onSelect }: {
  trades: Trade[];
  prices: Record<string, number | null>;
  activePrice: number | null;
  activeTrade: DemoTrade | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (trades.length === 0) {
    return <div className="border border-[#2a2419] bg-[#0f1011] p-6 text-sm text-zinc-500">Nenhuma posicao aberta.</div>;
  }
  return (
    <div className="overflow-x-auto border border-[#2a2419]">
      <table className="w-full min-w-[920px] border-collapse bg-[#09090b] text-left text-xs">
        <thead className="bg-[#111114] text-[10px] uppercase tracking-[0.16em] text-zinc-500">
          <tr>
            {['Ativo', 'Direcao', 'Entrada', 'Atual', 'Stop', 'Alvo 1', 'Alvo 2', 'PnL', 'R/R', 'Horario'].map((header) => (
              <th key={header} className="border-b border-[#2a2419] px-3 py-3">{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {trades.map((trade) => {
            const price = tradeCurrentPrice(trade, prices, activePrice, activeTrade);
            const pnl = tradePnl(trade, price);
            const selected = selectedId === trade.id;
            return (
              <tr key={trade.id} onClick={() => onSelect(trade.id)} className={`cursor-pointer border-b border-[#171717] hover:bg-[#15130e] ${selected ? 'bg-[#d4af37]/10' : ''}`}>
                <td className="px-3 py-3 font-mono text-zinc-100">{trade.pair}</td>
                <td className={`px-3 py-3 font-bold ${trade.direction === 'BUY' ? 'text-[#00ff88]' : 'text-[#ff4d4d]'}`}>{trade.direction}</td>
                <td className="px-3 py-3 font-mono">{fmtCurrency(trade.entry)}</td>
                <td className="px-3 py-3 font-mono text-[#4fc3ff]">{fmtCurrency(price)}</td>
                <td className="px-3 py-3 font-mono text-[#ff4d4d]">{fmtCurrency(trade.stopLoss)}</td>
                <td className="px-3 py-3 font-mono text-[#00ff88]">{fmtCurrency(trade.target1)}</td>
                <td className="px-3 py-3 font-mono text-[#00ff88]">{fmtCurrency(trade.target2)}</td>
                <td className={`px-3 py-3 font-mono ${signedColor(pnl)}`}>{fmtSignedCurrency(pnl)}</td>
                <td className="px-3 py-3 font-mono text-[#d4af37]">{rrLabel(trade)}</td>
                <td className="px-3 py-3 font-mono text-zinc-500">{new Date(trade.openTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CompactHistoryTable({ history }: { history: DemoSession['history'] }) {
  if (history.length === 0) return <div className="border border-[#2a2419] bg-[#0f1011] p-6 text-sm text-zinc-500">Historico vazio.</div>;
  return (
    <div className="overflow-x-auto border border-[#2a2419]">
      <table className="w-full min-w-[760px] text-left text-xs">
        <thead className="bg-[#111114] text-[10px] uppercase tracking-[0.16em] text-zinc-500">
          <tr>
            {['Ativo', 'Direcao', 'Saida', 'PnL', 'MFE', 'MAE', 'Duracao'].map((header) => <th key={header} className="px-3 py-3">{header}</th>)}
          </tr>
        </thead>
        <tbody>
          {history.slice(0, 20).map((trade) => (
            <tr key={trade.id} className="border-t border-[#171717]">
              <td className="px-3 py-3 font-mono">{trade.pair}</td>
              <td className={`px-3 py-3 font-bold ${trade.direction === 'BUY' ? 'text-[#00ff88]' : 'text-[#ff4d4d]'}`}>{trade.direction}</td>
              <td className="px-3 py-3 text-zinc-400">{trade.exitReason ?? trade.status}</td>
              <td className={`px-3 py-3 font-mono ${signedColor(trade.pnlUSDC)}`}>{fmtSignedCurrency(trade.pnlUSDC)}</td>
              <td className="px-3 py-3 font-mono text-[#00ff88]">{fmtCurrency(trade.mfeUSDC)}</td>
              <td className="px-3 py-3 font-mono text-[#ff4d4d]">{fmtCurrency(trade.maeUSDC)}</td>
              <td className="px-3 py-3 font-mono text-zinc-500">{trade.closeTime ? fmtDuration(trade.closeTime - trade.openTime) : '--'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AuthenticatedTradingDashboard(props: AuthenticatedTradingDashboardProps) {
  const [area, setArea] = useState<DashboardArea>('dashboard');
  const [tableTab, setTableTab] = useState<'positions' | 'orders' | 'history' | 'audit'>('positions');
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(null);
  const [chartCandles, setChartCandles] = useState<Candle[]>(props.market.candles5m);
  const [chartCandlesLoading, setChartCandlesLoading] = useState(false);
  const [chartCandlesError, setChartCandlesError] = useState<string | null>(null);

  const openTrades = props.mobileOpenTrades.length > 0
    ? props.mobileOpenTrades
    : props.demoSession.activeTrade ? [props.demoSession.activeTrade] : [];
  const selectedTrade = selectedTradeFrom(openTrades, props.demoSession, selectedTradeId);
  const selectedPrice = selectedTrade ? tradeCurrentPrice(selectedTrade, props.mobilePricesByPair, props.activeTradeCurrentPrice, props.demoSession.activeTrade) : props.market.price;
  const chartPair = selectedTrade?.pair ?? props.selectedPair;
  const totalTrades = props.demoSession.dailyStats?.totalTrades ?? 0;
  const wins = props.demoSession.dailyStats?.wins ?? 0;
  const winRate = totalTrades > 0 ? `${((wins / totalTrades) * 100).toFixed(1)}%` : '--';
  const openCount = props.demoSession.openPositionsCount ?? openTrades.length;
  const oracleTone = props.oracleVisualState === 'buy' ? 'text-[#00ff88]' : props.oracleVisualState === 'sell' ? 'text-[#ff4d4d]' : props.oracleVisualState === 'analyzing' ? 'text-[#4fc3ff]' : 'text-[#d4af37]';

  useEffect(() => {
    if (selectedTradeId && openTrades.some((trade) => trade.id === selectedTradeId)) return;
    setSelectedTradeId(openTrades[0]?.id ?? null);
  }, [openTrades, selectedTradeId]);

  useEffect(() => {
    if (chartPair === 'BTCUSDT' && props.market.candles5m.length > 0) {
      setChartCandles(props.market.candles5m);
      setChartCandlesLoading(false);
      setChartCandlesError(null);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    setChartCandlesLoading(true);
    setChartCandlesError(null);

    fetchKlines(chartPair, '5m', 120, controller.signal)
      .then((candles) => {
        if (cancelled) return;
        setChartCandles(candles);
      })
      .catch((error) => {
        if (cancelled || controller.signal.aborted) return;
        setChartCandles([]);
        setChartCandlesError(error instanceof Error ? error.message : 'Historico indisponivel para este ativo.');
      })
      .finally(() => {
        if (!cancelled) setChartCandlesLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [chartPair, props.market.candles5m]);

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-100">
      <div className="flex flex-col lg:flex-row">
        <Sidebar area={area} setArea={setArea} user={props.user} onLogout={props.onLogout} />
        <main className="min-h-screen flex-1 bg-[radial-gradient(circle_at_70%_0%,rgba(212,175,55,0.10),transparent_32%),linear-gradient(180deg,#09090b,#050505)]">
          <header className="sticky top-0 z-30 border-b border-[#2a2419] bg-[#070707]/90 px-4 py-3 backdrop-blur lg:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <select value={props.selectedPair} onChange={(event) => props.onSelectedPairChange(event.target.value)} className="h-10 border border-[#2a2419] bg-[#0f1011] px-3 text-sm font-semibold text-[#d4af37] outline-none">
                  <option value="BTCUSDT">BTCUSDT</option>
                  <option value="ETHUSDT">ETHUSDT</option>
                  <option value="SOLUSDT">SOLUSDT</option>
                </select>
                <span className="font-mono text-sm text-zinc-300">{fmtCurrency(props.market.price)}</span>
                <span className={`text-[10px] uppercase tracking-[0.16em] ${props.apiHealth.error ? 'text-[#ff4d4d]' : 'text-[#00ff88]'}`}>{props.apiHealth.error ? 'Sistema degradado' : 'Sistema online'}</span>
                <span className={`text-[10px] uppercase tracking-[0.16em] ${oracleTone}`}>Oraculo {props.oracleVisualState}</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-zinc-400">
                <span>{props.user.username}</span>
                <button onClick={props.onLogout} className="border border-[#2a2419] px-3 py-2 text-[10px] uppercase tracking-[0.14em] hover:border-[#d4af37]/60">Sair</button>
              </div>
            </div>
          </header>

          <div className="p-4 lg:p-6">
            {area === 'dashboard' && (
              <div className="grid gap-4">
                <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                  <MiniMetric label="Banca" value={fmtCurrency(props.demoSession.balance)} tone="gold" />
                  <MiniMetric label="PnL do dia" value={fmtSignedCurrency(props.demoSession.dailyStats?.dailyPnL)} tone={(props.demoSession.dailyStats?.dailyPnL ?? 0) >= 0 ? 'green' : 'red'} />
                  <MiniMetric label="Win rate" value={winRate} tone="green" />
                  <MiniMetric label="Operacoes abertas" value={`${openCount}/3`} tone={openCount > 0 ? 'blue' : 'neutral'} />
                  <MiniMetric label="Regime" value={props.radar.analysis?.marketRegime ?? props.oracleVisualState.toUpperCase()} tone="blue" />
                  <MiniMetric label="Estrategia ativa" value={props.demoEnabled ? 'DEMO 24H' : 'Manual'} tone="gold" />
                </section>

                <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                  <TradingLevelsChart trade={selectedTrade} currentPrice={selectedPrice} selectedPair={chartPair} candles={chartCandles} loading={chartCandlesLoading} error={chartCandlesError} />
                  <aside className="grid content-start gap-3">
                    <div className="border border-[#2a2419] bg-[#0f1011] p-4">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-[#d4af37]">Status do Oraculo</p>
                      <p className={`mt-2 text-2xl font-semibold uppercase ${oracleTone}`}>{props.oracleVisualState}</p>
                      <p className="mt-2 text-sm text-zinc-400">Decisao atual: {props.result?.decision ?? 'Aguardando'}</p>
                      <p className="text-sm text-zinc-500">Proxima analise: {props.demoEnabled ? props.demoAutoState.countdown : 'manual'}</p>
                    </div>
                    <div className="border border-[#2a2419] bg-[#0f1011] p-4">
                      <p className="mb-3 text-[10px] uppercase tracking-[0.18em] text-zinc-500">Alertas recentes</p>
                      <NotificationsPanel />
                    </div>
                    <div className="border border-[#2a2419] bg-[#0f1011] p-4">
                      <p className="mb-3 text-[10px] uppercase tracking-[0.18em] text-zinc-500">Watchlist</p>
                      <div className="grid gap-2">
                        {['BTCUSDT', 'ETHUSDT', 'SOLUSDT'].map((pair) => {
                          const agent = props.demoAgents.agents?.find?.((item: any) => item.symbol === pair);
                          return (
                            <button key={pair} onClick={() => props.onSelectedPairChange(pair)} className="flex items-center justify-between border border-[#2a2419] bg-[#09090b] px-3 py-2 text-left hover:border-[#d4af37]/50">
                              <span className="font-mono text-sm">{pair}</span>
                              <span className="text-xs text-zinc-500">{agent?.decision ?? 'monitorando'}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </aside>
                </section>

                <section className="border border-[#2a2419] bg-[#0f1011]">
                  <div className="flex flex-wrap border-b border-[#2a2419]">
                    {[
                      ['positions', 'Posicoes abertas'],
                      ['orders', 'Ordens'],
                      ['history', 'Historico'],
                      ['audit', 'Auditoria'],
                    ].map(([key, label]) => (
                      <button key={key} onClick={() => setTableTab(key as typeof tableTab)} className={`min-h-11 px-4 text-xs uppercase tracking-[0.14em] ${tableTab === key ? 'bg-[#d4af37]/10 text-[#d4af37]' : 'text-zinc-500 hover:text-zinc-200'}`}>{label}</button>
                    ))}
                  </div>
                  <div className="p-4">
                    {tableTab === 'positions' && <TradeTable trades={openTrades} prices={props.mobilePricesByPair} activePrice={props.activeTradeCurrentPrice} activeTrade={props.demoSession.activeTrade} selectedId={selectedTrade?.id ?? null} onSelect={setSelectedTradeId} />}
                    {tableTab === 'orders' && <div className="border border-[#2a2419] bg-[#09090b] p-6 text-sm text-zinc-500">Sem ordens pendentes no modo DEMO.</div>}
                    {tableTab === 'history' && <CompactHistoryTable history={props.demoSession.history} />}
                    {tableTab === 'audit' && <AuditPreview entries={props.mobileAuditEntries} loading={props.mobileAuditLoading} error={props.mobileAuditError} />}
                  </div>
                </section>
              </div>
            )}

            {area === 'operations' && (
              <div className="grid gap-4">
                <TradeTable trades={openTrades} prices={props.mobilePricesByPair} activePrice={props.activeTradeCurrentPrice} activeTrade={props.demoSession.activeTrade} selectedId={selectedTrade?.id ?? null} onSelect={setSelectedTradeId} />
                <CompactHistoryTable history={props.demoSession.history} />
              </div>
            )}

            {area === 'markets' && (
              <div className="grid gap-4">
                <MarketRadarPanel analysis={props.radar.analysis} loading={props.radar.loading} error={props.radar.error} lastUpdate={props.radar.lastUpdate} symbol={props.radar.symbol} onSymbolChange={props.radar.setSymbol} />
                <DemoAgentsPanel agents={props.demoAgents.agents} configs={props.demoAgents.configs} portfolio={props.demoAgents.portfolio} globalRisk={props.demoAgents.globalRisk} selectedSymbol={props.radar.symbol} onSelectSymbol={props.radar.setSymbol} />
              </div>
            )}

            {area === 'strategies' && (
              <div className="grid gap-4 lg:grid-cols-3">
                {['Motor V6 adaptativo', 'Gestao por R', 'Risco global DEMO'].map((title, index) => (
                  <div key={title} className="border border-[#2a2419] bg-[#0f1011] p-5">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-[#d4af37]">Estrategia {index + 1}</p>
                    <h2 className="mt-2 text-xl font-semibold">{title}</h2>
                    <p className="mt-3 text-sm leading-6 text-zinc-400">Leitura operacional somente exibida. Nenhuma regra e alterada por esta tela.</p>
                  </div>
                ))}
              </div>
            )}

            {area === 'reports' && (
              <div className="grid gap-4">
                <button type="button" onClick={() => { window.location.href = '/relatorio-operacoes'; }} className="min-h-12 border border-[#d4af37]/50 bg-[#d4af37]/10 px-5 text-left text-sm font-bold uppercase tracking-[0.16em] text-[#d4af37]">Abrir Relatorio de Operacoes</button>
                <DemoStatsPanel stats={props.demoSession.dailyStats} currentBalance={props.demoSession.balance} configuredBalance={props.demoSession.configuredBalance} realizedPnl={props.demoSession.realizedPnlUSDC ?? 0} unrealizedPnl={props.demoSession.unrealizedPnlUSDC ?? 0} partialPnl={props.demoSession.partialPnlUSDC ?? 0} openRisk={props.demoSession.openRiskUSDC ?? 0} maxDailyTrades={props.maxDailyTrades} onReset={() => props.onResetSession(props.demoSession.configuredBalance)} onBalanceChange={(balance) => { props.onConfiguredBalanceChange(balance); props.onResetSession(balance); }} />
                <DemoHistoryPanel history={props.demoSession.history} />
              </div>
            )}

            {area === 'alerts' && <NotificationsPanel />}

            {area === 'settings' && (
              <div className="grid gap-4">
                <div className="border border-[#2a2419] bg-[#0f1011] p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.18em] text-[#d4af37]">Modo DEMO automatico 24h</p>
                      <p className="mt-1 text-sm text-zinc-400">{props.safeLimited ? props.safeReason : 'Analise e auditoria continuam com dados reais do DEMO.'}</p>
                      {props.demoServerError && <p className="mt-1 text-xs text-[#ff4d4d]">{props.demoServerError}</p>}
                    </div>
                    <button type="button" disabled={props.market.loading || !!props.market.error} onClick={() => props.onAutomationChange(!props.demoEnabled, props.selectedPair)} className={`min-h-11 border px-4 text-xs font-bold uppercase tracking-[0.14em] ${props.demoEnabled ? 'border-[#00ff88]/50 text-[#00ff88]' : 'border-[#2a2419] text-zinc-300'}`}>{props.demoEnabled ? 'Ativo' : 'Inativo'}</button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button type="button" disabled={!props.canAnalyze || props.analyzing} onClick={props.onAnalyze} className="min-h-11 border border-[#d4af37]/50 bg-[#d4af37]/10 px-4 text-xs font-bold uppercase tracking-[0.14em] text-[#d4af37] disabled:opacity-40">{props.analyzing ? 'Analisando' : 'Analisar agora'}</button>
                  <button type="button" onClick={() => void props.market.refresh()} className="min-h-11 border border-[#2a2419] px-4 text-xs uppercase tracking-[0.14em] text-zinc-300">Atualizar mercado</button>
                </div>
                {props.user.role === 'admin' && <ControlledSimulationPanel />}
                {props.user.role === 'admin' && <ObservabilityPanel publicHealth={(props.apiHealth.health ?? null) as any} publicError={props.apiHealth.error} />}
                {props.user.role === 'admin' && <EngineAuditPanel />}
                <RobotDiagnosticsPanel user={props.user} />
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function AuditPreview({ entries, loading, error }: { entries: EngineAuditEntry[]; loading: boolean; error: string | null }) {
  if (loading) return <div className="border border-[#2a2419] p-6 text-sm text-zinc-500">Carregando auditoria...</div>;
  if (error) return <div className="border border-[#ff4d4d]/40 p-6 text-sm text-[#ff4d4d]">{error}</div>;
  if (entries.length === 0) return <div className="border border-[#2a2419] p-6 text-sm text-zinc-500">Sem registros recentes.</div>;
  return (
    <div className="grid gap-2">
      {entries.slice(0, 8).map((entry) => (
        <div key={entry.id} className="grid gap-2 border border-[#2a2419] bg-[#09090b] p-3 text-xs md:grid-cols-[120px_1fr_160px]">
          <span className="font-mono text-[#d4af37]">{entry.symbol}</span>
          <span className="text-zinc-300">{entry.decisiveReason || entry.decisionState}</span>
          <span className="font-mono text-zinc-500">{entry.decisionState}</span>
        </div>
      ))}
    </div>
  );
}
