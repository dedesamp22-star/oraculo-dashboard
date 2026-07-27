import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AGENT_CONFIGS,
  DEFAULT_GLOBAL_RISK,
  DEFAULT_PORTFOLIO,
  calculateGlobalRiskState,
  calculatePortfolioState,
  createInitialAgentStates,
  evaluateAgentDecision,
  hydrateDemoAgentsState,
  type AgentId,
  type AgentStates,
  type GlobalRiskState,
  type PortfolioState,
} from '../lib/demoAgents';
import type { MarketRadarAnalysis, RadarSymbol } from '../lib/marketRadar';

const STORAGE_KEY = 'oraculo:demo-agents:v1';

interface PersistedAgents {
  agents: AgentStates;
  portfolio: PortfolioState;
}

function loadInitial(): PersistedAgents {
  if (typeof window === 'undefined') {
    return { agents: createInitialAgentStates(), portfolio: DEFAULT_PORTFOLIO };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { agents: createInitialAgentStates(), portfolio: DEFAULT_PORTFOLIO };
    const hydrated = hydrateDemoAgentsState(JSON.parse(raw));
    if (!hydrated.valid) {
      console.warn(`[Oraculo] Estado local dos agentes descartado: ${hydrated.reason}`);
    }
    return { agents: hydrated.agents, portfolio: hydrated.portfolio };
  } catch {
    console.warn('[Oraculo] Estado local dos agentes descartado: JSON invalido.');
    return { agents: createInitialAgentStates(), portfolio: DEFAULT_PORTFOLIO };
  }
}

export function useDemoAgents(analysis: MarketRadarAnalysis | null) {
  const initial = useMemo(() => loadInitial(), []);
  const [agents, setAgents] = useState<AgentStates>(initial.agents);
  const [portfolioBase] = useState<PortfolioState>(initial.portfolio);
  const requestIdsRef = useRef<Record<AgentId, number>>({
    'btc-agent': 0,
    'eth-agent': 0,
    'sol-agent': 0,
  });

  useEffect(() => {
    if (!analysis) return;
    const config = Object.values(AGENT_CONFIGS).find((item) => item.symbol === analysis.symbol);
    if (!config) return;
    const requestId = ++requestIdsRef.current[config.agentId];
    setAgents((prev) => {
      if (requestId !== requestIdsRef.current[config.agentId]) return prev;
      return {
        ...prev,
        [config.agentId]: evaluateAgentDecision(prev[config.agentId], analysis),
      };
    });
  }, [analysis]);

  const portfolio = useMemo(() => calculatePortfolioState(portfolioBase, agents), [portfolioBase, agents]);
  const globalRisk: GlobalRiskState = useMemo(
    () => calculateGlobalRiskState(portfolio, agents, DEFAULT_GLOBAL_RISK),
    [portfolio, agents],
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ agents, portfolio: portfolioBase }));
  }, [agents, portfolioBase]);

  const selectAgentSymbol = useCallback((agentId: AgentId): RadarSymbol => AGENT_CONFIGS[agentId].symbol, []);

  return {
    agents,
    configs: AGENT_CONFIGS,
    portfolio,
    globalRisk,
    selectAgentSymbol,
  };
}
