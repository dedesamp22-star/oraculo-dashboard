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
  const tempDir = mkdtempSync(path.join(tmpdir(), "oraculo-loss-streak-store-"));
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

function withStore(fn) {
  const { DemoStore, tempDir } = loadDemoStore();
  const dbDir = mkdtempSync(path.join(tmpdir(), "oraculo-loss-streak-db-"));
  const store = new DemoStore(path.join(dbDir, "oraculo.sqlite"));
  const oldCooldown = process.env.ORACULO_DEMO_LOSS_STREAK_COOLDOWN_MINUTES;
  const oldLimit = process.env.ORACULO_DEMO_MAX_DAILY_TRADES;
  delete process.env.ORACULO_DEMO_MAX_DAILY_TRADES;
  try {
    fn(store);
  } finally {
    if (oldCooldown === undefined) delete process.env.ORACULO_DEMO_LOSS_STREAK_COOLDOWN_MINUTES;
    else process.env.ORACULO_DEMO_LOSS_STREAK_COOLDOWN_MINUTES = oldCooldown;
    if (oldLimit === undefined) delete process.env.ORACULO_DEMO_MAX_DAILY_TRADES;
    else process.env.ORACULO_DEMO_MAX_DAILY_TRADES = oldLimit;
    store.close();
    rmSync(dbDir, { recursive: true, force: true });
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function createUser(store, username = `loss-${Math.random().toString(16).slice(2)}`) {
  const now = new Date().toISOString();
  const admin = { id: "test-admin", name: "Test Admin", username: "admin", role: "admin", active: true, createdAt: now, lastLoginAt: null };
  return store.createUser(admin, { username, name: username, password: "local-test-password", role: "admin" }).id;
}

function sampleTrade(overrides = {}) {
  return {
    id: `trade_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    pair: "BTCUSDT",
    direction: "BUY",
    openTime: Date.now() - 60_000,
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

function closeTrade(store, userId, overrides, closePrice, exitReason = "STOP_LOSS") {
  const trade = sampleTrade(overrides);
  store.postPosition(userId, trade);
  return store.patchPosition(userId, trade.id, { status: "CLOSED", closePrice, exitReason });
}

function approvedSignal(pair = "ETHUSDT", overrides = {}) {
  return {
    pair,
    decision: "BUY",
    entryNum: 100,
    stopLossNum: 95,
    target1Num: 105,
    target2Num: 110,
    riskReward: "1:2",
    signalKey: `${pair}-${Date.now()}-${Math.random()}`,
    steps: [{ number: 1, name: "Teste", value: "OK", reason: "sinal aprovado" }],
    ...overrides,
  };
}

test("WIN and BREAKEVEN reset consecutive losses after two losses", () => {
  withStore((store) => {
    const userId = createUser(store, "loss-reset");
    closeTrade(store, userId, { id: "loss_1" }, 99.5);
    closeTrade(store, userId, { id: "loss_2", pair: "ETHUSDT" }, 99.5);
    assert.equal(store.getSession(userId).dailyStats.consecutiveLosses, 2);

    closeTrade(store, userId, { id: "win", pair: "SOLUSDT" }, 110, "TARGET_2");
    assert.equal(store.getSession(userId).dailyStats.consecutiveLosses, 0);

    closeTrade(store, userId, { id: "loss_3" }, 99.5);
    closeTrade(store, userId, { id: "loss_4", pair: "ETHUSDT" }, 99.5);
    closeTrade(store, userId, { id: "be", pair: "SOLUSDT" }, 100, "BREAKEVEN");
    assert.equal(store.getSession(userId).dailyStats.consecutiveLosses, 0);
  });
});

test("three losses create one cooldown and block only new entries", () => {
  withStore((store) => {
    process.env.ORACULO_DEMO_LOSS_STREAK_COOLDOWN_MINUTES = "60";
    const userId = createUser(store, "loss-cooldown");
    closeTrade(store, userId, { id: "l1", pair: "BTCUSDT", mfeUSDC: 2, peakGivebackPct: 80 }, 99.5);
    closeTrade(store, userId, { id: "l2", pair: "ETHUSDT", direction: "SELL", entry: 100, stopLoss: 105, stopLossOriginal: 105, target1: 95, target2: 90, mfeUSDC: 1 }, 100.5);
    closeTrade(store, userId, { id: "l3", pair: "SOLUSDT", mfeUSDC: 0, peakGivebackPct: 0 }, 99.5);

    const session = store.getSession(userId);
    assert.equal(session.safetyLimit.limited, true);
    assert.equal(session.safetyLimit.code, "LOSS_STREAK_COOLDOWN");
    assert.equal(session.safetyLimit.analysisContinues, true);
    assert.match(session.safetyLimit.reason, /Pausa temporaria apos 3 perdas consecutivas/);

    const diagnostics = store.getLossStreakDiagnostics(userId);
    assert.equal(diagnostics.length, 1);
    assert.equal(diagnostics[0].status, "ACTIVE");
    assert.equal(diagnostics[0].triggerTradeId, "l3");
    assert.equal(diagnostics[0].trades.length, 3);
    assert.ok(diagnostics[0].patterns.some((pattern) => pattern.name === "MFE_POSITIVO" && pattern.value === 2));

    const blocked = store.openFromSignalWithResult(userId, approvedSignal("BTCUSDT", {
      decision: "SELL",
      stopLossNum: 105,
      target1Num: 95,
      target2Num: 90,
    }));
    assert.equal(blocked.opened, false);
    assert.equal(blocked.decisionState, "BLOQUEADO_RISCO");
    assert.match(blocked.blockedReason, /Pausa temporaria apos 3 perdas consecutivas/);
    assert.equal(store.getLossStreakDiagnostics(userId).length, 1, "same trigger trade cannot create duplicate diagnostics");
  });
});

test("cooldown expiration resumes openings and does not rearm from stale counter", () => {
  withStore((store) => {
    process.env.ORACULO_DEMO_LOSS_STREAK_COOLDOWN_MINUTES = "60";
    const userId = createUser(store, "loss-expire");
    closeTrade(store, userId, { id: "e1", pair: "BTCUSDT" }, 99.5);
    closeTrade(store, userId, { id: "e2", pair: "ETHUSDT" }, 99.5);
    closeTrade(store, userId, { id: "e3", pair: "SOLUSDT" }, 99.5);
    assert.equal(store.getSession(userId).safetyLimit.limited, true);

    store.db.prepare("UPDATE demo_loss_streak_diagnostics SET cooldown_ends_at = ? WHERE user_id = ?")
      .run(new Date(Date.now() - 60_000).toISOString(), userId);
    const resumed = store.getSession(userId);
    assert.equal(resumed.safetyLimit.limited, false);
    assert.equal(resumed.dailyStats.consecutiveLosses, 3, "expiry does not mutate the loss counter");

    closeTrade(store, userId, { id: "isolated_after_resume", pair: "BTCUSDT" }, 99.5);
    assert.equal(store.getSession(userId).safetyLimit.limited, false, "one extra loss after resume must not rearm by stale counter");
    assert.equal(store.getLossStreakDiagnostics(userId).length, 1);

    closeTrade(store, userId, { id: "reset_win", pair: "ETHUSDT" }, 110, "TARGET_2");
    closeTrade(store, userId, { id: "n1", pair: "BTCUSDT" }, 99.5);
    closeTrade(store, userId, { id: "n2", pair: "ETHUSDT" }, 99.5);
    closeTrade(store, userId, { id: "n3", pair: "SOLUSDT" }, 99.5);
    assert.equal(store.getSession(userId).safetyLimit.code, "LOSS_STREAK_COOLDOWN");
    assert.equal(store.getLossStreakDiagnostics(userId).length, 2);
  });
});

test("config zero records diagnostic without blocking and audit enrichment stays conservative", () => {
  withStore((store) => {
    process.env.ORACULO_DEMO_LOSS_STREAK_COOLDOWN_MINUTES = "0";
    const userId = createUser(store, "loss-zero");
    closeTrade(store, userId, { id: "z1", pair: "BTCUSDT" }, 99.5);
    closeTrade(store, userId, { id: "z2", pair: "ETHUSDT" }, 99.5);
    const trigger = sampleTrade({ id: "z3", pair: "SOLUSDT", openTime: Date.now() - 120_000 });
    store.postPosition(userId, trigger);
    store.recordEngineAudit({
      userId,
      symbol: "SOLUSDT",
      analyzedAt: new Date(trigger.openTime - 1_000).toISOString(),
      score: 71,
      scoreContextual: 80,
      scoreRaw: 90,
      direction: "BUY",
      decision: "BUY",
      decisionState: "ENTRADA_APROVADA",
      triggerStage: "RETESTE",
      rrStatus: "OK",
      trend1h: "ALTA",
      trend15m: "ALTA",
      filtersPassed: [],
      filtersBlocked: [],
      filtersPenalty: [],
      blockedReasons: [],
      qualityPenalties: [],
      decisiveReason: "auditoria unica",
      missingConditions: [],
      entryPrice: 100,
      stopPrice: 95,
      target1: 105,
      target2: 110,
      rr: 2,
      volumeRelative: 1.2,
      engineVersion: "test",
    });
    store.recordEngineAudit({
      userId,
      symbol: "SOLUSDT",
      analyzedAt: new Date(trigger.openTime + 1_000).toISOString(),
      score: 72,
      scoreContextual: 81,
      scoreRaw: 91,
      direction: "BUY",
      decision: "BUY",
      decisionState: "ENTRADA_APROVADA",
      triggerStage: "RETESTE",
      rrStatus: "OK",
      trend1h: "ALTA",
      trend15m: "ALTA",
      filtersPassed: [],
      filtersBlocked: [],
      filtersPenalty: [],
      blockedReasons: [],
      qualityPenalties: [],
      decisiveReason: "auditoria ambigua",
      missingConditions: [],
      entryPrice: 100,
      stopPrice: 95,
      target1: 105,
      target2: 110,
      rr: 2,
      volumeRelative: 1.3,
      engineVersion: "test",
    });
    store.patchPosition(userId, "z3", { status: "CLOSED", closePrice: 99.5, exitReason: "STOP_LOSS" });

    const session = store.getSession(userId);
    assert.equal(session.safetyLimit.limited, false);
    assert.equal(session.settings.lossStreakCooldownMinutes, 0);
    const diagnostic = store.getLossStreakDiagnostics(userId)[0];
    assert.equal(diagnostic.status, "COMPLETED");
    assert.equal(diagnostic.cooldownEndsAt, null);
    const triggerSnapshot = diagnostic.trades.find((trade) => trade.id === "z3");
    assert.ok(triggerSnapshot);
    assert.equal(triggerSnapshot.score, null, "ambiguous audit match must not enrich the trade");
    assert.equal(triggerSnapshot.volumeRelative, null);

    const opened = store.openFromSignalWithResult(userId, approvedSignal("BTCUSDT", {
      decision: "SELL",
      stopLossNum: 105,
      target1Num: 95,
      target2Num: 90,
    }));
    assert.equal(opened.opened, true);
  });
});
