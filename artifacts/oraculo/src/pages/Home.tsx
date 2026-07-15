import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity, ArrowUpRight, Crosshair, ShieldAlert, Target, Zap,
  CheckCircle2, TrendingUp, Layers, Eye,
} from 'lucide-react';

type SignalStatus = 'SINAL DETECTADO' | 'SEM SINAL' | 'AGUARDANDO';

interface AnalysisResult {
  status: SignalStatus;
  trend1h: string;
  structure15m: string;
  confirmation5m: string;
  entry: string;
  stopLoss: string;
  target1: string;
  target2: string;
  riskReward: string;
  notes: string;
}

const SIMULATED_RESULT: AnalysisResult = {
  status: 'SINAL DETECTADO',
  trend1h: 'ALTA',
  structure15m: 'ROMPIMENTO',
  confirmation5m: 'CONFIRMADO',
  entry: '$43,250.00',
  stopLoss: '$42,100.00',
  target1: '$44,500.00',
  target2: '$46,000.00',
  riskReward: '1:2.3',
  notes:
    'Rompimento de resistência com volume elevado. RSI em expansão acima de 55. Médias móveis alinhadas na mesma direção.',
};

function TimeframeBadge({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="flex flex-col gap-2 bg-background/40 border border-border/60 p-4 relative">
      <div className="absolute top-0 left-0 w-full h-[1px] opacity-60" style={{ background: `linear-gradient(to right, transparent, ${color}, transparent)` }} />
      <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-1.5">
        {icon}
        {label}
      </span>
      <span className="text-base font-mono font-bold" style={{ color, textShadow: `0 0 12px ${color}55` }}>
        {value}
      </span>
    </div>
  );
}

function ValueRow({
  label,
  value,
  accent,
  icon,
  large = false,
}: {
  label: string;
  value: string;
  accent: string;
  icon?: React.ReactNode;
  large?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5 pl-4 border-l-2" style={{ borderColor: `${accent}80` }}>
      <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-1.5" style={{ color: `${accent}bb` }}>
        {icon}
        {label}
      </span>
      <span
        className={`font-mono font-bold ${large ? 'text-3xl' : 'text-2xl'}`}
        style={{ color: accent, textShadow: `0 0 12px ${accent}44` }}
      >
        {value}
      </span>
    </div>
  );
}

