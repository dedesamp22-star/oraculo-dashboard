import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity, ArrowUpRight, ArrowDownRight, Crosshair, ShieldAlert,
  Target, Zap, CheckCircle2, TrendingUp, Layers, Eye, Clock,
  AlertTriangle, RefreshCw,
} from 'lucide-react';
import { useBinanceData } from '../hooks/useBinanceData';
import { analyze, type AnalysisResult } from '../lib/analysis';

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtPrice(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ── sub-components ────────────────────────────────────────────────────────────

function TimeframeBadge({
  label, value, icon, color,
}: { label: string; value: string; icon: React.ReactNode; color: string }) {
  return (
    <div className="flex flex-col gap-2 bg-background/40 border border-border/60 p-4 relative">
      <div
        className="absolute top-0 left-0 w-full h-[1px] opacity-60"
        style={{ background: `linear-gradient(to right, transparent, ${color}, transparent)` }}
      />
      <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-1.5">
        {icon}{label}
      </span>
      <span className="text-base font-mono font-bold" style={{ color, textShadow: `0 0 12px ${color}55` }}>
        {value}
      </span>
    </div>
  );
}

function ValueRow({
  label, value, accent, icon, large = false,
}: { label: string; value: string; accent: string; icon?: React.ReactNode; large?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5 pl-4 border-l-2" style={{ borderColor: `${accent}80` }}>
      <span
        className="text-[10px] font-mono uppercase tracking-[0.2em] flex items-center gap-1.5"
        style={{ color: `${accent}bb` }}
      >
        {icon}{label}
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

// ── main component ────────────────────────────────────────────────────────────

export default function Home() {
  const market = useBinanceData();
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  const canAnalyze =
    !analyzing &&
    !market.loading &&
    !market.error &&
    market.price !== null &&
    market.candles1h.length > 20;

  const handleAnalyze = () => {
    if (!canAnalyze) return;
    setAnalyzing(true);
    setResult(null);
    // Small artificial delay so the "PROCESSANDO" state is visible
    setTimeout(() => {
      const res = analyze(
        market.candles1h,
        market.candles15m,
        market.candles5m,
        market.price!,
      );
      setResult(res);
      setAnalyzing(false);
    }, 1200);
  };

  const statusColor =
    result?.status === 'SINAL DETECTADO' ? '#00ff66'
    : result?.status === 'AGUARDANDO'    ? '#ffaa00'
    : '#888';

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
          <h1 className="text-3xl sm:text-4xl font-mono font-bold tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-white to-white/70 drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]">
            ORÁCULO<span className="text-primary ml-2">0.1</span>
          </h1>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-xs font-mono text-primary bg-primary/10 px-4 py-2 border-l-2 border-primary">
          <Activity className="w-4 h-4" />
          <span className="tracking-widest">SYSTEM ONLINE</span>
        </div>
      </header>

      <main className="w-full max-w-4xl flex flex-col gap-6 relative z-10">

        {/* ── Live price ticker ───────────────────────────────────────────── */}
        <section className="bg-card/50 backdrop-blur-md border border-border p-5 sm:p-6 relative overflow-hidden">
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
              {/* Price */}
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
                    className="text-4xl sm:text-5xl font-mono font-bold text-white drop-shadow-[0_0_12px_rgba(255,255,255,0.2)]"
                  >
                    ${fmtPrice(market.price!)}
                  </motion.span>
                </AnimatePresence>
              </div>

              {/* Last update */}
              {market.lastUpdate && (
                <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground bg-background/40 border border-border/50 px-4 py-2">
                  <Clock className="w-3.5 h-3.5 text-primary/70" />
                  <span className="tracking-widest">
                    ATUALIZADO {fmtTime(market.lastUpdate)}
                  </span>
                  <span className="text-primary/60 ml-2">· 30s</span>
                </div>
              )}
            </div>
          )}
        </section>

        {/* ── Control panel ──────────────────────────────────────────────── */}
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
                  disabled={analyzing || market.loading}
                >
                  <option value="BTCUSDT">BTC / USDT</option>
                </select>
                <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-primary">▼</div>
              </div>
            </div>

            <button
              onClick={handleAnalyze}
              disabled={!canAnalyze}
              className={`relative flex-1 sm:flex-none sm:w-64 w-full overflow-hidden rounded-none font-mono font-bold text-lg tracking-[0.1em] transition-all duration-300 h-[62px]
                ${!canAnalyze
                  ? 'bg-primary/10 text-primary/50 border border-primary/20 cursor-not-allowed'
                  : analyzing
                  ? 'bg-primary/10 text-primary border border-primary/30 cursor-wait'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-[0_0_30px_rgba(0,240,255,0.4)] border border-primary cursor-pointer'
                }`}
            >
              <div className="absolute inset-0 flex items-center justify-center gap-3">
                {market.loading ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    <span>CARREGANDO...</span>
                  </>
                ) : analyzing ? (
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

        {/* ── Result panel ───────────────────────────────────────────────── */}
        <AnimatePresence>
          {result && !analyzing && (
            <motion.section
              initial={{ opacity: 0, y: 40, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.98 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="relative p-[1px]"
            >
              <div className="absolute inset-0 bg-gradient-to-b from-primary via-primary/20 to-transparent opacity-70" />

              <div className="bg-card w-full p-6 sm:p-8 relative flex flex-col gap-8">

                {/* Row 1 – STATUS */}
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
                      style={{ color: statusColor, borderColor: `${statusColor}44`, background: `${statusColor}12` }}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      {result.status}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    <span className="tracking-widest">
                      BTC/USDT · {market.lastUpdate ? fmtTime(market.lastUpdate) : '—'}
                    </span>
                  </div>
                </motion.div>

                {/* Row 2 – Timeframe signals */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="grid grid-cols-1 sm:grid-cols-3 gap-4"
                >
                  <TimeframeBadge
                    label="Trend (1H)"
                    value={result.trend1h}
                    icon={result.bullish
                      ? <ArrowUpRight className="w-3 h-3" />
                      : <ArrowDownRight className="w-3 h-3" />}
                    color={result.bullish ? '#00ff66' : '#ff4444'}
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
                    color={result.confirmation5m === 'CONFIRMADO' ? '#ffaa00' : '#666'}
                  />
                </motion.div>

                {/* Row 3 – Prices */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.18 }}
                  className="grid grid-cols-2 lg:grid-cols-4 gap-6"
                >
                  <ValueRow label="Entry"     value={result.entry}    accent="#ffffff" large />
                  <ValueRow label="Stop Loss" value={result.stopLoss} accent="#ff4444" icon={<ShieldAlert className="w-3 h-3" />} large />
                  <ValueRow label="Target 1"  value={result.target1}  accent="#00ff66" icon={<Target className="w-3 h-3" />}     large />
                  <ValueRow label="Target 2"  value={result.target2}  accent="#00ff66" icon={<Crosshair className="w-3 h-3" />}  large />
                </motion.div>

                {/* Row 4 – R/R + Notes */}
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
                      {result.notes.split('. ').filter(Boolean).map((line, i, arr) => (
                        <span key={i} className="block">
                          <span className="text-primary/60 mr-2">&gt;</span>
                          {line.trim()}{i < arr.length - 1 ? '.' : ''}
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
