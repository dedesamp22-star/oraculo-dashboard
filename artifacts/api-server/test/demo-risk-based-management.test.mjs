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
  const tempDir = mkdtempSync(path.join(tmpdir(), "oraculo-risk-management-store-"));
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
  const dbDir = mkdtempSync(path.join(tmpdir(), "oraculo-risk-management-db-"));
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
    positionSize: 2,
    remainingPositionSize: 2,
    riskReward: "1:4",
    status: "OPEN",
    target1Hit: false,
    isBreakevenStop: false,
    signalReasons: ["risk management test"],
    marketConditions: "risk management test",
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

test("BUY uses 1R partial and 1.5R trailing while preserving target2", () => {
  withStore((store, _dbPath) => {
    const userId = createUser(store, "risk-buy");
    store.postPosition(userId, sampleTrade({ id: "buy-risk" }));

    store.updatePrices(userId, { pair: "BTCUSDT", price: 104.5 });
    let trade = latestPosition(store, userId);
    assert.equal(trade.target1Hit, false);
    assert.equal(trade.remainingPositionSize, 2);

    store.updatePrices(userId, { pair: "BTCUSDT", price: 105 });
    trade = latestPosition(store, userId);
    assert.equal(trade.target1Hit, true);
    assert.equal(trade.remainingPositionSize, 1);
    assert.equal(trade.stopLoss, 100);
    assert.equal(trade.isBreakevenStop, true);
    assert.equal(trade.partialTriggerR, 1);
    assert.equal(trade.partialPnlUSDC, 5);

    store.updatePrices(userId, { pair: "BTCUSDT", price: 114 });
    trade = latestPosition(store, userId);
    assert.equal(trade.trailing, false);
    assert.equal(trade.stopLoss, 100);

    store.updatePrices(userId, { pair: "BTCUSDT", price: 115 });
    trade = latestPosition(store, userId);
    assert.equal(trade.trailing, true);
    assert.equal(trade.trailingTriggerR, 1.5);
    assert.ok(trade.stopLoss >= 100);

    const trailedStop = trade.stopLoss;
    store.updatePrices(userId, { pair: "BTCUSDT", price: 116 });
    trade = latestPosition(store, userId);
    assert.ok(trade.stopLoss >= trailedStop);

    store.updatePrices(userId, { pair: "BTCUSDT", price: 120 });
    assert.equal(latestPosition(store, userId), undefined);
    const closed = latestTrade(store, userId);
    assert.equal(closed.exitReason, "TARGET_2");
    assert.equal(closed.status, "WIN");
    assert.equal(closed.target1Hit, true);
    assert.equal(closed.trailing, true);
  });
});

test("SELL uses 1R partial and 1.5R trailing while preserving target2", () => {
  withStore((store) => {
    const userId = createUser(store, "risk-sell");
    store.postPosition(userId, sampleTrade({
      id: "sell-risk",
      pair: "SOLUSDT",
      direction: "SELL",
      stopLoss: 105,
      stopLossOriginal: 105,
      target1: 94,
      target2: 80,
    }));

    store.updatePrices(userId, { pair: "SOLUSDT", price: 95.5 });
    let trade = latestPosition(store, userId);
    assert.equal(trade.target1Hit, false);
    assert.equal(trade.remainingPositionSize, 2);

    store.updatePrices(userId, { pair: "SOLUSDT", price: 95 });
    trade = latestPosition(store, userId);
    assert.equal(trade.target1Hit, true);
    assert.equal(trade.remainingPositionSize, 1);
    assert.equal(trade.stopLoss, 100);
    assert.equal(trade.isBreakevenStop, true);
    assert.equal(trade.partialTriggerR, 1);
    assert.equal(trade.partialPnlUSDC, 5);

    store.updatePrices(userId, { pair: "SOLUSDT", price: 86 });
    trade = latestPosition(store, userId);
    assert.equal(trade.trailing, false);
    assert.equal(trade.stopLoss, 100);

    store.updatePrices(userId, { pair: "SOLUSDT", price: 85 });
    trade = latestPosition(store, userId);
    assert.equal(trade.trailing, true);
    assert.equal(trade.trailingTriggerR, 1.5);
    assert.ok(trade.stopLoss <= 100);

    const trailedStop = trade.stopLoss;
    store.updatePrices(userId, { pair: "SOLUSDT", price: 84 });
    trade = latestPosition(store, userId);
    assert.ok(trade.stopLoss <= trailedStop);

    store.updatePrices(userId, { pair: "SOLUSDT", price: 80 });
    assert.equal(latestPosition(store, userId), undefined);
    const closed = latestTrade(store, userId);
    assert.equal(closed.exitReason, "TARGET_2");
    assert.equal(closed.status, "WIN");
    assert.equal(closed.target1Hit, true);
    assert.equal(closed.trailing, true);
  });
});

