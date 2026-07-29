import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const root = path.resolve(import.meta.dirname, "..");

function loadDemoStore() {
  const tempDir = mkdtempSync(path.join(tmpdir(), "oraculo-reentry-cooldown-store-"));
  for (const moduleName of ["push-notifications", "telegram-notifications"]) {
    const source = readFileSync(path.join(root, "src", "lib", `${moduleName}.ts`), "utf8");
    const output = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
      fileName: `${moduleName}.ts`,
    }).outputText;
    writeFileSync(path.join(tempDir, `${moduleName}.js`), output);
  }
  const source = readFileSync(path.join(root, "src", "lib", "demo-store.ts"), "utf8")
    .replace(
      /import \{ resolveOracleVisualState, type OracleVisualState \} from "@shared\/oracleVisualState";/,
      "const resolveOracleVisualState = () => 'waiting';",
    );
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: "demo-store.ts",
  }).outputText;
  const compiledPath = path.join(tempDir, "demo-store.cjs");
  writeFileSync(compiledPath, output);
  return { DemoStore: require(compiledPath).DemoStore, tempDir };
}

function withStore(fn) {
  const { DemoStore, tempDir } = loadDemoStore();
  const dbDir = mkdtempSync(path.join(tmpdir(), "oraculo-reentry-cooldown-db-"));
  const dbPath = path.join(dbDir, "oraculo.sqlite");
  const store = new DemoStore(dbPath);
  let closed = false;
  const closeStore = () => {
    if (!closed) {
      store.close();
      closed = true;
    }
  };
  try {
    return fn(store, dbPath, DemoStore, closeStore);
  } finally {
    closeStore();
    rmSync(dbDir, { recursive: true, force: true });
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function withFakeClock(initialNowMs, fn) {
  let nowMs = initialNowMs;
  const originalNow = Date.now;
  Date.now = () => nowMs;
  try {
    return fn((nextNowMs) => {
      nowMs = nextNowMs;
    });
  } finally {
    Date.now = originalNow;
  }
}

function createUser(store, username = `user-${Math.random().toString(16).slice(2)}`) {
  const now = new Date().toISOString();
  const admin = { id: "test-admin", name: "Test Admin", username: "admin", role: "admin", active: true, createdAt: now, lastLoginAt: null };
  return store.createUser(admin, { username, name: username, password: "local-test-password", role: "admin" }).id;
}

function sampleTrade(overrides = {}) {
  return {
    id: `trade_${Math.random().toString(16).slice(2)}`,
    pair: "BTCUSDT",
    direction: "BUY",
    openTime: Date.now(),
    entry: 100,
    stopLoss: 95,
    stopLossOriginal: 95,
    target1: 106,
    target2: 120,
    balanceAtOpen: 1000,
    riskAmount: 10,
    positionSize: 2,
    remainingPositionSize: 2,
    riskReward: "1:4",
    status: "OPEN",
    target1Hit: false,
    isBreakevenStop: false,
    signalReasons: ["reentry cooldown test"],
    marketConditions: "reentry cooldown test",
    ...overrides,
  };
}

function signal(overrides = {}) {
  const pair = overrides.pair ?? "BTCUSDT";
  const decision = overrides.decision ?? "BUY";
  const entry = overrides.entryNum ?? (pair === "ETHUSDT" ? 2000 : pair === "SOLUSDT" ? 50 : 100);
  const isBuy = decision === "BUY";
  return {
    pair,
    decision,
    entryNum: entry,
    stopLossNum: overrides.stopLossNum ?? (isBuy ? entry - 5 : entry + 5),
    target1Num: overrides.target1Num ?? (isBuy ? entry + 10 : entry - 10),
    target2Num: overrides.target2Num ?? (isBuy ? entry + 20 : entry - 20),
    riskReward: "1:4",
    signalKey: `signal:${pair}:${decision}:${Math.random().toString(16).slice(2)}`,
    steps: [{ number: 1, name: "Teste", value: "aprovado", reason: "Sinal aprovado para teste" }],
    ...overrides,
  };
}

function closeByStop(store, userId, overrides = {}) {
  const trade = sampleTrade({ id: `stop_${Math.random().toString(16).slice(2)}`, ...overrides });
  store.postPosition(userId, trade);
  store.updatePrices(userId, { pair: trade.pair, price: trade.stopLoss });
  const closed = store.getTrades(userId).find((item) => item.id === trade.id);
  assert.ok(closed, "STOP_LOSS trade should be closed");
  assert.equal(closed.exitReason, "STOP_LOSS");
  return closed;
}

function closeByTimeout(store, userId, overrides = {}) {
  const trade = sampleTrade({
    id: `timeout_${Math.random().toString(16).slice(2)}`,
    openTime: Date.now() - 91 * 60 * 1000,
    target1: 130,
    target2: 150,
    maxDurationMs: 90 * 60 * 1000,
    ...overrides,
  });
  store.postPosition(userId, trade);
  store.updatePrices(userId, { pair: trade.pair, price: trade.entry + (trade.direction === "BUY" ? 1 : -1) });
  const closed = store.getTrades(userId).find((item) => item.id === trade.id);
  assert.ok(closed, "TIMEOUT trade should be closed");
  assert.equal(closed.exitReason, "TIMEOUT");
  return closed;
}

function assertBlocked(result, reason) {
  assert.equal(result.opened, false);
  assert.equal(result.decisionState, "BLOQUEADO_RISCO");
  assert.match(result.blockedReason, new RegExp(reason));
}

test("TIMEOUT blocks same user asset and direction for 15 minutes", () => {
  withFakeClock(Date.UTC(2026, 6, 29, 12), () => withStore((store) => {
    const userId = createUser(store, "timeout-cooldown");
    closeByTimeout(store, userId);

    const result = store.openFromSignalWithResult(userId, signal({ pair: "BTCUSDT", decision: "BUY" }));

    assertBlocked(result, "REENTRY_COOLDOWN_TIMEOUT");
    assert.match(result.blockedReason, /BTCUSDT BUY/);
    assert.match(result.blockedReason, /restante 15 min/);
  }));
});

test("STOP_LOSS blocks same user asset and direction for 30 minutes", () => {
  withFakeClock(Date.UTC(2026, 6, 29, 12), () => withStore((store) => {
    const userId = createUser(store, "stop-cooldown");
    closeByStop(store, userId);

    const result = store.openFromSignalWithResult(userId, signal({ pair: "BTCUSDT", decision: "BUY" }));

    assertBlocked(result, "REENTRY_COOLDOWN_STOP_LOSS");
    assert.match(result.blockedReason, /restante 30 min/);
  }));
});

test("opposite direction remains allowed during cooldown", () => {
  withFakeClock(Date.UTC(2026, 6, 29, 12), () => withStore((store) => {
    const userId = createUser(store, "opposite-direction");
    closeByStop(store, userId);

    const result = store.openFromSignalWithResult(userId, signal({ pair: "BTCUSDT", decision: "SELL" }));

    assert.equal(result.opened, true);
    assert.equal(store.getPositions(userId)[0].direction, "SELL");
  }));
});

test("same direction in another asset remains allowed during cooldown", () => {
  withFakeClock(Date.UTC(2026, 6, 29, 12), () => withStore((store) => {
    const userId = createUser(store, "other-asset");
    closeByStop(store, userId);

    const result = store.openFromSignalWithResult(userId, signal({ pair: "ETHUSDT", decision: "BUY" }));

    assert.equal(result.opened, true);
    assert.equal(store.getPositions(userId)[0].pair, "ETHUSDT");
  }));
});

test("another user remains allowed during cooldown", () => {
  withFakeClock(Date.UTC(2026, 6, 29, 12), () => withStore((store) => {
    const blockedUser = createUser(store, "blocked-user");
    const allowedUser = createUser(store, "allowed-user");
    closeByStop(store, blockedUser);

    const result = store.openFromSignalWithResult(allowedUser, signal({ pair: "BTCUSDT", decision: "BUY" }));

    assert.equal(result.opened, true);
    assert.equal(store.getPositions(allowedUser)[0].pair, "BTCUSDT");
  }));
});

test("entry is allowed after cooldown expiration", () => {
  const startedAt = Date.UTC(2026, 6, 29, 12);
  withFakeClock(startedAt, (setNow) => withStore((store) => {
    const userId = createUser(store, "cooldown-expired");
    closeByStop(store, userId);
    setNow(startedAt + 30 * 60 * 1000);

    const result = store.openFromSignalWithResult(userId, signal({ pair: "BTCUSDT", decision: "BUY" }));

    assert.equal(result.opened, true);
    assert.equal(store.getPositions(userId)[0].pair, "BTCUSDT");
  }));
});

test("cooldown survives reopening the store", () => {
  const startedAt = Date.UTC(2026, 6, 29, 12);
  withFakeClock(startedAt, () => withStore((store, dbPath, DemoStore, closeStore) => {
    const userId = createUser(store, "cooldown-restart");
    closeByStop(store, userId);
    closeStore();

    const reopened = new DemoStore(dbPath);
    try {
      const result = reopened.openFromSignalWithResult(userId, signal({ pair: "BTCUSDT", decision: "BUY" }));
      assertBlocked(result, "REENTRY_COOLDOWN_STOP_LOSS");
    } finally {
      reopened.close();
    }
  }));
});

test("profitable exits do not create reentry cooldown", () => {
  withFakeClock(Date.UTC(2026, 6, 29, 12), () => withStore((store) => {
    const userId = createUser(store, "profit-no-cooldown");
    const trade = sampleTrade({ id: "profit_exit" });
    store.postPosition(userId, trade);
    store.updatePrices(userId, { pair: "BTCUSDT", price: trade.target2 });
    assert.equal(store.getTrades(userId).find((item) => item.id === trade.id).exitReason, "TARGET_2");

    const result = store.openFromSignalWithResult(userId, signal({ pair: "BTCUSDT", decision: "BUY" }));

    assert.equal(result.opened, true);
  }));
});

test("/api/demo/signal path cannot bypass reentry cooldown", () => {
  withFakeClock(Date.UTC(2026, 6, 29, 12), () => withStore((store) => {
    const userId = createUser(store, "route-path");
    closeByStop(store, userId);

    const session = store.openFromSignal(userId, signal({ pair: "BTCUSDT", decision: "BUY" }));

    assert.equal(session.activeTrade, null);
    assert.equal(store.getPositions(userId).length, 0);
  }));
});

test("older cooldown state never shortens a newer active cooldown", () => {
  const startedAt = Date.UTC(2026, 6, 29, 12);
  withFakeClock(startedAt, (setNow) => withStore((store) => {
    const userId = createUser(store, "cooldown-extend");
    closeByStop(store, userId);

    setNow(startedAt + 5 * 60 * 1000);
    closeByTimeout(store, userId);

    setNow(startedAt + 20 * 60 * 1000 + 1);
    let result = store.openFromSignalWithResult(userId, signal({ pair: "BTCUSDT", decision: "BUY" }));
    assertBlocked(result, "REENTRY_COOLDOWN_STOP_LOSS");

    setNow(startedAt + 30 * 60 * 1000 + 1);
    result = store.openFromSignalWithResult(userId, signal({ pair: "BTCUSDT", decision: "BUY" }));
    assert.equal(result.opened, true);
  }));
});

test("updating one asset direction cooldown preserves other cooldown entries", () => {
  const startedAt = Date.UTC(2026, 6, 29, 12);
  withFakeClock(startedAt, (setNow) => withStore((store) => {
    const userId = createUser(store, "cooldown-independent-keys");
    closeByStop(store, userId, { pair: "BTCUSDT", direction: "BUY" });

    setNow(startedAt + 60_000);
    closeByTimeout(store, userId, {
      pair: "ETHUSDT",
      direction: "SELL",
      entry: 2000,
      stopLoss: 2010,
      stopLossOriginal: 2010,
      target1: 1970,
      target2: 1950,
    });

    const btcResult = store.openFromSignalWithResult(userId, signal({ pair: "BTCUSDT", decision: "BUY" }));
    assertBlocked(btcResult, "REENTRY_COOLDOWN_STOP_LOSS");

    const ethResult = store.openFromSignalWithResult(userId, signal({
      pair: "ETHUSDT",
      decision: "SELL",
      entryNum: 2000,
      stopLossNum: 2010,
      target1Num: 1970,
      target2Num: 1950,
    }));
    assertBlocked(ethResult, "REENTRY_COOLDOWN_TIMEOUT");
  }));
});
