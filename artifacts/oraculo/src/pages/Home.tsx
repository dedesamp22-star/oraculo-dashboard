import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity, ArrowUpRight, ArrowDownRight, Crosshair, ShieldAlert,
  Target, Zap, CheckCircle2, XCircle, Clock, AlertTriangle,
  RefreshCw, TrendingUp, TrendingDown, Minus,
} from 'lucide-react';
import { useBinanceData } from '../hooks/useBinanceData';
import { runEngine, type EngineResult, type RuleStep, type StepStatus } from '../lib/analysis';

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtPrice(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtTime(d: Date): string {
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
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
      transition={{ delay: index * 0.07, duration: 0.3 }}
      className={`border border-border/50 relative overflow-hidden ${isFinal ? 'border-primary/30' : ''}`}
    >
      {/* left accent bar */}
      <div className="absolute left-0 top-0 bottom-0 w-[2px]" style={{ background: color }} />

      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-4 px-5 py-3 text-left hover:bg-white/[0.02] transition-colors"
      >
        {/* step number */}
        <span className="text-[10px] font-mono text-muted-foreground w-4 flex-shrink-0 select-none">
          {step.number < 7 ? `0${step.number}` : '→'}
        </span>

        {/* icon */}
        {step.status === 'PASS'
          ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color }} />
          : step.status === 'FAIL'
          ? <XCircle className="w-4 h-4 flex-shrink-0" style={{ color }} />
          : <Minus className="w-4 h-4 flex-shrink-0" style={{ color }} />
        }

        {/* name */}
        <span className={`text-xs font-mono uppercase tracking-[0.15em] flex-1 ${isFinal ? 'text-foreground' : 'text-muted-foreground'}`}>
          {step.name}
        </span>

        {/* value badge */}
        <span
          className="text-xs font-mono font-bold px-2 py-0.5 border ml-auto flex-shrink-0"
          style={{ color, borderColor: `${color}44`, background: `${color}12` }}
        >
          {step.value}
        </span>

        {/* toggle */}
        <span className="text-muted-foreground/40 text-xs ml-2 flex-shrink-0 select-none">
          {open ? '▲' : '▼'}
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
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

// ── Position card ─────────────────────────────────────────────────────────────

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

