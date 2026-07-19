import { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Gauge,
  RadioTower,
  ShieldAlert,
  Target,
  TrendingDown,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import type { MarketRadarAnalysis, RadarDirection } from '../lib/marketRadar';
import { RADAR_SYMBOLS } from '../hooks/useMarketRadar';
import type { RadarSymbol } from '../lib/marketRadar';

function fmtPrice(value: number | null): string {
  if (value === null || !Number.isFinite(value) || value < 0) return '-';
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtRatio(value: number | null): string {
  return value === null || !Number.isFinite(value) || value < 0 ? '-' : `1:${value.toFixed(2)}`;
}

function fmtTime(value: string | null): string {
  if (!value) return '-';
  return new Date(value).toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function directionConfig(direction: RadarDirection) {
  if (direction === 'COMPRA') return { color: '#00ff66', bg: '#00ff660c', border: '#00ff6644', icon: TrendingUp };
  if (direction === 'VENDA') return { color: '#ff4444', bg: '#ff44440c', border: '#ff444444', icon: TrendingDown };
  return { color: '#ffaa00', bg: '#ffaa000c', border: '#ffaa0044', icon: AlertTriangle };
}

function trendColor(value: string): string {
  if (value === 'ALTA' || value === 'COMPRA') return '#00ff66';
  if (value === 'BAIXA' || value === 'VENDA') return '#ff4444';
  return '#ffaa00';
}

function mainReason(analysis: MarketRadarAnalysis): string {
  return analysis.blockedReasons[0]
    ?? analysis.confirmations[0]
    ?? analysis.risks[0]
    ?? 'Aguardando setup confirmado.';
}

function primaryEntry(analysis: MarketRadarAnalysis): number | null {
  return analysis.conservativeEntry ?? analysis.aggressiveEntry;
}

function shortSymbol(symbol: RadarSymbol): string {
  return symbol.replace('USDT', '');
}

function MiniMetric({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[8px] font-mono uppercase tracking-[0.14em] text-muted-foreground truncate">{label}</p>
      <p className="mt-0.5 text-xs font-mono font-bold tabular-nums truncate" style={{ color: color ?? 'var(--color-foreground)' }}>
        {value}
      </p>
    </div>
  );
}

function DetailMetric({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="border border-border/40 bg-background/20 p-2 min-w-0">
      <p className="text-[8px] font-mono uppercase tracking-[0.14em] text-muted-foreground truncate">{label}</p>
      <p className="mt-1 text-xs font-mono font-bold tabular-nums truncate" style={{ color: color ?? 'var(--color-foreground)' }}>
        {value}
      </p>
    </div>
  );
}

function SymbolSelector({
  selectedSymbol,
  onSymbolChange,
  color,
  bg,
}: {
  selectedSymbol: RadarSymbol;
  onSymbolChange: (symbol: RadarSymbol) => void;
  color: string;
  bg: string;
}) {
  return (
    <div className="flex items-center gap-1 border border-border/50 bg-background/30 p-0.5">
      {RADAR_SYMBOLS.map((symbol) => (
        <button
          key={symbol}
          type="button"
          onClick={() => onSymbolChange(symbol)}
          className="px-2.5 py-1 text-[10px] font-mono font-bold uppercase tracking-[0.12em] transition-colors"
          style={symbol === selectedSymbol
            ? { background: bg, color }
            : { color: 'var(--color-muted-foreground)' }}
        >
          {shortSymbol(symbol)}
        </button>
      ))}
    </div>
  );
}

function MarketRadarSummary({
  analysis,
  loading,
  lastUpdate,
  selectedSymbol,
  onSymbolChange,
}: {
  analysis: MarketRadarAnalysis;
  loading: boolean;
  lastUpdate: Date | null;
  selectedSymbol: RadarSymbol;
  onSymbolChange: (symbol: RadarSymbol) => void;
}) {
  const cfg = directionConfig(analysis.suggestedDirection);
  const DirectionIcon = cfg.icon;

  return (
    <div className="p-4 flex flex-col gap-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <RadioTower className="w-4 h-4 text-primary flex-shrink-0" />
            <div className="min-w-0">
              <h2 className="text-xs font-mono font-bold uppercase tracking-[0.2em] truncate">Radar do Mercado</h2>
              <p className="text-[9px] font-mono uppercase tracking-[0.14em] text-muted-foreground truncate">
                {analysis.symbol} · 1h / 15m / 5m
              </p>
            </div>
          </div>
          <SymbolSelector selectedSymbol={selectedSymbol} onSymbolChange={onSymbolChange} color={cfg.color} bg={cfg.bg} />
        </div>
        <div className="flex items-center gap-1.5 text-[9px] font-mono text-muted-foreground">
          <Clock className="w-3 h-3" />
          <span>{loading ? 'Atualizando...' : fmtTime(lastUpdate?.toISOString() ?? analysis.generatedAt)}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_1.35fr] gap-3 items-stretch">
        <div className="border p-3 flex items-center justify-between gap-3" style={{ borderColor: cfg.border, background: cfg.bg }}>
          <div className="flex items-center gap-3 min-w-0">
            <DirectionIcon className="w-6 h-6 flex-shrink-0" style={{ color: cfg.color }} />
            <div className="min-w-0">
              <p className="text-[8px] font-mono uppercase tracking-[0.16em] text-muted-foreground">Direcao</p>
              <p className="text-2xl font-mono font-bold leading-none truncate" style={{ color: cfg.color }}>
                {analysis.suggestedDirection}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-right flex-shrink-0">
            <Gauge className="w-4 h-4" style={{ color: cfg.color }} />
            <div>
              <p className="text-[8px] font-mono uppercase tracking-[0.16em] text-muted-foreground">Indice</p>
              <p className="text-3xl font-mono font-bold leading-none tabular-nums" style={{ color: cfg.color }}>
                {analysis.score}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 border border-border/40 bg-background/20 p-3">
          <MiniMetric label="Preco atual" value={fmtPrice(analysis.displayPrice)} />
          <MiniMetric label="Tendencia 1h" value={analysis.trend1h} color={trendColor(analysis.trend1h)} />
          <MiniMetric label="Tendencia 15m" value={analysis.trend15m} color={trendColor(analysis.trend15m)} />
          <MiniMetric label="Gatilho 5m" value={analysis.trigger5m} color={trendColor(analysis.trigger5m)} />
          <MiniMetric label="Entrada" value={fmtPrice(primaryEntry(analysis))} color="#00f0ff" />
          <MiniMetric label="Stop" value={fmtPrice(analysis.stop)} color="#ff6666" />
          <MiniMetric label="Alvo 1" value={fmtPrice(analysis.target1)} color="#00ff66" />
          <MiniMetric label="R/R" value={fmtRatio(analysis.rr)} color={analysis.rr !== null && analysis.rr >= 2 ? '#00ff66' : '#ffaa00'} />
        </div>
      </div>

      <div className="border-l-2 px-3 py-2 bg-background/20" style={{ borderColor: cfg.color }}>
        <p className="text-[8px] font-mono uppercase tracking-[0.16em] text-muted-foreground">Principal motivo</p>
        <p className="text-xs font-mono text-foreground/80 leading-relaxed">{mainReason(analysis)}</p>
      </div>
    </div>
  );
}

function MarketRadarDetails({ analysis }: { analysis: MarketRadarAnalysis }) {
  return (
    <div className="border-t border-border/50 p-4 flex flex-col gap-4">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
        <DetailMetric label="Preco decisao" value={fmtPrice(analysis.decisionPrice)} />
        <DetailMetric label="Suporte" value={fmtPrice(analysis.support)} />
        <DetailMetric label="Resistencia" value={fmtPrice(analysis.resistance)} />
        <DetailMetric label="Entrada agressiva" value={fmtPrice(analysis.aggressiveEntry)} color="#00f0ff" />
        <DetailMetric label="Entrada conservadora" value={fmtPrice(analysis.conservativeEntry)} color="#00f0ff" />
        <DetailMetric label="Alvo 2" value={fmtPrice(analysis.target2)} color="#00cc55" />
        <DetailMetric label="Volume atual" value={analysis.volume ? analysis.volume.current.toFixed(0) : '-'} />
        <DetailMetric label="Media 20" value={analysis.volume ? analysis.volume.average20.toFixed(0) : '-'} />
        <DetailMetric label="Volume relativo" value={analysis.volume ? `${(analysis.volume.relative * 100).toFixed(0)}%` : '-'} />
        <DetailMetric label="Delta 5 velas" value={analysis.volume ? `${(analysis.volume.delta5 * 100).toFixed(1)}%` : '-'} color={analysis.volume?.expanding ? '#00ff66' : '#ffaa00'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="border border-border/40 bg-background/20 p-3">
          <p className="text-[9px] font-mono uppercase tracking-[0.16em] text-muted-foreground mb-2">Checklist operacional</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {analysis.checklist.map((item) => (
              <div key={item.key} className="flex items-start gap-2 text-xs font-mono">
                {item.passed
                  ? <CheckCircle2 className="w-3.5 h-3.5 text-[#00ff66] flex-shrink-0 mt-0.5" />
                  : <XCircle className="w-3.5 h-3.5 text-[#ff4444] flex-shrink-0 mt-0.5" />
                }
                <div className="min-w-0">
                  <p className="uppercase tracking-[0.1em] text-foreground/80">{item.label}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{item.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="border border-border/40 bg-background/20 p-3">
          <p className="text-[9px] font-mono uppercase tracking-[0.16em] text-muted-foreground mb-2">Pontuacao auditavel</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {analysis.scoreItems.map((item, index) => (
              <div key={`${item.label}-${index}`} className="flex items-start gap-2 text-xs font-mono">
                <span className={item.points >= 0 ? 'text-[#00ff66]' : 'text-[#ff4444]'}>
                  {item.points >= 0 ? `+${item.points}` : item.points}
                </span>
                <div className="min-w-0">
                  <p className="uppercase tracking-[0.1em] text-foreground/80 truncate">{item.label.replace(/^[+-]?\d+\s*/, '')}</p>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">{item.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="border border-[#00ff66]/25 bg-[#00ff66]/[0.04] p-3">
          <p className="text-[9px] font-mono uppercase tracking-[0.16em] text-[#00ff66]/80 mb-2 flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5" /> Confirmacoes
          </p>
          <ul className="space-y-1.5">
            {analysis.confirmations.map((item) => <li key={item} className="text-xs font-mono text-foreground/70">{item}</li>)}
          </ul>
        </div>
        <div className="border border-[#ffaa00]/25 bg-[#ffaa00]/[0.04] p-3">
          <p className="text-[9px] font-mono uppercase tracking-[0.16em] text-[#ffaa00]/80 mb-2 flex items-center gap-2">
            <ShieldAlert className="w-3.5 h-3.5" /> Riscos e bloqueios
          </p>
          <ul className="space-y-1.5">
            {[...analysis.blockedReasons, ...analysis.risks].slice(0, 6).map((item) => <li key={item} className="text-xs font-mono text-foreground/70">{item}</li>)}
          </ul>
        </div>
      </div>

      <div className="border border-[#ffaa00]/20 bg-[#ffaa00]/[0.03] p-3 flex items-start gap-2">
        <Target className="w-4 h-4 text-[#ffaa00] flex-shrink-0 mt-0.5" />
        <p className="text-[11px] font-mono text-foreground/60 leading-relaxed">
          Nenhuma operacao possui garantia. Gerenciamento de risco obrigatorio.
        </p>
      </div>
    </div>
  );
}

export function MarketRadarPanel({
  analysis,
  loading,
  error,
  lastUpdate,
  symbol,
  onSymbolChange,
}: {
  analysis: MarketRadarAnalysis | null;
  loading: boolean;
  error: string | null;
  lastUpdate: Date | null;
  symbol: RadarSymbol;
  onSymbolChange: (symbol: RadarSymbol) => void;
}) {
  const [open, setOpen] = useState(false);
  const cfg = directionConfig(analysis?.suggestedDirection ?? 'AGUARDAR');

  return (
    <section className="bg-card/50 backdrop-blur-md border border-border relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

      {error && (
        <div className="m-4 mb-0 border border-[#ff4444]/30 bg-[#ff4444]/10 p-2 text-xs font-mono text-[#ff8888] flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span className="min-w-0 whitespace-normal break-all">Erro no Radar: {error}</span>
        </div>
      )}

      {!analysis ? (
        <div className="p-4 flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <RadioTower className="w-4 h-4 text-primary flex-shrink-0" />
              <div className="min-w-0">
                <h2 className="text-xs font-mono font-bold uppercase tracking-[0.2em] truncate">Radar do Mercado</h2>
                <p className="text-[9px] font-mono uppercase tracking-[0.14em] text-muted-foreground truncate">
                  {symbol} · 1h / 15m / 5m
                </p>
              </div>
            </div>
            <SymbolSelector selectedSymbol={symbol} onSymbolChange={onSymbolChange} color={cfg.color} bg={cfg.bg} />
          </div>
          <div className="flex items-center justify-center gap-3 py-3 text-xs font-mono text-muted-foreground">
            <RadioTower className="w-4 h-4 animate-pulse text-primary" />
            <span>{loading ? `Carregando ${symbol}...` : 'Radar indisponivel.'}</span>
          </div>
        </div>
      ) : (
        <>
          <MarketRadarSummary
            analysis={analysis}
            loading={loading}
            lastUpdate={lastUpdate}
            selectedSymbol={symbol}
            onSymbolChange={onSymbolChange}
          />

          <div className="px-4 pb-4">
            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              className="w-full border border-border/60 bg-background/30 px-3 py-2 text-left flex items-center gap-2 hover:bg-white/[0.03] transition-colors"
              style={{ borderColor: open ? cfg.border : undefined }}
            >
              <span className="flex-1 text-[10px] font-mono uppercase tracking-[0.18em]">
                {open ? 'Ocultar analise completa' : 'Ver analise completa'}
              </span>
              {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </button>
          </div>

          {open && <MarketRadarDetails analysis={analysis} />}
        </>
      )}
    </section>
  );
}
