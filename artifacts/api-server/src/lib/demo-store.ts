import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, chmodSync, statSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { resolveOracleVisualState, type OracleVisualState } from "@shared/oracleVisualState";
import type { ClaimedPushDelivery, PushVapidConfig } from "./push-delivery-processor";
import { formatPushPayload, shouldQueuePushDelivery } from "./push-notifications";
import { formatTelegramNotification, shouldQueueTelegramDelivery, telegramRuntimeStatus } from "./telegram-notifications";

export type TradeDirection = "BUY" | "SELL";
export type TradeStatus = "OPEN" | "WIN" | "LOSS" | "BREAKEVEN";
export type TradeExitReason = "STOP_LOSS" | "BREAKEVEN" | "TARGET_1" | "TARGET_2";
export type ManagedTradeExitReason = TradeExitReason | "TIMEOUT" | "TIME_EXIT" | "TRAILING_STOP" | "LOSS_OF_STRENGTH" | "SESSION_END";
export type ReentryCooldownReason = "REENTRY_COOLDOWN_TIMEOUT" | "REENTRY_COOLDOWN_STOP_LOSS";
export type DemoDecision = "BUY" | "SELL" | "SEM ENTRADA";
export type ManagementTimelineEventType =
  | "OPENED"
  | "NEW_MFE"
  | "NEW_MAE"
  | "TARGET_1"
  | "PARTIAL_EXECUTED"
  | "BREAKEVEN_ACTIVATED"
  | "TRAILING_ACTIVATED"
  | "TRAILING_UPDATED"
  | "LOSS_OF_STRENGTH_DETECTED"
  | "TIMEOUT"
  | "STOP"
  | "TARGET_2"
  | "CLOSED";

export interface ManagementTimelineEvent {
  type: ManagementTimelineEventType;
  at: string;
  price: number | null;
  unrealizedPnlUSDC: number | null;
  note?: string;
  data?: Record<string, unknown>;
}

export interface DailyStats {
  date: string;
  startOfDayBalance: number;
  totalTrades: number;
  wins: number;
  losses: number;
  breakevens: number;
  consecutiveLosses: number;
  maxConsecutiveLosses: number;
  dailyPnL: number;
  peakBalance: number;
  maxDrawdown: number;
  safetyLimited: boolean;
}

export type SafetyLimitCode = "DAILY_TRADE_LIMIT" | "LOSS_STREAK_COOLDOWN" | "DAILY_LOSS" | "NONE";

export interface SafetyLimitState {
  limited: boolean;
  code: SafetyLimitCode;
  reason: string;
  cooldownEndsAt?: string | null;
  cooldownRemainingMs?: number | null;
  analysisContinues?: boolean;
}

export interface DemoTrade {
  id: string;
  pair: string;
  direction: TradeDirection;
  openTime: number;
  closeTime?: number;
  entry: number;
  stopLoss: number;
  stopLossOriginal: number;
  target1: number;
  target2: number;
  balanceAtOpen: number;
  riskAmount: number;
  positionSize: number;
  remainingPositionSize: number;
  riskReward: string;
  status: TradeStatus;
  target1Hit: boolean;
  isBreakevenStop: boolean;
  trailing: boolean;
  closePrice?: number;
  exitReason?: ManagedTradeExitReason;
  pnlUSDC?: number;
  pnlPct?: number;
  realizedPnlUSDC?: number;
  partialPnlUSDC?: number;
  target1ClosePrice?: number;
  partialTriggerR?: number | null;
  trailingTriggerR?: number | null;
  maxDurationMs?: number;
  initialRiskAmount?: number;
  maxPriceSinceEntry?: number | null;
  minPriceSinceEntry?: number | null;
  maxUnrealizedPnlUSDC?: number | null;
  minUnrealizedPnlUSDC?: number | null;
  maxUnrealizedPnlBeforePartial?: number | null;
  maxUnrealizedPnlAfterPartial?: number | null;
  mfeUSDC?: number | null;
  maeUSDC?: number | null;
  mfeR?: number | null;
  maeR?: number | null;
  peakGivebackUSDC?: number | null;
  openGivebackUSDC?: number | null;
  totalGivebackUSDC?: number | null;
  peakGivebackPct?: number | null;
  lastManagementUpdateAt?: string | null;
  managementTimeline?: ManagementTimelineEvent[];
  signalReasons: string[];
  marketConditions: string;
}

export interface DemoSession {
  balance: number;
  configuredBalance: number;
  activeTrade: DemoTrade | null;
  history: DemoTrade[];
  dailyStats: DailyStats;
  safetyLimit: SafetyLimitState;
  settings: {
    maxDailyTrades: number;
    lossStreakCooldownMinutes: number;
  };
  realizedPnlUSDC: number;
  unrealizedPnlUSDC: number;
  partialPnlUSDC: number;
  openRiskUSDC: number;
  openPositionsCount: number;
}

export type UserRole = "admin" | "user";