export default function Home() {
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  const handleAnalyze = () => {
    setAnalyzing(true);
    setResult(null);
    setTimeout(() => {
      setAnalyzing(false);
      setResult(SIMULATED_RESULT);
    }, 1500);
  };

  const statusColor =
    result?.status === 'SINAL DETECTADO'
      ? '#00ff66'
      : result?.status === 'AGUARDANDO'
      ? '#ffaa00'
      : '#888';

  return (
    <div className="min-h-screen w-full bg-background text-foreground font-sans selection:bg-primary/30 flex flex-col items-center p-4 sm:p-8 relative overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />

      {/* Header */}
      <header className="w-full max-w-4xl flex items-center justify-between mb-12 border-b border-border pb-6 pt-4 relative z-10">
        <div className="flex items-center gap-4">
          <div className="relative flex items-center justify-center w-10 h-10">
            <div className="absolute inset-0 bg-primary/20 rounded-sm animate-pulse" />
            <div className="relative w-4 h-4 bg-primary shadow-[0_0_15px_var(--color-primary)] rotate-45" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-mono font-bold tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-white to-white/70 drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]">
            ORÁCULO<span className="text-primary ml-2">0.1</span>
          </h1>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-xs font-mono text-primary bg-primary/10 px-4 py-2 border-l-2 border-primary">
          <Activity className="w-4 h-4" />
          <span className="tracking-widest">SYSTEM ONLINE</span>
        </div>
      </header>

      <main className="w-full max-w-4xl flex flex-col gap-8 relative z-10">

        {/* Control panel */}
        <section className="bg-card/50 backdrop-blur-md border border-border p-6 sm:p-8 relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
          <div className="flex flex-col sm:flex-row gap-6 sm:gap-8 items-end">
            <div className="flex-1 w-full space-y-3">
              <label className="text-xs font-mono text-muted-foreground uppercase tracking-[0.2em]">
                Selecionar Par
              </label>
              <div className="relative">
                <select
                  className="w-full bg-background/50 border border-border py-4 px-5 appearance-none font-mono text-xl focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all cursor-pointer rounded-none"
                  disabled={analyzing}
                >
                  <option value="BTC/USDT">BTC / USDT</option>
                </select>
                <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-primary">▼</div>
              </div>
            </div>

            <button
              onClick={handleAnalyze}
              disabled={analyzing}
              className={`relative flex-1 sm:flex-none sm:w-64 w-full overflow-hidden rounded-none font-mono font-bold text-lg tracking-[0.1em] transition-all duration-300 h-[62px]
                ${analyzing
                  ? 'bg-primary/10 text-primary border border-primary/30 cursor-wait'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-[0_0_30px_rgba(0,240,255,0.4)] border border-primary cursor-pointer'
                }`}
            >
              <div className="absolute inset-0 flex items-center justify-center gap-3">
                {analyzing ? (
                  <>
                    <Activity className="w-5 h-5 animate-pulse" />
                    <span>PROCESSANDO...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-5 h-5" />
                    <span>ANALISAR AGORA</span>
                  </>
                )}
              </div>
            </button>
          </div>
        </section>

        {/* Result panel */}
        <AnimatePresence>
          {result && !analyzing && (
            <motion.section
              initial={{ opacity: 0, y: 40, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.98 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="relative p-[1px]"
            >
              {/* Glowing border */}
              <div className="absolute inset-0 bg-gradient-to-b from-primary via-primary/20 to-transparent opacity-70" />

              <div className="bg-card w-full p-6 sm:p-8 relative flex flex-col gap-8">

                {/* ── Row 1: STATUS ── */}
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.05 }}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-border/60"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-muted-foreground uppercase tracking-[0.2em]">Status</span>
                    <div
                      className="flex items-center gap-2 px-4 py-2 border font-mono text-sm tracking-wider"
                      style={{
                        color: statusColor,
                        borderColor: `${statusColor}44`,
                        background: `${statusColor}12`,
                      }}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      {result.status}
                    </div>
                  </div>
                  <div className="text-xs font-mono text-muted-foreground tracking-widest">
                    BTC/USDT · {new Date().toLocaleTimeString('pt-BR')}
                  </div>
                </motion.div>

                {/* ── Row 2: Timeframe signals ── */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="grid grid-cols-1 sm:grid-cols-3 gap-4"
                >
                  <TimeframeBadge
                    label="Trend (1H)"
                    value={result.trend1h}
                    icon={<TrendingUp className="w-3 h-3" />}
                    color="#00ff66"
                  />
                  <TimeframeBadge
                    label="Structure (15M)"
                    value={result.structure15m}
                    icon={<Layers className="w-3 h-3" />}
                    color="#00cfff"
                  />
                  <TimeframeBadge
                    label="Confirmation (5M)"
                    value={result.confirmation5m}
                    icon={<Eye className="w-3 h-3" />}
                    color="#ffaa00"
                  />
                </motion.div>

                {/* ── Row 3: Prices ── */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.18 }}
                  className="grid grid-cols-2 lg:grid-cols-4 gap-6"
                >
                  <ValueRow label="Entry" value={result.entry} accent="#ffffff" large />
                  <ValueRow label="Stop Loss" value={result.stopLoss} accent="#ff4444" icon={<ShieldAlert className="w-3 h-3" />} large />
                  <ValueRow label="Target 1" value={result.target1} accent="#00ff66" icon={<Target className="w-3 h-3" />} large />
                  <ValueRow label="Target 2" value={result.target2} accent="#00ff66" icon={<Crosshair className="w-3 h-3" />} large />
                </motion.div>

                {/* ── Row 4: R/R + Notes ── */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25 }}
                  className="flex flex-col sm:flex-row gap-6 bg-background/30 border border-border/50 p-6 relative"
                >
                  <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-primary/50" />
                  <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-primary/50" />

                  <div className="flex-shrink-0 flex flex-col gap-2 sm:min-w-[130px]">
                    <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                      Risk/Reward
                    </span>
                    <span className="text-3xl font-mono font-bold text-accent drop-shadow-[0_0_10px_rgba(255,170,0,0.3)]">
                      {result.riskReward}
                    </span>
                  </div>

                  <div className="w-px bg-border/50 hidden sm:block" />

                  <div className="flex flex-col gap-2 flex-1">
                    <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Notes</span>
                    <p className="text-sm text-foreground/70 leading-relaxed font-mono">
                      {result.notes.split('. ').map((line, i) => (
                        <span key={i} className="block">
                          <span className="text-primary/60 mr-2">&gt;</span>
                          {line}{i < result.notes.split('. ').length - 1 ? '.' : ''}
                        </span>
                      ))}
                    </p>
                  </div>
                </motion.div>

              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </main>

      {/* Noise overlay */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.04] mix-blend-screen z-50"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />
    </div>
  );
}
