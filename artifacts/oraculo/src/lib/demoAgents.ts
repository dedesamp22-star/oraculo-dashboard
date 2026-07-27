import type { MarketRadarAnalysis, RadarDirection, RadarSymbol } from './marketRadar';

export type AgentId = 'btc-agent' | 'eth-agent' | 'sol-agent';
export type AgentStatus = 'ACTIVE' | 'PAUSED' | 'BLOCKED' | 'WAITING' | 'ERROR';
export type CorrelationGroup = 'CRYPTO_MAJOR';

export interface AgentConfig {
  agentId: AgentId;
  symbol: RadarSymbol;
  strategyId: string;
  timeframeSet: {
    trend: '1h';
    confirmation: '15m';
    trigger: '5m';
  };
  riskPerTrade: number;
  maxDailyLoss: number;
  maxConsecutiveLosses: number;
  enabled: boolean;
}

export interface AgentPosition {
  id: string;
  agentId: AgentId;
  symbol: RadarSymbol;
  direction: Exclude<RadarDirection, 'AGUARDAR'>;
  entry: number;
  stop: number;
  target1: number;
  target2: number;
  riskAmount: number;
  openedAt: string;
  signalKey: string;
  correlationGroup: CorrelationGroup;
}

export interface AgentTrade {
  id: string;
  agentId: AgentId;
  symbol: RadarSymbol;
  direction: Exclude<RadarDirection, 'AGUARDAR'>;
  pnl: number;
  openedAt: string;
  closedAt: string;
  signalKey: string;
}

export interface AgentState {
  agentId: AgentId;
  symbol: RadarSymbol;
  status: AgentStatus;
  virtualBalance: number;
  allocatedRisk: number;
  openPosition: AgentPosition | null;
  trades: AgentTrade[];
  pnl: number;
  realizedPnl: number;
  unrealizedPnl: number;
  dailyPnl: number;
  dailyLoss: number;
  winRate: number;
  drawdown: number;
  equityContribution: number;
  consecutiveLosses: number;
  lastDecision: RadarDirection;
  oracleScore: number;
  lastSignalKey: string | null;
  updatedAt: string;
}

export interface PortfolioState {
  initialBalance: number;
  currentBalance: number;
  realizedPnl: number;
  unrealizedPnl: number;
  availableBalance: number;
  reservedRisk: number;
  dailyPnl: number;
  dailyDrawdown: number;
}

export interface GlobalRiskState {
  totalOpenRisk: number;
  maxTotalRisk: number;
  openPositionsCount: number;
  maxOpenPositions: number;
  dailyDrawdown: number;
  maxDailyDrawdown: number;
  correlationExposure: Record<CorrelationGroup, number>;
  maxCorrelatedDirectionalRisk: number;
  paused: boolean;
}

export interface CorrelationSnapshot {
  group: CorrelationGroup;
  currentRisk: number;
  projectedRisk: number;
  maxRisk: number;
  sameDirectionPositions: number;
  oppositeDirectionPositions: number;
}

export interface EntryAuthorization {
  allowed: boolean;
  individualReasons: string[];
  globalReasons: string[];
  portfolioSnapshot: PortfolioState;
  correlationSnapshot: CorrelationSnapshot;
}

export interface DemoAgentsHydration {
  agents: AgentStates;
  portfolio: PortfolioState;
  valid: boolean;
  reason: string | null;
}

export type AgentStates = Record<AgentId, AgentState>;

export const AGENT_CONFIGS: Record<AgentId, AgentConfig> = {
  'btc-agent': {
    agentId: 'btc-agent',
    symbol: 'BTCUSDT',
    strategyId: 'market-radar-v1',
    timeframeSet: { trend: '1h', confirmation: '15m', trigger: '5m' },
    riskPerTrade: 0.01,
    maxDailyLoss: 0.02,
    maxConsecutiveLosses: 2,
    enabled: true,
  },
  'eth-agent': {
    agentId: 'eth-agent',
    symbol: 'ETHUSDT',
    strategyId: 'market-radar-v1',
    timeframeSet: { trend: '1h', confirmation: '15m', trigger: '5m' },
    riskPerTrade: 0.01,
    maxDailyLoss: 0.02,
    maxConsecutiveLosses: 2,
    enabled: true,
  },
  'sol-agent': {
    agentId: 'sol-agent',
    symbol: 'SOLUSDT',
    strategyId: 'market-radar-v1',
    timeframeSet: { trend: '1h', confirmation: '15m', trigger: '5m' },
    riskPerTrade: 0.01,
    maxDailyLoss: 0.02,
    maxConsecutiveLosses: 2,
    enabled: true,
  },
};

