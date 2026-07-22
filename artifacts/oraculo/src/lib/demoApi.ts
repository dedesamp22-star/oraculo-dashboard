import type { DemoSession, DemoTrade } from './demo';
import type { EngineResult } from './analysis';
import { apiJson } from './apiClient';
import type { ApiHealth } from '../hooks/useApiHealth';

export interface AuthUser {
  id: string;
  name: string;
  username: string;
  role: 'admin' | 'user';
}

export interface AuthState {
  authenticated: boolean;
  user?: AuthUser;
}

export type WorkerDiagnosticStatus = 'APPROVED' | 'BLOCKED' | 'WAIT' | 'ERROR';

export interface WorkerDiagnosticUserDto {
  id: string;
  symbol: string;
  status: WorkerDiagnosticStatus;
  direction: string;
  quality: string;
  summary: string;
  decision: string;
  score: number | null;
  generatedAt: string;
  nextCycleAt: string | null;
}

export interface WorkerDiagnosticAdminDto extends WorkerDiagnosticUserDto {
  workerActive: boolean;
  automationActive: boolean;
  cycleDurationMs: number;
  latencyMs: number | null;
  lastError: string | null;
  engineVersion: string;
  full: Record<string, unknown>;
}

export interface WorkerDiagnosticsResponse {
  current: WorkerDiagnosticUserDto | WorkerDiagnosticAdminDto | null;
  history: Array<WorkerDiagnosticUserDto | WorkerDiagnosticAdminDto>;
}

export type ControlledSimulationStatus = 'INACTIVE' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'ERROR';
export type ControlledSimulationStep =
  | 'OPEN'
  | 'MOVE'
  | 'TARGET1'
  | 'PARTIAL'
  | 'BREAKEVEN'
  | 'TRAILING'
  | 'TARGET2'
  | 'STOP'
  | 'LOSS_OF_STRENGTH'
  | 'TIMEOUT'
  | 'CANCEL';

export interface ControlledSimulationScenario {
  symbol: string;
  direction: 'BUY' | 'SELL';
  entry: number;
  stopLoss: number;
  target1: number;
  target2: number;
  quantity: number;
  riskAmount: number;
  maxDurationMs: number;
  initialPrice: number;
}

export interface ControlledSimulationDto {
  id: string;
  userId: string;
  simulationUserId: string;
  status: ControlledSimulationStatus;
  scenario: ControlledSimulationScenario;
  currentStep: string;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
  lastEvent: string | null;
  error: string | null;
  session: DemoSession;
  allowedSteps: ControlledSimulationStep[];
}

export interface ControlledSimulationEventDto {
  id: string;
  simulationId: string;
  userId: string;
  step: ControlledSimulationStep;
  idempotencyKey: string;
  status: 'APPLIED' | 'IGNORED' | 'ERROR';
  message: string;
  snapshot: Record<string, unknown>;
  createdAt: string;
}

export type NotificationSeverity = 'info' | 'success' | 'warning' | 'critical';
export type NotificationSource = 'DEMO' | 'HOMOLOGATION' | 'SYSTEM';

export interface NotificationPreferences {
  internal: boolean;
  push: boolean;
  telegram: boolean;
  importantOnly: boolean;
  includeBlockedEntries: boolean;
  includeSimulation: boolean;
  mutedUntil: string | null;
  quietHours: { enabled: boolean; start: string; end: string };
  enabledTypes: string[];
}

export interface NotificationDto {
  id: string;
  type: string;
  title: string;
  message: string;
  severity: NotificationSeverity;
  symbol: string | null;
  source: NotificationSource;
  relatedEventId: string | null;
  readAt: string | null;
  createdAt: string;
  deliveryStatus: string;
  failureReason: string | null;
  metadata?: Record<string, unknown>;
}

export interface NotificationsResponse {
  unreadCount: number;
  items: NotificationDto[];
}

export interface PushSubscriptionDto {
  id: string;
  endpointHash: string;
  userAgent: string | null;
  createdAt: string;
  updatedAt: string;
}

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

