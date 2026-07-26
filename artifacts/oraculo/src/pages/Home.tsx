import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity, ArrowUpRight, ArrowDownRight, Crosshair, ShieldAlert,
  Target, Zap, CheckCircle2, XCircle, Clock, AlertTriangle,
  RefreshCw, TrendingUp, TrendingDown, Bell,
  CalendarOff, Timer, BarChart2, AlertCircle, Lightbulb,
  ChevronDown, ChevronUp, Bot, Pause,
} from 'lucide-react';
import { useBinanceData }       from '../hooks/useBinanceData';
import { useApiHealth }         from '../hooks/useApiHealth';
import { useMarketRadar }       from '../hooks/useMarketRadar';
import { useDemoAgents }        from '../hooks/useDemoAgents';
import { useAutoAnalysis }      from '../hooks/useAutoAnalysis';
import { useDemoAutoAnalysis }  from '../hooks/useDemoAutoAnalysis';
import { useDemoTrading }       from '../hooks/useDemoTrading';
import { useOracleGlobalState } from '../hooks/useOracleGlobalState';
import { useOnlineStatus }      from '../hooks/useOnlineStatus';
import { runEngine, type EngineResult, type RuleStep, type StepStatus, type Decision } from '../lib/analysis';
import { fmtTimeSP, fmtSPNow, isOperational as checkOperational } from '../lib/schedule';
import { fmtDuration, type DemoSession } from '../lib/demo';
import { TradingViewChart, type TVInterval } from '../components/TradingViewChart';
import { DemoActivePanel }   from '../components/DemoActivePanel';
import { DemoHistoryPanel }  from '../components/DemoHistoryPanel';
import { DemoStatsPanel }    from '../components/DemoStatsPanel';
import { MarketRadarPanel }  from '../components/MarketRadarPanel';
import { DemoAgentsPanel }   from '../components/DemoAgentsPanel';
import { RobotDiagnosticsPanel } from '../components/RobotDiagnosticsPanel';
import { ControlledSimulationPanel } from '../components/ControlledSimulationPanel';
import { NotificationsPanel } from '../components/NotificationsPanel';
import { ObservabilityPanel } from '../components/ObservabilityPanel';
import { EngineAuditPanel } from '../components/EngineAuditPanel';
import { PremiumLanding } from '../components/PremiumLanding';
import { fetchEngineAuditLog, getAuth, loginUser, logoutUser, type AuthUser, type EngineAuditEntry } from '../lib/demoApi';
import { buildEngineAuditInsight } from '../lib/engineAuditInsight';
import { fetchPrice } from '../lib/binance';
import { resolveOracleVisualState, type OracleVisualState } from '@shared/oracleVisualState';
import { APP_DISPLAY_NAME, APP_NAME, APP_VERSION } from '@shared/appVersion';

// â”€â”€ Formatters â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function isFiniteNumber(n: number | null | undefined): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function fmtPrice(n: number | null | undefined): string {
  if (!isFiniteNumber(n)) return 'â€”';
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtCurrency(n: number | null | undefined): string {
  return isFiniteNumber(n) ? `$${fmtPrice(n)}` : 'â€”';
}

function fmtSignedCurrency(n: number | null | undefined): string {
  if (!isFiniteNumber(n)) return 'â€”';
  return `${n >= 0 ? '+' : '-'}$${fmtPrice(Math.abs(n))}`;
}

function signedColor(n: number | null | undefined): string {
  if (!isFiniteNumber(n)) return '#aaaaaa';
  return n >= 0 ? '#00ff66' : '#ff4444';
}

function LoginScreen({ loading, error, onLogin }: {
  loading: boolean;
  error: string | null;
  onLogin: (username: string, password: string) => void;
}) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  return (
    <div className="min-h-screen w-full bg-background text-foreground font-sans flex items-center justify-center p-4">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onLogin(username, password);
        }}
        className="w-full max-w-sm border border-border bg-card/60 p-5 flex flex-col gap-4"
      >
        <div className="flex items-center gap-3">
          <ShieldAlert className="w-5 h-5 text-primary" />
          <div>
            <h1 className="text-lg font-mono font-bold uppercase tracking-[0.18em]">{APP_DISPLAY_NAME}</h1>
            <p className="text-[11px] font-mono text-muted-foreground">Acesso seguro ao modo demo</p>
          </div>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">Usuario</span>
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            className="bg-background border border-border px-3 py-3 font-mono text-sm outline-none focus:border-primary"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">Senha</span>
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            autoComplete="current-password"
            className="bg-background border border-border px-3 py-3 font-mono text-sm outline-none focus:border-primary"
          />
        </label>
        {error && <p className="text-[11px] font-mono text-[#ff4444]">{error}</p>}
        <button
          disabled={loading || password.length === 0 || username.trim().length === 0}
          className="min-h-11 bg-primary text-primary-foreground font-mono font-bold uppercase tracking-[0.14em] disabled:opacity-40"
        >
          {loading ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}

function OfflineScreen() {
  return (
    <div className="min-h-screen w-full bg-background text-foreground font-sans flex items-center justify-center p-4">
      <section className="w-full max-w-sm border border-[#ffaa00]/35 bg-[#ffaa00]/[0.04] p-5 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-[#ffaa00] flex-shrink-0" />
          <div className="min-w-0">
            <h1 className="text-sm font-mono font-bold uppercase tracking-[0.18em] text-[#ffaa00]">Sem conexao</h1>
            <p className="mt-1 text-xs font-mono text-muted-foreground leading-relaxed">
              Dados demo, sessao, posicoes e historico nao sao exibidos offline. Reconecte para carregar o estado oficial do servidor.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="min-h-11 border border-[#ffaa00]/45 px-4 py-3 text-[10px] font-mono font-bold uppercase tracking-[0.14em] text-[#ffaa00] hover:bg-[#ffaa00]/10"
        >
          Tentar novamente
        </button>
      </section>
    </div>
  );
}

// â”€â”€ Alert toast â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface AlertMsg {
  id: number;
  kind: 'buy' | 'sell' | 'invalidated' | 'demo';
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
    demo:       { color: '#00f0ff', border: '#00f0ff55', bg: '#00f0ff12', icon: <Bot className="w-5 h-5" /> },
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
      <button className="text-muted-foreground/40 hover:text-muted-foreground text-xs flex-shrink-0 mt-0.5">âœ•</button>
    </motion.div>
  );
}

// â”€â”€ Step row â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const STATUS_COLORS: Record<StepStatus, string> = {
  PASS: '#00ff66',
  FAIL: '#ff4444',
  INFO: '#ffaa00',
};

const ORACLE_VISUAL_STATE_META: Record<OracleVisualState, { label: string; color: string }> = {
  waiting: { label: 'Aguardando', color: '#D4AF37' },
  analyzing: { label: 'Analisando', color: '#00D8FF' },
  buy: { label: 'Compra', color: '#00FF88' },
  sell: { label: 'Venda', color: '#FF4D4D' },
};

function OracleLiveStateBadge({ state }: { state: OracleVisualState }) {
  const meta = ORACLE_VISUAL_STATE_META[state];
  return (
    <div
      data-oracle-state={state}
      className="flex min-h-9 items-center gap-2 border border-border/70 bg-card/50 px-3 text-[10px] font-mono uppercase tracking-[0.16em]"
      style={{ color: meta.color, borderColor: `${meta.color}44`, boxShadow: `0 0 18px ${meta.color}12` }}
    >
      <span className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping opacity-35" style={{ background: meta.color }} />
        <span className="relative inline-flex h-2.5 w-2.5" style={{ background: meta.color }} />
      </span>
      <span>Nucleo {meta.label}</span>
    </div>
  );
}

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
          {step.number < 7 ? `0${step.number}` : 'â†’'}
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
        <span className="text-muted-foreground/40 text-xs ml-2 flex-shrink-0 select-none">{open ? 'â–²' : 'â–¼'}</span>
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

// â”€â”€ PriceBlock â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€ Decision banner â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function DecisionBanner({ decision }: { decision: Decision }) {
  const cfg = {
    BUY:           { color: '#00ff66', bg: '#00ff6614', border: '#00ff6644', icon: <TrendingUp  className="w-6 h-6" />, label: 'COMPRA'      },
    SELL:          { color: '#ff4444', bg: '#ff444414', border: '#ff444444', icon: <TrendingDown className="w-6 h-6" />, label: 'VENDA'       },
    'SEM ENTRADA': { color: '#ffaa00', bg: '#ffaa0014', border: '#ffaa0044', icon: <XCircle      className="w-6 h-6" />, label: 'SEM ENTRADA' },
  }[decision];

  return (
    <div className="flex items-center justify-between p-5 border relative overflow-hidden"
      style={{ background: cfg.bg, borderColor: cfg.border }}>
      <div className="absolute left-0 top-0 bottom-0 w-1"
        style={{ background: cfg.color, boxShadow: `0 0 16px ${cfg.color}` }} />
      <div className="flex items-center gap-4 pl-2">
        <span style={{ color: cfg.color }}>{cfg.icon}</span>
        <div>
          <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-[0.2em]">DecisÃ£o do Motor</p>
          <p className="text-3xl font-mono font-bold"
            style={{ color: cfg.color, textShadow: `0 0 20px ${cfg.color}66` }}>
            {cfg.label}
          </p>
        </div>
      </div>
      <div className="text-right hidden sm:block">
        <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-[0.15em]">
          {decision === 'SEM ENTRADA' ? 'Regras nÃ£o satisfeitas' : 'Todas as regras aprovadas'}
        </p>
        <p className="text-xs font-mono" style={{ color: cfg.color }}>
          {decision === 'SEM ENTRADA' ? 'Aguardar setup completo' : 'Operar com gestÃ£o de risco'}
        </p>
      </div>
    </div>
  );
}

