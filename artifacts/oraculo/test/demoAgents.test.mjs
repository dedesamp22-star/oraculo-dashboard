import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AGENT_CONFIGS,
  DEFAULT_GLOBAL_RISK,
  DEFAULT_PORTFOLIO,
  applyAgentTradeResult,
  calculateGlobalRiskState,
  calculatePortfolioState,
  canPortfolioEnter,
  createInitialAgentStates,
  evaluateAgentDecision,
  hydrateDemoAgentsState,
} from './.tmp/demoAgents.mjs';

function analysis(symbol, direction = 'COMPRA', score = 80, signalKey = `${symbol}-${direction}`) {
  return {
    symbol,
    displayPrice: 100,
    decisionPrice: 100,
    trend1h: direction === 'VENDA' ? 'BAIXA' : 'ALTA',
    trend15m: direction === 'VENDA' ? 'BAIXA' : 'ALTA',
    trigger5m: direction,
    suggestedDirection: direction,
    support: 99,
    resistance: 101,
    recentHigh: 101,
    recentLow: 99,
    aggressiveEntry: 100,
    conservativeEntry: 100,
    stop: direction === 'VENDA' ? 101 : 99,
    target1: direction === 'VENDA' ? 98 : 102,
    target2: direction === 'VENDA' ? 97 : 103,
    rr: 2,
    score,
    classification: 'SINAL VALIDO',
    checklist: [],
    blockedReasons: [],
    confirmations: [],
    risks: [],
    scoreItems: [],
    volume: null,
    generatedAt: '2026-07-17T18:00:00.000Z',
    signalKey,
  };
}

function position(agentId, symbol, direction, riskAmount = 10) {
  return {
    id: `${agentId}-position`,
    agentId,
    symbol,
    direction,
    entry: 100,
    stop: direction === 'VENDA' ? 101 : 99,
    target1: direction === 'VENDA' ? 98 : 102,
    target2: direction === 'VENDA' ? 97 : 103,
    riskAmount,
    openedAt: '2026-07-17T18:00:00.000Z',
    signalKey: `${agentId}-signal`,
    correlationGroup: 'CRYPTO_MAJOR',
  };
}

function persistedState(overrides = {}) {
  const agents = createInitialAgentStates();
  return {
    agents,
    portfolio: { ...DEFAULT_PORTFOLIO },
    ...overrides,
  };
}

test('three agents start with independent state but one global portfolio', () => {
  const agents = createInitialAgentStates();
  assert.notEqual(agents['btc-agent'], agents['eth-agent']);
  assert.equal(agents['btc-agent'].symbol, 'BTCUSDT');
  assert.equal(agents['eth-agent'].symbol, 'ETHUSDT');
  assert.equal(agents['sol-agent'].symbol, 'SOLUSDT');
  const portfolio = calculatePortfolioState(DEFAULT_PORTFOLIO, agents);
  assert.equal(portfolio.currentBalance, 1000);
  assert.equal(portfolio.availableBalance, 1000);
});

test('BTC trade result does not alter ETH or SOL state', () => {
  const agents = createInitialAgentStates();
  const btc = applyAgentTradeResult(agents['btc-agent'], {
    id: 't1',
    agentId: 'btc-agent',
    symbol: 'BTCUSDT',
    direction: 'COMPRA',
    pnl: 25,
    openedAt: '2026-07-17T17:00:00.000Z',
    closedAt: '2026-07-17T18:00:00.000Z',
    signalKey: 'btc-1',
  });
  assert.equal(btc.realizedPnl, 25);
  assert.equal(agents['eth-agent'].realizedPnl, 0);
  assert.equal(agents['sol-agent'].realizedPnl, 0);
});

test('signalKey and stale symbol responses do not leak between agents', () => {
  const agents = createInitialAgentStates();
  const btc = evaluateAgentDecision(agents['btc-agent'], analysis('BTCUSDT', 'COMPRA', 88, 'btc-signal'));
  const eth = evaluateAgentDecision(agents['eth-agent'], analysis('BTCUSDT', 'COMPRA', 88, 'btc-signal'));
  assert.equal(btc.lastSignalKey, 'btc-signal');
  assert.equal(eth.lastSignalKey, null);
});

test('portfolio uses one global bankroll and does not sum virtual balances', () => {
  const agents = createInitialAgentStates();
  agents['btc-agent'].realizedPnl = 50;
  agents['eth-agent'].realizedPnl = -20;
  agents['sol-agent'].virtualBalance = 999999;
  const portfolio = calculatePortfolioState(DEFAULT_PORTFOLIO, agents);
  assert.equal(portfolio.currentBalance, 1030);
  assert.notEqual(portfolio.currentBalance, 1000 + 999999);
});