export const DEFAULT_PORTFOLIO: PortfolioState = {
  initialBalance: 1000,
  currentBalance: 1000,
  realizedPnl: 0,
  unrealizedPnl: 0,
  availableBalance: 1000,
  reservedRisk: 0,
  dailyPnl: 0,
  dailyDrawdown: 0,
};

export const DEFAULT_GLOBAL_RISK: GlobalRiskState = {
  totalOpenRisk: 0,
  maxTotalRisk: 0.03,
  openPositionsCount: 0,
  maxOpenPositions: 2,
  dailyDrawdown: 0,
  maxDailyDrawdown: 0.05,
  correlationExposure: { CRYPTO_MAJOR: 0 },
  maxCorrelatedDirectionalRisk: 0.02,
  paused: false,
};

export const SQLITE_AGENT_TABLES = [
  'portfolio_state',
  'agent_configs',
  'agent_states',
  'agent_positions',
  'agent_trades',
] as const;

const AGENT_IDS: AgentId[] = ['btc-agent', 'eth-agent', 'sol-agent'];
const AGENT_STATUSES: AgentStatus[] = ['ACTIVE', 'PAUSED', 'BLOCKED', 'WAITING', 'ERROR'];
const RADAR_DIRECTIONS: RadarDirection[] = ['COMPRA', 'VENDA', 'AGUARDAR'];
const TRADE_DIRECTIONS: Exclude<RadarDirection, 'AGUARDAR'>[] = ['COMPRA', 'VENDA'];

