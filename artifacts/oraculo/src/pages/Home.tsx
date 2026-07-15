import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity, ArrowUpRight, ArrowDownRight, Crosshair, ShieldAlert,
  Target, Zap, CheckCircle2, XCircle, Clock, AlertTriangle,
  RefreshCw, TrendingUp, TrendingDown, Bell, BellOff,
  CalendarOff, Timer, BarChart2,
} from 'lucide-react';
import { useBinanceData }    from '../hooks/useBinanceData';
import { useAutoAnalysis }   from '../hooks/useAutoAnalysis';
import { runEngine, type EngineResult, type RuleStep, type StepStatus, type Decision } from '../lib/analysis';
import { fmtTimeSP, fmtSPNow, isOperational as checkOperational } from '../lib/schedule';
import { TradingViewChart, type TVInterval } from '../components/TradingViewChart';

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtPrice(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Alert toast ───────────────────────────────────────────────────────────────

interface AlertMsg {
  id: number;
  kind: 'buy' | 'sell' | 'invalidated';
  title: string;
  body: string;
}

function AlertToast({ msg, onDismiss }: { msg: AlertMsg; onDismiss: () => void }) {
  useEffect(() => {
    const id = setTimeout(onDismiss, 8_000);
    return () => clearTimeout(id);
  }, [onDismiss]);

  const cfg = {
    buy:        { color: '#00ff66', border: '#00ff6655', bg: '#00ff6612', icon: <TrendingUp  className="w-5 h-5" /> },
    sell:       { color: '#ff4444', border: '#ff444455', bg: '#ff444412', icon: <TrendingDown className="w-5 h-5" /> },
    invalidated:{ color: '#ffaa00', border: '#ffaa0055', bg: '#ffaa0012', icon: <AlertTriangle className="w-5 h-5" /> },
  }[msg.kind];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0,   scale: 1      }}
      exit={{    opacity: 0, y: -12, scale: 0.96    }}
      transition={{ duration: 0.25 }}
      className="flex items-start gap-3 p-4 border font-mono cursor-pointer shadow-2xl max-w-sm w-full"
      style={{ background: cfg.bg, borderColor: cfg.border }}
      onClick={onDismiss}
    >
      <span style={{ color: cfg.color }} className="mt-0.5 flex-shrink-0">{cfg.icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs uppercase tracking-[0.15em] font-bold" style={{ color: cfg.color }}>{msg.title}</p>
        <p className="text-[11px] text-foreground/60 mt-0.5 leading-relaxed">{msg.body}</p>
      </div>
      <button className="text-muted-foreground/40 hover:text-muted-foreground text-xs flex-shrink-0 mt-0.5">✕</button>
    </motion.div>
  );
}

// ── Step row ─────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<StepStatus, string> = {
  PASS: '#00ff66',
  FAIL: '#ff4444',
  INFO: '#ffaa00',
};

function StepRow({ step, index }: { step: RuleStep; index: number }) {
  const [open, setOpen] = useState(false);
  const color = STATUS_COLORS[step.status];
  const isFinal = step.number === 7;

  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.06, duration: 0.28 }}
      className={`border border-border/50 relative overflow-hidden ${isFinal ? 'border-primary/30' : ''}`}
    >
      <div className="absolute left-0 top-0 bottom-0 w-[2px]" style={{ background: color }} />
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-4 px-5 py-3 text-left hover:bg-white/[0.02] transition-colors"
      >
        <span className="text-[10px] font-mono text-muted-foreground w-4 flex-shrink-0 select-none">
          {step.number < 7 ? `0${step.number}` : '→'}
        </span>
        {step.status === 'PASS'
          ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color }} />
          : <XCircle      className="w-4 h-4 flex-shrink-0" style={{ color }} />
        }
        <span className={`text-xs font-mono uppercase tracking-[0.15em] flex-1 ${isFinal ? 'text-foreground' : 'text-muted-foreground'}`}>
          {step.name}
        </span>
        <span
          className="text-xs font-mono font-bold px-2 py-0.5 border ml-auto flex-shrink-0"
          style={{ color, borderColor: `${color}44`, background: `${color}12` }}
        >
          {step.value}
        </span>
        <span className="text-muted-foreground/40 text-xs ml-2 flex-shrink-0 select-none">{open ? '▲' : '▼'}</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{    height: 0, opacity: 0    }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <p className="text-xs font-mono text-foreground/60 leading-relaxed px-5 pb-4 pt-1 border-t border-border/40">
              <span style={{ color: `${color}88` }} className="mr-2">{'>'}</span>
              {step.reason}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Position card block ───────────────────────────────────────────────────────

