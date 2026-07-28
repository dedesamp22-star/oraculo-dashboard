import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  Bell,
  BrainCircuit,
  CheckCircle2,
  Cloud,
  Database,
  Infinity,
  Lock,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Target,
  Zap,
} from 'lucide-react';
import type { OracleVisualState } from '@shared/oracleVisualState';

const GUARDIAN_IMAGE_SRC = '/brand/oraculo-guardian.png';

const steps = [
  { title: 'Coleta de dados', text: 'Dados em tempo real de multiplas fontes.', icon: Database },
  { title: 'Analise inteligente', text: 'IA identifica padroes e oportunidades.', icon: BrainCircuit },
  { title: 'Sinal aprovado', text: 'Probabilidade alta com gerenciamento.', icon: Target },
  { title: 'Gestao de risco', text: 'Protecao do capital em primeiro lugar.', icon: ShieldCheck },
  { title: 'Alertas e execucao', text: 'Notificacoes e execucao com disciplina.', icon: Bell },
];

const benefits = [
  { title: 'Seguranca total', text: 'Seus dados e operacoes sempre protegidos.', icon: ShieldCheck },
  { title: 'Sem emocao', text: 'Decisoes racionais, 100% baseadas em dados.', icon: Lock },
  { title: 'Acesso de qualquer lugar', text: 'Web, Mobile e Telegram em tempo real.', icon: Cloud },
  { title: 'Tecnologia avancada', text: 'Infraestrutura robusta, rapida e escalavel.', icon: BrainCircuit },
  { title: 'Foco no que importa', text: 'Menos ruido, mais precisao, mais resultado.', icon: Infinity },
];

const stateMeta: Record<OracleVisualState, { label: string; color: string; message: string }> = {
  waiting: {
    label: 'Aguardando',
    color: '#D4AF37',
    message: 'O Oraculo observa o mercado.',
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
    message: 'Pressao vendedora dominante.',
  },
};

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function BrandSeal() {
  return (
    <div className="relative mx-auto grid h-20 w-20 place-items-center rounded-full border border-[#00FF88]/35 bg-[#00FF88]/10 shadow-[0_0_55px_rgba(0,255,136,0.16)]">
      <div className="absolute inset-2 rounded-full border border-[#00D8FF]/20" />
      <div className="absolute h-12 w-12 rotate-45 border border-[#00FF88]/55" />
      <div className="relative h-5 w-10 rounded-full border-2 border-[#00FF88] shadow-[0_0_22px_rgba(0,255,136,0.42)]">
        <div className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#00FF88]" />
      </div>
    </div>
  );
}

function BackgroundSystemPanel() {
  return (
    <>
      <div className="pointer-events-none absolute left-4 top-24 hidden w-52 rounded-lg border border-[#00D8FF]/10 bg-[#061018]/35 p-4 text-[#00D8FF]/70 shadow-[0_24px_80px_rgba(0,0,0,0.36)] backdrop-blur-sm lg:block">
        <p className="text-sm text-[#F4F4F5]/62">BTC/USDT</p>
        <p className="mt-1 text-[10px] uppercase tracking-[0.22em] text-[#00D8FF]/54">Futures</p>
        <p className="mt-4 text-3xl font-light text-[#00D8FF]/78">113,197.50</p>
        <p className="mt-2 text-xs text-[#00FF88]">+2,35%</p>
        <div className="mt-5 h-24 rounded border border-[#00D8FF]/10 bg-[linear-gradient(135deg,transparent_20%,rgba(0,216,255,0.16)),linear-gradient(to_top,rgba(0,255,136,0.20),transparent_55%)]" />
      </div>
      <div className="pointer-events-none absolute left-5 top-[21rem] hidden w-44 rounded-lg border border-[#00D8FF]/10 bg-[#061018]/38 p-4 text-[10px] uppercase tracking-[0.14em] text-[#00D8FF]/72 backdrop-blur-sm lg:block">
        <p className="mb-3 text-[#F4F4F5]/68">Oraculo system</p>
        <p>Status: <span className="text-[#00FF88]">Ativo</span></p>
        <p className="mt-3">Modo: Estrategico</p>
        <p className="mt-3">Risco: 1.00%</p>
        <p className="mt-3">Missao: Consistencia</p>
        <p className="mt-3">Disciplina: 100%</p>
      </div>
    </>
  );
}

