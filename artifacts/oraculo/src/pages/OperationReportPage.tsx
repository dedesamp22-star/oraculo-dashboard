import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BarChart3,
  Brain,
  Download,
  Filter,
  RefreshCw,
  ShieldAlert,
  Timer,
  TrendingUp,
} from 'lucide-react';
import {
  downloadDemoTradeExport,
  fetchDemoTradeExport,
  getAuth,
  type AuthUser,
  type DemoTradeExportEntry,
} from '../lib/demoApi';
import {
  buildTradeReportDashboard,
  buildTradeReportDiagnosis,
  type TradeReportDiagnosis,
  type TradeReportFilters,
} from '../lib/tradeReport';

const DEFAULT_FILTERS: TradeReportFilters = {
  symbol: 'ALL',
  direction: 'ALL',
  status: 'ALL',
  exitReason: 'ALL',
};

const EXIT_REASONS = [
  { value: 'ALL', label: 'Todos' },
  { value: 'STOP_LOSS', label: 'Stop' },
  { value: 'TARGET_1', label: 'Target 1' },
  { value: 'TARGET_2', label: 'Target 2' },
  { value: 'BREAKEVEN', label: 'Breakeven' },
  { value: 'TIMEOUT', label: 'Timeout' },
  { value: 'LOSS_OF_STRENGTH', label: 'Loss of Strength' },
];

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function fmtNumber(value: number | null | undefined, digits = 2): string {
  if (!isFiniteNumber(value)) return '—';
  if (value === Number.POSITIVE_INFINITY) return '∞';
  return value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function fmtCurrency(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) return '—';
  return `${value >= 0 ? '+' : '-'}$${fmtNumber(Math.abs(value), 2)}`;
}

function fmtPct(value: number | null | undefined): string {
  return isFiniteNumber(value) ? `${fmtNumber(value, 1)}%` : '—';
}

function fmtDuration(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) return '—';
  const minutes = Math.round(value / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function metricColor(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) return '#F4F4F588';
  return value >= 0 ? '#00FF88' : '#FF4D4D';
}

