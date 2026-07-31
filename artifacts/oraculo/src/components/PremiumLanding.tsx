import { useEffect, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  Bell,
  Bot,
  CheckCircle2,
  Eye,
  EyeOff,
  FileSearch,
  LineChart,
  LockKeyhole,
  Radar,
  ShieldCheck,
  Sparkles,
  Target,
  Workflow,
} from 'lucide-react';
import type { OracleVisualState } from '@shared/oracleVisualState';

const ORACLE_BACKGROUND = '/brand/oraculo-dashboard-crystal.webp';
const ORACLE_MARK = '/brand/oraculo-mark.svg';

const stateLabels: Record<OracleVisualState, string> = {
  waiting: 'Aguardando',
  analyzing: 'Analisando',
  buy: 'Compra detectada',
  sell: 'Venda detectada',
};

const operationFlow = [
  {
    number: '01',
    title: 'Analisa',
    text: 'Lê preço, tendência, volatilidade e contexto dos ativos monitorados.',
    icon: Radar,
  },
  {
    number: '02',
    title: 'Decide',
    text: 'Aplica as regras do motor antes de autorizar qualquer oportunidade.',
    icon: Target,
  },
  {
    number: '03',
    title: 'Executa',
    text: 'Registra entrada, direção, preço, tamanho e motivo operacional.',
    icon: Workflow,
  },
  {
    number: '04',
    title: 'Gerencia',
    text: 'Acompanha stop, alvos, parcial, breakeven e encerramento.',
    icon: ShieldCheck,
  },
  {
    number: '05',
    title: 'Audita',
    text: 'Mantém histórico para entender o que aconteceu em cada operação.',
    icon: FileSearch,
  },
];

const capabilities = [
  {
    title: 'Mercado em tempo real',
    text: 'BTC, ETH e SOL acompanhados em uma única central operacional.',
    icon: LineChart,
  },
  {
    title: 'Gestão visível',
    text: 'Entradas, saídas, stops e alvos organizados para leitura rápida.',
    icon: BarChart3,
  },
  {
    title: 'Alertas importantes',
    text: 'Eventos relevantes do robô apresentados sem excesso de informação.',
    icon: Bell,
  },
  {
    title: 'Decisões registradas',
    text: 'Cada etapa permanece disponível no histórico e nos relatórios.',
    icon: CheckCircle2,
  },
];

function scrollToSection(id: string): void {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function Brand() {
  return (
    <div className="premium-v8-brand">
      <img src={ORACLE_MARK} alt="" aria-hidden="true" />
      <div>
        <strong>ORÁCULO</strong>
        <span>TRADER</span>
      </div>
    </div>
  );
}

function LoginTerminal({
  loading,
  error,
  onLogin,
}: {
  loading: boolean;
  error: string | null;
  onLogin: (username: string, password: string) => void;
}) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form
      className="premium-v8-login-card"
      onSubmit={(event) => {
        event.preventDefault();
        onLogin(username.trim(), password);
      }}
    >
      <div className="premium-v8-login-heading">
        <div className="premium-v8-login-icon">
          <LockKeyhole size={21} />
        </div>
        <div>
          <span>ACESSO PROTEGIDO</span>
          <h2>Acessar terminal</h2>
        </div>
      </div>

      <p className="premium-v8-login-description">
        Entre com suas credenciais para acessar o Dashboard operacional do Oráculo.
      </p>

      <label className="premium-v8-field">
        <span>Usuário</span>
        <input
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoComplete="username"
          placeholder="Digite seu usuário"
          disabled={loading}
        />
      </label>

      <label className="premium-v8-field">
        <span>Senha</span>
        <div className="premium-v8-password">
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="Digite sua senha"
            disabled={loading}
          />
          <button
            type="button"
            onClick={() => setShowPassword((current) => !current)}
            aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </label>

      {error && (
        <div className="premium-v8-login-error" role="alert">
          {error}
        </div>
      )}

      <button
        type="submit"
        className="premium-v8-login-submit"
        disabled={loading || username.trim().length === 0 || password.length === 0}
      >
        <span>{loading ? 'ENTRANDO...' : 'ENTRAR NO ORÁCULO'}</span>
        {!loading && <ArrowRight size={18} />}
      </button>

      <div className="premium-v8-login-meta">
        <span><i /> Ambiente DEMO</span>
        <span>Sessão protegida</span>
      </div>
    </form>
  );
}

