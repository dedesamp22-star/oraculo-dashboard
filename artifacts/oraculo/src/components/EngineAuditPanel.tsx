import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, RefreshCw, ChevronDown, ChevronUp,
  CheckCircle2, XCircle, AlertTriangle, Clock,
  BarChart2, Filter, TrendingUp, TrendingDown, Minus,
  Eye, Cpu,
} from 'lucide-react';
import {
  fetchEngineAuditLog,
  fetchEngineAuditSummary,
  type EngineAuditEntry,
  type EngineAuditSummary,
} from '../lib/demoApi';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTimeSP(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit', month: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  } catch {
    return iso;
  }
}

function fmtPrice(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

type DecisionKey = 'BUY' | 'SELL' | 'SEM ENTRADA';

const DECISION_CFG: Record<string, { color: string; bg: string; border: string; label: string; icon: React.ReactNode }> = {
  BUY: { color: '#00ff66', bg: '#00ff6610', border: '#00ff6640', label: 'COMPRA', icon: <TrendingUp className="w-3 h-3" /> },
  SELL: { color: '#ff4444', bg: '#ff444410', border: '#ff444440', label: 'VENDA', icon: <TrendingDown className="w-3 h-3" /> },
  'SEM ENTRADA': { color: '#ffaa00', bg: '#ffaa0010', border: '#ffaa0040', label: 'SEM ENTRADA', icon: <Minus className="w-3 h-3" /> },
};

const STATE_COLORS: Record<string, string> = {
  ENTRADA_APROVADA: '#00ff66',
  BLOQUEADO_RISCO: '#ff4444',
  SETUP_QUASE_PRONTO: '#ffaa00',
  CONTEXTO_FORMANDO: '#888888',
  SEM_SETUP: '#555555',
  ERRO: '#ff4444',
};

function decisionCfg(decision: string) {
  return DECISION_CFG[decision] ?? { color: '#aaaaaa', bg: '#ffffff08', border: '#ffffff20', label: decision, icon: <Minus className="w-3 h-3" /> };
}

// ── Summary bar ───────────────────────────────────────────────────────────────

function SummaryBar({ summary }: { summary: EngineAuditSummary | null }) {
  if (!summary || summary.total === 0) return null;
  const buy = summary.byDecision['BUY'] ?? 0;
  const sell = summary.byDecision['SELL'] ?? 0;
  const wait = summary.byDecision['SEM ENTRADA'] ?? 0;
  const blocked = summary.byState['BLOQUEADO_RISCO'] ?? 0;
  const approved = summary.byState['ENTRADA_APROVADA'] ?? 0;
  const total = summary.total;
  const pct = (n: number) => total > 0 ? ((n / total) * 100).toFixed(1) : '0.0';

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
      {[
        { label: 'Total', value: total, color: '#aaaaaa' },
        { label: 'Compra', value: buy, color: '#00ff66', sub: `${pct(buy)}%` },
        { label: 'Venda', value: sell, color: '#ff4444', sub: `${pct(sell)}%` },
        { label: 'Aguardar', value: wait, color: '#ffaa00', sub: `${pct(wait)}%` },
        { label: 'Bloqueados', value: blocked, color: '#ff4444', sub: approved > 0 ? `${approved} aprovados` : '0 aprovados' },
      ].map(({ label, value, color, sub }) => (
        <div key={label} className="border border-border/50 bg-card/30 px-3 py-2 flex flex-col gap-0.5">
          <span className="text-[9px] font-mono uppercase tracking-[0.16em] text-muted-foreground">{label}</span>
          <span className="text-lg font-mono font-bold tabular-nums" style={{ color }}>{value}</span>
          {sub && <span className="text-[9px] font-mono text-muted-foreground/60">{sub}</span>}
        </div>
      ))}
    </div>
  );
}

// ── Filter chips ──────────────────────────────────────────────────────────────

