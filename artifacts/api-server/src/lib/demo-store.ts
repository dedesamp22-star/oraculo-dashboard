import { createHash, createHmac, timingSafeEqual } from "node:crypto";
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

  getAccount() {
    const row = this.db.prepare("SELECT * FROM demo_account WHERE id = 1").get() as Record<string, unknown> | undefined;
    if (!row) throw new HttpError(500, "demo account is not initialized");
    return accountFromRow(row);
  }

  getSession(): DemoSession {
    const activeTrade = this.getPositions()[0] ?? null;
    const history = this.getTrades();
    const lastPrice = activeTrade
      ? this.getSetting<number | null>(`demo.lastPrice.${activeTrade.pair}`, null)
      : null;
    const unrealizedPnlUSDC = activeTrade && lastPrice !== null
      ? this.unrealizedFor(activeTrade, lastPrice)
      : 0;
    const partialPnlUSDC = (activeTrade?.partialPnlUSDC ?? 0) +
      history.reduce((sum, trade) => sum + (trade.partialPnlUSDC ?? 0), 0);
    const realizedPnlUSDC = history.reduce((sum, trade) => sum + (trade.pnlUSDC ?? 0), 0) +
      (activeTrade?.realizedPnlUSDC ?? 0);
    return {
      ...this.getAccount(),
      activeTrade,
      history,
      realizedPnlUSDC,
      unrealizedPnlUSDC,
      partialPnlUSDC,
      openRiskUSDC: activeTrade ? Math.abs(activeTrade.entry - activeTrade.stopLoss) * (activeTrade.remainingPositionSize ?? activeTrade.positionSize) : 0,
    };
  }

  getSetting<T>(key: string, fallback: T): T {
    const row = this.db.prepare("SELECT value FROM app_settings WHERE key = ?").get(key) as Record<string, unknown> | undefined;
    if (!row) return fallback;
    return jsonParse<T>(row.value, fallback);
  }

  setSetting(key: string, value: unknown): void {
    this.db.prepare(`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(key, JSON.stringify(value), nowIso());
  }

  getAutomation() {
    return this.getSetting("demo.automation", { enabled: false, symbol: "BTCUSDT" });
  }

  tradeManagementSettings() {
    return this.getSetting("demo.tradeManagement", {
      maxDurationMs: DEFAULT_MAX_DURATION_MS,
      breakevenBufferPct: DEFAULT_BREAKEVEN_BUFFER_PCT,
      trailingStopPct: DEFAULT_TRAILING_STOP_PCT,
      lossOfStrengthPct: DEFAULT_LOSS_OF_STRENGTH_PCT,
      closeAtOperationalEnd: false,
    });
  }

  setAutomation(body: unknown) {
    const input = body as Record<string, unknown>;
    const enabled = input.enabled === true;
    const symbol = typeof input.symbol === "string" && input.symbol.trim() ? input.symbol.toUpperCase() : "BTCUSDT";
    const next = { enabled, symbol };
    this.setSetting("demo.automation", next);
    return next;
  }

  putAccount(body: unknown) {
    const input = body as Record<string, unknown>;
    const balance = finiteNumber(input.balance, "balance", 0, MAX_BALANCE);
    const configuredBalance = finiteNumber(input.configuredBalance ?? input.configured_balance, "configuredBalance", 0, MAX_BALANCE);
    const dailyStats = input.dailyStats ?? makeDailyStats(balance);
    const now = nowIso();
    this.db.prepare(`
      UPDATE demo_account
      SET balance = ?, configured_balance = ?, daily_stats_json = ?, updated_at = ?
      WHERE id = 1
    `).run(balance, configuredBalance, JSON.stringify(dailyStats), now);
    return this.getAccount();
  }

  resetSession(body: unknown) {
    const input = body as Record<string, unknown>;
    const configuredBalance = finiteNumber(input.configuredBalance ?? DEFAULT_BALANCE, "configuredBalance", 100, MAX_BALANCE);
    return this.transaction(() => {
      this.db.prepare("DELETE FROM demo_positions").run();
      this.db.prepare("DELETE FROM demo_trades").run();
      this.db.prepare("DELETE FROM demo_events").run();
      this.putAccount({ balance: configuredBalance, configuredBalance, dailyStats: makeDailyStats(configuredBalance) });
      return this.getSession();
    });
  }

  getPositions() {
    return (this.db.prepare("SELECT * FROM demo_positions WHERE status = 'OPEN' ORDER BY open_time DESC").all() as Record<string, unknown>[]).map(tradeFromRow);
  }

  getTrades() {
    return (this.db.prepare("SELECT * FROM demo_trades ORDER BY COALESCE(close_time, open_time) DESC").all() as Record<string, unknown>[]).map(tradeFromRow);
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

  postPosition(body: unknown) {
    const position = this.validatePosition(body);
    const now = nowIso();
    try {
      this.db.prepare(`
        INSERT INTO demo_positions
          (id, pair, direction, status, open_time, entry, stop_loss, stop_loss_original, target1, target2,
           balance_at_open, risk_amount, position_size, remaining_position_size, risk_reward, target1_hit, is_breakeven_stop,
           realized_pnl_usdc, partial_pnl_usdc, target1_close_price, max_duration_ms,
           signal_reasons_json, market_conditions, updated_at)
        VALUES (?, ?, ?, 'OPEN', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        position.id, position.pair, position.direction, position.openTime, position.entry, position.stopLoss,
        position.stopLossOriginal, position.target1, position.target2, position.balanceAtOpen, position.riskAmount,
        position.positionSize, position.remainingPositionSize, position.riskReward, Number(position.target1Hit), Number(position.isBreakevenStop),
        position.realizedPnlUSDC ?? 0, position.partialPnlUSDC ?? 0, position.target1ClosePrice ?? null, position.maxDurationMs ?? DEFAULT_MAX_DURATION_MS,
        JSON.stringify(position.signalReasons), position.marketConditions, now,
      );
    } catch (err) {
      if (String((err as Error).message).includes("UNIQUE")) throw new HttpError(409, "an open position already exists for this pair");
      throw err;
    }
    this.setSetting(`demo.priceHistory.${position.id}`, [{ price: position.entry, at: position.openTime }]);
    return position;
  }

  openFromSignal(body: unknown) {
    const input = body as DemoSignalInput;
    const pair = nonEmptyString(input.pair, "pair", 32).toUpperCase();
    const decision = input.decision;
    if (decision !== "BUY" && decision !== "SELL") return this.getSession();
    const entry = finiteNumber(input.entryNum, "entryNum", 0.00000001, MAX_PRICE);
    const stop = finiteNumber(input.stopLossNum, "stopLossNum", 0.00000001, MAX_PRICE);
    const target1 = finiteNumber(input.target1Num, "target1Num", 0.00000001, MAX_PRICE);
    const target2 = finiteNumber(input.target2Num, "target2Num", 0.00000001, MAX_PRICE);
    const key = `signal:${signalKey({ ...input, pair })}`;
    return this.transaction(() => {
      const existingEvent = this.db.prepare("SELECT event_key FROM demo_events WHERE event_key = ?").get(key);
      if (existingEvent) return this.getSession();
      if (this.getPositions().some((position) => position.pair === pair)) {
        this.recordEvent(key, "duplicate_signal_blocked", null);
        return this.getSession();
      }
      const account = this.getAccount();
      if (isSafetyLimited(account.dailyStats)) {
        this.recordEvent(key, "risk_limited_signal_blocked", null);
        return this.getSession();
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
        maxDurationMs: this.tradeManagementSettings().maxDurationMs,
        signalReasons,
        marketConditions: signalReasons.join(" | "),
      };
      this.postPosition(trade);
      this.setSetting(`demo.priceHistory.${trade.id}`, [{ price: entry, at: Date.now() }]);
      this.recordEvent(key, "signal_opened", trade.id);
      return this.getSession();
    });
  }

  updatePrices(body: unknown) {
    const input = body as Record<string, unknown>;
    const price = finiteNumber(input.price, "price", 0.00000001, MAX_PRICE);
    const pair = typeof input.pair === "string" ? input.pair.toUpperCase() : undefined;
    return this.transaction(() => {
      const positions = this.getPositions().filter((position) => !pair || position.pair === pair);
      for (const position of positions) this.setSetting(`demo.lastPrice.${position.pair}`, price);
      for (const trade of positions) this.applyPriceToPosition(trade, price);
      return this.getSession();
    });
  }

  patchPosition(id: string, body: unknown) {
    return this.transaction(() => {
      const row = this.db.prepare("SELECT * FROM demo_positions WHERE id = ? AND status = 'OPEN'").get(id) as Record<string, unknown> | undefined;
      if (!row) throw new HttpError(404, "open position not found");
      const current = tradeFromRow(row);
      const input = body as Record<string, unknown>;
      if (input.status && input.status !== "OPEN") {
        const closePrice = finiteNumber(input.closePrice, "closePrice", 0.00000001, MAX_PRICE);
        const reason = nonEmptyString(input.exitReason, "exitReason") as ManagedTradeExitReason;
        if (!["STOP_LOSS", "BREAKEVEN", "TARGET_1", "TARGET_2", "TIMEOUT", "TIME_EXIT", "TRAILING_STOP", "LOSS_OF_STRENGTH", "SESSION_END"].includes(reason)) throw new HttpError(400, "invalid exitReason");
        return this.closePosition(current, closePrice, reason);
      }

      const stopLoss = input.stopLoss === undefined ? current.stopLoss : finiteNumber(input.stopLoss, "stopLoss", 0.00000001, MAX_PRICE);
      const target1Hit = input.target1Hit === undefined ? current.target1Hit : bool(input.target1Hit);
      const isBreakevenStop = input.isBreakevenStop === undefined ? current.isBreakevenStop : bool(input.isBreakevenStop);
      this.db.prepare(`
        UPDATE demo_positions
        SET stop_loss = ?, target1_hit = ?, is_breakeven_stop = ?, updated_at = ?
        WHERE id = ?
      `).run(stopLoss, Number(target1Hit), Number(isBreakevenStop), nowIso(), id);
      return { ...current, stopLoss, target1Hit, isBreakevenStop };
    });
  }

  private recordEvent(key: string, type: string, tradeId: string | null): boolean {
    const result = this.db.prepare(`
      INSERT OR IGNORE INTO demo_events (event_key, event_type, trade_id, created_at)
      VALUES (?, ?, ?, ?)
    `).run(key, type, tradeId, nowIso());
    return result.changes > 0;
  }

  private getOpenPosition(id: string): DemoTrade | null {
    const row = this.db.prepare("SELECT * FROM demo_positions WHERE id = ? AND status = 'OPEN'").get(id) as Record<string, unknown> | undefined;
    return row ? tradeFromRow(row) : null;
  }

  private priceHistory(tradeId: string): Array<{ price: number; at: number }> {
    const rows = this.getSetting<Array<{ price: number; at: number }>>(`demo.priceHistory.${tradeId}`, []);
    return rows.filter((row) =>
      typeof row === "object"
      && Number.isFinite(row.price)
      && row.price > 0
      && Number.isFinite(row.at)
      && row.at > 0,
    ).slice(-PRICE_HISTORY_LIMIT);
  }

  private pushPriceHistory(trade: DemoTrade, price: number): Array<{ price: number; at: number }> {
    const next = [...this.priceHistory(trade.id), { price, at: Date.now() }].slice(-PRICE_HISTORY_LIMIT);
    this.setSetting(`demo.priceHistory.${trade.id}`, next);
    return next;
  }

  private appendPositionReason(trade: DemoTrade, reason: string): DemoTrade {
    const signalReasons = [...trade.signalReasons, reason].slice(-40);
    const marketConditions = signalReasons.join(" | ");
    this.db.prepare("UPDATE demo_positions SET signal_reasons_json = ?, market_conditions = ?, updated_at = ? WHERE id = ? AND status = 'OPEN'")
      .run(JSON.stringify(signalReasons), marketConditions, nowIso(), trade.id);
    return { ...trade, signalReasons, marketConditions };
  }

  private unrealizedFor(trade: DemoTrade, price: number): number {
    const size = trade.remainingPositionSize ?? trade.positionSize;
    return trade.direction === "BUY"
      ? (price - trade.entry) * size
      : (trade.entry - price) * size;
  }

  private applyPriceToPosition(trade: DemoTrade, price: number): void {
    const isBuy = trade.direction === "BUY";
    const settings = this.tradeManagementSettings();
    const history = this.pushPriceHistory(trade, price);

    if (isBuy ? price <= trade.stopLoss : price >= trade.stopLoss) {
      const reason: ManagedTradeExitReason = trade.isBreakevenStop ? "BREAKEVEN" : "STOP_LOSS";
      const key = `close:${trade.id}:${reason}`;
      if (this.recordEvent(key, "close", trade.id)) this.closePosition(trade, trade.stopLoss, reason);
      return;
    }

    if (isBuy ? price >= trade.target2 : price <= trade.target2) {
      const key = `close:${trade.id}:TARGET_2`;
      if (this.recordEvent(key, "close", trade.id)) this.closePosition(trade, trade.target2, "TARGET_2");
      return;
    }

    let current = trade;
    if (!trade.target1Hit && (isBuy ? price >= trade.target1 : price <= trade.target1)) {
      const key = `target1:${trade.id}`;
      if (this.recordEvent(key, "target1", trade.id)) {
        current = this.realizeTarget1(trade, settings.breakevenBufferPct);
      }
    }

    if (current.target1Hit) {
      current = this.updateTrailingStop(current, price, settings.trailingStopPct, history);
      if (this.lossOfStrengthReached(current, price, settings.lossOfStrengthPct, history)) {
        const key = `close:${current.id}:LOSS_OF_STRENGTH`;
        if (this.recordEvent(key, "close", current.id)) this.closePosition(current, price, "LOSS_OF_STRENGTH");
        return;
      }
    }

    if (tradeAgeMs(current) >= (current.maxDurationMs ?? settings.maxDurationMs)) {
      const key = `close:${current.id}:TIMEOUT`;
      if (this.recordEvent(key, "close", current.id)) this.closePosition(current, price, "TIMEOUT");
    }
  }

  private realizeTarget1(trade: DemoTrade, bufferPct: number): DemoTrade {
    const latest = this.getOpenPosition(trade.id) ?? trade;
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
      WHERE id = ? AND status = 'OPEN'
    `).run(stopLoss, remainingPositionSize, realizedPnlUSDC, partialPnlUSDC, latest.target1, nowIso(), latest.id);
    const withReason = this.appendPositionReason(next, `TARGET_1 parcial: realizou ${closedSize.toFixed(8)} em ${latest.target1}; PnL parcial ${partialPnlUSDC.toFixed(8)}; stop movido para breakeven ${stopLoss.toFixed(8)} com buffer ${(bufferPct * 100).toFixed(4)}%.`);

    const account = this.getAccount();
    const stats = { ...account.dailyStats };
    stats.dailyPnL += partialPnlUSDC;
    const newBalance = account.balance + partialPnlUSDC;
    stats.peakBalance = Math.max(stats.peakBalance, newBalance);
    stats.maxDrawdown = Math.max(stats.maxDrawdown, stats.peakBalance - newBalance);
    stats.safetyLimited = isSafetyLimited(stats);
    this.putAccount({ balance: newBalance, configuredBalance: account.configuredBalance, dailyStats: stats });
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

  private updateTrailingStop(trade: DemoTrade, price: number, trailingPct: number, history: Array<{ price: number; at: number }>): DemoTrade {
    if (!Number.isFinite(price) || price <= 0) return trade;
    const adaptivePct = this.adaptiveTrailingPct(trade, price, trailingPct, history);
    const nextStop = trade.direction === "BUY"
      ? Math.max(trade.stopLoss, price * (1 - adaptivePct))
      : Math.min(trade.stopLoss, price * (1 + adaptivePct));
    if (nextStop === trade.stopLoss) return trade;
    this.db.prepare("UPDATE demo_positions SET stop_loss = ?, updated_at = ? WHERE id = ? AND status = 'OPEN'")
      .run(nextStop, nowIso(), trade.id);
    const next = { ...trade, stopLoss: nextStop };
    return this.appendPositionReason(next, `TRAILING: stop ajustado para ${nextStop.toFixed(8)} usando ${(adaptivePct * 100).toFixed(3)}% adaptativo pela volatilidade recente.`);
  }

  private lossOfStrengthReached(trade: DemoTrade, price: number, thresholdPct: number, history: Array<{ price: number; at: number }>): boolean {
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
      this.appendPositionReason(trade, `LOSS_OF_STRENGTH: ${signals}/4 sinais ativos; fechamento contrario=${contraryClose}; falha continuacao=${failedContinuation}; reversao curta=${shortStructureReversal}; perda breakeven=${lostBreakevenBuffer}.`);
      return true;
    }
    if (signals === 1) {
      this.appendPositionReason(trade, `ALERTA perda de forca: 1/4 sinal ativo; posicao mantida.`);
    }
    return false;
  }

  private closePosition(position: DemoTrade, closePrice: number, exitReason: ManagedTradeExitReason) {
    const latest = this.getOpenPosition(position.id);
    if (!latest) {
      return this.getTrades().find((trade) => trade.id === position.id) ?? position;
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
    this.upsertTrade(closed);
    this.db.prepare("DELETE FROM demo_positions WHERE id = ?").run(position.id);
    const account = this.getAccount();
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
    this.putAccount({ balance: newBalance, configuredBalance: account.configuredBalance, dailyStats: stats });
    return closed;
  }

  postTrade(body: unknown) {
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
    this.upsertTrade(fullTrade);
    return fullTrade;
  }

  private upsertTrade(trade: DemoTrade): void {
    const now = nowIso();
    this.db.prepare(`
      INSERT INTO demo_trades
        (id, pair, direction, status, open_time, close_time, entry, close_price, stop_loss, stop_loss_original,
         target1, target2, balance_at_open, risk_amount, position_size, remaining_position_size, risk_reward, pnl_usdc, pnl_pct,
         realized_pnl_usdc, partial_pnl_usdc, target1_close_price, max_duration_ms,
         exit_reason, target1_hit, is_breakeven_stop, signal_reasons_json, market_conditions, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status, close_time = excluded.close_time, close_price = excluded.close_price,
        pnl_usdc = excluded.pnl_usdc, pnl_pct = excluded.pnl_pct, exit_reason = excluded.exit_reason,
        remaining_position_size = excluded.remaining_position_size,
        realized_pnl_usdc = excluded.realized_pnl_usdc, partial_pnl_usdc = excluded.partial_pnl_usdc,
        target1_close_price = excluded.target1_close_price, max_duration_ms = excluded.max_duration_ms,
        stop_loss = excluded.stop_loss, target1_hit = excluded.target1_hit,
        is_breakeven_stop = excluded.is_breakeven_stop, updated_at = excluded.updated_at
    `).run(
      trade.id, trade.pair, trade.direction, trade.status, trade.openTime, trade.closeTime ?? null,
      trade.entry, trade.closePrice ?? null, trade.stopLoss, trade.stopLossOriginal, trade.target1, trade.target2,
      trade.balanceAtOpen, trade.riskAmount, trade.positionSize, trade.remainingPositionSize ?? trade.positionSize,
      trade.riskReward, trade.pnlUSDC ?? null, trade.pnlPct ?? null,
      trade.realizedPnlUSDC ?? null, trade.partialPnlUSDC ?? null, trade.target1ClosePrice ?? null, trade.maxDurationMs ?? null,
      trade.exitReason ?? null, Number(trade.target1Hit), Number(trade.isBreakevenStop),
      JSON.stringify(trade.signalReasons), trade.marketConditions, now, now,
    );
  }

  migrateSession(session: DemoSession) {
    return this.transaction(() => {
      const hash = migrationHash(session);
      const key = `demo.localStorageMigration.${hash}`;
      const existing = this.db.prepare("SELECT value FROM app_settings WHERE key = ?").get(key);
      if (existing) return { applied: false, hash, account: this.getAccount(), positions: this.getPositions(), trades: this.getTrades() };
      this.putAccount({ balance: session.balance, configuredBalance: session.configuredBalance, dailyStats: session.dailyStats });
      if (session.activeTrade) {
        try { this.postPosition(session.activeTrade); } catch (err) { if (!(err instanceof HttpError && err.status === 409)) throw err; }
      }
      for (const trade of session.history) this.postTrade(trade);
      this.db.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES (?, 'applied', ?)").run(key, nowIso());
      return { applied: true, hash, account: this.getAccount(), positions: this.getPositions(), trades: this.getTrades() };
    });
  }
}

export function signSession(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function makeSessionCookie(secret: string): string {
  const payload = Buffer.from(JSON.stringify({ sub: "admin", iat: Date.now() })).toString("base64url");
  return `${payload}.${signSession(payload, secret)}`;
}

export function verifySessionCookie(cookie: string | undefined, secret: string | undefined): boolean {
  if (!cookie || !secret) return false;
  const [payload, sig] = cookie.split(".");
  if (!payload || !sig) return false;
  const expected = signSession(payload, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
