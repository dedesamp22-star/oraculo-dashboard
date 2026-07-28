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
  const tempDir = mkdtempSync(path.join(tmpdir(), "oraculo-demo-store-"));
  for (const moduleName of ["push-notifications", "telegram-notifications"]) {
    const moduleSource = readFileSync(path.join(root, "src", "lib", `${moduleName}.ts`), "utf8");
    const moduleOutput = ts.transpileModule(moduleSource, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
      fileName: `${moduleName}.ts`,
    }).outputText;
    writeFileSync(path.join(tempDir, `${moduleName}.js`), moduleOutput);
  }
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

function sampleTrade(overrides = {}) {
  return {
    id: `trade_${Math.random().toString(16).slice(2)}`,
    pair: "BTCUSDT",
    direction: "BUY",
    openTime: 1_000,
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
    realizedPnlUSDC: 0,
    partialPnlUSDC: 0,
    signalReasons: ["test signal"],
    marketConditions: "test market",
    ...overrides,
  };
}

function withStore(fn) {
  const { DemoStore, tempDir } = loadDemoStore();
  const dbDir = mkdtempSync(path.join(tmpdir(), "oraculo-session-aggregates-"));
  const store = new DemoStore(path.join(dbDir, "oraculo.sqlite"));
  try {
    fn(store);
  } finally {
    store.close();
    rmSync(dbDir, { recursive: true, force: true });
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function createTestUser(store, username) {
  const admin = {
    id: "test_admin",
    name: "Test Admin",
    username: "test-admin",
    role: "admin",
    active: true,
    createdAt: new Date().toISOString(),
    lastLoginAt: null,
  };
  const user = store.createUser(admin, {
    username,
    name: username,
    password: "local-test-password",
    role: "user",
  });
  return user.id;
}

test("getSession returns zeroed aggregates with no open positions", () => {
  withStore((store) => {
    const userId = createTestUser(store, "session-empty");
    const session = store.getSession(userId);
    assert.equal(session.activeTrade, null);
    assert.equal(session.openPositionsCount, 0);
    assert.equal(session.openRiskUSDC, 0);
    assert.equal(session.unrealizedPnlUSDC, 0);
    assert.equal(session.realizedPnlUSDC, 0);
    assert.equal(session.partialPnlUSDC, 0);
  });
});

test("getSession aggregates 1, 2 and 3 open positions by pair price", () => {
  withStore((store) => {
    const userId = createTestUser(store, "session-multi");
    const btc = sampleTrade({ id: "btc", pair: "BTCUSDT", direction: "BUY", openTime: 1_000, entry: 100, stopLoss: 95, positionSize: 2, remainingPositionSize: 2 });
    const eth = sampleTrade({ id: "eth", pair: "ETHUSDT", direction: "SELL", openTime: 2_000, entry: 2000, stopLoss: 2020, positionSize: 1, remainingPositionSize: 1 });
    const sol = sampleTrade({
      id: "sol",
      pair: "SOLUSDT",
      direction: "BUY",
      openTime: 3_000,
      entry: 50,
      stopLoss: 51,
      stopLossOriginal: 45,
      positionSize: 10,
      remainingPositionSize: 5,
      target1Hit: true,
      isBreakevenStop: true,
      realizedPnlUSDC: 12,
      partialPnlUSDC: 12,
    });

    store.postPosition(userId, btc);
    store.setSetting(userId, "demo.lastPrice.BTCUSDT", 110);
    let session = store.getSession(userId);
    assert.equal(session.openPositionsCount, 1);
    assert.equal(session.activeTrade.id, "btc");
    assert.equal(session.openRiskUSDC, 10);
    assert.equal(session.unrealizedPnlUSDC, 20);

    store.postPosition(userId, eth);
    store.setSetting(userId, "demo.lastPrice.ETHUSDT", 1990);
    session = store.getSession(userId);
    assert.equal(session.openPositionsCount, 2);
    assert.equal(session.activeTrade.id, "eth");
    assert.equal(session.openRiskUSDC, 30);
    assert.equal(session.unrealizedPnlUSDC, 30);

    store.postPosition(userId, sol);
    session = store.getSession(userId);
    assert.equal(session.openPositionsCount, 3);
    assert.equal(session.activeTrade.id, "sol");
    assert.equal(session.openRiskUSDC, 30);
    assert.equal(session.unrealizedPnlUSDC, 30, "SOL has no own price and must contribute zero");
    assert.equal(session.realizedPnlUSDC, 12);
    assert.equal(session.partialPnlUSDC, 12);

    store.setSetting(userId, "demo.lastPrice.SOLUSDT", 55);
    session = store.getSession(userId);
    assert.equal(session.unrealizedPnlUSDC, 55);
  });
});

test("getSession combines closed history and open realized/partial PnL without double counting", () => {
  withStore((store) => {
    const userId = createTestUser(store, "session-history");
    store.upsertTrade(userId, sampleTrade({
      id: "closed_btc",
      status: "WIN",
      closeTime: Date.now(),
      closePrice: 110,
      pnlUSDC: 7,
      realizedPnlUSDC: 7,
      partialPnlUSDC: 2,
      remainingPositionSize: 0,
      exitReason: "TARGET_2",
    }));
    store.postPosition(userId, sampleTrade({
      id: "open_partial",
      pair: "SOLUSDT",
      entry: 50,
      stopLoss: 51,
      stopLossOriginal: 45,
      positionSize: 10,
      remainingPositionSize: 5,
      target1Hit: true,
      isBreakevenStop: true,
      realizedPnlUSDC: 12,
      partialPnlUSDC: 12,
    }));

    const session = store.getSession(userId);
    assert.equal(session.openPositionsCount, 1);
    assert.equal(session.openRiskUSDC, 0);
    assert.equal(session.realizedPnlUSDC, 19);
    assert.equal(session.partialPnlUSDC, 14);
  });
});
