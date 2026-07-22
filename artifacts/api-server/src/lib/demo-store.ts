import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdirSync, chmodSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export type TradeDirection = "BUY" | "SELL";
export type TradeStatus = "OPEN" | "WIN" | "LOSS" | "BREAKEVEN";
export type TradeExitReason = "STOP_LOSS" | "BREAKEVEN" | "TARGET_1" | "TARGET_2";
export type ManagedTradeExitReason = TradeExitReason | "TIMEOUT" | "TIME_EXIT" | "TRAILING_STOP" | "LOSS_OF_STRENGTH" | "SESSION_END";
export type DemoDecision = "BUY" | "SELL" | "SEM ENTRADA";

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
  closePrice?: number;
  exitReason?: ManagedTradeExitReason;
  pnlUSDC?: number;
  pnlPct?: number;
  realizedPnlUSDC?: number;
  partialPnlUSDC?: number;
  target1ClosePrice?: number;
  maxDurationMs?: number;
  signalReasons: string[];
  marketConditions: string;
}

export interface DemoSession {
  balance: number;
  configuredBalance: number;
  activeTrade: DemoTrade | null;
  history: DemoTrade[];
  dailyStats: DailyStats;
  realizedPnlUSDC: number;
  unrealizedPnlUSDC: number;
  partialPnlUSDC: number;
  openRiskUSDC: number;
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

function isSafetyLimited(stats: DailyStats): boolean {
  return stats.safetyLimited ||
    stats.totalTrades >= 8 ||
    stats.consecutiveLosses >= 3 ||
    stats.dailyPnL <= -(stats.startOfDayBalance * 0.03);
}

function calcPositionSize(balance: number, entry: number, stop: number): { riskAmount: number; positionSize: number } {
  const riskAmount = balance * 0.01;
  const dist = Math.abs(entry - stop);
  return { riskAmount, positionSize: dist > 0 ? riskAmount / dist : 0 };
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
    realizedPnlUSDC: row.realized_pnl_usdc == null ? undefined : Number(row.realized_pnl_usdc),
    partialPnlUSDC: row.partial_pnl_usdc == null ? undefined : Number(row.partial_pnl_usdc),
    target1ClosePrice: row.target1_close_price == null ? undefined : Number(row.target1_close_price),
    maxDurationMs: row.max_duration_ms == null ? undefined : Number(row.max_duration_ms),
    signalReasons: jsonParse(String(row.signal_reasons_json), []),
    marketConditions: String(row.market_conditions),
  };
}

