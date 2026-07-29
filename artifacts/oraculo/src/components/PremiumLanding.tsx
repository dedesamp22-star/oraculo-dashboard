import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  Bell,
  BrainCircuit,
  Cloud,
  Database,
  Eye,
  Infinity,
  Lock,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Target,
  Zap,
} from 'lucide-react';
import type { OracleVisualState } from '@shared/oracleVisualState';

const ORACLE_IMAGE_SRC = '/brand/oraculo-landing-core.png';

const featureCards = [
  { title: 'IA Proprietária', text: 'Leitura técnica estruturada para decisões auditáveis.', icon: BrainCircuit, tone: '#00D8FF' },
  { title: 'BTC Futures', text: 'Arquitetura visual preparada para operação inteligente.', icon: BarChart3, tone: '#D4AF37' },
  { title: 'Gestão de Risco', text: 'Prioridade para proteção, disciplina e continuidade.', icon: ShieldCheck, tone: '#00FF88' },
  { title: 'Alertas Telegram', text: 'Sinais e eventos importantes no canal certo.', icon: Bell, tone: '#00D8FF' },
  { title: 'Observabilidade', text: 'Diagnóstico claro do robô e da saúde operacional.', icon: Eye, tone: '#00D8FF' },
  { title: 'Execução Inteligente', text: 'Base pronta para evoluir sem misturar modos ou riscos.', icon: Zap, tone: '#FF8A3D' },
];

const benefits = [
  { title: 'Segurança total', text: 'Seus dados e operações sempre protegidos.', icon: ShieldCheck },
  { title: 'Sem emoção', text: 'Decisões racionais, 100% baseadas em dados.', icon: Lock },
  { title: 'Acesso de qualquer lugar', text: 'Web, Mobile e Telegram em tempo real.', icon: Cloud },
  { title: 'Tecnologia avançada', text: 'Infraestrutura robusta, rápida e escalável.', icon: BrainCircuit },
  { title: 'Foco no que importa', text: 'Menos ruído, mais precisão, mais resultado.', icon: Infinity },
];

const stateMeta: Record<OracleVisualState, { label: string; color: string; message: string }> = {
  waiting: {
    label: 'Aguardando',
    color: '#D4AF37',
    message: 'O Oráculo observa o mercado.',
  },
  analyzing: {
    label: 'Analisando',
    color: '#00D8FF',
    message: 'Analisando milhares de possibilidades...',
  },
  buy: {
    label: 'Compra',
    color: '#00FF88',
    message: 'Oportunidade de compra detectada.',
  },
  sell: {
    label: 'Venda',
    color: '#FF4D4D',
    message: 'Pressão vendedora dominante.',
  },
};

function LogoMark() {
  return (
    <div className="flex items-center gap-3">
      <div className="relative grid h-12 w-12 place-items-center border border-[#00D8FF] bg-[#00D8FF]/8 shadow-[0_0_28px_rgba(0,216,255,0.18)]">
        <span className="h-5 w-5 rotate-45 border border-[#00D8FF] bg-[#00D8FF]/18" />
        <span className="absolute inset-2 border border-[#00D8FF]/35" />
      </div>
      <div>
        <p className="text-[13px] font-bold uppercase tracking-[0.34em] text-[#F4F4F5]">Oráculo</p>
        <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.27em] text-[#00D8FF]">Trade IA</p>
      </div>
    </div>
  );
}

function Header({ onLoginFocus }: { onLoginFocus: () => void }) {
  return (
    <header className="relative z-30 border-b border-[#F4F4F5]/10 bg-[#02070B]/76 backdrop-blur-xl">
      <div className="mx-auto flex h-[74px] max-w-[1360px] items-center justify-between px-5 sm:px-8">
        <LogoMark />
        <nav className="hidden items-center gap-9 text-[14px] text-[#F4F4F5]/86 lg:flex">
          <span>Dashboard</span>
          <span>Radar</span>
          <span>Telegram</span>
          <span>Histórico</span>
          <span>Planos</span>
          <span>Docs</span>
        </nav>
        <button
          type="button"
          onClick={onLoginFocus}
          className="min-h-10 rounded border border-[#00D8FF] px-6 text-[13px] font-bold uppercase tracking-[0.16em] text-[#00D8FF] transition-colors hover:bg-[#00D8FF]/10"
        >
          Entrar
        </button>
      </div>
    </header>
  );
}

