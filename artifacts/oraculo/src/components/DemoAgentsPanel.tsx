import { Bot, PauseCircle, ShieldAlert, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import type { AgentConfig, AgentId, AgentState, AgentStates, GlobalRiskState, PortfolioState } from '../lib/demoAgents';
import type { RadarSymbol } from '../lib/marketRadar';

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function fmtMoney(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) return '—';
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPct(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) return '—';
  return `${(value * 100).toFixed(2)}%`;
}

function shortSymbol(symbol: RadarSymbol): string {
  return symbol.replace('USDT', '');
}

function decisionColor(decision: string): string {
  if (decision === 'COMPRA') return '#00ff66';
  if (decision === 'VENDA') return '#ff4444';
  return '#ffaa00';
}

function PortfolioMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[8px] font-mono uppercase tracking-[0.14em] text-muted-foreground truncate">{label}</p>
      <p className="mt-0.5 text-xs font-mono font-bold tabular-nums truncate">{value}</p>
    </div>
  );
}

function AgentCard({
  agent,
  config,
  selected,
  onClick,
}: {
  agent: AgentState;
  config: AgentConfig;
  selected: boolean;
  onClick: () => void;
}) {
  const color = decisionColor(agent.lastDecision);
  const active = agent.status !== 'PAUSED' && config.enabled;
  const reservedRisk = agent.openPosition?.riskAmount ?? agent.allocatedRisk;
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left border bg-background/20 p-3 transition-colors hover:bg-white/[0.03]"
      style={{ borderColor: selected ? color : 'var(--color-border)' }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Bot className="w-4 h-4 flex-shrink-0" style={{ color }} />
          <div className="min-w-0">
            <p className="text-sm font-mono font-bold uppercase tracking-[0.18em] truncate">{shortSymbol(agent.symbol)}</p>
            <p className="text-[9px] font-mono uppercase tracking-[0.12em] text-muted-foreground truncate">{agent.agentId}</p>
          </div>
        </div>
        <span className="text-[9px] font-mono uppercase tracking-[0.12em]" style={{ color: active ? '#00ff66' : '#ffaa00' }}>
          {active ? agent.status : 'PAUSADO'}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
        <PortfolioMetric label="Decisao" value={agent.lastDecision} />
        <PortfolioMetric label="Indice" value={`${agent.oracleScore}`} />
        <PortfolioMetric label="PnL" value={fmtMoney(agent.pnl)} />
        <PortfolioMetric label="Risco" value={fmtMoney(reservedRisk)} />
        <PortfolioMetric label="Posicao" value={agent.openPosition ? 'Aberta' : 'Sem posicao'} />
        <PortfolioMetric label="Modo" value={config.enabled ? 'Ativo' : 'Off'} />
      </div>
    </button>
  );
}

export function DemoAgentsPanel({
  agents,
  configs,
  portfolio,
  globalRisk,
  selectedSymbol,
  onSelectSymbol,
}: {
  agents: AgentStates;
  configs: Record<AgentId, AgentConfig>;
  portfolio: PortfolioState;
  globalRisk: GlobalRiskState;
  selectedSymbol: RadarSymbol;
  onSelectSymbol: (symbol: RadarSymbol) => void;
}) {
  const items = Object.values(configs);
  return (
    <section className="bg-card/50 backdrop-blur-md border border-border relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#00f0ff]/30 to-transparent" />
      <div className="p-4 flex flex-col gap-4">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3 justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="w-4 h-4 text-[#00f0ff]" />
            <div>
              <h2 className="text-xs font-mono font-bold uppercase tracking-[0.2em]">Agentes Demo</h2>
              <p className="text-[9px] font-mono text-muted-foreground uppercase tracking-[0.14em]">
                Banca global unica - sem ordens automaticas
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1 lg:max-w-2xl">
            <PortfolioMetric label="Banca global" value={fmtMoney(portfolio.currentBalance)} />
            <PortfolioMetric label="Risco aberto" value={fmtMoney(globalRisk.totalOpenRisk)} />
            <PortfolioMetric label="Posicoes" value={`${globalRisk.openPositionsCount}/${globalRisk.maxOpenPositions}`} />
            <PortfolioMetric label="DD diario" value={fmtPct(globalRisk.dailyDrawdown)} />
          </div>
        </div>

        {globalRisk.paused && (
          <div className="border border-[#ffaa00]/30 bg-[#ffaa00]/10 p-2 flex items-center gap-2 text-xs font-mono text-[#ffaa00]">
            <PauseCircle className="w-4 h-4" />
            <span>Pausa global por risco/drawdown.</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {items.map((config) => (
            <AgentCard
              key={config.agentId}
              agent={agents[config.agentId]}
              config={config}
              selected={selectedSymbol === config.symbol}
              onClick={() => onSelectSymbol(config.symbol)}
            />
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-2 text-[10px] font-mono text-muted-foreground">
          <span className="flex items-center gap-1"><ShieldAlert className="w-3 h-3" /> Risco global max: {fmtPct(globalRisk.maxTotalRisk)}</span>
          <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Correlacao direcional: {fmtPct(globalRisk.maxCorrelatedDirectionalRisk)}</span>
          <span className="flex items-center gap-1"><TrendingDown className="w-3 h-3" /> Grupo: CRYPTO_MAJOR</span>
        </div>
      </div>
    </section>
  );
}