function PriceBlock({ label, value, accent, icon }: {
  label: string; value: string; accent: string; icon: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 pl-4 border-l-2" style={{ borderColor: `${accent}66` }}>
      <span className="text-[10px] font-mono uppercase tracking-[0.2em] flex items-center gap-1" style={{ color: `${accent}99` }}>
        {icon}{label}
      </span>
      <span className="text-2xl font-mono font-bold" style={{ color: accent, textShadow: `0 0 10px ${accent}33` }}>
        {value}
      </span>
    </div>
  );
}

// ── Decision banner ───────────────────────────────────────────────────────────

function DecisionBanner({ decision }: { decision: Decision }) {
  const cfg = {
    BUY:        { color: '#00ff66', bg: '#00ff6614', border: '#00ff6644', icon: <TrendingUp  className="w-6 h-6" />, label: 'COMPRA'   },
    SELL:       { color: '#ff4444', bg: '#ff444414', border: '#ff444444', icon: <TrendingDown className="w-6 h-6" />, label: 'VENDA'    },
    'NO TRADE': { color: '#ffaa00', bg: '#ffaa0014', border: '#ffaa0044', icon: <XCircle      className="w-6 h-6" />, label: 'SEM ENTRADA' },
  }[decision];

  return (
    <div className="flex items-center justify-between p-5 border relative overflow-hidden"
      style={{ background: cfg.bg, borderColor: cfg.border }}>
      <div className="absolute left-0 top-0 bottom-0 w-1"
        style={{ background: cfg.color, boxShadow: `0 0 16px ${cfg.color}` }} />
      <div className="flex items-center gap-4 pl-2">
        <span style={{ color: cfg.color }}>{cfg.icon}</span>
        <div>
          <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-[0.2em]">Decisão do Motor</p>
          <p className="text-3xl font-mono font-bold"
            style={{ color: cfg.color, textShadow: `0 0 20px ${cfg.color}66` }}>
            {cfg.label}
          </p>
        </div>
      </div>
      <div className="text-right hidden sm:block">
        <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-[0.15em]">
          {decision === 'NO TRADE' ? 'Regras não satisfeitas' : 'Todas as regras aprovadas'}
        </p>
        <p className="text-xs font-mono" style={{ color: cfg.color }}>
          {decision === 'NO TRADE' ? 'Aguardar setup completo' : 'Operar com gestão de risco'}
        </p>
      </div>
    </div>
  );
}

// ── Toggle switch ─────────────────────────────────────────────────────────────