function OracleHeroArt({ state }: { state: OracleVisualState }) {
  const meta = stateMeta[state] ?? stateMeta.waiting;
  return (
    <div className="pointer-events-none absolute inset-y-0 right-0 z-0 hidden w-[68%] overflow-hidden lg:block">
      <img
        src={ORACLE_IMAGE_SRC}
        alt=""
        aria-hidden="true"
        className="absolute right-[-4%] top-[-1%] h-[690px] w-[940px] max-w-none object-cover object-[72%_8%] opacity-95"
        loading="eager"
        decoding="async"
      />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,#02070B_0%,rgba(2,7,11,0.82)_12%,rgba(2,7,11,0.20)_39%,rgba(2,7,11,0.42)_100%)]" />
      <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-[#02070B] to-transparent" />
      <span className="oracle-forehead-pulse absolute right-[30.8%] top-[22px] h-28 w-28 rounded-full border border-[#D4AF37]/35 shadow-[0_0_48px_rgba(212,175,55,0.42)]" />
      <span className="oracle-eye-pulse absolute right-[27.2%] top-[210px] h-12 w-12 rounded-full bg-[#006CFF]/18 blur-md shadow-[0_0_42px_rgba(0,108,255,0.72)]" />
      <div className="oracle-sphere-glow absolute bottom-[40px] right-[21%] h-[278px] w-[278px] rounded-full border border-current opacity-90 blur-[1px]" style={{ color: meta.color }} />
    </div>
  );
}

function MobileOracleArt({ state }: { state: OracleVisualState }) {
  const meta = stateMeta[state] ?? stateMeta.waiting;
  return (
    <div className="relative mt-8 h-[320px] overflow-hidden rounded-2xl border border-[#00D8FF]/14 bg-[#061014] lg:hidden">
      <img
        src={ORACLE_IMAGE_SRC}
        alt=""
        aria-hidden="true"
        className="absolute left-1/2 top-0 h-[390px] w-[680px] max-w-none -translate-x-1/2 object-cover object-[70%_6%]"
        loading="eager"
        decoding="async"
      />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,7,11,0.08),rgba(2,7,11,0.78)_78%,#02070B)]" />
      <span className="oracle-forehead-pulse absolute left-1/2 top-3 h-16 w-16 -translate-x-1/2 rounded-full border border-[#D4AF37]/35 shadow-[0_0_34px_rgba(212,175,55,0.42)]" />
      <span className="oracle-eye-pulse absolute left-[57%] top-[104px] h-9 w-9 rounded-full bg-[#006CFF]/18 blur-md shadow-[0_0_32px_rgba(0,108,255,0.72)]" />
      <div className="oracle-sphere-glow absolute bottom-6 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full border border-current opacity-90" style={{ color: meta.color }} />
    </div>
  );
}