export async function getAuth(): Promise<AuthState> {
  return await request<AuthState>('/api/auth/me');
}

export async function loginUser(username: string, password: string): Promise<AuthState> {
  return await request<AuthState>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export async function logoutUser(): Promise<AuthState> {
  return await request<AuthState>('/api/auth/logout', { method: 'POST' });
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

export async function getWorkerDiagnostics(limit = 10): Promise<WorkerDiagnosticsResponse> {
  return await request<WorkerDiagnosticsResponse>(`/api/worker/diagnostics?limit=${limit}`);
}

export async function getControlledSimulation(): Promise<ControlledSimulationDto | null> {
  return await request<ControlledSimulationDto | null>('/api/admin/simulations/current');
}

export async function startControlledSimulation(scenario: Partial<ControlledSimulationScenario>): Promise<ControlledSimulationDto> {
  return await request<ControlledSimulationDto>('/api/admin/simulations', {
    method: 'POST',
    body: JSON.stringify(scenario),
  });
}

export async function stepControlledSimulation(id: string, step: ControlledSimulationStep, extra: Record<string, unknown> = {}): Promise<ControlledSimulationDto> {
  return await request<ControlledSimulationDto>(`/api/admin/simulations/${encodeURIComponent(id)}/step`, {
    method: 'POST',
    body: JSON.stringify({ step, idempotencyKey: `${step}:${Date.now()}`, ...extra }),
  });
}

export async function cancelControlledSimulation(id: string): Promise<ControlledSimulationDto> {
  return await request<ControlledSimulationDto>(`/api/admin/simulations/${encodeURIComponent(id)}/cancel`, { method: 'POST' });
}

export async function getControlledSimulationEvents(id: string): Promise<ControlledSimulationEventDto[]> {
  return await request<ControlledSimulationEventDto[]>(`/api/admin/simulations/${encodeURIComponent(id)}/events`);
}

export async function getNotifications(limit = 30, source?: NotificationSource): Promise<NotificationsResponse> {
  const query = new URLSearchParams({ limit: String(limit) });
  if (source) query.set('source', source);
  return await request<NotificationsResponse>(`/api/notifications?${query.toString()}`);
}

export async function markNotificationRead(id: string): Promise<NotificationDto> {
  return await request<NotificationDto>(`/api/notifications/${encodeURIComponent(id)}/read`, { method: 'POST' });
}

export async function markAllNotificationsRead(): Promise<{ read: number }> {
  return await request<{ read: number }>('/api/notifications/read-all', { method: 'POST' });
}

export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  return await request<NotificationPreferences>('/api/notification-preferences');
}

export async function putNotificationPreferences(prefs: Partial<NotificationPreferences>): Promise<NotificationPreferences> {
  return await request<NotificationPreferences>('/api/notification-preferences', {
    method: 'PUT',
    body: JSON.stringify(prefs),
  });
}

export async function getPushPublicKey(): Promise<{ publicKey: string | null; configured: boolean }> {
  return await request<{ publicKey: string | null; configured: boolean }>('/api/push/public-key');
}

export async function getAdminObservability(): Promise<ApiHealth> {
  return await request<ApiHealth>('/api/admin/observability');
}

export async function listPushSubscriptions(): Promise<PushSubscriptionDto[]> {
  return await request<PushSubscriptionDto[]>('/api/push/subscriptions');
}

export async function subscribePush(subscription: PushSubscriptionJSON): Promise<PushSubscriptionDto> {
  return await request<PushSubscriptionDto>('/api/push/subscribe', {
    method: 'POST',
    body: JSON.stringify(subscription),
  });
}

export async function deletePushSubscription(id: string): Promise<{ removed: boolean }> {
  return await request<{ removed: boolean }>(`/api/push/subscribe/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function sendTestNotification(): Promise<NotificationDto | null> {
  return await request<NotificationDto | null>('/api/notifications/test', { method: 'POST' });
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