test("risk based management survives restart and closes remaining size on stop", () => {
  withStore((store, dbPath, DemoStore, closeStore) => {
    const userId = createUser(store, "risk-restart");
    store.postPosition(userId, sampleTrade({ id: "restart-risk" }));
    store.updatePrices(userId, { pair: "BTCUSDT", price: 105 });
    closeStore();

    const reopened = new DemoStore(dbPath);
    try {
      let trade = latestPosition(reopened, userId);
      assert.equal(trade.target1Hit, true);
      assert.equal(trade.remainingPositionSize, 1);
      assert.equal(trade.stopLoss, 100);
      assert.equal(trade.partialTriggerR, 1);

      reopened.updatePrices(userId, { pair: "BTCUSDT", price: 100 });
      trade = latestTrade(reopened, userId);
      assert.equal(trade.exitReason, "BREAKEVEN");
      assert.equal(trade.remainingPositionSize, 0);
      assert.equal(trade.realizedPnlUSDC, 5);
      assert.equal(trade.pnlUSDC, 5);
    } finally {
      reopened.close();
    }
  });
});

test("repeated price updates do not duplicate partial or close events", () => {
  withStore((store) => {
    const userId = createUser(store, "risk-idempotent");
    store.postPosition(userId, sampleTrade({ id: "idempotent-risk" }));

    store.updatePrices(userId, { pair: "BTCUSDT", price: 105 });
    store.updatePrices(userId, { pair: "BTCUSDT", price: 105 });
    let trade = latestPosition(store, userId);
    assert.equal(trade.remainingPositionSize, 1);
    assert.equal(timelineTypes(trade).filter((type) => type === "PARTIAL_EXECUTED").length, 1);

    store.updatePrices(userId, { pair: "BTCUSDT", price: 100 });
    store.updatePrices(userId, { pair: "BTCUSDT", price: 100 });
    assert.equal(store.getPositions(userId).length, 0);
    assert.equal(store.getTrades(userId).filter((item) => item.id === "idempotent-risk").length, 1);
  });
});

test("legacy trade fixtures without risk management fields remain writable", () => {
  withStore((store) => {
    const userId = createUser(store, "risk-legacy");
    const legacy = sampleTrade({
      id: "legacy-risk",
      status: "LOSS",
      closeTime: Date.now(),
      closePrice: 95,
      pnlUSDC: -10,
      exitReason: "STOP_LOSS",
    });
    delete legacy.trailing;
    delete legacy.partialTriggerR;
    delete legacy.trailingTriggerR;
    delete legacy.managementTimeline;
    delete legacy.remainingPositionSize;

    store.upsertTrade(userId, legacy);
    const stored = latestTrade(store, userId);
    assert.equal(stored.id, "legacy-risk");
    assert.equal(stored.trailing, false);
    assert.equal(stored.partialTriggerR, 1);
    assert.equal(stored.trailingTriggerR, 1.5);
    assert.equal(stored.realizedPnlUSDC, 0);
    assert.equal(stored.remainingPositionSize, stored.positionSize);
    assert.deepEqual(stored.managementTimeline, []);
  });
});