function MetricStrip() {
  const metrics = [
    ['24h', 'Análise contínua'],
    ['3', 'Estratégias IA'],
    ['100%', 'Gestão de risco'],
    ['0ms', 'Execução rápida'],
  ];
  return (
    <div className="mt-8 grid max-w-[540px] grid-cols-2 rounded border border-[#F4F4F5]/12 bg-[#061014]/64 backdrop-blur md:grid-cols-4">
      {metrics.map(([value, label]) => (
        <div key={label} className="border-b border-r border-[#F4F4F5]/10 p-4 last:border-r-0 md:border-b-0">
          <p className="text-[20px] font-semibold text-[#F4F4F5]">{value}</p>
          <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-[#F4F4F5]/42">{label}</p>
        </div>
      ))}
    </div>
  );
}

function FeatureGrid() {
  return (
    <section className="relative z-20 mx-auto mt-8 grid max-w-[1320px] gap-3 px-5 sm:px-8 lg:grid-cols-6">
      {featureCards.map((card) => {
        const Icon = card.icon;
        return (
          <article key={card.title} className="rounded border border-[#24414B] bg-[#061014]/82 p-6 shadow-[0_18px_70px_rgba(0,0,0,0.32)] backdrop-blur transition-colors hover:border-[#00D8FF]/45">
            <div className="grid h-11 w-11 place-items-center rounded border border-current bg-current/10" style={{ color: card.tone }}>
              <Icon className="h-6 w-6" />
            </div>
            <h2 className="mt-5 text-[16px] font-semibold text-[#F4F4F5]">{card.title}</h2>
            <p className="mt-2 text-[13px] leading-6 text-[#F4F4F5]/62">{card.text}</p>
          </article>
        );
      })}
    </section>
  );
}

function LoginPanel({
  loading,
  error,
  onLogin,
}: {
  loading: boolean;
  error: string | null;
  onLogin: (username: string, password: string) => void;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [recoveryHint, setRecoveryHint] = useState(false);

  return (
    <form
      id="login"
      onSubmit={(event) => {
        event.preventDefault();
        onLogin(username, password);
      }}
      className="min-w-0"
    >
      <div className="inline-flex items-center gap-2 rounded border border-[#00D8FF]/45 bg-[#00D8FF]/8 px-3 py-2 text-[12px] font-bold uppercase tracking-[0.16em] text-[#00D8FF]">
        <LockKeyhole className="h-4 w-4" />
        Acesso seguro
      </div>
      <h2 className="mt-5 max-w-sm text-[28px] font-semibold leading-tight text-[#F4F4F5]">Entre no centro de comando do Oráculo.</h2>
      <p className="mt-4 max-w-lg text-[15px] leading-7 text-[#F4F4F5]/65">
        Sessão protegida, dados privados no servidor e experiência preparada para desktop, celular e PWA.
      </p>

      <div className="mt-7 grid gap-4">
        <label className="grid gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#F4F4F5]/70">Usuário</span>
          <span className="flex min-h-11 items-center gap-3 rounded border border-[#F4F4F5]/14 bg-[#02070B]/72 px-4 focus-within:border-[#00D8FF]/70">
            <Mail className="h-4 w-4 text-[#F4F4F5]/70" />
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              inputMode="email"
              className="min-w-0 flex-1 bg-transparent text-sm text-[#F4F4F5] outline-none placeholder:text-[#F4F4F5]/38"
              placeholder="Digite seu usuário"
            />
          </span>
        </label>

        <label className="grid gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#F4F4F5]/70">Senha</span>
          <span className="flex min-h-11 items-center gap-3 rounded border border-[#F4F4F5]/14 bg-[#02070B]/72 px-4 focus-within:border-[#00D8FF]/70">
            <LockKeyhole className="h-4 w-4 text-[#F4F4F5]/70" />
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete="current-password"
              className="min-w-0 flex-1 bg-transparent text-sm text-[#F4F4F5] outline-none placeholder:text-[#F4F4F5]/38"
              placeholder="Digite sua senha"
            />
          </span>
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <label className="inline-flex min-h-8 items-center gap-2 text-sm text-[#F4F4F5]/70">
          <input
            type="checkbox"
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
            className="h-4 w-4 rounded border-[#F4F4F5]/25 bg-transparent accent-[#00D8FF]"
          />
          Lembrar-me
        </label>
        <button
          type="button"
          onClick={() => setRecoveryHint(true)}
          className="min-h-8 text-sm font-medium text-[#00D8FF] transition-colors hover:text-[#00FF88]"
        >
          Esqueci minha senha
        </button>
      </div>

      {recoveryHint && <p className="mt-2 text-xs leading-5 text-[#F4F4F5]/52">Solicite recuperação de acesso ao administrador do Oráculo.</p>}
      {error && <p className="mt-3 text-sm leading-5 text-[#FF4D4D]">{error}</p>}

      <button
        type="submit"
        disabled={loading || password.length === 0 || username.trim().length === 0}
        className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded bg-[#37D9F4] px-5 text-[13px] font-bold uppercase tracking-[0.14em] text-[#02070B] shadow-[0_0_32px_rgba(55,217,244,0.20)] transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {loading ? 'Entrando...' : 'Entrar no Oráculo'}
      </button>
      <button
        type="button"
        onClick={() => setRecoveryHint(true)}
        className="mt-3 inline-flex min-h-8 w-full items-center justify-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[#F4F4F5]/54 hover:text-[#00D8FF]"
      >
        Continuar com credenciais existentes
        <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </form>
  );
}

function DemoCard({ onLoginFocus }: { onLoginFocus: () => void }) {
  return (
    <aside className="min-w-0 rounded border border-[#24414B] bg-[#061014]/70 p-6">
      <h2 className="text-[17px] font-semibold text-[#F4F4F5]">Ambiente de Demonstração</h2>
      <p className="mt-3 text-sm leading-6 text-[#F4F4F5]/64">Acesse o DEMO usando o fluxo de login atual e explore os módulos aprovados.</p>
      <button
        type="button"
        onClick={onLoginFocus}
        className="mt-6 inline-flex min-h-11 w-full items-center justify-center rounded border border-[#00D8FF]/70 px-5 text-[13px] font-bold uppercase tracking-[0.13em] text-[#00D8FF] transition-colors hover:bg-[#00D8FF]/10"
      >
        Entrar no DEMO
      </button>
    </aside>
  );
}

function BenefitsFooter() {
  return (
    <footer className="relative z-20 mx-auto mt-7 grid max-w-[1320px] gap-3 px-5 pb-7 sm:px-8 md:grid-cols-5">
      {benefits.map((benefit) => {
        const Icon = benefit.icon;
        return (
          <div key={benefit.title} className="flex items-center gap-3 rounded border border-[#24414B] bg-[#061014]/78 p-4">
            <div className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-full border border-[#00D8FF]/20 bg-[#00D8FF]/8 text-[#00D8FF]">
              <Icon className="h-6 w-6" />
            </div>
            <div>
              <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-[#00FF88]">{benefit.title}</p>
              <p className="mt-1 text-xs leading-5 text-[#F4F4F5]/62">{benefit.text}</p>
            </div>
          </div>
        );
      })}
    </footer>
  );
}

export function PremiumLanding({
  loading,
  error,
  onLogin,
  state = 'waiting',
}: {
  loading: boolean;
  error: string | null;
  onLogin: (username: string, password: string) => void;
  state?: OracleVisualState;
}) {
  const loginRef = useRef<HTMLDivElement | null>(null);
  const meta = stateMeta[state] ?? stateMeta.waiting;

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'ORÁCULO - Plataforma de Trading Inteligente';
    return () => {
      document.title = previousTitle;
    };
  }, []);

  const focusLogin = () => {
    loginRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#02070B] text-[#F4F4F5]">
      <style>{`
        @keyframes oracleSphereShift {
          0% { color: #006cff; box-shadow: 0 0 54px rgba(0, 108, 255, 0.42), inset 0 0 42px rgba(0, 108, 255, 0.22); }
          30% { color: #00d8ff; box-shadow: 0 0 62px rgba(0, 216, 255, 0.48), inset 0 0 48px rgba(0, 216, 255, 0.25); }
          62% { color: #00ff88; box-shadow: 0 0 62px rgba(0, 255, 136, 0.42), inset 0 0 44px rgba(0, 255, 136, 0.20); }
          100% { color: #d4af37; box-shadow: 0 0 58px rgba(212, 175, 55, 0.42), inset 0 0 44px rgba(212, 175, 55, 0.20); }
        }
        @keyframes oraclePulse {
          0%, 100% { opacity: .45; transform: scale(.96); }
          50% { opacity: .95; transform: scale(1.04); }
        }
        .oracle-sphere-glow { animation: oracleSphereShift 9s ease-in-out infinite alternate; }
        .oracle-eye-pulse, .oracle-forehead-pulse { animation: oraclePulse 3.8s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .oracle-sphere-glow, .oracle-eye-pulse, .oracle-forehead-pulse { animation: none; }
        }
      `}</style>
      <Header onLoginFocus={focusLogin} />
      <main className="relative">
        <section className="relative min-h-[590px] overflow-hidden border-b border-[#F4F4F5]/8 px-5 py-12 sm:px-8 lg:min-h-[570px]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_52%_44%,rgba(0,216,255,0.18),transparent_20%),linear-gradient(90deg,#02070B_0%,rgba(2,7,11,0.72)_44%,rgba(2,7,11,0.94)_100%)]" />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(0,216,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(0,216,255,0.028)_1px,transparent_1px)] bg-[size:76px_76px] opacity-40" />
          <OracleHeroArt state={state} />

          <div className="relative z-10 mx-auto max-w-[1320px]">
            <div className="max-w-[560px] pt-4 lg:pt-14">
              <div className="inline-flex items-center gap-2 rounded border border-[#00D8FF]/45 bg-[#00D8FF]/8 px-4 py-2 text-[12px] font-bold uppercase tracking-[0.16em] text-[#00D8FF]">
                <Target className="h-4 w-4" />
                Plataforma de Trading Inteligente
              </div>
              <h1 className="mt-7 text-[56px] font-bold uppercase leading-none tracking-[-0.03em] text-[#F4F4F5] drop-shadow-[0_0_22px_rgba(244,244,245,0.18)] sm:text-[84px] lg:text-[104px]">
                Oráculo
              </h1>
              <p className="mt-4 text-[17px] font-semibold uppercase tracking-[0.28em] text-[#00D8FF] sm:text-[19px]">
                Plataforma de Trading Inteligente
              </p>
              <p className="mt-7 max-w-[460px] text-[17px] leading-7 text-[#F4F4F5]/86">
                Inteligência que observa o mercado antes de todos. Decisões precisas. Controle absoluto.
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={focusLogin}
                  className="inline-flex min-h-11 items-center justify-center gap-4 rounded bg-[#37D9F4] px-7 text-[13px] font-bold uppercase tracking-[0.12em] text-[#02070B] shadow-[0_0_34px_rgba(55,217,244,0.20)] transition-all hover:-translate-y-0.5"
                >
                  Entrar no Oráculo
                  <ArrowRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => document.getElementById('como-funciona')?.scrollIntoView({ behavior: 'smooth' })}
                  className="inline-flex min-h-11 items-center justify-center rounded border border-[#F4F4F5]/24 bg-[#061014]/72 px-7 text-[13px] font-bold uppercase tracking-[0.12em] text-[#F4F4F5]/78 transition-colors hover:border-[#00D8FF]/70 hover:text-[#00D8FF]"
                >
                  Conhecer a plataforma
                </button>
              </div>
              <MetricStrip />
              <MobileOracleArt state={state} />
              <p className="mt-4 text-[11px] uppercase tracking-[0.18em]" style={{ color: meta.color }}>{meta.message}</p>
            </div>
          </div>
        </section>

        <FeatureGrid />

        <section
          ref={loginRef}
          className="relative z-20 mx-auto mt-4 grid max-w-[1320px] scroll-mt-8 gap-8 rounded border border-[#24414B] bg-[#061014]/84 p-7 shadow-[0_24px_110px_rgba(0,0,0,0.40)] backdrop-blur-xl md:grid-cols-[0.9fr_1.1fr]"
        >
          <div className="hidden min-h-[220px] rounded border border-[#24414B]/60 bg-[radial-gradient(circle_at_50%_46%,rgba(0,216,255,0.09),transparent_30%),linear-gradient(135deg,rgba(0,216,255,0.05),transparent)] md:block" />
          <div className="grid gap-7 md:grid-cols-[1fr_0.82fr]">
            <LoginPanel loading={loading} error={error} onLogin={onLogin} />
            <DemoCard onLoginFocus={focusLogin} />
          </div>
        </section>

        <BenefitsFooter />
      </main>
    </div>
  );
}
