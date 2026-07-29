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
  const tempDir = mkdtempSync(path.join(tmpdir(), "oraculo-management-safety-store-"));
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
  const dbDir = mkdtempSync(path.join(tmpdir(), "oraculo-management-safety-db-"));
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
    initialRiskAmount: 10,
    positionSize: 2,
    remainingPositionSize: 2,
    riskReward: "1:4",
    status: "OPEN",
    target1Hit: false,
    isBreakevenStop: false,
    trailing: false,
    signalReasons: ["management safety test"],
    marketConditions: "management safety test",
    ...overrides,
  };
}

function latestPosition(store, userId) {
  return store.getPositions(userId)[0];
}

function latestTrade(store, userId) {
  return store.getTrades(userId)[0];
}

function timelineTypes(trade) {
  return (trade.managementTimeline ?? []).map((event) => event.type);
}

function countType(trade, type) {
  return timelineTypes(trade).filter((item) => item === type).length;
}

test("partial and breakeven do not duplicate with repeated ticks", () => {
  withStore((store) => {
    const userId = createUser(store, "safety-partial-repeat");
    store.postPosition(userId, sampleTrade({ id: "partial-repeat" }));

    store.updatePrices(userId, { pair: "BTCUSDT", price: 105 });
    store.updatePrices(userId, { pair: "BTCUSDT", price: 105 });

    const trade = latestPosition(store, userId);
    assert.equal(trade.remainingPositionSize, 1);
    assert.equal(trade.realizedPnlUSDC, 5);
    assert.equal(trade.stopLoss, 100);
    assert.equal(countType(trade, "PARTIAL_EXECUTED"), 1);
    assert.equal(countType(trade, "BREAKEVEN_ACTIVATED"), 1);
  });
});

test("trailing activation does not duplicate with repeated ticks", () => {
  withStore((store) => {
    const userId = createUser(store, "safety-trailing-repeat");
    store.postPosition(userId, sampleTrade({ id: "trailing-repeat" }));

    store.updatePrices(userId, { pair: "BTCUSDT", price: 105 });
    store.updatePrices(userId, { pair: "BTCUSDT", price: 115 });
    store.updatePrices(userId, { pair: "BTCUSDT", price: 115 });

    const trade = latestPosition(store, userId);
    assert.equal(trade.trailing, true);
    assert.equal(countType(trade, "TRAILING_ACTIVATED"), 1);
    assert.equal(countType(trade, "PARTIAL_EXECUTED"), 1);
  });
});

test("Target 2 closes remaining BUY size once", () => {
  withStore((store) => {
    const userId = createUser(store, "safety-buy-target2");
    store.postPosition(userId, sampleTrade({ id: "buy-target2" }));

    store.updatePrices(userId, { pair: "BTCUSDT", price: 105 });
    store.updatePrices(userId, { pair: "BTCUSDT", price: 120 });
    store.updatePrices(userId, { pair: "BTCUSDT", price: 120 });

    assert.equal(store.getPositions(userId).length, 0);
    const trades = store.getTrades(userId).filter((trade) => trade.id === "buy-target2");
    assert.equal(trades.length, 1);
    assert.equal(trades[0].exitReason, "TARGET_2");
    assert.equal(trades[0].remainingPositionSize, 0);
    assert.equal(trades[0].pnlUSDC, 25);
  });
});

test("Target 2 closes remaining SELL size once", () => {
  withStore((store) => {
    const userId = createUser(store, "safety-sell-target2");
    store.postPosition(userId, sampleTrade({
      id: "sell-target2",
      pair: "SOLUSDT",
      direction: "SELL",
      stopLoss: 105,
      stopLossOriginal: 105,
      target1: 94,
      target2: 80,
    }));

    store.updatePrices(userId, { pair: "SOLUSDT", price: 95 });
    store.updatePrices(userId, { pair: "SOLUSDT", price: 80 });
    store.updatePrices(userId, { pair: "SOLUSDT", price: 80 });

    assert.equal(store.getPositions(userId).length, 0);
    const trades = store.getTrades(userId).filter((trade) => trade.id === "sell-target2");
    assert.equal(trades.length, 1);
    assert.equal(trades[0].exitReason, "TARGET_2");
    assert.equal(trades[0].remainingPositionSize, 0);
    assert.equal(trades[0].pnlUSDC, 25);
  });
});

