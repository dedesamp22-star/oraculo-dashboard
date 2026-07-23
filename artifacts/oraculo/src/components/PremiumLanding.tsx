import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  BarChart3,
  Bell,
  BrainCircuit,
  ChevronRight,
  CircleDot,
  Eye,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import type { OracleVisualState } from '@shared/oracleVisualState';

const PRODUCT_NAME = 'OR\u00c1CULO TRADE AI';
const HERO_SUBTITLE = 'A intelig\u00eancia que observa o mercado antes de todos.';
const SUPPORT_PHRASE = 'O mercado deixa sinais. O Oraculo interpreta.';
const GUARDIAN_IMAGE_SRC = '/brand/oraculo-guardian.png';
const INTRO_SESSION_KEY = 'oraculoGuardianIntroSeen';

const pillars = [
  { title: 'IA Proprietaria', text: 'Leitura tecnica estruturada para decisoes auditaveis.', icon: BrainCircuit, accent: '#00D8FF' },
  { title: 'BTC Futures', text: 'Arquitetura visual preparada para operacao inteligente.', icon: BarChart3, accent: '#D4AF37' },
  { title: 'Gestao de Risco', text: 'Prioridade para protecao, disciplina e continuidade.', icon: ShieldCheck, accent: '#00FF88' },
  { title: 'Alertas Telegram', text: 'Sinais e eventos importantes no canal certo.', icon: Bell, accent: '#00D8FF' },
  { title: 'Observabilidade', text: 'Diagnostico claro do robo e da saude operacional.', icon: Eye, accent: '#F4F4F5' },
  { title: 'Execucao Inteligente', text: 'Base pronta para evoluir sem misturar modos ou riscos.', icon: Zap, accent: '#FF4D4D' },
];

const oracleStates: Array<{ key: OracleVisualState; label: string; tone: string; message: string }> = [
  { key: 'waiting', label: 'Aguardando', tone: '#D4AF37', message: 'O Oraculo observa o mercado.' },
  { key: 'analyzing', label: 'Analisando', tone: '#00D8FF', message: 'Analisando milhares de possibilidades...' },
  { key: 'buy', label: 'Compra', tone: '#00FF88', message: 'Oportunidade de compra detectada.' },
  { key: 'sell', label: 'Venda', tone: '#FF4D4D', message: 'Pressao vendedora dominante.' },
];

const introSteps = [
  'Inicializando nucleo...',
  'Conectando mercados...',
  'Sincronizando IA...',
  'Radar online.',
  'Oraculo ativo.',
];

function isOracleVisualState(value: string | null): value is OracleVisualState {
  return oracleStates.some((item) => item.key === value);
}

function readPreviewState(): OracleVisualState | null {
  if (!import.meta.env.DEV || typeof window === 'undefined') return null;
  const value = new URLSearchParams(window.location.search).get('oracleState');
  return isOracleVisualState(value) ? value : null;
}

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function PremiumLogo() {
  return (
    <div className="flex items-center gap-3">
      <div className="relative grid h-10 w-10 place-items-center overflow-hidden border border-[#00D8FF]/40 bg-[#00D8FF]/10 shadow-[0_0_28px_rgba(0,216,255,0.16)]">
        <div className="absolute inset-2 border border-[#D4AF37]/35 rotate-45" />
        <div className="h-2.5 w-2.5 bg-[#00D8FF] shadow-[0_0_18px_rgba(0,216,255,0.7)]" />
      </div>
      <div className="leading-none">
        <p className="text-[11px] font-bold uppercase tracking-[0.32em] text-[#F4F4F5]">Oraculo</p>
        <p className="mt-1 text-[9px] uppercase tracking-[0.24em] text-[#00D8FF]/75">Trade AI</p>
      </div>
    </div>
  );
}

function shouldShowIntro(): boolean {
  if (typeof window === 'undefined') return false;
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reducedMotion) return false;
  try {
    return window.sessionStorage.getItem(INTRO_SESSION_KEY) !== 'true';
  } catch {
    return false;
  }
}

