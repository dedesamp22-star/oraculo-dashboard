import type { DemoSession, DemoTrade } from './demo';
import type { EngineResult } from './analysis';
import { apiJson } from './apiClient';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  return await apiJson<T>(path, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
}

export async function getAuth(): Promise<boolean> {
  const data = await request<{ authenticated: boolean }>('/api/auth/me');
  return data.authenticated;
}

export async function loginDemoAdmin(password: string): Promise<boolean> {
  const data = await request<{ authenticated: boolean }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
  return data.authenticated;
}

export async function loadServerSession(): Promise<DemoSession> {
  return await request<DemoSession>('/api/demo/session');
}

export async function migrateLocalSession(session: DemoSession): Promise<DemoSession> {
  const data = await request<{
    account: { balance: number; configuredBalance: number; dailyStats: DemoSession['dailyStats'] };
    positions: DemoTrade[];
    trades: DemoTrade[];
  }>('/api/demo/migrate', {
    method: 'POST',
    body: JSON.stringify(session),
  });
  return {
    balance: data.account.balance,
    configuredBalance: data.account.configuredBalance,
    dailyStats: data.account.dailyStats,
    activeTrade: data.positions[0] ?? null,
    history: data.trades,
  };
}

export async function persistAccount(session: DemoSession): Promise<void> {
  await request('/api/demo/account', {
    method: 'PUT',
    body: JSON.stringify({
      balance: session.balance,
      configuredBalance: session.configuredBalance,
      dailyStats: session.dailyStats,
    }),
  });
}

export async function resetServerSession(configuredBalance: number): Promise<DemoSession> {
  return await request<DemoSession>('/api/demo/reset', {
    method: 'POST',
    body: JSON.stringify({ configuredBalance }),
  });
}

export async function getDemoAutomation(): Promise<{ enabled: boolean; symbol: string }> {
  return await request<{ enabled: boolean; symbol: string }>('/api/demo/automation');
}

export async function setDemoAutomation(enabled: boolean, symbol: string): Promise<{ enabled: boolean; symbol: string }> {
  return await request<{ enabled: boolean; symbol: string }>('/api/demo/automation', {
    method: 'PUT',
    body: JSON.stringify({ enabled, symbol }),
  });
}

export async function submitDemoSignal(result: EngineResult, pair: string): Promise<DemoSession> {
  return await request<DemoSession>('/api/demo/signal', {
    method: 'POST',
    body: JSON.stringify({
      pair,
      decision: result.decision,
      entryNum: result.entryNum,
      stopLossNum: result.stopLossNum,
      target1Num: result.target1Num,
      target2Num: result.target2Num,
      riskReward: result.riskReward,
      signalKey: `${pair}:${result.decision}:${result.entryNum}:${result.stopLossNum}:${result.target1Num}:${result.target2Num}`,
      steps: result.steps,
    }),
  });
}

export async function submitDemoPrice(price: number, pair?: string): Promise<DemoSession> {
  return await request<DemoSession>('/api/demo/price', {
    method: 'POST',
    body: JSON.stringify({ price, pair }),
  });
}

export async function persistOpenPosition(trade: DemoTrade): Promise<void> {
  try {
    await request('/api/demo/positions', {
      method: 'POST',
      body: JSON.stringify(trade),
    });
  } catch {
    await request(`/api/demo/positions/${encodeURIComponent(trade.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        stopLoss: trade.stopLoss,
        target1Hit: trade.target1Hit,
        isBreakevenStop: trade.isBreakevenStop,
      }),
    });
  }
}

export async function persistClosedTrade(trade: DemoTrade): Promise<void> {
  try {
    await request(`/api/demo/positions/${encodeURIComponent(trade.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: trade.status,
        closePrice: trade.closePrice,
        exitReason: trade.exitReason,
      }),
    });
  } catch {
    await request('/api/demo/trades', {
      method: 'POST',
      body: JSON.stringify(trade),
    });
  }
}