function defaultHydration(reason: string): DemoAgentsHydration {
  return {
    agents: createInitialAgentStates(),
    portfolio: DEFAULT_PORTFOLIO,
    valid: false,
    reason,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonNegativeNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

function isPositiveNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function validatePortfolioState(value: unknown): PortfolioState | null {
  if (!isRecord(value)) return null;
  const {
    initialBalance,
    currentBalance,
    realizedPnl,
    unrealizedPnl,
    availableBalance,
    reservedRisk,
    dailyPnl,
    dailyDrawdown,
  } = value;
  if (!isPositiveNumber(initialBalance)) return null;
  if (!isNonNegativeNumber(currentBalance)) return null;
  if (!isFiniteNumber(realizedPnl) || !isFiniteNumber(unrealizedPnl) || !isFiniteNumber(dailyPnl)) return null;
  if (!isNonNegativeNumber(availableBalance) || !isNonNegativeNumber(reservedRisk) || !isNonNegativeNumber(dailyDrawdown)) return null;
  return {
    initialBalance,
    currentBalance,
    realizedPnl,
    unrealizedPnl,
    availableBalance,
    reservedRisk,
    dailyPnl,
    dailyDrawdown,
  };
}

function validatePosition(value: unknown, agentId: AgentId, symbol: RadarSymbol): AgentPosition | null {
  if (!isRecord(value)) return null;
  if (value.agentId !== agentId || value.symbol !== symbol) return null;
  if (!TRADE_DIRECTIONS.includes(value.direction as Exclude<RadarDirection, 'AGUARDAR'>)) return null;
  if (value.correlationGroup !== 'CRYPTO_MAJOR') return null;
  if (!isString(value.id) || !isString(value.openedAt) || !isString(value.signalKey)) return null;
  if (!isPositiveNumber(value.entry) || !isPositiveNumber(value.stop) || !isPositiveNumber(value.target1)) return null;
  if (!isPositiveNumber(value.target2) || !isPositiveNumber(value.riskAmount)) return null;
  return {
    id: value.id,
    agentId,
    symbol,
    direction: value.direction as Exclude<RadarDirection, 'AGUARDAR'>,
    entry: value.entry,
    stop: value.stop,
    target1: value.target1,
    target2: value.target2,
    riskAmount: value.riskAmount,
    openedAt: value.openedAt,
    signalKey: value.signalKey,
    correlationGroup: 'CRYPTO_MAJOR',
  };
}

function validateTrade(value: unknown, agentId: AgentId, symbol: RadarSymbol): AgentTrade | null {
  if (!isRecord(value)) return null;
  if (value.agentId !== agentId || value.symbol !== symbol) return null;
  if (!TRADE_DIRECTIONS.includes(value.direction as Exclude<RadarDirection, 'AGUARDAR'>)) return null;
  if (!isString(value.id) || !isString(value.openedAt) || !isString(value.closedAt) || !isString(value.signalKey)) return null;
  if (!isFiniteNumber(value.pnl)) return null;
  return {
    id: value.id,
    agentId,
    symbol,
    direction: value.direction as Exclude<RadarDirection, 'AGUARDAR'>,
    pnl: value.pnl,
    openedAt: value.openedAt,
    closedAt: value.closedAt,
    signalKey: value.signalKey,
  };
}

function validateAgentState(value: unknown, config: AgentConfig): AgentState | null {
  if (!isRecord(value)) return null;
  if (value.agentId !== config.agentId || value.symbol !== config.symbol) return null;
  if (!AGENT_STATUSES.includes(value.status as AgentStatus)) return null;
  if (!RADAR_DIRECTIONS.includes(value.lastDecision as RadarDirection)) return null;
  if (!isNonNegativeNumber(value.virtualBalance) || !isNonNegativeNumber(value.allocatedRisk)) return null;
  if (!isFiniteNumber(value.pnl) || !isFiniteNumber(value.realizedPnl) || !isFiniteNumber(value.unrealizedPnl)) return null;
  if (!isFiniteNumber(value.dailyPnl) || !isNonNegativeNumber(value.dailyLoss)) return null;
  if (!isNonNegativeNumber(value.winRate) || value.winRate > 1) return null;
  if (!isNonNegativeNumber(value.drawdown) || !isFiniteNumber(value.equityContribution)) return null;
  if (!isNonNegativeInteger(value.consecutiveLosses)) return null;
  if (!isNonNegativeNumber(value.oracleScore) || value.oracleScore > 100) return null;
  if (value.lastSignalKey !== null && typeof value.lastSignalKey !== 'string') return null;
  if (!isString(value.updatedAt)) return null;
  const openPosition = value.openPosition === null ? null : validatePosition(value.openPosition, config.agentId, config.symbol);
  if (value.openPosition !== null && !openPosition) return null;
  if (!Array.isArray(value.trades)) return null;
  const trades = value.trades.map((trade) => validateTrade(trade, config.agentId, config.symbol));
  if (trades.some((trade) => trade === null)) return null;
  return {
    agentId: config.agentId,
    symbol: config.symbol,
    status: value.status as AgentStatus,
    virtualBalance: value.virtualBalance,
    allocatedRisk: value.allocatedRisk,
    openPosition,
    trades: trades as AgentTrade[],
    pnl: value.pnl,
    realizedPnl: value.realizedPnl,
    unrealizedPnl: value.unrealizedPnl,
    dailyPnl: value.dailyPnl,
    dailyLoss: value.dailyLoss,
    winRate: value.winRate,
    drawdown: value.drawdown,
    equityContribution: value.equityContribution,
    consecutiveLosses: value.consecutiveLosses,
    lastDecision: value.lastDecision as RadarDirection,
    oracleScore: value.oracleScore,
    lastSignalKey: value.lastSignalKey as string | null,
    updatedAt: value.updatedAt,
  };
}

function validateHydratedRisk(portfolio: PortfolioState, agents: AgentStates): string | null {
  const positions = Object.values(agents)
    .map((agent) => agent.openPosition)
    .filter((position): position is AgentPosition => position !== null);
  if (positions.length > DEFAULT_GLOBAL_RISK.maxOpenPositions) return 'Mais de duas posicoes abertas no estado persistido.';
  const symbols = new Set<RadarSymbol>();
  for (const position of positions) {
    if (symbols.has(position.symbol)) return 'Posicao duplicada no mesmo simbolo no estado persistido.';
    symbols.add(position.symbol);
  }
  const totalOpenRisk = positions.reduce((sum, position) => sum + position.riskAmount, 0);
  if (totalOpenRisk > portfolio.currentBalance * DEFAULT_GLOBAL_RISK.maxTotalRisk) {
    return 'Risco total persistido acima de 3%.';
  }
  for (const direction of TRADE_DIRECTIONS) {
    const directionalRisk = positions
      .filter((position) => position.direction === direction && position.correlationGroup === 'CRYPTO_MAJOR')
      .reduce((sum, position) => sum + position.riskAmount, 0);
    if (directionalRisk > portfolio.currentBalance * DEFAULT_GLOBAL_RISK.maxCorrelatedDirectionalRisk) {
      return 'Risco correlacionado direcional persistido acima de 2%.';
    }
  }
  return null;
}

export function correlationGroupForSymbol(_symbol: RadarSymbol): CorrelationGroup {
  return 'CRYPTO_MAJOR';
}

export function createInitialAgentState(config: AgentConfig, now = new Date().toISOString()): AgentState {
  return {
    agentId: config.agentId,
    symbol: config.symbol,
    status: config.enabled ? 'WAITING' : 'PAUSED',
    virtualBalance: DEFAULT_PORTFOLIO.initialBalance,
    allocatedRisk: 0,
    openPosition: null,
    trades: [],
    pnl: 0,
    realizedPnl: 0,
    unrealizedPnl: 0,
    dailyPnl: 0,
    dailyLoss: 0,
    winRate: 0,
    drawdown: 0,
    equityContribution: 0,
    consecutiveLosses: 0,
    lastDecision: 'AGUARDAR',
    oracleScore: 0,
    lastSignalKey: null,
    updatedAt: now,
  };
}

export function createInitialAgentStates(configs = AGENT_CONFIGS): AgentStates {
  return {
    'btc-agent': createInitialAgentState(configs['btc-agent']),
    'eth-agent': createInitialAgentState(configs['eth-agent']),
    'sol-agent': createInitialAgentState(configs['sol-agent']),
  };
}

export function hydrateDemoAgentsState(value: unknown): DemoAgentsHydration {
  if (!isRecord(value)) return defaultHydration('Formato persistido invalido.');
  const portfolio = validatePortfolioState(value.portfolio);
  if (!portfolio) return defaultHydration('PortfolioState persistido invalido.');
  if (!isRecord(value.agents)) return defaultHydration('AgentStates persistido invalido.');
  const keys = Object.keys(value.agents);
  if (keys.some((key) => !AGENT_IDS.includes(key as AgentId))) {
    return defaultHydration('AgentState com agentId desconhecido.');
  }
  const agents = {} as AgentStates;
  for (const agentId of AGENT_IDS) {
    const agent = validateAgentState(value.agents[agentId], AGENT_CONFIGS[agentId]);
    if (!agent) return defaultHydration(`AgentState persistido invalido para ${agentId}.`);
    agents[agentId] = agent;
  }
  const riskReason = validateHydratedRisk(portfolio, agents);
  if (riskReason) return defaultHydration(riskReason);
  return { agents, portfolio, valid: true, reason: null };
}

export function evaluateAgentDecision(state: AgentState, analysis: MarketRadarAnalysis): AgentState {
  if (state.symbol !== analysis.symbol) return state;
  return {
    ...state,
    status: state.status === 'PAUSED' ? 'PAUSED' : analysis.suggestedDirection === 'AGUARDAR' ? 'WAITING' : 'ACTIVE',
    lastDecision: analysis.suggestedDirection,
    oracleScore: analysis.score,
    lastSignalKey: analysis.signalKey,
    updatedAt: analysis.generatedAt,
  };
}

export function applyAgentTradeResult(state: AgentState, trade: AgentTrade): AgentState {
  if (state.agentId !== trade.agentId) return state;
  const trades = [...state.trades, trade];
  const wins = trades.filter((item) => item.pnl > 0).length;
  const realizedPnl = state.realizedPnl + trade.pnl;
  const dailyPnl = state.dailyPnl + trade.pnl;
  const dailyLoss = dailyPnl < 0 ? Math.abs(dailyPnl) / DEFAULT_PORTFOLIO.initialBalance : 0;
  return {
    ...state,
    trades,
    pnl: realizedPnl + state.unrealizedPnl,
    realizedPnl,
    dailyPnl,
    dailyLoss,
    winRate: trades.length > 0 ? wins / trades.length : 0,
    consecutiveLosses: trade.pnl < 0 ? state.consecutiveLosses + 1 : 0,
    updatedAt: trade.closedAt,
  };
}

export function calculatePortfolioState(portfolio: PortfolioState, agents: AgentStates): PortfolioState {
  const positions = Object.values(agents).map((agent) => agent.openPosition).filter((position): position is AgentPosition => position !== null);
  const realizedPnl = Object.values(agents).reduce((sum, agent) => sum + agent.realizedPnl, 0);
  const unrealizedPnl = Object.values(agents).reduce((sum, agent) => sum + agent.unrealizedPnl, 0);
  const reservedRisk = positions.reduce((sum, position) => sum + position.riskAmount, 0);
  const currentBalance = portfolio.initialBalance + realizedPnl + unrealizedPnl;
  const dailyPnl = Object.values(agents).reduce((sum, agent) => sum + agent.dailyPnl, 0);
  return {
    ...portfolio,
    currentBalance,
    realizedPnl,
    unrealizedPnl,
    reservedRisk,
    availableBalance: Math.max(0, currentBalance - reservedRisk),
    dailyPnl,
    dailyDrawdown: dailyPnl < 0 ? Math.abs(dailyPnl) / portfolio.initialBalance : 0,
  };
}

export function calculateGlobalRiskState(
  portfolio: PortfolioState,
  agents: AgentStates,
  baseRisk: GlobalRiskState = DEFAULT_GLOBAL_RISK,
): GlobalRiskState {
  const positions = Object.values(agents).map((agent) => agent.openPosition).filter((position): position is AgentPosition => position !== null);
  const totalOpenRisk = positions.reduce((sum, position) => sum + position.riskAmount, 0);
  const correlationExposure = positions.reduce<Record<CorrelationGroup, number>>((acc, position) => {
    acc[position.correlationGroup] += position.riskAmount;
    return acc;
  }, { CRYPTO_MAJOR: 0 });
  const dailyDrawdown = portfolio.dailyDrawdown;
  return {
    ...baseRisk,
    totalOpenRisk,
    openPositionsCount: positions.length,
    dailyDrawdown,
    correlationExposure,
    paused: baseRisk.paused || dailyDrawdown >= baseRisk.maxDailyDrawdown,
  };
}

export function riskAmountForEntry(config: AgentConfig, portfolio: PortfolioState): number {
  return portfolio.currentBalance * config.riskPerTrade;
}

export function canAgentEnter(config: AgentConfig, state: AgentState, analysis: MarketRadarAnalysis): string[] {
  const reasons: string[] = [];
  if (!config.enabled) reasons.push('Agente desativado.');
  if (state.status === 'PAUSED') reasons.push('Agente pausado.');
  if (state.openPosition) reasons.push('Ja existe posicao aberta para este simbolo.');
  if (state.consecutiveLosses >= config.maxConsecutiveLosses) reasons.push('Limite de perdas consecutivas atingido.');
  if (state.dailyLoss >= config.maxDailyLoss) reasons.push('Perda diaria maxima do agente atingida.');
  if (analysis.symbol !== config.symbol) reasons.push('Analise pertence a outro simbolo.');
  if (analysis.suggestedDirection === 'AGUARDAR') reasons.push('Radar sem direcao operacional.');
  if (analysis.blockedReasons.length > 0) reasons.push(...analysis.blockedReasons);
  return reasons;
}

export function buildCorrelationSnapshot(
  agents: AgentStates,
  direction: Exclude<RadarDirection, 'AGUARDAR'>,
  projectedRisk: number,
  maxRisk: number,
): CorrelationSnapshot {
  const positions = Object.values(agents)
    .map((agent) => agent.openPosition)
    .filter((position): position is AgentPosition => position !== null && position.correlationGroup === 'CRYPTO_MAJOR');
  const sameDirection = positions.filter((position) => position.direction === direction);
  const oppositeDirection = positions.filter((position) => position.direction !== direction);
  const currentRisk = positions.reduce((sum, position) => sum + position.riskAmount, 0);
  return {
    group: 'CRYPTO_MAJOR',
    currentRisk,
    projectedRisk: currentRisk + projectedRisk,
    maxRisk,
    sameDirectionPositions: sameDirection.length,
    oppositeDirectionPositions: oppositeDirection.length,
  };
}

export function canPortfolioEnter(params: {
  config: AgentConfig;
  state: AgentState;
  agents: AgentStates;
  portfolio: PortfolioState;
  globalRisk: GlobalRiskState;
  analysis: MarketRadarAnalysis;
}): EntryAuthorization {
  // Mandatory gate for future automation: every function that opens an agent position
  // must call canPortfolioEnter immediately before creating the position.
  const { config, state, agents, portfolio, globalRisk, analysis } = params;
  const individualReasons = canAgentEnter(config, state, analysis);
  const direction = analysis.suggestedDirection === 'AGUARDAR' ? null : analysis.suggestedDirection;
  const riskAmount = riskAmountForEntry(config, portfolio);
  const correlationSnapshot = buildCorrelationSnapshot(
    agents,
    direction ?? 'COMPRA',
    direction ? riskAmount : 0,
    portfolio.currentBalance * globalRisk.maxCorrelatedDirectionalRisk,
  );
  const portfolioSnapshot = calculatePortfolioState(portfolio, agents);
  const projectedTotalRisk = globalRisk.totalOpenRisk + riskAmount;
  const maxTotalRiskAmount = portfolio.currentBalance * globalRisk.maxTotalRisk;
  const maxDirectionalRiskAmount = portfolio.currentBalance * globalRisk.maxCorrelatedDirectionalRisk;
  const globalReasons: string[] = [];

  if (globalRisk.paused) globalReasons.push('Pausa global ativa.');
  if (globalRisk.openPositionsCount >= globalRisk.maxOpenPositions) globalReasons.push('Limite de posicoes simultaneas atingido.');
  if (projectedTotalRisk > maxTotalRiskAmount) globalReasons.push('Risco global maximo de 3% excedido.');
  if (globalRisk.dailyDrawdown >= globalRisk.maxDailyDrawdown) globalReasons.push('Drawdown diario global excedido.');
  if (direction) {
    const sameDirectionRisk = Object.values(agents)
      .map((agent) => agent.openPosition)
      .filter((position): position is AgentPosition => position !== null && position.correlationGroup === 'CRYPTO_MAJOR' && position.direction === direction)
      .reduce((sum, position) => sum + position.riskAmount, 0);
    if (sameDirectionRisk + riskAmount > maxDirectionalRiskAmount) {
      globalReasons.push('Risco correlacionado na mesma direcao excede 2%.');
    }
    const sameDirectionPositions = Object.values(agents)
      .map((agent) => agent.openPosition)
      .filter((position): position is AgentPosition => position !== null && position.correlationGroup === 'CRYPTO_MAJOR' && position.direction === direction);
    if (sameDirectionPositions.length >= 2) {
      globalReasons.push('BTC, ETH e SOL nao podem abrir tres posicoes correlacionadas na mesma direcao.');
    }
  }

  return {
    allowed: individualReasons.length === 0 && globalReasons.length === 0,
    individualReasons,
    globalReasons,
    portfolioSnapshot,
    correlationSnapshot,
  };
}
