import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  Bell,
  BrainCircuit,
  Cloud,
  Database,
  Infinity,
  Lock,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Target,
} from 'lucide-react';
import type { OracleVisualState } from '@shared/oracleVisualState';

const GUARDIAN_IMAGE_SRC = '/brand/oraculo-landing-approved.webp';

const steps = [
  { title: 'Coleta de dados', text: 'Dados em tempo real de múltiplas fontes.', icon: Database },
  { title: 'Análise inteligente', text: 'IA identifica padrões e oportunidades.', icon: BrainCircuit },
  { title: 'Sinal aprovado', text: 'Probabilidade alta + gerenciamento.', icon: Target },
  { title: 'Gestão de risco', text: 'Proteção do capital em primeiro lugar.', icon: ShieldCheck },
  { title: 'Alertas e execução', text: 'Notificações e execução com disciplina.', icon: Bell },
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

function OracleGlyph({ className = '' }: { className?: string }) {
  return (
    <div className={`relative grid place-items-center rounded-full border border-[#D4AF37]/75 bg-[#0A0907]/54 shadow-[0_0_34px_rgba(212,175,55,0.28)] ${className}`}>
      <span className="absolute inset-2 rounded-full border border-[#D4AF37]/38" />
      <span className="absolute h-[72%] w-px bg-gradient-to-b from-transparent via-[#D4AF37] to-transparent shadow-[0_0_16px_rgba(212,175,55,0.82)]" />
      <span className="absolute h-[34%] w-[34%] rounded-full border border-[#D4AF37]/80" />
      <span className="absolute bottom-[16%] h-[34%] w-px bg-[#D4AF37]" />
      <span className="absolute top-[14%] h-[30%] w-[18%] border-x border-t border-[#D4AF37]/80" />
    </div>
  );
}

function BackgroundMarketPanels() {
  return (
    <>
      <div className="pointer-events-none absolute left-0 top-20 hidden w-[255px] rounded-lg border border-[#D4AF37]/18 bg-[#061014]/34 p-5 shadow-[0_24px_90px_rgba(0,0,0,0.44)] backdrop-blur-sm xl:block">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-lg uppercase tracking-[0.04em] text-[#F4F4F5]/82">BTC/USDT</p>
            <p className="mt-1 text-[12px] uppercase tracking-[0.16em] text-[#F4F4F5]/60">Futures</p>
          </div>
          <div className="grid h-16 w-16 place-items-center rounded-full border border-[#D4AF37]/35 text-3xl font-semibold text-[#D4AF37]/80 shadow-[0_0_36px_rgba(212,175,55,0.18)]">
            ₿
          </div>
        </div>
        <p className="mt-5 text-4xl font-light tracking-[-0.02em] text-[#63FFE6]">113,197.50</p>
        <p className="mt-2 text-sm text-[#00FF88]">+2,35%</p>
        <div className="mt-5 h-36 overflow-hidden rounded border border-[#00D8FF]/12 bg-[#071116]/74">
          <div className="h-full w-full bg-[linear-gradient(160deg,transparent_12%,rgba(0,216,255,0.18)_46%,transparent_47%),linear-gradient(18deg,transparent_45%,rgba(0,255,136,0.20)_46%,transparent_48%),linear-gradient(to_top,rgba(0,216,255,0.22),transparent_45%)]" />
        </div>
      </div>

      <div className="pointer-events-none absolute left-0 top-[370px] hidden w-[190px] rounded-lg border border-[#D4AF37]/18 bg-[#061014]/42 p-4 text-[12px] uppercase tracking-[0.08em] text-[#F4F4F5]/78 shadow-[0_18px_70px_rgba(0,0,0,0.36)] backdrop-blur-sm xl:block">
        <p className="mb-4 text-sm text-[#F4F4F5]/88">Oráculo system</p>
        <p>Status: <span className="text-[#00FF88]">Ativo</span></p>
        <p className="mt-3">Modo: <span className="text-[#00D8FF]">Estratégico</span></p>
        <p className="mt-3">Risco: <span className="text-[#00D8FF]">1.00%</span></p>
        <p className="mt-3">Missão: <span className="text-[#00FF88]">Consistência</span></p>
        <p className="mt-3">Disciplina: <span className="text-[#00D8FF]">100%</span></p>
      </div>

      <div className="pointer-events-none absolute right-0 top-16 hidden h-[410px] w-[260px] opacity-35 xl:block">
        <div className="grid h-full grid-cols-1 gap-2 text-right text-[11px] font-mono text-[#D4AF37]/38">
          {Array.from({ length: 18 }, (_, index) => (
            <span key={index}>{(31790 + index * 43.17).toLocaleString('en-US', { minimumFractionDigits: 3 })}</span>
          ))}
        </div>
      </div>
    </>
  );
}

function StepFlow() {
  return (
    <section id="como-funciona" className="relative z-20 mx-auto -mt-1 w-full max-w-[1100px]">
      <div className="grid gap-4 md:grid-cols-5">
        {steps.map((step, index) => {
          const Icon = step.icon;
          return (
            <article
              key={step.title}
              className="relative min-h-[178px] rounded-[10px] border border-[#D4AF37]/32 bg-[#071114]/82 p-5 text-center shadow-[0_24px_100px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(244,244,245,0.05)] backdrop-blur-md"
            >
              {index > 0 && (
                <span className="absolute -left-[18px] top-1/2 hidden -translate-y-1/2 text-2xl font-light text-[#00FFF0] md:block">→</span>
              )}
              <div className="mx-auto grid h-16 w-16 place-items-center text-[#63FFE6] drop-shadow-[0_0_18px_rgba(99,255,230,0.45)]">
                <Icon className="h-12 w-12 stroke-[1.4]" />
              </div>
              <h2 className="mt-5 text-[13px] font-bold uppercase tracking-[0.02em] text-[#F4F4F5]">
                {index + 1}. {step.title}
              </h2>
              <p className="mt-3 text-[13px] leading-5 text-[#F4F4F5]/72">{step.text}</p>
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
      <h2 className="text-[24px] font-medium uppercase tracking-[0.04em] text-[#00F5D4]">Acesso à plataforma</h2>
      <p className="mt-3 text-[16px] text-[#F4F4F5]/82">Entre com sua conta para continuar</p>

      <label className="mt-6 grid gap-2">
        <span className="text-[16px] text-[#F4F4F5]/88">E-mail</span>
        <span className="flex min-h-[54px] items-center gap-3 rounded-md border border-[#F4F4F5]/20 bg-[#071014]/78 px-4 shadow-[inset_0_0_20px_rgba(0,216,255,0.03)] focus-within:border-[#00F5D4]/70">
          <Mail className="h-5 w-5 text-[#F4F4F5]/70" />
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            inputMode="email"
            className="min-w-0 flex-1 bg-transparent text-[15px] text-[#F4F4F5] outline-none placeholder:text-[#F4F4F5]/52"
            placeholder="seu@email.com"
          />
        </span>
      </label>

      <label className="mt-4 grid gap-2">
        <span className="text-[16px] text-[#F4F4F5]/88">Senha</span>
        <span className="flex min-h-[54px] items-center gap-3 rounded-md border border-[#F4F4F5]/20 bg-[#071014]/78 px-4 shadow-[inset_0_0_20px_rgba(0,216,255,0.03)] focus-within:border-[#00F5D4]/70">
          <LockKeyhole className="h-5 w-5 text-[#F4F4F5]/70" />
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            autoComplete="current-password"
            className="min-w-0 flex-1 bg-transparent text-[15px] text-[#F4F4F5] outline-none placeholder:text-[#F4F4F5]/52"
            placeholder="••••••••••••"
          />
        </span>
      </label>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <label className="inline-flex min-h-9 items-center gap-3 text-[15px] text-[#F4F4F5]/84">
          <input
            type="checkbox"
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
            className="h-5 w-5 rounded border-[#F4F4F5]/25 bg-transparent accent-[#00F5D4]"
          />
          Lembrar-me
        </label>
        <button
          type="button"
          onClick={() => setRecoveryHint(true)}
          className="min-h-9 text-[15px] font-medium text-[#00D8FF] transition-colors hover:text-[#00F5D4]"
        >
          Esqueci minha senha
        </button>
      </div>

      {recoveryHint && (
        <p className="mt-2 text-sm leading-5 text-[#F4F4F5]/58">
          Recuperação de acesso deve ser solicitada ao administrador do Oráculo.
        </p>
      )}
      {error && <p className="mt-3 text-sm leading-5 text-[#FF4D4D]">{error}</p>}

      <button
        type="submit"
        disabled={loading || password.length === 0 || username.trim().length === 0}
        className="mt-6 inline-flex min-h-[58px] w-full items-center justify-center gap-5 rounded-md border border-[#00F5D4]/65 bg-[radial-gradient(circle_at_50%_0%,rgba(244,244,245,0.20),transparent_34%),linear-gradient(90deg,rgba(0,255,136,0.58),rgba(0,216,255,0.34))] px-5 text-[20px] font-semibold uppercase tracking-[0.16em] text-[#F4F4F5] shadow-[0_0_26px_rgba(0,255,200,0.22),inset_0_0_24px_rgba(0,255,200,0.10)] transition-all hover:-translate-y-0.5 hover:shadow-[0_0_42px_rgba(0,255,200,0.32)] disabled:cursor-not-allowed disabled:opacity-40"
      >
        {loading ? 'Entrando...' : 'Entrar'}
        <ArrowRight className="h-7 w-7" />
      </button>
    </form>
  );
}

function DemoCard({ onLoginFocus }: { onLoginFocus: () => void }) {
  return (
    <aside className="min-w-0 border-t border-[#F4F4F5]/10 pt-8 md:border-l md:border-t-0 md:pl-8 md:pt-0">
      <h2 className="text-center text-[19px] font-medium uppercase tracking-[0.06em] text-[#D4AF37]">Demonstração</h2>
      <p className="mt-3 text-center text-[16px] text-[#F4F4F5]/82">Conheça o poder do Oráculo</p>
      <div className="mt-7 rounded-lg border border-[#D4AF37]/42 bg-[#071014]/78 p-6 shadow-[0_22px_80px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(244,244,245,0.04)]">
        <div className="flex gap-5">
          <div className="grid h-20 w-20 flex-shrink-0 place-items-center text-[#63FFE6] drop-shadow-[0_0_16px_rgba(99,255,230,0.35)]">
            <BarChart3 className="h-14 w-14 stroke-[1.5]" />
          </div>
          <div className="min-w-0 pt-1">
            <h3 className="text-[17px] font-semibold text-[#F4F4F5]">Ambiente de Demonstração</h3>
            <p className="mt-3 text-[16px] leading-7 text-[#F4F4F5]/72">
              Explore a plataforma com dados simulados e estratégias.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onLoginFocus}
          className="mt-8 inline-flex min-h-[58px] w-full items-center justify-center rounded-md border border-[#00F5D4]/65 px-5 text-[18px] font-medium uppercase tracking-[0.12em] text-[#00F5D4] transition-all hover:-translate-y-0.5 hover:bg-[#00F5D4]/10 hover:shadow-[0_0_28px_rgba(0,245,212,0.18)]"
        >
          Entrar no DEMO
        </button>
      </div>
    </aside>
  );
}

function BenefitsFooter() {
  return (
    <footer className="relative z-20 mx-auto mt-8 w-full max-w-[1110px] pb-10">
      <div className="grid gap-3 md:grid-cols-3">
        {benefits.slice(0, 3).map((benefit) => (
          <BenefitCard key={benefit.title} {...benefit} />
        ))}
      </div>
      <div className="mx-auto mt-3 grid max-w-[820px] gap-3 md:grid-cols-2">
        {benefits.slice(3).map((benefit) => (
          <BenefitCard key={benefit.title} {...benefit} />
        ))}
      </div>
      <p className="mt-8 text-center text-[16px] text-[#F4F4F5]/48">
        © 2026 Oráculo. Todos os direitos reservados.
        <span className="mx-7 text-[#D4AF37]">•</span>
        v0.5.0
      </p>
    </footer>
  );
}

function BenefitCard({
  title,
  text,
  icon: Icon,
}: {
  title: string;
  text: string;
  icon: typeof ShieldCheck;
}) {
  return (
    <div className="flex min-h-[108px] items-center gap-4 rounded-lg border border-[#D4AF37]/20 bg-[#071014]/72 p-4 shadow-[0_18px_70px_rgba(0,0,0,0.30)] backdrop-blur-md">
      <div className="grid h-16 w-16 flex-shrink-0 place-items-center rounded-full border border-[#D4AF37]/28 bg-[#00F5D4]/8 text-[#63FFE6] shadow-[0_0_22px_rgba(0,245,212,0.10)]">
        <Icon className="h-9 w-9 stroke-[1.45]" />
      </div>
      <div className="min-w-0">
        <p className="text-[14px] font-semibold uppercase tracking-[0.04em] text-[#00F5D4]">{title}</p>
        <p className="mt-2 text-[15px] leading-6 text-[#F4F4F5]/70">{text}</p>
      </div>
    </div>
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
    <div className="min-h-screen overflow-x-hidden bg-[#01070A] text-[#F4F4F5]">
      <main className="relative min-h-screen px-4 pb-0 pt-0 sm:px-6">
        <img
          src={GUARDIAN_IMAGE_SRC}
          alt=""
          aria-hidden="true"
          className="pointer-events-none fixed left-1/2 top-0 h-[930px] w-[1280px] max-w-none -translate-x-1/2 object-cover object-top opacity-[0.62] saturate-[1.05] [clip-path:inset(0_0_17%_0)] sm:h-[1040px] sm:w-[1470px] lg:h-[1100px] lg:w-[1560px]"
          loading="eager"
          decoding="async"
        />
        <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_37%,rgba(212,175,55,0.18),transparent_21%),radial-gradient(circle_at_66%_34%,rgba(0,216,255,0.13),transparent_16%),linear-gradient(180deg,rgba(1,7,10,0.24)_0%,rgba(1,7,10,0.48)_38%,rgba(1,7,10,0.84)_64%,#01070A_100%)]" />
        <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(90deg,#01070A_0%,rgba(1,7,10,0.45)_34%,rgba(1,7,10,0.35)_62%,#01070A_100%)]" />
        <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(rgba(212,175,55,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(0,216,255,0.022)_1px,transparent_1px)] bg-[size:74px_74px] opacity-55" />
        <div className="pointer-events-none fixed inset-x-0 bottom-0 h-[42vh] bg-gradient-to-t from-[#01070A] via-[#01070A]/92 to-transparent" />

        <section className="relative z-10 mx-auto min-h-[900px] w-full max-w-[1180px] pt-6 sm:min-h-[965px] lg:min-h-[1000px]">
          <BackgroundMarketPanels />
          <OracleGlyph className="absolute left-1/2 top-[74px] h-[118px] w-[118px] -translate-x-1/2 text-[#D4AF37] sm:top-[82px]" />

          <div className="absolute left-1/2 top-[405px] flex w-full max-w-[480px] -translate-x-1/2 flex-col items-center text-center sm:left-[68%] sm:top-[450px] sm:translate-x-0 lg:left-[59%]">
            <OracleGlyph className="h-[92px] w-[92px]" />
            <h1 className="mt-8 whitespace-nowrap text-[44px] font-light uppercase leading-none tracking-[0.28em] text-[#F4F4F5] drop-shadow-[0_0_22px_rgba(244,244,245,0.20)] sm:text-[62px] lg:text-[70px]">
              Oráculo
            </h1>
            <p className="mt-5 whitespace-nowrap text-[13px] font-medium uppercase tracking-[0.25em] text-[#00F5D4] sm:text-[15px]">
              Plataforma de Trading Inteligente
            </p>
            <p className="mt-7 max-w-[470px] text-[18px] leading-8 text-[#F4F4F5]/90">
              Inteligência que antecede. Disciplina que executa.
              <br />
              Resultados que se repetem.
            </p>
            <div className="mt-5 flex w-full max-w-[370px] items-center gap-3 text-[#00F5D4]">
              <span className="h-px flex-1 bg-gradient-to-r from-transparent to-[#00F5D4]/42" />
              <span className="h-2.5 w-2.5 rotate-45 border border-[#00F5D4]" />
              <span className="h-px flex-1 bg-gradient-to-l from-transparent to-[#00F5D4]/42" />
            </div>
            <p className="mt-4 text-[11px] uppercase tracking-[0.18em]" style={{ color: meta.color }}>
              {meta.message}
            </p>
          </div>

          <div className="absolute left-1/2 top-[610px] h-[300px] w-[520px] -translate-x-1/2 rounded-full border border-[#D4AF37]/18 bg-[radial-gradient(circle_at_50%_38%,rgba(0,255,136,0.13),transparent_34%),radial-gradient(circle_at_58%_43%,rgba(255,77,77,0.10),transparent_30%)] opacity-70 blur-[1px]" />
          <StepFlow />
        </section>

        <section
          ref={loginRef}
          className="relative z-20 mx-auto -mt-4 grid w-full max-w-[1100px] scroll-mt-10 gap-8 rounded-[10px] border border-[#D4AF37]/38 bg-[#061014]/88 p-7 shadow-[0_0_0_1px_rgba(0,245,212,0.04),0_32px_120px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(244,244,245,0.04)] backdrop-blur-xl md:grid-cols-[1.2fr_0.95fr] md:p-8"
        >
          <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#D4AF37]/70 to-transparent" />
          <span className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[#D4AF37]/65 to-transparent" />
          <LoginPanel loading={loading} error={error} onLogin={onLogin} />
          <DemoCard onLoginFocus={focusLogin} />
        </section>

        <BenefitsFooter />
      </main>
    </div>
  );
}
