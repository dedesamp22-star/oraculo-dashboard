import React from 'react';
import type { DailyStats } from '../lib/demo';

interface Props {
  stats: DailyStats;
  currentBalance: number;
  configuredBalance: number;
  realizedPnl?: number;
  unrealizedPnl?: number;
  partialPnl?: number;
  openRisk?: number;
  onReset: () => void;
  onBalanceChange: (b: number) => void;
}

function fmt(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function DemoStatsPanel({
  stats,
  currentBalance,
  configuredBalance,
  realizedPnl = 0,
  unrealizedPnl = 0,
  partialPnl = 0,
  openRisk = 0,
  onReset,
  onBalanceChange,
}: Props) {
  const winRate = stats.totalTrades > 0
    ? ((stats.wins / stats.totalTrades) * 100).toFixed(1)
    : '—';

  const pnlColor = stats.dailyPnL >= 0 ? '#00ff66' : '#ff4444';
  const balanceGain = currentBalance - configuredBalance;
  const balancePct = configuredBalance > 0 ? (balanceGain / configuredBalance) * 100 : 0;

  return (
    <div className="border border-border/50 bg-card/30 relative overflow-hidden">
      <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-primary/30" />

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border/40">
        <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
          Estatísticas Diárias
        </span>
        <span className="text-[10px] font-mono text-muted-foreground/50">
          {stats.date}
        </span>
      </div>

      <div className="p-5 flex flex-col gap-5">
        {/* Stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatCell label="Operações" value={String(stats.totalTrades)} sublabel={`máx 8`} />
          <StatCell label="Ganhos" value={String(stats.wins)} color="#00ff66" />
          <StatCell label="Perdas" value={String(stats.losses)} color="#ff4444" />
          <StatCell label="Breakeven" value={String(stats.breakevens)} color="#ffaa00" />
          <StatCell label="Win Rate" value={stats.totalTrades > 0 ? `${winRate}%` : '—'} color={parseFloat(winRate) >= 50 ? '#00ff66' : '#ff4444'} />
          <StatCell label="Perd. Consec." value={`${stats.consecutiveLosses} / 3`} color={stats.consecutiveLosses >= 2 ? '#ff4444' : '#aaaaaa'} />
          <StatCell label="P&L do Dia" value={`${stats.dailyPnL >= 0 ? '+' : ''}$${fmt(stats.dailyPnL)}`} color={pnlColor} />
          <StatCell label="Drawdown Máx." value={`$${fmt(stats.maxDrawdown)}`} color="#ffaa00" />
          <StatCell label="Realizado" value={`${realizedPnl >= 0 ? '+' : ''}$${fmt(realizedPnl)}`} color={realizedPnl >= 0 ? '#00ff66' : '#ff4444'} />
          <StatCell label="Flutuante" value={`${unrealizedPnl >= 0 ? '+' : ''}$${fmt(unrealizedPnl)}`} color={unrealizedPnl >= 0 ? '#00ff66' : '#ff4444'} />
          <StatCell label="Parcial" value={`${partialPnl >= 0 ? '+' : ''}$${fmt(partialPnl)}`} color={partialPnl >= 0 ? '#00ff66' : '#ff4444'} />
          <StatCell label="Risco Aberto" value={`$${fmt(openRisk)}`} color="#ffaa00" />
          <StatCell
            label="Saldo Demo"
            value={`$${fmt(currentBalance)}`}
            sublabel={`${balanceGain >= 0 ? '+' : ''}${balancePct.toFixed(2)}% vs inicial`}
            color={balanceGain >= 0 ? '#00ff66' : '#ff4444'}
            large
          />
        </div>

        {/* Balance config + reset */}
        <div className="border-t border-border/40 pt-4 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="text-[9px] font-mono text-muted-foreground/50 uppercase tracking-[0.15em] block mb-1.5">
                Saldo Configurado (USDC)
              </label>
              <input
                type="number"
                min={100}
                max={1_000_000}
                step={100}
                value={configuredBalance}
                onChange={e => {
                  const v = parseFloat(e.target.value);
                  if (!isNaN(v) && v >= 100) onBalanceChange(v);
                }}
                className="w-full bg-background/50 border border-border py-2 px-3 font-mono text-sm text-foreground focus:outline-none focus:border-primary/50 rounded-none appearance-none"
              />
            </div>
            <button
              onClick={onReset}
              className="flex-shrink-0 mt-5 px-4 py-2 border border-[#ff4444]/40 text-[10px] font-mono text-[#ff4444]/70 hover:text-[#ff4444] hover:border-[#ff4444] hover:bg-[#ff444412] transition-all uppercase tracking-[0.15em]"
            >
              Resetar
            </button>
          </div>
          <p className="text-[9px] font-mono text-muted-foreground/30 leading-relaxed">
            "Resetar" zera o histórico e reinicia o saldo com o valor configurado. Não afeta operações reais.
          </p>
        </div>
      </div>
    </div>
  );
}

function StatCell({
  label, value, color, sublabel, large,
}: {
  label: string;
  value: string;
  color?: string;
  sublabel?: string;
  large?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 pl-3 border-l-2 border-border/40">
      <span className="text-[9px] font-mono text-muted-foreground/50 uppercase tracking-[0.15em]">{label}</span>
      <span
        className={`font-mono font-bold tabular-nums leading-tight ${large ? 'text-lg' : 'text-sm'}`}
        style={{ color: color ?? 'rgb(var(--foreground))' }}
      >
        {value}
      </span>
      {sublabel && (
        <span className="text-[9px] font-mono text-muted-foreground/40">{sublabel}</span>
      )}
    </div>
  );
}