// â”€â”€ Toggle â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function Toggle({ checked, onChange, disabled, accentColor }: {
  checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; accentColor?: string;
}) {
  const accent = accentColor ?? 'var(--color-primary)';
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full border-2 transition-all duration-300 focus:outline-none
        ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
      style={checked
        ? { background: `${accentColor ?? 'var(--color-primary)'}1a`, borderColor: accentColor ?? 'var(--color-primary)' }
        : { background: 'var(--color-background)', borderColor: 'var(--color-border)' }}
    >
      <span
        className="inline-block h-4 w-4 transform rounded-full transition-transform duration-300"
        style={checked
          ? { transform: 'translateX(20px)', background: accentColor ?? 'var(--color-primary)', boxShadow: `0 0 8px ${accentColor ?? 'var(--color-primary)'}` }
          : { transform: 'translateX(2px)', background: 'var(--color-muted-foreground)', opacity: 0.4 }}
      />
    </button>
  );
}

// â”€â”€ Market status badge â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function MarketStatusBadge({ decision }: { decision: Decision | null }) {
  if (!decision) return (
    <span className="text-xs font-mono text-muted-foreground/50 uppercase tracking-[0.15em]">â€”</span>
  );
  const cfg = {
    BUY:           { color: '#00ff66', label: 'COMPRA'      },
    SELL:          { color: '#ff4444', label: 'VENDA'       },
    'SEM ENTRADA': { color: '#ffaa00', label: 'SEM ENTRADA' },
  }[decision];
  return (
    <span className="text-sm font-mono font-bold uppercase tracking-[0.1em]"
      style={{ color: cfg.color, textShadow: `0 0 8px ${cfg.color}44` }}>
      {cfg.label}
    </span>
  );
}

// â”€â”€ Price levels bar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function PriceLevelsBar({ entry, stopLoss, target1, target2 }: {
  entry: string; stopLoss: string; target1: string; target2: string;
}) {
  const levels = [
    { label: 'ENTRADA', value: entry,    color: '#00f0ff', icon: <Crosshair  className="w-3 h-3" /> },
    { label: 'STOP',    value: stopLoss, color: '#ff4444', icon: <ShieldAlert className="w-3 h-3" /> },
    { label: 'ALVO 1',  value: target1,  color: '#00ff66', icon: <Target      className="w-3 h-3" /> },
    { label: 'ALVO 2',  value: target2,  color: '#00cc55', icon: <Target      className="w-3 h-3" /> },
  ];
  return (
    <div className="flex border-b border-border/50 overflow-x-auto">
      {levels.map((l, i) => (
        <div key={i}
          className="flex-1 min-w-[80px] flex flex-col gap-1 px-4 py-2.5 border-r border-border/40 last:border-r-0"
          style={{ background: `${l.color}06` }}>
          <div className="flex items-center gap-1.5" style={{ color: l.color }}>
            {l.icon}
            <span className="text-[9px] font-mono uppercase tracking-[0.15em] opacity-70">{l.label}</span>
          </div>
          <span className="text-xs font-mono font-bold tabular-nums" style={{ color: l.color }}>{l.value}</span>
        </div>
      ))}
    </div>
  );
}