test("updated stop closes remaining BUY size once", () => {
  withStore((store) => {
    const userId = createUser(store, "safety-buy-stop");
    store.postPosition(userId, sampleTrade({ id: "buy-stop" }));

    store.updatePrices(userId, { pair: "BTCUSDT", price: 105 });
    store.updatePrices(userId, { pair: "BTCUSDT", price: 100 });
    store.updatePrices(userId, { pair: "BTCUSDT", price: 100 });

    assert.equal(store.getPositions(userId).length, 0);
    const trades = store.getTrades(userId).filter((trade) => trade.id === "buy-stop");
    assert.equal(trades.length, 1);
    assert.equal(trades[0].exitReason, "BREAKEVEN");
    assert.equal(trades[0].pnlUSDC, 5);
  });
});

test("updated stop closes remaining SELL size once", () => {
  withStore((store) => {
    const userId = createUser(store, "safety-sell-stop");
    store.postPosition(userId, sampleTrade({
      id: "sell-stop",
      pair: "SOLUSDT",
      direction: "SELL",
      stopLoss: 105,
      stopLossOriginal: 105,
      target1: 94,
      target2: 80,
    }));

    store.updatePrices(userId, { pair: "SOLUSDT", price: 95 });
    store.updatePrices(userId, { pair: "SOLUSDT", price: 100 });
    store.updatePrices(userId, { pair: "SOLUSDT", price: 100 });

    assert.equal(store.getPositions(userId).length, 0);
    const trades = store.getTrades(userId).filter((trade) => trade.id === "sell-stop");
    assert.equal(trades.length, 1);
    assert.equal(trades[0].exitReason, "BREAKEVEN");
    assert.equal(trades[0].pnlUSDC, 5);
  });
});

test("Target 2 and stop conditions in one tick do not duplicate final close", () => {
  withStore((store) => {
    const userId = createUser(store, "safety-double-close");
    store.postPosition(userId, sampleTrade({ id: "double-close", stopLoss: 120, target2: 120, isBreakevenStop: true, target1Hit: true, remainingPositionSize: 1, realizedPnlUSDC: 5 }));

    store.updatePrices(userId, { pair: "BTCUSDT", price: 120 });
    store.updatePrices(userId, { pair: "BTCUSDT", price: 120 });

    assert.equal(store.getPositions(userId).length, 0);
    assert.equal(store.getTrades(userId).filter((trade) => trade.id === "double-close").length, 1);
  });
});

test("stale BUY state cannot regress a newer protective stop", () => {
  withStore((store) => {
    const userId = createUser(store, "safety-buy-stale");
    store.postPosition(userId, sampleTrade({ id: "buy-stale" }));
    store.updatePrices(userId, { pair: "BTCUSDT", price: 105 });
    const stale = { ...latestPosition(store, userId) };
    store.updatePrices(userId, { pair: "BTCUSDT", price: 115 });
    const newerStop = latestPosition(store, userId).stopLoss;

    store.updateTrailingStop(userId, stale, 110, 0.002, [{ price: 105, at: Date.now() }, { price: 115, at: Date.now() }, { price: 110, at: Date.now() }], 1.5);

    assert.ok(latestPosition(store, userId).stopLoss >= newerStop);
  });
});

test("stale SELL state cannot regress a newer protective stop", () => {
  withStore((store) => {
    const userId = createUser(store, "safety-sell-stale");
    store.postPosition(userId, sampleTrade({
      id: "sell-stale",
      pair: "SOLUSDT",
      direction: "SELL",
      stopLoss: 105,
      stopLossOriginal: 105,
      target1: 94,
      target2: 80,
    }));
    store.updatePrices(userId, { pair: "SOLUSDT", price: 95 });
    const stale = { ...latestPosition(store, userId) };
    store.updatePrices(userId, { pair: "SOLUSDT", price: 85 });
    const newerStop = latestPosition(store, userId).stopLoss;

    store.updateTrailingStop(userId, stale, 90, 0.002, [{ price: 95, at: Date.now() }, { price: 85, at: Date.now() }, { price: 90, at: Date.now() }], 1.5);

    assert.ok(latestPosition(store, userId).stopLoss <= newerStop);
  });
});

