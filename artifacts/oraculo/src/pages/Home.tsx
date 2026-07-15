import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, ArrowUpRight, Crosshair, ShieldAlert, Target, Zap, CheckCircle2 } from 'lucide-react';

export default function Home() {
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<boolean>(false);

  const handleAnalyze = () => {
    setAnalyzing(true);
    setResult(false);
    setTimeout(() => {
      setAnalyzing(false);
      setResult(true);
    }, 1500);
  };

  return (
    <div className="min-h-screen w-full bg-background text-foreground font-sans selection:bg-primary/30 flex flex-col items-center p-4 sm:p-8 relative overflow-hidden">
      {/* Background ambient glow */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary/5 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-primary/5 rounded-full blur-[120px] pointer-events-none"></div>

      <header className="w-full max-w-4xl flex items-center justify-between mb-16 border-b border-border pb-6 pt-4 relative z-10">
        <div className="flex items-center gap-4">
          <div className="relative flex items-center justify-center w-10 h-10">
            <div className="absolute inset-0 bg-primary/20 rounded-sm animate-pulse"></div>
            <div className="relative w-4 h-4 bg-primary shadow-[0_0_15px_var(--color-primary)] rotate-45"></div>
          </div>
          <h1 className="text-3xl sm:text-4xl font-mono font-bold tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-white to-white/70 drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]">
            ORÁCULO<span className="text-primary ml-2">0.1</span>
          </h1>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono text-primary bg-primary/10 px-4 py-2 border-l-2 border-primary hidden sm:flex">
          <Activity className="w-4 h-4" />
          <span className="tracking-widest">SYSTEM ONLINE</span>
        </div>
      </header>

      <main className="w-full max-w-4xl flex flex-col gap-10 relative z-10">
        
        {/* CONTROL PANEL */}
        <section className="bg-card/50 backdrop-blur-md border border-border p-6 sm:p-8 relative overflow-hidden group">
          {/* Top border highlight */}
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-primary/50 to-transparent"></div>
          
          <div className="flex flex-col sm:flex-row gap-6 sm:gap-8 items-end">
            <div className="flex-1 w-full space-y-3">
              <label className="text-xs font-mono text-muted-foreground uppercase tracking-[0.2em]">Selecionar Par</label>
              <div className="relative">
                <select 
                  className="w-full bg-background/50 border border-border py-4 px-5 appearance-none font-mono text-xl focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all cursor-pointer rounded-none"
                  disabled={analyzing}
                >
                  <option value="BTC/USDT">BTC / USDT</option>
                </select>
                <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-primary">
                  ▼
                </div>
              </div>
            </div>
            
            <button
              onClick={handleAnalyze}
              disabled={analyzing}
              className={`relative flex-1 sm:flex-none sm:w-64 w-full overflow-hidden rounded-none font-mono font-bold text-lg tracking-[0.1em] transition-all duration-300 h-[62px]
                ${analyzing ? 'bg-primary/10 text-primary border border-primary/30 cursor-wait' : 'bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-[0_0_30px_rgba(0,240,255,0.4)] border border-primary cursor-pointer'}
              `}
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
              
              {/* Scanline effect */}
              {!analyzing && (
                <div className="absolute inset-0 bg-gradient-to-b from-white/0 via-white/20 to-white/0 translate-y-[-100%] group-hover:animate-[scan_1.5s_ease-in-out_infinite]"></div>
              )}
            </button>
          </div>
        </section>

        {/* RESULT CARD */}
        <AnimatePresence>
          {result && !analyzing && (
            <motion.section
              initial={{ opacity: 0, y: 50, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.98 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="relative p-[1px] group"
            >
              {/* Animated glowing border */}
              <div className="absolute inset-0 bg-gradient-to-b from-primary via-primary/20 to-transparent opacity-70"></div>
              
              <div className="bg-card h-full w-full p-6 sm:p-10 relative">
                
                {/* Header of card */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-10 gap-6 pb-8 border-b border-border/60">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 bg-[#00ff66]/10 text-[#00ff66] px-4 py-2 border border-[#00ff66]/30 font-mono text-sm tracking-wider">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>SINAL DETECTADO</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 bg-background/50 border border-border px-5 py-3">
                    <span className="text-xs text-muted-foreground font-mono tracking-widest">TENDÊNCIA:</span>
                    <span className="text-[#00ff66] font-mono font-bold flex items-center gap-1 text-lg">
                      ALTA <ArrowUpRight className="w-5 h-5" />
                    </span>
                  </div>
                </div>

                {/* Grid of values */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-10">
                  <div className="flex flex-col gap-2 relative pl-4 sm:pl-6 border-l-2 border-primary/50">
                    <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Entrada</span>
                    <span className="text-3xl font-mono font-bold text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]">$43,250.00</span>
                  </div>
                  <div className="flex flex-col gap-2 relative pl-4 sm:pl-6 border-l-2 border-destructive/50">
                    <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest flex items-center gap-2 text-destructive">
                      <ShieldAlert className="w-3 h-3"/> Stop Loss
                    </span>
                    <span className="text-3xl font-mono font-bold text-destructive drop-shadow-[0_0_10px_rgba(255,42,42,0.2)]">$42,100.00</span>
                  </div>
                  <div className="flex flex-col gap-2 relative pl-4 sm:pl-6 border-l-2 border-[#00ff66]/50">
                    <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest flex items-center gap-2 text-[#00ff66]">
                      <Target className="w-3 h-3"/> Alvo 1
                    </span>
                    <span className="text-3xl font-mono font-bold text-[#00ff66] drop-shadow-[0_0_10px_rgba(0,255,102,0.2)]">$44,500.00</span>
                  </div>
                  <div className="flex flex-col gap-2 relative pl-4 sm:pl-6 border-l-2 border-[#00ff66]/50">
                    <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest flex items-center gap-2 text-[#00ff66]">
                      <Crosshair className="w-3 h-3"/> Alvo 2
                    </span>
                    <span className="text-3xl font-mono font-bold text-[#00ff66] drop-shadow-[0_0_10px_rgba(0,255,102,0.2)]">$46,000.00</span>
                  </div>
                </div>

                {/* Footer of card */}
                <div className="flex flex-col sm:flex-row gap-8 bg-background/30 border border-border/50 p-6 relative">
                  {/* Decorative corner accents */}
                  <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-primary/50"></div>
                  <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-primary/50"></div>
                  
                  <div className="flex-shrink-0 flex flex-col gap-2">
                    <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Risco/Retorno</span>
                    <span className="text-2xl font-mono font-bold text-accent drop-shadow-[0_0_10px_rgba(255,170,0,0.2)]">1:2.3</span>
                  </div>
                  <div className="w-px bg-border/50 hidden sm:block"></div>
                  <div className="flex flex-col gap-2">
                    <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Observações</span>
                    <p className="text-sm text-foreground/70 leading-relaxed font-mono">
                      &gt; Rompimento de resistência com volume elevado.<br/>
                      &gt; Confirmação de tendência no RSI e alinhamento das médias móveis.
                    </p>
                  </div>
                </div>

              </div>
            </motion.section>
          )}
        </AnimatePresence>

      </main>
      
      {/* GLOBAL NOISE OVERLAY */}
      <div 
        className="fixed inset-0 pointer-events-none opacity-[0.04] mix-blend-screen z-50"
        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }}
      ></div>

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes scan {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100%); }
        }
      `}} />
    </div>
  );
}