export function PremiumLanding({
  loading,
  error,
  onLogin,
  state,
}: {
  loading: boolean;
  error: string | null;
  onLogin: (username: string, password: string) => void;
  state?: OracleVisualState;
}) {
  const visualState = state ?? 'waiting';

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'ORÁCULO TRADER';
    return () => {
      document.title = previousTitle;
    };
  }, []);

  return (
    <div className="premium-v8-shell">
      <header className="premium-v8-header">
        <div className="premium-v8-container premium-v8-header-inner">
          <Brand />

          <nav className="premium-v8-nav" aria-label="Navegação principal">
            <button type="button" onClick={() => scrollToSection('como-funciona')}>
              Como funciona
            </button>
            <button type="button" onClick={() => scrollToSection('recursos')}>
              Recursos
            </button>
            <button type="button" onClick={() => scrollToSection('transparencia')}>
              Transparência
            </button>
          </nav>

          <button
            type="button"
            className="premium-v8-header-login"
            onClick={() => scrollToSection('login')}
          >
            Acessar terminal
            <ArrowRight size={15} />
          </button>
        </div>
      </header>

      <main>
        <section className="premium-v8-hero">
          <div className="premium-v8-hero-image" aria-hidden="true" />
          <div className="premium-v8-hero-grid" aria-hidden="true" />
          <div className="premium-v8-hero-scan" aria-hidden="true" />

          <div className="premium-v8-container premium-v8-hero-inner">
            <div className="premium-v8-hero-copy">
              <div className="premium-v8-eyebrow">
                <Sparkles size={14} />
                INTELIGÊNCIA OPERACIONAL
              </div>

              <h1>
                INTELIGÊNCIA.
                <br />
                DISCIPLINA.
                <br />
                <em>EXECUÇÃO.</em>
              </h1>

              <p className="premium-v8-hero-lead">
                O Oráculo observa o mercado, organiza sinais e transforma cada decisão
                em um registro operacional claro.
              </p>

              <p className="premium-v8-hero-note">
                BTC, ETH e SOL monitorados em ambiente DEMO. Sem ordens reais.
              </p>

              <div className="premium-v8-hero-actions">
                <button type="button" className="premium-v8-primary" onClick={() => scrollToSection('login')}>
                  ENTRAR NO ORÁCULO
                  <ArrowRight size={18} />
                </button>
                <button type="button" className="premium-v8-secondary" onClick={() => scrollToSection('como-funciona')}>
                  CONHECER O SISTEMA
                </button>
              </div>

              <div className="premium-v8-status-strip">
                <div>
                  <span>AMBIENTE</span>
                  <strong>DEMO</strong>
                </div>
                <div>
                  <span>MOTOR</span>
                  <strong>ADAPTIVE V1</strong>
                </div>
                <div>
                  <span>ESTADO</span>
                  <strong>{stateLabels[visualState]}</strong>
                </div>
              </div>
            </div>

            <div className="premium-v8-presence" aria-hidden="true">
              <div className="premium-v8-presence-ring premium-v8-presence-ring-a" />
              <div className="premium-v8-presence-ring premium-v8-presence-ring-b" />
              <div className="premium-v8-presence-pulse" />
              <div className="premium-v8-presence-label">
                <Bot size={16} />
                <span>NÚCLEO DO ORÁCULO</span>
                <strong>{stateLabels[visualState]}</strong>
              </div>
            </div>
          </div>

          <div className="premium-v8-scroll-indicator">
            <span />
            EXPLORE O SISTEMA
          </div>
        </section>

        <section id="como-funciona" className="premium-v8-section premium-v8-flow-section">
          <div className="premium-v8-container">
            <div className="premium-v8-section-heading">
              <div>
                <span>FLUXO OPERACIONAL</span>
                <h2>Como o Oráculo trabalha</h2>
              </div>
              <p>
                Uma jornada simples para mostrar como o sistema acompanha o mercado
                desde a análise até o registro final.
              </p>
            </div>

            <div className="premium-v8-flow-grid">
              {operationFlow.map((step) => {
                const Icon = step.icon;
                return (
                  <article key={step.number} className="premium-v8-flow-card">
                    <div className="premium-v8-flow-top">
                      <span>{step.number}</span>
                      <Icon size={21} />
                    </div>
                    <h3>{step.title}</h3>
                    <p>{step.text}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section id="recursos" className="premium-v8-section premium-v8-capabilities-section">
          <div className="premium-v8-container premium-v8-capabilities-layout">
            <div className="premium-v8-capabilities-copy">
              <span>VISÃO COMPLETA</span>
              <h2>O essencial para acompanhar cada decisão.</h2>
              <p>
                A plataforma reúne mercado, operações, gestão, alertas e relatórios
                no mesmo ambiente visual.
              </p>
            </div>

            <div className="premium-v8-capabilities-grid">
              {capabilities.map((capability) => {
                const Icon = capability.icon;
                return (
                  <article key={capability.title} className="premium-v8-capability-card">
                    <Icon size={21} />
                    <h3>{capability.title}</h3>
                    <p>{capability.text}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section id="transparencia" className="premium-v8-section premium-v8-transparency-section">
          <div className="premium-v8-container">
            <div className="premium-v8-transparency-card">
              <div className="premium-v8-transparency-icon">
                <ShieldCheck size={28} />
              </div>
              <div>
                <span>TRANSPARÊNCIA OPERACIONAL</span>
                <h2>Ambiente de simulação</h2>
                <p>
                  O Oráculo está operando em modo DEMO. Os resultados exibidos pertencem
                  ao ambiente simulado e não representam promessa de lucro ou garantia
                  de desempenho futuro.
                </p>
              </div>
              <div className="premium-v8-transparency-badge">
                <i />
                ZERO ORDENS REAIS
              </div>
            </div>
          </div>
        </section>

        <section id="login" className="premium-v8-login-section">
          <div className="premium-v8-container premium-v8-login-layout">
            <div className="premium-v8-login-visual">
              <div className="premium-v8-login-art" aria-hidden="true" />
              <div className="premium-v8-login-visual-overlay" aria-hidden="true" />
              <div className="premium-v8-login-visual-copy">
                <span>PORTAL DO ORÁCULO</span>
                <h2>O mercado muda.<br />O Oráculo se adapta.</h2>
                <p>
                  Acesso direto ao Dashboard, operações, mercados, estratégia,
                  relatórios e sistema.
                </p>
              </div>
            </div>

            <LoginTerminal loading={loading} error={error} onLogin={onLogin} />
          </div>
        </section>
      </main>

      <footer className="premium-v8-footer">
        <div className="premium-v8-container premium-v8-footer-inner">
          <Brand />
          <p>ORÁCULO TRADER · AMBIENTE DEMO</p>
          <span>INTELIGÊNCIA. DISCIPLINA. RESULTADOS.</span>
        </div>
      </footer>
    </div>
  );
}