test("closed operation never returns to OPEN during repeated price updates", () => {
  withStore((store) => {
    const userId = createUser(store, "safety-closed-stays-closed");
    store.postPosition(userId, sampleTrade({ id: "closed-stays-closed" }));

    store.updatePrices(userId, { pair: "BTCUSDT", price: 120 });
    store.updatePrices(userId, { pair: "BTCUSDT", price: 105 });
    store.updatePrices(userId, { pair: "BTCUSDT", price: 100 });

    assert.equal(store.getPositions(userId).length, 0);
    assert.equal(store.getTrades(userId).filter((trade) => trade.id === "closed-stays-closed").length, 1);
  });
});

test("restart after partial keeps management functional", () => {
  withStore((store, dbPath, DemoStore, closeStore) => {
    const userId = createUser(store, "safety-restart-partial");
    store.postPosition(userId, sampleTrade({ id: "restart-partial" }));
    store.updatePrices(userId, { pair: "BTCUSDT", price: 105 });
    closeStore();

    const reopened = new DemoStore(dbPath);
    try {
      reopened.updatePrices(userId, { pair: "BTCUSDT", price: 120 });
      assert.equal(reopened.getPositions(userId).length, 0);
      const trade = reopened.getTrades(userId).find((item) => item.id === "restart-partial");
      assert.equal(trade.exitReason, "TARGET_2");
      assert.equal(trade.pnlUSDC, 25);
      assert.equal(countType(trade, "PARTIAL_EXECUTED"), 1);
    } finally {
      reopened.close();
    }
  });
});

test("timeline records decisive tick prices and actions", () => {
  withStore((store) => {
    const userId = createUser(store, "safety-tick-audit");
    store.postPosition(userId, sampleTrade({ id: "tick-audit" }));

    store.updatePrices(userId, { pair: "BTCUSDT", price: 104 });
    store.updatePrices(userId, { pair: "BTCUSDT", price: 105 });
    store.updatePrices(userId, { pair: "BTCUSDT", price: 120 });

    const trade = latestTrade(store, userId);
    const ticks = (trade.managementTimeline ?? []).filter((event) => event.type === "TICK");
    assert.ok(ticks.some((event) => event.price === 104 && event.data?.action === "NO_ACTION"));
    assert.ok(ticks.some((event) => event.price === 105 && event.data?.action === "PARTIAL_TRIGGERED"));
    assert.ok(ticks.some((event) => event.price === 120 && event.data?.action === "TARGET_2_TRIGGERED"));
  });
});

test("timeline is bounded and preserves important management events", () => {
  withStore((store) => {
    const userId = createUser(store, "safety-timeline-limit");
    store.postPosition(userId, sampleTrade({ id: "timeline-limit" }));

    for (let index = 0; index < 230; index += 1) {
      store.updatePrices(userId, { pair: "BTCUSDT", price: 104 + (index % 2) * 0.01 });
    }
    store.updatePrices(userId, { pair: "BTCUSDT", price: 105 });
    store.updatePrices(userId, { pair: "BTCUSDT", price: 115 });
    store.updatePrices(userId, { pair: "BTCUSDT", price: 120 });

    const trade = latestTrade(store, userId);
    const types = timelineTypes(trade);
    assert.ok(types.length <= 200);
    assert.ok(types.includes("OPENED"));
    assert.ok(types.includes("PARTIAL_EXECUTED"));
    assert.ok(types.includes("BREAKEVEN_ACTIVATED"));
    assert.ok(types.includes("TRAILING_ACTIVATED"));
    assert.ok(types.includes("TARGET_2"));
    assert.ok(types.includes("CLOSED"));
  });
});
