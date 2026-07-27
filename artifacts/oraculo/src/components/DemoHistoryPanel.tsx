import React, { useState } from 'react';
import { CheckCircle2, XCircle, Minus, ChevronDown, ChevronUp, Clock } from 'lucide-react';
import type { DemoTrade } from '../lib/demo';
import { fmtEpochSP, fmtDuration } from '../lib/demo';

interface Props {
  history: DemoTrade[];
}

const EXIT_LABELS: Record<string, string> = {
  STOP_LOSS: 'Stop Loss',
  BREAKEVEN: 'Breakeven',
  TARGET_1:  'Alvo 1',
  TARGET_2:  'Alvo 2',
  TIME_EXIT: 'Tempo máximo',
  TRAILING_STOP: 'Trailing stop',
  LOSS_OF_STRENGTH: 'Perda de força',
  SESSION_END: 'Fim do horário',
};

const STATUS_CFG = {
  WIN:       { color: '#00ff66', label: 'GANHO',    Icon: CheckCircle2 },
  LOSS:      { color: '#ff4444', label: 'PERDA',    Icon: XCircle      },
  BREAKEVEN: { color: '#ffaa00', label: 'BREAKEVEN',Icon: Minus        },
  OPEN:      { color: '#00f0ff', label: 'ABERTA',   Icon: Clock        },
};

function isFiniteNumber(n: number | null | undefined): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function fmt(n: number | null | undefined): string {
  if (!isFiniteNumber(n)) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtCurrency(n: number | null | undefined): string {
  return isFiniteNumber(n) ? `$${fmt(n)}` : '—';
}

function fmtSigned(n: number | null | undefined): string {
  if (!isFiniteNumber(n)) return '—';
  return `${n >= 0 ? '+' : ''}${fmt(n)}`;
}

function fmtPct(n: number | null | undefined): string {
  if (!isFiniteNumber(n)) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

function fmtQuantity(n: number | null | undefined): string {
  return isFiniteNumber(n) ? n.toFixed(6) : '—';
}

export function DemoHistoryPanel({ history }: Props) {
  const [expanded, setExpanded] = useState(false);
  const displayed = expanded ? history : history.slice(0, 5);

  if (history.length === 0) {
    return (
      <div className="border border-border/40 bg-card/30 p-5">
        <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-muted-foreground/20" />
        <div className="flex items-center justify-between mb-4">
          <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
            HISTÓRICO DEMO
          </span>
        </div>
        <p className="text-xs font-mono text-muted-foreground/40 text-center py-6">
          Nenhuma operação encerrada ainda.
        </p>
      </div>
    );
  }

  return (
    <div className="border border-border/50 bg-card/30 relative overflow-hidden">
      <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-primary/30" />

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border/40">
        <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
          HISTÓRICO DEMO
        </span>
        <span className="text-[10px] font-mono text-muted-foreground/50">
          {history.length} operação{history.length !== 1 ? 'ões' : ''}
        </span>
      </div>

      {/* Rows */}
      <div className="divide-y divide-border/30">
        {displayed.map(trade => <HistoryRow key={trade.id} trade={trade} />)}
      </div>

      {/* Expand / collapse */}
      {history.length > 5 && (
        <button
          onClick={() => setExpanded(e => !e)}
          className="w-full flex items-center justify-center gap-2 py-3 text-[10px] font-mono text-muted-foreground/50 hover:text-muted-foreground border-t border-border/30 hover:bg-white/[0.02] transition-colors"
        >
          {expanded
            ? <><ChevronUp className="w-3 h-3" /> Mostrar menos</>
            : <><ChevronDown className="w-3 h-3" /> Ver {history.length - 5} mais</>
          }
        </button>
      )}
    </div>
  );
}

function HistoryRow({ trade }: { trade: DemoTrade }) {
  const [open, setOpen] = useState(false);
  const cfg    = STATUS_CFG[trade.status];
  const isBuy  = trade.direction === 'BUY';
  const pnl    = isFiniteNumber(trade.pnlUSDC) ? trade.pnlUSDC : null;
  const pnlPct = isFiniteNumber(trade.pnlPct) ? trade.pnlPct : null;
  const duration = trade.closeTime
    ? fmtDuration(trade.closeTime - trade.openTime)
    : '—';

  return (
    <div className="group">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-5 py-3 hover:bg-white/[0.02] transition-colors text-left"
      >
        {/* Status icon */}
        <cfg.Icon className="w-4 h-4 flex-shrink-0" style={{ color: cfg.color }} />

        {/* Direction badge */}
        <span
          className="text-[9px] font-mono font-bold px-1.5 py-0.5 border flex-shrink-0"
          style={{
            color: isBuy ? '#00ff66' : '#ff4444',
            borderColor: isBuy ? '#00ff6644' : '#ff444444',
            background: isBuy ? '#00ff6612' : '#ff444412',
          }}
        >
          {isBuy ? 'C' : 'V'}
        </span>

        {/* Pair + exit */}
        <div className="flex-1 min-w-0">
          <span className="text-xs font-mono text-foreground/80">{trade.pair}</span>
          {trade.exitReason && (
            <span className="text-[10px] font-mono text-muted-foreground/50 ml-2">
              · {EXIT_LABELS[trade.exitReason]}
            </span>
          )}
        </div>

        {/* P&L */}
        <span
          className="text-sm font-mono font-bold tabular-nums flex-shrink-0"
          style={{ color: pnl === null ? '#aaaaaa' : (pnl >= 0 ? '#00ff66' : '#ff4444') }}
        >
          {fmtSigned(pnl)}
        </span>

        {/* % */}
        <span
          className="text-[10px] font-mono flex-shrink-0 w-14 text-right"
          style={{ color: pnlPct === null ? '#aaaaaa' : (pnlPct >= 0 ? '#00ff6680' : '#ff444480') }}
        >
          {fmtPct(pnlPct)}
        </span>

        {/* Chevron */}
        <span className="text-muted-foreground/30 flex-shrink-0">
          {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </span>
      </button>

      {/* Detail expand */}
      {open && (
        <div className="px-5 pb-4 pt-1 border-t border-border/30 bg-background/20">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <DetailCell label="Abertura" value={fmtEpochSP(trade.openTime)} />
            <DetailCell label="Fechamento" value={trade.closeTime ? fmtEpochSP(trade.closeTime) : '—'} />
            <DetailCell label="Duração" value={duration} />
            <DetailCell label="Entrada" value={fmtCurrency(trade.entry)} />
            <DetailCell label="Saída" value={fmtCurrency(trade.closePrice)} />
            <DetailCell label="R/R" value={trade.riskReward} />
            <DetailCell label="Posição" value={fmtQuantity(trade.positionSize)} />
            <DetailCell label="Risco USDC" value={fmtCurrency(trade.riskAmount)} />
            <DetailCell
              label="Resultado"
              value={cfg.label}
              color={cfg.color}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function DetailCell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] font-mono text-muted-foreground/40 uppercase tracking-[0.15em]">{label}</span>
      <span className="text-[11px] font-mono" style={{ color: color ?? 'rgb(var(--foreground))' }}>{value}</span>
    </div>
  );
}
