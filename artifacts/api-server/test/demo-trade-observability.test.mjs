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
  const tempDir = mkdtempSync(path.join(tmpdir(), "oraculo-demo-store-observability-"));
  const sourcePath = path.join(root, "src", "lib", "demo-store.ts");
  const source = readFileSync(sourcePath, "utf8")
    .replace(
      /import \{ resolveOracleVisualState, type OracleVisualState \} from "@shared\/oracleVisualState";/,
      "const resolveOracleVisualState = () => 'waiting';",
    );
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: "demo-store.ts",
  }).outputText;
  const compiledPath = path.join(tempDir, "demo-store.cjs");
  writeFileSync(compiledPath, output);
  return {
    DemoStore: require(compiledPath).DemoStore,
    tempDir,
  };
}

function createUser(store, username = `user-${Math.random().toString(16).slice(2)}`) {
  const now = new Date().toISOString();
  const admin = { id: "test-admin", name: "Test Admin", username: "admin", role: "admin", active: true, createdAt: now, lastLoginAt: null };
  return store.createUser(admin, { username, name: username, password: "local-test-password", role: "admin" }).id;
}

function withStore(fn) {
  const { DemoStore, tempDir } = loadDemoStore();
  const dbDir = mkdtempSync(path.join(tmpdir(), "oraculo-observability-db-"));
  const store = new DemoStore(path.join(dbDir, "oraculo.sqlite"));
  try {
    fn(store);
  } finally {
    store.close();
    rmSync(dbDir, { recursive: true, force: true });
    rmSync(tempDir, { recursive: true, force: true });
  }
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
    target1: 105,
    target2: 110,
    balanceAtOpen: 1000,
    riskAmount: 10,
    positionSize: 2,
    remainingPositionSize: 2,
    riskReward: "1:2",
    status: "OPEN",
    target1Hit: false,
    isBreakevenStop: false,
    signalReasons: ["test signal"],
    marketConditions: "test market",
    ...overrides,
  };
}

function latestPosition(store, userId) {
  return store.getPositions(userId)[0];
}

