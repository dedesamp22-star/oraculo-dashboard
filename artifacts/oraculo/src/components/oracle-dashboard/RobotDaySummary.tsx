import {
  Activity,
  BarChart3,
  CheckCircle2,
  Clock3,
  Crosshair,
  CircleMinus,
  ShieldCheck,
  Target,
  TrendingDown,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import type { DemoSession, DemoTrade } from '../../lib/demo';
import type { EngineAuditEntry } from '../../lib/demoApi';

interface RobotDaySummaryProps {
  session: DemoSession;
  openTrades: DemoTrade[];
  auditEntries: EngineAuditEntry[];
  workerLastCycleAt?: string | null;
}

type EventTone = 'positive' | 'negative' | 'gold' | 'blue' | 'neutral';

interface RobotEvent {
  key: string;
  at: number;
  title: string;
  detail: string;
  tone: EventTone;
  icon: typeof Activity;
}

const SP_TIMEZONE = 'America/Sao_Paulo';

function validNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function spDay(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-CA', { timeZone: SP_TIMEZONE });
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('pt-BR', {
    timeZone: SP_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatUsd(value: number | null | undefined, signed = false): string {
  if (!validNumber(value)) return '—';
  const formatted = Math.abs(value).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (!signed) return formatted;
  return `${value >= 0 ? '+' : '-'}${formatted}`;
}

function shortPair(pair: string): string {
  return pair.replace('USDT', '');
}

function closeEvent(trade: DemoTrade): Omit<RobotEvent, 'key' | 'at'> {
  const reason = trade.exitReason ?? trade.status;
  if (reason === 'STOP_LOSS') {
    return {
      title: `Saída no stop em ${shortPair(trade.pair)}`,
      detail: `A proteção encerrou a operação com ${formatUsd(trade.pnlUSDC, true)}.`,
      tone: 'negative',
      icon: XCircle,
    };
  }
  if (reason === 'TARGET_1') {
    return {
      title: `Alvo 1 atingido em ${shortPair(trade.pair)}`,
      detail: `O primeiro objetivo foi alcançado. Resultado: ${formatUsd(trade.pnlUSDC, true)}.`,
      tone: 'positive',
      icon: Target,
    };
  }
  if (reason === 'TARGET_2') {
    return {
      title: `Alvo 2 atingido em ${shortPair(trade.pair)}`,
      detail: `A operação chegou ao objetivo final. Resultado: ${formatUsd(trade.pnlUSDC, true)}.`,
      tone: 'positive',
      icon: CheckCircle2,
    };
  }
  if (reason === 'TRAILING_STOP') {
    return {
      title: `Lucro protegido em ${shortPair(trade.pair)}`,
      detail: `O trailing stop encerrou a posição com ${formatUsd(trade.pnlUSDC, true)}.`,
      tone: (trade.pnlUSDC ?? 0) >= 0 ? 'positive' : 'negative',
      icon: ShieldCheck,
    };
  }
  if (reason === 'BREAKEVEN') {
    return {
      title: `Operação protegida no zero em ${shortPair(trade.pair)}`,
      detail: 'O stop foi movido para a entrada e a posição terminou sem perda relevante.',
      tone: 'gold',
      icon: CircleMinus,
    };
  }
  if (reason === 'TIMEOUT' || reason === 'TIME_EXIT' || reason === 'SESSION_END') {
    return {
      title: `Operação encerrada por tempo em ${shortPair(trade.pair)}`,
      detail: `O robô saiu pelo limite operacional. Resultado: ${formatUsd(trade.pnlUSDC, true)}.`,
      tone: (trade.pnlUSDC ?? 0) >= 0 ? 'positive' : 'negative',
      icon: Clock3,
    };
  }
  return {
    title: `Operação encerrada em ${shortPair(trade.pair)}`,
    detail: `Resultado registrado: ${formatUsd(trade.pnlUSDC, true)}.`,
    tone: (trade.pnlUSDC ?? 0) >= 0 ? 'positive' : 'negative',
    icon: Activity,
  };
}

function decisionCopy(decision: string): { title: string; tone: EventTone; icon: typeof Activity } {
  const normalized = decision.toUpperCase();
  if (normalized.includes('BUY') || normalized.includes('COMPRA')) {
    return { title: 'Análise apontou compra', tone: 'positive', icon: TrendingUp };
  }
  if (normalized.includes('SELL') || normalized.includes('VENDA')) {
    return { title: 'Análise apontou venda', tone: 'negative', icon: TrendingDown };
  }
  return { title: 'Análise concluída: aguardando setup', tone: 'blue', icon: BarChart3 };
}

export function RobotDaySummary({
  session,
  openTrades,
  auditEntries,
  workerLastCycleAt,
}: RobotDaySummaryProps) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: SP_TIMEZONE });
  const tradeMap = new Map<string, DemoTrade>();

  for (const trade of session.history) tradeMap.set(trade.id, trade);
  for (const trade of openTrades) tradeMap.set(trade.id, trade);

  const events: RobotEvent[] = [];

  for (const trade of tradeMap.values()) {
    if (spDay(trade.openTime) === today) {
      events.push({
        key: `${trade.id}:open`,
        at: trade.openTime,
        title: `Entrada de ${trade.direction === 'BUY' ? 'compra' : 'venda'} em ${shortPair(trade.pair)}`,
        detail: `Entrada executada em ${trade.entry.toLocaleString('en-US', { maximumFractionDigits: 3 })}.`,
        tone: trade.direction === 'BUY' ? 'positive' : 'negative',
        icon: Crosshair,
      });
    }

    if (trade.closeTime && spDay(trade.closeTime) === today) {
      const event = closeEvent(trade);
      events.push({
        key: `${trade.id}:close`,
        at: trade.closeTime,
        ...event,
      });
    }
  }

  const latestAudit = auditEntries
    .filter((entry) => {
      const timestamp = new Date(entry.analyzedAt).getTime();
      return Number.isFinite(timestamp) && spDay(timestamp) === today;
    })
    .sort((a, b) => new Date(b.analyzedAt).getTime() - new Date(a.analyzedAt).getTime())[0];

  if (latestAudit) {
    const timestamp = new Date(latestAudit.analyzedAt).getTime();
    const copy = decisionCopy(latestAudit.decision);
    events.push({
      key: `audit:${latestAudit.id}`,
      at: timestamp,
      title: copy.title,
      detail: latestAudit.decisiveReason || 'O motor terminou a leitura do mercado.',
      tone: copy.tone,
      icon: copy.icon,
    });
  }

  events.sort((a, b) => b.at - a.at);
  const visibleEvents = events.slice(0, 6);
  const latestEvent = visibleEvents[0] ?? null;
  const totalTrades = session.dailyStats.totalTrades;
  const wins = session.dailyStats.wins;
  const losses = session.dailyStats.losses;
  const result = session.dailyStats.dailyPnL;
  const cycleTime = workerLastCycleAt ? new Date(workerLastCycleAt).getTime() : null;
  const lastAnalysisAt = latestAudit
    ? new Date(latestAudit.analyzedAt).getTime()
    : cycleTime && Number.isFinite(cycleTime)
      ? cycleTime
      : null;
  const LatestIcon = latestEvent?.icon ?? Activity;

  return (
    <section className="oracle-day-summary">
      <header className="oracle-day-summary-header">
        <div>
          <span className="oracle-eyebrow">Leitura simples</span>
          <h2>O que o robô fez hoje</h2>
          <p>Resumo automático das entradas, saídas e decisões registradas no servidor.</p>
        </div>
        <div className="oracle-day-live">
          <span />
          Hoje · horário de São Paulo
        </div>
      </header>

      <div className="oracle-day-stat-grid">
        <div>
          <span>Operações</span>
          <strong>{totalTrades}</strong>
          <small>{openTrades.length} aberta{openTrades.length === 1 ? '' : 's'} agora</small>
        </div>
        <div className="positive">
          <span>Ganhos</span>
          <strong>{wins}</strong>
          <small>Alvos e fechamentos positivos</small>
        </div>
        <div className="negative">
          <span>Perdas</span>
          <strong>{losses}</strong>
          <small>Saídas negativas registradas</small>
        </div>
        <div className={(result ?? 0) >= 0 ? 'positive' : 'negative'}>
          <span>Resultado realizado</span>
          <strong>{formatUsd(result, true)}</strong>
          <small>Somente operações encerradas</small>
        </div>
      </div>

      <div className="oracle-day-main-grid">
        <article className={`oracle-last-action ${latestEvent?.tone ?? 'neutral'}`}>
          <div className="oracle-last-action-icon">
            <LatestIcon size={22} />
          </div>
          <div>
            <span>Último acontecimento</span>
            <strong>{latestEvent?.title ?? 'Nenhuma entrada executada hoje'}</strong>
            <p>{latestEvent?.detail ?? 'O robô continua analisando BTC, ETH e SOL e só entra quando o setup fica completo.'}</p>
          </div>
          <time>{latestEvent ? formatTime(latestEvent.at) : '—'}</time>
        </article>

        <article className="oracle-analysis-clock">
          <Clock3 size={18} />
          <div>
            <span>Última análise</span>
            <strong>{lastAnalysisAt ? formatTime(lastAnalysisAt) : '—'}</strong>
            <small>{latestAudit?.decisionState ?? 'Aguardando informação do worker'}</small>
          </div>
        </article>
      </div>

      <div className="oracle-day-timeline" aria-label="Acontecimentos recentes do robô">
        {visibleEvents.length === 0 ? (
          <div className="oracle-day-empty">
            <ShieldCheck size={17} />
            <span>Nenhuma operação foi executada hoje. Isso não é erro: o robô está aguardando uma entrada válida.</span>
          </div>
        ) : (
          visibleEvents.map((event) => {
            const Icon = event.icon;
            return (
              <article key={event.key} className={event.tone}>
                <div className="oracle-event-icon"><Icon size={15} /></div>
                <div>
                  <strong>{event.title}</strong>
                  <span>{event.detail}</span>
                </div>
                <time>{formatTime(event.at)}</time>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