// â”€â”€ Motivos section â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function MotivosSection({ steps }: { steps: RuleStep[] }) {
  const failed = steps.filter(s => s.status === 'FAIL' && s.number < 7);
  if (failed.length === 0) return null;
  return (
    <div className="border border-[#ff4444]/25 bg-[#ff444408] relative overflow-hidden">
      <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-[#ff4444]" />
      <div className="p-4 pl-5 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5 text-[#ff4444]" />
          <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#ff4444]/80">
            Motivos â€” {failed.length} regra{failed.length > 1 ? 's' : ''} reprovada{failed.length > 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex flex-col gap-3">
          {failed.map(step => (
            <div key={step.number} className="flex gap-3">
              <span className="text-[10px] font-mono text-muted-foreground/40 mt-0.5 flex-shrink-0 tabular-nums">
                {String(step.number).padStart(2, '0')}
              </span>
              <div className="flex flex-col gap-0.5">
                <span className="text-[11px] font-mono text-[#ff4444]/80 uppercase tracking-[0.1em]">{step.name}</span>
                <span className="text-[11px] font-mono text-foreground/50 leading-relaxed">{step.reason}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// â”€â”€ O que falta â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function OQueFaltaSection({ steps }: { steps: RuleStep[] }) {
  const needItems = steps.filter(s => s.status === 'FAIL' && s.number < 7 && s.missing);
  if (needItems.length === 0) return null;
  return (
    <div className="border border-[#ffaa00]/25 bg-[#ffaa0008] relative overflow-hidden">
      <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-[#ffaa00]" />
      <div className="p-4 pl-5 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Lightbulb className="w-3.5 h-3.5 text-[#ffaa00]" />
          <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#ffaa00]/80">
            O que falta â€” {needItems.length} confirmaÃ§Ã£o{needItems.length > 1 ? 'Ãµes' : ''} pendente{needItems.length > 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex flex-col gap-2">
          {needItems.map(step => (
            <div key={step.number} className="flex items-start gap-2">
              <span className="text-[#ffaa00]/60 text-[11px] font-mono mt-0.5 flex-shrink-0">â†’</span>
              <span className="text-[11px] font-mono text-foreground/60 leading-relaxed">{step.missing}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// â”€â”€ Position parameters panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function PositionParamsPanel({ entry, stopLoss, target1, target2, riskReward, direction }: {
  entry: string; stopLoss: string; target1: string; target2: string;
  riskReward: string; direction: Decision;
}) {
  const accent = direction === 'BUY' ? '#00ff66' : '#ff4444';
  return (
    <div className="border border-primary/25 bg-card/30 p-5 relative overflow-hidden flex flex-col gap-4">
      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-[0.2em]">
          ParÃ¢metros da OperaÃ§Ã£o
        </span>
        <span className="text-[10px] font-mono font-bold px-2 py-0.5 border"
          style={{ color: accent, borderColor: `${accent}44`, background: `${accent}12` }}>
          R/R {riskReward}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-5">
        <PriceBlock label="Entrada"   value={entry}    accent="#00f0ff" icon={<Crosshair  className="w-3 h-3" />} />
        <PriceBlock label="Stop Loss" value={stopLoss} accent="#ff4444" icon={<ShieldAlert className="w-3 h-3" />} />
        <PriceBlock label="Alvo 1"    value={target1}  accent="#00ff66" icon={<Target      className="w-3 h-3" />} />
        <PriceBlock label="Alvo 2"    value={target2}  accent="#00cc55" icon={<Target      className="w-3 h-3" />} />
      </div>
    </div>
  );
}

// â”€â”€ S/R levels panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function SRLevelsPanel({ support, resistance }: { support: string | null; resistance: string | null }) {
  if (!support && !resistance) return null;
  return (
    <div className="border border-border/50 bg-card/30 p-4 flex flex-col gap-3">
      <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-[0.2em]">
        NÃ­veis Identificados (15M)
      </span>
      {resistance && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-mono text-[#ff4444]/80 uppercase tracking-wider">
            <ArrowUpRight className="w-3 h-3" /> ResistÃªncia
          </div>
          <span className="font-mono font-bold text-[#ff4444]">{resistance}</span>
        </div>
      )}
      {support && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-mono text-[#00ff66]/80 uppercase tracking-wider">
            <ArrowDownRight className="w-3 h-3" /> Suporte
          </div>
          <span className="font-mono font-bold text-[#00ff66]">{support}</span>
        </div>
      )}
    </div>
  );
}

// â”€â”€ Demo status badge â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function DemoStatusBadge({ enabled, limited, reason }: {
  enabled: boolean; limited: boolean; reason?: string;
}) {
  if (!enabled) return (
    <span className="text-[10px] font-mono text-muted-foreground/50 uppercase tracking-[0.15em]">
      DEMO DESATIVADO
    </span>
  );
  if (limited) return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-mono font-bold text-[#ff4444] uppercase tracking-[0.1em] flex items-center gap-1">
        <Pause className="w-3 h-3" /> DEMO PAUSADO POR LIMITE DE RISCO
      </span>
      {reason && <span className="text-[9px] font-mono text-[#ff4444]/60">{reason}</span>}
    </div>
  );
  return (
    <div className="flex items-center gap-2">
      <div className="relative flex items-center justify-center">
        <div className="absolute w-2.5 h-2.5 rounded-full animate-ping bg-[#00f0ff]/30" />
        <div className="relative w-1.5 h-1.5 rounded-full bg-[#00f0ff]" />
      </div>
      <span className="text-[10px] font-mono font-bold text-[#00f0ff] uppercase tracking-[0.15em]">
        DEMO 24H ATIVO
      </span>
    </div>
  );
}

// â”€â”€ Main â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function MobileMiniCell({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="min-w-0 border border-border/40 bg-background/25 px-3 py-2">
      <p className="text-[8px] font-mono uppercase tracking-[0.14em] text-muted-foreground truncate">{label}</p>
      <p className="mt-0.5 text-xs font-mono font-bold uppercase tabular-nums truncate" style={{ color }}>{value}</p>
    </div>
  );
}

function MobileEmptyOperation({ safeLimited, safeReason, countdown }: { safeLimited: boolean; safeReason?: string; countdown: string }) {
  return (
    <section className="lg:hidden border border-[#00f0ff]/20 bg-[#00f0ff]/[0.04] p-3">
      <div className="flex items-center gap-3">
        <Bot className="w-5 h-5 text-[#00f0ff]/60 flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-[#00f0ff]">Sem operacao aberta</p>
          <p className="mt-1 text-[10px] font-mono text-muted-foreground/70 leading-snug break-words">
            {safeLimited ? safeReason ?? 'Novas operacoes pausadas por limite de risco.' : `Proxima leitura demo em ${countdown}.`}
          </p>
        </div>
      </div>
    </section>
  );
}

function MobileActions({
  canAnalyze,
  analyzing,
  loading,
  demoEnabled,
  marketError,
  onAnalyze,
  onRefresh,
  onAutomationChange,
}: {
  canAnalyze: boolean;
  analyzing: boolean;
  loading: boolean;
  demoEnabled: boolean;
  marketError: string | null;
  onAnalyze: () => void;
  onRefresh: () => void;
  onAutomationChange: (enabled: boolean) => void;
}) {
  return (
    <section className="lg:hidden grid grid-cols-2 gap-2">
      <button
        onClick={onAnalyze}
        disabled={!canAnalyze}
        className={`min-h-11 border px-3 py-3 text-[10px] font-mono font-bold uppercase tracking-[0.14em] flex items-center justify-center gap-2 ${
          canAnalyze ? 'bg-primary text-primary-foreground border-primary' : 'bg-primary/10 text-primary/40 border-primary/20'
        }`}
      >
        <Zap className="w-3.5 h-3.5" />
        {analyzing ? 'Analisando' : 'Analisar'}
      </button>
      <button
        onClick={onRefresh}
        disabled={loading}
        className="min-h-11 border border-border/60 bg-card/40 px-3 py-3 text-[10px] font-mono font-bold uppercase tracking-[0.14em] flex items-center justify-center gap-2 text-foreground"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        Atualizar
      </button>
      <div className="col-span-2 min-h-11 flex items-center justify-between border border-[#00f0ff]/25 bg-[#00f0ff]/[0.04] px-3 py-2">
        <div className="min-w-0">
          <p className="text-[9px] font-mono uppercase tracking-[0.16em] text-muted-foreground">Automacao demo</p>
          <p className="text-[10px] font-mono uppercase truncate" style={{ color: demoEnabled ? '#00f0ff' : '#ffaa00' }}>
            {demoEnabled ? 'Ativa no servidor' : 'Inativa'}
          </p>
        </div>
        <Toggle checked={demoEnabled} onChange={onAutomationChange} disabled={loading || !!marketError} accentColor="#00f0ff" />
      </div>
    </section>
  );
}

function MobilePanelOverview({ session }: { session: DemoSession }) {
  const balanceColor = isFiniteNumber(session.balance) && isFiniteNumber(session.configuredBalance)
    ? (session.balance >= session.configuredBalance ? '#00ff66' : '#ff4444')
    : '#aaaaaa';
  return (
    <section className="lg:hidden border border-border/60 bg-card/40 p-3">
      <div className="grid grid-cols-2 gap-2">
        <MobileMiniCell label="Saldo demo" value={fmtCurrency(session.balance)} color={balanceColor} />
        <MobileMiniCell label="P&L dia" value={fmtSignedCurrency(session.dailyStats?.dailyPnL)} color={signedColor(session.dailyStats?.dailyPnL)} />
        <MobileMiniCell label="Flutuante" value={fmtSignedCurrency(session.unrealizedPnlUSDC)} color={signedColor(session.unrealizedPnlUSDC)} />
        <MobileMiniCell label="Abertas" value={session.activeTrade ? '1' : '0'} color={session.activeTrade ? '#00f0ff' : '#aaaaaa'} />
        <MobileMiniCell label="Trades" value={isFiniteNumber(session.dailyStats?.totalTrades) ? String(session.dailyStats.totalTrades) : 'â€”'} color="#ffffff" />
        <MobileMiniCell label="W/L/BE" value={`${isFiniteNumber(session.dailyStats?.wins) ? session.dailyStats.wins : 'â€”'}/${isFiniteNumber(session.dailyStats?.losses) ? session.dailyStats.losses : 'â€”'}/${isFiniteNumber(session.dailyStats?.breakevens) ? session.dailyStats.breakevens : 'â€”'}`} color="#ffffff" />
        <MobileMiniCell label="Drawdown" value={fmtCurrency(session.dailyStats?.maxDrawdown)} color="#ffaa00" />
        <MobileMiniCell label="Risco aberto" value={fmtCurrency(session.openRiskUSDC)} color="#ffaa00" />
      </div>
    </section>
  );
}

type MobileTab = 'summary' | 'operations' | 'radar' | 'audit' | 'more';

function shortSymbol(symbol: string): string {
  return symbol.replace('USDT', '');
}

function directionColor(direction: string | null | undefined): string {
  if (direction === 'BUY' || direction === 'COMPRA') return '#00ff66';
  if (direction === 'SELL' || direction === 'VENDA') return '#ff4444';
  return '#ffaa00';
}

function MobileBottomNav({ tab, onChange }: { tab: MobileTab; onChange: (tab: MobileTab) => void }) {
  const items: Array<{ key: MobileTab; label: string; icon: React.ReactNode }> = [
    { key: 'summary', label: 'Resumo', icon: <Activity className="w-4 h-4" /> },
    { key: 'operations', label: 'Operacoes', icon: <Crosshair className="w-4 h-4" /> },
    { key: 'radar', label: 'Radar', icon: <Bot className="w-4 h-4" /> },
    { key: 'audit', label: 'Auditor', icon: <ShieldAlert className="w-4 h-4" /> },
    { key: 'more', label: 'Mais', icon: <ChevronUp className="w-4 h-4" /> },
  ];
  return (
    <nav className="lg:hidden fixed inset-x-0 bottom-0 z-50 border-t border-border/70 bg-background/95 backdrop-blur-xl px-2 pt-1.5 pb-[calc(0.45rem+env(safe-area-inset-bottom))]">
      <div className="grid grid-cols-5 gap-1">
        {items.map((item) => {
          const active = tab === item.key;
          return (
            <button
              key={item.key}
              onClick={() => onChange(item.key)}
              className={`min-h-12 flex flex-col items-center justify-center gap-1 border text-[8px] font-mono uppercase tracking-[0.08em] transition-all ${
                active
                  ? 'border-primary/70 bg-primary/15 text-primary shadow-[0_0_14px_rgba(0,216,255,0.18)]'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {item.icon}
              <span className="leading-none truncate max-w-full">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function MobileSection({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="border border-border/55 bg-card/35 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-foreground/85 truncate">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function MobileSummaryTab({
  session,
  apiOnline,
  binanceOnline,
  demoEnabled,
  safeLimited,
  safeReason,
  agents,
  globalRisk,
  canAnalyze,
  analyzing,
  onAnalyze,
}: {
  session: DemoSession;
  apiOnline: boolean;
  binanceOnline: boolean;
  demoEnabled: boolean;
  safeLimited: boolean;
  safeReason?: string;
  agents: ReturnType<typeof useDemoAgents>['agents'];
  globalRisk: ReturnType<typeof useDemoAgents>['globalRisk'];
  canAnalyze: boolean;
  analyzing: boolean;
  onAnalyze: () => void;
}) {
  const systemOnline = apiOnline && binanceOnline;
  return (
    <div className="flex flex-col gap-3">
      <MobileSection title="Status">
        <div className="grid grid-cols-2 gap-2">
          <MobileMiniCell label="Sistema" value={systemOnline ? 'Online' : 'Offline'} color={systemOnline ? '#00ff66' : '#ff4444'} />
          <MobileMiniCell label="Demo" value={demoEnabled ? safeLimited ? 'Pausado' : 'Ativo' : 'Inativo'} color={demoEnabled && !safeLimited ? '#00f0ff' : '#ffaa00'} />
        </div>
        {safeLimited && <p className="mt-2 text-[10px] font-mono text-[#ffaa00] leading-snug">{safeReason}</p>}
      </MobileSection>

      <MobileSection title="Banca">
        <div className="grid grid-cols-2 gap-2">
          <MobileMiniCell label="Saldo" value={fmtCurrency(session.balance)} color="#ffffff" />
          <MobileMiniCell label="P&L dia" value={fmtSignedCurrency(session.dailyStats?.dailyPnL)} color={signedColor(session.dailyStats?.dailyPnL)} />
          <MobileMiniCell label="Risco aberto" value={fmtCurrency(session.openRiskUSDC)} color="#ffaa00" />
          <MobileMiniCell label="Posicoes" value={`${globalRisk.openPositionsCount}/3`} color={globalRisk.openPositionsCount > 0 ? '#00f0ff' : '#aaaaaa'} />
        </div>
      </MobileSection>

      <MobileSection title="Ativos">
        <div className="grid grid-cols-3 gap-2">
          {Object.values(agents).map((agent) => (
            <div key={agent.agentId} className="border border-border/40 bg-background/25 px-2 py-2 min-w-0">
              <p className="text-[8px] font-mono uppercase text-muted-foreground truncate">{shortSymbol(agent.symbol)}</p>
              <p className="mt-0.5 text-[10px] font-mono font-bold uppercase truncate" style={{ color: directionColor(agent.lastDecision) }}>
                {agent.lastDecision}
              </p>
              <p className="text-[9px] font-mono text-muted-foreground/70">Indice {agent.oracleScore}</p>
            </div>
          ))}
        </div>
      </MobileSection>

      <button
        onClick={onAnalyze}
        disabled={!canAnalyze}
        className={`min-h-12 w-full border px-4 py-3 text-[11px] font-mono font-bold uppercase tracking-[0.16em] flex items-center justify-center gap-2 ${
          canAnalyze ? 'border-primary bg-primary text-primary-foreground' : 'border-primary/20 bg-primary/10 text-primary/40'
        }`}
      >
        <Zap className="w-4 h-4" />
        {analyzing ? 'Analisando' : 'Analisar agora'}
      </button>
    </div>
  );
}

function MobileOperationCard({ trade, currentPrice }: { trade: NonNullable<DemoSession['activeTrade']>; currentPrice: number | null }) {
  const remainingSize = trade.remainingPositionSize ?? trade.positionSize;
  const floating = currentPrice !== null
    ? trade.direction === 'BUY'
      ? (currentPrice - trade.entry) * remainingSize
      : (trade.entry - currentPrice) * remainingSize
    : null;
  const ageMs = Date.now() - trade.openTime;
  return (
    <article className="border border-primary/25 bg-primary/[0.04] p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-mono font-bold uppercase tracking-[0.16em]" style={{ color: directionColor(trade.direction) }}>
            {trade.direction} {trade.pair}
          </p>
          <p className="text-[9px] font-mono text-muted-foreground/70">Aberta ha {fmtDuration(ageMs)}</p>
        </div>
        <p className="text-xs font-mono font-bold tabular-nums" style={{ color: signedColor(floating) }}>{fmtSignedCurrency(floating)}</p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <MobileMiniCell label="Entrada" value={fmtCurrency(trade.entry)} color="#ffffff" />
        <MobileMiniCell label="Atual" value={fmtCurrency(currentPrice)} color="#00f0ff" />
        <MobileMiniCell label="Stop" value={fmtCurrency(trade.stopLoss)} color="#ff4444" />
        <MobileMiniCell label="Alvo" value={fmtCurrency(trade.target1Hit ? trade.target2 : trade.target1)} color="#00ff66" />
      </div>
    </article>
  );
}

function MobileCompactHistory({ history }: { history: DemoSession['history'] }) {
  const recent = history.slice(0, 4);
  if (recent.length === 0) {
    return <p className="text-[10px] font-mono text-muted-foreground/60">Historico vazio.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      {recent.map((trade) => (
        <div key={trade.id} className="flex items-center justify-between gap-2 border border-border/35 bg-background/20 px-3 py-2">
          <div className="min-w-0">
            <p className="text-[10px] font-mono font-bold uppercase truncate">{trade.pair} {trade.direction}</p>
            <p className="text-[9px] font-mono text-muted-foreground/60 truncate">{trade.exitReason ?? trade.status}</p>
          </div>
          <p className="text-[10px] font-mono font-bold tabular-nums" style={{ color: signedColor(trade.pnlUSDC) }}>{fmtSignedCurrency(trade.pnlUSDC)}</p>
        </div>
      ))}
    </div>
  );
}

function MobileOperationsTab({ session, currentPrice, countdown, safeLimited, safeReason }: {
  session: DemoSession;
  currentPrice: number | null;
  countdown: string;
  safeLimited: boolean;
  safeReason?: string;
}) {
  const openTrades = session.activeTrade ? [session.activeTrade] : [];
  return (
    <div className="flex flex-col gap-3">
      <MobileSection title="Operacoes abertas">
        {openTrades.length > 0 ? (
          <div className="flex flex-col gap-2">
            {openTrades.map((trade) => <MobileOperationCard key={trade.id} trade={trade} currentPrice={currentPrice} />)}
          </div>
        ) : (
          <MobileEmptyOperation safeLimited={safeLimited} safeReason={safeReason} countdown={countdown} />
        )}
        <p className="mt-2 text-[9px] font-mono text-muted-foreground/45 leading-snug">
          Fonte atual do frontend expõe uma posição ativa por sessão; múltiplas posições abertas serão listadas quando a API fornecer a coleção completa.
        </p>
      </MobileSection>
      <MobileSection title="Historico recente">
        <MobileCompactHistory history={session.history} />
      </MobileSection>
    </div>
  );
}

function mainRadarReason(analysis: ReturnType<typeof useMarketRadar>['analysis']): string {
  if (!analysis) return 'Aguardando leitura.';
  return analysis.decisiveReason || analysis.blockedReasons[0] || analysis.missingConditions[0] || 'Sem motivo decisivo.';
}

function MobileRadarTab({
  analysis,
  loading,
  error,
  agents,
  selectedSymbol,
  onSymbolChange,
}: {
  analysis: ReturnType<typeof useMarketRadar>['analysis'];
  loading: boolean;
  error: string | null;
  agents: ReturnType<typeof useDemoAgents>['agents'];
  selectedSymbol: ReturnType<typeof useMarketRadar>['symbol'];
  onSymbolChange: ReturnType<typeof useMarketRadar>['setSymbol'];
}) {
  return (
    <div className="flex flex-col gap-3">
      <MobileSection title="Radar">
        <div className="grid grid-cols-1 gap-2">
          {Object.values(agents).map((agent) => {
            const selected = agent.symbol === selectedSymbol;
            const source = selected ? analysis : null;
            const direction = source?.suggestedDirection ?? agent.lastDecision;
            const score = source?.score ?? agent.oracleScore;
            return (
              <button
                key={agent.agentId}
                onClick={() => onSymbolChange(agent.symbol)}
                className={`min-h-20 border p-3 text-left ${selected ? 'border-primary/70 bg-primary/[0.08]' : 'border-border/45 bg-background/20'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-mono font-bold uppercase tracking-[0.16em]">{shortSymbol(agent.symbol)}</span>
                  <span className="text-xs font-mono font-bold" style={{ color: directionColor(direction) }}>{direction}</span>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-1 text-[9px] font-mono text-muted-foreground">
                  <span>Score <b className="text-foreground">{score}</b></span>
                  <span>1h <b className="text-foreground">{source?.trend1h ?? '-'}</b></span>
                  <span>15m <b className="text-foreground">{source?.trend15m ?? '-'}</b></span>
                </div>
                <p className="mt-2 text-[10px] font-mono text-muted-foreground/75 line-clamp-2">
                  {selected ? mainRadarReason(analysis) : 'Toque para carregar a analise completa deste ativo.'}
                </p>
              </button>
            );
          })}
        </div>
        {loading && <p className="mt-2 text-[10px] font-mono text-primary">Atualizando radar...</p>}
        {error && <p className="mt-2 text-[10px] font-mono text-[#ff4444]">{error}</p>}
      </MobileSection>
    </div>
  );
}

function MobileAuditTab({ entries, loading, error }: { entries: EngineAuditEntry[]; loading: boolean; error: string | null }) {
  const latest = entries[0] ?? null;
  const insight = buildEngineAuditInsight(latest);
  return (
    <div className="flex flex-col gap-3">
      <MobileSection title="Auditor">
        {loading && <p className="text-[10px] font-mono text-primary">Carregando auditoria...</p>}
        {error && <p className="text-[10px] font-mono text-[#ff4444]">{error}</p>}
        {!loading && !error && latest && (
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[10px] font-mono font-bold uppercase tracking-[0.16em]">{latest.symbol}</p>
                <p className="text-[9px] font-mono text-muted-foreground">{insight.stageLabel}</p>
              </div>
              <p className="text-xs font-mono font-bold text-primary">{insight.progressPct}%</p>
            </div>
            <div className="h-1.5 bg-border/50 overflow-hidden">
              <div className="h-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, insight.progressPct))}%` }} />
            </div>
            <p className="text-[10px] font-mono text-foreground/75 leading-snug">{insight.decisiveReason}</p>
            <div className="grid grid-cols-1 gap-2">
              <MobileAuditList title="Confirmado" items={insight.confirmed} color="#00ff66" />
              <MobileAuditList title="Pendente" items={insight.pending} color="#ffaa00" />
            </div>
          </div>
        )}
        {!loading && !error && !latest && <p className="text-[10px] font-mono text-muted-foreground/60">Nenhum registro de auditoria encontrado.</p>}
      </MobileSection>
    </div>
  );
}

function MobileAuditList({ title, items, color }: { title: string; items: string[]; color: string }) {
  return (
    <div className="border border-border/35 bg-background/20 px-3 py-2">
      <p className="text-[8px] font-mono uppercase tracking-[0.14em]" style={{ color }}>{title}</p>
      <p className="mt-1 text-[10px] font-mono text-muted-foreground/75 leading-snug">
        {items.length > 0 ? items.slice(0, 4).join(', ') : 'Sem dados.'}
      </p>
    </div>
  );
}

let alertIdCounter = 0;

export default function Home() {
  const online = useOnlineStatus();
  // Chart controls
  const [selectedPair, setSelectedPair] = useState<string>('BTCUSDT');
  const [tvInterval,   setTvInterval]   = useState<TVInterval>('5');
  const tvSymbol = `BINANCE:${selectedPair}`;

  // Manual analysis
  const [analyzing,    setAnalyzing]    = useState(false);
  const [result,       setResult]       = useState<EngineResult | null>(null);
  const [resultTime,   setResultTime]   = useState<Date | null>(null);

  // Auto mode (schedule-gated, Monâ€“Fri 08:30â€“17:00 SP)
  const [autoEnabled,  setAutoEnabled]  = useState(false);

  // Steps expand/collapse
  const [stepsExpanded, setStepsExpanded] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>('summary');
  const [mobileChartOpen, setMobileChartOpen] = useState(false);
  const [mobileAuditEntries, setMobileAuditEntries] = useState<EngineAuditEntry[]>([]);
  const [mobileAuditLoading, setMobileAuditLoading] = useState(false);
  const [mobileAuditError, setMobileAuditError] = useState<string | null>(null);
  const manualAnalyzeTimeoutRef = useRef<number | null>(null);

  // Alerts
  const [alerts, setAlerts] = useState<AlertMsg[]>([]);
  const prevDecisionRef = useRef<Decision | null>(null);

  // SP clock
  const [spClock, setSpClock] = useState(fmtSPNow);
  const [isOp,    setIsOp]    = useState(checkOperational);
  const [authLoading, setAuthLoading] = useState(true);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const isAuthenticated = !!authUser;
  useEffect(() => {
    const id = setInterval(() => {
      setSpClock(fmtSPNow());
      setIsOp(checkOperational());
    }, 1_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getAuth()
      .then((auth) => {
        if (cancelled) return;
        setAuthUser(auth.authenticated ? auth.user ?? null : null);
        setAuthError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setAuthUser(null);
        setAuthError(err instanceof Error ? err.message : 'Falha ao verificar sessao.');
      })
      .finally(() => {
        if (!cancelled) setAuthLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const handleLogin = useCallback((username: string, password: string) => {
    setAuthLoading(true);
    setAuthError(null);
    void loginUser(username, password)
      .then((auth) => {
        setAuthUser(auth.authenticated ? auth.user ?? null : null);
        if (!auth.authenticated) setAuthError('Credenciais invalidas.');
      })
      .catch((err) => {
        setAuthUser(null);
        setAuthError(err instanceof Error ? err.message : 'Credenciais invalidas.');
      })
      .finally(() => setAuthLoading(false));
  }, []);

  const handleLogout = useCallback(() => {
    setAuthLoading(true);
    if (manualAnalyzeTimeoutRef.current !== null) {
      window.clearTimeout(manualAnalyzeTimeoutRef.current);
      manualAnalyzeTimeoutRef.current = null;
    }
    setAutoEnabled(false);
    setAnalyzing(false);
    setResult(null);
    setResultTime(null);
    setStepsExpanded(false);
    setMobileChartOpen(false);
    setAlerts([]);
    prevDecisionRef.current = null;
    prevDemoDecisionRef.current = null;
    setAuthUser(null);
    void logoutUser()
      .catch(() => undefined)
      .finally(() => {
        setAuthLoading(false);
      });
  }, []);

  const market = useBinanceData(isAuthenticated);
  const apiHealth = useApiHealth(isAuthenticated);
  const publicOracle = useOracleGlobalState(!isAuthenticated);
  const radar = useMarketRadar(isAuthenticated);
  const demoAgents = useDemoAgents(radar.analysis);

  // â”€â”€ Demo trading â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const {
    session: demoSession,
    feedSignal,
    updatePrice,
    resetSession,
    setConfiguredBalance,
    automationEnabled: demoEnabled,
    serverError: demoServerError,
    setAutomationEnabled,
  } = useDemoTrading(isAuthenticated);
  const activeTradePair = demoSession.activeTrade?.pair ?? null;
  const [activeTradePrice, setActiveTradePrice] = useState<number | null>(null);
  const activeTradeCurrentPrice = activeTradePair ? activeTradePrice : null;
  const oracleVisualState = resolveOracleVisualState({
    authenticated: isAuthenticated,
    apiError: apiHealth.error || demoServerError,
    activeTrade: demoSession.activeTrade,
    worker: apiHealth.health?.worker,
  });

  useEffect(() => {
    if (!isAuthenticated || !activeTradePair) {
      setActiveTradePrice(null);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    const refreshActiveTradePrice = async () => {
      try {
        const price = await fetchPrice(activeTradePair, controller.signal);
        if (!cancelled) setActiveTradePrice(Number.isFinite(price) && price > 0 ? price : null);
      } catch {
        if (!cancelled) setActiveTradePrice(null);
      }
    };
    void refreshActiveTradePrice();
    const id = window.setInterval(refreshActiveTradePrice, 30_000);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(id);
    };
  }, [isAuthenticated, activeTradePair]);

  // Feed the active trade's own pair price into the demo state machine.
  useEffect(() => {
    if (isAuthenticated && activeTradePair && activeTradeCurrentPrice !== null) {
      updatePrice(activeTradeCurrentPrice, activeTradePair);
    }
  }, [activeTradeCurrentPrice, activeTradePair, isAuthenticated, updatePrice]);

  useEffect(() => {
    if (!isAuthenticated) {
      setMobileAuditEntries([]);
      setMobileAuditLoading(false);
      setMobileAuditError(null);
      return;
    }
    let cancelled = false;
    const loadAudit = async () => {
      setMobileAuditLoading(true);
      setMobileAuditError(null);
      try {
        const response = await fetchEngineAuditLog({ limit: 6 });
        if (!cancelled) setMobileAuditEntries(response.entries);
      } catch (err) {
        if (!cancelled) setMobileAuditError(err instanceof Error ? err.message : 'Falha ao carregar auditoria.');
      } finally {
        if (!cancelled) setMobileAuditLoading(false);
      }
    };
    void loadAudit();
    const id = window.setInterval(loadAudit, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [isAuthenticated]);

  const maxDailyTrades = demoSession.settings?.maxDailyTrades ?? 0;
  const safeLimited = demoSession.safetyLimit?.limited ?? false;
  const safeReason  = safeLimited ? demoSession.safetyLimit?.reason : undefined;

  // â”€â”€ Alert emission â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const pushAlert = useCallback((msg: Omit<AlertMsg, 'id'>) => {
    const id = ++alertIdCounter;
    setAlerts(prev => [...prev, { ...msg, id }]);
  }, []);

  const dismissAlert = useCallback((id: number) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  }, []);

  // â”€â”€ Manual+Auto result handler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const handleResult = useCallback((res: EngineResult, triggeredAt?: Date) => {
    setResult(res);
    setResultTime(triggeredAt ?? new Date());

    const prev = prevDecisionRef.current;
    const curr = res.decision;

    if (prev !== null && prev !== curr) {
      if (prev === 'SEM ENTRADA' && curr === 'BUY') {
        pushAlert({ kind: 'buy',  title: 'Sinal de Compra Detectado',
          body: 'O motor identificou um setup de COMPRA. Verifique os nÃ­veis e aplique gestÃ£o de risco.' });
      } else if (prev === 'SEM ENTRADA' && curr === 'SELL') {
        pushAlert({ kind: 'sell', title: 'Sinal de Venda Detectado',
          body: 'O motor identificou um setup de VENDA. Verifique os nÃ­veis e aplique gestÃ£o de risco.' });
      } else if ((prev === 'BUY' || prev === 'SELL') && curr === 'SEM ENTRADA') {
        const prevLabel = prev === 'BUY' ? 'COMPRA' : 'VENDA';
        pushAlert({ kind: 'invalidated', title: `Setup de ${prevLabel} Invalidado`,
          body: 'As condiÃ§Ãµes do setup anterior deixaram de ser satisfeitas. Sinal cancelado.' });
      }
    }
    prevDecisionRef.current = curr;
  }, [pushAlert]);

  // â”€â”€ Demo signal handler (24/7, separate callback) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const prevDemoDecisionRef = useRef<Decision | null>(null);

  const handleDemoSignal = useCallback((res: EngineResult) => {
    // If signal changed to BUY/SELL, attempt to open a demo trade
    if (res.decision !== 'SEM ENTRADA') {
      const prev = prevDemoDecisionRef.current;
      if (prev === 'SEM ENTRADA' || prev === null) {
        feedSignal(res, selectedPair);
        if (!safeLimited) {
          const label = res.decision === 'BUY' ? 'COMPRA' : 'VENDA';
          pushAlert({
            kind: 'demo',
            title: `Demo â€” OperaÃ§Ã£o de ${label} Aberta`,
            body: `OperaÃ§Ã£o simulada de ${label} registrada em ${selectedPair}. Acompanhe no painel demo.`,
          });
        }
      }
    }
    prevDemoDecisionRef.current = res.decision;
  }, [feedSignal, selectedPair, safeLimited, pushAlert]);

  // â”€â”€ Auto-analysis hook (schedule-gated, Monâ€“Fri 08:30â€“17:00 SP) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const autoState = useAutoAnalysis({
    enabled:    isAuthenticated && autoEnabled,
    candles1h:  market.candles1h,
    candles15m: market.candles15m,
    candles5m:  market.candles5m,
    price:      market.price,
    onResult:   handleResult,
  });

  // â”€â”€ Demo auto-analysis hook (24/7, no schedule gate) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const demoAutoState = useDemoAutoAnalysis({
    enabled:    isAuthenticated && demoEnabled && !market.loading && !market.error,
    candles1h:  market.candles1h,
    candles15m: market.candles15m,
    candles5m:  market.candles5m,
    price:      market.price,
    onResult:   handleDemoSignal,
  });

  // â”€â”€ Manual analysis â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const canAnalyze =
    isAuthenticated && !analyzing && !market.loading && !market.error &&
    market.price !== null && market.candles1h.length > 20;

  const handleManualAnalyze = () => {
    if (!canAnalyze) return;
    if (manualAnalyzeTimeoutRef.current !== null) window.clearTimeout(manualAnalyzeTimeoutRef.current);
    setAnalyzing(true);
    setResult(null);
    manualAnalyzeTimeoutRef.current = window.setTimeout(() => {
      const res = runEngine(market.candles1h, market.candles15m, market.candles5m, market.price!);
      handleResult(res);
      setAnalyzing(false);
      manualAnalyzeTimeoutRef.current = null;
    }, 900);
  };

  const handleRefreshMobile = () => {
    if (!isAuthenticated) return;
    void market.refresh();
    void radar.refresh();
  };

  useEffect(() => () => {
    if (manualAnalyzeTimeoutRef.current !== null) {
      window.clearTimeout(manualAnalyzeTimeoutRef.current);
      manualAnalyzeTimeoutRef.current = null;
    }
  }, []);

  if (!online) {
    return <OfflineScreen />;
  }

  if (!authUser) {
    return <PremiumLanding loading={authLoading} error={authError} onLogin={handleLogin} state={publicOracle.state} />;
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // RENDER
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  return (
    <div className="premium-dashboard-shell min-h-screen w-full bg-background text-foreground font-sans selection:bg-primary/30 flex flex-col items-center p-4 sm:p-8 relative overflow-hidden">

      {/* Ambient glows */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />

      {/* â”€â”€ Alert toasts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="fixed top-6 right-6 z-[100] flex flex-col gap-2 items-end pointer-events-none">
        <AnimatePresence mode="popLayout">
          {alerts.map(msg => (
            <div key={msg.id} className="pointer-events-auto">
              <AlertToast msg={msg} onDismiss={() => dismissAlert(msg.id)} />
            </div>
          ))}
        </AnimatePresence>
      </div>

      {/* â”€â”€ Header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <header className="w-full max-w-5xl flex items-center justify-between mb-8 border-b border-border pb-6 pt-4 relative z-10">
        <div className="flex items-center gap-4">
          <div className="relative flex items-center justify-center w-10 h-10">
            <div className="absolute inset-0 bg-primary/20 rounded-sm animate-pulse" />
            <div className="relative w-4 h-4 bg-primary shadow-[0_0_15px_var(--color-primary)] rotate-45" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-mono font-bold tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-white to-white/70">
            {APP_NAME.toUpperCase()}<span className="text-primary ml-2">{APP_VERSION}</span>
          </h1>
        </div>
        <div className="hidden sm:flex items-center gap-3 text-xs font-mono text-primary bg-primary/10 px-4 py-2 border-l-2 border-primary">
          <OracleLiveStateBadge state={oracleVisualState} />
          <Activity className="w-4 h-4" />
          <span className="tracking-widest">{authUser.username}</span>
          <button
            onClick={handleLogout}
            className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground"
          >
            Sair
          </button>
        </div>
      </header>

      <main className="w-full max-w-5xl flex flex-col gap-5 relative z-10">
        <div className="sm:hidden">
          <OracleLiveStateBadge state={oracleVisualState} />
        </div>

        {/* â”€â”€ Live price â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <section className="hidden lg:block bg-card/50 backdrop-blur-md border border-border p-5 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
          {market.error ? (
            <div className="flex items-center gap-3 text-destructive font-mono text-sm min-w-0">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              <span className="min-w-0 whitespace-normal break-all">Falha Binance: {market.error}</span>
            </div>
          ) : market.loading ? (
            <div className="flex items-center gap-3 text-muted-foreground font-mono text-sm">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span className="tracking-widest text-xs uppercase">Conectando Ã  Binance...</span>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-end gap-4 justify-between">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground">
                  BTC / USDT Â· PreÃ§o Atual
                </span>
                <AnimatePresence mode="wait">
                  <motion.span
                    key={isFiniteNumber(market.price) ? market.price.toFixed(2) : 'price-loading'}
                    initial={{ opacity: 0.4, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25 }}
                    className="text-4xl sm:text-5xl font-mono font-bold text-white drop-shadow-[0_0_12px_rgba(255,255,255,0.15)]"
                  >
                    {fmtCurrency(market.price)}
                  </motion.span>
                </AnimatePresence>
              </div>
              {market.lastUpdate && (
                <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground bg-background/40 border border-border/50 px-4 py-2">
                  <Clock className="w-3.5 h-3.5 text-primary/70" />
                  <span className="tracking-widest">
                    {market.lastUpdate.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit' })} (SP)
                  </span>
                  <span className="text-primary/50 ml-1">Â· 30s</span>
                </div>
              )}
            </div>
          )}
        </section>

        {/* â”€â”€ Controls â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <section className="hidden lg:grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div className="border border-border/50 bg-card/30 px-4 py-3">
            <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-muted-foreground">API</span>
            <div className="mt-1 flex items-center gap-2">
              {apiHealth.error
                ? <AlertTriangle className="w-3.5 h-3.5 text-[#ff4444]" />
                : <Activity className="w-3.5 h-3.5 text-[#00ff66]" />
              }
              <span className={`text-[11px] font-mono font-bold uppercase ${apiHealth.error ? 'text-[#ff4444]' : 'text-[#00ff66]'}`}>
                {apiHealth.error ? 'Indisponivel' : apiHealth.loading ? 'Verificando' : 'Online'}
              </span>
            </div>
          </div>
          <div className="border border-border/50 bg-card/30 px-4 py-3">
            <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-muted-foreground">Binance</span>
            <div className="mt-1 flex items-center gap-2 min-w-0">
              {apiHealth.health?.binance.ok
                ? <Activity className="w-3.5 h-3.5 text-[#00ff66]" />
                : <AlertTriangle className="w-3.5 h-3.5 text-[#ffaa00]" />
              }
              <span className={`text-[11px] font-mono font-bold uppercase min-w-0 truncate ${apiHealth.health?.binance.ok ? 'text-[#00ff66]' : 'text-[#ffaa00]'}`}>
                {apiHealth.health?.binance.ok ? `${apiHealth.health.binance.latencyMs ?? 0}ms` : 'Degradada'}
              </span>
            </div>
          </div>
          <div className="border border-border/50 bg-card/30 px-4 py-3">
            <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-muted-foreground">Falhas</span>
            <p className="mt-1 text-[10px] font-mono text-muted-foreground/80 min-w-0 break-words">
              {apiHealth.error ?? (apiHealth.health?.binance.error ? 'Binance instavel; dados podem atrasar.' : 'Sem falhas criticas.')}
            </p>
          </div>
        </section>

        <div className="lg:hidden pb-24">
          {mobileTab === 'summary' && (
            <MobileSummaryTab
              session={demoSession}
              apiOnline={!apiHealth.error && !apiHealth.loading}
              binanceOnline={!!apiHealth.health?.binance.ok && !market.error}
              demoEnabled={demoEnabled}
              safeLimited={safeLimited}
              safeReason={safeReason}
              agents={demoAgents.agents}
              globalRisk={demoAgents.globalRisk}
              canAnalyze={canAnalyze}
              analyzing={analyzing}
              onAnalyze={handleManualAnalyze}
            />
          )}

          {mobileTab === 'operations' && (
            <MobileOperationsTab
              session={demoSession}
              currentPrice={activeTradeCurrentPrice}
              countdown={demoAutoState.countdown}
              safeLimited={safeLimited}
              safeReason={safeReason}
            />
          )}

          {mobileTab === 'radar' && (
            <MobileRadarTab
              analysis={radar.analysis}
              loading={radar.loading}
              error={radar.error}
              agents={demoAgents.agents}
              selectedSymbol={radar.symbol}
              onSymbolChange={radar.setSymbol}
            />
          )}

          {mobileTab === 'audit' && (
            <MobileAuditTab entries={mobileAuditEntries} loading={mobileAuditLoading} error={mobileAuditError} />
          )}

          {mobileTab === 'more' && (
            <div className="flex flex-col gap-3">
              <MobileActions
                canAnalyze={canAnalyze}
                analyzing={analyzing}
                loading={market.loading || radar.loading}
                demoEnabled={demoEnabled}
                marketError={market.error}
                onAnalyze={handleManualAnalyze}
                onRefresh={handleRefreshMobile}
                onAutomationChange={(enabled) => setAutomationEnabled(enabled, radar.symbol)}
              />
              <button
                onClick={() => setMobileChartOpen(open => !open)}
                className="flex min-h-11 items-center justify-between border border-border/60 bg-card/40 px-4 py-3"
              >
                <span className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
                  <BarChart2 className="w-3.5 h-3.5 text-primary" />
                  Grafico
                </span>
                {mobileChartOpen
                  ? <ChevronUp className="w-4 h-4 text-muted-foreground/60" />
                  : <ChevronDown className="w-4 h-4 text-muted-foreground/60" />
                }
              </button>
              <section className={`${mobileChartOpen ? 'block' : 'hidden'} bg-card/50 border border-border overflow-hidden`}>
                <TradingViewChart key={`mobile-${radar.symbol}-${tvInterval}`} symbol={`BINANCE:${radar.symbol}`} interval={tvInterval} height={320} />
              </section>
              <NotificationsPanel />
              <DemoStatsPanel
                stats={demoSession.dailyStats}
                currentBalance={demoSession.balance}
                configuredBalance={demoSession.configuredBalance}
                realizedPnl={demoSession.realizedPnlUSDC ?? 0}
                unrealizedPnl={demoSession.unrealizedPnlUSDC ?? 0}
                partialPnl={demoSession.partialPnlUSDC ?? 0}
                openRisk={demoSession.openRiskUSDC ?? 0}
                maxDailyTrades={maxDailyTrades}
                onReset={() => resetSession(demoSession.configuredBalance)}
                onBalanceChange={b => {
                  setConfiguredBalance(b);
                  resetSession(b);
                }}
              />
              {authUser.role === 'admin' && <ControlledSimulationPanel />}
              {authUser.role === 'admin' && (
                <ObservabilityPanel publicHealth={apiHealth.health} publicError={apiHealth.error} />
              )}
              {authUser.role === 'admin' && <EngineAuditPanel />}
              <RobotDiagnosticsPanel user={authUser} />
            </div>
          )}
        </div>
        <MobileBottomNav tab={mobileTab} onChange={setMobileTab} />

        <div className="hidden lg:block">
          <NotificationsPanel />
        </div>

        <div className="hidden lg:block">
          <MarketRadarPanel
          analysis={radar.analysis}
          loading={radar.loading}
          error={radar.error}
          lastUpdate={radar.lastUpdate}
          symbol={radar.symbol}
          onSymbolChange={radar.setSymbol}
        />
        </div>

        <div className="hidden lg:block">
        <DemoAgentsPanel
          agents={demoAgents.agents}
          configs={demoAgents.configs}
          portfolio={demoAgents.portfolio}
          globalRisk={demoAgents.globalRisk}
          selectedSymbol={radar.symbol}
          onSelectSymbol={radar.setSymbol}
        />
        </div>

        <div className="hidden lg:block">
          <RobotDiagnosticsPanel user={authUser} />
        </div>

        {authUser.role === 'admin' && (
          <div className="hidden lg:block">
            <ControlledSimulationPanel />
          </div>
        )}

        {authUser.role === 'admin' && (
          <div className="hidden lg:block">
            <ObservabilityPanel publicHealth={apiHealth.health} publicError={apiHealth.error} />
          </div>
        )}

        {authUser.role === 'admin' && (
          <div className="hidden lg:block">
            <EngineAuditPanel />
          </div>
        )}

        <section className="hidden lg:block bg-card/50 backdrop-blur-md border border-border p-4 sm:p-6 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-primary/50 to-transparent" />

          <div className="flex flex-col gap-5">
            {/* Pair selector + manual button */}
            <div className="flex flex-col sm:flex-row gap-5 items-end">
              <div className="flex-1 w-full space-y-2.5">
                <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-[0.2em]">
                  Selecionar Par
                </label>
                <div className="relative">
                  <select
                    value={selectedPair}
                    onChange={e => setSelectedPair(e.target.value)}
                    className="w-full bg-background/50 border border-border py-4 px-5 appearance-none font-mono text-xl focus:outline-none focus:border-primary/50 transition-all cursor-pointer rounded-none"
                    disabled={analyzing || market.loading}
                  >
                    <option value="BTCUSDT">BTC / USDT</option>
                  </select>
                  <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-primary text-sm">â–¼</div>
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

            {/* Demo toggle (24/7) */}
            <div className="flex items-center justify-between border px-5 py-4 relative transition-all"
              style={{
                borderColor: demoEnabled ? '#00f0ff33' : 'var(--color-border)',
                background: demoEnabled ? '#00f0ff08' : 'rgba(0,0,0,0.3)',
              }}>
              <div className="absolute left-0 top-0 bottom-0 w-[2px]"
                style={{ background: demoEnabled ? '#00f0ff' : '#ffffff22' }} />
              <div className="flex flex-col gap-0.5 pl-2">
                <span className="text-[11px] font-mono uppercase tracking-[0.2em]"
                  style={{ color: demoEnabled ? '#00f0ff' : 'rgba(255,255,255,0.8)' }}>
                  MODO DEMO AUTOMÁTICO 24H
                </span>
                <DemoStatusBadge
                  enabled={demoEnabled}
                  limited={safeLimited}
                  reason={safeReason}
                />
                <span className="text-[9px] font-mono text-muted-foreground/30 mt-0.5">
                  Simulação 24/7 · Sem ordens reais · Saldo fictício
                </span>
                {demoServerError && (
                  <span className="text-[9px] font-mono text-[#ff4444]/70 mt-0.5 min-w-0 whitespace-normal break-all">
                    API demo: {demoServerError}
                  </span>
                )}
              </div>
              <Toggle
                checked={demoEnabled}
                onChange={(enabled) => setAutomationEnabled(enabled, selectedPair)}
                disabled={market.loading || !!market.error}
                accentColor="#00f0ff"
              />
            </div>
          </div>
        </section>

        {/* â”€â”€ Demo auto status bar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <AnimatePresence>
          {demoEnabled && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{    opacity: 0, height: 0    }}
              transition={{ duration: 0.3 }}
              className="hidden lg:block overflow-hidden"
            >
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-card/40 border p-4 flex flex-col gap-2 relative overflow-hidden col-span-2 sm:col-span-1"
                  style={{ borderColor: '#00f0ff33', background: '#00f0ff08' }}>
                  <div className="absolute left-0 top-0 bottom-0 w-[2px]" style={{ background: '#00f0ff' }} />
                  <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-[0.15em] pl-2 flex items-center gap-1">
                    <Bot className="w-3 h-3" /> Demo 24H
                  </span>
                  <DemoStatusBadge enabled={demoEnabled} limited={safeLimited} />
                </div>

                <div className="bg-card/40 border border-border/50 p-4 flex flex-col gap-2">
                  <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-[0.15em] flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Ãšltima anÃ¡lise
                  </span>
                  <span className="text-sm font-mono text-foreground/80">
                    {demoAutoState.lastAnalysisTime ? fmtTimeSP(demoAutoState.lastAnalysisTime) : 'â€”'}
                  </span>
                </div>

                <div className="bg-card/40 border border-border/50 p-4 flex flex-col gap-2">
                  <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-[0.15em] flex items-center gap-1">
                    <Timer className="w-3 h-3" /> PrÃ³ximo candle 5M
                  </span>
                  <span className="text-xl font-mono font-bold tabular-nums" style={{ color: '#00f0ff' }}>
                    {demoAutoState.countdown}
                  </span>
                </div>

                <div className="bg-card/40 border border-border/50 p-4 flex flex-col gap-2">
                  <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-[0.15em] flex items-center gap-1">
                    <Activity className="w-3 h-3" /> Saldo Demo
                  </span>
                  <span className="text-base font-mono font-bold tabular-nums"
                    style={{
                      color: isFiniteNumber(demoSession.balance) && isFiniteNumber(demoSession.configuredBalance)
                        ? (demoSession.balance >= demoSession.configuredBalance ? '#00ff66' : '#ff4444')
                        : '#aaaaaa',
                    }}>
                    {fmtCurrency(demoSession.balance)}
                  </span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* â”€â”€ Two-column grid: analysis (left) + chart (right) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div className="hidden lg:grid grid-cols-1 lg:grid-cols-[5fr_7fr] gap-5 items-start">

          {/* Left â€” Analysis panel */}
          <div className="order-2 lg:order-1 flex flex-col gap-4">
            {!result && !analyzing && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="flex flex-col items-center gap-3 py-14 border border-border/30 bg-card/20 text-center">
                <Crosshair className="w-10 h-10 text-muted-foreground/20" />
                <span className="text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground/50">
                  Aguardando anÃ¡lise
                </span>
                <span className="text-[11px] font-mono text-muted-foreground/30 max-w-[220px] leading-relaxed">
                  Clique em "Analisar Agora" ou ative o modo automÃ¡tico
                </span>
              </motion.div>
            )}

            {analyzing && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-3 py-14 border border-primary/20 bg-primary/5">
                <Activity className="w-8 h-8 text-primary animate-pulse" />
                <span className="text-xs font-mono uppercase tracking-[0.2em] text-primary/70">
                  Executando motor de regras...
                </span>
              </motion.div>
            )}

            <AnimatePresence>
              {result && !analyzing && (
                <motion.div key="result"
                  initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }} transition={{ duration: 0.35 }}
                  className="flex flex-col gap-4">

                  {resultTime && (
                    <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground/50">
                      <Clock className="w-3 h-3" />
                      <span>AnÃ¡lise em {fmtTimeSP(resultTime)} (SP)</span>
                      {autoEnabled && autoState.isOperational && (
                        <span className="text-primary/50 ml-1">Â· automÃ¡tica</span>
                      )}
                    </div>
                  )}

                  <DecisionBanner decision={result.decision} />

                  {result.decision !== 'SEM ENTRADA' && result.entry && (
                    <PositionParamsPanel
                      entry={result.entry} stopLoss={result.stopLoss!}
                      target1={result.target1!} target2={result.target2!}
                      riskReward={result.riskReward!} direction={result.decision} />
                  )}

                  {result.decision === 'SEM ENTRADA' && <MotivosSection steps={result.steps} />}
                  {result.decision === 'SEM ENTRADA' && <OQueFaltaSection steps={result.steps} />}

                  <SRLevelsPanel support={result.nearestSupport} resistance={result.nearestResistance} />

                  {/* Collapsible steps */}
                  <div className="flex flex-col gap-0 border border-border/50 bg-card/30 overflow-hidden">
                    <button onClick={() => setStepsExpanded(e => !e)}
                      className="px-5 py-3 flex items-center gap-2 hover:bg-white/[0.02] transition-colors">
                      <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-[0.2em] flex-1">
                        Motor de Regras Â· 7 Etapas
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {result.steps.filter(s => s.status === 'PASS').length}/7 aprovadas
                      </span>
                      {stepsExpanded
                        ? <ChevronUp  className="w-3.5 h-3.5 text-muted-foreground/50 ml-2" />
                        : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/50 ml-2" />
                      }
                    </button>
                    <AnimatePresence>
                      {stepsExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }}
                          className="overflow-hidden border-t border-border/50">
                          <div className="divide-y divide-border/30">
                            {result.steps.map((step, i) => <StepRow key={step.number} step={step} index={i} />)}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Right â€” TradingView Chart */}
          <div className="order-1 lg:order-2 flex flex-col">
            <button
              onClick={() => setMobileChartOpen(open => !open)}
              className="lg:hidden mb-3 flex items-center justify-between border border-border/60 bg-card/40 px-4 py-3"
            >
              <span className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
                <BarChart2 className="w-3.5 h-3.5 text-primary" />
                Grafico
              </span>
              {mobileChartOpen
                ? <ChevronUp className="w-4 h-4 text-muted-foreground/60" />
                : <ChevronDown className="w-4 h-4 text-muted-foreground/60" />
              }
            </button>
            <section className={`${mobileChartOpen ? 'block' : 'hidden'} lg:block bg-card/50 backdrop-blur-md border border-border relative overflow-hidden`}>
              <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

              {/* Chart header */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-4 border-b border-border/50">
                <div className="flex items-center gap-2 flex-1">
                  <BarChart2 className="w-4 h-4 text-primary flex-shrink-0" />
                  <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                    GrÃ¡fico AvanÃ§ado
                  </span>
                  <span className="text-[10px] font-mono text-primary/50 ml-1">Â· TradingView</span>
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
                    <button key={val} onClick={() => setTvInterval(val)}
                      className={`px-3 py-1.5 text-[11px] font-mono uppercase tracking-[0.15em] transition-all duration-200
                        ${tvInterval === val
                          ? 'bg-primary text-primary-foreground shadow-[0_0_8px_var(--color-primary)]'
                          : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                        }`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Price levels bar */}
              {result && result.decision !== 'SEM ENTRADA' && result.entry && (
                <PriceLevelsBar
                  entry={result.entry} stopLoss={result.stopLoss!}
                  target1={result.target1!} target2={result.target2!} />
              )}

              <TradingViewChart
                key={`${tvSymbol}-${tvInterval}`}
                symbol={tvSymbol}
                interval={tvInterval}
                height="45vh"
              />
            </section>
          </div>

        </div>{/* end two-column grid */}

        {/* â”€â”€ Demo panels (visible when demo mode is enabled) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <AnimatePresence>
          {demoEnabled && (
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{    opacity: 0, y: 12 }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
              className="hidden lg:flex flex-col gap-5"
            >
              {/* Divider */}
              <div className="flex items-center gap-4">
                <div className="flex-1 h-[1px] bg-gradient-to-r from-transparent to-[#00f0ff44]" />
                <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.2em]" style={{ color: '#00f0ff88' }}>
                  <Bot className="w-3.5 h-3.5" />
                  Painel Demo
                </div>
                <div className="flex-1 h-[1px] bg-gradient-to-l from-transparent to-[#00f0ff44]" />
              </div>

              <div className="hidden lg:block">
              {/* Active trade panel */}
              {demoSession.activeTrade && (
                <DemoActivePanel
                  trade={demoSession.activeTrade}
                  currentPrice={activeTradeCurrentPrice}
                />
              )}

              {/* No active trade placeholder */}
              {!demoSession.activeTrade && (
                <div className="flex flex-col items-center gap-2 py-8 border border-[#00f0ff]/15 bg-[#00f0ff]/[0.03]">
                  <Bot className="w-8 h-8 text-[#00f0ff]/20" />
                  <span className="text-xs font-mono text-[#00f0ff]/40 uppercase tracking-[0.2em]">
                    {safeLimited
                      ? safeReason ?? 'Novas operações suspensas por limite de risco.'
                      : 'Aguardando sinal 24/7 do motor de regras...'}
                  </span>
                  {!safeLimited && (
                    <span className="text-[10px] font-mono text-muted-foreground/30">
                      PrÃ³xima anÃ¡lise em {demoAutoState.countdown}
                    </span>
                  )}
                </div>
              )}
              </div>

              {/* Stats + History in two columns on large screens */}
              <div className="hidden lg:grid grid-cols-1 lg:grid-cols-2 gap-5">
                <DemoStatsPanel
                  stats={demoSession.dailyStats}
                  currentBalance={demoSession.balance}
                  configuredBalance={demoSession.configuredBalance}
                  realizedPnl={demoSession.realizedPnlUSDC ?? 0}
                  unrealizedPnl={demoSession.unrealizedPnlUSDC ?? 0}
                  partialPnl={demoSession.partialPnlUSDC ?? 0}
                  openRisk={demoSession.openRiskUSDC ?? 0}
                  maxDailyTrades={maxDailyTrades}
                  onReset={() => resetSession(demoSession.configuredBalance)}
                  onBalanceChange={b => {
                    setConfiguredBalance(b);
                    resetSession(b);
                  }}
                />
                <DemoHistoryPanel history={demoSession.history} />
              </div>

            </motion.div>
          )}
        </AnimatePresence>

      </main>
    </div>
  );
}