function diagnosticUserFromRow(row: Record<string, unknown>): WorkerDiagnosticUserDto {
  return {
    id: String(row.id),
    symbol: String(row.symbol),
    status: String(row.status) as WorkerDiagnosticStatus,
    direction: String(row.direction),
    quality: String(row.quality),
    summary: String(row.summary),
    decision: String(row.decision),
    score: row.score == null ? null : Number(row.score),
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

export class DemoStore {
  db: DatabaseSync;

  constructor(dbPath = process.env["ORACULO_DB_PATH"] ?? path.resolve(process.cwd(), "data", "oraculo.sqlite")) {
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
            realized_pnl_usdc REAL NOT NULL DEFAULT 0,
            partial_pnl_usdc REAL NOT NULL DEFAULT 0,
            target1_close_price REAL,
            max_duration_ms INTEGER NOT NULL DEFAULT 5400000,
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
            exit_reason TEXT,
            target1_hit INTEGER NOT NULL DEFAULT 0,
            is_breakeven_stop INTEGER NOT NULL DEFAULT 0,
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

  getSession(userId: string): DemoSession {
    const activeTrade = this.getPositions(userId)[0] ?? null;
    const history = this.getTrades(userId);
    const lastPrice = activeTrade
      ? this.getSetting<number | null>(userId, `demo.lastPrice.${activeTrade.pair}`, null)
      : null;
    const unrealizedPnlUSDC = activeTrade && lastPrice !== null
      ? this.unrealizedFor(activeTrade, lastPrice)
      : 0;
    const partialPnlUSDC = (activeTrade?.partialPnlUSDC ?? 0) +
      history.reduce((sum, trade) => sum + (trade.partialPnlUSDC ?? 0), 0);
    const realizedPnlUSDC = history.reduce((sum, trade) => sum + (trade.pnlUSDC ?? 0), 0) +
      (activeTrade?.realizedPnlUSDC ?? 0);
    return {
      ...this.getAccount(userId),
      activeTrade,
      history,
      realizedPnlUSDC,
      unrealizedPnlUSDC,
      partialPnlUSDC,
      openRiskUSDC: activeTrade ? Math.abs(activeTrade.entry - activeTrade.stopLoss) * (activeTrade.remainingPositionSize ?? activeTrade.positionSize) : 0,
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

  private validatePosition(body: unknown): DemoTrade {
    const input = body as Record<string, unknown>;
    const direction = nonEmptyString(input.direction, "direction");
    if (direction !== "BUY" && direction !== "SELL") throw new HttpError(400, "direction must be BUY or SELL");
    return {
      id: nonEmptyString(input.id, "id", 128),
      pair: nonEmptyString(input.pair, "pair", 32).toUpperCase(),
      direction,
      openTime: finiteNumber(input.openTime, "openTime", 1),
      entry: finiteNumber(input.entry, "entry", 0.00000001, MAX_PRICE),
      stopLoss: finiteNumber(input.stopLoss, "stopLoss", 0.00000001, MAX_PRICE),
      stopLossOriginal: finiteNumber(input.stopLossOriginal ?? input.stopLoss, "stopLossOriginal", 0.00000001, MAX_PRICE),
      target1: finiteNumber(input.target1, "target1", 0.00000001, MAX_PRICE),
      target2: finiteNumber(input.target2, "target2", 0.00000001, MAX_PRICE),
      balanceAtOpen: finiteNumber(input.balanceAtOpen, "balanceAtOpen", 0, MAX_BALANCE),
      riskAmount: finiteNumber(input.riskAmount, "riskAmount", 0, MAX_BALANCE),
      positionSize: finiteNumber(input.positionSize, "positionSize", 0, MAX_POSITION_SIZE),
      remainingPositionSize: finiteNumber(input.remainingPositionSize ?? input.positionSize, "remainingPositionSize", 0, MAX_POSITION_SIZE),
      riskReward: nonEmptyString(input.riskReward, "riskReward", 32),
      status: "OPEN",
      target1Hit: bool(input.target1Hit),
      isBreakevenStop: bool(input.isBreakevenStop),
      realizedPnlUSDC: finiteNumber(input.realizedPnlUSDC ?? 0, "realizedPnlUSDC", -MAX_BALANCE, MAX_BALANCE),
      partialPnlUSDC: finiteNumber(input.partialPnlUSDC ?? 0, "partialPnlUSDC", -MAX_BALANCE, MAX_BALANCE),
      target1ClosePrice: input.target1ClosePrice === undefined ? undefined : finiteNumber(input.target1ClosePrice, "target1ClosePrice", 0.00000001, MAX_PRICE),
      maxDurationMs: finiteNumber(input.maxDurationMs ?? DEFAULT_MAX_DURATION_MS, "maxDurationMs", 60_000, 24 * 60 * 60 * 1000),
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
           balance_at_open, risk_amount, position_size, remaining_position_size, risk_reward, target1_hit, is_breakeven_stop,
           realized_pnl_usdc, partial_pnl_usdc, target1_close_price, max_duration_ms,
           signal_reasons_json, market_conditions, updated_at)
        VALUES (?, ?, ?, ?, 'OPEN', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        position.id, userId, position.pair, position.direction, position.openTime, position.entry, position.stopLoss,
        position.stopLossOriginal, position.target1, position.target2, position.balanceAtOpen, position.riskAmount,
        position.positionSize, position.remainingPositionSize, position.riskReward, Number(position.target1Hit), Number(position.isBreakevenStop),
        position.realizedPnlUSDC ?? 0, position.partialPnlUSDC ?? 0, position.target1ClosePrice ?? null, position.maxDurationMs ?? DEFAULT_MAX_DURATION_MS,
        JSON.stringify(position.signalReasons), position.marketConditions, now,
      );
    } catch (err) {
      if (String((err as Error).message).includes("UNIQUE")) throw new HttpError(409, "an open position already exists for this pair");
      throw err;
    }
    this.setSetting(userId, `demo.priceHistory.${position.id}`, [{ price: position.entry, at: position.openTime }]);
    return position;
  }

  openFromSignal(userId: string, body: unknown) {
    const input = body as DemoSignalInput;
    const pair = nonEmptyString(input.pair, "pair", 32).toUpperCase();
    const decision = input.decision;
    if (decision !== "BUY" && decision !== "SELL") return this.getSession(userId);
    const entry = finiteNumber(input.entryNum, "entryNum", 0.00000001, MAX_PRICE);
    const stop = finiteNumber(input.stopLossNum, "stopLossNum", 0.00000001, MAX_PRICE);
    const target1 = finiteNumber(input.target1Num, "target1Num", 0.00000001, MAX_PRICE);
    const target2 = finiteNumber(input.target2Num, "target2Num", 0.00000001, MAX_PRICE);
    const key = `signal:${signalKey({ ...input, pair })}`;
    return this.transaction(() => {
      const existingEvent = this.db.prepare("SELECT event_key FROM demo_events WHERE event_key = ?").get(`${userId}:${key}`);
      if (existingEvent) return this.getSession(userId);
      if (this.getPositions(userId).some((position) => position.pair === pair)) {
        this.recordEvent(userId, key, "duplicate_signal_blocked", null);
        return this.getSession(userId);
      }
      const account = this.getAccount(userId);
      if (isSafetyLimited(account.dailyStats)) {
        this.recordEvent(userId, key, "risk_limited_signal_blocked", null);
        return this.getSession(userId);
      }
      const { riskAmount, positionSize } = calcPositionSize(account.balance, entry, stop);
      const steps = Array.isArray(input.steps) ? input.steps : [];
      const signalReasons = steps.slice(0, 10).map((step) =>
        `[${step.number ?? "?"}] ${step.name ?? "Regra"}: ${step.value ?? "-"} - ${step.reason ?? ""}`,
      );
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
        realizedPnlUSDC: 0,
        partialPnlUSDC: 0,
        maxDurationMs: this.tradeManagementSettings(userId).maxDurationMs,
        signalReasons,
        marketConditions: signalReasons.join(" | "),
      };
      this.postPosition(userId, trade);
      this.setSetting(userId, `demo.priceHistory.${trade.id}`, [{ price: entry, at: Date.now() }]);
      this.recordEvent(userId, key, "signal_opened", trade.id);
      return this.getSession(userId);
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

  private applyPriceToPosition(userId: string, trade: DemoTrade, price: number): void {
    const isBuy = trade.direction === "BUY";
    const settings = this.tradeManagementSettings(userId);
    const history = this.pushPriceHistory(userId, trade, price);

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
    if (!trade.target1Hit && (isBuy ? price >= trade.target1 : price <= trade.target1)) {
      const key = `target1:${trade.id}`;
      if (this.recordEvent(userId, key, "target1", trade.id)) {
        current = this.realizeTarget1(userId, trade, settings.breakevenBufferPct);
      }
    }

    if (current.target1Hit) {
      current = this.updateTrailingStop(userId, current, price, settings.trailingStopPct, history);
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

  private realizeTarget1(userId: string, trade: DemoTrade, bufferPct: number): DemoTrade {
    const latest = this.getOpenPosition(userId, trade.id) ?? trade;
    if (latest.target1Hit) return latest;
    const currentRemaining = latest.remainingPositionSize ?? latest.positionSize;
    const closedSize = Math.min(currentRemaining, latest.positionSize * 0.5);
    const remainingPositionSize = Math.max(0, currentRemaining - closedSize);
    const partialPnlUSDC = trade.direction === "BUY"
      ? (latest.target1 - latest.entry) * closedSize
      : (latest.entry - latest.target1) * closedSize;
    const rawBreakevenStop = latest.direction === "BUY"
      ? latest.entry * (1 + bufferPct)
      : latest.entry * (1 - bufferPct);
    const stopLoss = latest.direction === "BUY"
      ? Math.max(latest.stopLoss, rawBreakevenStop)
      : Math.min(latest.stopLoss, rawBreakevenStop);
    const realizedPnlUSDC = (latest.realizedPnlUSDC ?? 0) + partialPnlUSDC;
    const next = {
      ...latest,
      target1Hit: true,
      stopLoss,
      isBreakevenStop: true,
      remainingPositionSize,
      realizedPnlUSDC,
      partialPnlUSDC,
      target1ClosePrice: latest.target1,
    };
    this.db.prepare(`
      UPDATE demo_positions
      SET stop_loss = ?, target1_hit = 1, is_breakeven_stop = 1,
          remaining_position_size = ?, realized_pnl_usdc = ?, partial_pnl_usdc = ?,
          target1_close_price = ?, updated_at = ?
      WHERE user_id = ? AND id = ? AND status = 'OPEN'
    `).run(stopLoss, remainingPositionSize, realizedPnlUSDC, partialPnlUSDC, latest.target1, nowIso(), userId, latest.id);
    const withReason = this.appendPositionReason(userId, next, `TARGET_1 parcial: realizou ${closedSize.toFixed(8)} em ${latest.target1}; PnL parcial ${partialPnlUSDC.toFixed(8)}; stop movido para breakeven ${stopLoss.toFixed(8)} com buffer ${(bufferPct * 100).toFixed(4)}%.`);

    const account = this.getAccount(userId);
    const stats = { ...account.dailyStats };
    stats.dailyPnL += partialPnlUSDC;
    const newBalance = account.balance + partialPnlUSDC;
    stats.peakBalance = Math.max(stats.peakBalance, newBalance);
    stats.maxDrawdown = Math.max(stats.maxDrawdown, stats.peakBalance - newBalance);
    stats.safetyLimited = isSafetyLimited(stats);
    this.putAccount(userId, { balance: newBalance, configuredBalance: account.configuredBalance, dailyStats: stats });
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

  private updateTrailingStop(userId: string, trade: DemoTrade, price: number, trailingPct: number, history: Array<{ price: number; at: number }>): DemoTrade {
    if (!Number.isFinite(price) || price <= 0) return trade;
    const adaptivePct = this.adaptiveTrailingPct(trade, price, trailingPct, history);
    const nextStop = trade.direction === "BUY"
      ? Math.max(trade.stopLoss, price * (1 - adaptivePct))
      : Math.min(trade.stopLoss, price * (1 + adaptivePct));
    if (nextStop === trade.stopLoss) return trade;
    this.db.prepare("UPDATE demo_positions SET stop_loss = ?, updated_at = ? WHERE user_id = ? AND id = ? AND status = 'OPEN'")
      .run(nextStop, nowIso(), userId, trade.id);
    const next = { ...trade, stopLoss: nextStop };
    return this.appendPositionReason(userId, next, `TRAILING: stop ajustado para ${nextStop.toFixed(8)} usando ${(adaptivePct * 100).toFixed(3)}% adaptativo pela volatilidade recente.`);
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
      this.appendPositionReason(userId, trade, `LOSS_OF_STRENGTH: ${signals}/4 sinais ativos; fechamento contrario=${contraryClose}; falha continuacao=${failedContinuation}; reversao curta=${shortStructureReversal}; perda breakeven=${lostBreakevenBuffer}.`);
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
    };
    this.upsertTrade(userId, closed);
    this.db.prepare("DELETE FROM demo_positions WHERE user_id = ? AND id = ?").run(userId, position.id);
    const account = this.getAccount(userId);
    const stats = { ...account.dailyStats };
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
    stats.safetyLimited = stats.totalTrades >= 8 || stats.consecutiveLosses >= 3 || stats.dailyPnL <= -(stats.startOfDayBalance * 0.03);
    this.putAccount(userId, { balance: newBalance, configuredBalance: account.configuredBalance, dailyStats: stats });
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
    this.db.prepare(`
      INSERT INTO demo_trades
        (id, user_id, pair, direction, status, open_time, close_time, entry, close_price, stop_loss, stop_loss_original,
         target1, target2, balance_at_open, risk_amount, position_size, remaining_position_size, risk_reward, pnl_usdc, pnl_pct,
         realized_pnl_usdc, partial_pnl_usdc, target1_close_price, max_duration_ms,
         exit_reason, target1_hit, is_breakeven_stop, signal_reasons_json, market_conditions, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status, close_time = excluded.close_time, close_price = excluded.close_price,
        pnl_usdc = excluded.pnl_usdc, pnl_pct = excluded.pnl_pct, exit_reason = excluded.exit_reason,
        remaining_position_size = excluded.remaining_position_size,
        realized_pnl_usdc = excluded.realized_pnl_usdc, partial_pnl_usdc = excluded.partial_pnl_usdc,
        target1_close_price = excluded.target1_close_price, max_duration_ms = excluded.max_duration_ms,
        stop_loss = excluded.stop_loss, target1_hit = excluded.target1_hit,
        is_breakeven_stop = excluded.is_breakeven_stop, updated_at = excluded.updated_at
    `).run(
      trade.id, userId, trade.pair, trade.direction, trade.status, trade.openTime, trade.closeTime ?? null,
      trade.entry, trade.closePrice ?? null, trade.stopLoss, trade.stopLossOriginal, trade.target1, trade.target2,
      trade.balanceAtOpen, trade.riskAmount, trade.positionSize, trade.remainingPositionSize ?? trade.positionSize,
      trade.riskReward, trade.pnlUSDC ?? null, trade.pnlPct ?? null,
      trade.realizedPnlUSDC ?? null, trade.partialPnlUSDC ?? null, trade.target1ClosePrice ?? null, trade.maxDurationMs ?? null,
      trade.exitReason ?? null, Number(trade.target1Hit), Number(trade.isBreakevenStop),
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