function DecisionBanner({ decision }: { decision: 'BUY' | 'SELL' | 'NO TRADE' }) {
  const config = {
    BUY:      { color: '#00ff66', bg: '#00ff6614', border: '#00ff6644', icon: <TrendingUp className="w-6 h-6" />,  label: 'COMPRA' },
    SELL:     { color: '#ff4444', bg: '#ff444414', border: '#ff444444', icon: <TrendingDown className="w-6 h-6" />, label: 'VENDA' },
    'NO TRADE': { color: '#ffaa00', bg: '#ffaa0014', border: '#ffaa0044', icon: <XCircle className="w-6 h-6" />, label: 'NO TRADE' },
  }[decision];

  return (
    <div
      className="flex items-center justify-between p-5 border relative overflow-hidden"
      style={{ background: config.bg, borderColor: config.border }}
    >
      {/* glow */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1"
        style={{ background: config.color, boxShadow: `0 0 16px ${config.color}` }}
      />
      <div className="flex items-center gap-4 pl-2">
        <span style={{ color: config.color }}>{config.icon}</span>
        <div>
          <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-[0.2em]">Decisão do Motor</p>
          <p className="text-3xl font-mono font-bold" style={{ color: config.color, textShadow: `0 0 20px ${config.color}66` }}>
            {config.label}
          </p>
        </div>
      </div>
      <div className="text-right hidden sm:block">
        <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-[0.15em]">
          {decision === 'NO TRADE' ? 'Regras não satisfeitas' : 'Todas as regras aprovadas'}
        </p>
        <p className="text-xs font-mono" style={{ color: config.color }}>
          {decision === 'NO TRADE' ? 'Aguardar setup completo' : 'Operar com gestão de risco'}
        </p>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function Home() {
  const market = useBinanceData();
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<EngineResult | null>(null);

  const canAnalyze =
    !analyzing && !market.loading && !market.error &&
    market.price !== null && market.candles1h.length > 20;

  const handleAnalyze = () => {
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
      setResult(res);
      setAnalyzing(false);
    }, 900);
  };

  return (
    <div className="min-h-screen w-full bg-background text-foreground font-sans selection:bg-primary/30 flex flex-col items-center p-4 sm:p-8 relative overflow-hidden">
      {/* Ambient glows */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />

      {/* ── Header ─────────────────────────────────────────────────────── */}
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

        {/* ── Live price ─────────────────────────────────────────────────── */}
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
                  <span className="tracking-widest">ATUALIZADO {fmtTime(market.lastUpdate)}</span>
                  <span className="text-primary/50 ml-1">· 30s</span>
                </div>
              )}
            </div>
          )}
        </section>

        {/* ── Controls ───────────────────────────────────────────────────── */}
        <section className="bg-card/50 backdrop-blur-md border border-border p-6 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
          <div className="flex flex-col sm:flex-row gap-5 items-end">
            <div className="flex-1 w-full space-y-2.5">
              <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-[0.2em]">
                Selecionar Par
              </label>
              <div className="relative">
                <select
                  className="w-full bg-background/50 border border-border py-4 px-5 appearance-none font-mono text-xl focus:outline-none focus:border-primary/50 transition-all cursor-pointer rounded-none"
                  disabled={analyzing || market.loading}
                >
                  <option value="BTCUSDT">BTC / USDT</option>
                </select>
                <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-primary text-sm">▼</div>
              </div>
            </div>

            <button
              onClick={handleAnalyze}
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
        </section>

        {/* ── Result ─────────────────────────────────────────────────────── */}
        <AnimatePresence>
          {result && !analyzing && (
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col gap-4"
            >
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

                  {/* S/R Levels */}
                  {(result.nearestSupport || result.nearestResistance) && (
                    <div className="border border-border/50 bg-card/30 p-5 flex flex-col gap-4">
                      <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-[0.2em]">
                        Níveis Identificados
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

                  {/* Position levels – only if BUY or SELL */}
                  {result.decision !== 'NO TRADE' && result.entry && (
                    <div className="border border-primary/25 bg-card/30 p-5 relative">
                      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
                      <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-[0.2em] block mb-4">
                        Parâmetros da Operação
                      </span>
                      <div className="grid grid-cols-2 gap-5">
                        <PriceBlock label="Entrada"  value={result.entry}    accent="#ffffff" icon={<CheckCircle2 className="w-3 h-3" />} />
                        <PriceBlock label="Stop Loss" value={result.stopLoss!} accent="#ff4444" icon={<ShieldAlert className="w-3 h-3" />} />
                        <PriceBlock label="Alvo 1"   value={result.target1!}  accent="#00ff66" icon={<Target className="w-3 h-3" />} />
                        <PriceBlock label="Alvo 2"   value={result.target2!}  accent="#00ff66" icon={<Crosshair className="w-3 h-3" />} />
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

                  {/* No trade explanation */}
                  {result.decision === 'NO TRADE' && (
                    <div className="border border-border/50 bg-card/20 p-5 flex flex-col gap-3">
                      <div className="flex items-center gap-2 text-[#ffaa00]">
                        <AlertTriangle className="w-4 h-4" />
                        <span className="text-xs font-mono uppercase tracking-[0.15em]">Aguardando Setup</span>
                      </div>
                      <p className="text-xs font-mono text-foreground/50 leading-relaxed">
                        O motor exige aprovação em todas as 7 etapas para emitir um sinal. Etapas reprovadas bloqueiam a operação. Clique nas etapas acima para ver o motivo.
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
