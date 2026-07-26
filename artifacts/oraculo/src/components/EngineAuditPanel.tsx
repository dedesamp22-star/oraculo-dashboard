import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, RefreshCw, ChevronDown, ChevronUp,
  CheckCircle2, XCircle, AlertTriangle, Clock,
  BarChart2, Filter, TrendingUp, TrendingDown, Minus,
  Eye, Cpu, Download,
} from 'lucide-react';
import {
  fetchEngineAuditLog,
  fetchEngineAuditSummary,
  downloadEngineAuditExport,
  type EngineAuditEntry,
  type EngineAuditSummary,
} from '../lib/demoApi';
import { buildEngineAuditInsight, type EngineAuditInsight } from '../lib/engineAuditInsight';

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

// ── Summary bar & Intelligent Statistics ─────────────────────────────────────

const PERIODS = ['1h', '6h', '24h', '7d'] as const;

function IntelligentStats({
  summary,
  period,
  onPeriodChange,
}: {
  summary: EngineAuditSummary | null;
  period: string;
  onPeriodChange: (p: string) => void;
}) {
  return (
    <div className="space-y-4">
      {/* Header & Period Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/30 pb-3">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-primary" />
          <h4 className="text-xs font-mono font-bold uppercase tracking-[0.14em] text-foreground">
            Estatísticas Inteligentes dos Bloqueios
          </h4>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[9px] font-mono text-muted-foreground/60 mr-1">Período:</span>
          {PERIODS.map((p) => (
            <button
              key={p}
              id={`audit-period-${p}`}
              onClick={() => onPeriodChange(p)}
              className={`px-2.5 py-1 text-[9px] font-mono uppercase tracking-[0.1em] border transition-all ${
                period === p
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border/40 text-muted-foreground/70 hover:text-foreground'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {!summary || summary.total === 0 ? (
        <div className="border border-border/40 bg-card/20 py-8 px-4 text-center">
          <Clock className="w-6 h-6 mx-auto mb-2 text-muted-foreground/40" />
          <p className="text-xs font-mono text-muted-foreground">Sem dados de auditoria para o período selecionado ({period}).</p>
          <p className="text-[10px] font-mono text-muted-foreground/50 mt-1">Aguarde a execução dos ciclos do motor.</p>
        </div>
      ) : (
        <>
          {/* Main Key Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
            {[
              { label: 'Total Análises', val: summary.total, color: '#aaaaaa' },
              { label: 'Score Médio', val: summary.avgScore ?? '—', color: '#00D8FF' },
              { label: 'Maior Score', val: summary.maxScore ?? '—', color: '#00ff66' },
              {
                label: 'Aprovado',
                val: summary.byState['ENTRADA_APROVADA']?.count ?? 0,
                color: '#00ff66',
                sub: `${summary.byState['ENTRADA_APROVADA']?.pct ?? 0}%`,
              },
              {
                label: 'Quase Pronto',
                val: summary.byState['SETUP_QUASE_PRONTO']?.count ?? 0,
                color: '#ffaa00',
                sub: `${summary.byState['SETUP_QUASE_PRONTO']?.pct ?? 0}%`,
              },
              {
                label: 'Contexto Formando',
                val: summary.byState['CONTEXTO_FORMANDO']?.count ?? 0,
                color: '#888888',
                sub: `${summary.byState['CONTEXTO_FORMANDO']?.pct ?? 0}%`,
              },
            ].map(({ label, val, color, sub }) => (
              <div key={label} className="border border-border/50 bg-card/30 px-3 py-2 flex flex-col gap-0.5">
                <span className="text-[9px] font-mono uppercase tracking-[0.12em] text-muted-foreground/70 truncate">{label}</span>
                <span className="text-lg font-mono font-bold tabular-nums" style={{ color }}>{val}</span>
                {sub && <span className="text-[9px] font-mono text-muted-foreground/60">{sub}</span>}
              </div>
            ))}
          </div>

          {/* Rankings Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
            {/* Top Blocked Reasons */}
            <div className="border border-border/40 bg-card/20 p-3 space-y-2">
              <div className="flex items-center justify-between border-b border-border/30 pb-1.5">
                <span className="text-[10px] font-mono uppercase tracking-[0.12em] font-bold text-foreground">
                  Top 5 Motivos de Bloqueio
                </span>
                <span className="text-[9px] font-mono text-muted-foreground/60">Ocorrências / %</span>
              </div>
              {summary.topBlockedReasons.length === 0 ? (
                <p className="text-[10px] font-mono text-muted-foreground/40 py-2">Nenhum bloqueio registrado.</p>
              ) : (
                <div className="space-y-2">
                  {summary.topBlockedReasons.map((item) => (
                    <div key={item.name} className="space-y-1">
                      <div className="flex justify-between text-[10px] font-mono">
                        <span className="text-muted-foreground truncate max-w-[200px]" title={item.name}>{item.name}</span>
                        <span className="font-bold text-foreground tabular-nums">{item.count} <span className="text-muted-foreground/60 font-normal">({item.pct}%)</span></span>
                      </div>
                      <div className="h-1 bg-border/40 overflow-hidden">
                        <div className="h-full bg-[#ff4444]" style={{ width: `${Math.min(100, item.pct)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Top Missing Conditions */}
            <div className="border border-border/40 bg-card/20 p-3 space-y-2">
              <div className="flex items-center justify-between border-b border-border/30 pb-1.5">
                <span className="text-[10px] font-mono uppercase tracking-[0.12em] font-bold text-foreground">
                  Top 5 Condições Ausentes
                </span>
                <span className="text-[9px] font-mono text-muted-foreground/60">Ocorrências / %</span>
              </div>
              {summary.topMissingConditions.length === 0 ? (
                <p className="text-[10px] font-mono text-muted-foreground/40 py-2">Nenhuma condição ausente registrada.</p>
              ) : (
                <div className="space-y-2">
                  {summary.topMissingConditions.map((item) => (
                    <div key={item.name} className="space-y-1">
                      <div className="flex justify-between text-[10px] font-mono">
                        <span className="text-muted-foreground truncate max-w-[200px]" title={item.name}>{item.name}</span>
                        <span className="font-bold text-foreground tabular-nums">{item.count} <span className="text-muted-foreground/60 font-normal">({item.pct}%)</span></span>
                      </div>
                      <div className="h-1 bg-border/40 overflow-hidden">
                        <div className="h-full bg-[#ffaa00]" style={{ width: `${Math.min(100, item.pct)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Combinations & Symbol Breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
            {/* Top Block Combinations */}
            <div className="border border-border/40 bg-card/20 p-3 space-y-2">
              <div className="flex items-center justify-between border-b border-border/30 pb-1.5">
                <span className="text-[10px] font-mono uppercase tracking-[0.12em] font-bold text-foreground">
                  Combinações de Bloqueio Mais Frequentes
                </span>
                <span className="text-[9px] font-mono text-muted-foreground/60">Ocorrências / %</span>
              </div>
              {summary.topBlockCombinations.length === 0 ? (
                <p className="text-[10px] font-mono text-muted-foreground/40 py-2">Nenhuma combinação registrada.</p>
              ) : (
                <div className="space-y-2">
                  {summary.topBlockCombinations.map((item) => (
                    <div key={item.name} className="space-y-1">
                      <div className="flex justify-between text-[10px] font-mono">
                        <span className="text-muted-foreground truncate max-w-[220px]" title={item.name}>{item.name}</span>
                        <span className="font-bold text-foreground tabular-nums">{item.count} <span className="text-muted-foreground/60 font-normal">({item.pct}%)</span></span>
                      </div>
                      <div className="h-1 bg-border/40 overflow-hidden">
                        <div className="h-full bg-primary/70" style={{ width: `${Math.min(100, item.pct)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Asset Breakdown */}
            <div className="border border-border/40 bg-card/20 p-3 space-y-2">
              <div className="flex items-center justify-between border-b border-border/30 pb-1.5">
                <span className="text-[10px] font-mono uppercase tracking-[0.12em] font-bold text-foreground">
                  Visão por Ativo (BTC / ETH / SOL)
                </span>
                <span className="text-[9px] font-mono text-muted-foreground/60">Total / Score Médio</span>
              </div>
              {Object.keys(summary.bySymbol).length === 0 ? (
                <p className="text-[10px] font-mono text-muted-foreground/40 py-2">Sem dados por ativo.</p>
              ) : (
                <div className="grid grid-cols-3 gap-2 py-1">
                  {['BTCUSDT', 'ETHUSDT', 'SOLUSDT'].map((sym) => {
                    const sData = summary.bySymbol[sym];
                    const label = sym.replace('USDT', '');
                    return (
                      <div key={sym} className="border border-border/30 bg-black/20 p-2 text-center flex flex-col gap-1">
                        <span className="text-[10px] font-mono font-bold text-primary">{label}</span>
                        <span className="text-xs font-mono font-bold text-foreground">{sData ? sData.total : 0} <span className="text-[9px] text-muted-foreground/60 font-normal">análises</span></span>
                        <span className="text-[9px] font-mono text-muted-foreground">Score Média: <strong className="text-foreground">{sData?.avgScore ?? '—'}</strong></span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}
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
  const insight = buildEngineAuditInsight(entry);
  return (
    <div className="px-4 pb-4 pt-2 bg-background/30 border-t border-border/30 space-y-4">
      <AuditInsightCard insight={insight} />

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

function AuditInsightCard({ insight }: { insight: EngineAuditInsight }) {
  const categoryColor = insight.blockCategory === 'global-risk'
    ? '#ff6b35'
    : insight.blockCategory === 'position-limit'
      ? '#ffaa00'
      : insight.blockCategory === 'operational-risk'
        ? '#ff4444'
        : '#00D8FF';
  return (
    <div className="border border-primary/25 bg-primary/[0.035] p-3 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <p className="text-[9px] font-mono uppercase tracking-[0.16em] text-primary/80">Auditor Inteligente</p>
          <p className="mt-1 text-[11px] font-mono text-foreground/80 leading-relaxed">{insight.summary}</p>
        </div>
        <div className="min-w-[150px]">
          <div className="flex items-center justify-between gap-2 text-[9px] font-mono uppercase tracking-[0.12em] text-muted-foreground/70">
            <span>Progresso do setup</span>
            <strong className="text-foreground">{insight.progressPct}%</strong>
          </div>
          <div className="mt-1 h-1.5 bg-border/50 overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${Math.max(0, Math.min(100, insight.progressPct))}%` }} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <div className="border border-border/40 bg-background/20 px-3 py-2">
          <p className="text-[8px] font-mono uppercase tracking-[0.14em] text-muted-foreground">Estagio atual</p>
          <p className="mt-1 text-[11px] font-mono font-bold" style={{ color: categoryColor }}>{insight.stageLabel}</p>
        </div>
        <div className="border border-border/40 bg-background/20 px-3 py-2 md:col-span-2">
          <p className="text-[8px] font-mono uppercase tracking-[0.14em] text-muted-foreground">Motivo decisivo</p>
          <p className="mt-1 text-[11px] font-mono text-foreground/75 leading-relaxed">{insight.decisiveReason}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <InsightList title={`Confirmado (${insight.confirmed.length})`} items={insight.confirmed} color="#00ff66" empty="Sem confirmacoes registradas." />
        <InsightList title={`Pendente (${insight.pending.length})`} items={insight.pending} color="#ffaa00" empty="Sem pendencias registradas." />
      </div>
    </div>
  );
}

function InsightList({ title, items, color, empty }: { title: string; items: string[]; color: string; empty: string }) {
  return (
    <div className="border border-border/30 bg-black/10 px-3 py-2">
      <p className="text-[8px] font-mono uppercase tracking-[0.14em]" style={{ color }}>{title}</p>
      {items.length === 0 ? (
        <p className="mt-1 text-[10px] font-mono text-muted-foreground/45">{empty}</p>
      ) : (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {items.map((item) => (
            <span key={item} className="text-[10px] font-mono px-2 py-0.5 border" style={{ color, borderColor: `${color}33`, background: `${color}0a` }}>
              {item}
            </span>
          ))}
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
  const [exporting, setExporting] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [period, setPeriod] = useState<string>('24h');
  const intervalRef = useRef<number | null>(null);

  const handlePeriodChange = useCallback((p: string) => {
    setPeriod(p);
  }, []);

  const handleExport = useCallback(async (format: 'json' | 'csv') => {
    try {
      setExporting(true);
      setError(null);
      await downloadEngineAuditExport({
        symbol: symbolFilter || undefined,
        decision: decisionFilter !== 'Todos' ? decisionFilter : undefined,
        format,
        limit: 1000,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao exportar auditoria.');
    } finally {
      setExporting(false);
    }
  }, [symbolFilter, decisionFilter]);

  const load = useCallback(async (newOffset = 0) => {
    setLoading(true);
    setError(null);
    try {
      const symbol = symbolFilter || undefined;
      const [log, sum] = await Promise.all([
        fetchEngineAuditLog({ symbol, limit: PAGE_SIZE, offset: newOffset }),
        fetchEngineAuditSummary({ symbol, period }),
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
  }, [symbolFilter, period]);


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

                {/* Refresh & Export */}
                <div className="flex gap-1.5 items-center">
                  <button
                    id="audit-refresh-btn"
                    onClick={() => void load(offset)}
                    disabled={loading}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-border/50 text-[10px] font-mono text-muted-foreground hover:text-foreground disabled:opacity-40 transition-all"
                  >
                    <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                    Atualizar
                  </button>

                  <button
                    id="audit-export-json-btn"
                    onClick={() => void handleExport('json')}
                    disabled={exporting}
                    className="flex items-center gap-1 px-2.5 py-1.5 border border-primary/40 bg-primary/10 text-[10px] font-mono text-primary hover:bg-primary/20 disabled:opacity-40 transition-all"
                    title="Exportar auditoria atual em JSON"
                  >
                    <Download className={`w-3 h-3 ${exporting ? 'animate-bounce' : ''}`} />
                    JSON
                  </button>

                  <button
                    id="audit-export-csv-btn"
                    onClick={() => void handleExport('csv')}
                    disabled={exporting}
                    className="flex items-center gap-1 px-2.5 py-1.5 border border-primary/40 bg-primary/10 text-[10px] font-mono text-primary hover:bg-primary/20 disabled:opacity-40 transition-all"
                    title="Exportar auditoria atual em CSV"
                  >
                    <Download className={`w-3 h-3 ${exporting ? 'animate-bounce' : ''}`} />
                    CSV
                  </button>
                </div>
              </div>

              {/* Summary & Intelligent Statistics */}
              <IntelligentStats summary={summary} period={period} onPeriodChange={handlePeriodChange} />


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
