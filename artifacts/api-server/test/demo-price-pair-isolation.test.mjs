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
  const tempDir = mkdtempSync(path.join(tmpdir(), "oraculo-price-isolation-store-"));
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
  const dbDir = mkdtempSync(path.join(tmpdir(), "oraculo-price-isolation-db-"));
  const dbPath = path.join(dbDir, "oraculo.sqlite");
  const store = new DemoStore(dbPath);
  try {
    return fn(store);
  } finally {
    store.close();
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
    signalReasons: ["pair isolation test"],
    marketConditions: "pair isolation test",
    ...overrides,
  };
}

function positionByPair(store, userId, pair) {
  return store.getPositions(userId).find((position) => position.pair === pair);
}

function positionSnapshot(position) {
  return {
    status: position.status,
    stopLoss: position.stopLoss,
    target1Hit: position.target1Hit,
    isBreakevenStop: position.isBreakevenStop,
    trailing: position.trailing,
    remainingPositionSize: position.remainingPositionSize,
    mfeUSDC: position.mfeUSDC,
    maeUSDC: position.maeUSDC,
    maxPriceSinceEntry: position.maxPriceSinceEntry,
    minPriceSinceEntry: position.minPriceSinceEntry,
    managementTimeline: position.managementTimeline,
  };
}

test("demo price updates are isolated by trading pair", () => {
  withStore((store) => {
    const userId = createUser(store, "price-isolation");
    store.postPosition(userId, sampleTrade({
      id: "btc-open",
      pair: "BTCUSDT",
      entry: 64000,
      stopLoss: 63000,
      stopLossOriginal: 63000,
      target1: 65000,
      target2: 66000,
      riskAmount: 1000,
      initialRiskAmount: 1000,
      positionSize: 1,
      remainingPositionSize: 1,
    }));
    store.postPosition(userId, sampleTrade({
      id: "eth-open",
      pair: "ETHUSDT",
      entry: 1900,
      stopLoss: 1850,
      stopLossOriginal: 1850,
      target1: 1950,
      target2: 2000,
      riskAmount: 50,
      initialRiskAmount: 50,
      positionSize: 1,
      remainingPositionSize: 1,
    }));

    const ethBeforeBtcTick = positionSnapshot(positionByPair(store, userId, "ETHUSDT"));
    store.updatePrices(userId, { pair: "BTCUSDT", price: 64300 });
    const btcAfterBtcTick = positionByPair(store, userId, "BTCUSDT");
    const ethAfterBtcTick = positionByPair(store, userId, "ETHUSDT");
    assert.ok(btcAfterBtcTick.mfeUSDC > 0);
    assert.deepEqual(positionSnapshot(ethAfterBtcTick), ethBeforeBtcTick);

    const btcBeforeEthTick = positionSnapshot(btcAfterBtcTick);
    store.updatePrices(userId, { pair: "ETHUSDT", price: 1913 });
    const btcAfterEthTick = positionByPair(store, userId, "BTCUSDT");
    const ethAfterEthTick = positionByPair(store, userId, "ETHUSDT");
    assert.ok(ethAfterEthTick.mfeUSDC > 0);
    assert.deepEqual(positionSnapshot(btcAfterEthTick), btcBeforeEthTick);
  });
});

test("demo price update without pair fails and leaves every position untouched", () => {
  withStore((store) => {
    const userId = createUser(store, "price-missing-pair");
    store.postPosition(userId, sampleTrade({ id: "btc-open", pair: "BTCUSDT", entry: 64000, stopLoss: 63000, stopLossOriginal: 63000, target1: 65000, target2: 66000 }));
    store.postPosition(userId, sampleTrade({ id: "eth-open", pair: "ETHUSDT", entry: 1900, stopLoss: 1850, stopLossOriginal: 1850, target1: 1950, target2: 2000 }));
    const before = store.getPositions(userId).map(positionSnapshot);

    assert.throws(
      () => store.updatePrices(userId, { price: 1913 }),
      (err) => err?.status === 400 && /pair must be a non-empty string/.test(err.message),
    );

    assert.deepEqual(store.getPositions(userId).map(positionSnapshot), before);
  });
});