function OracleIntro({ onDone }: { onDone: () => void }) {
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    const stepTimer = window.setInterval(() => {
      setStepIndex((current) => Math.min(current + 1, introSteps.length - 1));
    }, 300);
    const doneTimer = window.setTimeout(onDone, 1850);
    return () => {
      window.clearInterval(stepTimer);
      window.clearTimeout(doneTimer);
    };
  }, [onDone]);

  return (
    <div className="premium-intro" role="status" aria-live="polite">
      <div className="premium-intro-core">
        <div className="premium-intro-mark" />
        <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#D4AF37]">Oraculo Trade AI</p>
        <p className="mt-3 min-h-6 text-sm text-[#F4F4F5]/72">{introSteps[stepIndex]}</p>
        <div className="mt-5 h-1 overflow-hidden bg-[#232329]">
          <div className="h-full bg-[#D4AF37] transition-all duration-300" style={{ width: `${((stepIndex + 1) / introSteps.length) * 100}%` }} />
        </div>
        <button
          type="button"
          onClick={onDone}
          className="mt-5 min-h-10 border border-[#232329] px-4 text-[10px] font-bold uppercase tracking-[0.16em] text-[#F4F4F5]/58 transition-colors hover:border-[#D4AF37]/70 hover:text-[#D4AF37]"
        >
          Pular
        </button>
      </div>
    </div>
  );
}

