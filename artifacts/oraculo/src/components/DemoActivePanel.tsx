import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Crosshair, ShieldAlert, Target, Clock, DollarSign, BarChart2 } from 'lucide-react';
import type { DemoTrade } from '../lib/demo';
import { fmtDuration } from '../lib/demo';

interface Props {
  trade: DemoTrade;
  currentPrice: number | null;
}

function fmt(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtSign(n: number): string {
  const s = fmt(Math.abs(n));
  return `${n >= 0 ? '+' : '-'}$${s}`;
}

export function DemoActivePanel({ trade, currentPrice }: Props) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);

  const isBuy = trade.direction === 'BUY';
  const accent = isBuy ? '#00ff66' : '#ff4444';
  const dirLabel = isBuy ? 'COMPRA' : 'VENDA';
  const DirIcon  = isBuy ? TrendingUp : TrendingDown;

  // Unrealized P&L
  const unrealized = currentPrice !== null
    ? (isBuy
        ? (currentPrice - trade.entry) * trade.positionSize
        : (trade.entry - currentPrice) * trade.positionSize)
    : null;
  const unrealizedPct = unrealized !== null ? (unrealized / trade.balanceAtOpen) * 100 : null;

  const duration = fmtDuration(now - trade.openTime);

  const stopIsBreakeven = trade.isBreakevenStop;

  return (
    <div className="border relative overflow-hidden" style={{ borderColor: `${accent}44`, background: `${accent}08` }}>
      <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: accent, boxShadow: `0 0 12px ${accent}` }} />
      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent to-transparent"
        style={{ background: `linear-gradient(to right, transparent, ${accent}44, transparent)` }} />

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: `${accent}25` }}>
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center">
            <div className="absolute w-2.5 h-2.5 rounded-full animate-ping" style={{ background: `${accent}44` }} />
            <div className="relative w-2 h-2 rounded-full" style={{ background: accent }} />
          </div>
          <span className="text-[10px] font-mono uppercase tracking-[0.25em]" style={{ color: accent }}>
            OPERAÇÃO DEMO ATIVA
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-mono text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3" />{duration}
          </span>
          <span className="text-[10px] font-mono font-bold px-2 py-0.5 border"
            style={{ color: accent, borderColor: `${accent}44`, background: `${accent}14` }}>
            <DirIcon className="w-3 h-3 inline mr-1" />{dirLabel}
          </span>
        </div>
      </div>

      <div className="p-5 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
        {/* Pair */}
        <Cell label="Par" value={trade.pair} accent="#aaaaaa" />

        {/* Entry */}
        <Cell label="Entrada" value={`$${fmt(trade.entry)}`} accent="#00f0ff" icon={<Crosshair className="w-3 h-3" />} />

        {/* Current price */}
        <Cell
          label="Preço Atual"
          value={currentPrice !== null ? `$${fmt(currentPrice)}` : '—'}
          accent={unrealized !== null
            ? (unrealized >= 0 ? '#00ff66' : '#ff4444')
            : '#aaaaaa'}
        />

        {/* Stop */}
        <Cell
          label={stopIsBreakeven ? 'Stop (Breakeven)' : 'Stop Loss'}
          value={`$${fmt(trade.stopLoss)}`}
          accent={stopIsBreakeven ? '#00ff66' : '#ff4444'}
          icon={<ShieldAlert className="w-3 h-3" />}
          note={stopIsBreakeven ? 'movido para entrada' : undefined}
        />

        {/* Target 1 */}
        <Cell
          label="Alvo 1"
          value={`$${fmt(trade.target1)}`}
          accent={trade.target1Hit ? '#00ff66' : '#00cc55'}
          icon={<Target className="w-3 h-3" />}
          note={trade.target1Hit ? 'atingido ✓' : undefined}
        />

        {/* Target 2 */}
        <Cell label="Alvo 2" value={`$${fmt(trade.target2)}`} accent="#00aa44" icon={<Target className="w-3 h-3" />} />

        {/* Position size */}
        <Cell
          label="Tamanho da Posição"
          value={`${trade.positionSize.toFixed(6)} ${trade.pair.replace('USDT','').replace('USDC','')}`}
          accent="#cccccc"
          icon={<BarChart2 className="w-3 h-3" />}
        />

        {/* Risk amount */}
        <Cell
          label="Valor em Risco"
          value={`$${fmt(trade.riskAmount)}`}
          accent="#ffaa00"
          icon={<DollarSign className="w-3 h-3" />}
          note="1% do saldo"
        />

        {/* Unrealized P&L */}
        <Cell
          label="P&L Não Realizado"
          value={unrealized !== null
            ? `${fmtSign(unrealized)} (${unrealized >= 0 ? '+' : ''}${unrealizedPct!.toFixed(2)}%)`
            : '—'}
          accent={unrealized !== null
            ? (unrealized >= 0 ? '#00ff66' : '#ff4444')
            : '#aaaaaa'}
          large
        />
      </div>
    </div>
  );
}

function Cell({
  label, value, accent, icon, note, large,
}: {
  label: string;
  value: string;
  accent: string;
  icon?: React.ReactNode;
  note?: string;
  large?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 pl-3 border-l-2" style={{ borderColor: `${accent}44` }}>
      <span className="text-[9px] font-mono uppercase tracking-[0.18em] flex items-center gap-1"
        style={{ color: `${accent}80` }}>
        {icon}{label}
      </span>
      <span className={`font-mono font-bold leading-tight tabular-nums ${large ? 'text-base' : 'text-sm'}`}
        style={{ color: accent }}>
        {value}
      </span>
      {note && (
        <span className="text-[9px] font-mono" style={{ color: `${accent}60` }}>{note}</span>
      )}
    </div>
  );
}