test("demo_positions insert keeps columns, placeholders and values aligned", () => {
  const source = readFileSync(path.join(root, "src", "lib", "demo-store.ts"), "utf8");
  const insertMatch = source.match(/INSERT INTO demo_positions\s+\(([\s\S]*?)\)\s+VALUES\s+\(([\s\S]*?)\)\s+`\)\.run\(([\s\S]*?)\);\s+} catch/);
  assert.ok(insertMatch, "postPosition INSERT must be found");
  const columns = insertMatch[1]
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const sqlValues = insertMatch[2]
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const runValues = insertMatch[3]
    .split(",\n")
    .flatMap((line) => line.split(",").map((item) => item.trim()).filter(Boolean));
  assert.equal(sqlValues.length, columns.length);
  assert.equal(sqlValues.filter((item) => item === "?").length, runValues.length);
});

test("BUY observability preserves full-position MFE through partial and target2 close", () => {
  withStore((store) => {
    const userId = createUser(store, "mfe-buy");
    store.postPosition(userId, sampleTrade({ id: "buy" }));

    store.updatePrices(userId, { pair: "BTCUSDT", price: 104 });
    let trade = latestPosition(store, userId);
    assert.equal(trade.mfeUSDC, 8);
    assert.equal(trade.mfeR, 0.8);
    assert.equal(trade.maxUnrealizedPnlBeforePartial, 8);

    store.updatePrices(userId, { pair: "BTCUSDT", price: 105 });
    trade = latestPosition(store, userId);
    assert.equal(trade.target1Hit, true);
    assert.equal(trade.remainingPositionSize, 1);
    assert.equal(trade.mfeUSDC, 10);
    assert.equal(trade.maxUnrealizedPnlBeforePartial, 10);

    store.updatePrices(userId, { pair: "BTCUSDT", price: 106 });
    trade = latestPosition(store, userId);
    assert.equal(trade.mfeUSDC, 10, "partial cannot erase the historical full-position MFE");
    assert.equal(trade.maxUnrealizedPnlAfterPartial, 6);
    assert.equal(trade.totalGivebackUSDC, 0, "realized partial is not counted as giveback");

    store.updatePrices(userId, { pair: "BTCUSDT", price: 110 });
    const closed = store.getTrades(userId)[0];
    assert.equal(closed.exitReason, "TARGET_2");
    assert.equal(closed.mfeUSDC, 10);
    assert.equal(closed.managementTimeline.at(0).type, "OPENED");
    assert.equal(closed.managementTimeline.at(-1).type, "CLOSED");
    assert.ok(closed.managementTimeline.some((event) => event.type === "TARGET_1"));
    assert.ok(closed.managementTimeline.some((event) => event.type === "PARTIAL_EXECUTED"));
    assert.ok(closed.managementTimeline.some((event) => event.type === "BREAKEVEN_ACTIVATED"));
  });
});

test("SELL observability records MFE and MAE with initial risk denominator", () => {
  withStore((store) => {
    const userId = createUser(store, "mfe-sell");
    store.postPosition(userId, sampleTrade({
      id: "sell",
      pair: "ETHUSDT",
      direction: "SELL",
      entry: 2000,
      stopLoss: 2020,
      stopLossOriginal: 2020,
      target1: 1960,
      target2: 1940,
      riskAmount: 20,
      positionSize: 1,
      remainingPositionSize: 1,
    }));
    store.updatePrices(userId, { pair: "ETHUSDT", price: 1980 });
    let trade = latestPosition(store, userId);
    assert.ok(trade, "SELL position must remain open after favorable move");
    assert.equal(trade.mfeUSDC, 20);
    assert.equal(trade.mfeR, 1);

    store.updatePrices(userId, { pair: "ETHUSDT", price: 2010 });
    trade = latestPosition(store, userId);
    assert.ok(trade, "SELL position must remain open between entry and stop");
    assert.equal(trade.maeUSDC, 10);
    assert.equal(trade.maeR, 0.5, "R remains based on initial risk, not updated stop");
  });
});

test("giveback separates open giveback from realized partial", () => {
  withStore((store) => {
    const userId = createUser(store, "giveback");
    store.postPosition(userId, sampleTrade({ id: "giveback" }));
    store.updatePrices(userId, { pair: "BTCUSDT", price: 105 });
    store.updatePrices(userId, { pair: "BTCUSDT", price: 106 });
    store.updatePrices(userId, { pair: "BTCUSDT", price: 105.8 });
    const trade = store.getPositions(userId).find((position) => position.id === "giveback");
    assert.ok(trade, "BUY position must remain open after a controlled post-partial giveback");
    assert.equal(trade.status, "OPEN");
    assert.equal(Number(trade.openGivebackUSDC.toFixed(8)), 0.2);
    assert.equal(Number(trade.peakGivebackUSDC.toFixed(8)), 0.2);
    assert.equal(trade.totalGivebackUSDC, 0);
    assert.equal(trade.partialPnlUSDC, 5);
  });
});

test("unchanged price does not add timeline events or management updates", () => {
  withStore((store) => {
    const userId = createUser(store, "no-change");
    store.postPosition(userId, sampleTrade({ id: "flat" }));
    const before = latestPosition(store, userId);
    store.updatePrices(userId, { pair: "BTCUSDT", price: 100 });
    const after = latestPosition(store, userId);
    assert.deepEqual(after.managementTimeline, before.managementTimeline);
    assert.equal(after.lastManagementUpdateAt, before.lastManagementUpdateAt);
  });
});

test("timeout, stop and trailing events are preserved without changing exits", () => {
  withStore((store) => {
    const userId = createUser(store, "exits");
    store.postPosition(userId, sampleTrade({ id: "timeout", openTime: Date.now() - 91 * 60 * 1000, entry: 100, stopLoss: 90, target1: 110, target2: 120 }));
    store.updatePrices(userId, { pair: "BTCUSDT", price: 101 });
    let closed = store.getTrades(userId)[0];
    assert.equal(closed.exitReason, "TIMEOUT");
    assert.ok(closed.managementTimeline.some((event) => event.type === "TIMEOUT"));

    store.postPosition(userId, sampleTrade({ id: "stop", pair: "ETHUSDT", entry: 100, stopLoss: 95, target1: 105, target2: 110 }));
    store.updatePrices(userId, { pair: "ETHUSDT", price: 94 });
    closed = store.getTrades(userId)[0];
    assert.equal(closed.exitReason, "STOP_LOSS");
    assert.ok(closed.managementTimeline.some((event) => event.type === "STOP"));

    store.postPosition(userId, sampleTrade({ id: "trail", pair: "SOLUSDT", entry: 50, stopLoss: 45, target1: 55, target2: 70, positionSize: 2, remainingPositionSize: 2 }));
    store.updatePrices(userId, { pair: "SOLUSDT", price: 55 });
    store.updatePrices(userId, { pair: "SOLUSDT", price: 60 });
    const trailing = latestPosition(store, userId);
    assert.ok(trailing.managementTimeline.some((event) => event.type === "TRAILING_ACTIVATED" || event.type === "TRAILING_UPDATED"));
  });
});

test("old nullable trade records remain readable in export", () => {
  withStore((store) => {
    const userId = createUser(store, "legacy");
    store.upsertTrade(userId, sampleTrade({ id: "old", status: "LOSS", closeTime: Date.now(), closePrice: 95, pnlUSDC: -10, exitReason: "STOP_LOSS" }));
    const admin = store.getUser(userId);
    const data = store.exportDemoTradeHistory(admin, { limit: 10 });
    assert.equal(data.entries.length, 1);
    assert.equal(data.entries[0].mfeUSDC, 0);
    assert.equal(data.entries[0].maeUSDC, 0);
    assert.equal(data.entries[0].peakGivebackUSDC, 0);
    assert.equal(data.entries[0].peakGivebackPct, 0);
    assert.equal(data.entries[0].maxUnrealizedPnlUSDC, 0);
    assert.equal(data.entries[0].minUnrealizedPnlUSDC, 0);
    assert.equal(data.entries[0].mfeR, null);
    assert.equal(data.entries[0].maeR, null);
    assert.ok(Array.isArray(data.entries[0].managementTimeline));
  });
});

test("trade export supports json filters and admin-only route includes CSV formula protection", () => {
  withStore((store) => {
    const userId = createUser(store, "exporter");
    const admin = store.getUser(userId);
    store.upsertTrade(userId, sampleTrade({ id: "csv", pair: "SOLUSDT", status: "WIN", closeTime: Date.now(), closePrice: 110, pnlUSDC: 10, exitReason: "TARGET_2", signalReasons: ["=formula"] }));
    store.upsertTrade(userId, sampleTrade({ id: "loss-export", pair: "ETHUSDT", direction: "SELL", status: "LOSS", closeTime: Date.now(), closePrice: 105, pnlUSDC: -10, exitReason: "STOP_LOSS" }));
    assert.equal(store.exportDemoTradeHistory(admin, { symbol: "BTCUSDT" }).entries.length, 0);
    assert.equal(store.exportDemoTradeHistory(admin, { symbol: "SOLUSDT", exitReason: "TARGET_2" }).entries.length, 1);
    assert.equal(store.exportDemoTradeHistory(admin, { direction: "SELL", status: "LOSS" }).entries.length, 1);
    assert.equal(store.exportDemoTradeHistory(admin, { direction: "BUY", status: "LOSS" }).entries.length, 0);
    assert.equal(store.exportDemoTradeHistory(admin, { symbol: "SOLUSDT" }).entries[0].riskAmount, 10);
  });
  const routeSource = readFileSync(path.join(root, "src", "routes", "demo.ts"), "utf8");
  assert.match(routeSource, /\/demo\/trades\/export", requireAuth, requireAdmin/);
  assert.match(routeSource, /req\.query\.direction/);
  assert.match(routeSource, /req\.query\.status/);
  assert.match(routeSource, /\^\[=\+\\-@\]/);
  assert.doesNotMatch(routeSource, /"UserId"/);
});