test('global risk blocks entry above 3 percent total risk', () => {
  const agents = createInitialAgentStates();
  agents['btc-agent'].openPosition = position('btc-agent', 'BTCUSDT', 'COMPRA', 25);
  const portfolio = calculatePortfolioState(DEFAULT_PORTFOLIO, agents);
  const globalRisk = calculateGlobalRiskState(portfolio, agents, DEFAULT_GLOBAL_RISK);
  const auth = canPortfolioEnter({
    config: AGENT_CONFIGS['eth-agent'],
    state: agents['eth-agent'],
    agents,
    portfolio,
    globalRisk,
    analysis: analysis('ETHUSDT', 'COMPRA'),
  });
  assert.equal(auth.allowed, false);
  assert.ok(auth.globalReasons.some((reason) => reason.includes('3%')));
});

test('daily loss pauses only the correct agent', () => {
  const agents = createInitialAgentStates();
  agents['btc-agent'].dailyLoss = 0.03;
  const btcAuth = canPortfolioEnter({
    config: AGENT_CONFIGS['btc-agent'],
    state: agents['btc-agent'],
    agents,
    portfolio: DEFAULT_PORTFOLIO,
    globalRisk: DEFAULT_GLOBAL_RISK,
    analysis: analysis('BTCUSDT', 'COMPRA'),
  });
  const ethAuth = canPortfolioEnter({
    config: AGENT_CONFIGS['eth-agent'],
    state: agents['eth-agent'],
    agents,
    portfolio: DEFAULT_PORTFOLIO,
    globalRisk: DEFAULT_GLOBAL_RISK,
    analysis: analysis('ETHUSDT', 'COMPRA'),
  });
  assert.equal(btcAuth.allowed, false);
  assert.ok(btcAuth.individualReasons.some((reason) => reason.includes('Perda diaria')));
  assert.equal(ethAuth.individualReasons.some((reason) => reason.includes('Perda diaria')), false);
});

test('global drawdown pauses all entries', () => {
  const agents = createInitialAgentStates();
  const portfolio = { ...DEFAULT_PORTFOLIO, dailyDrawdown: 0.06 };
  const globalRisk = calculateGlobalRiskState(portfolio, agents, DEFAULT_GLOBAL_RISK);
  const auth = canPortfolioEnter({
    config: AGENT_CONFIGS['btc-agent'],
    state: agents['btc-agent'],
    agents,
    portfolio,
    globalRisk,
    analysis: analysis('BTCUSDT', 'COMPRA'),
  });
  assert.equal(globalRisk.paused, true);
  assert.equal(auth.allowed, false);
  assert.ok(auth.globalReasons.some((reason) => reason.includes('Pausa global')));
});

test('simultaneous position limit blocks new entry', () => {
  const agents = createInitialAgentStates();
  agents['btc-agent'].openPosition = position('btc-agent', 'BTCUSDT', 'COMPRA', 5);
  agents['eth-agent'].openPosition = position('eth-agent', 'ETHUSDT', 'VENDA', 5);
  const portfolio = calculatePortfolioState(DEFAULT_PORTFOLIO, agents);
  const globalRisk = calculateGlobalRiskState(portfolio, agents, DEFAULT_GLOBAL_RISK);
  const auth = canPortfolioEnter({
    config: AGENT_CONFIGS['sol-agent'],
    state: agents['sol-agent'],
    agents,
    portfolio,
    globalRisk,
    analysis: analysis('SOLUSDT', 'COMPRA'),
  });
  assert.equal(auth.allowed, false);
  assert.ok(auth.globalReasons.some((reason) => reason.includes('posicoes simultaneas')));
});

test('correlated same-direction exposure blocks excess', () => {
  const agents = createInitialAgentStates();
  agents['btc-agent'].openPosition = position('btc-agent', 'BTCUSDT', 'COMPRA', 10);
  agents['eth-agent'].openPosition = position('eth-agent', 'ETHUSDT', 'COMPRA', 10);
  const portfolio = calculatePortfolioState(DEFAULT_PORTFOLIO, agents);
  const globalRisk = calculateGlobalRiskState(portfolio, agents, DEFAULT_GLOBAL_RISK);
  const auth = canPortfolioEnter({
    config: AGENT_CONFIGS['sol-agent'],
    state: agents['sol-agent'],
    agents,
    portfolio,
    globalRisk,
    analysis: analysis('SOLUSDT', 'COMPRA'),
  });
  assert.equal(auth.allowed, false);
  assert.ok(auth.globalReasons.some((reason) => reason.includes('correlacionad')));
  assert.ok(auth.correlationSnapshot.projectedRisk > auth.correlationSnapshot.maxRisk);
});