function OracleSoul({ state = 'waiting', framed = false }: { state?: OracleVisualState; framed?: boolean }) {
  return (
    <div className={`premium-oracle-soul ${framed ? 'premium-oracle-soul-framed' : ''}`} data-oracle-state={state}>
      <div className="premium-oracle-aura" />
      <div className="premium-oracle-scan premium-oracle-scan-a" />
      <div className="premium-oracle-scan premium-oracle-scan-b" />
      <div className="premium-oracle-grid" />
      <div className="premium-oracle-art-wrap">
        <div className="premium-oracle-eye premium-oracle-eye-left" />
        <div className="premium-oracle-eye premium-oracle-eye-right" />
        <img
          src={GUARDIAN_IMAGE_SRC}
          alt="Oraculo Trade AI com guardiao, globo de mercado, touro, urso e candles"
          className="premium-oracle-art"
          loading="eager"
          decoding="async"
          width="1536"
          height="1241"
        />
      </div>
      <div className="premium-oracle-core" aria-hidden="true">
        <div className="premium-oracle-ring premium-oracle-ring-a" />
        <div className="premium-oracle-ring premium-oracle-ring-b" />
        <div className="premium-oracle-ring premium-oracle-ring-c" />
        <div className="premium-oracle-globe">
          <div className="premium-oracle-equator" />
          <div className="premium-oracle-meridian" />
          <div className="premium-oracle-meridian premium-oracle-meridian-b" />
          <div className="premium-oracle-signal premium-oracle-signal-a" />
          <div className="premium-oracle-signal premium-oracle-signal-b" />
          <div className="premium-oracle-signal premium-oracle-signal-c" />
        </div>
        <div className="premium-oracle-energy premium-oracle-energy-bull" />
        <div className="premium-oracle-energy premium-oracle-energy-bear" />
      </div>
      <div className="premium-market-line premium-market-line-a" />
      <div className="premium-market-line premium-market-line-b" />
      {framed && (
        <div className="premium-oracle-readout">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-[#F4F4F5]/45">Estado visual</p>
            <p className="mt-1 text-sm font-semibold uppercase tracking-[0.16em]" style={{ color: oracleStates.find((item) => item.key === state)?.tone ?? '#D4AF37' }}>
              {oracleStates.find((item) => item.key === state)?.label ?? 'Aguardando'}
            </p>
            <p key={state} className="premium-oracle-message mt-2 text-xs leading-5 text-[#F4F4F5]/64">
              {oracleStates.find((item) => item.key === state)?.message ?? 'O Oraculo observa o mercado.'}
            </p>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {oracleStates.map((item) => (
              <span
                key={item.key}
                className="h-1.5 border border-white/10"
                style={{ background: item.key === state ? item.tone : 'rgba(244,244,245,0.12)' }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function LoginPanel({ loading, error, onLogin, spotlight }: {
  loading: boolean;
  error: string | null;
  onLogin: (username: string, password: string) => void;
  spotlight?: boolean;
}) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const passwordRef = useRef<HTMLInputElement | null>(null);

  return (
    <form
      id="login"
      onSubmit={(event) => {
        event.preventDefault();
        onLogin(username, password);
      }}
      className={`premium-login-panel mx-auto grid w-full max-w-5xl scroll-mt-28 gap-5 border border-[#232329] bg-[#111114]/70 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:grid-cols-[1fr_1.1fr] sm:p-6 ${spotlight ? 'premium-login-panel-active' : ''}`}
    >
      <div className="flex min-h-[220px] flex-col justify-between border border-[#232329]/80 bg-[#09090B]/70 p-5">
        <div>
          <div className="inline-flex items-center gap-2 border border-[#00D8FF]/25 bg-[#00D8FF]/10 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.22em] text-[#00D8FF]">
            <LockKeyhole className="h-3.5 w-3.5" />
            Acesso seguro
          </div>
          <h2 className="mt-5 max-w-sm text-2xl font-semibold tracking-normal text-[#F4F4F5] sm:text-3xl">
            Entre no centro de comando do Oraculo.
          </h2>
        </div>
        <p className="mt-5 max-w-md text-sm leading-6 text-[#F4F4F5]/60">
          Sessao protegida, dados privados no servidor e experiencia preparada para desktop, celular e PWA.
        </p>
      </div>

      <div className="grid gap-4">
        <label className="grid gap-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#F4F4F5]/55">Usuario</span>
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            className="min-h-12 border border-[#232329] bg-[#09090B] px-4 text-sm text-[#F4F4F5] outline-none transition-colors placeholder:text-[#F4F4F5]/25 focus:border-[#00D8FF]"
          />
        </label>
        <label className="grid gap-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#F4F4F5]/55">Senha</span>
          <input
            ref={passwordRef}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            autoComplete="current-password"
            className="min-h-12 border border-[#232329] bg-[#09090B] px-4 text-sm text-[#F4F4F5] outline-none transition-colors placeholder:text-[#F4F4F5]/25 focus:border-[#00D8FF]"
          />
        </label>
        {error && <p className="text-xs text-[#FF4D4D]">{error}</p>}
        <button
          type="submit"
          disabled={loading || password.length === 0 || username.trim().length === 0}
          className="group min-h-12 border border-[#00D8FF]/70 bg-[#00D8FF] px-5 text-sm font-bold uppercase tracking-[0.16em] text-[#09090B] shadow-[0_0_24px_rgba(0,216,255,0.18)] transition-all hover:shadow-[0_0_34px_rgba(0,216,255,0.34)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? 'Entrando...' : 'Entrar no Oraculo'}
        </button>
        <button
          type="button"
          onClick={() => passwordRef.current?.focus()}
          className="min-h-11 border border-[#232329] px-4 text-[10px] font-bold uppercase tracking-[0.16em] text-[#F4F4F5]/60 transition-colors hover:border-[#D4AF37]/70 hover:text-[#D4AF37]"
        >
          Continuar com credenciais existentes
        </button>
      </div>
    </form>
  );
}

function OracleStatePreview({ state, onChange }: {
  state: OracleVisualState;
  onChange: (state: OracleVisualState) => void;
}) {
  if (!import.meta.env.DEV) return null;

  return (
    <div className="fixed bottom-3 left-3 right-3 z-[60] mx-auto max-w-xl border border-[#232329] bg-[#09090B]/88 p-2 shadow-[0_18px_70px_rgba(0,0,0,0.38)] backdrop-blur-xl sm:bottom-5 sm:left-auto sm:right-5 sm:mx-0">
      <p className="mb-2 px-1 text-[9px] font-bold uppercase tracking-[0.18em] text-[#F4F4F5]/45">Preview local do Oraculo Core</p>
      <div className="grid grid-cols-4 gap-1.5">
        {oracleStates.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange(item.key)}
            className="min-h-9 border px-2 text-[9px] font-bold uppercase tracking-[0.12em] transition-all"
            style={{
              borderColor: state === item.key ? item.tone : '#232329',
              color: state === item.key ? item.tone : 'rgba(244,244,245,0.56)',
              background: state === item.key ? `${item.tone}18` : 'rgba(17,17,20,0.7)',
              boxShadow: state === item.key ? `0 0 22px ${item.tone}22` : 'none',
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function PremiumLanding({ loading, error, onLogin, state }: {
  loading: boolean;
  error: string | null;
  onLogin: (username: string, password: string) => void;
  state?: OracleVisualState;
}) {
  const [oraclePreviewState, setOraclePreviewState] = useState<OracleVisualState | null>(() => readPreviewState());
  const [introVisible, setIntroVisible] = useState(() => shouldShowIntro());
  const [loginSpotlight, setLoginSpotlight] = useState(false);
  const loginSpotlightTimerRef = useRef<number | null>(null);
  const visualState = oraclePreviewState ?? state ?? 'waiting';

  useEffect(() => () => {
    if (loginSpotlightTimerRef.current !== null) window.clearTimeout(loginSpotlightTimerRef.current);
  }, []);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${PRODUCT_NAME} 0.6`;
    return () => {
      document.title = previousTitle;
    };
  }, []);

  const finishIntro = () => {
    try {
      window.sessionStorage.setItem(INTRO_SESSION_KEY, 'true');
    } catch {
      // Visual-only session flag; blocked storage should not affect login.
    }
    setIntroVisible(false);
  };

  const handlePreviewStateChange = (nextState: OracleVisualState) => {
    setOraclePreviewState(nextState);
    if (import.meta.env.DEV) {
      const url = new URL(window.location.href);
      url.searchParams.set('oracleState', nextState);
      window.history.replaceState(null, '', url);
    }
  };

  const handleLoginFocus = () => {
    setLoginSpotlight(true);
    if (loginSpotlightTimerRef.current !== null) window.clearTimeout(loginSpotlightTimerRef.current);
    loginSpotlightTimerRef.current = window.setTimeout(() => setLoginSpotlight(false), 1400);
    scrollToId('login');
  };

  return (
    <div className={`premium-shell min-h-screen overflow-x-hidden bg-[#09090B] text-[#F4F4F5] ${loginSpotlight ? 'premium-shell-login-focus' : ''}`}>
      {introVisible && <OracleIntro onDone={finishIntro} />}
      <OracleStatePreview state={visualState} onChange={handlePreviewStateChange} />
      <header className="fixed left-0 right-0 top-0 z-50 border-b border-[#232329]/70 bg-[#09090B]/72 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <PremiumLogo />
          <nav className="hidden items-center gap-7 text-[10px] font-bold uppercase tracking-[0.2em] text-[#F4F4F5]/58 lg:flex">
            <button type="button" onClick={() => scrollToId('dashboard')} className="transition-colors hover:text-[#00D8FF]">Dashboard</button>
            <button type="button" onClick={() => scrollToId('radar')} className="transition-colors hover:text-[#00D8FF]">Radar</button>
            <button type="button" onClick={() => scrollToId('telegram')} className="transition-colors hover:text-[#00D8FF]">Telegram</button>
            <button type="button" onClick={() => scrollToId('historico')} className="transition-colors hover:text-[#00D8FF]">Historico</button>
          </nav>
          <button
            type="button"
            onClick={handleLoginFocus}
            className="min-h-10 border border-[#00D8FF]/45 px-4 text-[10px] font-bold uppercase tracking-[0.18em] text-[#00D8FF] transition-all hover:bg-[#00D8FF]/10 hover:shadow-[0_0_22px_rgba(0,216,255,0.18)]"
          >
            Entrar
          </button>
        </div>
      </header>

      <main>
        <section className="relative flex min-h-screen items-center overflow-hidden px-4 pb-16 pt-24 sm:px-6 lg:px-8">
          <div className="premium-particles" aria-hidden="true" />
          <div className="premium-grid-bg" aria-hidden="true" />
          <div className="premium-nebula" aria-hidden="true" />
          <div className="premium-tech-lines" aria-hidden="true" />
          <div className="premium-candle-field" aria-hidden="true" />

          <div className="relative z-10 mx-auto grid w-full max-w-7xl gap-10 lg:grid-cols-[minmax(0,0.92fr)_minmax(420px,0.78fr)] lg:items-center">
            <div className="max-w-4xl lg:pt-8">
              <div className="inline-flex items-center gap-2 border border-[#D4AF37]/30 bg-[#D4AF37]/10 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.24em] text-[#D4AF37]">
                <Sparkles className="h-3.5 w-3.5" />
                Seu Analista de Mercado 24h
              </div>
              <h1 className="mt-7 max-w-4xl text-5xl font-semibold leading-[0.92] tracking-normal text-[#F4F4F5] sm:text-7xl lg:text-8xl">
                {PRODUCT_NAME}
              </h1>
              <p className="mt-7 max-w-2xl text-lg leading-8 text-[#F4F4F5]/72 sm:text-xl">
                "{HERO_SUBTITLE}"
              </p>
              <p className="mt-4 max-w-xl text-sm leading-7 text-[#F4F4F5]/48">
                {SUPPORT_PHRASE}
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={handleLoginFocus}
                  className="group inline-flex min-h-12 items-center justify-center gap-2 border border-[#00D8FF] bg-[#00D8FF] px-6 text-sm font-bold uppercase tracking-[0.16em] text-[#09090B] shadow-[0_0_30px_rgba(0,216,255,0.2)] transition-all hover:translate-y-[-1px] hover:shadow-[0_0_42px_rgba(0,216,255,0.36)]"
                >
                  Entrar no Oraculo
                  <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </button>
                <button
                  type="button"
                  onClick={() => scrollToId('pilares')}
                  className="inline-flex min-h-12 items-center justify-center border border-[#232329] bg-[#111114]/70 px-6 text-sm font-bold uppercase tracking-[0.16em] text-[#F4F4F5] transition-all hover:border-[#D4AF37]/70 hover:text-[#D4AF37]"
                >
                  Conhecer o Projeto
                </button>
              </div>
              <div className="mt-10 grid max-w-2xl grid-cols-3 border border-[#232329] bg-[#111114]/50 backdrop-blur">
                {[
                  ['24h', 'Analista AI'],
                  ['3', 'Ativos demo'],
                  ['0', 'Ordens reais'],
                ].map(([value, label]) => (
                  <div key={label} className="border-r border-[#232329] p-4 last:border-r-0">
                    <p className="text-2xl font-semibold text-[#F4F4F5]">{value}</p>
                    <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-[#F4F4F5]/45">{label}</p>
                  </div>
                ))}
              </div>
              <div className="mt-5 flex max-w-2xl flex-wrap gap-2">
                {oracleStates.map((item) => (
                  <span
                    key={item.key}
                    className="inline-flex min-h-8 items-center gap-2 border border-[#232329] bg-[#111114]/55 px-3 text-[9px] font-bold uppercase tracking-[0.16em] text-[#F4F4F5]/56"
                  >
                    <CircleDot className="h-3 w-3" style={{ color: item.tone }} />
                    {item.label}
                  </span>
                ))}
              </div>
            </div>

            <div className="premium-oracle-panel relative min-h-[420px] sm:min-h-[520px]">
              <div className="absolute left-5 right-5 top-5 z-10 flex items-center justify-between text-[10px] uppercase tracking-[0.22em] text-[#F4F4F5]/45 sm:left-8 sm:right-8 sm:top-8">
                <span>Nucleo do Oraculo</span>
                <span className="text-[#D4AF37]">Ativo</span>
              </div>
              <div className="absolute inset-0">
                <OracleSoul state={visualState} framed />
              </div>
            </div>
          </div>
        </section>

        <section id="pilares" className="relative z-10 border-y border-[#232329] bg-[#09090B] px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-7xl">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#00D8FF]">Arquitetura visual premium</p>
                <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-normal text-[#F4F4F5] sm:text-5xl">
                  Inteligencia, precisao e controle em uma unica experiencia.
                </h2>
              </div>
              <p className="max-w-md text-sm leading-6 text-[#F4F4F5]/58">
                Esta etapa prepara a identidade oficial para receber arte do Oraculo, globo, touro, urso e grafico animado sem retrabalho futuro.
              </p>
            </div>

            <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {pillars.map((pillar) => {
                const Icon = pillar.icon;
                return (
                  <article
                    key={pillar.title}
                    id={pillar.title === 'Alertas Telegram' ? 'telegram' : pillar.title === 'Observabilidade' ? 'dashboard' : pillar.title === 'IA Proprietaria' ? 'radar' : pillar.title === 'Execucao Inteligente' ? 'historico' : undefined}
                    className="group min-h-[170px] border border-[#232329] bg-[#111114] p-5 transition-all duration-300 hover:-translate-y-1 hover:border-[#00D8FF]/40 hover:bg-[#151519] hover:shadow-[0_22px_80px_rgba(0,216,255,0.07)]"
                  >
                    <div className="flex items-center justify-between">
                      <div className="grid h-11 w-11 place-items-center border border-[#232329] bg-[#09090B]" style={{ color: pillar.accent }}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <Activity className="h-4 w-4 text-[#F4F4F5]/20 transition-colors group-hover:text-[#00D8FF]/70" />
                    </div>
                    <h3 className="mt-6 text-lg font-semibold tracking-normal text-[#F4F4F5]">{pillar.title}</h3>
                    <p className="mt-3 text-sm leading-6 text-[#F4F4F5]/55">{pillar.text}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="relative z-10 px-4 py-16 sm:px-6 lg:px-8">
          <LoginPanel loading={loading} error={error} onLogin={onLogin} spotlight={loginSpotlight} />
        </section>
      </main>
    </div>
  );
}
