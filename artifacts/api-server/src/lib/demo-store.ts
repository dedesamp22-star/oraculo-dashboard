import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { mkdirSync, chmodSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export type TradeDirection = "BUY" | "SELL";
export type TradeStatus = "OPEN" | "WIN" | "LOSS" | "BREAKEVEN";
export type TradeExitReason = "STOP_LOSS" | "BREAKEVEN" | "TARGET_1" | "TARGET_2";
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
  riskReward: string;
  status: TradeStatus;
  target1Hit: boolean;
  isBreakevenStop: boolean;
  closePrice?: number;
  exitReason?: TradeExitReason;
  pnlUSDC?: number;
  pnlPct?: number;
  signalReasons: string[];
  marketConditions: string;
}

export interface DemoSession {
  balance: number;
  configuredBalance: number;
  activeTrade: DemoTrade | null;
  history: DemoTrade[];
  dailyStats: DailyStats;
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
    riskReward: String(row.risk_reward),
    pnlUSDC: row.pnl_usdc == null ? undefined : Number(row.pnl_usdc),
    pnlPct: row.pnl_pct == null ? undefined : Number(row.pnl_pct),
    exitReason: row.exit_reason == null ? undefined : String(row.exit_reason) as TradeExitReason,
    target1Hit: Boolean(row.target1_hit),
    isBreakevenStop: Boolean(row.is_breakeven_stop),
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
            risk_reward TEXT NOT NULL,
            target1_hit INTEGER NOT NULL DEFAULT 0,
            is_breakeven_stop INTEGER NOT NULL DEFAULT 0,
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
            risk_reward TEXT NOT NULL,
            pnl_usdc REAL,
            pnl_pct REAL,
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
    return {
      ...this.getAccount(),
      activeTrade: this.getPositions()[0] ?? null,
      history: this.getTrades(),
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
      riskReward: nonEmptyString(input.riskReward, "riskReward", 32),
      status: "OPEN",
      target1Hit: bool(input.target1Hit),
      isBreakevenStop: bool(input.isBreakevenStop),
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
           balance_at_open, risk_amount, position_size, risk_reward, target1_hit, is_breakeven_stop,
           signal_reasons_json, market_conditions, updated_at)
        VALUES (?, ?, ?, 'OPEN', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        position.id, position.pair, position.direction, position.openTime, position.entry, position.stopLoss,
        position.stopLossOriginal, position.target1, position.target2, position.balanceAtOpen, position.riskAmount,
        position.positionSize, position.riskReward, Number(position.target1Hit), Number(position.isBreakevenStop),
        JSON.stringify(position.signalReasons), position.marketConditions, now,
      );
    } catch (err) {
      if (String((err as Error).message).includes("UNIQUE")) throw new HttpError(409, "an open position already exists for this pair");
      throw err;
    }
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
        riskReward: input.riskReward ?? "-",
        status: "OPEN",
        target1Hit: false,
        isBreakevenStop: false,
        signalReasons,
        marketConditions: signalReasons.join(" | "),
      };
      this.postPosition(trade);
      const stats = { ...account.dailyStats, totalTrades: account.dailyStats.totalTrades + 1 };
      stats.safetyLimited = isSafetyLimited(stats);
      this.putAccount({ balance: account.balance, configuredBalance: account.configuredBalance, dailyStats: stats });
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
        const reason = nonEmptyString(input.exitReason, "exitReason") as TradeExitReason;
        if (!["STOP_LOSS", "BREAKEVEN", "TARGET_1", "TARGET_2"].includes(reason)) throw new HttpError(400, "invalid exitReason");
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

  private applyPriceToPosition(trade: DemoTrade, price: number): void {
    const isBuy = trade.direction === "BUY";
    if (isBuy ? price >= trade.target2 : price <= trade.target2) {
      const key = `close:${trade.id}:TARGET_2`;
      if (this.recordEvent(key, "close", trade.id)) this.closePosition(trade, trade.target2, "TARGET_2");
      return;
    }

    let current = trade;
    if (!trade.target1Hit && (isBuy ? price >= trade.target1 : price <= trade.target1)) {
      const key = `target1:${trade.id}`;
      if (this.recordEvent(key, "target1", trade.id)) {
        current = { ...trade, target1Hit: true, stopLoss: trade.entry, isBreakevenStop: true };
        this.db.prepare(`
          UPDATE demo_positions
          SET stop_loss = ?, target1_hit = 1, is_breakeven_stop = 1, updated_at = ?
          WHERE id = ? AND status = 'OPEN'
        `).run(current.stopLoss, nowIso(), current.id);
      }
    }

    if (isBuy ? price <= current.stopLoss : price >= current.stopLoss) {
      const reason: TradeExitReason = current.isBreakevenStop ? "BREAKEVEN" : "STOP_LOSS";
      const key = `close:${current.id}:${reason}`;
      if (this.recordEvent(key, "close", current.id)) this.closePosition(current, current.stopLoss, reason);
    }
  }

  private closePosition(position: DemoTrade, closePrice: number, exitReason: TradeExitReason) {
    const pnlUSDC = position.direction === "BUY"
      ? (closePrice - position.entry) * position.positionSize
      : (position.entry - closePrice) * position.positionSize;
    const pnlPct = position.balanceAtOpen > 0 ? (pnlUSDC / position.balanceAtOpen) * 100 : 0;
    const status: TradeStatus = exitReason === "TARGET_1" || exitReason === "TARGET_2"
      ? "WIN"
      : exitReason === "BREAKEVEN" ? "BREAKEVEN" : "LOSS";
    const closeTime = Date.now();
    const closed: DemoTrade = { ...position, status, closeTime, closePrice, exitReason, pnlUSDC, pnlPct };
    this.upsertTrade(closed);
    this.db.prepare("DELETE FROM demo_positions WHERE id = ?").run(position.id);
    const account = this.getAccount();
    const stats = { ...account.dailyStats };
    stats.totalTrades = Math.max(stats.totalTrades, 1);
    stats.wins += status === "WIN" ? 1 : 0;
    stats.losses += status === "LOSS" ? 1 : 0;
    stats.breakevens += status === "BREAKEVEN" ? 1 : 0;
    stats.consecutiveLosses = status === "LOSS" ? stats.consecutiveLosses + 1 : 0;
    stats.maxConsecutiveLosses = Math.max(stats.maxConsecutiveLosses, stats.consecutiveLosses);
    stats.dailyPnL += pnlUSDC;
    const newBalance = account.balance + pnlUSDC;
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
      exitReason: input.exitReason as TradeExitReason | undefined,
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
         target1, target2, balance_at_open, risk_amount, position_size, risk_reward, pnl_usdc, pnl_pct,
         exit_reason, target1_hit, is_breakeven_stop, signal_reasons_json, market_conditions, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status, close_time = excluded.close_time, close_price = excluded.close_price,
        pnl_usdc = excluded.pnl_usdc, pnl_pct = excluded.pnl_pct, exit_reason = excluded.exit_reason,
        stop_loss = excluded.stop_loss, target1_hit = excluded.target1_hit,
        is_breakeven_stop = excluded.is_breakeven_stop, updated_at = excluded.updated_at
    `).run(
      trade.id, trade.pair, trade.direction, trade.status, trade.openTime, trade.closeTime ?? null,
      trade.entry, trade.closePrice ?? null, trade.stopLoss, trade.stopLossOriginal, trade.target1, trade.target2,
      trade.balanceAtOpen, trade.riskAmount, trade.positionSize, trade.riskReward, trade.pnlUSDC ?? null,
      trade.pnlPct ?? null, trade.exitReason ?? null, Number(trade.target1Hit), Number(trade.isBreakevenStop),
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