test('opposite correlated positions still count as exposure instead of hedge', () => {
  const agents = createInitialAgentStates();
  agents['btc-agent'].openPosition = position('btc-agent', 'BTCUSDT', 'COMPRA', 15);
  agents['eth-agent'].openPosition = position('eth-agent', 'ETHUSDT', 'VENDA', 10);
  const portfolio = calculatePortfolioState(DEFAULT_PORTFOLIO, agents);
  const globalRisk = calculateGlobalRiskState(portfolio, agents, DEFAULT_GLOBAL_RISK);
  const auth = canPortfolioEnter({
    config: AGENT_CONFIGS['sol-agent'],
    state: agents['sol-agent'],
    agents,
    portfolio,
    globalRisk,
    analysis: analysis('SOLUSDT', 'COMPRA'),
  });
  assert.equal(globalRisk.totalOpenRisk, 25);
  assert.equal(auth.allowed, false);
  assert.equal(auth.correlationSnapshot.sameDirectionPositions, 1);
  assert.equal(auth.correlationSnapshot.oppositeDirectionPositions, 1);
  assert.ok(auth.globalReasons.some((reason) => reason.includes('posicoes simultaneas') || reason.includes('3%')));
});

test('hydration rejects corrupted localStorage payload and recovers safe defaults', () => {
  const hydrated = hydrateDemoAgentsState('not-json-state');
  assert.equal(hydrated.valid, false);
  assert.equal(hydrated.portfolio.currentBalance, DEFAULT_PORTFOLIO.currentBalance);
  assert.equal(hydrated.agents['btc-agent'].openPosition, null);
});

test('hydration rejects NaN and Infinity values', () => {
  const agents = createInitialAgentStates();
  agents['btc-agent'].oracleScore = Infinity;
  const invalidAgent = hydrateDemoAgentsState(persistedState({ agents }));
  const invalidPortfolio = hydrateDemoAgentsState(persistedState({
    portfolio: { ...DEFAULT_PORTFOLIO, currentBalance: NaN },
  }));
  assert.equal(invalidAgent.valid, false);
  assert.equal(invalidPortfolio.valid, false);
});

test('hydration rejects persisted total risk above 3 percent', () => {
  const agents = createInitialAgentStates();
  agents['btc-agent'].openPosition = position('btc-agent', 'BTCUSDT', 'COMPRA', 31);
  const hydrated = hydrateDemoAgentsState(persistedState({ agents }));
  assert.equal(hydrated.valid, false);
  assert.match(hydrated.reason, /3%/);
});

test('hydration rejects three open positions', () => {
  const agents = createInitialAgentStates();
  agents['btc-agent'].openPosition = position('btc-agent', 'BTCUSDT', 'COMPRA', 5);
  agents['eth-agent'].openPosition = position('eth-agent', 'ETHUSDT', 'VENDA', 5);
  agents['sol-agent'].openPosition = position('sol-agent', 'SOLUSDT', 'COMPRA', 5);
  const hydrated = hydrateDemoAgentsState(persistedState({ agents }));
  assert.equal(hydrated.valid, false);
  assert.match(hydrated.reason, /duas posicoes/);
});

test('hydration rejects unknown symbol or agent identity', () => {
  const agents = createInitialAgentStates();
  agents['eth-agent'] = { ...agents['eth-agent'], symbol: 'XRPUSDT' };
  const hydrated = hydrateDemoAgentsState(persistedState({ agents }));
  assert.equal(hydrated.valid, false);
  assert.match(hydrated.reason, /eth-agent/);
});

test('hydration rejects duplicated position on the same symbol', () => {
  const agents = createInitialAgentStates();
  agents['btc-agent'].openPosition = position('btc-agent', 'BTCUSDT', 'COMPRA', 5);
  agents['eth-agent'].openPosition = {
    ...position('eth-agent', 'ETHUSDT', 'VENDA', 5),
    symbol: 'BTCUSDT',
  };
  const hydrated = hydrateDemoAgentsState(persistedState({ agents }));
  assert.equal(hydrated.valid, false);
});

test('hydration rejects correlated directional risk above 2 percent', () => {
  const agents = createInitialAgentStates();
  agents['btc-agent'].openPosition = position('btc-agent', 'BTCUSDT', 'COMPRA', 11);
  agents['eth-agent'].openPosition = position('eth-agent', 'ETHUSDT', 'COMPRA', 10);
  const hydrated = hydrateDemoAgentsState(persistedState({ agents }));
  assert.equal(hydrated.valid, false);
  assert.match(hydrated.reason, /2%/);
});

test('hydration accepts valid persisted state without changing capital source', () => {
  const agents = createInitialAgentStates();
  agents['btc-agent'].virtualBalance = 999999;
  agents['btc-agent'].realizedPnl = 12;
  const hydrated = hydrateDemoAgentsState(persistedState({ agents }));
  assert.equal(hydrated.valid, true);
  const portfolio = calculatePortfolioState(hydrated.portfolio, hydrated.agents);
  assert.equal(portfolio.currentBalance, 1012);
  assert.notEqual(portfolio.currentBalance, 1000 + 999999);
});