function StepFlow() {
  return (
    <section id="como-funciona" className="relative z-10 mx-auto mt-12 w-full max-w-6xl">
      <div className="grid gap-3 md:grid-cols-5">
        {steps.map((step, index) => {
          const Icon = step.icon;
          return (
            <article
              key={step.title}
              className="group relative min-h-[150px] rounded-lg border border-[#00FF88]/14 bg-[#091316]/72 p-4 text-center shadow-[0_22px_80px_rgba(0,0,0,0.28)] backdrop-blur-md transition-all hover:-translate-y-1 hover:border-[#00FF88]/45 hover:bg-[#0B1D1B]/78"
            >
              {index > 0 && (
                <span className="absolute -left-3 top-1/2 hidden -translate-y-1/2 text-[#00FF88] md:block">→</span>
              )}
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-xl border border-[#00FF88]/28 bg-[#00FF88]/10 text-[#00FF88] shadow-[0_0_30px_rgba(0,255,136,0.14)] transition-transform group-hover:scale-105">
                <Icon className="h-7 w-7" />
              </div>
              <h2 className="mt-5 text-xs font-bold uppercase tracking-[0.12em] text-[#F4F4F5]">
                {index + 1}. {step.title}
              </h2>
              <p className="mt-2 text-xs leading-5 text-[#F4F4F5]/62">{step.text}</p>
            </article>
          );
        })}
      </div>
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
      <p className="text-lg font-semibold uppercase tracking-[0.08em] text-[#00FF88]">Acesso a plataforma</p>
      <p className="mt-2 text-sm text-[#F4F4F5]/72">Entre com sua conta para continuar</p>

      <label className="mt-6 grid gap-2">
        <span className="text-sm text-[#F4F4F5]/85">E-mail</span>
        <span className="flex min-h-12 items-center gap-3 rounded-md border border-[#F4F4F5]/12 bg-[#0B1215]/82 px-4 transition-colors focus-within:border-[#00FF88]/65">
          <Mail className="h-4 w-4 text-[#F4F4F5]/70" />
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            inputMode="email"
            className="min-w-0 flex-1 bg-transparent text-sm text-[#F4F4F5] outline-none placeholder:text-[#F4F4F5]/38"
            placeholder="seu@email.com"
          />
        </span>
      </label>

      <label className="mt-4 grid gap-2">
        <span className="text-sm text-[#F4F4F5]/85">Senha</span>
        <span className="flex min-h-12 items-center gap-3 rounded-md border border-[#F4F4F5]/12 bg-[#0B1215]/82 px-4 transition-colors focus-within:border-[#00FF88]/65">
          <LockKeyhole className="h-4 w-4 text-[#F4F4F5]/70" />
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            autoComplete="current-password"
            className="min-w-0 flex-1 bg-transparent text-sm text-[#F4F4F5] outline-none placeholder:text-[#F4F4F5]/38"
            placeholder="••••••••••••"
          />
        </span>
      </label>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <label className="inline-flex min-h-9 items-center gap-2 text-sm text-[#F4F4F5]/74">
          <input
            type="checkbox"
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
            className="h-4 w-4 rounded border-[#F4F4F5]/20 bg-transparent accent-[#00FF88]"
          />
          Lembrar-me
        </label>
        <button
          type="button"
          onClick={() => setRecoveryHint(true)}
          className="min-h-9 text-sm font-medium text-[#00D8FF] transition-colors hover:text-[#00FF88]"
        >
          Esqueci minha senha
        </button>
      </div>

      {recoveryHint && (
        <p className="mt-2 text-xs leading-5 text-[#F4F4F5]/52">
          Recuperacao de acesso deve ser solicitada ao administrador do Oraculo.
        </p>
      )}
      {error && <p className="mt-3 text-sm leading-5 text-[#FF4D4D]">{error}</p>}

      <button
        type="submit"
        disabled={loading || password.length === 0 || username.trim().length === 0}
        className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-md border border-[#00FF88]/45 bg-gradient-to-r from-[#00FF88]/70 to-[#00D8FF]/48 px-5 text-sm font-bold uppercase tracking-[0.12em] text-[#F4F4F5] shadow-[0_0_34px_rgba(0,255,136,0.18)] transition-all hover:-translate-y-0.5 hover:shadow-[0_0_48px_rgba(0,255,136,0.26)] disabled:cursor-not-allowed disabled:opacity-40"
      >
        {loading ? 'Entrando...' : 'Entrar'}
        <ArrowRight className="h-5 w-5" />
      </button>
    </form>
  );
}

function DemoCard({ onLoginFocus }: { onLoginFocus: () => void }) {
  return (
    <aside className="min-w-0 border-l border-[#F4F4F5]/10 pt-8 md:pl-8 md:pt-0">
      <p className="text-center text-sm font-semibold uppercase tracking-[0.12em] text-[#F4F4F5]/48">Demonstracao</p>
      <p className="mt-2 text-center text-sm text-[#F4F4F5]/72">Conheca o poder do Oraculo</p>
      <div className="mt-8 rounded-lg border border-[#F4F4F5]/12 bg-[#0B1215]/76 p-6 shadow-[0_22px_80px_rgba(0,0,0,0.28)]">
        <div className="flex gap-5">
          <div className="grid h-16 w-16 flex-shrink-0 place-items-center rounded-xl border border-[#00FF88]/25 bg-[#00FF88]/10 text-[#00FF88]">
            <BarChart3 className="h-9 w-9" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-[#F4F4F5]">Ambiente de Demonstracao</h3>
            <p className="mt-2 text-sm leading-6 text-[#F4F4F5]/70">
              Explore a plataforma com dados simulados e estrategias.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onLoginFocus}
          className="mt-7 inline-flex min-h-12 w-full items-center justify-center rounded-md border border-[#00FF88]/55 px-5 text-sm font-bold uppercase tracking-[0.12em] text-[#00FF88] transition-all hover:-translate-y-0.5 hover:bg-[#00FF88]/10 hover:shadow-[0_0_28px_rgba(0,255,136,0.16)]"
        >
          Entrar no DEMO
        </button>
      </div>
    </aside>
  );
}

function BenefitsFooter() {
  return (
    <footer className="relative z-10 mx-auto mt-10 w-full max-w-6xl pb-9">
      <div className="grid gap-3 rounded-xl border border-[#F4F4F5]/10 bg-[#091316]/70 p-3 shadow-[0_28px_90px_rgba(0,0,0,0.28)] backdrop-blur-md md:grid-cols-3 lg:grid-cols-5">
        {benefits.map((benefit) => {
          const Icon = benefit.icon;
          return (
            <div key={benefit.title} className="flex items-center gap-3 rounded-lg p-3">
              <div className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-full border border-[#00FF88]/20 bg-[#00FF88]/8 text-[#00FF88]">
                <Icon className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[0.08em] text-[#00FF88]">{benefit.title}</p>
                <p className="mt-1 text-xs leading-5 text-[#F4F4F5]/62">{benefit.text}</p>
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-7 text-center text-sm text-[#F4F4F5]/44">
        © 2026 Oraculo. Todos os direitos reservados. <span className="mx-4 text-[#00FF88]">•</span> v0.5.0
      </p>
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
    document.title = 'ORACULO - Plataforma de Trading Inteligente';
    return () => {
      document.title = previousTitle;
    };
  }, []);

  const focusLogin = () => {
    loginRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#020709] text-[#F4F4F5]">
      <main className="relative min-h-screen px-4 py-8 sm:px-6 lg:px-8">
        <img
          src={GUARDIAN_IMAGE_SRC}
          alt=""
          aria-hidden="true"
          className="pointer-events-none fixed left-1/2 top-0 h-[108vh] min-h-[760px] w-[120vw] max-w-none -translate-x-1/2 object-cover object-top opacity-[0.24] saturate-[0.9] [clip-path:inset(0_0_15%_0)]"
          loading="eager"
          decoding="async"
        />
        <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_38%,rgba(0,255,136,0.16),transparent_22%),radial-gradient(circle_at_50%_12%,rgba(0,216,255,0.13),transparent_24%),linear-gradient(180deg,rgba(2,7,9,0.58),rgba(2,7,9,0.88)_56%,#020709_100%)]" />
        <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(90deg,rgba(2,7,9,0.90),rgba(2,7,9,0.40)_42%,rgba(2,7,9,0.92))]" />
        <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(rgba(0,255,136,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(0,216,255,0.026)_1px,transparent_1px)] bg-[size:84px_84px] opacity-45" />
        <BackgroundSystemPanel />

        <section className="relative z-10 mx-auto flex min-h-[56vh] w-full max-w-6xl flex-col items-center justify-end pt-14 text-center sm:pt-20 lg:min-h-[52vh]">
          <BrandSeal />
          <h1 className="mt-6 text-5xl font-semibold uppercase leading-none tracking-[0.18em] text-[#F4F4F5] drop-shadow-[0_0_28px_rgba(244,244,245,0.14)] sm:text-7xl lg:text-8xl">
            Oraculo
          </h1>
          <p className="mt-4 text-sm font-semibold uppercase tracking-[0.22em] text-[#00FF88] sm:text-base">
            Plataforma de Trading Inteligente
          </p>
          <p className="mt-6 max-w-2xl text-base leading-7 text-[#F4F4F5]/78 sm:text-lg">
            Inteligencia que antecede. Disciplina que executa. Resultados que se repetem.
          </p>
          <div className="mt-5 flex w-full max-w-xl items-center gap-2 text-[#00FF88]/80">
            <span className="h-px flex-1 bg-gradient-to-r from-transparent to-[#00FF88]/45" />
            <span className="h-2 w-2 rotate-45 border border-[#00FF88]" />
            <span className="h-px flex-1 bg-gradient-to-l from-transparent to-[#00FF88]/45" />
          </div>
          <p className="mt-4 text-xs uppercase tracking-[0.18em]" style={{ color: meta.color }}>
            {meta.message}
          </p>
        </section>

        <StepFlow />

        <section
          ref={loginRef}
          className="relative z-10 mx-auto mt-8 grid w-full max-w-6xl scroll-mt-10 gap-8 rounded-xl border border-[#F4F4F5]/12 bg-[#061014]/82 p-6 shadow-[0_30px_120px_rgba(0,0,0,0.50)] backdrop-blur-xl md:grid-cols-[1.08fr_0.92fr] md:p-8"
        >
          <LoginPanel loading={loading} error={error} onLogin={onLogin} />
          <DemoCard onLoginFocus={focusLogin} />
        </section>

        <BenefitsFooter />
      </main>
    </div>
  );
}
