import type { DemoSession, DemoTrade } from './demo';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
  return await res.json() as T;
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

export async function loadServerSession(fallback: DemoSession): Promise<DemoSession> {
  const [account, positions, trades] = await Promise.all([
    request<{ balance: number; configuredBalance: number; dailyStats: DemoSession['dailyStats'] }>('/api/demo/account'),
    request<DemoTrade[]>('/api/demo/positions'),
    request<DemoTrade[]>('/api/demo/trades'),
  ]);
  return {
    balance: account.balance,
    configuredBalance: account.configuredBalance,
    dailyStats: account.dailyStats,
    activeTrade: positions[0] ?? null,
    history: trades.length > 0 ? trades : fallback.history,
  };
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