export interface AuthUser {
  id: string;
  name: string;
  username: string;
  role: UserRole;
  active: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

interface PasswordRecord {
  password_hash: string;
  password_salt: string;
  scrypt_n: number;
  scrypt_r: number;
  scrypt_p: number;
  scrypt_key_len: number;
}

export interface DemoSignalInput {
  pair: string;
  decision: DemoDecision;
  entryNum: number | null;
  stopLossNum: number | null;
  target1Num: number | null;
  target2Num: number | null;
  riskReward: string | null;
  signalKey?: string;
  steps?: Array<{ number?: number; name?: string; value?: string; reason?: string }>;
}

export type WorkerDiagnosticStatus = "APPROVED" | "BLOCKED" | "WAIT" | "ERROR";

export interface WorkerDiagnosticInput {
  userId: string;
  workerActive: boolean;
  automationActive: boolean;
  symbol: string;
  cycleStartedAt: string;
  cycleFinishedAt: string;
  cycleDurationMs: number;
  latencyMs: number | null;
  decision: DemoDecision | "ERROR";
  score: number | null;
  direction: string;
  nextCycleAt: string;
  lastError: string | null;
  engineVersion: string;
  status: WorkerDiagnosticStatus;
  fingerprint: string;
  adminPayload: Record<string, unknown>;
  userPayload: Record<string, unknown>;
}

export interface WorkerDiagnosticUserDto {
  id: string;
  symbol: string;
  status: WorkerDiagnosticStatus;
  direction: string;
  quality: string;
  summary: string;
  decision: string;
  score: number | null;
  scoreContextual?: number | null;
  scoreOperacional?: number | null;
  decisionState?: string | null;
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

export interface EngineAuditFilterRecord {
  name: string;
  reason: string;
  penalty?: number | null;
}

export interface EngineAuditInput {
  userId: string;
  symbol: string;
  analyzedAt: string;
  score: number;
  scoreContextual: number;
  scoreRaw: number;
  direction: string;
  decision: string;
  decisionState: string;
  triggerStage: string;
  rrStatus: string;
  trend1h: string;
  trend15m: string;
  filtersPassed: string[];
  filtersBlocked: EngineAuditFilterRecord[];
  filtersPenalty: EngineAuditFilterRecord[];
  blockedReasons: string[];
  qualityPenalties: string[];
  decisiveReason: string;
  missingConditions: string[];
  entryPrice: number | null;
  stopPrice: number | null;
  target1: number | null;
  target2: number | null;
  rr: number | null;
  volumeRelative: number | null;
  engineVersion: string;
  regime?: string | null;
  regimeConfidence?: number | null;
  selectedStrategy?: string | null;
  strategyScore?: number | null;
  ema200DistancePctSigned?: number | null;
  ema200DistanceAtr?: number | null;
  stretchedEvidence?: Record<string, unknown> | null;
  chaoticEvidence?: Record<string, unknown> | null;
  lastTradeDirection?: string | null;
  lastTradeExitReason?: string | null;
  lastTradeTarget1Hit?: boolean | null;
  lastTradeTarget2Hit?: boolean | null;
  marketReorganized?: boolean | null;
  reorganizationReasons?: string[] | null;
  momentumConditionsPassed?: string[] | null;
  momentumConditionsMissing?: string[] | null;
}

export interface EngineAuditEntry {
  id: string;
  userId: string;
  symbol: string;
  analyzedAt: string;
  score: number;
  scoreContextual: number;
  scoreRaw: number;
  direction: string;
  decision: string;
  decisionState: string;
  triggerStage: string;
  rrStatus: string;
  trend1h: string;
  trend15m: string;
  filtersPassed: string[];
  filtersBlocked: EngineAuditFilterRecord[];
  filtersPenalty: EngineAuditFilterRecord[];
  blockedReasons: string[];
  qualityPenalties: string[];
  decisiveReason: string;
  missingConditions: string[];
  entryPrice: number | null;
  stopPrice: number | null;
  target1: number | null;
  target2: number | null;
  rr: number | null;
  volumeRelative: number | null;
  engineVersion: string;
  regime: string | null;
  regimeConfidence: number | null;
  selectedStrategy: string | null;
  strategyScore: number | null;
  ema200DistancePctSigned: number | null;
  ema200DistanceAtr: number | null;
  stretchedEvidence: Record<string, unknown> | null;
  chaoticEvidence: Record<string, unknown> | null;
  lastTradeDirection: string | null;
  lastTradeExitReason: string | null;
  lastTradeTarget1Hit: boolean | null;
  lastTradeTarget2Hit: boolean | null;
  marketReorganized: boolean | null;
  reorganizationReasons: string[];
  momentumConditionsPassed: string[];
  momentumConditionsMissing: string[];
  createdAt: string;
}

export interface EngineAuditResponse {
  entries: EngineAuditEntry[];
  total: number;
  limit: number;
  offset: number;
}

export interface EngineAuditExportParams {
  hours?: number;
  symbol?: string;
  decision?: string;
  state?: string;
  limit?: number;
}

export interface EngineAuditExportResponse {
  exportedAt: string;
  filters: {
    hours: number | null;
    symbol: string | null;
    decision: string | null;
    state: string | null;
    limit: number;
  };
  summary: {
    total: number;
    byDecision: Record<string, number>;
    byState: Record<string, number>;
  };
  total: number;
  entries: EngineAuditEntry[];
}

export interface DemoTradeExportParams {
  from?: string;
  to?: string;
  symbol?: string;
  direction?: string;
  status?: string;
  exitReason?: string;
  limit?: number;
}

export interface DemoTradeExportEntry {
  id: string;
  pair: string;
  direction: TradeDirection;
  entryPrice: number;
  exitPrice: number | null;
  openTime: number;
  closeTime: number | null;
  durationMs: number | null;
  stopLoss: number;
  stopLossOriginal: number;
  target1: number;
  target2: number;
  riskAmount: number;
  positionSize: number;
  remainingPositionSize: number;
  exitReason: ManagedTradeExitReason | null;
  status: TradeStatus;
  pnlUSDC: number | null;
  realizedPnlUSDC: number | null;
  partialPnlUSDC: number | null;
  mfeUSDC: number | null;
  maeUSDC: number | null;
  mfeR: number | null;
  maeR: number | null;
  peakGivebackUSDC: number | null;
  openGivebackUSDC: number | null;
  totalGivebackUSDC: number | null;
  peakGivebackPct: number | null;
  maxPriceSinceEntry: number | null;
  minPriceSinceEntry: number | null;
  maxUnrealizedPnlUSDC: number | null;
  minUnrealizedPnlUSDC: number | null;
  target1Hit: boolean;
  breakeven: boolean;
  trailing: boolean;
  partialTriggerR: number | null;
  trailingTriggerR: number | null;
  signalReasons: string[];
  managementTimeline: ManagementTimelineEvent[];
}

export interface DemoTradeExportResponse {
  exportedAt: string;
  filters: {
    from: string | null;
    to: string | null;
    symbol: string | null;
    direction: string | null;
    status: string | null;
    exitReason: string | null;
    limit: number;
  };
  total: number;
  entries: DemoTradeExportEntry[];
}

export type LossStreakDiagnosticStatus = "ACTIVE" | "COMPLETED";

export interface LossStreakDiagnosticTrade {
  id: string;
  pair: string;
  direction: TradeDirection;
  exitReason: ManagedTradeExitReason | null;
  durationMs: number | null;
  pnlUSDC: number | null;
  mfeUSDC: number | null;
  maeUSDC: number | null;
  mfeR: number | null;
  maeR: number | null;
  peakGivebackUSDC: number | null;
  peakGivebackPct: number | null;
  target1Hit: boolean;
  breakeven: boolean;
  trailing: boolean;
  wasPositiveBeforeLoss: boolean | null;
  score: number | null;
  volumeRelative: number | null;
  trend1h: string | null;
  trend15m: string | null;
  decisiveReason: string | null;
}

export interface LossStreakDiagnosticPattern {
  name: string;
  value: number | string;
}

export interface LossStreakDiagnostic {
  id: string;
  userId: string;
  createdAt: string;
  lossCount: number;
  cooldownStartedAt: string | null;
  cooldownEndsAt: string | null;
  cooldownMinutes: number;
  triggerTradeId: string;
  trades: LossStreakDiagnosticTrade[];
  patterns: LossStreakDiagnosticPattern[];
  summary: string;
  status: LossStreakDiagnosticStatus;
  updatedAt: string;
}

export interface EngineAuditRankItem {
  name: string;
  count: number;
  pct: number;
}

export interface EngineAuditSymbolSummary {
  symbol: string;
  total: number;
  avgScore: number | null;
  maxScore: number | null;
  byDecision: Record<string, { count: number; pct: number }>;
  byState: Record<string, { count: number; pct: number }>;
}

export interface EngineAuditSummaryResponse {
  period: string;
  symbol: string | null;
  total: number;
  avgScore: number | null;
  maxScore: number | null;
  byDecision: Record<string, { count: number; pct: number }>;
  byState: Record<string, { count: number; pct: number }>;
  topDecisiveReasons: EngineAuditRankItem[];
  topBlockedReasons: EngineAuditRankItem[];
  topMissingConditions: EngineAuditRankItem[];
  topBlockCombinations: EngineAuditRankItem[];
  bySymbol: Record<string, EngineAuditSymbolSummary>;
}

export interface StoreObservabilitySnapshot {
  sqlite: {
    databasePath: string;
    databaseBytes: number;
    walBytes: number;
    shmBytes: number;
    journalMode: string;
    pageCount: number;
    pageSize: number;
    freelistCount: number;
    integrity: "ok" | "error";
    integrityError: string | null;
  };
  sessions: {
    active: number;
    expired: number;
    revoked: number;
  };
  worker: {
    automationUsers: number;
    diagnosticsStored: number;
    latest: WorkerDiagnosticAdminDto | null;
  };
  notifications: {
    stored: number;
    unread: number;
    pushSubscriptions: number;
    deliveries: number;
  };
}

export interface PublicOracleState {
  state: OracleVisualState;
  updatedAt: string;
}

export type ControlledSimulationStatus = "INACTIVE" | "ACTIVE" | "COMPLETED" | "CANCELLED" | "ERROR";
export type ControlledSimulationStep =
  | "OPEN"
  | "MOVE"
  | "TARGET1"
  | "PARTIAL"
  | "BREAKEVEN"
  | "TRAILING"
  | "TARGET2"
  | "STOP"
  | "LOSS_OF_STRENGTH"
  | "TIMEOUT"
  | "CANCEL";

export interface ControlledSimulationScenario {
  symbol: string;
  direction: TradeDirection;
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
  status: "APPLIED" | "IGNORED" | "ERROR";
  message: string;
  snapshot: Record<string, unknown>;
  createdAt: string;
}

export type NotificationSeverity = "info" | "success" | "warning" | "critical";
export type NotificationSource = "DEMO" | "HOMOLOGATION" | "SYSTEM";

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

export interface PushSubscriptionDto {
  id: string;
  endpointHash: string;
  userAgent: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TelegramStatusDto {
  configured: boolean;
  connected: boolean;
  botUsername: string | null;
  telegramUsername: string | null;
  linkedAt: string | null;
  lastDeliveryAt: string | null;
}

export interface TelegramLinkCodeDto {
  code: string;
  expiresAt: string;
  botUsername: string | null;
  deepLink: string | null;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const DEFAULT_BALANCE = 1000;
const MAX_PRICE = 1_000_000_000;
const MAX_BALANCE = 1_000_000_000;
const MAX_POSITION_SIZE = 1_000_000_000;
const DEFAULT_MAX_DURATION_MS = 90 * 60 * 1000;
const DEFAULT_BREAKEVEN_BUFFER_PCT = 0.0002;
const DEFAULT_TRAILING_STOP_PCT = 0.002;
const DEFAULT_LOSS_OF_STRENGTH_PCT = 0.004;
const PRICE_HISTORY_LIMIT = 20;
const MANAGEMENT_TIMELINE_LIMIT = 200;
const MANAGEMENT_MFE_MAE_TOLERANCE_R = 0.05;
const MANAGEMENT_TRAILING_TOLERANCE_R = 0.03;
const AUTH_COOKIE_NAME = "oraculo_session";
const DEFAULT_SESSION_TTL_SECONDS = 12 * 60 * 60;
const DEFAULT_SCRYPT_N = 16384;
const DEFAULT_SCRYPT_R = 8;
const DEFAULT_SCRYPT_P = 1;
const DEFAULT_SCRYPT_KEY_LEN = 64;
const DEFAULT_BRUTE_FORCE_MAX_ATTEMPTS = 5;
const DEFAULT_BRUTE_FORCE_LOCK_MS = 15 * 60 * 1000;
const TRAILING_BY_SYMBOL: Record<string, { minPct: number; maxPct: number }> = {
  BTCUSDT: { minPct: 0.0018, maxPct: 0.0035 },
  ETHUSDT: { minPct: 0.0018, maxPct: 0.0035 },
  SOLUSDT: { minPct: 0.0025, maxPct: 0.005 },
};

function todaySP(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

function nowIso(): string {
  return new Date().toISOString();
}

function makeDailyStats(balance: number): DailyStats {
  return {
    date: todaySP(),
    startOfDayBalance: balance,
    totalTrades: 0,
    wins: 0,
    losses: 0,
    breakevens: 0,
    consecutiveLosses: 0,
    maxConsecutiveLosses: 0,
    dailyPnL: 0,
    peakBalance: balance,
    maxDrawdown: 0,
    safetyLimited: false,
  };
}

function finiteNumber(value: unknown, name: string, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new HttpError(400, `${name} must be a finite number between ${min} and ${max}`);
  }
  return value;
}

function nonEmptyString(value: unknown, name: string, max = 5000): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > max) {
    throw new HttpError(400, `${name} must be a non-empty string`);
  }
  return value;
}

function stringArray(value: unknown, name: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new HttpError(400, `${name} must be an array of strings`);
  }
  return value.slice(0, 100);
}

function bool(value: unknown): boolean {
  return value === true || value === 1;
}

function jsonParse<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function optionalFiniteNumber(value: unknown): number | null {
  if (value == null) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function optionalNonNegativeNumber(value: unknown): number | null {
  const num = optionalFiniteNumber(value);
  return num === null ? null : Math.max(0, num);
}

function safeTimelineEvent(value: unknown): ManagementTimelineEvent | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (typeof input.type !== "string" || typeof input.at !== "string") return null;
  return {
    type: input.type as ManagementTimelineEventType,
    at: input.at,
    price: optionalFiniteNumber(input.price),
    unrealizedPnlUSDC: optionalFiniteNumber(input.unrealizedPnlUSDC),
    ...(typeof input.note === "string" ? { note: input.note.slice(0, 500) } : {}),
    ...(input.data && typeof input.data === "object" ? { data: input.data as Record<string, unknown> } : {}),
  };
}

function safeManagementTimeline(value: unknown): ManagementTimelineEvent[] {
  const parsed = typeof value === "string" ? jsonParse<unknown>(value, []) : value;
  if (!Array.isArray(parsed)) return [];
  return parsed.map(safeTimelineEvent).filter((event): event is ManagementTimelineEvent => event !== null).slice(-MANAGEMENT_TIMELINE_LIMIT);
}

function openedTimelineEvent(trade: Pick<DemoTrade, "entry" | "openTime">): ManagementTimelineEvent {
  return {
    type: "OPENED",
    at: new Date(trade.openTime).toISOString(),
    price: trade.entry,
    unrealizedPnlUSDC: 0,
    note: "Posicao aberta.",
  };
}

function appendTimelineEvent(timeline: ManagementTimelineEvent[] | undefined, event: ManagementTimelineEvent): ManagementTimelineEvent[] {
  const events = safeManagementTimeline(timeline ?? []);
  const next = events.length === 0 && event.type !== "OPENED"
    ? [openedTimelineEvent({ entry: event.price ?? 0, openTime: Date.now() }), event]
    : [...events, event];
  if (next.length <= MANAGEMENT_TIMELINE_LIMIT) return next;
  const opened = next.find((item) => item.type === "OPENED");
  let closed: ManagementTimelineEvent | undefined;
  for (let index = next.length - 1; index >= 0; index -= 1) {
    const item: ManagementTimelineEvent = next[index];
    if (item.type === "CLOSED") {
      closed = item;
      break;
    }
  }
  const protectedIds = new Set<ManagementTimelineEvent>();
  if (opened) protectedIds.add(opened);
  if (closed) protectedIds.add(closed);
  const middle = next.filter((item) => !protectedIds.has(item));
  const keepMiddle = middle.slice(-(MANAGEMENT_TIMELINE_LIMIT - protectedIds.size));
  return [
    ...(opened ? [opened] : []),
    ...keepMiddle,
    ...(closed && closed !== opened ? [closed] : []),
  ].slice(-MANAGEMENT_TIMELINE_LIMIT);
}

function openPnlFor(trade: Pick<DemoTrade, "direction" | "entry" | "positionSize" | "remainingPositionSize">, price: number): number {
  const size = trade.remainingPositionSize ?? trade.positionSize;
  return trade.direction === "BUY"
    ? (price - trade.entry) * size
    : (trade.entry - price) * size;
}

function fullSizePnlFor(trade: Pick<DemoTrade, "direction" | "entry" | "positionSize">, price: number): number {
  return trade.direction === "BUY"
    ? (price - trade.entry) * trade.positionSize
    : (trade.entry - price) * trade.positionSize;
}

function managementToleranceUSDC(trade: DemoTrade, fractionR = MANAGEMENT_MFE_MAE_TOLERANCE_R): number {
  const initialRisk = trade.initialRiskAmount ?? trade.riskAmount;
  return Number.isFinite(initialRisk) && initialRisk > 0 ? initialRisk * fractionR : 0.01;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function newTradeId(): string {
  return `demo_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now()}_${randomBytes(8).toString("hex")}`;
}

function envInt(name: string, fallback: number, min: number, max: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}

interface ReentryCooldownEntry {
  pair: string;
  direction: TradeDirection;
  reason: ReentryCooldownReason;
  expiresAt: string;
  expiresAtMs: number;
  createdAt: string;
  createdAtMs: number;
}

function envNumber(name: string, fallback: number, min: number, max: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= min && value <= max ? value : fallback;
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(raw.trim().toLowerCase());
}

function demoMaxDailyTrades(): number {
  return envInt("ORACULO_DEMO_MAX_DAILY_TRADES", 0, 0, 10_000);
}

function demoLossStreakCooldownMinutes(): number {
  return envInt("ORACULO_DEMO_LOSS_STREAK_COOLDOWN_MINUTES", 60, 0, 24 * 60);
}

function demoManagementSettings() {
  return {
    partialTriggerR: envNumber("DEMO_PARTIAL_TRIGGER_R", 1, 0.1, 100),
    partialClosePercent: envNumber("DEMO_PARTIAL_CLOSE_PERCENT", 50, 1, 99),
    trailingTriggerR: envNumber("DEMO_TRAILING_TRIGGER_R", 1.5, 0.1, 100),
    moveStopToBreakeven: envBool("DEMO_MOVE_STOP_TO_BREAKEVEN", true),
    trailingEnabled: envBool("DEMO_TRAILING_ENABLED", true),
  };
}

function reentryCooldownReason(exitReason: ManagedTradeExitReason): ReentryCooldownReason | null {
  if (exitReason === "TIMEOUT") return "REENTRY_COOLDOWN_TIMEOUT";
  if (exitReason === "STOP_LOSS") return "REENTRY_COOLDOWN_STOP_LOSS";
  return null;
}

function reentryCooldownDurationMs(reason: ReentryCooldownReason): number {
  return reason === "REENTRY_COOLDOWN_TIMEOUT" ? 15 * 60 * 1000 : 30 * 60 * 1000;
}

function reentryCooldownKey(pair: string, direction: TradeDirection): string {
  return `${pair.toUpperCase()}:${direction}`;
}

function reentryCooldownSettingKey(pair: string, direction: TradeDirection): string {
  return `demo.reentryCooldown.${reentryCooldownKey(pair, direction)}`;
}

function formatRemainingMinutes(ms: number): number {
  return Math.max(1, Math.ceil(ms / 60_000));
}

function sessionTtlSeconds(): number {
  return envInt("ORACULO_SESSION_TTL_SECONDS", DEFAULT_SESSION_TTL_SECONDS, 300, 30 * 24 * 60 * 60);
}

function passwordParams() {
  return {
    n: envInt("ORACULO_SCRYPT_N", DEFAULT_SCRYPT_N, 1024, 1048576),
    r: envInt("ORACULO_SCRYPT_R", DEFAULT_SCRYPT_R, 1, 64),
    p: envInt("ORACULO_SCRYPT_P", DEFAULT_SCRYPT_P, 1, 16),
    keyLen: envInt("ORACULO_SCRYPT_KEY_LEN", DEFAULT_SCRYPT_KEY_LEN, 32, 128),
  };
}

function normalizeUsername(value: unknown): string {
  return nonEmptyString(value, "username", 120).trim().toLowerCase();
}

function safeUserFromRow(row: Record<string, unknown>): AuthUser {
  return {
    id: String(row.id),
    name: String(row.name),
    username: String(row.username),
    role: String(row.role) === "admin" ? "admin" : "user",
    active: Boolean(row.active),
    createdAt: String(row.created_at),
    lastLoginAt: row.last_login_at == null ? null : String(row.last_login_at),
  };
}

function hashPassword(password: string, params = passwordParams()): PasswordRecord {
  const salt = randomBytes(16).toString("base64url");
  const hash = scryptSync(password, salt, params.keyLen, {
    N: params.n,
    r: params.r,
    p: params.p,
    maxmem: 128 * 1024 * 1024,
  }).toString("base64url");
  return {
    password_hash: hash,
    password_salt: salt,
    scrypt_n: params.n,
    scrypt_r: params.r,
    scrypt_p: params.p,
    scrypt_key_len: params.keyLen,
  };
}

function verifyPassword(password: string, record: PasswordRecord): boolean {
  const actual = Buffer.from(record.password_hash, "base64url");
  const expected = scryptSync(password, record.password_salt, record.scrypt_key_len, {
    N: record.scrypt_n,
    r: record.scrypt_r,
    p: record.scrypt_p,
    maxmem: 128 * 1024 * 1024,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

function resolveSafetyLimit(stats: DailyStats, maxDailyTrades = demoMaxDailyTrades(), cooldown: SafetyLimitState | null = null): SafetyLimitState {
  if (maxDailyTrades > 0 && stats.totalTrades >= maxDailyTrades) {
    return { limited: true, code: "DAILY_TRADE_LIMIT", reason: "Limite diário de operações atingido." };
  }
  if (cooldown?.limited) return cooldown;
  if (stats.dailyPnL <= -(stats.startOfDayBalance * 0.03)) {
    return { limited: true, code: "DAILY_LOSS", reason: "Perda diária máxima atingida." };
  }
  return { limited: false, code: "NONE", reason: "Ativo normalmente." };
}

function isSafetyLimited(stats: DailyStats): boolean {
  return resolveSafetyLimit(stats).limited;
}

function calcPositionSize(balance: number, entry: number, stop: number): { riskAmount: number; positionSize: number } {
  const riskAmount = balance * 0.01;
  const dist = Math.abs(entry - stop);
  return { riskAmount, positionSize: dist > 0 ? riskAmount / dist : 0 };
}

const MAX_DEMO_OPEN_POSITIONS = 3;
const MAX_DEMO_GLOBAL_RISK_PCT = 0.02;
const MAX_DEMO_ENTRY_RISK_PCT = 0.01;

function remainingOpenRisk(trade: DemoTrade): number {
  const size = trade.remainingPositionSize ?? trade.positionSize;
  if (size <= 0) return 0;
  const riskPerUnit = trade.direction === "BUY"
    ? Math.max(0, trade.entry - trade.stopLoss)
    : Math.max(0, trade.stopLoss - trade.entry);
  return riskPerUnit * size;
}

function calcPositionSizeWithRisk(entry: number, stop: number, riskAmount: number): { riskAmount: number; positionSize: number } {
  const safeRisk = Math.max(0, riskAmount);
  const dist = Math.abs(entry - stop);
  return { riskAmount: safeRisk, positionSize: dist > 0 ? safeRisk / dist : 0 };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function tradeAgeMs(trade: DemoTrade, now = Date.now()): number {
  return Math.max(0, now - trade.openTime);
}

function closedStatus(pnlUSDC: number): TradeStatus {
  return pnlUSDC > 0.00000001 ? "WIN" : pnlUSDC < -0.00000001 ? "LOSS" : "BREAKEVEN";
}

function signalKey(input: DemoSignalInput): string {
  return createHash("sha256").update(canonical({
    pair: input.pair.toUpperCase(),
    decision: input.decision,
    entry: input.entryNum,
    stop: input.stopLossNum,
    target1: input.target1Num,
    target2: input.target2Num,
    provided: input.signalKey ?? null,
  })).digest("hex");
}

export function migrationHash(session: unknown): string {
  return createHash("sha256").update(canonical(session)).digest("hex");
}

function accountFromRow(row: Record<string, unknown>): { balance: number; configuredBalance: number; dailyStats: DailyStats } {
  return {
    balance: Number(row.balance),
    configuredBalance: Number(row.configured_balance),
    dailyStats: jsonParse(String(row.daily_stats_json), makeDailyStats(Number(row.balance))),
  };
}

function tradeFromRow(row: Record<string, unknown>): DemoTrade {
  return {
    id: String(row.id),
    pair: String(row.pair),
    direction: String(row.direction) as TradeDirection,
    status: String(row.status) as TradeStatus,
    openTime: Number(row.open_time),
    closeTime: row.close_time == null ? undefined : Number(row.close_time),
    entry: Number(row.entry),
    closePrice: row.close_price == null ? undefined : Number(row.close_price),
    stopLoss: Number(row.stop_loss),
    stopLossOriginal: Number(row.stop_loss_original),
    target1: Number(row.target1),
    target2: Number(row.target2),
    balanceAtOpen: Number(row.balance_at_open),
    riskAmount: Number(row.risk_amount),
    positionSize: Number(row.position_size),
    remainingPositionSize: row.remaining_position_size == null ? Number(row.position_size) : Number(row.remaining_position_size),
    riskReward: String(row.risk_reward),
    pnlUSDC: row.pnl_usdc == null ? undefined : Number(row.pnl_usdc),
    pnlPct: row.pnl_pct == null ? undefined : Number(row.pnl_pct),
    exitReason: row.exit_reason == null ? undefined : String(row.exit_reason) as ManagedTradeExitReason,
    target1Hit: Boolean(row.target1_hit),
    isBreakevenStop: Boolean(row.is_breakeven_stop),
    trailing: Boolean(row.trailing),
    realizedPnlUSDC: row.realized_pnl_usdc == null ? undefined : Number(row.realized_pnl_usdc),
    partialPnlUSDC: row.partial_pnl_usdc == null ? undefined : Number(row.partial_pnl_usdc),
    target1ClosePrice: row.target1_close_price == null ? undefined : Number(row.target1_close_price),
    partialTriggerR: optionalNonNegativeNumber(row.partial_trigger_r),
    trailingTriggerR: optionalNonNegativeNumber(row.trailing_trigger_r),
    maxDurationMs: row.max_duration_ms == null ? undefined : Number(row.max_duration_ms),
    initialRiskAmount: row.initial_risk_amount == null ? Number(row.risk_amount) : Number(row.initial_risk_amount),
    maxPriceSinceEntry: optionalFiniteNumber(row.max_price_since_entry),
    minPriceSinceEntry: optionalFiniteNumber(row.min_price_since_entry),
    maxUnrealizedPnlUSDC: optionalFiniteNumber(row.max_unrealized_pnl_usdc),
    minUnrealizedPnlUSDC: optionalFiniteNumber(row.min_unrealized_pnl_usdc),
    maxUnrealizedPnlBeforePartial: optionalFiniteNumber(row.max_unrealized_pnl_before_partial),
    maxUnrealizedPnlAfterPartial: optionalFiniteNumber(row.max_unrealized_pnl_after_partial),
    mfeUSDC: optionalNonNegativeNumber(row.mfe_usdc),
    maeUSDC: optionalNonNegativeNumber(row.mae_usdc),
    mfeR: optionalNonNegativeNumber(row.mfe_r),
    maeR: optionalNonNegativeNumber(row.mae_r),
    peakGivebackUSDC: optionalNonNegativeNumber(row.peak_giveback_usdc),
    openGivebackUSDC: optionalNonNegativeNumber(row.open_giveback_usdc),
    totalGivebackUSDC: optionalNonNegativeNumber(row.total_giveback_usdc),
    peakGivebackPct: optionalNonNegativeNumber(row.peak_giveback_pct),
    lastManagementUpdateAt: row.last_management_update_at == null ? null : String(row.last_management_update_at),
    managementTimeline: safeManagementTimeline(row.management_timeline_json),
    signalReasons: jsonParse(String(row.signal_reasons_json), []),
    marketConditions: String(row.market_conditions),
  };
}

function lossStreakDiagnosticFromRow(row: Record<string, unknown>): LossStreakDiagnostic {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    createdAt: String(row.created_at),
    lossCount: Number(row.loss_count),
    cooldownStartedAt: row.cooldown_started_at == null ? null : String(row.cooldown_started_at),
    cooldownEndsAt: row.cooldown_ends_at == null ? null : String(row.cooldown_ends_at),
    cooldownMinutes: Number(row.cooldown_minutes),
    triggerTradeId: String(row.trigger_trade_id),
    trades: jsonParse<LossStreakDiagnosticTrade[]>(String(row.trades_json), []),
    patterns: jsonParse<LossStreakDiagnosticPattern[]>(String(row.patterns_json), []),
    summary: String(row.summary),
    status: String(row.status) === "ACTIVE" ? "ACTIVE" : "COMPLETED",
    updatedAt: String(row.updated_at),
  };
}

function diagnosticUserFromRow(row: Record<string, unknown>): WorkerDiagnosticUserDto {
  const userPayload = jsonParse<Record<string, unknown>>(row.user_json, {});
  const optionalNumber = (value: unknown): number | null | undefined => {
    if (value === undefined) return undefined;
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  };
  return {
    id: String(row.id),
    symbol: String(row.symbol),
    status: String(row.status) as WorkerDiagnosticStatus,
    direction: String(row.direction),
    quality: String(row.quality),
    summary: String(row.summary),
    decision: String(row.decision),
    score: row.score == null ? null : Number(row.score),
    scoreContextual: optionalNumber(userPayload.scoreContextual),
    scoreOperacional: optionalNumber(userPayload.scoreOperacional),
    decisionState: typeof userPayload.decisionState === "string" ? userPayload.decisionState : undefined,
    generatedAt: String(row.cycle_finished_at),
    nextCycleAt: row.next_cycle_at == null ? null : String(row.next_cycle_at),
  };
}

function diagnosticAdminFromRow(row: Record<string, unknown>): WorkerDiagnosticAdminDto {
  return {
    ...diagnosticUserFromRow(row),
    workerActive: Boolean(row.worker_active),
    automationActive: Boolean(row.automation_active),
    cycleDurationMs: Number(row.cycle_duration_ms),
    latencyMs: row.latency_ms == null ? null : Number(row.latency_ms),
    lastError: row.last_error == null ? null : String(row.last_error),
    engineVersion: String(row.engine_version),
    full: jsonParse<Record<string, unknown>>(row.admin_json, {}),
  };
}

function simulationEventFromRow(row: Record<string, unknown>): ControlledSimulationEventDto {
  return {
    id: String(row.id),
    simulationId: String(row.simulation_id),
    userId: String(row.user_id),
    step: String(row.step) as ControlledSimulationStep,
    idempotencyKey: String(row.idempotency_key),
    status: String(row.status) as "APPLIED" | "IGNORED" | "ERROR",
    message: String(row.message),
    snapshot: jsonParse<Record<string, unknown>>(String(row.snapshot_json), {}),
    createdAt: String(row.created_at),
  };
}

function allowedSimulationSteps(status: ControlledSimulationStatus, session: DemoSession): ControlledSimulationStep[] {
  if (status === "CANCELLED" || status === "COMPLETED" || status === "ERROR") return [];
  const trade = session.activeTrade;
  if (!trade) return status === "ACTIVE" ? ["OPEN", "CANCEL"] : [];
  if (!trade.target1Hit) return ["MOVE", "TARGET1", "STOP", "TIMEOUT", "LOSS_OF_STRENGTH", "CANCEL"];
  return ["MOVE", "PARTIAL", "BREAKEVEN", "TRAILING", "TARGET2", "STOP", "TIMEOUT", "LOSS_OF_STRENGTH", "CANCEL"];
}

function simulationStatusFromRow(row: Record<string, unknown>): ControlledSimulationStatus {
  return String(row.status) as ControlledSimulationStatus;
}

function simulationTradeId(id: string): string {
  return `sim_trade_${id}`;
}

const DEFAULT_NOTIFICATION_TYPES = [
  "automation_enabled",
  "automation_disabled",
  "demo_entry_opened",
  "demo_entry_not_executed",
  "target1_hit",
  "partial_executed",
  "breakeven_moved",
  "trailing_updated",
  "target2_hit",
  "stop_loss",
  "loss_of_strength",
  "timeout",
  "worker_error",
  "binance_error",
  "sqlite_error",
  "session_expired",
  "simulation_started",
  "simulation_event",
  "simulation_completed",
  "simulation_cancelled",
  "test",
];

function defaultNotificationPreferences(): NotificationPreferences {
  return {
    internal: true,
    push: false,
    telegram: false,
    importantOnly: false,
    includeBlockedEntries: false,
    includeSimulation: true,
    mutedUntil: null,
    quietHours: { enabled: false, start: "22:00", end: "07:00" },
    enabledTypes: [...DEFAULT_NOTIFICATION_TYPES],
  };
}

function notificationFromRow(row: Record<string, unknown>, role: UserRole): NotificationDto {
  const dto: NotificationDto = {
    id: String(row.id),
    type: String(row.type),
    title: String(row.title),
    message: String(row.message),
    severity: String(row.severity) as NotificationSeverity,
    symbol: row.symbol == null ? null : String(row.symbol),
    source: String(row.source) as NotificationSource,
    relatedEventId: row.related_event_id == null ? null : String(row.related_event_id),
    readAt: row.read_at == null ? null : String(row.read_at),
    createdAt: String(row.created_at),
    deliveryStatus: String(row.delivery_status),
    failureReason: row.failure_reason == null ? null : String(row.failure_reason),
  };
  if (role === "admin") dto.metadata = jsonParse<Record<string, unknown>>(String(row.admin_metadata_json ?? "{}"), {});
  return dto;
}

function pushSubscriptionFromRow(row: Record<string, unknown>): PushSubscriptionDto {
  return {
    id: String(row.id),
    endpointHash: String(row.endpoint_hash),
    userAgent: row.user_agent == null ? null : String(row.user_agent),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function sanitizeFailure(value: unknown): string | null {
  if (value == null) return null;
  return String(value).replace(/[A-Za-z0-9_-]{24,}/g, "[redacted]").slice(0, 300);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function telegramConfigured(): boolean {
  return !!process.env["ORACULO_TELEGRAM_BOT_TOKEN"];
}

function telegramBotUsername(): string | null {
  const username = process.env["ORACULO_TELEGRAM_BOT_USERNAME"]?.trim().replace(/^@/, "") ?? "";
  return username || null;
}

function telegramChatId(): string | null {
  const chatId = process.env["ORACULO_TELEGRAM_CHAT_ID"]?.trim() ?? "";
  return chatId || null;
}

function telegramOperationalNotificationsEnabled(): boolean {
  return process.env["ORACULO_TELEGRAM_OPERATIONAL_NOTIFICATIONS"] === "true";
}

function pushOperationalNotificationsEnabled(): boolean {
  return process.env["ORACULO_PUSH_OPERATIONAL_NOTIFICATIONS"] === "true";
}

function telegramApiUrl(pathname: string): string {
  const token = process.env["ORACULO_TELEGRAM_BOT_TOKEN"];
  if (!token) throw new HttpError(503, "Telegram is not configured");
  return `https://api.telegram.org/bot${token}/${pathname}`;
}

function notificationTelegramMessage(notification: NotificationDto, role: UserRole): string {
  return formatTelegramNotification(notification, role);
}

export class DemoStore {
  db: DatabaseSync;
  private dbPath: string;

  constructor(dbPath = process.env["ORACULO_DB_PATH"] ?? path.resolve(process.cwd(), "data", "oraculo.sqlite")) {
    this.dbPath = dbPath;
    const dataDir = path.dirname(dbPath);
    mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    try { chmodSync(dataDir, 0o700); } catch { /* best effort on Windows */ }
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA busy_timeout = 5000");
    this.db.exec("PRAGMA foreign_keys = ON");
    this.migrate();
    this.applyInitialAdminEnv();
  }

  close(): void {
    this.db.close();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
    `);
    const applied = this.db.prepare("SELECT version FROM schema_migrations WHERE version = 1").get();
    if (!applied) {
      this.transaction(() => {
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS demo_account (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            balance REAL NOT NULL,
            configured_balance REAL NOT NULL,
            daily_stats_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
          CREATE TABLE IF NOT EXISTS demo_positions (
            id TEXT PRIMARY KEY,
            pair TEXT NOT NULL,
            direction TEXT NOT NULL CHECK (direction IN ('BUY','SELL')),
            status TEXT NOT NULL DEFAULT 'OPEN',
            open_time INTEGER NOT NULL,
            entry REAL NOT NULL,
            stop_loss REAL NOT NULL,
            stop_loss_original REAL NOT NULL,
            target1 REAL NOT NULL,
            target2 REAL NOT NULL,
            balance_at_open REAL NOT NULL,
            risk_amount REAL NOT NULL,
            position_size REAL NOT NULL,
            remaining_position_size REAL NOT NULL,
            risk_reward TEXT NOT NULL,
            target1_hit INTEGER NOT NULL DEFAULT 0,
            is_breakeven_stop INTEGER NOT NULL DEFAULT 0,
            trailing INTEGER NOT NULL DEFAULT 0,
            realized_pnl_usdc REAL NOT NULL DEFAULT 0,
            partial_pnl_usdc REAL NOT NULL DEFAULT 0,
            target1_close_price REAL,
            partial_trigger_r REAL,
            trailing_trigger_r REAL,
            max_duration_ms INTEGER NOT NULL DEFAULT 5400000,
            initial_risk_amount REAL,
            max_price_since_entry REAL,
            min_price_since_entry REAL,
            max_unrealized_pnl_usdc REAL,
            min_unrealized_pnl_usdc REAL,
            max_unrealized_pnl_before_partial REAL,
            max_unrealized_pnl_after_partial REAL,
            mfe_usdc REAL,
            mae_usdc REAL,
            mfe_r REAL,
            mae_r REAL,
            peak_giveback_usdc REAL,
            open_giveback_usdc REAL,
            total_giveback_usdc REAL,
            peak_giveback_pct REAL,
            last_management_update_at TEXT,
            management_timeline_json TEXT DEFAULT '[]',
            signal_reasons_json TEXT NOT NULL,
            market_conditions TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
          CREATE UNIQUE INDEX IF NOT EXISTS demo_positions_open_pair_idx
            ON demo_positions(pair) WHERE status = 'OPEN';
          CREATE TABLE IF NOT EXISTS demo_trades (
            id TEXT PRIMARY KEY,
            pair TEXT NOT NULL,
            direction TEXT NOT NULL CHECK (direction IN ('BUY','SELL')),
            status TEXT NOT NULL CHECK (status IN ('OPEN','WIN','LOSS','BREAKEVEN')),
            open_time INTEGER NOT NULL,
            close_time INTEGER,
            entry REAL NOT NULL,
            close_price REAL,
            stop_loss REAL NOT NULL,
            stop_loss_original REAL NOT NULL,
            target1 REAL NOT NULL,
            target2 REAL NOT NULL,
            balance_at_open REAL NOT NULL,
            risk_amount REAL NOT NULL,
            position_size REAL NOT NULL,
            remaining_position_size REAL NOT NULL,
            risk_reward TEXT NOT NULL,
            pnl_usdc REAL,
            pnl_pct REAL,
            realized_pnl_usdc REAL,
            partial_pnl_usdc REAL,
            target1_close_price REAL,
            max_duration_ms INTEGER,
            initial_risk_amount REAL,
            max_price_since_entry REAL,
            min_price_since_entry REAL,
            max_unrealized_pnl_usdc REAL,
            min_unrealized_pnl_usdc REAL,
            max_unrealized_pnl_before_partial REAL,
            max_unrealized_pnl_after_partial REAL,
            mfe_usdc REAL,
            mae_usdc REAL,
            mfe_r REAL,
            mae_r REAL,
            peak_giveback_usdc REAL,
            open_giveback_usdc REAL,
            total_giveback_usdc REAL,
            peak_giveback_pct REAL,
            last_management_update_at TEXT,
            management_timeline_json TEXT DEFAULT '[]',
            exit_reason TEXT,
            target1_hit INTEGER NOT NULL DEFAULT 0,
            is_breakeven_stop INTEGER NOT NULL DEFAULT 0,
            trailing INTEGER NOT NULL DEFAULT 0,
            partial_trigger_r REAL,
            trailing_trigger_r REAL,
            signal_reasons_json TEXT NOT NULL,
            market_conditions TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
          CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
        `);
        const now = nowIso();
        const stats = makeDailyStats(DEFAULT_BALANCE);
        this.db.prepare(`
          INSERT OR IGNORE INTO demo_account
            (id, balance, configured_balance, daily_stats_json, created_at, updated_at)
          VALUES (1, ?, ?, ?, ?, ?)
        `).run(DEFAULT_BALANCE, DEFAULT_BALANCE, JSON.stringify(stats), now, now);
        this.db.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (1, 'initial_demo_sqlite', ?)").run(now);
      });
    }
    const v2 = this.db.prepare("SELECT version FROM schema_migrations WHERE version = 2").get();
    if (!v2) {
      this.transaction(() => {
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS demo_events (
            event_key TEXT PRIMARY KEY,
            event_type TEXT NOT NULL,
            trade_id TEXT,
            created_at TEXT NOT NULL
          );
        `);
        this.db.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (2, 'demo_idempotency_events', ?)").run(nowIso());
      });
    }
    const v3 = this.db.prepare("SELECT version FROM schema_migrations WHERE version = 3").get();
    if (!v3) {
      this.transaction(() => {
        const addColumn = (table: string, definition: string) => {
          const column = definition.split(/\s+/)[0];
          const exists = (this.db.prepare(`PRAGMA table_info(${table})`).all() as Record<string, unknown>[])
            .some((row) => row.name === column);
          if (!exists) this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
        };
        addColumn("demo_positions", "remaining_position_size REAL NOT NULL DEFAULT 0");
        addColumn("demo_positions", "realized_pnl_usdc REAL NOT NULL DEFAULT 0");
        addColumn("demo_positions", "partial_pnl_usdc REAL NOT NULL DEFAULT 0");
        addColumn("demo_positions", "target1_close_price REAL");
        addColumn("demo_positions", "max_duration_ms INTEGER NOT NULL DEFAULT 5400000");
        addColumn("demo_trades", "remaining_position_size REAL NOT NULL DEFAULT 0");
        addColumn("demo_trades", "realized_pnl_usdc REAL");
        addColumn("demo_trades", "partial_pnl_usdc REAL");
        addColumn("demo_trades", "target1_close_price REAL");
        addColumn("demo_trades", "max_duration_ms INTEGER");
        this.db.prepare("UPDATE demo_positions SET remaining_position_size = position_size WHERE remaining_position_size = 0").run();
        this.db.prepare("UPDATE demo_trades SET remaining_position_size = position_size WHERE remaining_position_size = 0").run();
        this.db.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (3, 'demo_trade_management_fields', ?)").run(nowIso());
      });
    }
    const v4 = this.db.prepare("SELECT version FROM schema_migrations WHERE version = 4").get();
    if (!v4) {
      this.transaction(() => {
        const now = nowIso();
        const initialUsername = (process.env["ORACULO_INITIAL_ADMIN_USERNAME"] ?? "admin").trim().toLowerCase();
        const initialName = process.env["ORACULO_INITIAL_ADMIN_NAME"] ?? "Administrador";
        const initialPassword = process.env["ORACULO_INITIAL_ADMIN_PASSWORD"] ?? process.env["ORACULO_ADMIN_PASSWORD"];
        const password = hashPassword(initialPassword && initialPassword.length >= 12 ? initialPassword : randomBytes(32).toString("base64url"));
        const active = initialPassword && initialPassword.length >= 12 ? 1 : 0;

        this.db.exec(`
          CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            password_salt TEXT NOT NULL,
            scrypt_n INTEGER NOT NULL,
            scrypt_r INTEGER NOT NULL,
            scrypt_p INTEGER NOT NULL,
            scrypt_key_len INTEGER NOT NULL,
            role TEXT NOT NULL CHECK (role IN ('admin','user')),
            active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            last_login_at TEXT
          );
          CREATE TABLE IF NOT EXISTS auth_sessions (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            token_hash TEXT NOT NULL UNIQUE,
            created_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL,
            revoked_at INTEGER,
            user_agent TEXT,
            ip TEXT
          );
          CREATE TABLE IF NOT EXISTS auth_attempts (
            identity TEXT PRIMARY KEY,
            attempts INTEGER NOT NULL DEFAULT 0,
            last_attempt_at INTEGER NOT NULL,
            locked_until INTEGER
          );
        `);

        this.db.prepare(`
          INSERT INTO users
            (id, name, username, password_hash, password_salt, scrypt_n, scrypt_r, scrypt_p, scrypt_key_len, role, active, created_at, updated_at)
          VALUES ('admin', ?, ?, ?, ?, ?, ?, ?, ?, 'admin', ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            username = excluded.username,
            password_hash = CASE WHEN excluded.active = 1 THEN excluded.password_hash ELSE users.password_hash END,
            password_salt = CASE WHEN excluded.active = 1 THEN excluded.password_salt ELSE users.password_salt END,
            scrypt_n = CASE WHEN excluded.active = 1 THEN excluded.scrypt_n ELSE users.scrypt_n END,
            scrypt_r = CASE WHEN excluded.active = 1 THEN excluded.scrypt_r ELSE users.scrypt_r END,
            scrypt_p = CASE WHEN excluded.active = 1 THEN excluded.scrypt_p ELSE users.scrypt_p END,
            scrypt_key_len = CASE WHEN excluded.active = 1 THEN excluded.scrypt_key_len ELSE users.scrypt_key_len END,
            active = CASE WHEN excluded.active = 1 THEN 1 ELSE users.active END,
            updated_at = excluded.updated_at
        `).run(
          initialName,
          initialUsername,
          password.password_hash,
          password.password_salt,
          password.scrypt_n,
          password.scrypt_r,
          password.scrypt_p,
          password.scrypt_key_len,
          active,
          now,
          now,
        );

        this.db.exec(`
          DROP INDEX IF EXISTS demo_positions_open_pair_idx;
          ALTER TABLE demo_account RENAME TO demo_account_legacy_v4;
          CREATE TABLE demo_account (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
            balance REAL NOT NULL,
            configured_balance REAL NOT NULL,
            daily_stats_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
          INSERT INTO demo_account (user_id, balance, configured_balance, daily_stats_json, created_at, updated_at)
          SELECT 'admin', balance, configured_balance, daily_stats_json, created_at, updated_at
          FROM demo_account_legacy_v4
          LIMIT 1;
          INSERT OR IGNORE INTO demo_account (user_id, balance, configured_balance, daily_stats_json, created_at, updated_at)
          VALUES ('admin', 1000, 1000, '${JSON.stringify(makeDailyStats(DEFAULT_BALANCE)).replaceAll("'", "''")}', '${now}', '${now}');
          ALTER TABLE app_settings RENAME TO app_settings_legacy_v4;
          CREATE TABLE app_settings (
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            key TEXT NOT NULL,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (user_id, key)
          );
          INSERT OR IGNORE INTO app_settings (user_id, key, value, updated_at)
          SELECT 'admin', key, value, updated_at FROM app_settings_legacy_v4;
        `);

        const addColumn = (table: string, definition: string) => {
          const column = definition.split(/\s+/)[0];
          const exists = (this.db.prepare(`PRAGMA table_info(${table})`).all() as Record<string, unknown>[])
            .some((row) => row.name === column);
          if (!exists) this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
        };
        addColumn("demo_positions", "user_id TEXT");
        addColumn("demo_trades", "user_id TEXT");
        addColumn("demo_events", "user_id TEXT");
        this.db.prepare("UPDATE demo_positions SET user_id = COALESCE(user_id, 'admin')").run();
        this.db.prepare("UPDATE demo_trades SET user_id = COALESCE(user_id, 'admin')").run();
        this.db.prepare("UPDATE demo_events SET user_id = COALESCE(user_id, 'admin')").run();
        this.db.exec(`
          CREATE UNIQUE INDEX IF NOT EXISTS demo_positions_open_user_pair_idx
            ON demo_positions(user_id, pair) WHERE status = 'OPEN';
          CREATE INDEX IF NOT EXISTS demo_trades_user_time_idx
            ON demo_trades(user_id, COALESCE(close_time, open_time));
          CREATE INDEX IF NOT EXISTS demo_events_user_idx
            ON demo_events(user_id, created_at);
          CREATE INDEX IF NOT EXISTS auth_sessions_user_idx
            ON auth_sessions(user_id, expires_at);
        `);
        this.db.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (4, 'multiuser_demo_auth', ?)").run(now);
      });
    }
    const v5 = this.db.prepare("SELECT version FROM schema_migrations WHERE version = 5").get();
    if (!v5) {
      this.transaction(() => {
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS worker_diagnostics (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            symbol TEXT NOT NULL,
            status TEXT NOT NULL CHECK (status IN ('APPROVED','BLOCKED','WAIT','ERROR')),
            worker_active INTEGER NOT NULL,
            automation_active INTEGER NOT NULL,
            cycle_started_at TEXT NOT NULL,
            cycle_finished_at TEXT NOT NULL,
            cycle_duration_ms INTEGER NOT NULL,
            latency_ms INTEGER,
            decision TEXT NOT NULL,
            score INTEGER,
            direction TEXT NOT NULL,
            quality TEXT NOT NULL,
            summary TEXT NOT NULL,
            next_cycle_at TEXT,
            last_error TEXT,
            engine_version TEXT NOT NULL,
            fingerprint TEXT NOT NULL,
            admin_json TEXT NOT NULL,
            user_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
          CREATE INDEX IF NOT EXISTS worker_diagnostics_user_time_idx
            ON worker_diagnostics(user_id, cycle_finished_at);
          CREATE UNIQUE INDEX IF NOT EXISTS worker_diagnostics_dedupe_idx
            ON worker_diagnostics(user_id, symbol, fingerprint);
        `);
        this.db.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (5, 'worker_diagnostics', ?)").run(nowIso());
      });
    }
    const v6 = this.db.prepare("SELECT version FROM schema_migrations WHERE version = 6").get();
    if (!v6) {
      this.transaction(() => {
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS controlled_simulations (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            simulation_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            status TEXT NOT NULL CHECK (status IN ('INACTIVE','ACTIVE','COMPLETED','CANCELLED','ERROR')),
            scenario_json TEXT NOT NULL,
            current_step TEXT NOT NULL,
            started_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            completed_at TEXT,
            cancelled_at TEXT,
            last_event TEXT,
            error TEXT
          );
          CREATE UNIQUE INDEX IF NOT EXISTS controlled_simulations_active_user_idx
            ON controlled_simulations(user_id) WHERE status = 'ACTIVE';
          CREATE INDEX IF NOT EXISTS controlled_simulations_user_time_idx
            ON controlled_simulations(user_id, started_at);
          CREATE TABLE IF NOT EXISTS controlled_simulation_events (
            id TEXT PRIMARY KEY,
            simulation_id TEXT NOT NULL REFERENCES controlled_simulations(id) ON DELETE CASCADE,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            step TEXT NOT NULL,
            idempotency_key TEXT NOT NULL,
            status TEXT NOT NULL CHECK (status IN ('APPLIED','IGNORED','ERROR')),
            message TEXT NOT NULL,
            snapshot_json TEXT NOT NULL,
            created_at TEXT NOT NULL
          );
          CREATE UNIQUE INDEX IF NOT EXISTS controlled_simulation_events_dedupe_idx
            ON controlled_simulation_events(simulation_id, idempotency_key);
          CREATE INDEX IF NOT EXISTS controlled_simulation_events_time_idx
            ON controlled_simulation_events(simulation_id, created_at);
        `);
        this.db.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (6, 'controlled_simulations', ?)").run(nowIso());
      });
    }
    const v7 = this.db.prepare("SELECT version FROM schema_migrations WHERE version = 7").get();
    if (!v7) {
      this.transaction(() => {
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS notification_preferences (
            user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            preferences_json TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
          CREATE TABLE IF NOT EXISTS notifications (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            type TEXT NOT NULL,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            severity TEXT NOT NULL CHECK (severity IN ('info','success','warning','critical')),
            symbol TEXT,
            source TEXT NOT NULL CHECK (source IN ('DEMO','HOMOLOGATION','SYSTEM')),
            related_event_id TEXT,
            idempotency_key TEXT NOT NULL,
            read_at TEXT,
            delivery_status TEXT NOT NULL,
            failure_reason TEXT,
            admin_metadata_json TEXT NOT NULL DEFAULT '{}',
            user_metadata_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL
          );
          CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedupe_idx
            ON notifications(user_id, idempotency_key);
          CREATE INDEX IF NOT EXISTS notifications_user_time_idx
            ON notifications(user_id, created_at);
          CREATE TABLE IF NOT EXISTS push_subscriptions (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            endpoint_hash TEXT NOT NULL,
            endpoint TEXT NOT NULL,
            p256dh TEXT NOT NULL,
            auth TEXT NOT NULL,
            user_agent TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            revoked_at TEXT,
            failure_reason TEXT
          );
          CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_user_endpoint_idx
            ON push_subscriptions(user_id, endpoint_hash);
          CREATE TABLE IF NOT EXISTS notification_deliveries (
            id TEXT PRIMARY KEY,
            notification_id TEXT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
            provider TEXT NOT NULL,
            subscription_id TEXT,
            status TEXT NOT NULL,
            failure_reason TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
          CREATE INDEX IF NOT EXISTS notification_deliveries_notification_idx
            ON notification_deliveries(notification_id, provider);
        `);
        this.db.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (7, 'notifications', ?)").run(nowIso());
      });
    }
    const v8 = this.db.prepare("SELECT version FROM schema_migrations WHERE version = 8").get();
    if (!v8) {
      this.transaction(() => {
        const addColumn = (table: string, column: string, definition: string) => {
          const exists = (this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).some((row) => row.name === column);
          if (!exists) this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
        };
        addColumn("notification_deliveries", "attempt_count", "attempt_count INTEGER NOT NULL DEFAULT 0");
        addColumn("notification_deliveries", "next_attempt_at", "next_attempt_at TEXT");
        addColumn("notification_deliveries", "payload_json", "payload_json TEXT");
        addColumn("notification_deliveries", "delivered_at", "delivered_at TEXT");
        addColumn("notification_deliveries", "locked_at", "locked_at TEXT");
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS telegram_connections (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            chat_id TEXT NOT NULL,
            telegram_username TEXT,
            status TEXT NOT NULL CHECK (status IN ('ACTIVE','REVOKED')),
            linked_at TEXT NOT NULL,
            revoked_at TEXT,
            last_delivery_at TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
          CREATE UNIQUE INDEX IF NOT EXISTS telegram_connections_user_active_idx
            ON telegram_connections(user_id)
            WHERE status = 'ACTIVE';
          CREATE UNIQUE INDEX IF NOT EXISTS telegram_connections_chat_active_idx
            ON telegram_connections(chat_id)
            WHERE status = 'ACTIVE';
          CREATE TABLE IF NOT EXISTS telegram_link_codes (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            code_hash TEXT NOT NULL UNIQUE,
            expires_at TEXT NOT NULL,
            used_at TEXT,
            created_at TEXT NOT NULL
          );
          CREATE INDEX IF NOT EXISTS telegram_link_codes_user_idx
            ON telegram_link_codes(user_id, created_at);
        `);
        this.db.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (8, 'telegram_notifications', ?)").run(nowIso());
      });
    }
    for (const definition of [
      "payload_json TEXT",
      "delivered_at TEXT",
      "locked_at TEXT",
    ]) {
      const columnName = definition.split(" ")[0];
      if (!(this.db.prepare("PRAGMA table_info(notification_deliveries)").all() as Array<{ name: string }>).some((row) => row.name === columnName)) {
        this.db.exec(`ALTER TABLE notification_deliveries ADD COLUMN ${definition}`);
      }
    }
    const v9 = this.db.prepare("SELECT version FROM schema_migrations WHERE version = 9").get();
    if (!v9) {
      this.transaction(() => {
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS engine_audit_log (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            symbol TEXT NOT NULL,
            analyzed_at TEXT NOT NULL,
            score INTEGER NOT NULL,
            score_contextual INTEGER NOT NULL,
            score_raw INTEGER NOT NULL,
            direction TEXT NOT NULL,
            decision TEXT NOT NULL,
            decision_state TEXT NOT NULL,
            trigger_stage TEXT NOT NULL,
            rr_status TEXT NOT NULL,
            trend_1h TEXT NOT NULL,
            trend_15m TEXT NOT NULL,
            filters_passed_json TEXT NOT NULL,
            filters_blocked_json TEXT NOT NULL,
            filters_penalty_json TEXT NOT NULL,
            blocked_reasons_json TEXT NOT NULL,
            quality_penalties_json TEXT NOT NULL,
            decisive_reason TEXT NOT NULL,
            missing_conditions_json TEXT NOT NULL,
            entry_price REAL,
            stop_price REAL,
            target1 REAL,
            target2 REAL,
            rr REAL,
            volume_relative REAL,
            engine_version TEXT NOT NULL,
            created_at TEXT NOT NULL
          );
          CREATE INDEX IF NOT EXISTS engine_audit_log_user_time_idx
            ON engine_audit_log(user_id, analyzed_at);
          CREATE INDEX IF NOT EXISTS engine_audit_log_symbol_idx
            ON engine_audit_log(user_id, symbol, analyzed_at);
        `);
        this.db.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (9, 'engine_audit_log', ?)").run(nowIso());
      });
    }
    const v10 = this.db.prepare("SELECT version FROM schema_migrations WHERE version = 10").get();
    if (!v10) {
      this.transaction(() => {
        const addColumn = (table: string, column: string, definition: string) => {
          const exists = (this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).some((row) => row.name === column);
          if (!exists) this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
        };
        const columns: Array<[string, string]> = [
          ["initial_risk_amount", "initial_risk_amount REAL"],
          ["max_price_since_entry", "max_price_since_entry REAL"],
          ["min_price_since_entry", "min_price_since_entry REAL"],
          ["max_unrealized_pnl_usdc", "max_unrealized_pnl_usdc REAL"],
          ["min_unrealized_pnl_usdc", "min_unrealized_pnl_usdc REAL"],
          ["max_unrealized_pnl_before_partial", "max_unrealized_pnl_before_partial REAL"],
          ["max_unrealized_pnl_after_partial", "max_unrealized_pnl_after_partial REAL"],
          ["mfe_usdc", "mfe_usdc REAL"],
          ["mae_usdc", "mae_usdc REAL"],
          ["mfe_r", "mfe_r REAL"],
          ["mae_r", "mae_r REAL"],
          ["peak_giveback_usdc", "peak_giveback_usdc REAL"],
          ["open_giveback_usdc", "open_giveback_usdc REAL"],
          ["total_giveback_usdc", "total_giveback_usdc REAL"],
          ["peak_giveback_pct", "peak_giveback_pct REAL"],
          ["last_management_update_at", "last_management_update_at TEXT"],
          ["management_timeline_json", "management_timeline_json TEXT"],
        ];
        for (const [column, definition] of columns) {
          addColumn("demo_positions", column, definition);
          addColumn("demo_trades", column, definition);
        }
        this.db.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (10, 'demo_trade_observability', ?)").run(nowIso());
      });
    }
    const v11 = this.db.prepare("SELECT version FROM schema_migrations WHERE version = 11").get();
    if (!v11) {
      this.transaction(() => {
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS demo_loss_streak_diagnostics (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at TEXT NOT NULL,
            loss_count INTEGER NOT NULL,
            cooldown_started_at TEXT,
            cooldown_ends_at TEXT,
            cooldown_minutes INTEGER NOT NULL,
            trigger_trade_id TEXT NOT NULL,
            trades_json TEXT NOT NULL,
            patterns_json TEXT NOT NULL,
            summary TEXT NOT NULL,
            status TEXT NOT NULL CHECK (status IN ('ACTIVE','COMPLETED')),
            updated_at TEXT NOT NULL
          );
          CREATE UNIQUE INDEX IF NOT EXISTS demo_loss_streak_trigger_idx
            ON demo_loss_streak_diagnostics(user_id, trigger_trade_id);
          CREATE INDEX IF NOT EXISTS demo_loss_streak_user_status_idx
            ON demo_loss_streak_diagnostics(user_id, status, cooldown_ends_at);
        `);
        this.db.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (11, 'demo_loss_streak_diagnostics', ?)").run(nowIso());
      });
    }
    const v12 = this.db.prepare("SELECT version FROM schema_migrations WHERE version = 12").get();
    if (!v12) {
      this.transaction(() => {
        const addColumn = (column: string, definition: string) => {
          const exists = (this.db.prepare("PRAGMA table_info(engine_audit_log)").all() as Array<{ name: string }>).some((row) => row.name === column);
          if (!exists) this.db.exec(`ALTER TABLE engine_audit_log ADD COLUMN ${definition}`);
        };
        const columns: Array<[string, string]> = [
          ["regime", "regime TEXT"],
          ["regime_confidence", "regime_confidence REAL"],
          ["selected_strategy", "selected_strategy TEXT"],
          ["strategy_score", "strategy_score REAL"],
          ["ema200_distance_pct_signed", "ema200_distance_pct_signed REAL"],
          ["ema200_distance_atr", "ema200_distance_atr REAL"],
          ["stretched_evidence_json", "stretched_evidence_json TEXT"],
          ["chaotic_evidence_json", "chaotic_evidence_json TEXT"],
          ["last_trade_direction", "last_trade_direction TEXT"],
          ["last_trade_exit_reason", "last_trade_exit_reason TEXT"],
          ["last_trade_target1_hit", "last_trade_target1_hit INTEGER"],
          ["last_trade_target2_hit", "last_trade_target2_hit INTEGER"],
          ["market_reorganized", "market_reorganized INTEGER"],
          ["reorganization_reasons_json", "reorganization_reasons_json TEXT"],
          ["momentum_conditions_passed_json", "momentum_conditions_passed_json TEXT"],
          ["momentum_conditions_missing_json", "momentum_conditions_missing_json TEXT"],
        ];
        for (const [column, definition] of columns) addColumn(column, definition);
        this.db.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (12, 'adaptive_engine_audit_fields', ?)").run(nowIso());
      });
    }
    const v13 = this.db.prepare("SELECT version FROM schema_migrations WHERE version = 13").get();
    if (!v13) {
      this.transaction(() => {
        const addColumn = (table: string, column: string, definition: string) => {
          const exists = (this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).some((row) => row.name === column);
          if (!exists) this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
        };
        const columns: Array<[string, string]> = [
          ["trailing", "trailing INTEGER NOT NULL DEFAULT 0"],
          ["partial_trigger_r", "partial_trigger_r REAL"],
          ["trailing_trigger_r", "trailing_trigger_r REAL"],
        ];
        for (const [column, definition] of columns) {
          addColumn("demo_positions", column, definition);
          addColumn("demo_trades", column, definition);
        }
        this.db.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (13, 'demo_risk_based_management', ?)").run(nowIso());
      });
    }
  }

  private applyInitialAdminEnv(): void {
    const initialPassword = process.env["ORACULO_INITIAL_ADMIN_PASSWORD"] ?? process.env["ORACULO_ADMIN_PASSWORD"];
    if (!initialPassword || initialPassword.length < 12) return;
    const initialUsername = (process.env["ORACULO_INITIAL_ADMIN_USERNAME"] ?? "admin").trim().toLowerCase();
    const initialName = process.env["ORACULO_INITIAL_ADMIN_NAME"] ?? "Administrador";
    const password = hashPassword(initialPassword);
    const now = nowIso();
    this.db.prepare(`
      INSERT INTO users
        (id, name, username, password_hash, password_salt, scrypt_n, scrypt_r, scrypt_p, scrypt_key_len, role, active, created_at, updated_at)
      VALUES ('admin', ?, ?, ?, ?, ?, ?, ?, ?, 'admin', 1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        username = excluded.username,
        password_hash = excluded.password_hash,
        password_salt = excluded.password_salt,
        scrypt_n = excluded.scrypt_n,
        scrypt_r = excluded.scrypt_r,
        scrypt_p = excluded.scrypt_p,
        scrypt_key_len = excluded.scrypt_key_len,
        role = 'admin',
        active = 1,
        updated_at = excluded.updated_at
    `).run(
      initialName,
      initialUsername,
      password.password_hash,
      password.password_salt,
      password.scrypt_n,
      password.scrypt_r,
      password.scrypt_p,
      password.scrypt_key_len,
      now,
      now,
    );
    this.ensureUserAccount("admin");
  }

  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  private getPasswordRow(username: string): (Record<string, unknown> & PasswordRecord) | undefined {
    return this.db.prepare("SELECT * FROM users WHERE username = ?").get(username) as (Record<string, unknown> & PasswordRecord) | undefined;
  }

  private bruteForceLocked(username: string): boolean {
    const row = this.db.prepare("SELECT locked_until FROM auth_attempts WHERE identity = ?").get(username) as Record<string, unknown> | undefined;
    return row?.locked_until != null && Number(row.locked_until) > Date.now();
  }

  private recordAuthFailure(username: string): void {
    const maxAttempts = envInt("ORACULO_AUTH_MAX_ATTEMPTS", DEFAULT_BRUTE_FORCE_MAX_ATTEMPTS, 2, 50);
    const lockMs = envInt("ORACULO_AUTH_LOCK_MS", DEFAULT_BRUTE_FORCE_LOCK_MS, 60_000, 24 * 60 * 60 * 1000);
    const now = Date.now();
    const row = this.db.prepare("SELECT attempts FROM auth_attempts WHERE identity = ?").get(username) as Record<string, unknown> | undefined;
    const attempts = (Number(row?.attempts ?? 0) || 0) + 1;
    const lockedUntil = attempts >= maxAttempts ? now + lockMs : null;
    this.db.prepare(`
      INSERT INTO auth_attempts (identity, attempts, last_attempt_at, locked_until)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(identity) DO UPDATE SET
        attempts = excluded.attempts,
        last_attempt_at = excluded.last_attempt_at,
        locked_until = excluded.locked_until
    `).run(username, attempts, now, lockedUntil);
  }

  private clearAuthFailures(username: string): void {
    this.db.prepare("DELETE FROM auth_attempts WHERE identity = ?").run(username);
  }

  authenticate(body: unknown, meta: { userAgent?: string; ip?: string } = {}) {
    const input = body as Record<string, unknown>;
    const username = normalizeUsername(input.username ?? process.env["ORACULO_INITIAL_ADMIN_USERNAME"] ?? "admin");
    const password = nonEmptyString(input.password, "password", 1024);
    if (this.bruteForceLocked(username)) throw new HttpError(429, "Invalid credentials");

    const row = this.getPasswordRow(username);
    if (!row || !Boolean(row.active) || !verifyPassword(password, row)) {
      this.recordAuthFailure(username);
      throw new HttpError(401, "Invalid credentials");
    }

    const user = safeUserFromRow(row);
    const sessionId = newId("sess");
    const token = randomBytes(32).toString("base64url");
    const now = Date.now();
    const ttl = sessionTtlSeconds();
    this.transaction(() => {
      this.clearAuthFailures(username);
      this.db.prepare(`
        INSERT INTO auth_sessions (id, user_id, token_hash, created_at, expires_at, user_agent, ip)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(sessionId, user.id, hashSessionToken(token), now, now + ttl * 1000, meta.userAgent ?? null, meta.ip ?? null);
      this.db.prepare("UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?").run(nowIso(), nowIso(), user.id);
    });
    return { user: this.getUser(user.id) ?? user, cookieValue: `${sessionId}.${token}`, maxAge: ttl };
  }

  sessionUser(cookie: string | undefined): AuthUser | null {
    if (!cookie) return null;
    const [sessionId, token] = cookie.split(".");
    if (!sessionId || !token) return null;
    const row = this.db.prepare(`
      SELECT u.* , s.token_hash, s.expires_at, s.revoked_at
      FROM auth_sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.id = ?
    `).get(sessionId) as (Record<string, unknown> & { token_hash: string }) | undefined;
    if (!row || row.revoked_at != null || Number(row.expires_at) <= Date.now() || !Boolean(row.active)) return null;
    const actual = Buffer.from(String(row.token_hash));
    const expected = Buffer.from(hashSessionToken(token));
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    return safeUserFromRow(row);
  }

  logout(cookie: string | undefined): void {
    if (!cookie) return;
    const [sessionId, token] = cookie.split(".");
    if (!sessionId || !token) return;
    this.db.prepare("UPDATE auth_sessions SET revoked_at = ? WHERE id = ? AND token_hash = ? AND revoked_at IS NULL")
      .run(Date.now(), sessionId, hashSessionToken(token));
  }

  getUser(userId: string): AuthUser | null {
    const row = this.db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as Record<string, unknown> | undefined;
    return row ? safeUserFromRow(row) : null;
  }

  createUser(admin: AuthUser, body: unknown): AuthUser {
    if (admin.role !== "admin") throw new HttpError(403, "Admin required");
    const input = body as Record<string, unknown>;
    const username = normalizeUsername(input.username);
    const name = nonEmptyString(input.name ?? username, "name", 120);
    const role = input.role === "admin" ? "admin" : "user";
    const password = nonEmptyString(input.password, "password", 1024);
    if (password.length < 12) throw new HttpError(400, "password must have at least 12 characters");
    const hash = hashPassword(password);
    const id = newId("user");
    const now = nowIso();
    try {
      this.transaction(() => {
        this.db.prepare(`
          INSERT INTO users
            (id, name, username, password_hash, password_salt, scrypt_n, scrypt_r, scrypt_p, scrypt_key_len, role, active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        `).run(id, name, username, hash.password_hash, hash.password_salt, hash.scrypt_n, hash.scrypt_r, hash.scrypt_p, hash.scrypt_key_len, role, now, now);
        this.ensureUserAccount(id);
      });
    } catch (err) {
      if (String((err as Error).message).includes("UNIQUE")) throw new HttpError(409, "username already exists");
      throw err;
    }
    return this.getUser(id)!;
  }

  private ensureUserAccount(userId: string): void {
    const now = nowIso();
    const stats = makeDailyStats(DEFAULT_BALANCE);
    this.db.prepare(`
      INSERT OR IGNORE INTO demo_account (user_id, balance, configured_balance, daily_stats_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, DEFAULT_BALANCE, DEFAULT_BALANCE, JSON.stringify(stats), now, now);
  }

  getAutomationUsers(): Array<{ user: AuthUser; automation: { enabled: boolean; symbol: string } }> {
    const rows = this.db.prepare("SELECT * FROM users WHERE active = 1").all() as Record<string, unknown>[];
    return rows
      .map(safeUserFromRow)
      .map((user) => ({ user, automation: this.getAutomation(user.id) }))
      .filter((item) => item.automation.enabled);
  }

  getAccount(userId: string) {
    this.ensureUserAccount(userId);
    const row = this.db.prepare("SELECT * FROM demo_account WHERE user_id = ?").get(userId) as Record<string, unknown> | undefined;
    if (!row) throw new HttpError(500, "demo account is not initialized");
    return accountFromRow(row);
  }

  private accountWithCurrentSafetyLimit(userId: string): { balance: number; configuredBalance: number; dailyStats: DailyStats; safetyLimit: SafetyLimitState } {
    const account = this.getAccount(userId);
    const safetyLimit = resolveSafetyLimit(account.dailyStats, demoMaxDailyTrades(), this.resolveActiveLossStreakCooldown(userId));
    if (account.dailyStats.safetyLimited !== safetyLimit.limited) {
      const dailyStats = { ...account.dailyStats, safetyLimited: safetyLimit.limited };
      this.putAccount(userId, { balance: account.balance, configuredBalance: account.configuredBalance, dailyStats });
      return { ...account, dailyStats, safetyLimit };
    }
    return { ...account, safetyLimit };
  }

  getSession(userId: string): DemoSession {
    const positions = this.getPositions(userId);
    const activeTrade = positions[0] ?? null;
    const history = this.getTrades(userId);
    const unrealizedPnlUSDC = positions.reduce((sum, position) => {
      const lastPrice = this.getSetting<number | null>(userId, `demo.lastPrice.${position.pair}`, null);
      if (lastPrice === null || !Number.isFinite(lastPrice) || lastPrice <= 0) return sum;
      return sum + this.unrealizedFor(position, lastPrice);
    }, 0);
    const openPositionsRealizedPnlUSDC = positions.reduce((sum, position) => sum + (position.realizedPnlUSDC ?? 0), 0);
    const openPositionsPartialPnlUSDC = positions.reduce((sum, position) => sum + (position.partialPnlUSDC ?? 0), 0);
    const partialPnlUSDC = openPositionsPartialPnlUSDC +
      history.reduce((sum, trade) => sum + (trade.partialPnlUSDC ?? 0), 0);
    const realizedPnlUSDC = history.reduce((sum, trade) => sum + (trade.pnlUSDC ?? 0), 0) +
      openPositionsRealizedPnlUSDC;
    const openRiskUSDC = positions.reduce((sum, position) => sum + remainingOpenRisk(position), 0);
    const account = this.accountWithCurrentSafetyLimit(userId);
    return {
      balance: account.balance,
      configuredBalance: account.configuredBalance,
      dailyStats: account.dailyStats,
      safetyLimit: account.safetyLimit,
      settings: {
        maxDailyTrades: demoMaxDailyTrades(),
        lossStreakCooldownMinutes: demoLossStreakCooldownMinutes(),
      },
      activeTrade,
      history,
      realizedPnlUSDC,
      unrealizedPnlUSDC,
      partialPnlUSDC,
      openRiskUSDC,
      openPositionsCount: positions.length,
    };
  }

  getSetting<T>(userId: string, key: string, fallback: T): T {
    const row = this.db.prepare("SELECT value FROM app_settings WHERE user_id = ? AND key = ?").get(userId, key) as Record<string, unknown> | undefined;
    if (!row) return fallback;
    return jsonParse<T>(row.value, fallback);
  }

  setSetting(userId: string, key: string, value: unknown): void {
    this.db.prepare(`
      INSERT INTO app_settings (user_id, key, value, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(userId, key, JSON.stringify(value), nowIso());
  }

  getAutomation(userId: string) {
    return this.getSetting(userId, "demo.automation", { enabled: false, symbol: "BTCUSDT" });
  }

  private setReentryCooldown(userId: string, trade: DemoTrade, exitReason: ManagedTradeExitReason, nowMs: number): void {
    const reason = reentryCooldownReason(exitReason);
    if (!reason) return;
    const key = reentryCooldownSettingKey(trade.pair, trade.direction);
    const expiresAtMs = nowMs + reentryCooldownDurationMs(reason);
    const existing = this.getSetting<ReentryCooldownEntry | null>(userId, key, null);
    if (existing && Number.isFinite(existing.expiresAtMs) && existing.expiresAtMs >= expiresAtMs) return;
    this.setSetting(userId, key, {
      pair: trade.pair,
      direction: trade.direction,
      reason,
      expiresAt: new Date(expiresAtMs).toISOString(),
      expiresAtMs,
      createdAt: new Date(nowMs).toISOString(),
      createdAtMs: nowMs,
    });
  }

  private activeReentryCooldown(userId: string, pair: string, direction: TradeDirection, nowMs = Date.now()): (ReentryCooldownEntry & { remainingMs: number }) | null {
    const cooldown = this.getSetting<ReentryCooldownEntry | null>(userId, reentryCooldownSettingKey(pair, direction), null);
    if (!cooldown || !Number.isFinite(cooldown.expiresAtMs) || cooldown.expiresAtMs <= nowMs) return null;
    return { ...cooldown, remainingMs: cooldown.expiresAtMs - nowMs };
  }

  recordWorkerDiagnostic(input: WorkerDiagnosticInput): WorkerDiagnosticAdminDto {
    const now = nowIso();
    const maxHistory = envInt("ORACULO_WORKER_DIAGNOSTIC_LIMIT", 40, 5, 500);
    const summary = String(input.userPayload.summary ?? "Aguardando nova leitura do robo.");
    const quality = String(input.userPayload.quality ?? "indefinida");
    const id = newId("diag");
    return this.transaction(() => {
      this.db.prepare(`
        INSERT INTO worker_diagnostics
          (id, user_id, symbol, status, worker_active, automation_active, cycle_started_at, cycle_finished_at,
           cycle_duration_ms, latency_ms, decision, score, direction, quality, summary, next_cycle_at, last_error,
           engine_version, fingerprint, admin_json, user_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, symbol, fingerprint) DO UPDATE SET
          worker_active = excluded.worker_active,
          automation_active = excluded.automation_active,
          cycle_started_at = excluded.cycle_started_at,
          cycle_finished_at = excluded.cycle_finished_at,
          cycle_duration_ms = excluded.cycle_duration_ms,
          latency_ms = excluded.latency_ms,
          decision = excluded.decision,
          score = excluded.score,
          direction = excluded.direction,
          quality = excluded.quality,
          summary = excluded.summary,
          next_cycle_at = excluded.next_cycle_at,
          last_error = excluded.last_error,
          engine_version = excluded.engine_version,
          admin_json = excluded.admin_json,
          user_json = excluded.user_json,
          updated_at = excluded.updated_at
      `).run(
        id,
        input.userId,
        input.symbol,
        input.status,
        Number(input.workerActive),
        Number(input.automationActive),
        input.cycleStartedAt,
        input.cycleFinishedAt,
        input.cycleDurationMs,
        input.latencyMs,
        input.decision,
        input.score,
        input.direction,
        quality,
        summary,
        input.nextCycleAt,
        input.lastError,
        input.engineVersion,
        input.fingerprint,
        JSON.stringify(input.adminPayload),
        JSON.stringify(input.userPayload),
        now,
        now,
      );
      this.db.prepare(`
        DELETE FROM worker_diagnostics
        WHERE user_id = ?
          AND id NOT IN (
            SELECT id FROM worker_diagnostics
            WHERE user_id = ?
            ORDER BY cycle_finished_at DESC
            LIMIT ?
          )
      `).run(input.userId, input.userId, maxHistory);
      const row = this.db.prepare(`
        SELECT * FROM worker_diagnostics
        WHERE user_id = ? AND symbol = ? AND fingerprint = ?
      `).get(input.userId, input.symbol, input.fingerprint) as Record<string, unknown>;
      if (input.status === "BLOCKED") {
        this.createNotification(input.userId, {
          type: "entry_blocked_exhaustion",
          title: "Entrada bloqueada",
          message: `${input.symbol}: entrada bloqueada pelos filtros de risco/exaustao.`,
          severity: "warning",
          symbol: input.symbol,
          source: "DEMO",
          relatedEventId: input.fingerprint,
          idempotencyKey: `${input.userId}:entry_blocked:${input.symbol}:${input.fingerprint}`,
          adminMetadata: input.adminPayload,
        });
      } else if (input.status === "ERROR") {
        this.createNotification(input.userId, {
          type: "worker_error",
          title: "Erro do worker",
          message: `${input.symbol}: o ciclo do robo falhou.`,
          severity: "critical",
          symbol: input.symbol,
          source: "SYSTEM",
          relatedEventId: input.fingerprint,
          idempotencyKey: `${input.userId}:worker_error:${input.symbol}:${input.fingerprint}`,
          adminMetadata: { error: sanitizeFailure(input.lastError), engineVersion: input.engineVersion },
        });
      }
      return diagnosticAdminFromRow(row);
    });
  }

  getWorkerDiagnostics(user: AuthUser, limit = 10): { current: WorkerDiagnosticUserDto | WorkerDiagnosticAdminDto | null; history: Array<WorkerDiagnosticUserDto | WorkerDiagnosticAdminDto> } {
    const safeLimit = Math.max(1, Math.min(50, Math.floor(limit)));
    const rows = this.db.prepare(`
      SELECT * FROM worker_diagnostics
      WHERE user_id = ?
      ORDER BY cycle_finished_at DESC
      LIMIT ?
    `).all(user.id, safeLimit) as Record<string, unknown>[];
    const mapper = user.role === "admin" ? diagnosticAdminFromRow : diagnosticUserFromRow;
    const history = rows.map(mapper);
    return { current: history[0] ?? null, history };
  }

  recordEngineAudit(input: EngineAuditInput): void {
    const now = nowIso();
    const maxAudit = envInt("ORACULO_AUDIT_LIMIT", 500, 50, 5000);
    const id = newId("audit");
    this.transaction(() => {
      this.db.prepare(`
        INSERT INTO engine_audit_log
          (id, user_id, symbol, analyzed_at, score, score_contextual, score_raw,
           direction, decision, decision_state, trigger_stage, rr_status,
           trend_1h, trend_15m,
           filters_passed_json, filters_blocked_json, filters_penalty_json,
           blocked_reasons_json, quality_penalties_json,
           decisive_reason, missing_conditions_json,
           entry_price, stop_price, target1, target2, rr, volume_relative,
           engine_version, regime, regime_confidence, selected_strategy, strategy_score,
           ema200_distance_pct_signed, ema200_distance_atr,
           stretched_evidence_json, chaotic_evidence_json,
           last_trade_direction, last_trade_exit_reason, last_trade_target1_hit, last_trade_target2_hit,
           market_reorganized, reorganization_reasons_json,
           momentum_conditions_passed_json, momentum_conditions_missing_json,
           created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        input.userId,
        input.symbol,
        input.analyzedAt,
        input.score,
        input.scoreContextual,
        input.scoreRaw,
        input.direction,
        input.decision,
        input.decisionState,
        input.triggerStage,
        input.rrStatus,
        input.trend1h,
        input.trend15m,
        JSON.stringify(input.filtersPassed),
        JSON.stringify(input.filtersBlocked),
        JSON.stringify(input.filtersPenalty),
        JSON.stringify(input.blockedReasons),
        JSON.stringify(input.qualityPenalties),
        input.decisiveReason,
        JSON.stringify(input.missingConditions),
        input.entryPrice,
        input.stopPrice,
        input.target1,
        input.target2,
        input.rr,
        input.volumeRelative,
        input.engineVersion,
        input.regime ?? null,
        input.regimeConfidence ?? null,
        input.selectedStrategy ?? null,
        input.strategyScore ?? null,
        input.ema200DistancePctSigned ?? null,
        input.ema200DistanceAtr ?? null,
        JSON.stringify(input.stretchedEvidence ?? null),
        JSON.stringify(input.chaoticEvidence ?? null),
        input.lastTradeDirection ?? null,
        input.lastTradeExitReason ?? null,
        input.lastTradeTarget1Hit == null ? null : Number(input.lastTradeTarget1Hit),
        input.lastTradeTarget2Hit == null ? null : Number(input.lastTradeTarget2Hit),
        input.marketReorganized == null ? null : Number(input.marketReorganized),
        JSON.stringify(input.reorganizationReasons ?? []),
        JSON.stringify(input.momentumConditionsPassed ?? []),
        JSON.stringify(input.momentumConditionsMissing ?? []),
        now,
      );
      this.db.prepare(`
        DELETE FROM engine_audit_log
        WHERE user_id = ?
          AND id NOT IN (
            SELECT id FROM engine_audit_log
            WHERE user_id = ?
            ORDER BY analyzed_at DESC
            LIMIT ?
          )
      `).run(input.userId, input.userId, maxAudit);
    });
  }

  private completeExpiredLossStreakCooldowns(userId: string, nowMs = Date.now()): void {
    const rows = this.db.prepare(`
      SELECT id, cooldown_ends_at
      FROM demo_loss_streak_diagnostics
      WHERE user_id = ? AND status = 'ACTIVE' AND cooldown_ends_at IS NOT NULL
    `).all(userId) as Record<string, unknown>[];
    const expired = rows
      .filter((row) => {
        const endsAt = Date.parse(String(row.cooldown_ends_at));
        return Number.isFinite(endsAt) && endsAt <= nowMs;
      })
      .map((row) => String(row.id));
    if (expired.length === 0) return;
    const now = nowIso();
    for (const id of expired) {
      this.db.prepare("UPDATE demo_loss_streak_diagnostics SET status = 'COMPLETED', updated_at = ? WHERE user_id = ? AND id = ?")
        .run(now, userId, id);
    }
  }

  private resolveActiveLossStreakCooldown(userId: string, nowMs = Date.now()): SafetyLimitState | null {
    const effectiveMinutes = demoLossStreakCooldownMinutes();
    if (effectiveMinutes <= 0) return null;
    this.completeExpiredLossStreakCooldowns(userId, nowMs);
    const row = this.db.prepare(`
      SELECT * FROM demo_loss_streak_diagnostics
      WHERE user_id = ? AND status = 'ACTIVE' AND cooldown_ends_at IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 1
    `).get(userId) as Record<string, unknown> | undefined;
    if (!row) return null;
    const diagnostic = lossStreakDiagnosticFromRow(row);
    const endsMs = diagnostic.cooldownEndsAt ? Date.parse(diagnostic.cooldownEndsAt) : NaN;
    if (!Number.isFinite(endsMs) || endsMs <= nowMs) {
      this.completeExpiredLossStreakCooldowns(userId, nowMs);
      return null;
    }
    const remainingMs = Number.isFinite(endsMs) ? Math.max(0, endsMs - nowMs) : null;
    const remainingMinutes = remainingMs === null ? null : Math.max(1, Math.ceil(remainingMs / 60_000));
    return {
      limited: true,
      code: "LOSS_STREAK_COOLDOWN",
      reason: `Pausa temporaria apos 3 perdas consecutivas. Retorno automatico em ${remainingMinutes ?? diagnostic.cooldownMinutes} minutos.`,
      cooldownEndsAt: diagnostic.cooldownEndsAt,
      cooldownRemainingMs: remainingMs,
      analysisContinues: true,
    };
  }

  getLossStreakDiagnostics(userId: string, limit = 10): LossStreakDiagnostic[] {
    this.completeExpiredLossStreakCooldowns(userId);
    const safeLimit = Math.max(1, Math.min(50, Math.floor(limit)));
    return (this.db.prepare(`
      SELECT * FROM demo_loss_streak_diagnostics
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(userId, safeLimit) as Record<string, unknown>[]).map(lossStreakDiagnosticFromRow);
  }

  private uniqueEngineAuditForTrade(userId: string, trade: DemoTrade): Record<string, unknown> | null {
    const openAt = Number.isFinite(trade.openTime) ? trade.openTime : 0;
    if (openAt <= 0) return null;
    const from = new Date(openAt - 15 * 60_000).toISOString();
    const to = new Date(openAt + 15 * 60_000).toISOString();
    const rows = this.db.prepare(`
      SELECT * FROM engine_audit_log
      WHERE user_id = ? AND symbol = ? AND analyzed_at BETWEEN ? AND ?
      ORDER BY ABS(strftime('%s', analyzed_at) - ?) ASC
      LIMIT 2
    `).all(userId, trade.pair, from, to, Math.floor(openAt / 1000)) as Record<string, unknown>[];
    return rows.length === 1 ? rows[0] : null;
  }

  private lossStreakTradeSnapshot(userId: string, trade: DemoTrade): LossStreakDiagnosticTrade {
    const audit = this.uniqueEngineAuditForTrade(userId, trade);
    const durationMs = trade.closeTime === undefined ? null : tradeAgeMs(trade, trade.closeTime);
    return {
      id: trade.id,
      pair: trade.pair,
      direction: trade.direction,
      exitReason: trade.exitReason ?? null,
      durationMs,
      pnlUSDC: trade.pnlUSDC ?? null,
      mfeUSDC: trade.mfeUSDC ?? null,
      maeUSDC: trade.maeUSDC ?? null,
      mfeR: trade.mfeR ?? null,
      maeR: trade.maeR ?? null,
      peakGivebackUSDC: trade.peakGivebackUSDC ?? null,
      peakGivebackPct: trade.peakGivebackPct ?? null,
      target1Hit: trade.target1Hit,
      breakeven: trade.isBreakevenStop,
      trailing: safeManagementTimeline(trade.managementTimeline ?? []).some((event) => event.type === "TRAILING_ACTIVATED" || event.type === "TRAILING_UPDATED"),
      wasPositiveBeforeLoss: trade.mfeUSDC == null ? null : trade.mfeUSDC > 0,
      score: audit ? Number(audit.score) : null,
      volumeRelative: audit && audit.volume_relative != null ? Number(audit.volume_relative) : null,
      trend1h: audit ? String(audit.trend_1h) : null,
      trend15m: audit ? String(audit.trend_15m) : null,
      decisiveReason: audit ? String(audit.decisive_reason) : null,
    };
  }

  private buildLossStreakPatterns(trades: LossStreakDiagnosticTrade[]): LossStreakDiagnosticPattern[] {
    const countBy = (values: Array<string | null>): Record<string, number> => {
      const out: Record<string, number> = {};
      for (const value of values) {
        const key = value ?? "DESCONHECIDO";
        out[key] = (out[key] ?? 0) + 1;
      }
      return out;
    };
    const avg = (values: Array<number | null>): number => {
      const nums = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
      if (nums.length === 0) return 0;
      return nums.reduce((sum, value) => sum + value, 0) / nums.length;
    };
    const patterns: LossStreakDiagnosticPattern[] = [
      { name: "BUY", value: trades.filter((trade) => trade.direction === "BUY").length },
      { name: "SELL", value: trades.filter((trade) => trade.direction === "SELL").length },
      { name: "MFE_POSITIVO", value: trades.filter((trade) => (trade.mfeUSDC ?? 0) > 0).length },
      { name: "GIVEBACK_ACIMA_50_PCT", value: trades.filter((trade) => (trade.peakGivebackPct ?? 0) >= 50).length },
      { name: "GIVEBACK_ACIMA_70_PCT", value: trades.filter((trade) => (trade.peakGivebackPct ?? 0) >= 70).length },
      { name: "SEM_ALVO_1", value: trades.filter((trade) => !trade.target1Hit).length },
      { name: "MEDIA_MFE_USDC", value: Number(avg(trades.map((trade) => trade.mfeUSDC)).toFixed(4)) },
      { name: "MEDIA_MAE_USDC", value: Number(avg(trades.map((trade) => trade.maeUSDC)).toFixed(4)) },
      { name: "MEDIA_DURACAO_MS", value: Math.round(avg(trades.map((trade) => trade.durationMs))) },
      { name: "MEDIA_GIVEBACK_USDC", value: Number(avg(trades.map((trade) => trade.peakGivebackUSDC)).toFixed(4)) },
    ];
    const bySymbol = countBy(trades.map((trade) => trade.pair));
    const byExit = countBy(trades.map((trade) => trade.exitReason));
    for (const [symbol, count] of Object.entries(bySymbol)) patterns.push({ name: `ATIVO_${symbol}`, value: count });
    for (const [reason, count] of Object.entries(byExit)) patterns.push({ name: `SAIDA_${reason}`, value: count });
    return patterns;
  }

  private lossStreakSummary(trades: LossStreakDiagnosticTrade[], patterns: LossStreakDiagnosticPattern[]): string {
    const get = (name: string): number => {
      const value = patterns.find((pattern) => pattern.name === name)?.value;
      return typeof value === "number" ? value : 0;
    };
    const parts = [
      `${trades.length} perdas consecutivas`,
      `${get("BUY")} BUY`,
      `${get("SELL")} SELL`,
      `${get("MFE_POSITIVO")} ficaram positivas antes de perder`,
      `${get("GIVEBACK_ACIMA_70_PCT")} tiveram giveback acima de 70%`,
      `${get("SEM_ALVO_1")} encerradas antes do Alvo 1`,
    ];
    return `${parts.join("; ")}.`;
  }

  private maybeCreateLossStreakDiagnostic(userId: string, beforeConsecutiveLosses: number, afterConsecutiveLosses: number, triggerTrade: DemoTrade): void {
    if (triggerTrade.status !== "LOSS" || beforeConsecutiveLosses >= 3 || afterConsecutiveLosses < 3) return;
    const existing = this.db.prepare("SELECT id FROM demo_loss_streak_diagnostics WHERE user_id = ? AND trigger_trade_id = ?").get(userId, triggerTrade.id);
    if (existing) return;
    const losses = this.getTrades(userId).filter((trade) => trade.status === "LOSS").slice(0, 3);
    if (losses.length < 3 || losses[0]?.id !== triggerTrade.id) return;
    const trades = losses.map((trade) => this.lossStreakTradeSnapshot(userId, trade));
    const patterns = this.buildLossStreakPatterns(trades);
    const summary = this.lossStreakSummary(trades, patterns);
    const minutes = demoLossStreakCooldownMinutes();
    const createdAt = nowIso();
    const cooldownEndsAt = minutes > 0 ? new Date(Date.parse(createdAt) + minutes * 60_000).toISOString() : null;
    const status: LossStreakDiagnosticStatus = minutes > 0 ? "ACTIVE" : "COMPLETED";
    this.db.prepare(`
      INSERT OR IGNORE INTO demo_loss_streak_diagnostics
        (id, user_id, created_at, loss_count, cooldown_started_at, cooldown_ends_at, cooldown_minutes,
         trigger_trade_id, trades_json, patterns_json, summary, status, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      newId("lossdiag"),
      userId,
      createdAt,
      trades.length,
      minutes > 0 ? createdAt : null,
      cooldownEndsAt,
      minutes,
      triggerTrade.id,
      JSON.stringify(trades),
      JSON.stringify(patterns),
      summary,
      status,
      createdAt,
    );
  }

  getEngineAuditLog(user: AuthUser, params: { symbol?: string; limit?: number; offset?: number } = {}): EngineAuditResponse {
    if (user.role !== "admin") throw new HttpError(403, "Admin required");
    const safeLimit = Math.max(1, Math.min(200, Math.floor(params.limit ?? 50)));
    const safeOffset = Math.max(0, Math.floor(params.offset ?? 0));
    const symbol = params.symbol ?? null;
    const rows = symbol
      ? (this.db.prepare(`
          SELECT * FROM engine_audit_log
          WHERE user_id = ? AND symbol = ?
          ORDER BY analyzed_at DESC
          LIMIT ? OFFSET ?
        `).all(user.id, symbol, safeLimit, safeOffset) as Record<string, unknown>[])
      : (this.db.prepare(`
          SELECT * FROM engine_audit_log
          WHERE user_id = ?
          ORDER BY analyzed_at DESC
          LIMIT ? OFFSET ?
        `).all(user.id, safeLimit, safeOffset) as Record<string, unknown>[]);
    const totalRow = symbol
      ? (this.db.prepare("SELECT COUNT(*) AS cnt FROM engine_audit_log WHERE user_id = ? AND symbol = ?").get(user.id, symbol) as Record<string, unknown>)
      : (this.db.prepare("SELECT COUNT(*) AS cnt FROM engine_audit_log WHERE user_id = ?").get(user.id) as Record<string, unknown>);
    const total = Number(totalRow?.cnt ?? 0);
    const entries: EngineAuditEntry[] = rows.map((row) => ({
      id: String(row.id),
      userId: String(row.user_id),
      symbol: String(row.symbol),
      analyzedAt: String(row.analyzed_at),
      score: Number(row.score),
      scoreContextual: Number(row.score_contextual),
      scoreRaw: Number(row.score_raw),
      direction: String(row.direction),
      decision: String(row.decision),
      decisionState: String(row.decision_state),
      triggerStage: String(row.trigger_stage),
      rrStatus: String(row.rr_status),
      trend1h: String(row.trend_1h),
      trend15m: String(row.trend_15m),
      filtersPassed: jsonParse<string[]>(String(row.filters_passed_json), []),
      filtersBlocked: jsonParse<EngineAuditFilterRecord[]>(String(row.filters_blocked_json), []),
      filtersPenalty: jsonParse<EngineAuditFilterRecord[]>(String(row.filters_penalty_json), []),
      blockedReasons: jsonParse<string[]>(String(row.blocked_reasons_json), []),
      qualityPenalties: jsonParse<string[]>(String(row.quality_penalties_json), []),
      decisiveReason: String(row.decisive_reason),
      missingConditions: jsonParse<string[]>(String(row.missing_conditions_json), []),
      entryPrice: row.entry_price == null ? null : Number(row.entry_price),
      stopPrice: row.stop_price == null ? null : Number(row.stop_price),
      target1: row.target1 == null ? null : Number(row.target1),
      target2: row.target2 == null ? null : Number(row.target2),
      rr: row.rr == null ? null : Number(row.rr),
      volumeRelative: row.volume_relative == null ? null : Number(row.volume_relative),
      engineVersion: String(row.engine_version),
      regime: row.regime == null ? null : String(row.regime),
      regimeConfidence: row.regime_confidence == null ? null : Number(row.regime_confidence),
      selectedStrategy: row.selected_strategy == null ? null : String(row.selected_strategy),
      strategyScore: row.strategy_score == null ? null : Number(row.strategy_score),
      ema200DistancePctSigned: row.ema200_distance_pct_signed == null ? null : Number(row.ema200_distance_pct_signed),
      ema200DistanceAtr: row.ema200_distance_atr == null ? null : Number(row.ema200_distance_atr),
      stretchedEvidence: row.stretched_evidence_json == null ? null : jsonParse<Record<string, unknown>>(String(row.stretched_evidence_json), {}),
      chaoticEvidence: row.chaotic_evidence_json == null ? null : jsonParse<Record<string, unknown>>(String(row.chaotic_evidence_json), {}),
      lastTradeDirection: row.last_trade_direction == null ? null : String(row.last_trade_direction),
      lastTradeExitReason: row.last_trade_exit_reason == null ? null : String(row.last_trade_exit_reason),
      lastTradeTarget1Hit: row.last_trade_target1_hit == null ? null : Boolean(row.last_trade_target1_hit),
      lastTradeTarget2Hit: row.last_trade_target2_hit == null ? null : Boolean(row.last_trade_target2_hit),
      marketReorganized: row.market_reorganized == null ? null : Boolean(row.market_reorganized),
      reorganizationReasons: jsonParse<string[]>(String(row.reorganization_reasons_json ?? "[]"), []),
      momentumConditionsPassed: jsonParse<string[]>(String(row.momentum_conditions_passed_json ?? "[]"), []),
      momentumConditionsMissing: jsonParse<string[]>(String(row.momentum_conditions_missing_json ?? "[]"), []),
      createdAt: String(row.created_at),
    }));
    return { entries, total, limit: safeLimit, offset: safeOffset };
  }

  getEngineAuditSummary(user: AuthUser, params: { symbol?: string; period?: string } = {}): EngineAuditSummaryResponse {
    if (user.role !== "admin") throw new HttpError(403, "Admin required");

    const validPeriods: Record<string, number> = {
      "1h": 1,
      "6h": 6,
      "24h": 24,
      "7d": 168,
    };

    const periodKey = params.period && validPeriods[params.period] ? params.period : "24h";
    const hours = validPeriods[periodKey]!;
    const cutoffIso = new Date(Date.now() - hours * 3600 * 1000).toISOString();
    const symbol = params.symbol?.trim() || null;

    const whereClauses: string[] = ["user_id = ?", "analyzed_at >= ?"];
    const sqlArgs: (string | number | null)[] = [user.id, cutoffIso];

    if (symbol !== null) {
      whereClauses.push("symbol = ?");
      sqlArgs.push(symbol);
    }

    const whereSql = "WHERE " + whereClauses.join(" AND ");

    // Max 10,000 safety limit to protect VPS memory & CPU
    const rows = this.db.prepare(`
      SELECT score, decision, decision_state, decisive_reason, blocked_reasons_json, missing_conditions_json, symbol
      FROM engine_audit_log
      ${whereSql}
      ORDER BY analyzed_at DESC
      LIMIT 10000
    `).all(...sqlArgs) as Record<string, unknown>[];

    const total = rows.length;

    if (total === 0) {
      return {
        period: periodKey,
        symbol,
        total: 0,
        avgScore: null,
        maxScore: null,
        byDecision: {},
        byState: {},
        topDecisiveReasons: [],
        topBlockedReasons: [],
        topMissingConditions: [],
        topBlockCombinations: [],
        bySymbol: {},
      };
    }

    let scoreSum = 0;
    let maxScore = -Infinity;

    const decisionCounts: Record<string, number> = {};
    const stateCounts: Record<string, number> = {};
    const decisiveReasonCounts: Record<string, number> = {};
    const blockedReasonCounts: Record<string, number> = {};
    const missingConditionCounts: Record<string, number> = {};
    const blockCombinationCounts: Record<string, number> = {};

    const symbolMap: Record<string, {
      total: number;
      scoreSum: number;
      maxScore: number;
      decisionCounts: Record<string, number>;
      stateCounts: Record<string, number>;
    }> = {};

    for (const r of rows) {
      const score = Number(r.score ?? 0);
      scoreSum += score;
      if (score > maxScore) maxScore = score;

      const dec = String(r.decision ?? "SEM ENTRADA");
      decisionCounts[dec] = (decisionCounts[dec] ?? 0) + 1;

      const st = String(r.decision_state ?? "DESCONHECIDO");
      stateCounts[st] = (stateCounts[st] ?? 0) + 1;

      const decReason = String(r.decisive_reason ?? "").trim();
      if (decReason) {
        decisiveReasonCounts[decReason] = (decisiveReasonCounts[decReason] ?? 0) + 1;
      }

      const blockedList = jsonParse<string[]>(String(r.blocked_reasons_json ?? "[]"), []);
      for (const br of blockedList) {
        if (br) blockedReasonCounts[br] = (blockedReasonCounts[br] ?? 0) + 1;
      }

      const missingList = jsonParse<string[]>(String(r.missing_conditions_json ?? "[]"), []);
      for (const mc of missingList) {
        if (mc) missingConditionCounts[mc] = (missingConditionCounts[mc] ?? 0) + 1;
      }

      if (blockedList.length > 0) {
        const sortedCombo = [...blockedList].sort().join(" + ");
        blockCombinationCounts[sortedCombo] = (blockCombinationCounts[sortedCombo] ?? 0) + 1;
      }

      const sym = String(r.symbol);
      if (!symbolMap[sym]) {
        symbolMap[sym] = { total: 0, scoreSum: 0, maxScore: -Infinity, decisionCounts: {}, stateCounts: {} };
      }
      const sObj = symbolMap[sym];
      sObj.total += 1;
      sObj.scoreSum += score;
      if (score > sObj.maxScore) sObj.maxScore = score;
      sObj.decisionCounts[dec] = (sObj.decisionCounts[dec] ?? 0) + 1;
      sObj.stateCounts[st] = (sObj.stateCounts[st] ?? 0) + 1;
    }

    const avgScore = Number((scoreSum / total).toFixed(1));

    const calcMap = (map: Record<string, number>, baseTotal: number) => {
      const res: Record<string, { count: number; pct: number }> = {};
      for (const [k, count] of Object.entries(map)) {
        res[k] = {
          count,
          pct: Number(((count / baseTotal) * 100).toFixed(1)),
        };
      }
      return res;
    };

    const calcRank = (map: Record<string, number>, baseTotal: number, maxItems = 5): EngineAuditRankItem[] => {
      return Object.entries(map)
        .map(([name, count]) => ({
          name,
          count,
          pct: Number(((count / baseTotal) * 100).toFixed(1)),
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, maxItems);
    };

    const byDecision = calcMap(decisionCounts, total);
    const byState = calcMap(stateCounts, total);
    const topDecisiveReasons = calcRank(decisiveReasonCounts, total, 5);
    const topBlockedReasons = calcRank(blockedReasonCounts, total, 5);
    const topMissingConditions = calcRank(missingConditionCounts, total, 5);
    const topBlockCombinations = calcRank(blockCombinationCounts, total, 5);

    const bySymbol: Record<string, EngineAuditSymbolSummary> = {};
    for (const [sym, sObj] of Object.entries(symbolMap)) {
      bySymbol[sym] = {
        symbol: sym,
        total: sObj.total,
        avgScore: Number((sObj.scoreSum / sObj.total).toFixed(1)),
        maxScore: sObj.maxScore === -Infinity ? null : sObj.maxScore,
        byDecision: calcMap(sObj.decisionCounts, sObj.total),
        byState: calcMap(sObj.stateCounts, sObj.total),
      };
    }

    return {
      period: periodKey,
      symbol,
      total,
      avgScore,
      maxScore: maxScore === -Infinity ? null : maxScore,
      byDecision,
      byState,
      topDecisiveReasons,
      topBlockedReasons,
      topMissingConditions,
      topBlockCombinations,
      bySymbol,
    };
  }


  exportEngineAuditLog(user: AuthUser, params: EngineAuditExportParams = {}): EngineAuditExportResponse {
    if (user.role !== "admin") throw new HttpError(403, "Admin required");

    const safeLimit = Math.max(1, Math.min(5000, Math.floor(params.limit ?? 1000)));
    const hours = params.hours && params.hours > 0 ? params.hours : null;
    const symbol = params.symbol?.trim() || null;
    const decision = params.decision?.trim() || null;
    const state = params.state?.trim() || null;

    const whereClauses: string[] = ["user_id = ?"];
    const sqlArgs: (string | number | null)[] = [user.id];

    if (hours !== null) {
      const cutoffIso = new Date(Date.now() - hours * 3600 * 1000).toISOString();
      whereClauses.push("analyzed_at >= ?");
      sqlArgs.push(cutoffIso);
    }
    if (symbol !== null) {
      whereClauses.push("symbol = ?");
      sqlArgs.push(symbol);
    }
    if (decision !== null) {
      whereClauses.push("decision = ?");
      sqlArgs.push(decision);
    }
    if (state !== null) {
      whereClauses.push("decision_state = ?");
      sqlArgs.push(state);
    }

    const whereSql = "WHERE " + whereClauses.join(" AND ");

    const rows = this.db.prepare(`
      SELECT * FROM engine_audit_log
      ${whereSql}
      ORDER BY analyzed_at DESC
      LIMIT ?
    `).all(...sqlArgs, safeLimit) as Record<string, unknown>[];

    const byDecisionRows = this.db.prepare(
      `SELECT decision, COUNT(*) as cnt FROM engine_audit_log ${whereSql} GROUP BY decision`
    ).all(...sqlArgs) as Record<string, unknown>[];

    const byStateRows = this.db.prepare(
      `SELECT decision_state, COUNT(*) as cnt FROM engine_audit_log ${whereSql} GROUP BY decision_state`
    ).all(...sqlArgs) as Record<string, unknown>[];

    const totalRow = this.db.prepare(
      `SELECT COUNT(*) AS cnt FROM engine_audit_log ${whereSql}`
    ).get(...sqlArgs) as Record<string, unknown>;

    const byDecision: Record<string, number> = {};
    for (const r of byDecisionRows) byDecision[String(r.decision)] = Number(r.cnt);

    const byState: Record<string, number> = {};
    for (const r of byStateRows) byState[String(r.decision_state)] = Number(r.cnt);

    const total = Number(totalRow?.cnt ?? 0);

    const entries: EngineAuditEntry[] = rows.map((row) => ({
      id: String(row.id),
      userId: String(row.user_id),
      symbol: String(row.symbol),
      analyzedAt: String(row.analyzed_at),
      score: Number(row.score),
      scoreContextual: Number(row.score_contextual),
      scoreRaw: Number(row.score_raw),
      direction: String(row.direction),
      decision: String(row.decision),
      decisionState: String(row.decision_state),
      triggerStage: String(row.trigger_stage),
      rrStatus: String(row.rr_status),
      trend1h: String(row.trend_1h),
      trend15m: String(row.trend_15m),
      filtersPassed: jsonParse<string[]>(String(row.filters_passed_json), []),
      filtersBlocked: jsonParse<EngineAuditFilterRecord[]>(String(row.filters_blocked_json), []),
      filtersPenalty: jsonParse<EngineAuditFilterRecord[]>(String(row.filters_penalty_json), []),
      blockedReasons: jsonParse<string[]>(String(row.blocked_reasons_json), []),
      qualityPenalties: jsonParse<string[]>(String(row.quality_penalties_json), []),
      decisiveReason: String(row.decisive_reason),
      missingConditions: jsonParse<string[]>(String(row.missing_conditions_json), []),
      entryPrice: row.entry_price == null ? null : Number(row.entry_price),
      stopPrice: row.stop_price == null ? null : Number(row.stop_price),
      target1: row.target1 == null ? null : Number(row.target1),
      target2: row.target2 == null ? null : Number(row.target2),
      rr: row.rr == null ? null : Number(row.rr),
      volumeRelative: row.volume_relative == null ? null : Number(row.volume_relative),
      engineVersion: String(row.engine_version),
      regime: row.regime == null ? null : String(row.regime),
      regimeConfidence: row.regime_confidence == null ? null : Number(row.regime_confidence),
      selectedStrategy: row.selected_strategy == null ? null : String(row.selected_strategy),
      strategyScore: row.strategy_score == null ? null : Number(row.strategy_score),
      ema200DistancePctSigned: row.ema200_distance_pct_signed == null ? null : Number(row.ema200_distance_pct_signed),
      ema200DistanceAtr: row.ema200_distance_atr == null ? null : Number(row.ema200_distance_atr),
      stretchedEvidence: row.stretched_evidence_json == null ? null : jsonParse<Record<string, unknown>>(String(row.stretched_evidence_json), {}),
      chaoticEvidence: row.chaotic_evidence_json == null ? null : jsonParse<Record<string, unknown>>(String(row.chaotic_evidence_json), {}),
      lastTradeDirection: row.last_trade_direction == null ? null : String(row.last_trade_direction),
      lastTradeExitReason: row.last_trade_exit_reason == null ? null : String(row.last_trade_exit_reason),
      lastTradeTarget1Hit: row.last_trade_target1_hit == null ? null : Boolean(row.last_trade_target1_hit),
      lastTradeTarget2Hit: row.last_trade_target2_hit == null ? null : Boolean(row.last_trade_target2_hit),
      marketReorganized: row.market_reorganized == null ? null : Boolean(row.market_reorganized),
      reorganizationReasons: jsonParse<string[]>(String(row.reorganization_reasons_json ?? "[]"), []),
      momentumConditionsPassed: jsonParse<string[]>(String(row.momentum_conditions_passed_json ?? "[]"), []),
      momentumConditionsMissing: jsonParse<string[]>(String(row.momentum_conditions_missing_json ?? "[]"), []),
      createdAt: String(row.created_at),
    }));

    return {
      exportedAt: nowIso(),
      filters: {
        hours,
        symbol,
        decision,
        state,
        limit: safeLimit,
      },
      summary: {
        total,
        byDecision,
        byState,
      },
      total,
      entries,
    };
  }

  exportDemoTradeHistory(user: AuthUser, params: DemoTradeExportParams = {}): DemoTradeExportResponse {
    if (user.role !== "admin") throw new HttpError(403, "Admin required");
    const safeLimit = Math.max(1, Math.min(5000, Math.floor(params.limit ?? 1000)));
    const symbol = params.symbol?.trim().toUpperCase() || null;
    const direction = params.direction?.trim().toUpperCase() || null;
    const status = params.status?.trim().toUpperCase() || null;
    const exitReason = params.exitReason?.trim().toUpperCase() || null;
    const from = params.from?.trim() || null;
    const to = params.to?.trim() || null;
    const fromMs = from ? Date.parse(from) : null;
    const toMs = to ? Date.parse(to) : null;
    if (from !== null && !Number.isFinite(fromMs)) throw new HttpError(400, "invalid from filter");
    if (to !== null && !Number.isFinite(toMs)) throw new HttpError(400, "invalid to filter");
    if (direction !== null && direction !== "BUY" && direction !== "SELL") throw new HttpError(400, "invalid direction filter");
    if (status !== null && status !== "WIN" && status !== "LOSS" && status !== "BREAKEVEN") throw new HttpError(400, "invalid status filter");

    const whereClauses: string[] = ["user_id = ?"];
    const sqlArgs: (string | number | null)[] = [user.id];
    if (symbol !== null) {
      whereClauses.push("pair = ?");
      sqlArgs.push(symbol);
    }
    if (direction !== null) {
      whereClauses.push("direction = ?");
      sqlArgs.push(direction);
    }
    if (status !== null) {
      whereClauses.push("status = ?");
      sqlArgs.push(status);
    }
    if (exitReason !== null) {
      whereClauses.push("exit_reason = ?");
      sqlArgs.push(exitReason);
    }
    if (fromMs !== null) {
      whereClauses.push("COALESCE(close_time, open_time) >= ?");
      sqlArgs.push(fromMs);
    }
    if (toMs !== null) {
      whereClauses.push("COALESCE(close_time, open_time) <= ?");
      sqlArgs.push(toMs);
    }
    const whereSql = "WHERE " + whereClauses.join(" AND ");
    const rows = this.db.prepare(`
      SELECT * FROM demo_trades
      ${whereSql}
      ORDER BY COALESCE(close_time, open_time) DESC
      LIMIT ?
    `).all(...sqlArgs, safeLimit) as Record<string, unknown>[];
    const totalRow = this.db.prepare(`SELECT COUNT(*) AS cnt FROM demo_trades ${whereSql}`).get(...sqlArgs) as Record<string, unknown>;
    const entries: DemoTradeExportEntry[] = rows.map((row) => {
      const trade = tradeFromRow(row);
      return {
        id: trade.id,
        pair: trade.pair,
        direction: trade.direction,
        entryPrice: trade.entry,
        exitPrice: trade.closePrice ?? null,
        openTime: trade.openTime,
        closeTime: trade.closeTime ?? null,
        durationMs: trade.closeTime === undefined ? null : tradeAgeMs(trade, trade.closeTime),
        stopLoss: trade.stopLoss,
        stopLossOriginal: trade.stopLossOriginal,
        target1: trade.target1,
        target2: trade.target2,
        riskAmount: trade.riskAmount,
        positionSize: trade.positionSize,
        remainingPositionSize: trade.remainingPositionSize,
        exitReason: trade.exitReason ?? null,
        status: trade.status,
        pnlUSDC: trade.pnlUSDC ?? null,
        realizedPnlUSDC: trade.realizedPnlUSDC ?? null,
        partialPnlUSDC: trade.partialPnlUSDC ?? null,
        mfeUSDC: trade.mfeUSDC ?? 0,
        maeUSDC: trade.maeUSDC ?? 0,
        mfeR: trade.mfeR ?? null,
        maeR: trade.maeR ?? null,
        peakGivebackUSDC: trade.peakGivebackUSDC ?? 0,
        openGivebackUSDC: trade.openGivebackUSDC ?? 0,
        totalGivebackUSDC: trade.totalGivebackUSDC ?? 0,
        peakGivebackPct: trade.peakGivebackPct ?? 0,
        maxPriceSinceEntry: trade.maxPriceSinceEntry ?? null,
        minPriceSinceEntry: trade.minPriceSinceEntry ?? null,
        maxUnrealizedPnlUSDC: trade.maxUnrealizedPnlUSDC ?? 0,
        minUnrealizedPnlUSDC: trade.minUnrealizedPnlUSDC ?? 0,
        target1Hit: trade.target1Hit,
        breakeven: trade.isBreakevenStop,
        trailing: trade.trailing || (trade.managementTimeline ?? []).some((event) => event.type === "TRAILING_ACTIVATED" || event.type === "TRAILING_UPDATED"),
        partialTriggerR: trade.partialTriggerR ?? null,
        trailingTriggerR: trade.trailingTriggerR ?? null,
        signalReasons: trade.signalReasons,
        managementTimeline: trade.managementTimeline ?? [],
      };
    });
    return {
      exportedAt: nowIso(),
      filters: {
        from,
        to,
        symbol,
        direction,
        status,
        exitReason,
        limit: safeLimit,
      },
      total: Number(totalRow?.cnt ?? 0),
      entries,
    };
  }

  getObservabilitySnapshot(): StoreObservabilitySnapshot {
    const fileBytes = (filePath: string): number => {
      try {
        return existsSync(filePath) ? statSync(filePath).size : 0;
      } catch {
        return 0;
      }
    };
    const scalar = <T>(sql: string, fallback: T): T => {
      try {
        const row = this.db.prepare(sql).get() as Record<string, unknown> | undefined;
        const value = row ? Object.values(row)[0] : undefined;
        return value == null ? fallback : value as T;
      } catch {
        return fallback;
      }
    };
    let integrity: "ok" | "error" = "ok";
    let integrityError: string | null = null;
    try {
      const row = this.db.prepare("PRAGMA integrity_check").get() as Record<string, unknown> | undefined;
      const result = String(row ? Object.values(row)[0] : "");
      if (result !== "ok") {
        integrity = "error";
        integrityError = result || "integrity_check failed";
      }
    } catch (err) {
      integrity = "error";
      integrityError = err instanceof Error ? err.message : String(err);
    }
    const latestRow = this.db.prepare("SELECT * FROM worker_diagnostics ORDER BY cycle_finished_at DESC LIMIT 1").get() as Record<string, unknown> | undefined;
    const now = Date.now();
    return {
      sqlite: {
        databasePath: this.dbPath,
        databaseBytes: fileBytes(this.dbPath),
        walBytes: fileBytes(`${this.dbPath}-wal`),
        shmBytes: fileBytes(`${this.dbPath}-shm`),
        journalMode: String(scalar("PRAGMA journal_mode", "unknown")),
        pageCount: Number(scalar("PRAGMA page_count", 0)),
        pageSize: Number(scalar("PRAGMA page_size", 0)),
        freelistCount: Number(scalar("PRAGMA freelist_count", 0)),
        integrity,
        integrityError,
      },
      sessions: {
        active: Number(scalar(`SELECT COUNT(*) FROM auth_sessions WHERE revoked_at IS NULL AND expires_at > ${now}`, 0)),
        expired: Number(scalar(`SELECT COUNT(*) FROM auth_sessions WHERE revoked_at IS NULL AND expires_at <= ${now}`, 0)),
        revoked: Number(scalar("SELECT COUNT(*) FROM auth_sessions WHERE revoked_at IS NOT NULL", 0)),
      },
      worker: {
        automationUsers: this.getAutomationUsers().length,
        diagnosticsStored: Number(scalar("SELECT COUNT(*) FROM worker_diagnostics", 0)),
        latest: latestRow ? diagnosticAdminFromRow(latestRow) : null,
      },
      notifications: {
        stored: Number(scalar("SELECT COUNT(*) FROM notifications", 0)),
        unread: Number(scalar("SELECT COUNT(*) FROM notifications WHERE read_at IS NULL", 0)),
        pushSubscriptions: Number(scalar("SELECT COUNT(*) FROM push_subscriptions WHERE revoked_at IS NULL", 0)),
        deliveries: Number(scalar("SELECT COUNT(*) FROM notification_deliveries", 0)),
      },
    };
  }

  getPublicOracleState(): PublicOracleState {
    const openPosition = this.db.prepare(`
      SELECT direction, updated_at
      FROM demo_positions
      WHERE status = 'OPEN'
      ORDER BY updated_at DESC, open_time DESC
      LIMIT 1
    `).get() as Record<string, unknown> | undefined;
    const latestDiagnostic = this.db.prepare(`
      SELECT status, direction, decision, cycle_finished_at, updated_at
      FROM worker_diagnostics
      ORDER BY cycle_finished_at DESC
      LIMIT 1
    `).get() as Record<string, unknown> | undefined;

    const state = resolveOracleVisualState({
      requireAuthentication: false,
      activeTrade: openPosition ? { direction: openPosition.direction } : null,
      worker: latestDiagnostic ? {
        lastStatus: latestDiagnostic.status,
        lastDirection: latestDiagnostic.direction,
        lastDecision: latestDiagnostic.decision,
      } : null,
    });

    return {
      state,
      updatedAt: String(openPosition?.updated_at ?? latestDiagnostic?.cycle_finished_at ?? latestDiagnostic?.updated_at ?? nowIso()),
    };
  }

  private simulationUserId(admin: AuthUser): string {
    return `sim_${admin.id}`.slice(0, 120);
  }

  private ensureSimulationUser(admin: AuthUser): string {
    const simulationUserId = this.simulationUserId(admin);
    const existing = this.db.prepare("SELECT id FROM users WHERE id = ?").get(simulationUserId);
    if (!existing) {
      const password = hashPassword(randomBytes(32).toString("base64url"));
      const now = nowIso();
      this.db.prepare(`
        INSERT INTO users
          (id, name, username, password_hash, password_salt, scrypt_n, scrypt_r, scrypt_p, scrypt_key_len, role, active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'user', 0, ?, ?)
      `).run(
        simulationUserId,
        `Simulacao ${admin.username}`,
        `sim-${admin.username}`.toLowerCase().replace(/[^a-z0-9._-]/g, "-").slice(0, 80),
        password.password_hash,
        password.password_salt,
        password.scrypt_n,
        password.scrypt_r,
        password.scrypt_p,
        password.scrypt_key_len,
        now,
        now,
      );
    }
    this.ensureUserAccount(simulationUserId);
    return simulationUserId;
  }

  private simulationDto(row: Record<string, unknown>): ControlledSimulationDto {
    const scenario = jsonParse<ControlledSimulationScenario>(String(row.scenario_json), {
      symbol: "BTCUSDT",
      direction: "BUY",
      entry: 100,
      stopLoss: 95,
      target1: 105,
      target2: 110,
      quantity: 1,
      riskAmount: 5,
      maxDurationMs: DEFAULT_MAX_DURATION_MS,
      initialPrice: 100,
    });
    const simulationUserId = String(row.simulation_user_id);
    const session = this.getSession(simulationUserId);
    const status = simulationStatusFromRow(row);
    return {
      id: String(row.id),
      userId: String(row.user_id),
      simulationUserId,
      status,
      scenario,
      currentStep: String(row.current_step),
      startedAt: String(row.started_at),
      updatedAt: String(row.updated_at),
      completedAt: row.completed_at == null ? null : String(row.completed_at),
      cancelledAt: row.cancelled_at == null ? null : String(row.cancelled_at),
      lastEvent: row.last_event == null ? null : String(row.last_event),
      error: row.error == null ? null : String(row.error),
      session,
      allowedSteps: allowedSimulationSteps(status, session),
    };
  }

  private getSimulationRow(userId: string, id: string): Record<string, unknown> {
    const row = this.db.prepare("SELECT * FROM controlled_simulations WHERE user_id = ? AND id = ?").get(userId, id) as Record<string, unknown> | undefined;
    if (!row) throw new HttpError(404, "simulation not found");
    return row;
  }

  private validateSimulationScenario(body: unknown): ControlledSimulationScenario {
    const input = body as Record<string, unknown>;
    const symbol = nonEmptyString(input.symbol ?? "BTCUSDT", "symbol", 32).toUpperCase();
    if (!["BTCUSDT", "ETHUSDT", "SOLUSDT"].includes(symbol)) throw new HttpError(400, "invalid simulation symbol");
    const direction = nonEmptyString(input.direction ?? "BUY", "direction") as TradeDirection;
    if (direction !== "BUY" && direction !== "SELL") throw new HttpError(400, "direction must be BUY or SELL");
    const entry = finiteNumber(input.entry, "entry", 0.00000001, MAX_PRICE);
    const stopLoss = finiteNumber(input.stopLoss ?? input.stop, "stopLoss", 0.00000001, MAX_PRICE);
    const target1 = finiteNumber(input.target1, "target1", 0.00000001, MAX_PRICE);
    const target2 = finiteNumber(input.target2, "target2", 0.00000001, MAX_PRICE);
    const quantity = finiteNumber(input.quantity ?? input.positionSize, "quantity", 0.00000001, MAX_POSITION_SIZE);
    const riskAmount = finiteNumber(input.riskAmount ?? Math.abs(entry - stopLoss) * quantity, "riskAmount", 0, MAX_BALANCE);
    const maxDurationMs = finiteNumber(input.maxDurationMs ?? DEFAULT_MAX_DURATION_MS, "maxDurationMs", 60_000, 24 * 60 * 60 * 1000);
    const initialPrice = finiteNumber(input.initialPrice ?? entry, "initialPrice", 0.00000001, MAX_PRICE);
    if (direction === "BUY" && !(stopLoss < entry && target1 > entry && target2 > target1)) throw new HttpError(400, "invalid BUY simulation plan");
    if (direction === "SELL" && !(stopLoss > entry && target1 < entry && target2 < target1)) throw new HttpError(400, "invalid SELL simulation plan");
    return { symbol, direction, entry, stopLoss, target1, target2, quantity, riskAmount, maxDurationMs, initialPrice };
  }

  createControlledSimulation(admin: AuthUser, body: unknown): ControlledSimulationDto {
    if (admin.role !== "admin") throw new HttpError(403, "Admin required");
    const scenario = this.validateSimulationScenario(body);
    const now = nowIso();
    const simulationId = newId("sim");
    return this.transaction(() => {
      if (this.getPositions(admin.id).length > 0) throw new HttpError(409, "close the real demo position before starting a controlled simulation");
      const active = this.db.prepare("SELECT id FROM controlled_simulations WHERE user_id = ? AND status = 'ACTIVE'").get(admin.id);
      if (active) throw new HttpError(409, "controlled simulation already active");
      const simulationUserId = this.ensureSimulationUser(admin);
      this.db.prepare("DELETE FROM demo_positions WHERE user_id = ?").run(simulationUserId);
      this.db.prepare("DELETE FROM demo_trades WHERE user_id = ?").run(simulationUserId);
      this.db.prepare("DELETE FROM demo_events WHERE user_id = ?").run(simulationUserId);
      this.putAccount(simulationUserId, { balance: DEFAULT_BALANCE, configuredBalance: DEFAULT_BALANCE, dailyStats: makeDailyStats(DEFAULT_BALANCE) });
      this.db.prepare(`
        INSERT INTO controlled_simulations
          (id, user_id, simulation_user_id, status, scenario_json, current_step, started_at, updated_at)
        VALUES (?, ?, ?, 'ACTIVE', ?, 'CREATED', ?, ?)
      `).run(simulationId, admin.id, simulationUserId, JSON.stringify(scenario), now, now);
      this.createNotification(admin.id, {
        type: "simulation_started",
        title: "HOMOLOGACAO iniciada",
        message: `Simulacao controlada iniciada em ${scenario.symbol}.`,
        severity: "info",
        symbol: scenario.symbol,
        source: "HOMOLOGATION",
        relatedEventId: simulationId,
        idempotencyKey: `${admin.id}:simulation_started:${simulationId}:${scenario.symbol}`,
        adminMetadata: { scenario },
      });
      return this.simulationDto(this.getSimulationRow(admin.id, simulationId));
    });
  }

  getCurrentControlledSimulation(admin: AuthUser): ControlledSimulationDto | null {
    if (admin.role !== "admin") throw new HttpError(403, "Admin required");
    const row = this.db.prepare(`
      SELECT * FROM controlled_simulations
      WHERE user_id = ?
      ORDER BY CASE status WHEN 'ACTIVE' THEN 0 ELSE 1 END, started_at DESC
      LIMIT 1
    `).get(admin.id) as Record<string, unknown> | undefined;
    return row ? this.simulationDto(row) : null;
  }

  getControlledSimulationEvents(admin: AuthUser, id: string): ControlledSimulationEventDto[] {
    if (admin.role !== "admin") throw new HttpError(403, "Admin required");
    this.getSimulationRow(admin.id, id);
    return (this.db.prepare("SELECT * FROM controlled_simulation_events WHERE user_id = ? AND simulation_id = ? ORDER BY created_at ASC")
      .all(admin.id, id) as Record<string, unknown>[]).map(simulationEventFromRow);
  }

  private recordSimulationEvent(userId: string, simulationId: string, step: ControlledSimulationStep, idempotencyKey: string, status: "APPLIED" | "IGNORED" | "ERROR", message: string, snapshot: Record<string, unknown>): ControlledSimulationEventDto {
    const now = nowIso();
    const id = newId("simev");
    this.db.prepare(`
      INSERT INTO controlled_simulation_events
        (id, simulation_id, user_id, step, idempotency_key, status, message, snapshot_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(simulation_id, idempotency_key) DO NOTHING
    `).run(id, simulationId, userId, step, idempotencyKey, status, message, JSON.stringify(snapshot), now);
    const row = this.db.prepare("SELECT * FROM controlled_simulation_events WHERE simulation_id = ? AND idempotency_key = ?")
      .get(simulationId, idempotencyKey) as Record<string, unknown>;
    const type = step === "CANCEL"
      ? "simulation_cancelled"
      : ["TARGET2", "STOP", "TIMEOUT", "LOSS_OF_STRENGTH"].includes(step)
        ? "simulation_completed"
        : "simulation_event";
    this.createNotification(userId, {
      type,
      title: type === "simulation_cancelled" ? "HOMOLOGACAO cancelada" : type === "simulation_completed" ? "HOMOLOGACAO concluida" : "Evento de HOMOLOGACAO",
      message: `HOMOLOGACAO: ${message}`,
      severity: status === "ERROR" ? "critical" : type === "simulation_cancelled" ? "warning" : "info",
      source: "HOMOLOGATION",
      relatedEventId: String(row.id),
      idempotencyKey: `${userId}:${type}:${simulationId}:${idempotencyKey}`,
      adminMetadata: { step, status, simulationId, snapshot },
    });
    return simulationEventFromRow(row);
  }

  stepControlledSimulation(admin: AuthUser, id: string, body: unknown): ControlledSimulationDto {
    if (admin.role !== "admin") throw new HttpError(403, "Admin required");
    const input = body as Record<string, unknown>;
    const step = nonEmptyString(input.step, "step") as ControlledSimulationStep;
    if (!["OPEN", "MOVE", "TARGET1", "PARTIAL", "BREAKEVEN", "TRAILING", "TARGET2", "STOP", "LOSS_OF_STRENGTH", "TIMEOUT", "CANCEL"].includes(step)) {
      throw new HttpError(400, "invalid simulation step");
    }
    if (step === "CANCEL") return this.cancelControlledSimulation(admin, id);
    const idempotencyKey = typeof input.idempotencyKey === "string" && input.idempotencyKey.trim()
      ? input.idempotencyKey.trim().slice(0, 160)
      : `${step}:${id}`;
    const existingEvent = this.db.prepare("SELECT * FROM controlled_simulation_events WHERE simulation_id = ? AND idempotency_key = ?")
      .get(id, idempotencyKey) as Record<string, unknown> | undefined;
    if (existingEvent) return this.simulationDto(this.getSimulationRow(admin.id, id));

    const row = this.getSimulationRow(admin.id, id);
    const current = this.simulationDto(row);
    if (current.status !== "ACTIVE") throw new HttpError(409, "simulation is not active");
    const allowed = new Set(current.allowedSteps);
    if (!allowed.has(step)) throw new HttpError(409, `step ${step} is not allowed now`);

    const scenario = current.scenario;
    const simulationUserId = current.simulationUserId;
    let message = "Evento aplicado.";
    try {
      if (step === "OPEN") {
        const trade: DemoTrade = {
          id: simulationTradeId(id),
          pair: scenario.symbol,
          direction: scenario.direction,
          openTime: Date.now(),
          entry: scenario.entry,
          stopLoss: scenario.stopLoss,
          stopLossOriginal: scenario.stopLoss,
          target1: scenario.target1,
          target2: scenario.target2,
          balanceAtOpen: this.getAccount(simulationUserId).balance,
          riskAmount: scenario.riskAmount,
          positionSize: scenario.quantity,
          remainingPositionSize: scenario.quantity,
          riskReward: "controlled",
          status: "OPEN",
          target1Hit: false,
          isBreakevenStop: false,
          trailing: false,
          realizedPnlUSDC: 0,
          partialPnlUSDC: 0,
          maxDurationMs: scenario.maxDurationMs,
          signalReasons: ["CONTROLLED_SIMULATION: entrada criada por administrador para homologacao."],
          marketConditions: "CONTROLLED_SIMULATION",
        };
        this.postPosition(simulationUserId, trade);
        this.updatePrices(simulationUserId, { pair: scenario.symbol, price: scenario.initialPrice });
        message = "Entrada controlada aberta.";
      } else if (step === "MOVE") {
        const price = finiteNumber(input.price ?? scenario.initialPrice, "price", 0.00000001, MAX_PRICE);
        this.updatePrices(simulationUserId, { pair: scenario.symbol, price });
        message = "Preco movimentado sem depender da Binance.";
      } else if (step === "TARGET1" || step === "PARTIAL" || step === "BREAKEVEN") {
        this.updatePrices(simulationUserId, { pair: scenario.symbol, price: scenario.target1 });
        message = "Alvo 1 processado pela gestao demo com parcial e breakeven idempotentes.";
      } else if (step === "TRAILING") {
        const price = input.price === undefined
          ? scenario.direction === "BUY" ? scenario.target1 * 1.01 : scenario.target1 * 0.99
          : finiteNumber(input.price, "price", 0.00000001, MAX_PRICE);
        this.updatePrices(simulationUserId, { pair: scenario.symbol, price });
        message = "Trailing atualizado pela gestao demo.";
      } else if (step === "TARGET2") {
        this.updatePrices(simulationUserId, { pair: scenario.symbol, price: scenario.target2 });
        message = "Alvo 2 processado pela gestao demo.";
      } else if (step === "STOP") {
        const activeTrade = this.getSession(simulationUserId).activeTrade;
        if (!activeTrade) throw new HttpError(409, "simulation position is already closed");
        this.updatePrices(simulationUserId, { pair: scenario.symbol, price: activeTrade.stopLoss });
        message = "Stop processado pela gestao demo.";
      } else if (step === "LOSS_OF_STRENGTH" || step === "TIMEOUT") {
        const activeTrade = this.getSession(simulationUserId).activeTrade;
        if (!activeTrade) throw new HttpError(409, "simulation position is already closed");
        const closePrice = finiteNumber(input.price ?? activeTrade.entry, "price", 0.00000001, MAX_PRICE);
        this.patchPosition(simulationUserId, activeTrade.id, {
          status: "LOSS",
          closePrice,
          exitReason: step === "TIMEOUT" ? "TIMEOUT" : "LOSS_OF_STRENGTH",
        });
        message = step === "TIMEOUT" ? "Fechamento por tempo maximo processado." : "Fechamento por perda de forca processado.";
      }
      const session = this.getSession(simulationUserId);
      const finished = session.activeTrade === null && step !== "MOVE" && step !== "OPEN" && step !== "TARGET1" && step !== "PARTIAL" && step !== "BREAKEVEN" && step !== "TRAILING";
      const now = nowIso();
      this.db.prepare(`
        UPDATE controlled_simulations
        SET current_step = ?, last_event = ?, status = ?, completed_at = COALESCE(completed_at, ?), updated_at = ?, error = NULL
        WHERE user_id = ? AND id = ?
      `).run(step, step, finished ? "COMPLETED" : "ACTIVE", finished ? now : null, now, admin.id, id);
      this.recordSimulationEvent(admin.id, id, step, idempotencyKey, "APPLIED", message, { session: this.getSession(simulationUserId) });
      return this.simulationDto(this.getSimulationRow(admin.id, id));
    } catch (err) {
      const messageText = err instanceof Error ? err.message : String(err);
      this.db.prepare("UPDATE controlled_simulations SET status = 'ERROR', error = ?, updated_at = ? WHERE user_id = ? AND id = ?")
        .run(messageText.slice(0, 500), nowIso(), admin.id, id);
      this.recordSimulationEvent(admin.id, id, step, idempotencyKey, "ERROR", messageText.slice(0, 500), {});
      if (err instanceof HttpError) throw err;
      throw new HttpError(500, "controlled simulation step failed");
    }
  }

  cancelControlledSimulation(admin: AuthUser, id: string): ControlledSimulationDto {
    if (admin.role !== "admin") throw new HttpError(403, "Admin required");
    const row = this.getSimulationRow(admin.id, id);
    const current = this.simulationDto(row);
    if (current.status !== "ACTIVE") return current;
    const now = nowIso();
    this.db.prepare(`
      UPDATE controlled_simulations
      SET status = 'CANCELLED', current_step = 'CANCEL', last_event = 'CANCEL', cancelled_at = ?, updated_at = ?
      WHERE user_id = ? AND id = ?
    `).run(now, now, admin.id, id);
    this.db.prepare("DELETE FROM demo_positions WHERE user_id = ?").run(current.simulationUserId);
    this.recordSimulationEvent(admin.id, id, "CANCEL", `CANCEL:${id}`, "APPLIED", "Simulacao cancelada pelo administrador.", { session: this.getSession(current.simulationUserId) });
    return this.simulationDto(this.getSimulationRow(admin.id, id));
  }

  getNotificationPreferences(userId: string): NotificationPreferences {
    const row = this.db.prepare("SELECT preferences_json FROM notification_preferences WHERE user_id = ?").get(userId) as Record<string, unknown> | undefined;
    const prefs = row ? jsonParse<NotificationPreferences>(String(row.preferences_json), defaultNotificationPreferences()) : defaultNotificationPreferences();
    return { ...defaultNotificationPreferences(), ...prefs, quietHours: { ...defaultNotificationPreferences().quietHours, ...(prefs.quietHours ?? {}) } };
  }

  putNotificationPreferences(userId: string, body: unknown): NotificationPreferences {
    const input = body as Partial<NotificationPreferences>;
    const current = this.getNotificationPreferences(userId);
    const next: NotificationPreferences = {
      ...current,
      internal: input.internal === undefined ? current.internal : input.internal === true,
      push: input.push === undefined ? current.push : input.push === true,
      telegram: input.telegram === undefined ? current.telegram : input.telegram === true,
      importantOnly: input.importantOnly === undefined ? current.importantOnly : input.importantOnly === true,
      includeBlockedEntries: input.includeBlockedEntries === undefined ? current.includeBlockedEntries : input.includeBlockedEntries === true,
      includeSimulation: input.includeSimulation === undefined ? current.includeSimulation : input.includeSimulation === true,
      mutedUntil: typeof input.mutedUntil === "string" ? input.mutedUntil : input.mutedUntil === null ? null : current.mutedUntil,
      quietHours: typeof input.quietHours === "object" && input.quietHours
        ? { ...current.quietHours, ...input.quietHours, enabled: input.quietHours.enabled === true }
        : current.quietHours,
      enabledTypes: Array.isArray(input.enabledTypes)
        ? input.enabledTypes.filter((item) => typeof item === "string").slice(0, 80)
        : current.enabledTypes,
    };
    this.db.prepare(`
      INSERT INTO notification_preferences (user_id, preferences_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET preferences_json = excluded.preferences_json, updated_at = excluded.updated_at
    `).run(userId, JSON.stringify(next), nowIso());
    return next;
  }

  private notificationAllowed(userId: string, input: { type: string; severity: NotificationSeverity; source: NotificationSource }): boolean {
    const prefs = this.getNotificationPreferences(userId);
    if (!prefs.internal) return false;
    if (prefs.mutedUntil && Date.parse(prefs.mutedUntil) > Date.now()) return false;
    if (input.source === "HOMOLOGATION" && !prefs.includeSimulation) return false;
    if (input.type === "entry_blocked_exhaustion" && !prefs.includeBlockedEntries) return false;
    if (prefs.importantOnly && !["warning", "critical"].includes(input.severity)) return false;
    if (prefs.enabledTypes.length > 0 && !prefs.enabledTypes.includes(input.type)) return false;
    if (prefs.quietHours.enabled && !["critical"].includes(input.severity)) {
      const now = new Date();
      const current = now.getHours() * 60 + now.getMinutes();
      const [startH, startM] = prefs.quietHours.start.split(":").map(Number);
      const [endH, endM] = prefs.quietHours.end.split(":").map(Number);
      const start = (Number.isFinite(startH) ? startH : 22) * 60 + (Number.isFinite(startM) ? startM : 0);
      const end = (Number.isFinite(endH) ? endH : 7) * 60 + (Number.isFinite(endM) ? endM : 0);
      const quiet = start <= end ? current >= start && current < end : current >= start || current < end;
      if (quiet) return false;
    }
    return true;
  }

  createNotification(userId: string, input: {
    type: string;
    title: string;
    message: string;
    severity?: NotificationSeverity;
    symbol?: string | null;
    source?: NotificationSource;
    relatedEventId?: string | null;
    idempotencyKey?: string;
    adminMetadata?: Record<string, unknown>;
    userMetadata?: Record<string, unknown>;
  }): NotificationDto | null {
    const source = input.source ?? "DEMO";
    const severity = input.severity ?? "info";
    const type = input.type.slice(0, 120);
    if (!this.notificationAllowed(userId, { type, severity, source })) return null;
    const symbol = input.symbol ? input.symbol.toUpperCase().slice(0, 32) : null;
    const relatedEventId = input.relatedEventId?.slice(0, 160) ?? null;
    const idempotencyKey = input.idempotencyKey ?? [userId, type, relatedEventId ?? "none", symbol ?? "none"].join(":");
    const now = nowIso();
    const id = newId("ntf");
    this.db.prepare(`
      INSERT OR IGNORE INTO notifications
        (id, user_id, type, title, message, severity, symbol, source, related_event_id, idempotency_key,
         delivery_status, failure_reason, admin_metadata_json, user_metadata_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'internal', NULL, ?, ?, ?)
    `).run(
      id,
      userId,
      type,
      input.title.slice(0, 180),
      input.message.slice(0, 600),
      severity,
      symbol,
      source,
      relatedEventId,
      idempotencyKey.slice(0, 240),
      JSON.stringify(input.adminMetadata ?? {}),
      JSON.stringify(input.userMetadata ?? {}),
      now,
    );
    this.pruneNotifications(userId);
    const row = this.db.prepare("SELECT * FROM notifications WHERE user_id = ? AND idempotency_key = ?").get(userId, idempotencyKey.slice(0, 240)) as Record<string, unknown> | undefined;
    if (!row) return null;
    this.queuePushDeliveries(userId, String(row.id));
    this.queueTelegramDeliveries(userId, String(row.id));
    void this.flushTelegramDeliveries(userId, String(row.id));
    return notificationFromRow(row, this.getUser(userId)?.role ?? "user");
  }

  private pruneNotifications(userId: string): void {
    const keep = envInt("ORACULO_NOTIFICATION_LIMIT", 200, 50, 2000);
    this.db.prepare(`
      DELETE FROM notifications
      WHERE user_id = ?
        AND id NOT IN (
          SELECT id FROM notifications
          WHERE user_id = ?
          ORDER BY created_at DESC
          LIMIT ?
        )
    `).run(userId, userId, keep);
  }

  getNotifications(user: AuthUser, query: unknown = {}) {
    const input = query as Record<string, unknown>;
    const limit = Math.max(1, Math.min(100, Math.floor(Number(input.limit ?? 30))));
    const rows = this.db.prepare(`
      SELECT * FROM notifications
      WHERE user_id = ?
        AND (? IS NULL OR type = ?)
        AND (? IS NULL OR source = ?)
      ORDER BY created_at DESC
      LIMIT ?
    `).all(
      user.id,
      typeof input.type === "string" && input.type ? input.type : null,
      typeof input.type === "string" && input.type ? input.type : null,
      typeof input.source === "string" && input.source ? input.source : null,
      typeof input.source === "string" && input.source ? input.source : null,
      limit,
    ) as Record<string, unknown>[];
    const unread = this.db.prepare("SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND read_at IS NULL").get(user.id) as Record<string, unknown>;
    return { unreadCount: Number(unread.count ?? 0), items: rows.map((row) => notificationFromRow(row, user.role)) };
  }

  markNotificationRead(userId: string, id: string): NotificationDto {
    this.db.prepare("UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE user_id = ? AND id = ?").run(nowIso(), userId, id);
    const row = this.db.prepare("SELECT * FROM notifications WHERE user_id = ? AND id = ?").get(userId, id) as Record<string, unknown> | undefined;
    if (!row) throw new HttpError(404, "notification not found");
    return notificationFromRow(row, this.getUser(userId)?.role ?? "user");
  }

  markAllNotificationsRead(userId: string): { read: number } {
    const result = this.db.prepare("UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE user_id = ? AND read_at IS NULL").run(nowIso(), userId);
    return { read: Number(result.changes) };
  }

  private queuePushDeliveries(userId: string, notificationId: string): void {
    const prefs = this.getNotificationPreferences(userId);
    if (!prefs.push) return;
    const notificationRow = this.db.prepare("SELECT * FROM notifications WHERE id = ? AND user_id = ?")
      .get(notificationId, userId) as Record<string, unknown> | undefined;
    if (!notificationRow) return;
    const type = String(notificationRow.type ?? "");
    const source = String(notificationRow.source ?? "DEMO") as NotificationSource;
    if (!shouldQueuePushDelivery(type, source, pushOperationalNotificationsEnabled())) return;
    const notification = notificationFromRow(notificationRow, "admin");
    const payload = formatPushPayload(notification);
    const subscriptions = this.db.prepare("SELECT * FROM push_subscriptions WHERE user_id = ? AND revoked_at IS NULL").all(userId) as Record<string, unknown>[];
    for (const subscription of subscriptions) {
      const existing = this.db.prepare(`
        SELECT id FROM notification_deliveries
        WHERE notification_id = ? AND provider = 'webpush' AND subscription_id = ?
      `).get(notificationId, String(subscription.id));
      if (existing) continue;
      this.db.prepare(`
        INSERT INTO notification_deliveries
          (id, notification_id, provider, subscription_id, status, failure_reason, payload_json, created_at, updated_at)
        VALUES (?, ?, 'webpush', ?, 'queued', NULL, ?, ?, ?)
      `).run(newId("dlv"), notificationId, String(subscription.id), JSON.stringify(payload), nowIso(), nowIso());
    }
  }

  private queueTelegramDeliveries(userId: string, notificationId: string): void {
    const prefs = this.getNotificationPreferences(userId);
    if (!prefs.telegram) return;
    const notificationRow = this.db.prepare("SELECT type, source FROM notifications WHERE id = ? AND user_id = ?")
      .get(notificationId, userId) as Record<string, unknown> | undefined;
    if (!notificationRow) return;
    const type = String(notificationRow.type ?? "");
    const source = String(notificationRow.source ?? "DEMO") as NotificationSource;
    if (!shouldQueueTelegramDelivery(type, source, telegramOperationalNotificationsEnabled())) return;
    const connection = this.db.prepare("SELECT * FROM telegram_connections WHERE user_id = ? AND status = 'ACTIVE' ORDER BY linked_at DESC LIMIT 1")
      .get(userId) as Record<string, unknown> | undefined;
    if (!connection) return;
    const now = nowIso();
    const existing = this.db.prepare(`
      SELECT id FROM notification_deliveries
      WHERE notification_id = ? AND provider = 'telegram' AND subscription_id = ?
    `).get(notificationId, String(connection.id));
    if (existing) return;
    this.db.prepare(`
      INSERT INTO notification_deliveries
        (id, notification_id, provider, subscription_id, status, failure_reason, created_at, updated_at, attempt_count, next_attempt_at)
      VALUES (?, ?, 'telegram', ?, 'queued', NULL, ?, ?, 0, NULL)
    `).run(newId("dlv"), notificationId, String(connection.id), now, now);
  }

  async flushTelegramDeliveries(userId: string, notificationId?: string): Promise<void> {
    const maxAttempts = envInt("ORACULO_TELEGRAM_MAX_ATTEMPTS", 3, 1, 10);
    const now = nowIso();
    const rows = this.db.prepare(`
      SELECT d.*, n.user_id, c.chat_id, c.id AS connection_id, n.id AS notification_id
      FROM notification_deliveries d
      JOIN notifications n ON n.id = d.notification_id
      JOIN telegram_connections c ON c.id = d.subscription_id AND c.status = 'ACTIVE'
      WHERE n.user_id = ?
        AND d.provider = 'telegram'
        AND d.status IN ('queued','failed')
        AND d.attempt_count < ?
        AND (? IS NULL OR d.notification_id = ?)
        AND (d.next_attempt_at IS NULL OR d.next_attempt_at <= ?)
      ORDER BY d.created_at ASC
      LIMIT 10
    `).all(userId, maxAttempts, notificationId ?? null, notificationId ?? null, now) as Record<string, unknown>[];
    for (const delivery of rows) {
      try {
        const notificationRow = this.db.prepare("SELECT * FROM notifications WHERE id = ? AND user_id = ?")
          .get(String(delivery.notification_id), userId) as Record<string, unknown> | undefined;
        if (!notificationRow) continue;
        const user = this.getUser(userId);
        const notification = notificationFromRow(notificationRow, user?.role ?? "user");
        const message = notificationTelegramMessage(notification, user?.role ?? "user");
        await this.sendTelegramMessage(String(delivery.chat_id), message);
        this.db.prepare(`
          UPDATE notification_deliveries
          SET status = 'delivered', failure_reason = NULL, attempt_count = attempt_count + 1, updated_at = ?, next_attempt_at = NULL
          WHERE id = ?
        `).run(nowIso(), String(delivery.id));
        this.db.prepare("UPDATE telegram_connections SET last_delivery_at = ?, updated_at = ? WHERE id = ?")
          .run(nowIso(), nowIso(), String(delivery.connection_id));
      } catch (err) {
        const attempt = Number(delivery.attempt_count ?? 0) + 1;
        const failure = sanitizeFailure(err) ?? "telegram delivery failed";
        const permanent = failure.includes("chat not found") || failure.includes("bot was blocked") || failure.includes("forbidden");
        if (permanent) {
          this.db.prepare("UPDATE telegram_connections SET status = 'REVOKED', revoked_at = ?, updated_at = ? WHERE id = ?")
            .run(nowIso(), nowIso(), String(delivery.connection_id));
        }
        const status = permanent || attempt >= maxAttempts ? "failed" : "queued";
        const backoffMs = Math.min(15 * 60_000, 2 ** Math.max(0, attempt - 1) * 30_000);
        const nextAttemptAt = status === "queued" ? new Date(Date.now() + backoffMs).toISOString() : null;
        this.db.prepare(`
          UPDATE notification_deliveries
          SET status = ?, failure_reason = ?, attempt_count = ?, updated_at = ?, next_attempt_at = ?
          WHERE id = ?
        `).run(status, failure, attempt, nowIso(), nextAttemptAt, String(delivery.id));
      }
    }
  }

  private async sendTelegramMessage(chatId: string, text: string): Promise<void> {
    if (process.env["ORACULO_TELEGRAM_MOCK"] === "true") return;
    if (!telegramConfigured()) throw new Error("Telegram provider is not configured");
    const timeoutMs = envInt("ORACULO_TELEGRAM_TIMEOUT_MS", 7000, 1000, 30_000);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(telegramApiUrl("sendMessage"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          chat_id: chatId,
          text,
          disable_web_page_preview: true,
        }),
      });
      if (!response.ok) {
        let description = `telegram ${response.status}`;
        try {
          const payload = await response.json() as { description?: string };
          if (payload.description) description = payload.description;
        } catch {
          // Telegram failures must not break the worker.
        }
        throw new Error(description);
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  getPushPublicKey(): { publicKey: string | null; configured: boolean } {
    const publicKey = process.env["ORACULO_VAPID_PUBLIC_KEY"] ?? null;
    return { publicKey, configured: !!publicKey && !!process.env["ORACULO_VAPID_PRIVATE_KEY"] };
  }

  getWebPushVapidConfig(): PushVapidConfig {
    const publicKey = process.env["ORACULO_VAPID_PUBLIC_KEY"]?.trim() ?? "";
    const privateKey = process.env["ORACULO_VAPID_PRIVATE_KEY"]?.trim() ?? "";
    const subject = process.env["ORACULO_VAPID_SUBJECT"]?.trim() ?? "";
    if (!publicKey || !privateKey || !subject) {
      return {
        configured: false,
        publicKey: publicKey || null,
        privateKey: null,
        subject: subject || null,
        reason: "missing VAPID configuration",
      };
    }
    if (!subject.startsWith("mailto:") && !subject.startsWith("https://")) {
      return {
        configured: false,
        publicKey,
        privateKey: null,
        subject: null,
        reason: "invalid VAPID subject",
      };
    }
    return { configured: true, publicKey, privateKey, subject };
  }

  listPushSubscriptions(userId: string): PushSubscriptionDto[] {
    return (this.db.prepare("SELECT * FROM push_subscriptions WHERE user_id = ? AND revoked_at IS NULL ORDER BY updated_at DESC").all(userId) as Record<string, unknown>[])
      .map(pushSubscriptionFromRow);
  }

  subscribePush(userId: string, body: unknown, userAgent?: string): PushSubscriptionDto {
    const input = body as Record<string, unknown>;
    const endpoint = nonEmptyString(input.endpoint, "endpoint", 2000);
    const keys = input.keys as Record<string, unknown> | undefined;
    const p256dh = nonEmptyString(keys?.p256dh, "p256dh", 500);
    const auth = nonEmptyString(keys?.auth, "auth", 500);
    const endpointHash = createHash("sha256").update(endpoint).digest("hex");
    const now = nowIso();
    const id = newId("push");
    this.db.prepare(`
      INSERT INTO push_subscriptions (id, user_id, endpoint_hash, endpoint, p256dh, auth, user_agent, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, endpoint_hash) DO UPDATE SET
        endpoint = excluded.endpoint,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        user_agent = excluded.user_agent,
        revoked_at = NULL,
        failure_reason = NULL,
        updated_at = excluded.updated_at
    `).run(id, userId, endpointHash, endpoint, p256dh, auth, userAgent ?? null, now, now);
    const row = this.db.prepare("SELECT * FROM push_subscriptions WHERE user_id = ? AND endpoint_hash = ?").get(userId, endpointHash) as Record<string, unknown>;
    return pushSubscriptionFromRow(row);
  }

  deletePushSubscription(userId: string, id: string): { removed: boolean } {
    const result = this.db.prepare("UPDATE push_subscriptions SET revoked_at = ?, updated_at = ? WHERE user_id = ? AND id = ? AND revoked_at IS NULL")
      .run(nowIso(), nowIso(), userId, id);
    return { removed: result.changes > 0 };
  }

  removeInvalidPushSubscription(userId: string, id: string, reason: unknown): void {
    this.db.prepare("UPDATE push_subscriptions SET revoked_at = ?, failure_reason = ?, updated_at = ? WHERE user_id = ? AND id = ?")
      .run(nowIso(), sanitizeFailure(reason), nowIso(), userId, id);
  }

  claimWebPushDeliveries(options: {
    limit: number;
    maxAttempts: number;
    lockTimeoutMs: number;
    now: Date;
  }): ClaimedPushDelivery[] {
    const now = options.now.toISOString();
    const staleLockedAt = new Date(options.now.getTime() - options.lockTimeoutMs).toISOString();
    const candidates = this.db.prepare(`
      SELECT d.id
      FROM notification_deliveries d
      JOIN push_subscriptions s ON s.id = d.subscription_id AND s.revoked_at IS NULL
      WHERE d.provider = 'webpush'
        AND d.attempt_count < ?
        AND (
          d.status = 'queued'
          OR (d.status = 'failed' AND (d.next_attempt_at IS NULL OR d.next_attempt_at <= ?))
          OR (d.status = 'sending' AND d.locked_at IS NOT NULL AND d.locked_at <= ?)
        )
      ORDER BY d.created_at ASC
      LIMIT ?
    `).all(options.maxAttempts, now, staleLockedAt, options.limit) as Array<{ id: string }>;
    const claimed: ClaimedPushDelivery[] = [];
    for (const candidate of candidates) {
      const result = this.db.prepare(`
        UPDATE notification_deliveries
        SET status = 'sending', locked_at = ?, updated_at = ?
        WHERE id = ?
          AND provider = 'webpush'
          AND attempt_count < ?
          AND (
            status = 'queued'
            OR (status = 'failed' AND (next_attempt_at IS NULL OR next_attempt_at <= ?))
            OR (status = 'sending' AND locked_at IS NOT NULL AND locked_at <= ?)
          )
      `).run(now, now, candidate.id, options.maxAttempts, now, staleLockedAt);
      if (!result.changes) continue;
      const row = this.db.prepare(`
        SELECT
          d.id,
          d.notification_id,
          d.subscription_id,
          d.payload_json,
          d.attempt_count,
          n.user_id,
          s.endpoint,
          s.p256dh,
          s.auth
        FROM notification_deliveries d
        JOIN notifications n ON n.id = d.notification_id
        JOIN push_subscriptions s ON s.id = d.subscription_id
        WHERE d.id = ?
      `).get(candidate.id) as Record<string, unknown> | undefined;
      if (!row) continue;
      claimed.push({
        id: String(row.id),
        userId: String(row.user_id),
        notificationId: String(row.notification_id),
        subscriptionId: String(row.subscription_id),
        endpoint: String(row.endpoint ?? ""),
        p256dh: String(row.p256dh ?? ""),
        auth: String(row.auth ?? ""),
        payloadJson: row.payload_json === null || row.payload_json === undefined ? null : String(row.payload_json),
        attemptCount: Number(row.attempt_count ?? 0),
      });
    }
    return claimed;
  }

  markWebPushDelivered(id: string, now: Date): void {
    const timestamp = now.toISOString();
    this.db.prepare(`
      UPDATE notification_deliveries
      SET status = 'delivered',
          failure_reason = NULL,
          attempt_count = attempt_count + 1,
          next_attempt_at = NULL,
          delivered_at = ?,
          locked_at = NULL,
          updated_at = ?
      WHERE id = ? AND provider = 'webpush' AND status = 'sending'
    `).run(timestamp, timestamp, id);
  }

  markWebPushRetry(id: string, failure: string, nextAttemptAt: Date, now: Date): void {
    const timestamp = now.toISOString();
    this.db.prepare(`
      UPDATE notification_deliveries
      SET status = 'failed',
          failure_reason = ?,
          attempt_count = attempt_count + 1,
          next_attempt_at = ?,
          locked_at = NULL,
          updated_at = ?
      WHERE id = ? AND provider = 'webpush' AND status = 'sending'
    `).run(sanitizeFailure(failure), nextAttemptAt.toISOString(), timestamp, id);
  }

  markWebPushPermanentFailure(id: string, failure: string, now: Date): void {
    const timestamp = now.toISOString();
    this.db.prepare(`
      UPDATE notification_deliveries
      SET status = 'failed',
          failure_reason = ?,
          attempt_count = attempt_count + 1,
          next_attempt_at = NULL,
          locked_at = NULL,
          updated_at = ?
      WHERE id = ? AND provider = 'webpush' AND status = 'sending'
    `).run(sanitizeFailure(failure), timestamp, id);
  }

  getTelegramStatus(userId: string): TelegramStatusDto {
    const row = this.db.prepare("SELECT * FROM telegram_connections WHERE user_id = ? AND status = 'ACTIVE' ORDER BY linked_at DESC LIMIT 1")
      .get(userId) as Record<string, unknown> | undefined;
    return {
      configured: telegramConfigured(),
      connected: !!row,
      botUsername: telegramBotUsername(),
      telegramUsername: row?.telegram_username == null ? null : String(row.telegram_username),
      linkedAt: row?.linked_at == null ? null : String(row.linked_at),
      lastDeliveryAt: row?.last_delivery_at == null ? null : String(row.last_delivery_at),
    };
  }

  getTelegramAdminStatus(user: AuthUser) {
    if (user.role !== "admin") throw new HttpError(403, "Admin required");
    const runtime = telegramRuntimeStatus();
    const activeConnections = this.db.prepare("SELECT COUNT(*) AS count FROM telegram_connections WHERE status = 'ACTIVE'").get() as Record<string, unknown>;
    const queuedDeliveries = this.db.prepare("SELECT COUNT(*) AS count FROM notification_deliveries WHERE provider = 'telegram' AND status = 'queued'").get() as Record<string, unknown>;
    const failedDeliveries = this.db.prepare("SELECT COUNT(*) AS count FROM notification_deliveries WHERE provider = 'telegram' AND status = 'failed'").get() as Record<string, unknown>;
    const deliveredDeliveries = this.db.prepare("SELECT COUNT(*) AS count FROM notification_deliveries WHERE provider = 'telegram' AND status = 'delivered'").get() as Record<string, unknown>;
    return {
      configured: runtime.configured,
      mock: runtime.mock,
      botUsername: runtime.botUsername,
      chatIdConfigured: runtime.chatIdConfigured,
      operationalNotificationsEnabled: telegramOperationalNotificationsEnabled(),
      activeConnections: Number(activeConnections.count ?? 0),
      queuedDeliveries: Number(queuedDeliveries.count ?? 0),
      failedDeliveries: Number(failedDeliveries.count ?? 0),
      deliveredDeliveries: Number(deliveredDeliveries.count ?? 0),
    };
  }

  createTelegramLinkCode(userId: string): TelegramLinkCodeDto {
    if (!telegramConfigured()) throw new HttpError(503, "Telegram is not configured");
    const now = Date.now();
    const ttlMs = envInt("ORACULO_TELEGRAM_LINK_TTL_SECONDS", 600, 60, 3600) * 1000;
    const expiresAt = new Date(now + ttlMs).toISOString();
    const code = randomBytes(5).toString("base64url").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8).padEnd(8, "7");
    const id = newId("tglc");
    this.db.prepare("DELETE FROM telegram_link_codes WHERE user_id = ? AND (used_at IS NOT NULL OR expires_at <= ?)").run(userId, nowIso());
    this.db.prepare(`
      INSERT INTO telegram_link_codes (id, user_id, code_hash, expires_at, used_at, created_at)
      VALUES (?, ?, ?, ?, NULL, ?)
    `).run(id, userId, sha256(code), expiresAt, nowIso());
    const botUsername = telegramBotUsername();
    return {
      code,
      expiresAt,
      botUsername,
      deepLink: botUsername ? `https://t.me/${botUsername}?start=${encodeURIComponent(code)}` : null,
    };
  }

  disconnectTelegram(userId: string): { disconnected: boolean } {
    const result = this.db.prepare(`
      UPDATE telegram_connections
      SET status = 'REVOKED', revoked_at = ?, updated_at = ?
      WHERE user_id = ? AND status = 'ACTIVE'
    `).run(nowIso(), nowIso(), userId);
    return { disconnected: result.changes > 0 };
  }

  processTelegramWebhook(body: unknown): { ok: boolean; linked: boolean; reason?: string } {
    const update = body as Record<string, unknown>;
    const message = update.message as Record<string, unknown> | undefined;
    if (!message) return { ok: true, linked: false, reason: "ignored_update" };
    const chat = message.chat as Record<string, unknown> | undefined;
    const text = typeof message.text === "string" ? message.text.trim() : "";
    if (!chat || String(chat.type) !== "private") return { ok: true, linked: false, reason: "private_chat_required" };
    const match = text.match(/^\/start(?:@\w+)?\s+([A-Za-z0-9_-]{4,64})$/);
    if (!match) return { ok: true, linked: false, reason: "link_code_required" };
    const codeHash = sha256(match[1].toUpperCase());
    const now = nowIso();
    const codeRow = this.db.prepare(`
      SELECT * FROM telegram_link_codes
      WHERE code_hash = ? AND used_at IS NULL AND expires_at > ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(codeHash, now) as Record<string, unknown> | undefined;
    if (!codeRow) return { ok: true, linked: false, reason: "invalid_or_expired_code" };
    const chatId = String(chat.id ?? "");
    if (!chatId || chatId.length > 80) return { ok: true, linked: false, reason: "invalid_chat_id" };
    const from = message.from as Record<string, unknown> | undefined;
    const username = typeof from?.username === "string" ? from.username.slice(0, 120) : null;
    this.transaction(() => {
      this.db.prepare("UPDATE telegram_link_codes SET used_at = ? WHERE id = ? AND used_at IS NULL").run(now, String(codeRow.id));
      this.db.prepare("UPDATE telegram_connections SET status = 'REVOKED', revoked_at = ?, updated_at = ? WHERE user_id = ? AND status = 'ACTIVE'")
        .run(now, now, String(codeRow.user_id));
      this.db.prepare("UPDATE telegram_connections SET status = 'REVOKED', revoked_at = ?, updated_at = ? WHERE chat_id = ? AND status = 'ACTIVE'")
        .run(now, now, chatId);
      this.db.prepare(`
        INSERT INTO telegram_connections
          (id, user_id, chat_id, telegram_username, status, linked_at, revoked_at, last_delivery_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'ACTIVE', ?, NULL, NULL, ?, ?)
      `).run(newId("tgl"), String(codeRow.user_id), chatId, username, now, now, now);
    });
    void this.sendTelegramMessage(chatId, "ORACULO — Telegram conectado com sucesso. Seus alertas do Oraculo podem chegar por aqui.").catch(() => undefined);
    return { ok: true, linked: true };
  }

  createTelegramTestNotification(user: AuthUser): NotificationDto | null {
    const status = this.getTelegramStatus(user.id);
    if (!status.connected) throw new HttpError(409, "Telegram is not connected");
    const prefs = this.getNotificationPreferences(user.id);
    if (!prefs.telegram) this.putNotificationPreferences(user.id, { telegram: true });
    const notification = this.createNotification(user.id, {
      type: "test",
      title: "Teste Telegram",
      message: "Mensagem de teste enviada pelo Oraculo.",
      severity: "info",
      source: "SYSTEM",
      idempotencyKey: `${user.id}:telegram_test:${Math.floor(Date.now() / 60_000)}`,
      adminMetadata: user.role === "admin" ? { provider: "telegram" } : {},
    });
    if (notification) void this.flushTelegramDeliveries(user.id, notification.id);
    return notification;
  }

  createTelegramAdminTestNotification(user: AuthUser): NotificationDto | null {
    if (user.role !== "admin") throw new HttpError(403, "Admin required");
    const status = this.getTelegramStatus(user.id);
    const envChatId = telegramChatId();
    if (!status.connected && !envChatId) throw new HttpError(409, "Telegram is not connected and ORACULO_TELEGRAM_CHAT_ID is not configured");
    const prefs = this.getNotificationPreferences(user.id);
    if (!prefs.telegram) this.putNotificationPreferences(user.id, { telegram: true });
    const notification = this.createNotification(user.id, {
      type: "test",
      title: "Teste Telegram",
      message: "Mensagem de teste enviada pelo Oraculo.",
      severity: "info",
      source: "SYSTEM",
      idempotencyKey: `${user.id}:telegram_admin_test:${Math.floor(Date.now() / 60_000)}`,
      adminMetadata: user.role === "admin" ? { provider: "telegram", destination: envChatId ? "env-chat-id" : "linked-chat" } : {},
    });
    if (notification && envChatId && !status.connected) {
      void this.sendTelegramMessage(envChatId, notificationTelegramMessage(notification, user.role)).catch(() => undefined);
    } else if (notification) {
      void this.flushTelegramDeliveries(user.id, notification.id);
    }
    return notification;
  }

  createTestNotification(user: AuthUser): NotificationDto | null {
    return this.createNotification(user.id, {
      type: "test",
      title: "Teste de alerta",
      message: "Alerta interno e Push preparados para este dispositivo.",
      severity: "info",
      source: "SYSTEM",
      idempotencyKey: `${user.id}:test:${Math.floor(Date.now() / 60_000)}`,
      adminMetadata: user.role === "admin" ? { provider: "internal-webpush", telegram: "prepared" } : {},
    });
  }

  tradeManagementSettings(userId: string) {
    return this.getSetting(userId, "demo.tradeManagement", {
      maxDurationMs: DEFAULT_MAX_DURATION_MS,
      breakevenBufferPct: DEFAULT_BREAKEVEN_BUFFER_PCT,
      trailingStopPct: DEFAULT_TRAILING_STOP_PCT,
      lossOfStrengthPct: DEFAULT_LOSS_OF_STRENGTH_PCT,
      closeAtOperationalEnd: false,
    });
  }

  setAutomation(userId: string, body: unknown) {
    const input = body as Record<string, unknown>;
    const enabled = input.enabled === true;
    const symbol = typeof input.symbol === "string" && input.symbol.trim() ? input.symbol.toUpperCase() : "BTCUSDT";
    const next = { enabled, symbol };
    this.setSetting(userId, "demo.automation", next);
    this.createNotification(userId, {
      type: enabled ? "automation_enabled" : "automation_disabled",
      title: enabled ? "Automacao ativada" : "Automacao desativada",
      message: enabled ? `Robo demo ativado para ${symbol}.` : "Robo demo desativado.",
      severity: enabled ? "success" : "warning",
      symbol,
      source: "DEMO",
      relatedEventId: `automation:${symbol}`,
      idempotencyKey: `${userId}:automation:${enabled}:${symbol}:${Math.floor(Date.now() / 60_000)}`,
    });
    return next;
  }

  putAccount(userId: string, body: unknown) {
    const input = body as Record<string, unknown>;
    const balance = finiteNumber(input.balance, "balance", 0, MAX_BALANCE);
    const configuredBalance = finiteNumber(input.configuredBalance ?? input.configured_balance, "configuredBalance", 0, MAX_BALANCE);
    const dailyStats = input.dailyStats ?? makeDailyStats(balance);
    const now = nowIso();
    this.db.prepare(`
      UPDATE demo_account
      SET balance = ?, configured_balance = ?, daily_stats_json = ?, updated_at = ?
      WHERE user_id = ?
    `).run(balance, configuredBalance, JSON.stringify(dailyStats), now, userId);
    return this.getAccount(userId);
  }

  resetSession(userId: string, body: unknown) {
    const input = body as Record<string, unknown>;
    const configuredBalance = finiteNumber(input.configuredBalance ?? DEFAULT_BALANCE, "configuredBalance", 100, MAX_BALANCE);
    return this.transaction(() => {
      this.db.prepare("DELETE FROM demo_positions WHERE user_id = ?").run(userId);
      this.db.prepare("DELETE FROM demo_trades WHERE user_id = ?").run(userId);
      this.db.prepare("DELETE FROM demo_events WHERE user_id = ?").run(userId);
      this.db.prepare("DELETE FROM demo_loss_streak_diagnostics WHERE user_id = ?").run(userId);
      this.putAccount(userId, { balance: configuredBalance, configuredBalance, dailyStats: makeDailyStats(configuredBalance) });
      return this.getSession(userId);
    });
  }

  getPositions(userId: string) {
    return (this.db.prepare("SELECT * FROM demo_positions WHERE user_id = ? AND status = 'OPEN' ORDER BY open_time DESC").all(userId) as Record<string, unknown>[]).map(tradeFromRow);
  }

  getTrades(userId: string) {
    return (this.db.prepare("SELECT * FROM demo_trades WHERE user_id = ? ORDER BY COALESCE(close_time, open_time) DESC").all(userId) as Record<string, unknown>[]).map(tradeFromRow);
  }

  getLastTradeForSymbol(userId: string, symbol: string) {
    const row = this.db.prepare(`
      SELECT * FROM demo_trades
      WHERE user_id = ? AND pair = ?
      ORDER BY COALESCE(close_time, open_time) DESC
      LIMIT 1
    `).get(userId, symbol.toUpperCase()) as Record<string, unknown> | undefined;
    return row ? tradeFromRow(row) : null;
  }

  private validatePosition(body: unknown): DemoTrade {
    const input = body as Record<string, unknown>;
    const direction = nonEmptyString(input.direction, "direction");
    if (direction !== "BUY" && direction !== "SELL") throw new HttpError(400, "direction must be BUY or SELL");
    const openTime = finiteNumber(input.openTime, "openTime", 1);
    const entry = finiteNumber(input.entry, "entry", 0.00000001, MAX_PRICE);
    const riskAmount = finiteNumber(input.riskAmount, "riskAmount", 0, MAX_BALANCE);
    const timeline = safeManagementTimeline(input.managementTimeline ?? input.management_timeline_json);
    return {
      id: nonEmptyString(input.id, "id", 128),
      pair: nonEmptyString(input.pair, "pair", 32).toUpperCase(),
      direction,
      openTime,
      entry,
      stopLoss: finiteNumber(input.stopLoss, "stopLoss", 0.00000001, MAX_PRICE),
      stopLossOriginal: finiteNumber(input.stopLossOriginal ?? input.stopLoss, "stopLossOriginal", 0.00000001, MAX_PRICE),
      target1: finiteNumber(input.target1, "target1", 0.00000001, MAX_PRICE),
      target2: finiteNumber(input.target2, "target2", 0.00000001, MAX_PRICE),
      balanceAtOpen: finiteNumber(input.balanceAtOpen, "balanceAtOpen", 0, MAX_BALANCE),
      riskAmount,
      positionSize: finiteNumber(input.positionSize, "positionSize", 0, MAX_POSITION_SIZE),
      remainingPositionSize: finiteNumber(input.remainingPositionSize ?? input.positionSize, "remainingPositionSize", 0, MAX_POSITION_SIZE),
      riskReward: nonEmptyString(input.riskReward, "riskReward", 32),
      status: "OPEN",
      target1Hit: bool(input.target1Hit),
      isBreakevenStop: bool(input.isBreakevenStop),
      trailing: bool(input.trailing),
      realizedPnlUSDC: finiteNumber(input.realizedPnlUSDC ?? 0, "realizedPnlUSDC", -MAX_BALANCE, MAX_BALANCE),
      partialPnlUSDC: finiteNumber(input.partialPnlUSDC ?? 0, "partialPnlUSDC", -MAX_BALANCE, MAX_BALANCE),
      target1ClosePrice: input.target1ClosePrice === undefined ? undefined : finiteNumber(input.target1ClosePrice, "target1ClosePrice", 0.00000001, MAX_PRICE),
      partialTriggerR: optionalNonNegativeNumber(input.partialTriggerR ?? input.partial_trigger_r),
      trailingTriggerR: optionalNonNegativeNumber(input.trailingTriggerR ?? input.trailing_trigger_r),
      maxDurationMs: finiteNumber(input.maxDurationMs ?? DEFAULT_MAX_DURATION_MS, "maxDurationMs", 60_000, 24 * 60 * 60 * 1000),
      initialRiskAmount: finiteNumber(input.initialRiskAmount ?? input.initial_risk_amount ?? riskAmount, "initialRiskAmount", 0, MAX_BALANCE),
      maxPriceSinceEntry: optionalFiniteNumber(input.maxPriceSinceEntry ?? input.max_price_since_entry) ?? entry,
      minPriceSinceEntry: optionalFiniteNumber(input.minPriceSinceEntry ?? input.min_price_since_entry) ?? entry,
      maxUnrealizedPnlUSDC: optionalFiniteNumber(input.maxUnrealizedPnlUSDC ?? input.max_unrealized_pnl_usdc) ?? 0,
      minUnrealizedPnlUSDC: optionalFiniteNumber(input.minUnrealizedPnlUSDC ?? input.min_unrealized_pnl_usdc) ?? 0,
      maxUnrealizedPnlBeforePartial: optionalFiniteNumber(input.maxUnrealizedPnlBeforePartial ?? input.max_unrealized_pnl_before_partial) ?? 0,
      maxUnrealizedPnlAfterPartial: optionalFiniteNumber(input.maxUnrealizedPnlAfterPartial ?? input.max_unrealized_pnl_after_partial),
      mfeUSDC: optionalNonNegativeNumber(input.mfeUSDC ?? input.mfe_usdc) ?? 0,
      maeUSDC: optionalNonNegativeNumber(input.maeUSDC ?? input.mae_usdc) ?? 0,
      mfeR: optionalNonNegativeNumber(input.mfeR ?? input.mfe_r) ?? (riskAmount > 0 ? 0 : null),
      maeR: optionalNonNegativeNumber(input.maeR ?? input.mae_r) ?? (riskAmount > 0 ? 0 : null),
      peakGivebackUSDC: optionalNonNegativeNumber(input.peakGivebackUSDC ?? input.peak_giveback_usdc) ?? 0,
      openGivebackUSDC: optionalNonNegativeNumber(input.openGivebackUSDC ?? input.open_giveback_usdc) ?? 0,
      totalGivebackUSDC: optionalNonNegativeNumber(input.totalGivebackUSDC ?? input.total_giveback_usdc) ?? 0,
      peakGivebackPct: optionalNonNegativeNumber(input.peakGivebackPct ?? input.peak_giveback_pct) ?? 0,
      lastManagementUpdateAt: typeof input.lastManagementUpdateAt === "string" ? input.lastManagementUpdateAt : typeof input.last_management_update_at === "string" ? input.last_management_update_at : null,
      managementTimeline: timeline.length > 0 ? timeline : [openedTimelineEvent({ entry, openTime })],
      signalReasons: stringArray(input.signalReasons ?? [], "signalReasons"),
      marketConditions: nonEmptyString(input.marketConditions, "marketConditions", 5000),
    };
  }

  postPosition(userId: string, body: unknown) {
    const position = this.validatePosition(body);
    const now = nowIso();
    try {
      this.db.prepare(`
        INSERT INTO demo_positions
          (id, user_id, pair, direction, status, open_time, entry, stop_loss, stop_loss_original, target1, target2,
           balance_at_open, risk_amount, position_size, remaining_position_size, risk_reward, target1_hit, is_breakeven_stop, trailing,
           realized_pnl_usdc, partial_pnl_usdc, target1_close_price, partial_trigger_r, trailing_trigger_r, max_duration_ms,
           initial_risk_amount, max_price_since_entry, min_price_since_entry,
           max_unrealized_pnl_usdc, min_unrealized_pnl_usdc,
           max_unrealized_pnl_before_partial, max_unrealized_pnl_after_partial,
           mfe_usdc, mae_usdc, mfe_r, mae_r,
           peak_giveback_usdc, open_giveback_usdc, total_giveback_usdc, peak_giveback_pct,
           last_management_update_at, management_timeline_json,
           signal_reasons_json, market_conditions, updated_at)
      VALUES (?, ?, ?, ?, 'OPEN', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        position.id, userId, position.pair, position.direction, position.openTime, position.entry, position.stopLoss,
        position.stopLossOriginal, position.target1, position.target2, position.balanceAtOpen, position.riskAmount,
        position.positionSize, position.remainingPositionSize, position.riskReward, Number(position.target1Hit), Number(position.isBreakevenStop), Number(position.trailing),
        position.realizedPnlUSDC ?? 0, position.partialPnlUSDC ?? 0, position.target1ClosePrice ?? null, position.partialTriggerR ?? null, position.trailingTriggerR ?? null, position.maxDurationMs ?? DEFAULT_MAX_DURATION_MS,
        position.initialRiskAmount ?? position.riskAmount,
        position.maxPriceSinceEntry ?? position.entry,
        position.minPriceSinceEntry ?? position.entry,
        position.maxUnrealizedPnlUSDC ?? 0,
        position.minUnrealizedPnlUSDC ?? 0,
        position.maxUnrealizedPnlBeforePartial ?? 0,
        position.maxUnrealizedPnlAfterPartial ?? null,
        position.mfeUSDC ?? 0,
        position.maeUSDC ?? 0,
        position.mfeR ?? null,
        position.maeR ?? null,
        position.peakGivebackUSDC ?? 0,
        position.openGivebackUSDC ?? 0,
        position.totalGivebackUSDC ?? 0,
        position.peakGivebackPct ?? 0,
        position.lastManagementUpdateAt ?? now,
        JSON.stringify(position.managementTimeline ?? [openedTimelineEvent(position)]),
        JSON.stringify(position.signalReasons), position.marketConditions, now,
      );
    } catch (err) {
      if (String((err as Error).message).includes("UNIQUE")) throw new HttpError(409, "an open position already exists for this pair");
      throw err;
    }
    this.setSetting(userId, `demo.priceHistory.${position.id}`, [{ price: position.entry, at: position.openTime }]);
    this.createNotification(userId, {
      type: "demo_entry_opened",
      title: "Entrada demo aberta",
      message: `${position.pair}: ${position.direction} aberta em ${position.entry}.`,
      severity: "success",
      symbol: position.pair,
      source: "DEMO",
      relatedEventId: position.id,
      idempotencyKey: `${userId}:demo_entry_opened:${position.id}:${position.pair}`,
      adminMetadata: { trade: position, score: null, signalReasons: position.signalReasons },
    });
    return position;
  }

  private notifyApprovedSignalNotExecuted(userId: string, input: DemoSignalInput, pair: string, reason: string, eventKey: string): void {
    this.createNotification(userId, {
      type: "demo_entry_not_executed",
      title: "Sinal aprovado, mas nao executado",
      message: `${pair}: sinal ${input.decision} aprovado, mas nao executado - ${reason}`,
      severity: "warning",
      symbol: pair,
      source: "DEMO",
      relatedEventId: eventKey,
      idempotencyKey: `${userId}:demo_entry_not_executed:${pair}:${eventKey}:${reason}`,
      adminMetadata: { reason, signal: { pair, decision: input.decision, signalKey: input.signalKey ?? null } },
    });
  }

  openFromSignal(userId: string, body: unknown) {
    return this.openFromSignalWithResult(userId, body).session;
  }

  openFromSignalWithResult(userId: string, body: unknown): {
    session: DemoSession;
    opened: boolean;
    blockedReason: string | null;
    decisionState: "BLOQUEADO_RISCO" | null;
    riskAmount: number | null;
    globalRiskOpenUSDC: number;
    globalRiskLimitUSDC: number;
    globalRiskRemainingUSDC: number;
  } {
    const input = body as DemoSignalInput;
    const pair = nonEmptyString(input.pair, "pair", 32).toUpperCase();
    const decision = input.decision;
    if (decision !== "BUY" && decision !== "SELL") {
      const account = this.accountWithCurrentSafetyLimit(userId);
      return {
        session: this.getSession(userId),
        opened: false,
        blockedReason: null,
        decisionState: null,
        riskAmount: null,
        globalRiskOpenUSDC: 0,
        globalRiskLimitUSDC: account.balance * MAX_DEMO_GLOBAL_RISK_PCT,
        globalRiskRemainingUSDC: account.balance * MAX_DEMO_GLOBAL_RISK_PCT,
      };
    }
    const entry = finiteNumber(input.entryNum, "entryNum", 0.00000001, MAX_PRICE);
    const stop = finiteNumber(input.stopLossNum, "stopLossNum", 0.00000001, MAX_PRICE);
    const target1 = finiteNumber(input.target1Num, "target1Num", 0.00000001, MAX_PRICE);
    const target2 = finiteNumber(input.target2Num, "target2Num", 0.00000001, MAX_PRICE);
    const key = `signal:${signalKey({ ...input, pair })}`;
    return this.transaction(() => {
      const account = this.accountWithCurrentSafetyLimit(userId);
      const positions = this.getPositions(userId);
      const globalRiskOpenUSDC = positions.reduce((sum, position) => sum + remainingOpenRisk(position), 0);
      const globalRiskLimitUSDC = account.balance * MAX_DEMO_GLOBAL_RISK_PCT;
      const globalRiskRemainingUSDC = Math.max(0, globalRiskLimitUSDC - globalRiskOpenUSDC);
      const blocked = (blockedReason: string, decisionState: "BLOQUEADO_RISCO" | null = null) => {
        this.notifyApprovedSignalNotExecuted(userId, input, pair, blockedReason, key);
        return {
          session: this.getSession(userId),
          opened: false,
          blockedReason,
          decisionState,
          riskAmount: null,
          globalRiskOpenUSDC,
          globalRiskLimitUSDC,
          globalRiskRemainingUSDC,
        };
      };
      const existingEvent = this.db.prepare("SELECT event_key FROM demo_events WHERE event_key = ?").get(`${userId}:${key}`);
      if (existingEvent) return blocked("sinal duplicado ja processado.");
      const reentryCooldown = this.activeReentryCooldown(userId, pair, decision);
      if (reentryCooldown) {
        this.recordEvent(userId, key, "reentry_cooldown_signal_blocked", null);
        const reason = `${reentryCooldown.reason}: ${pair} ${decision} bloqueado ate ${reentryCooldown.expiresAt}; restante ${formatRemainingMinutes(reentryCooldown.remainingMs)} min.`;
        return blocked(reason, "BLOQUEADO_RISCO");
      }
      if (positions.some((position) => position.pair === pair)) {
        this.recordEvent(userId, key, "duplicate_signal_blocked", null);
        return blocked("ja existe posicao aberta para este par.");
      }
      if (account.safetyLimit.limited) {
        this.recordEvent(userId, key, "risk_limited_signal_blocked", null);
        return blocked(account.safetyLimit.reason, "BLOQUEADO_RISCO");
      }
      if (positions.length >= MAX_DEMO_OPEN_POSITIONS) {
        this.recordEvent(userId, key, "global_position_limit_signal_blocked", null);
        return blocked("Limite de posicoes simultaneas atingido.", "BLOQUEADO_RISCO");
      }
      const requestedRiskAmount = Math.min(account.balance * MAX_DEMO_ENTRY_RISK_PCT, account.balance * 0.01);
      const allowedRiskAmount = Math.min(requestedRiskAmount, globalRiskRemainingUSDC);
      if (allowedRiskAmount <= 0.00000001) {
        this.recordEvent(userId, key, "global_risk_signal_blocked", null);
        return blocked("Limite global de risco atingido.", "BLOQUEADO_RISCO");
      }
      const { riskAmount, positionSize } = calcPositionSizeWithRisk(entry, stop, allowedRiskAmount);
      const steps = Array.isArray(input.steps) ? input.steps : [];
      const signalReasons = steps.slice(0, 10).map((step) =>
        `[${step.number ?? "?"}] ${step.name ?? "Regra"}: ${step.value ?? "-"} - ${step.reason ?? ""}`,
      );
      if (riskAmount < requestedRiskAmount) {
        signalReasons.push(`RISCO GLOBAL: risco reduzido para ${riskAmount.toFixed(8)} USDC por capacidade restante de ${globalRiskRemainingUSDC.toFixed(8)} USDC.`);
      }
      const trade: DemoTrade = {
        id: newTradeId(),
        pair,
        direction: decision,
        openTime: Date.now(),
        entry,
        stopLoss: stop,
        stopLossOriginal: stop,
        target1,
        target2,
        balanceAtOpen: account.balance,
        riskAmount,
        positionSize,
        remainingPositionSize: positionSize,
        riskReward: input.riskReward ?? "-",
        status: "OPEN",
        target1Hit: false,
        isBreakevenStop: false,
        trailing: false,
        realizedPnlUSDC: 0,
        partialPnlUSDC: 0,
        maxDurationMs: this.tradeManagementSettings(userId).maxDurationMs,
        signalReasons,
        marketConditions: signalReasons.join(" | "),
      };
      this.postPosition(userId, trade);
      this.setSetting(userId, `demo.priceHistory.${trade.id}`, [{ price: entry, at: Date.now() }]);
      this.recordEvent(userId, key, "signal_opened", trade.id);
      return {
        session: this.getSession(userId),
        opened: true,
        blockedReason: null,
        decisionState: null,
        riskAmount,
        globalRiskOpenUSDC,
        globalRiskLimitUSDC,
        globalRiskRemainingUSDC,
      };
    });
  }

  updatePrices(userId: string, body: unknown) {
    const input = body as Record<string, unknown>;
    const price = finiteNumber(input.price, "price", 0.00000001, MAX_PRICE);
    const pair = typeof input.pair === "string" ? input.pair.toUpperCase() : undefined;
    return this.transaction(() => {
      const positions = this.getPositions(userId).filter((position) => !pair || position.pair === pair);
      for (const position of positions) this.setSetting(userId, `demo.lastPrice.${position.pair}`, price);
      for (const trade of positions) this.applyPriceToPosition(userId, trade, price);
      return this.getSession(userId);
    });
  }

  patchPosition(userId: string, id: string, body: unknown) {
    return this.transaction(() => {
      const row = this.db.prepare("SELECT * FROM demo_positions WHERE user_id = ? AND id = ? AND status = 'OPEN'").get(userId, id) as Record<string, unknown> | undefined;
      if (!row) throw new HttpError(404, "open position not found");
      const current = tradeFromRow(row);
      const input = body as Record<string, unknown>;
      if (input.status && input.status !== "OPEN") {
        const closePrice = finiteNumber(input.closePrice, "closePrice", 0.00000001, MAX_PRICE);
        const reason = nonEmptyString(input.exitReason, "exitReason") as ManagedTradeExitReason;
        if (!["STOP_LOSS", "BREAKEVEN", "TARGET_1", "TARGET_2", "TIMEOUT", "TIME_EXIT", "TRAILING_STOP", "LOSS_OF_STRENGTH", "SESSION_END"].includes(reason)) throw new HttpError(400, "invalid exitReason");
        return this.closePosition(userId, current, closePrice, reason);
      }

      const stopLoss = input.stopLoss === undefined ? current.stopLoss : finiteNumber(input.stopLoss, "stopLoss", 0.00000001, MAX_PRICE);
      const target1Hit = input.target1Hit === undefined ? current.target1Hit : bool(input.target1Hit);
      const isBreakevenStop = input.isBreakevenStop === undefined ? current.isBreakevenStop : bool(input.isBreakevenStop);
      this.db.prepare(`
        UPDATE demo_positions
        SET stop_loss = ?, target1_hit = ?, is_breakeven_stop = ?, updated_at = ?
        WHERE user_id = ? AND id = ?
      `).run(stopLoss, Number(target1Hit), Number(isBreakevenStop), nowIso(), userId, id);
      return { ...current, stopLoss, target1Hit, isBreakevenStop };
    });
  }

  private recordEvent(userId: string, key: string, type: string, tradeId: string | null): boolean {
    const scopedKey = `${userId}:${key}`;
    const result = this.db.prepare(`
      INSERT OR IGNORE INTO demo_events (event_key, user_id, event_type, trade_id, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(scopedKey, userId, type, tradeId, nowIso());
    return result.changes > 0;
  }

  private getOpenPosition(userId: string, id: string): DemoTrade | null {
    const row = this.db.prepare("SELECT * FROM demo_positions WHERE user_id = ? AND id = ? AND status = 'OPEN'").get(userId, id) as Record<string, unknown> | undefined;
    return row ? tradeFromRow(row) : null;
  }

  private priceHistory(userId: string, tradeId: string): Array<{ price: number; at: number }> {
    const rows = this.getSetting<Array<{ price: number; at: number }>>(userId, `demo.priceHistory.${tradeId}`, []);
    return rows.filter((row) =>
      typeof row === "object"
      && Number.isFinite(row.price)
      && row.price > 0
      && Number.isFinite(row.at)
      && row.at > 0,
    ).slice(-PRICE_HISTORY_LIMIT);
  }

  private pushPriceHistory(userId: string, trade: DemoTrade, price: number): Array<{ price: number; at: number }> {
    const next = [...this.priceHistory(userId, trade.id), { price, at: Date.now() }].slice(-PRICE_HISTORY_LIMIT);
    this.setSetting(userId, `demo.priceHistory.${trade.id}`, next);
    return next;
  }

  private timelineEvent(type: ManagementTimelineEventType, trade: DemoTrade, price: number | null, note: string, data: Record<string, unknown> = {}): ManagementTimelineEvent {
    return {
      type,
      at: nowIso(),
      price,
      unrealizedPnlUSDC: price !== null && Number.isFinite(price) && price > 0 ? openPnlFor(trade, price) : null,
      note,
      data,
    };
  }

  private updatePositionObservability(userId: string, trade: DemoTrade, price: number): DemoTrade {
    if (!Number.isFinite(price) || price <= 0) return trade;
    const currentOpenPnl = openPnlFor(trade, price);
    const initialRisk = trade.initialRiskAmount ?? trade.riskAmount;
    const previousMaxPnl = trade.maxUnrealizedPnlUSDC ?? 0;
    const previousMinPnl = trade.minUnrealizedPnlUSDC ?? 0;
    const maxUnrealizedPnlUSDC = Math.max(previousMaxPnl, currentOpenPnl);
    const minUnrealizedPnlUSDC = Math.min(previousMinPnl, currentOpenPnl);
    const maxPriceSinceEntry = trade.maxPriceSinceEntry == null ? price : Math.max(trade.maxPriceSinceEntry, price);
    const minPriceSinceEntry = trade.minPriceSinceEntry == null ? price : Math.min(trade.minPriceSinceEntry, price);
    const maxUnrealizedPnlBeforePartial = trade.target1Hit
      ? (trade.maxUnrealizedPnlBeforePartial ?? previousMaxPnl)
      : Math.max(trade.maxUnrealizedPnlBeforePartial ?? 0, currentOpenPnl);
    const maxUnrealizedPnlAfterPartial = trade.target1Hit
      ? Math.max(trade.maxUnrealizedPnlAfterPartial ?? currentOpenPnl, currentOpenPnl)
      : trade.maxUnrealizedPnlAfterPartial ?? null;
    const mfeUSDC = Math.max(0, maxUnrealizedPnlUSDC);
    const maeUSDC = Math.max(0, -minUnrealizedPnlUSDC);
    const mfeR = Number.isFinite(initialRisk) && initialRisk > 0 ? mfeUSDC / initialRisk : null;
    const maeR = Number.isFinite(initialRisk) && initialRisk > 0 ? maeUSDC / initialRisk : null;
    const openPeak = trade.target1Hit && maxUnrealizedPnlAfterPartial !== null ? maxUnrealizedPnlAfterPartial : maxUnrealizedPnlUSDC;
    const openGivebackUSDC = Math.max(0, openPeak - currentOpenPnl);
    const totalCurrentPnl = (trade.realizedPnlUSDC ?? 0) + currentOpenPnl;
    const totalGivebackUSDC = Math.max(0, maxUnrealizedPnlUSDC - totalCurrentPnl);
    const peakGivebackUSDC = openGivebackUSDC;
    const peakGivebackPct = openPeak > 0 ? peakGivebackUSDC / openPeak : 0;
    let timeline = safeManagementTimeline(trade.managementTimeline ?? []);
    if (timeline.length === 0) timeline = [openedTimelineEvent(trade)];
    const tolerance = managementToleranceUSDC(trade);
    const mfeImproved = maxUnrealizedPnlUSDC > previousMaxPnl + tolerance;
    const maeWorsened = minUnrealizedPnlUSDC < previousMinPnl - tolerance;
    if (mfeImproved) {
      timeline = appendTimelineEvent(timeline, this.timelineEvent("NEW_MFE", trade, price, "Novo MFE registrado.", { mfeUSDC, mfeR }));
    }
    if (maeWorsened) {
      timeline = appendTimelineEvent(timeline, this.timelineEvent("NEW_MAE", trade, price, "Novo MAE registrado.", { maeUSDC, maeR }));
    }
    const changed = [
      trade.maxPriceSinceEntry !== maxPriceSinceEntry,
      trade.minPriceSinceEntry !== minPriceSinceEntry,
      trade.maxUnrealizedPnlUSDC !== maxUnrealizedPnlUSDC,
      trade.minUnrealizedPnlUSDC !== minUnrealizedPnlUSDC,
      trade.maxUnrealizedPnlBeforePartial !== maxUnrealizedPnlBeforePartial,
      trade.maxUnrealizedPnlAfterPartial !== maxUnrealizedPnlAfterPartial,
      trade.mfeUSDC !== mfeUSDC,
      trade.maeUSDC !== maeUSDC,
      trade.mfeR !== mfeR,
      trade.maeR !== maeR,
      trade.openGivebackUSDC !== openGivebackUSDC,
      trade.totalGivebackUSDC !== totalGivebackUSDC,
      trade.peakGivebackUSDC !== peakGivebackUSDC,
      trade.peakGivebackPct !== peakGivebackPct,
      JSON.stringify(safeManagementTimeline(trade.managementTimeline ?? [])) !== JSON.stringify(timeline),
    ].some(Boolean);
    if (!changed) return trade;
    const updatedAt = nowIso();
    this.db.prepare(`
      UPDATE demo_positions
      SET initial_risk_amount = ?, max_price_since_entry = ?, min_price_since_entry = ?,
          max_unrealized_pnl_usdc = ?, min_unrealized_pnl_usdc = ?,
          max_unrealized_pnl_before_partial = ?, max_unrealized_pnl_after_partial = ?,
          mfe_usdc = ?, mae_usdc = ?, mfe_r = ?, mae_r = ?,
          peak_giveback_usdc = ?, open_giveback_usdc = ?, total_giveback_usdc = ?, peak_giveback_pct = ?,
          last_management_update_at = ?, management_timeline_json = ?, updated_at = ?
      WHERE user_id = ? AND id = ? AND status = 'OPEN'
    `).run(
      initialRisk,
      maxPriceSinceEntry,
      minPriceSinceEntry,
      maxUnrealizedPnlUSDC,
      minUnrealizedPnlUSDC,
      maxUnrealizedPnlBeforePartial,
      maxUnrealizedPnlAfterPartial,
      mfeUSDC,
      maeUSDC,
      mfeR,
      maeR,
      peakGivebackUSDC,
      openGivebackUSDC,
      totalGivebackUSDC,
      peakGivebackPct,
      updatedAt,
      JSON.stringify(timeline),
      updatedAt,
      userId,
      trade.id,
    );
    return {
      ...trade,
      initialRiskAmount: initialRisk,
      maxPriceSinceEntry,
      minPriceSinceEntry,
      maxUnrealizedPnlUSDC,
      minUnrealizedPnlUSDC,
      maxUnrealizedPnlBeforePartial,
      maxUnrealizedPnlAfterPartial,
      mfeUSDC,
      maeUSDC,
      mfeR,
      maeR,
      peakGivebackUSDC,
      openGivebackUSDC,
      totalGivebackUSDC,
      peakGivebackPct,
      lastManagementUpdateAt: updatedAt,
      managementTimeline: timeline,
    };
  }

  private appendPositionReason(userId: string, trade: DemoTrade, reason: string): DemoTrade {
    const signalReasons = [...trade.signalReasons, reason].slice(-40);
    const marketConditions = signalReasons.join(" | ");
    this.db.prepare("UPDATE demo_positions SET signal_reasons_json = ?, market_conditions = ?, updated_at = ? WHERE user_id = ? AND id = ? AND status = 'OPEN'")
      .run(JSON.stringify(signalReasons), marketConditions, nowIso(), userId, trade.id);
    return { ...trade, signalReasons, marketConditions };
  }

  private unrealizedFor(trade: DemoTrade, price: number): number {
    const size = trade.remainingPositionSize ?? trade.positionSize;
    return trade.direction === "BUY"
      ? (price - trade.entry) * size
      : (trade.entry - price) * size;
  }

  private openRiskMultiple(trade: DemoTrade, price: number): number | null {
    const initialRisk = trade.initialRiskAmount ?? trade.riskAmount;
    if (!Number.isFinite(initialRisk) || initialRisk <= 0) return null;
    return this.unrealizedFor(trade, price) / initialRisk;
  }

  private applyPriceToPosition(userId: string, trade: DemoTrade, price: number): void {
    const isBuy = trade.direction === "BUY";
    const settings = this.tradeManagementSettings(userId);
    const riskSettings = demoManagementSettings();
    const history = this.pushPriceHistory(userId, trade, price);
    trade = this.updatePositionObservability(userId, trade, price);

    if (isBuy ? price <= trade.stopLoss : price >= trade.stopLoss) {
      const reason: ManagedTradeExitReason = trade.isBreakevenStop ? "BREAKEVEN" : "STOP_LOSS";
      const key = `close:${trade.id}:${reason}`;
      if (this.recordEvent(userId, key, "close", trade.id)) this.closePosition(userId, trade, trade.stopLoss, reason);
      return;
    }

    if (isBuy ? price >= trade.target2 : price <= trade.target2) {
      const key = `close:${trade.id}:TARGET_2`;
      if (this.recordEvent(userId, key, "close", trade.id)) this.closePosition(userId, trade, trade.target2, "TARGET_2");
      return;
    }

    let current = trade;
    const currentR = this.openRiskMultiple(trade, price);
    if (!trade.target1Hit && currentR !== null && currentR >= riskSettings.partialTriggerR) {
      const key = `partial:${trade.id}:risk:${riskSettings.partialTriggerR}`;
      if (this.recordEvent(userId, key, "target1", trade.id)) {
        current = this.realizeRiskPartial(userId, trade, price, riskSettings);
      }
    }

    const trailingR = this.openRiskMultiple(current, price);
    if (current.target1Hit && riskSettings.trailingEnabled && trailingR !== null && trailingR >= riskSettings.trailingTriggerR) {
      current = this.updateTrailingStop(userId, current, price, settings.trailingStopPct, history, riskSettings.trailingTriggerR);
    }

    if (current.target1Hit) {
      if (this.lossOfStrengthReached(userId, current, price, settings.lossOfStrengthPct, history)) {
        const key = `close:${current.id}:LOSS_OF_STRENGTH`;
        if (this.recordEvent(userId, key, "close", current.id)) this.closePosition(userId, current, price, "LOSS_OF_STRENGTH");
        return;
      }
    }

    if (tradeAgeMs(current) >= (current.maxDurationMs ?? settings.maxDurationMs)) {
      const key = `close:${current.id}:TIMEOUT`;
      if (this.recordEvent(userId, key, "close", current.id)) this.closePosition(userId, current, price, "TIMEOUT");
    }
  }

  private realizeRiskPartial(userId: string, trade: DemoTrade, price: number, riskSettings = demoManagementSettings()): DemoTrade {
    const latest = this.getOpenPosition(userId, trade.id) ?? trade;
    if (latest.target1Hit) return latest;
    const currentRemaining = latest.remainingPositionSize ?? latest.positionSize;
    const closeFraction = riskSettings.partialClosePercent / 100;
    const closedSize = Math.min(currentRemaining, latest.positionSize * closeFraction);
    const remainingPositionSize = Math.max(0, currentRemaining - closedSize);
    const partialPnlUSDC = trade.direction === "BUY"
      ? (price - latest.entry) * closedSize
      : (latest.entry - price) * closedSize;
    const stopLoss = riskSettings.moveStopToBreakeven
      ? latest.direction === "BUY"
        ? Math.max(latest.stopLoss, latest.entry)
        : Math.min(latest.stopLoss, latest.entry)
      : latest.stopLoss;
    const realizedPnlUSDC = (latest.realizedPnlUSDC ?? 0) + partialPnlUSDC;
    let timeline = safeManagementTimeline(latest.managementTimeline ?? []);
    if (timeline.length === 0) timeline = [openedTimelineEvent(latest)];
    const baseAtTarget = { ...latest, remainingPositionSize: currentRemaining };
    timeline = appendTimelineEvent(timeline, this.timelineEvent("TARGET_1", baseAtTarget, price, `Gatilho de parcial por +${riskSettings.partialTriggerR}R atingido.`, { target1: latest.target1, partialTriggerR: riskSettings.partialTriggerR }));
    timeline = appendTimelineEvent(timeline, this.timelineEvent("PARTIAL_EXECUTED", baseAtTarget, price, `Parcial de ${riskSettings.partialClosePercent}% executada.`, { closedSize, remainingPositionSize, partialPnlUSDC, partialTriggerR: riskSettings.partialTriggerR }));
    if (riskSettings.moveStopToBreakeven) {
      timeline = appendTimelineEvent(timeline, this.timelineEvent("BREAKEVEN_ACTIVATED", baseAtTarget, stopLoss, "Stop movido para breakeven.", { stopLoss, partialTriggerR: riskSettings.partialTriggerR }));
    }
    const managementUpdatedAt = nowIso();
    const next = {
      ...latest,
      target1Hit: true,
      stopLoss,
      isBreakevenStop: riskSettings.moveStopToBreakeven || latest.isBreakevenStop,
      trailing: latest.trailing,
      remainingPositionSize,
      realizedPnlUSDC,
      partialPnlUSDC,
      target1ClosePrice: price,
      partialTriggerR: riskSettings.partialTriggerR,
      trailingTriggerR: latest.trailingTriggerR ?? null,
      maxUnrealizedPnlBeforePartial: latest.maxUnrealizedPnlBeforePartial ?? latest.maxUnrealizedPnlUSDC ?? 0,
      maxUnrealizedPnlAfterPartial: latest.maxUnrealizedPnlAfterPartial ?? 0,
      lastManagementUpdateAt: managementUpdatedAt,
      managementTimeline: timeline,
    };
    this.db.prepare(`
      UPDATE demo_positions
      SET stop_loss = ?, target1_hit = 1, is_breakeven_stop = ?,
          remaining_position_size = ?, realized_pnl_usdc = ?, partial_pnl_usdc = ?,
          target1_close_price = ?, partial_trigger_r = ?, trailing_trigger_r = ?,
          max_unrealized_pnl_before_partial = ?,
          max_unrealized_pnl_after_partial = ?, last_management_update_at = ?,
          management_timeline_json = ?, updated_at = ?
      WHERE user_id = ? AND id = ? AND status = 'OPEN'
    `).run(
      stopLoss,
      Number(next.isBreakevenStop),
      remainingPositionSize,
      realizedPnlUSDC,
      partialPnlUSDC,
      price,
      next.partialTriggerR,
      next.trailingTriggerR,
      next.maxUnrealizedPnlBeforePartial,
      next.maxUnrealizedPnlAfterPartial,
      managementUpdatedAt,
      JSON.stringify(timeline),
      managementUpdatedAt,
      userId,
      latest.id,
    );
    const withReason = this.appendPositionReason(userId, next, `PARCIAL_R: realizou ${closedSize.toFixed(8)} em ${price}; PnL parcial ${partialPnlUSDC.toFixed(8)}; gatilho ${riskSettings.partialTriggerR}R; stop ${riskSettings.moveStopToBreakeven ? `movido para breakeven ${stopLoss.toFixed(8)}` : "mantido"}.`);

    const account = this.getAccount(userId);
    const stats = { ...account.dailyStats };
    stats.dailyPnL += partialPnlUSDC;
    const newBalance = account.balance + partialPnlUSDC;
    stats.peakBalance = Math.max(stats.peakBalance, newBalance);
    stats.maxDrawdown = Math.max(stats.maxDrawdown, stats.peakBalance - newBalance);
    stats.safetyLimited = isSafetyLimited(stats);
    this.putAccount(userId, { balance: newBalance, configuredBalance: account.configuredBalance, dailyStats: stats });
    this.createNotification(userId, {
      type: "target1_hit",
      title: "Parcial por risco executada",
      message: `${latest.pair}: parcial executada em ${price} ao atingir +${riskSettings.partialTriggerR}R.`,
      severity: "success",
      symbol: latest.pair,
      source: "DEMO",
      relatedEventId: latest.id,
      idempotencyKey: `${userId}:target1_hit:${latest.id}:${latest.pair}`,
      adminMetadata: { trade: withReason, tradeId: latest.id, target1: latest.target1, partialTriggerR: riskSettings.partialTriggerR },
    });
    this.createNotification(userId, {
      type: "partial_executed",
      title: "Parcial executada",
      message: `${latest.pair}: parcial de ${riskSettings.partialClosePercent}% realizada; PnL ${partialPnlUSDC.toFixed(4)}.`,
      severity: "success",
      symbol: latest.pair,
      source: "DEMO",
      relatedEventId: latest.id,
      idempotencyKey: `${userId}:partial_executed:${latest.id}:${latest.pair}`,
      adminMetadata: { trade: withReason, closedSize, remainingPositionSize, partialPnlUSDC, partialTriggerR: riskSettings.partialTriggerR },
    });
    if (riskSettings.moveStopToBreakeven) {
      this.createNotification(userId, {
        type: "breakeven_moved",
        title: "Stop em breakeven",
        message: `${latest.pair}: stop movido para ${stopLoss.toFixed(8)}.`,
        severity: "success",
        symbol: latest.pair,
        source: "DEMO",
        relatedEventId: latest.id,
        idempotencyKey: `${userId}:breakeven_moved:${latest.id}:${latest.pair}`,
        adminMetadata: { trade: withReason, stopLoss, partialTriggerR: riskSettings.partialTriggerR },
      });
    }
    return withReason;
  }

  private adaptiveTrailingPct(trade: DemoTrade, price: number, fallbackPct: number, history: Array<{ price: number; at: number }>): number {
    const limits = TRAILING_BY_SYMBOL[trade.pair] ?? TRAILING_BY_SYMBOL["BTCUSDT"];
    const prices = history.map((item) => item.price).filter((value) => Number.isFinite(value) && value > 0);
    const recentRangePct = prices.length >= 3 && price > 0
      ? (Math.max(...prices) - Math.min(...prices)) / price
      : 0;
    const volatilityPct = recentRangePct * 0.6;
    const candidate = Math.max(Number.isFinite(fallbackPct) && fallbackPct > 0 ? fallbackPct : 0, volatilityPct);
    return clamp(candidate, limits.minPct, limits.maxPct);
  }

  private updateTrailingStop(userId: string, trade: DemoTrade, price: number, trailingPct: number, history: Array<{ price: number; at: number }>, triggerR: number | null = null): DemoTrade {
    if (!Number.isFinite(price) || price <= 0) return trade;
    const adaptivePct = this.adaptiveTrailingPct(trade, price, trailingPct, history);
    const nextStop = trade.direction === "BUY"
      ? Math.max(trade.stopLoss, price * (1 - adaptivePct))
      : Math.min(trade.stopLoss, price * (1 + adaptivePct));
    if (nextStop === trade.stopLoss && trade.trailing && (triggerR === null || trade.trailingTriggerR != null)) return trade;
    let timeline = safeManagementTimeline(trade.managementTimeline ?? []);
    if (timeline.length === 0) timeline = [openedTimelineEvent(trade)];
    const trailingSeen = trade.trailing || timeline.some((event) => event.type === "TRAILING_ACTIVATED" || event.type === "TRAILING_UPDATED");
    const stopMoveUSDC = Math.abs(nextStop - trade.stopLoss) * (trade.remainingPositionSize ?? trade.positionSize);
    const shouldRecordTrailing = !trailingSeen || stopMoveUSDC >= managementToleranceUSDC(trade, MANAGEMENT_TRAILING_TOLERANCE_R);
    if (shouldRecordTrailing) {
      timeline = appendTimelineEvent(
        timeline,
        this.timelineEvent(trailingSeen ? "TRAILING_UPDATED" : "TRAILING_ACTIVATED", trade, price, trailingSeen ? "Trailing atualizado." : "Trailing ativado.", { previousStop: trade.stopLoss, nextStop, adaptivePct, trailingTriggerR: triggerR ?? trade.trailingTriggerR ?? null }),
      );
    }
    const updatedAt = nowIso();
    const trailingTriggerR = trade.trailingTriggerR ?? triggerR;
    this.db.prepare("UPDATE demo_positions SET stop_loss = ?, trailing = 1, trailing_trigger_r = ?, last_management_update_at = ?, management_timeline_json = ?, updated_at = ? WHERE user_id = ? AND id = ? AND status = 'OPEN'")
      .run(nextStop, trailingTriggerR, updatedAt, JSON.stringify(timeline), updatedAt, userId, trade.id);
    const next = { ...trade, stopLoss: nextStop, trailing: true, trailingTriggerR, lastManagementUpdateAt: updatedAt, managementTimeline: timeline };
    const bucket = Math.floor(Date.now() / envInt("ORACULO_TRAILING_ALERT_COOLDOWN_MS", 300_000, 60_000, 3_600_000));
    this.createNotification(userId, {
      type: "trailing_updated",
      title: "Trailing atualizado",
      message: `${trade.pair}: stop ajustado para ${nextStop.toFixed(8)}.`,
      severity: "info",
      symbol: trade.pair,
      source: "DEMO",
      relatedEventId: trade.id,
      idempotencyKey: `${userId}:trailing_updated:${trade.id}:${bucket}`,
      adminMetadata: { trade: next, nextStop, adaptivePct, price, trailingTriggerR },
    });
    return this.appendPositionReason(userId, next, `TRAILING: stop ajustado para ${nextStop.toFixed(8)} apos gatilho ${trailingTriggerR ?? "-"}R usando ${(adaptivePct * 100).toFixed(3)}% adaptativo pela volatilidade recente.`);
  }

  private lossOfStrengthReached(userId: string, trade: DemoTrade, price: number, thresholdPct: number, history: Array<{ price: number; at: number }>): boolean {
    if (!trade.target1Hit || !Number.isFinite(thresholdPct) || thresholdPct <= 0) return false;
    const prices = history.map((item) => item.price).filter((value) => Number.isFinite(value) && value > 0).slice(-5);
    const previous = prices.at(-2);
    const beforePrevious = prices.at(-3);
    const contraryClose = previous !== undefined
      ? trade.direction === "BUY" ? price < previous : price > previous
      : false;
    const failedContinuation = trade.direction === "BUY"
      ? price <= trade.target1 * (1 - thresholdPct)
      : price >= trade.target1 * (1 + thresholdPct);
    const shortStructureReversal = previous !== undefined && beforePrevious !== undefined
      ? trade.direction === "BUY" ? price < previous && previous < beforePrevious : price > previous && previous > beforePrevious
      : false;
    const lostBreakevenBuffer = trade.direction === "BUY"
      ? price <= trade.entry * (1 + DEFAULT_BREAKEVEN_BUFFER_PCT)
      : price >= trade.entry * (1 - DEFAULT_BREAKEVEN_BUFFER_PCT);
    const signals = [contraryClose, failedContinuation, shortStructureReversal, lostBreakevenBuffer].filter(Boolean).length;
    if (signals >= 2) {
      let timeline = safeManagementTimeline(trade.managementTimeline ?? []);
      if (timeline.length === 0) timeline = [openedTimelineEvent(trade)];
      timeline = appendTimelineEvent(timeline, this.timelineEvent("LOSS_OF_STRENGTH_DETECTED", trade, price, "Perda de forca detectada.", { signals, contraryClose, failedContinuation, shortStructureReversal, lostBreakevenBuffer }));
      this.db.prepare("UPDATE demo_positions SET last_management_update_at = ?, management_timeline_json = ?, updated_at = ? WHERE user_id = ? AND id = ? AND status = 'OPEN'")
        .run(nowIso(), JSON.stringify(timeline), nowIso(), userId, trade.id);
      this.appendPositionReason(userId, { ...trade, managementTimeline: timeline }, `LOSS_OF_STRENGTH: ${signals}/4 sinais ativos; fechamento contrario=${contraryClose}; falha continuacao=${failedContinuation}; reversao curta=${shortStructureReversal}; perda breakeven=${lostBreakevenBuffer}.`);
      return true;
    }
    if (signals === 1) {
      this.appendPositionReason(userId, trade, `ALERTA perda de forca: 1/4 sinal ativo; posicao mantida.`);
    }
    return false;
  }

  private closePosition(userId: string, position: DemoTrade, closePrice: number, exitReason: ManagedTradeExitReason) {
    const latest = this.getOpenPosition(userId, position.id);
    if (!latest) {
      return this.getTrades(userId).find((trade) => trade.id === position.id) ?? position;
    }
    position = latest;
    const remainingSize = position.remainingPositionSize ?? position.positionSize;
    const remainingPnl = position.direction === "BUY"
      ? (closePrice - position.entry) * remainingSize
      : (position.entry - closePrice) * remainingSize;
    const realizedBeforeClose = position.realizedPnlUSDC ?? 0;
    const pnlUSDC = realizedBeforeClose + remainingPnl;
    const pnlPct = position.balanceAtOpen > 0 ? (pnlUSDC / position.balanceAtOpen) * 100 : 0;
    const status = closedStatus(pnlUSDC);
    const closeTime = Date.now();
    const durationMs = tradeAgeMs(position, closeTime);
    let timeline = safeManagementTimeline(position.managementTimeline ?? []);
    if (timeline.length === 0) timeline = [openedTimelineEvent(position)];
    const exitType: ManagementTimelineEventType = exitReason === "TARGET_2"
      ? "TARGET_2"
      : exitReason === "TIMEOUT"
        ? "TIMEOUT"
        : exitReason === "LOSS_OF_STRENGTH"
          ? "LOSS_OF_STRENGTH_DETECTED"
          : "STOP";
    timeline = appendTimelineEvent(timeline, this.timelineEvent(exitType, position, closePrice, `Saida por ${exitReason}.`, { exitReason, status, pnlUSDC }));
    timeline = appendTimelineEvent(timeline, {
      type: "CLOSED",
      at: new Date(closeTime).toISOString(),
      price: closePrice,
      unrealizedPnlUSDC: remainingPnl,
      note: "Posicao encerrada.",
      data: { exitReason, status, pnlUSDC, durationMs },
    });
    const signalReasons = [...position.signalReasons, `FECHAMENTO ${exitReason}: preco ${closePrice}; duracao ${durationMs}ms; PnL ${pnlUSDC.toFixed(8)}.`].slice(-40);
    const closed: DemoTrade = {
      ...position,
      status,
      closeTime,
      closePrice,
      exitReason,
      remainingPositionSize: 0,
      realizedPnlUSDC: pnlUSDC,
      signalReasons,
      marketConditions: signalReasons.join(" | "),
      pnlUSDC,
      pnlPct,
      lastManagementUpdateAt: new Date(closeTime).toISOString(),
      managementTimeline: timeline,
    };
    this.upsertTrade(userId, closed);
    this.setReentryCooldown(userId, closed, exitReason, closeTime);
    this.db.prepare("DELETE FROM demo_positions WHERE user_id = ? AND id = ?").run(userId, position.id);
    const account = this.getAccount(userId);
    const stats = { ...account.dailyStats };
    const previousConsecutiveLosses = stats.consecutiveLosses;
    stats.totalTrades += 1;
    stats.wins += status === "WIN" ? 1 : 0;
    stats.losses += status === "LOSS" ? 1 : 0;
    stats.breakevens += status === "BREAKEVEN" ? 1 : 0;
    stats.consecutiveLosses = status === "LOSS" ? stats.consecutiveLosses + 1 : 0;
    stats.maxConsecutiveLosses = Math.max(stats.maxConsecutiveLosses, stats.consecutiveLosses);
    stats.dailyPnL += remainingPnl;
    const newBalance = account.balance + remainingPnl;
    stats.peakBalance = Math.max(stats.peakBalance, newBalance);
    stats.maxDrawdown = Math.max(stats.maxDrawdown, stats.peakBalance - newBalance);
    this.maybeCreateLossStreakDiagnostic(userId, previousConsecutiveLosses, stats.consecutiveLosses, closed);
    stats.safetyLimited = resolveSafetyLimit(stats, demoMaxDailyTrades(), this.resolveActiveLossStreakCooldown(userId)).limited;
    this.putAccount(userId, { balance: newBalance, configuredBalance: account.configuredBalance, dailyStats: stats });
    const alertType = exitReason === "TARGET_2"
      ? "target2_hit"
      : exitReason === "TIMEOUT"
        ? "timeout"
        : exitReason === "LOSS_OF_STRENGTH"
          ? "loss_of_strength"
          : "stop_loss";
    this.createNotification(userId, {
      type: alertType,
      title: exitReason === "TARGET_2" ? "Alvo 2 atingido" : exitReason === "TIMEOUT" ? "Fechamento por timeout" : exitReason === "LOSS_OF_STRENGTH" ? "Fechamento por perda de forca" : "Stop acionado",
      message: `${position.pair}: posicao encerrada por ${exitReason}; PnL ${pnlUSDC.toFixed(4)}.`,
      severity: exitReason === "TARGET_2" ? "success" : exitReason === "BREAKEVEN" ? "info" : "warning",
      symbol: position.pair,
      source: "DEMO",
      relatedEventId: position.id,
      idempotencyKey: `${userId}:${alertType}:${position.id}:${position.pair}`,
      adminMetadata: {
        trade: closed,
        exitReason,
        pnlUSDC,
        status,
        closePrice,
        durationMs,
        mfeUSDC: closed.mfeUSDC ?? null,
        maeUSDC: closed.maeUSDC ?? null,
        peakGivebackUSDC: closed.peakGivebackUSDC ?? null,
      },
    });
    return closed;
  }

  postTrade(userId: string, body: unknown) {
    const input = body as Record<string, unknown>;
    const trade = this.validatePosition({ ...input, status: "OPEN" });
    const closePrice = input.closePrice === undefined ? undefined : finiteNumber(input.closePrice, "closePrice", 0.00000001, MAX_PRICE);
    const status = nonEmptyString(input.status ?? "OPEN", "status") as TradeStatus;
    if (!["OPEN", "WIN", "LOSS", "BREAKEVEN"].includes(status)) throw new HttpError(400, "invalid status");
    const fullTrade: DemoTrade = {
      ...trade,
      status,
      closeTime: input.closeTime === undefined ? undefined : finiteNumber(input.closeTime, "closeTime", 1),
      closePrice,
      exitReason: input.exitReason as ManagedTradeExitReason | undefined,
      pnlUSDC: closePrice === undefined ? undefined : (trade.direction === "BUY" ? (closePrice - trade.entry) : (trade.entry - closePrice)) * trade.positionSize,
      pnlPct: undefined,
    };
    fullTrade.pnlPct = fullTrade.pnlUSDC === undefined || fullTrade.balanceAtOpen <= 0 ? undefined : (fullTrade.pnlUSDC / fullTrade.balanceAtOpen) * 100;
    this.upsertTrade(userId, fullTrade);
    return fullTrade;
  }

  private upsertTrade(userId: string, trade: DemoTrade): void {
    const owner = this.db.prepare("SELECT user_id FROM demo_trades WHERE id = ?").get(trade.id) as Record<string, unknown> | undefined;
    if (owner && owner.user_id !== userId) throw new HttpError(404, "trade not found");
    const now = nowIso();
    const stopLoss = trade.stopLoss ?? trade.stopLossOriginal;
    const stopLossOriginal = trade.stopLossOriginal ?? stopLoss;
    const remainingPositionSize = trade.remainingPositionSize ?? trade.positionSize;
    const realizedPnlUSDC = trade.realizedPnlUSDC ?? 0;
    const partialPnlUSDC = trade.partialPnlUSDC ?? 0;
    const target1Hit = trade.target1Hit ?? false;
    const isBreakevenStop = trade.isBreakevenStop ?? false;
    const trailing = trade.trailing ?? false;
    const partialTriggerR = trade.partialTriggerR ?? 1;
    const trailingTriggerR = trade.trailingTriggerR ?? 1.5;
    const managementTimeline = trade.managementTimeline ?? [];
    this.db.prepare(`
      INSERT INTO demo_trades
        (id, user_id, pair, direction, status, open_time, close_time, entry, close_price, stop_loss, stop_loss_original,
         target1, target2, balance_at_open, risk_amount, position_size, remaining_position_size, risk_reward, pnl_usdc, pnl_pct,
         realized_pnl_usdc, partial_pnl_usdc, target1_close_price, partial_trigger_r, trailing_trigger_r, max_duration_ms,
         initial_risk_amount, max_price_since_entry, min_price_since_entry,
         max_unrealized_pnl_usdc, min_unrealized_pnl_usdc,
         max_unrealized_pnl_before_partial, max_unrealized_pnl_after_partial,
         mfe_usdc, mae_usdc, mfe_r, mae_r,
         peak_giveback_usdc, open_giveback_usdc, total_giveback_usdc, peak_giveback_pct,
         last_management_update_at, management_timeline_json,
         exit_reason, target1_hit, is_breakeven_stop, trailing, signal_reasons_json, market_conditions, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status, close_time = excluded.close_time, close_price = excluded.close_price,
        pnl_usdc = excluded.pnl_usdc, pnl_pct = excluded.pnl_pct, exit_reason = excluded.exit_reason,
        remaining_position_size = excluded.remaining_position_size,
        realized_pnl_usdc = excluded.realized_pnl_usdc, partial_pnl_usdc = excluded.partial_pnl_usdc,
        target1_close_price = excluded.target1_close_price,
        partial_trigger_r = excluded.partial_trigger_r,
        trailing_trigger_r = excluded.trailing_trigger_r,
        max_duration_ms = excluded.max_duration_ms,
        initial_risk_amount = excluded.initial_risk_amount,
        max_price_since_entry = excluded.max_price_since_entry,
        min_price_since_entry = excluded.min_price_since_entry,
        max_unrealized_pnl_usdc = excluded.max_unrealized_pnl_usdc,
        min_unrealized_pnl_usdc = excluded.min_unrealized_pnl_usdc,
        max_unrealized_pnl_before_partial = excluded.max_unrealized_pnl_before_partial,
        max_unrealized_pnl_after_partial = excluded.max_unrealized_pnl_after_partial,
        mfe_usdc = excluded.mfe_usdc,
        mae_usdc = excluded.mae_usdc,
        mfe_r = excluded.mfe_r,
        mae_r = excluded.mae_r,
        peak_giveback_usdc = excluded.peak_giveback_usdc,
        open_giveback_usdc = excluded.open_giveback_usdc,
        total_giveback_usdc = excluded.total_giveback_usdc,
        peak_giveback_pct = excluded.peak_giveback_pct,
        last_management_update_at = excluded.last_management_update_at,
        management_timeline_json = excluded.management_timeline_json,
        stop_loss = excluded.stop_loss, target1_hit = excluded.target1_hit,
        is_breakeven_stop = excluded.is_breakeven_stop,
        trailing = excluded.trailing,
        updated_at = excluded.updated_at
    `).run(
      trade.id, userId, trade.pair, trade.direction, trade.status, trade.openTime, trade.closeTime ?? null,
      trade.entry, trade.closePrice ?? null, stopLoss, stopLossOriginal, trade.target1, trade.target2,
      trade.balanceAtOpen, trade.riskAmount, trade.positionSize, remainingPositionSize,
      trade.riskReward, trade.pnlUSDC ?? null, trade.pnlPct ?? null,
      realizedPnlUSDC, partialPnlUSDC, trade.target1ClosePrice ?? null,
      partialTriggerR, trailingTriggerR, trade.maxDurationMs ?? null,
      trade.initialRiskAmount ?? trade.riskAmount,
      trade.maxPriceSinceEntry ?? null,
      trade.minPriceSinceEntry ?? null,
      trade.maxUnrealizedPnlUSDC ?? null,
      trade.minUnrealizedPnlUSDC ?? null,
      trade.maxUnrealizedPnlBeforePartial ?? null,
      trade.maxUnrealizedPnlAfterPartial ?? null,
      trade.mfeUSDC ?? null,
      trade.maeUSDC ?? null,
      trade.mfeR ?? null,
      trade.maeR ?? null,
      trade.peakGivebackUSDC ?? null,
      trade.openGivebackUSDC ?? null,
      trade.totalGivebackUSDC ?? null,
      trade.peakGivebackPct ?? null,
      trade.lastManagementUpdateAt ?? null,
      JSON.stringify(managementTimeline),
      trade.exitReason ?? null, Number(target1Hit), Number(isBreakevenStop), Number(trailing),
      JSON.stringify(trade.signalReasons), trade.marketConditions, now, now,
    );
  }

  migrateSession(userId: string, session: DemoSession) {
    return this.transaction(() => {
      const hash = migrationHash(session);
      const key = `demo.localStorageMigration.${hash}`;
      const existing = this.db.prepare("SELECT value FROM app_settings WHERE user_id = ? AND key = ?").get(userId, key);
      if (existing) return { applied: false, hash, account: this.getAccount(userId), positions: this.getPositions(userId), trades: this.getTrades(userId) };
      this.putAccount(userId, { balance: session.balance, configuredBalance: session.configuredBalance, dailyStats: session.dailyStats });
      if (session.activeTrade) {
        try { this.postPosition(userId, session.activeTrade); } catch (err) { if (!(err instanceof HttpError && err.status === 409)) throw err; }
      }
      for (const trade of session.history) this.postTrade(userId, trade);
      this.setSetting(userId, key, "applied");
      return { applied: true, hash, account: this.getAccount(userId), positions: this.getPositions(userId), trades: this.getTrades(userId) };
    });
  }
}

export { AUTH_COOKIE_NAME };