function SelectFilter({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-[#F4F4F5]/45">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-10 border border-[#232329] bg-[#111114] px-3 text-xs font-mono text-[#F4F4F5] outline-none transition-colors focus:border-[#00D8FF]/70"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function MetricCard({
  label,
  value,
  sub,
  color = '#F4F4F5',
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="border border-[#232329] bg-[#111114]/80 p-4">
      <p className="text-[9px] font-mono uppercase tracking-[0.18em] text-[#F4F4F5]/45">{label}</p>
      <p className="mt-2 text-2xl font-mono font-bold tabular-nums" style={{ color }}>{value}</p>
      {sub && <p className="mt-1 text-[10px] font-mono text-[#F4F4F5]/42">{sub}</p>}
    </div>
  );
}

function DiagnosisPanel({ diagnosis }: { diagnosis: TradeReportDiagnosis | null }) {
  if (!diagnosis) {
    return (
      <div className="border border-[#D4AF37]/25 bg-[#D4AF37]/[0.06] p-4 text-sm text-[#F4F4F5]/60">
        Clique em “Gerar Diagnóstico” para criar um resumo estatístico com base nos trades filtrados.
      </div>
    );
  }
  return (
    <div className="border border-[#00D8FF]/30 bg-[#00D8FF]/[0.05] p-4">
      <div className="flex items-start gap-3">
        <Brain className="mt-1 h-5 w-5 flex-shrink-0 text-[#00D8FF]" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#F4F4F5]">{diagnosis.summary}</p>
          <div className="mt-3 grid gap-2 text-xs text-[#F4F4F5]/68 md:grid-cols-2">
            {diagnosis.patterns.map((pattern) => (
              <p key={pattern} className="border border-[#232329] bg-[#09090B]/55 px-3 py-2">{pattern}</p>
            ))}
          </div>
          <div className="mt-3 grid gap-2 text-[11px] font-mono text-[#F4F4F5]/55 sm:grid-cols-2">
            <span>Melhor ativo: {diagnosis.bestSymbol ? `${diagnosis.bestSymbol.symbol} (${fmtCurrency(diagnosis.bestSymbol.pnlUSDC)})` : '—'}</span>
            <span>Pior ativo: {diagnosis.worstSymbol ? `${diagnosis.worstSymbol.symbol} (${fmtCurrency(diagnosis.worstSymbol.pnlUSDC)})` : '—'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function OperationReportPage() {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [filters, setFilters] = useState<TradeReportFilters>(DEFAULT_FILTERS);
  const [entries, setEntries] = useState<DemoTradeExportEntry[]>([]);
  const [diagnosis, setDiagnosis] = useState<TradeReportDiagnosis | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const queryFilters = useMemo(() => ({
    symbol: filters.symbol,
    direction: filters.direction,
    status: filters.status,
    exitReason: filters.exitReason,
    limit: 1000,
  }), [filters]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [auth, report] = await Promise.all([
        getAuth(),
        fetchDemoTradeExport(queryFilters),
      ]);
      setAuthUser(auth.user ?? null);
      setEntries(report.entries);
      setDiagnosis(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar relatório.');
    } finally {
      setLoading(false);
    }
  }, [queryFilters]);

  useEffect(() => {
    void load();
  }, [load]);

  const dashboard = useMemo(() => buildTradeReportDashboard(entries), [entries]);
  const totalExits = Object.values(dashboard.exitsByReason).reduce((sum, value) => sum + value, 0);

  const updateFilter = <K extends keyof TradeReportFilters>(key: K, value: TradeReportFilters[K]) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const handleExport = async (format: 'json' | 'csv') => {
    setExporting(format);
    setError(null);
    try {
      await downloadDemoTradeExport({ ...queryFilters, format });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao exportar operações.');
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#09090B] text-[#F4F4F5]">
      <div className="fixed inset-x-0 top-0 z-40 border-b border-[#232329]/80 bg-[#09090B]/88 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => { window.location.href = '/'; }}
            className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#F4F4F5]/65 transition-colors hover:text-[#00D8FF]"
          >
            <ArrowLeft className="h-4 w-4" />
            Dashboard
          </button>
          <div className="text-right">
            <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-[#D4AF37]">Central de Relatórios</p>
            <p className="text-[9px] font-mono text-[#F4F4F5]/40">{authUser?.role === 'admin' ? 'Admin' : 'Acesso restrito'}</p>
          </div>
        </div>
      </div>

      <main className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 pb-10 pt-24 sm:px-6 lg:px-8">
        <section className="border border-[#232329] bg-[#111114]/70 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 border border-[#00D8FF]/30 bg-[#00D8FF]/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-[#00D8FF]">
                <BarChart3 className="h-3.5 w-3.5" />
                Relatório de Operações
              </div>
              <h1 className="mt-4 text-3xl font-semibold tracking-normal sm:text-5xl">Resultados do modo demo</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#F4F4F5]/55">
                Camada separada da Auditoria do Motor, focada em resultado, excursão, giveback e padrões estatísticos das operações.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void load()}
                disabled={loading}
                className="inline-flex min-h-10 items-center gap-2 border border-[#232329] bg-[#09090B] px-4 text-[10px] font-bold uppercase tracking-[0.16em] text-[#F4F4F5]/75 transition-colors hover:border-[#00D8FF]/50 hover:text-[#00D8FF] disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                Atualizar
              </button>
              <button
                type="button"
                onClick={() => setDiagnosis(buildTradeReportDiagnosis(entries))}
                className="inline-flex min-h-10 items-center gap-2 border border-[#D4AF37]/45 bg-[#D4AF37]/10 px-4 text-[10px] font-bold uppercase tracking-[0.16em] text-[#D4AF37] transition-colors hover:bg-[#D4AF37]/15"
              >
                <Brain className="h-3.5 w-3.5" />
                Gerar Diagnóstico
              </button>
            </div>
          </div>
        </section>

        <section className="border border-[#232329] bg-[#111114]/60 p-4">
          <div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#F4F4F5]/55">
            <Filter className="h-3.5 w-3.5 text-[#00D8FF]" />
            Filtros
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SelectFilter
              label="Ativo"
              value={filters.symbol}
              onChange={(value) => updateFilter('symbol', value as TradeReportFilters['symbol'])}
              options={[
                { value: 'ALL', label: 'Todos' },
                { value: 'BTCUSDT', label: 'BTC' },
                { value: 'ETHUSDT', label: 'ETH' },
                { value: 'SOLUSDT', label: 'SOL' },
              ]}
            />
            <SelectFilter
              label="Direção"
              value={filters.direction}
              onChange={(value) => updateFilter('direction', value as TradeReportFilters['direction'])}
              options={[
                { value: 'ALL', label: 'Todos' },
                { value: 'BUY', label: 'Long' },
                { value: 'SELL', label: 'Short' },
              ]}
            />
            <SelectFilter
              label="Resultado"
              value={filters.status}
              onChange={(value) => updateFilter('status', value as TradeReportFilters['status'])}
              options={[
                { value: 'ALL', label: 'Todos' },
                { value: 'WIN', label: 'Win' },
                { value: 'LOSS', label: 'Loss' },
              ]}
            />
            <SelectFilter
              label="Motivo da saída"
              value={filters.exitReason}
              onChange={(value) => updateFilter('exitReason', value)}
              options={EXIT_REASONS}
            />
          </div>
        </section>

        {error && (
          <div className="flex items-start gap-3 border border-[#FF4D4D]/35 bg-[#FF4D4D]/10 p-4 text-sm text-[#FF4D4D]">
            <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard label="Total de operações" value={String(dashboard.totalTrades)} />
          <MetricCard label="Win Rate" value={fmtPct(dashboard.winRatePct)} color="#00D8FF" />
          <MetricCard label="Profit Factor" value={fmtNumber(dashboard.profitFactor, 2)} color="#D4AF37" />
          <MetricCard label="Expectância (R)" value={fmtNumber(dashboard.expectancyR, 2)} color={metricColor(dashboard.expectancyR)} />
          <MetricCard label="Lucro líquido" value={fmtCurrency(dashboard.netPnlUSDC)} color={metricColor(dashboard.netPnlUSDC)} />
          <MetricCard label="MFE médio" value={fmtCurrency(dashboard.avgMfeUSDC)} color="#00FF88" />
          <MetricCard label="MAE médio" value={fmtCurrency(dashboard.avgMaeUSDC)} color="#FF4D4D" />
          <MetricCard label="Giveback médio" value={fmtCurrency(dashboard.avgGivebackUSDC)} color="#D4AF37" />
          <MetricCard label="Tempo médio" value={fmtDuration(dashboard.avgDurationMs)} />
          <MetricCard label="Amostra" value={loading ? '...' : `${entries.length}`} sub="trades filtrados" />
        </section>

        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.7fr)]">
          <div className="border border-[#232329] bg-[#111114]/60 p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#F4F4F5]/70">Saídas por motivo</h2>
              <Timer className="h-4 w-4 text-[#00D8FF]" />
            </div>
            <div className="space-y-3">
              {Object.entries(dashboard.exitsByReason).length === 0 && (
                <p className="text-sm text-[#F4F4F5]/45">Nenhuma operação fechada no filtro atual.</p>
              )}
              {Object.entries(dashboard.exitsByReason).map(([reason, count]) => {
                const pct = totalExits > 0 ? (count / totalExits) * 100 : 0;
                return (
                  <div key={reason}>
                    <div className="mb-1 flex items-center justify-between text-xs font-mono">
                      <span className="text-[#F4F4F5]/70">{reason}</span>
                      <span className="text-[#F4F4F5]/45">{count} · {pct.toFixed(1)}%</span>
                    </div>
                    <div className="h-2 bg-[#09090B]">
                      <div className="h-full bg-[#00D8FF]" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="border border-[#232329] bg-[#111114]/60 p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#F4F4F5]/70">Exportação</h2>
              <Download className="h-4 w-4 text-[#D4AF37]" />
            </div>
            <div className="grid gap-2">
              <button
                type="button"
                onClick={() => void handleExport('json')}
                disabled={exporting !== null}
                className="min-h-11 border border-[#00D8FF]/35 bg-[#00D8FF]/10 px-4 text-[10px] font-bold uppercase tracking-[0.16em] text-[#00D8FF] transition-colors hover:bg-[#00D8FF]/15 disabled:opacity-50"
              >
                {exporting === 'json' ? 'Exportando...' : 'Exportar Trades JSON'}
              </button>
              <button
                type="button"
                onClick={() => void handleExport('csv')}
                disabled={exporting !== null}
                className="min-h-11 border border-[#D4AF37]/35 bg-[#D4AF37]/10 px-4 text-[10px] font-bold uppercase tracking-[0.16em] text-[#D4AF37] transition-colors hover:bg-[#D4AF37]/15 disabled:opacity-50"
              >
                {exporting === 'csv' ? 'Exportando...' : 'Exportar Trades CSV'}
              </button>
            </div>
            <p className="mt-3 text-xs leading-5 text-[#F4F4F5]/45">
              Exportação baseada no histórico de trades e nos campos de observabilidade da Fase 4.1.
            </p>
          </div>
        </section>

        <DiagnosisPanel diagnosis={diagnosis} />

        <section className="border border-[#232329] bg-[#111114]/60">
          <div className="flex items-center justify-between border-b border-[#232329] px-4 py-3">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#F4F4F5]/70">Últimas operações filtradas</h2>
            <TrendingUp className="h-4 w-4 text-[#00FF88]" />
          </div>
          <div className="divide-y divide-[#232329]">
            {entries.slice(0, 20).map((trade) => (
              <div key={trade.id} className="grid gap-2 px-4 py-3 text-xs md:grid-cols-[1fr_1fr_1fr_1fr] md:items-center">
                <div>
                  <p className="font-mono font-bold text-[#F4F4F5]">{trade.pair} · {trade.direction}</p>
                  <p className="mt-1 text-[10px] text-[#F4F4F5]/42">{trade.exitReason ?? trade.status}</p>
                </div>
                <p className="font-mono text-[#F4F4F5]/65">PnL {fmtCurrency(trade.pnlUSDC)}</p>
                <p className="font-mono text-[#F4F4F5]/65">MFE {fmtCurrency(trade.mfeUSDC)} / MAE {fmtCurrency(trade.maeUSDC)}</p>
                <p className="font-mono text-[#F4F4F5]/65">Giveback {fmtCurrency(trade.peakGivebackUSDC)}</p>
              </div>
            ))}
            {entries.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-[#F4F4F5]/45">Nenhuma operação encontrada.</p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