function Toggle({ checked, onChange, disabled }: {
  checked: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full border-2 transition-all duration-300 focus:outline-none
        ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
        ${checked
          ? 'bg-primary/20 border-primary'
          : 'bg-background border-border'
        }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full transition-transform duration-300
          ${checked ? 'translate-x-5 bg-primary shadow-[0_0_8px_var(--color-primary)]' : 'translate-x-0.5 bg-muted-foreground/40'}`}
      />
    </button>
  );
}

// ── Market status badge ───────────────────────────────────────────────────────

function MarketStatusBadge({ decision }: { decision: Decision | null }) {
  if (!decision) return (
    <span className="text-xs font-mono text-muted-foreground/50 uppercase tracking-[0.15em]">—</span>
  );
  const cfg = {
    BUY:        { color: '#00ff66', label: 'COMPRA'      },
    SELL:       { color: '#ff4444', label: 'VENDA'       },
    'NO TRADE': { color: '#ffaa00', label: 'SEM ENTRADA' },
  }[decision];
  return (
    <span className="text-sm font-mono font-bold uppercase tracking-[0.1em]"
      style={{ color: cfg.color, textShadow: `0 0 8px ${cfg.color}44` }}>
      {cfg.label}
    </span>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

let alertIdCounter = 0;

export default function Home() {
  const market = useBinanceData();

  // Chart controls
  const [selectedPair, setSelectedPair] = useState<'BTCUSDT'>('BTCUSDT');
  const [tvInterval,   setTvInterval]   = useState<TVInterval>('5');

  // Derived TV symbol
  const tvSymbol = `BINANCE:${selectedPair}`;

  // Manual analysis
  const [analyzing,    setAnalyzing]    = useState(false);
  const [result,       setResult]       = useState<EngineResult | null>(null);
  const [resultTime,   setResultTime]   = useState<Date | null>(null);

  // Auto mode
  const [autoEnabled,  setAutoEnabled]  = useState(false);

  // Alerts
  const [alerts,       setAlerts]       = useState<AlertMsg[]>([]);
  const prevDecisionRef = useRef<Decision | null>(null);

  // SP clock display (refreshes every second regardless of auto mode)
  const [spClock, setSpClock] = useState(fmtSPNow);
  const [isOp,    setIsOp]    = useState(checkOperational);
  useEffect(() => {
    const id = setInterval(() => {
      setSpClock(fmtSPNow());
      setIsOp(checkOperational());
    }, 1_000);
    return () => clearInterval(id);
  }, []);

  // ── Alert emission ────────────────────────────────────────────────────────

  const pushAlert = useCallback((msg: Omit<AlertMsg, 'id'>) => {
    const id = ++alertIdCounter;
    setAlerts(prev => [...prev, { ...msg, id }]);
  }, []);

  const dismissAlert = useCallback((id: number) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  }, []);

  // ── Result handler (shared by manual + auto) ──────────────────────────────

  const handleResult = useCallback((res: EngineResult, triggeredAt?: Date) => {
    setResult(res);
    setResultTime(triggeredAt ?? new Date());

    const prev = prevDecisionRef.current;
    const curr = res.decision;

    if (prev !== null && prev !== curr) {
      if (prev === 'NO TRADE' && curr === 'BUY') {
        pushAlert({
          kind: 'buy',
          title: 'Sinal de Compra Detectado',
          body: 'O motor identificou um setup de COMPRA. Verifique os níveis e aplique gestão de risco.',
        });
      } else if (prev === 'NO TRADE' && curr === 'SELL') {
        pushAlert({
          kind: 'sell',
          title: 'Sinal de Venda Detectado',
          body: 'O motor identificou um setup de VENDA. Verifique os níveis e aplique gestão de risco.',
        });
      } else if ((prev === 'BUY' || prev === 'SELL') && curr === 'NO TRADE') {
        const prevLabel = prev === 'BUY' ? 'COMPRA' : 'VENDA';
        pushAlert({
          kind: 'invalidated',
          title: `Setup de ${prevLabel} Invalidado`,
          body: 'As condições do setup anterior deixaram de ser satisfeitas. Sinal cancelado.',
        });
      }
    }
    prevDecisionRef.current = curr;
  }, [pushAlert]);

  // ── Auto-analysis hook ────────────────────────────────────────────────────

  const autoState = useAutoAnalysis({
    enabled:    autoEnabled,
    candles1h:  market.candles1h,
    candles15m: market.candles15m,
    candles5m:  market.candles5m,
    price:      market.price,
    onResult:   handleResult,
  });

  // ── Manual analysis ───────────────────────────────────────────────────────

  const canAnalyze =
    !analyzing &&
    !market.loading &&
    !market.error &&
    market.price !== null &&
    market.candles1h.length > 20;

  const handleManualAnalyze = () => {
    if (!canAnalyze) return;
    setAnalyzing(true);
    setResult(null);
    setTimeout(() => {
      const res = runEngine(
        market.candles1h,
        market.candles15m,
        market.candles5m,
        market.price!,
      );
      handleResult(res);
      setAnalyzing(false);
    }, 900);
  };

  // ── Auto toggle ───────────────────────────────────────────────────────────

  const handleAutoToggle = (v: boolean) => {
    setAutoEnabled(v);
    if (!v) {
      // Clear auto result state when turning off so stale signals don't linger
      // but keep the last result visible
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen w-full bg-background text-foreground font-sans selection:bg-primary/30 flex flex-col items-center p-4 sm:p-8 relative overflow-hidden">

      {/* Ambient glows */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />

      {/* ── Alert toasts (top-right) ─────────────────────────────────────── */}
      <div className="fixed top-6 right-6 z-[100] flex flex-col gap-2 items-end pointer-events-none">
        <AnimatePresence mode="popLayout">
          {alerts.map(msg => (
            <div key={msg.id} className="pointer-events-auto">
              <AlertToast msg={msg} onDismiss={() => dismissAlert(msg.id)} />
            </div>
          ))}
        </AnimatePresence>
      </div>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="w-full max-w-4xl flex items-center justify-between mb-8 border-b border-border pb-6 pt-4 relative z-10">
        <div className="flex items-center gap-4">
          <div className="relative flex items-center justify-center w-10 h-10">
            <div className="absolute inset-0 bg-primary/20 rounded-sm animate-pulse" />
            <div className="relative w-4 h-4 bg-primary shadow-[0_0_15px_var(--color-primary)] rotate-45" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-mono font-bold tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-white to-white/70">
            ORÁCULO<span className="text-primary ml-2">0.1</span>
          </h1>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-xs font-mono text-primary bg-primary/10 px-4 py-2 border-l-2 border-primary">
          <Activity className="w-4 h-4" />
          <span className="tracking-widest">SYSTEM ONLINE</span>
        </div>
      </header>

      <main className="w-full max-w-4xl flex flex-col gap-5 relative z-10">

        {/* ── Live price ──────────────────────────────────────────────────── */}
        <section className="bg-card/50 backdrop-blur-md border border-border p-5 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
          {market.error ? (
            <div className="flex items-center gap-3 text-destructive font-mono text-sm">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              <span>Falha ao conectar com Binance: {market.error}</span>
            </div>
          ) : market.loading ? (
            <div className="flex items-center gap-3 text-muted-foreground font-mono text-sm">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span className="tracking-widest text-xs uppercase">Conectando à Binance...</span>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-end gap-4 justify-between">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground">
                  BTC / USDT · Preço Atual
                </span>
                <AnimatePresence mode="wait">
                  <motion.span
                    key={market.price?.toFixed(2)}
                    initial={{ opacity: 0.4, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25 }}
                    className="text-4xl sm:text-5xl font-mono font-bold text-white drop-shadow-[0_0_12px_rgba(255,255,255,0.15)]"
                  >
                    ${fmtPrice(market.price!)}
                  </motion.span>
                </AnimatePresence>
              </div>
              {market.lastUpdate && (
                <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground bg-background/40 border border-border/50 px-4 py-2">
                  <Clock className="w-3.5 h-3.5 text-primary/70" />
                  <span className="tracking-widest">
                    {market.lastUpdate.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit' })} (SP)
                  </span>
                  <span className="text-primary/50 ml-1">· 30s</span>
                </div>
              )}
            </div>
          )}
        </section>

        {/* ── Controls: manual button + auto toggle ───────────────────────── */}
        <section className="bg-card/50 backdrop-blur-md border border-border p-6 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-primary/50 to-transparent" />

          <div className="flex flex-col gap-5">
            {/* Row 1: pair selector + manual button */}
            <div className="flex flex-col sm:flex-row gap-5 items-end">
              <div className="flex-1 w-full space-y-2.5">
                <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-[0.2em]">
                  Selecionar Par
                </label>
                <div className="relative">
                  <select
                    value={selectedPair}
                    onChange={e => setSelectedPair(e.target.value as 'BTCUSDT')}
                    className="w-full bg-background/50 border border-border py-4 px-5 appearance-none font-mono text-xl focus:outline-none focus:border-primary/50 transition-all cursor-pointer rounded-none"
                    disabled={analyzing || market.loading}
                  >
                    <option value="BTCUSDT">BTC / USDT</option>
                  </select>
                  <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-primary text-sm">▼</div>
                </div>
              </div>

              <button
                onClick={handleManualAnalyze}
                disabled={!canAnalyze}
                className={`relative flex-1 sm:flex-none sm:w-60 w-full overflow-hidden rounded-none font-mono font-bold text-base tracking-[0.12em] transition-all duration-300 h-[60px]
                  ${!canAnalyze
                    ? 'bg-primary/10 text-primary/40 border border-primary/15 cursor-not-allowed'
                    : analyzing
                    ? 'bg-primary/10 text-primary border border-primary/30 cursor-wait'
                    : 'bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-[0_0_28px_rgba(0,240,255,0.35)] border border-primary cursor-pointer'
                  }`}
              >
                <div className="absolute inset-0 flex items-center justify-center gap-3">
                  {market.loading
                    ? <><RefreshCw className="w-4 h-4 animate-spin" /><span>CARREGANDO...</span></>
                    : analyzing
                    ? <><Activity className="w-4 h-4 animate-pulse" /><span>ANALISANDO...</span></>
                    : <><Zap className="w-4 h-4" /><span>ANALISAR AGORA</span></>
                  }
                </div>
              </button>
            </div>

            {/* Row 2: auto toggle */}
            <div className="flex items-center justify-between border border-border/50 bg-background/30 px-5 py-4 relative">
              <div className="absolute left-0 top-0 bottom-0 w-[2px]"
                style={{ background: autoEnabled ? 'var(--color-primary)' : '#ffffff22' }} />
              <div className="flex flex-col gap-0.5 pl-2">
                <span className="text-[11px] font-mono uppercase tracking-[0.2em] text-foreground/80">
                  Análise Automática
                </span>
                <span className={`text-[10px] font-mono uppercase tracking-[0.15em] ${autoEnabled ? 'text-primary' : 'text-muted-foreground/50'}`}>
                  {autoEnabled ? '● AUTOMÁTICO ATIVO' : '○ AUTOMÁTICO DESATIVADO'}
                </span>
              </div>
              <Toggle
                checked={autoEnabled}
                onChange={handleAutoToggle}
                disabled={market.loading || !!market.error}
              />
            </div>
          </div>
        </section>

        {/* ── Auto-mode status panel ───────────────────────────────────────── */}
        <AnimatePresence>
          {autoEnabled && (
            <motion.section
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{    opacity: 0, height: 0    }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              {/* Operational hours guard */}
              {!autoState.isOperational ? (
                <div className="bg-card/40 border border-border/50 p-5 relative overflow-hidden">
                  <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-[#ffaa00]" />
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4 pl-2">
                    <div className="flex items-center gap-3 flex-1">
                      <CalendarOff className="w-5 h-5 text-[#ffaa00] flex-shrink-0" />
                      <div>
                        <p className="text-xs font-mono font-bold text-[#ffaa00] uppercase tracking-[0.15em]">
                          Fora do Horário Operacional
                        </p>
                        <p className="text-[11px] font-mono text-foreground/50 mt-0.5">
                          Sinais automáticos disponíveis seg–sex, 08:30–17:00 (Brasília).
                          Análise manual continua disponível.
                        </p>
                      </div>
                    </div>
                    <div className="text-right font-mono flex-shrink-0">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-[0.15em]">Hora atual (SP)</p>
                      <p className="text-base text-foreground/70">{spClock}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">

                  {/* Status */}
                  <div className="bg-card/40 border border-primary/20 p-4 flex flex-col gap-2 relative overflow-hidden col-span-2 sm:col-span-1">
                    <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-primary" />
                    <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-[0.15em] pl-2 flex items-center gap-1">
                      <Bell className="w-3 h-3" /> Status
                    </span>
                    <span className="text-xs font-mono font-bold text-primary uppercase tracking-[0.1em] pl-2">
                      ● ATIVO
                    </span>
                  </div>

                  {/* Market status */}
                  <div className="bg-card/40 border border-border/50 p-4 flex flex-col gap-2 relative overflow-hidden col-span-2 sm:col-span-1">
                    <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-[0.15em] flex items-center gap-1">
                      <Activity className="w-3 h-3" /> Mercado
                    </span>
                    <MarketStatusBadge decision={result?.decision ?? null} />
                  </div>

                  {/* Last analysis */}
                  <div className="bg-card/40 border border-border/50 p-4 flex flex-col gap-2 relative overflow-hidden">
                    <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-[0.15em] flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Última análise
                    </span>
                    <span className="text-sm font-mono text-foreground/80">
                      {autoState.lastAnalysisTime ? fmtTimeSP(autoState.lastAnalysisTime) : '—'}
                    </span>
                  </div>

                  {/* Countdown */}
                  <div className="bg-card/40 border border-border/50 p-4 flex flex-col gap-2 relative overflow-hidden">
                    <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-[0.15em] flex items-center gap-1">
                      <Timer className="w-3 h-3" /> Próximo candle
                    </span>
                    <span className="text-xl font-mono font-bold text-primary tabular-nums">
                      {autoState.countdown}
                    </span>
                  </div>

                </div>
              )}
            </motion.section>
          )}
        </AnimatePresence>

        {/* ── TradingView Chart ────────────────────────────────────────────── */}
        <section className="bg-card/50 backdrop-blur-md border border-border relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

          {/* Chart header */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-4 border-b border-border/50">
            <div className="flex items-center gap-2 flex-1">
              <BarChart2 className="w-4 h-4 text-primary flex-shrink-0" />
              <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                Gráfico Avançado
              </span>
              <span className="text-[10px] font-mono text-primary/50 ml-1">· TradingView</span>
            </div>

            {/* EMA legend */}
            <div className="hidden sm:flex items-center gap-4">
              {[
                { label: 'EMA 9',   color: '#00f0ff' },
                { label: 'EMA 21',  color: '#ffaa00' },
                { label: 'EMA 200', color: '#ff6644' },
              ].map(e => (
                <div key={e.label} className="flex items-center gap-1.5">
                  <div className="w-6 h-[2px]" style={{ background: e.color }} />
                  <span className="text-[10px] font-mono" style={{ color: e.color }}>{e.label}</span>
                </div>
              ))}
            </div>

            {/* Timeframe switcher */}
            <div className="flex items-center gap-1 border border-border/60 p-0.5 bg-background/40">
              {([ ['5', '5M'], ['15', '15M'], ['60', '1H'] ] as [TVInterval, string][]).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setTvInterval(val)}
                  className={`px-3 py-1.5 text-[11px] font-mono uppercase tracking-[0.15em] transition-all duration-200
                    ${tvInterval === val
                      ? 'bg-primary text-primary-foreground shadow-[0_0_8px_var(--color-primary)]'
                      : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                    }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Chart — key forces clean remount when symbol or interval changes */}
          <TradingViewChart
            key={`${tvSymbol}-${tvInterval}`}
            symbol={tvSymbol}
            interval={tvInterval}
            height={540}
          />
        </section>

        {/* ── Analysis result ──────────────────────────────────────────────── */}
        <AnimatePresence>
          {result && !analyzing && (
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0  }}
              exit={{    opacity: 0, y: -20 }}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col gap-4"
            >
              {/* Result meta */}
              {resultTime && (
                <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground/50">
                  <Clock className="w-3 h-3" />
                  <span>Análise em {fmtTimeSP(resultTime)} (SP)</span>
                  {autoEnabled && autoState.isOperational && (
                    <span className="text-primary/50 ml-1">· automática</span>
                  )}
                </div>
              )}

              {/* Decision */}
              <DecisionBanner decision={result.decision} />

              <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4">

                {/* Steps */}
                <div className="flex flex-col gap-0 border border-border/50 bg-card/30 overflow-hidden">
                  <div className="px-5 py-3 border-b border-border/50 flex items-center gap-2">
                    <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-[0.2em]">
                      Motor de Regras · 7 Etapas
                    </span>
                    <span className="ml-auto text-[10px] font-mono text-muted-foreground">
                      {result.steps.filter(s => s.status === 'PASS').length}/7 aprovadas
                    </span>
                  </div>
                  <div className="divide-y divide-border/30">
                    {result.steps.map((step, i) => (
                      <StepRow key={step.number} step={step} index={i} />
                    ))}
                  </div>
                </div>

                {/* Right panel */}
                <div className="flex flex-col gap-4">

                  {/* S/R levels */}
                  {(result.nearestSupport || result.nearestResistance) && (
                    <div className="border border-border/50 bg-card/30 p-5 flex flex-col gap-4">
                      <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-[0.2em]">
                        Níveis Identificados (15M)
                      </span>
                      {result.nearestResistance && (
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-xs font-mono text-[#ff4444]/80 uppercase tracking-wider">
                            <ArrowUpRight className="w-3 h-3" /> Resistência
                          </div>
                          <span className="font-mono font-bold text-[#ff4444]">{result.nearestResistance}</span>
                        </div>
                      )}
                      {result.nearestSupport && (
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-xs font-mono text-[#00ff66]/80 uppercase tracking-wider">
                            <ArrowDownRight className="w-3 h-3" /> Suporte
                          </div>
                          <span className="font-mono font-bold text-[#00ff66]">{result.nearestSupport}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Position levels — only for BUY or SELL */}
                  {result.decision !== 'NO TRADE' && result.entry && (
                    <div className="border border-primary/25 bg-card/30 p-5 relative">
                      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
                      <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-[0.2em] block mb-4">
                        Parâmetros da Operação
                      </span>
                      <div className="grid grid-cols-2 gap-5">
                        <PriceBlock label="Entrada"   value={result.entry}    accent="#ffffff" icon={<CheckCircle2 className="w-3 h-3" />} />
                        <PriceBlock label="Stop Loss" value={result.stopLoss!} accent="#ff4444" icon={<ShieldAlert  className="w-3 h-3" />} />
                        <PriceBlock label="Alvo 1"    value={result.target1!}  accent="#00ff66" icon={<Target       className="w-3 h-3" />} />
                        <PriceBlock label="Alvo 2"    value={result.target2!}  accent="#00ff66" icon={<Crosshair    className="w-3 h-3" />} />
                      </div>
                      <div className="mt-4 pt-4 border-t border-border/40 flex items-center justify-between">
                        <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-[0.2em]">
                          Risco/Retorno
                        </span>
                        <span className="font-mono font-bold text-2xl text-accent drop-shadow-[0_0_8px_rgba(255,170,0,0.4)]">
                          {result.riskReward}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* No-trade explanation */}
                  {result.decision === 'NO TRADE' && (
                    <div className="border border-border/50 bg-card/20 p-5 flex flex-col gap-3">
                      <div className="flex items-center gap-2 text-[#ffaa00]">
                        <AlertTriangle className="w-4 h-4" />
                        <span className="text-xs font-mono uppercase tracking-[0.15em]">Aguardando Setup</span>
                      </div>
                      <p className="text-xs font-mono text-foreground/50 leading-relaxed">
                        O motor exige aprovação em todas as 7 etapas para emitir um sinal. Clique nas etapas acima para ver o motivo de cada decisão.
                      </p>
                    </div>
                  )}

                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </main>

      {/* Noise overlay */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.035] mix-blend-screen z-50"
        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")` }}
      />
    </div>
  );
}