function FilterChip({ label, passed, reason, penalty }: {
  label: string; passed: boolean; reason?: string; penalty?: number | null;
}) {
  const [open, setOpen] = useState(false);
  const color = passed ? '#00ff66' : penalty != null ? '#ffaa00' : '#ff4444';
  const Icon = passed ? CheckCircle2 : penalty != null ? AlertTriangle : XCircle;
  return (
    <div>
      <button
        onClick={() => reason && setOpen(o => !o)}
        className="flex items-center gap-1.5 px-2 py-1 border text-[10px] font-mono w-full text-left hover:opacity-80 transition-opacity"
        style={{ borderColor: `${color}35`, background: `${color}0a` }}
      >
        <Icon className="w-3 h-3 flex-shrink-0" style={{ color }} />
        <span className="flex-1 truncate" style={{ color }}>{label}</span>
        {penalty != null && (
          <span className="text-[9px] font-mono ml-1 flex-shrink-0" style={{ color: '#ffaa00' }}>{penalty}</span>
        )}
        {reason && (
          <span className="text-muted-foreground/40 text-[9px] flex-shrink-0">{open ? '▲' : '▼'}</span>
        )}
      </button>
      <AnimatePresence>
        {open && reason && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <p className="text-[10px] font-mono text-muted-foreground/70 leading-relaxed px-2 pb-2 pt-1 border-x border-b border-border/30 bg-background/40">
              <span style={{ color: `${color}88` }} className="mr-1">›</span>
              {reason}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Row detail ────────────────────────────────────────────────────────────────

function AuditRowDetail({ entry }: { entry: EngineAuditEntry }) {
  return (
    <div className="px-4 pb-4 pt-2 bg-background/30 border-t border-border/30 space-y-4">
      {/* Prices */}
      {(entry.entryPrice != null || entry.stopPrice != null) && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: 'Entrada', value: fmtPrice(entry.entryPrice), color: '#ffffff' },
            { label: 'Stop', value: fmtPrice(entry.stopPrice), color: '#ff4444' },
            { label: 'Alvo 1', value: fmtPrice(entry.target1), color: '#00ff66' },
            { label: 'Alvo 2', value: fmtPrice(entry.target2), color: '#00ff66' },
          ].map(({ label, value, color }) => (
            <div key={label} className="border border-border/40 bg-card/20 px-2 py-1.5">
              <p className="text-[8px] font-mono uppercase tracking-[0.15em] text-muted-foreground">{label}</p>
              <p className="text-xs font-mono font-bold mt-0.5" style={{ color }}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Diagnostics row */}
      <div className="flex flex-wrap gap-3 text-[10px] font-mono">
        <span>1h: <strong className="text-foreground">{entry.trend1h}</strong></span>
        <span>15m: <strong className="text-foreground">{entry.trend15m}</strong></span>
        <span>Gatilho: <strong className="text-foreground">{entry.triggerStage}</strong></span>
        <span>R/R: <strong className="text-foreground">{entry.rr != null ? `1:${entry.rr.toFixed(2)}` : '—'}</strong></span>
        <span>Vol rel: <strong className="text-foreground">{entry.volumeRelative != null ? `${(entry.volumeRelative * 100).toFixed(0)}%` : '—'}</strong></span>
        <span className="text-muted-foreground/50">v{entry.engineVersion}</span>
      </div>

      {/* Decisive reason */}
      {entry.decisiveReason && (
        <div className="border-l-2 border-primary/40 pl-3">
          <p className="text-[9px] font-mono uppercase tracking-[0.14em] text-muted-foreground mb-0.5">Motivo decisivo</p>
          <p className="text-[11px] font-mono text-foreground/80 leading-relaxed">{entry.decisiveReason}</p>
        </div>
      )}

      {/* Missing conditions */}
      {entry.missingConditions.length > 0 && (
        <div>
          <p className="text-[9px] font-mono uppercase tracking-[0.14em] text-[#ffaa00]/70 mb-1">Condições faltando</p>
          <div className="flex flex-wrap gap-1.5">
            {entry.missingConditions.map((m, i) => (
              <span key={i} className="text-[10px] font-mono px-2 py-0.5 border border-[#ffaa00]/30 bg-[#ffaa00]/05 text-[#ffaa00]/80">{m}</span>
            ))}
          </div>
        </div>
      )}

      {/* Filters: approved */}
      {entry.filtersPassed.length > 0 && (
        <div>
          <p className="text-[9px] font-mono uppercase tracking-[0.14em] text-[#00ff66]/70 mb-1.5">
            Filtros aprovados ({entry.filtersPassed.length})
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
            {entry.filtersPassed.map((name, i) => (
              <FilterChip key={i} label={name} passed={true} />
            ))}
          </div>
        </div>
      )}

      {/* Filters: blocked */}
      {entry.filtersBlocked.length > 0 && (
        <div>
          <p className="text-[9px] font-mono uppercase tracking-[0.14em] text-[#ff4444]/70 mb-1.5">
            Filtros bloqueadores ({entry.filtersBlocked.length})
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
            {entry.filtersBlocked.map((f, i) => (
              <FilterChip key={i} label={f.name} passed={false} reason={f.reason} />
            ))}
          </div>
        </div>
      )}

      {/* Filters: penalties */}
      {entry.filtersPenalty.length > 0 && (
        <div>
          <p className="text-[9px] font-mono uppercase tracking-[0.14em] text-[#ffaa00]/70 mb-1.5">
            Penalidades de qualidade ({entry.filtersPenalty.length})
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
            {entry.filtersPenalty.map((f, i) => (
              <FilterChip key={i} label={f.name} passed={false} reason={f.reason} penalty={f.penalty ?? null} />
            ))}
          </div>
        </div>
      )}

      {/* Extra blocked reasons not from filters */}
      {entry.blockedReasons.length > 0 && (
        <div>
          <p className="text-[9px] font-mono uppercase tracking-[0.14em] text-[#ff4444]/70 mb-1.5">
            Motivos de bloqueio ({entry.blockedReasons.length})
          </p>
          <ul className="space-y-1">
            {entry.blockedReasons.map((r, i) => (
              <li key={i} className="text-[10px] font-mono text-muted-foreground/80 leading-relaxed flex items-start gap-1.5">
                <XCircle className="w-3 h-3 text-[#ff4444]/60 flex-shrink-0 mt-0.5" />
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Audit row ─────────────────────────────────────────────────────────────────

function AuditRow({ entry, index }: { entry: EngineAuditEntry; index: number }) {
  const [open, setOpen] = useState(false);
  const cfg = decisionCfg(entry.decision);
  const stateColor = STATE_COLORS[entry.decisionState] ?? '#aaaaaa';
  const hasBlocks = entry.filtersBlocked.length > 0 || entry.blockedReasons.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.4), duration: 0.2 }}
      className="border border-border/40 overflow-hidden"
    >
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
      >
        {/* Left color bar */}
        <div className="absolute left-0 top-0 bottom-0 w-[2px] pointer-events-none" style={{ background: cfg.color }} />

        {/* Time */}
        <span className="text-[9px] font-mono text-muted-foreground/60 w-[120px] flex-shrink-0 hidden sm:block">
          {fmtTimeSP(entry.analyzedAt)}
        </span>

        {/* Symbol */}
        <span className="text-[10px] font-mono text-muted-foreground w-[70px] flex-shrink-0">
          {entry.symbol.replace('USDT', '')}
        </span>

        {/* Decision badge */}
        <span
          className="flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 border flex-shrink-0"
          style={{ color: cfg.color, borderColor: cfg.border, background: cfg.bg }}
        >
          {cfg.icon} {cfg.label}
        </span>

        {/* Score */}
        <span className="text-[11px] font-mono tabular-nums flex-shrink-0 w-10 text-right hidden sm:block"
          style={{ color: entry.score >= 70 ? '#00ff66' : entry.score >= 50 ? '#ffaa00' : '#ff4444' }}>
          {entry.score}
        </span>

        {/* State */}
        <span className="text-[9px] font-mono uppercase tracking-wider truncate flex-1 hidden md:block"
          style={{ color: stateColor }}>
          {entry.decisionState.replace(/_/g, ' ')}
        </span>

        {/* Block indicators */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {hasBlocks && (
            <span className="flex items-center gap-0.5 text-[9px] font-mono text-[#ff4444]/70">
              <XCircle className="w-3 h-3" />
              {entry.filtersBlocked.length + (entry.blockedReasons.length > entry.filtersBlocked.length ? entry.blockedReasons.length - entry.filtersBlocked.length : 0)}
            </span>
          )}
          {entry.filtersPenalty.length > 0 && (
            <span className="flex items-center gap-0.5 text-[9px] font-mono text-[#ffaa00]/70">
              <AlertTriangle className="w-3 h-3" />
              {entry.filtersPenalty.length}
            </span>
          )}
          {entry.filtersPassed.length > 0 && (
            <span className="flex items-center gap-0.5 text-[9px] font-mono text-[#00ff66]/70">
              <CheckCircle2 className="w-3 h-3" />
              {entry.filtersPassed.length}
            </span>
          )}
        </div>

        <span className="text-muted-foreground/40 text-xs ml-1 flex-shrink-0">{open ? '▲' : '▼'}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden relative"
          >
            <AuditRowDetail entry={entry} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'] as const;
const DECISIONS = ['Todos', 'BUY', 'SELL', 'SEM ENTRADA'] as const;
const PAGE_SIZE = 50;

export function EngineAuditPanel() {
  const [open, setOpen] = useState(false);
  const [symbolFilter, setSymbolFilter] = useState<string>('');
  const [decisionFilter, setDecisionFilter] = useState<string>('Todos');
  const [entries, setEntries] = useState<EngineAuditEntry[]>([]);
  const [summary, setSummary] = useState<EngineAuditSummary | null>(null);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const intervalRef = useRef<number | null>(null);

  const load = useCallback(async (newOffset = 0) => {
    setLoading(true);
    setError(null);
    try {
      const symbol = symbolFilter || undefined;
      const [log, sum] = await Promise.all([
        fetchEngineAuditLog({ symbol, limit: PAGE_SIZE, offset: newOffset }),
        fetchEngineAuditSummary(symbol),
      ]);
      setEntries(log.entries);
      setTotal(log.total);
      setOffset(newOffset);
      setSummary(sum);
      setLastRefresh(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar auditoria.');
    } finally {
      setLoading(false);
    }
  }, [symbolFilter]);

  // Auto-refresh when panel is open
  useEffect(() => {
    if (!open) {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    void load(0);
    intervalRef.current = window.setInterval(() => void load(0), 30_000);
    return () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [open, load]);

  // Client-side decision filter (applied after fetch)
  const filtered = decisionFilter === 'Todos'
    ? entries
    : entries.filter(e => e.decision === decisionFilter);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <section className="border border-border/60 bg-card/30 overflow-hidden">
      {/* Header */}
      <button
        id="engine-audit-panel-toggle"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-7 h-7">
            <div className="absolute inset-0 bg-primary/15 rounded-sm" />
            <Cpu className="relative w-3.5 h-3.5 text-primary" />
          </div>
          <div className="text-left">
            <p className="text-xs font-mono font-bold uppercase tracking-[0.18em] text-foreground">
              Auditoria do Motor
            </p>
            <p className="text-[9px] font-mono text-muted-foreground/60 mt-0.5">
              {summary ? `${summary.total} registros` : 'Cada decisão do marketDecisionEngine'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {lastRefresh && (
            <span className="hidden sm:block text-[9px] font-mono text-muted-foreground/40">
              <Clock className="w-2.5 h-2.5 inline mr-0.5" />
              {lastRefresh.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
          {open ? <ChevronUp className="w-4 h-4 text-muted-foreground/60" /> : <ChevronDown className="w-4 h-4 text-muted-foreground/60" />}
        </div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="border-t border-border/40 px-4 py-4 space-y-4">
              {/* Controls */}
              <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                {/* Symbol filter */}
                <div className="flex gap-1.5">
                  {(['', ...SYMBOLS] as const).map((s) => (
                    <button
                      key={s}
                      id={`audit-symbol-${s || 'all'}`}
                      onClick={() => { setSymbolFilter(s); setOffset(0); }}
                      className={`px-3 py-1.5 text-[10px] font-mono uppercase tracking-[0.12em] border transition-all ${
                        symbolFilter === s
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'border-border/50 text-muted-foreground hover:text-foreground hover:border-border'
                      }`}
                    >
                      {s || 'Todos'}
                    </button>
                  ))}
                </div>

                {/* Decision filter */}
                <div className="flex gap-1.5 sm:ml-auto">
                  {DECISIONS.map((d) => (
                    <button
                      key={d}
                      id={`audit-decision-${d.replace(' ', '-')}`}
                      onClick={() => setDecisionFilter(d)}
                      className={`px-2.5 py-1.5 text-[9px] font-mono uppercase tracking-[0.1em] border transition-all ${
                        decisionFilter === d
                          ? 'bg-primary/20 text-primary border-primary/50'
                          : 'border-border/40 text-muted-foreground/60 hover:text-muted-foreground'
                      }`}
                    >
                      {d === 'Todos' ? 'Todos' : d === 'BUY' ? 'Compra' : d === 'SELL' ? 'Venda' : 'Aguardar'}
                    </button>
                  ))}
                </div>

                {/* Refresh */}
                <button
                  id="audit-refresh-btn"
                  onClick={() => void load(offset)}
                  disabled={loading}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-border/50 text-[10px] font-mono text-muted-foreground hover:text-foreground disabled:opacity-40 transition-all"
                >
                  <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                  Atualizar
                </button>
              </div>

              {/* Summary */}
              <SummaryBar summary={summary} />

              {/* Error */}
              {error && (
                <div className="flex items-center gap-2 text-[11px] font-mono text-[#ff4444]/80 border border-[#ff4444]/20 bg-[#ff4444]/05 px-3 py-2">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                  {error}
                </div>
              )}

              {/* Table header */}
              {!error && (
                <>
                  <div className="flex items-center gap-3 px-4 py-2 border-b border-border/30 text-[8px] font-mono uppercase tracking-[0.15em] text-muted-foreground/50">
                    <span className="w-[120px] hidden sm:block">Horário (SP)</span>
                    <span className="w-[70px]">Ativo</span>
                    <span className="w-[90px]">Decisão</span>
                    <span className="w-10 hidden sm:block text-right">Score</span>
                    <span className="flex-1 hidden md:block">Estado</span>
                    <span className="flex items-center gap-1">
                      <Filter className="w-2.5 h-2.5" /> Filtros
                    </span>
                  </div>

                  {/* Rows */}
                  {loading && entries.length === 0 ? (
                    <div className="flex items-center justify-center py-12 text-muted-foreground/40">
                      <RefreshCw className="w-5 h-5 animate-spin mr-2" />
                      <span className="text-xs font-mono">Carregando registros...</span>
                    </div>
                  ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground/30">
                      <Eye className="w-8 h-8" />
                      <p className="text-xs font-mono">Nenhum registro encontrado.</p>
                      <p className="text-[10px] font-mono">Aguarde um ciclo do worker (30s) para ver dados.</p>
                    </div>
                  ) : (
                    <div className="space-y-1 relative">
                      <AnimatePresence mode="popLayout">
                        {filtered.map((entry, i) => (
                          <AuditRow key={entry.id} entry={entry} index={i} />
                        ))}
                      </AnimatePresence>
                    </div>
                  )}

                  {/* Pagination */}
                  {total > PAGE_SIZE && (
                    <div className="flex items-center justify-between pt-2 border-t border-border/30">
                      <span className="text-[9px] font-mono text-muted-foreground/50">
                        Página {currentPage} de {totalPages} · {total} registros
                      </span>
                      <div className="flex gap-2">
                        <button
                          id="audit-prev-page"
                          disabled={offset === 0 || loading}
                          onClick={() => void load(Math.max(0, offset - PAGE_SIZE))}
                          className="px-3 py-1 text-[10px] font-mono border border-border/40 text-muted-foreground hover:text-foreground disabled:opacity-30"
                        >
                          ← Anterior
                        </button>
                        <button
                          id="audit-next-page"
                          disabled={offset + PAGE_SIZE >= total || loading}
                          onClick={() => void load(offset + PAGE_SIZE)}
                          className="px-3 py-1 text-[10px] font-mono border border-border/40 text-muted-foreground hover:text-foreground disabled:opacity-30"
                        >
                          Próxima →
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
