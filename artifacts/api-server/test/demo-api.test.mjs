import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const node = process.execPath;

function sampleTrade(overrides = {}) {
  return {
    id: `trade_${Date.now()}_${Math.random().toString(16).slice(2)}`,
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
    riskReward: "1:2",
    status: "OPEN",
    target1Hit: false,
    isBreakevenStop: false,
    signalReasons: ["test signal"],
    marketConditions: "test market",
    ...overrides,
  };
}

async function startServer({ port, dbPath }) {
  const child = spawn(node, [path.join(root, "dist", "index.mjs")], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: "test",
      ORACULO_DB_PATH: dbPath,
      ORACULO_ADMIN_PASSWORD: "local-test-password",
      ORACULO_SESSION_SECRET: "local-test-session-secret-32-bytes",
      ORACULO_REQUIRE_HTTPS: process.env.ORACULO_REQUIRE_HTTPS ?? "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  child.stdout.on("data", (chunk) => { logs += chunk.toString(); });
  child.stderr.on("data", (chunk) => { logs += chunk.toString(); });

  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/api/healthz`);
      if (res.ok) return { child, base, logs: () => logs };
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  child.kill();
  throw new Error(`server did not start\n${logs}`);
}

async function stopServer(child) {
  if (child.killed) return;
  child.kill();
  await new Promise((resolve) => child.once("exit", resolve));
}

async function login(base) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: "local-test-password" }),
  });
  assert.equal(res.status, 200);
  const cookie = res.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie?.startsWith("oraculo_session="));
  return cookie;
}

async function json(res) {
  return await res.json();
}

test("demo API auth, validation, migration, persistence, and trade lifecycle", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "oraculo-demo-"));
  const dbPath = path.join(dir, "oraculo.sqlite");
  const port = 5123;
  let server = await startServer({ port, dbPath });
  try {
    const unauthorized = await fetch(`${server.base}/api/demo/account`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ balance: 2000, configuredBalance: 2000, dailyStats: {} }),
    });
    assert.equal(unauthorized.status, 401);

    const cookie = await login(server.base);

    const invalid = await fetch(`${server.base}/api/demo/positions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(sampleTrade({ entry: -1 })),
    });
    assert.equal(invalid.status, 400);

    const trade = sampleTrade({ id: "cycle_1" });
    const opened = await fetch(`${server.base}/api/demo/positions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(trade),
    });
    assert.equal(opened.status, 200);

    const duplicate = await fetch(`${server.base}/api/demo/positions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(sampleTrade({ id: "cycle_dup", pair: "BTCUSDT" })),
    });
    assert.equal(duplicate.status, 409);

    const target1 = await fetch(`${server.base}/api/demo/positions/${trade.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ stopLoss: 100, target1Hit: true, isBreakevenStop: true }),
    });
    assert.equal(target1.status, 200);
    assert.equal((await json(target1)).stopLoss, 100);

    const closed = await fetch(`${server.base}/api/demo/positions/${trade.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ status: "WIN", closePrice: 110, exitReason: "TARGET_2", pnlUSDC: 999999 }),
    });
    assert.equal(closed.status, 200);
    const closedTrade = await json(closed);
    assert.equal(closedTrade.pnlUSDC, 20);
    assert.equal(closedTrade.status, "WIN");

    const migrationSession = {
      balance: 1020,
      configuredBalance: 1000,
      activeTrade: null,
      history: [sampleTrade({
        id: "migrated_1",
        status: "LOSS",
        closeTime: Date.now(),
        closePrice: 95,
        exitReason: "STOP_LOSS",
      })],
      dailyStats: {
        date: "2026-07-17",
        startOfDayBalance: 1000,
        totalTrades: 1,
        wins: 0,
        losses: 1,
        breakevens: 0,
        consecutiveLosses: 1,
        maxConsecutiveLosses: 1,
        dailyPnL: -10,
        peakBalance: 1000,
        maxDrawdown: 10,
        safetyLimited: false,
      },
    };
    for (let i = 0; i < 2; i++) {
      const migrated = await fetch(`${server.base}/api/demo/migrate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify(migrationSession),
      });
      assert.equal(migrated.status, 200);
    }
    const tradesAfterMigration = await json(await fetch(`${server.base}/api/demo/trades`));
    assert.equal(tradesAfterMigration.filter((item) => item.id === "migrated_1").length, 1);

    await stopServer(server.child);
    server = await startServer({ port, dbPath });
    const persistedTrades = await json(await fetch(`${server.base}/api/demo/trades`));
    assert.ok(persistedTrades.some((item) => item.id === "cycle_1"));
    assert.ok(persistedTrades.some((item) => item.id === "migrated_1"));

    const cookie2 = await login(server.base);
    const concurrentTrade = sampleTrade({ id: "concurrent_1", pair: "ETHUSDT", positionSize: 1 });
    assert.equal((await fetch(`${server.base}/api/demo/positions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie2 },
      body: JSON.stringify(concurrentTrade),
    })).status, 200);

    const closeBody = JSON.stringify({ status: "WIN", closePrice: 120, exitReason: "TARGET_2" });
    const results = await Promise.all([
      fetch(`${server.base}/api/demo/positions/${concurrentTrade.id}`, { method: "PATCH", headers: { "Content-Type": "application/json", Cookie: cookie2 }, body: closeBody }),
      fetch(`${server.base}/api/demo/positions/${concurrentTrade.id}`, { method: "PATCH", headers: { "Content-Type": "application/json", Cookie: cookie2 }, body: closeBody }),
    ]);
    assert.equal(results.filter((res) => res.status === 200).length, 1);
    assert.equal(results.filter((res) => res.status === 404).length, 1);
  } finally {
    await stopServer(server.child);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("HTTPS lock blocks auth and writes over HTTP", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "oraculo-demo-https-"));
  const dbPath = path.join(dir, "oraculo.sqlite");
  const port = 5124;
  process.env.ORACULO_REQUIRE_HTTPS = "true";
  const server = await startServer({ port, dbPath });
  try {
    const blockedLogin = await fetch(`${server.base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "local-test-password" }),
    });
    assert.equal(blockedLogin.status, 403);
    assert.match((await blockedLogin.text()), /HTTPS is required/);

    const blockedSpoof = await fetch(`${server.base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-Proto": "http" },
      body: JSON.stringify({ password: "local-test-password" }),
    });
    assert.equal(blockedSpoof.status, 403);

    const allowedLocalHttps = await fetch(`${server.base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-Proto": "https" },
      body: JSON.stringify({ password: "local-test-password" }),
    });
    assert.equal(allowedLocalHttps.status, 200);
  } finally {
    delete process.env.ORACULO_REQUIRE_HTTPS;
    await stopServer(server.child);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("server session is authoritative and demo signal/price events are idempotent", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "oraculo-demo-authoritative-"));
  const dbPath = path.join(dir, "oraculo.sqlite");
  const port = 5125;
  const server = await startServer({ port, dbPath });
  try {
    const cookie = await login(server.base);
    const signal = {
      pair: "BTCUSDT",
      decision: "BUY",
      entryNum: 100,
      stopLossNum: 95,
      target1Num: 105,
      target2Num: 110,
      riskReward: "1:2",
      signalKey: "same-candle-same-signal",
      steps: [{ number: 1, name: "test", value: "ok", reason: "unit test signal" }],
    };

    const browserAOpen = await fetch(`${server.base}/api/demo/signal`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(signal),
    });
    assert.equal(browserAOpen.status, 200);
    const sessionA = await json(browserAOpen);
    assert.equal(sessionA.activeTrade.pair, "BTCUSDT");

    const browserBDuplicate = await fetch(`${server.base}/api/demo/signal`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(signal),
    });
    assert.equal(browserBDuplicate.status, 200);

    const browserBSession = await json(await fetch(`${server.base}/api/demo/session`));
    assert.equal(browserBSession.activeTrade.id, sessionA.activeTrade.id);
    assert.equal((await json(await fetch(`${server.base}/api/demo/positions`))).length, 1);

    for (let i = 0; i < 2; i++) {
      const target1 = await fetch(`${server.base}/api/demo/price`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ pair: "BTCUSDT", price: 105 }),
      });
      assert.equal(target1.status, 200);
    }
    const afterTarget1 = await json(await fetch(`${server.base}/api/demo/session`));
    assert.equal(afterTarget1.activeTrade.target1Hit, true);
    assert.equal(afterTarget1.activeTrade.stopLoss, 100);
    assert.equal(afterTarget1.history.length, 0);

    await Promise.all([
      fetch(`${server.base}/api/demo/price`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ pair: "BTCUSDT", price: 110 }),
      }),
      fetch(`${server.base}/api/demo/price`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ pair: "BTCUSDT", price: 110 }),
      }),
    ]);

    const finalSession = await json(await fetch(`${server.base}/api/demo/session`));
    assert.equal(finalSession.activeTrade, null);
    assert.equal(finalSession.history.filter((item) => item.id === sessionA.activeTrade.id).length, 1);
    assert.equal(finalSession.dailyStats.wins, 1);
    assert.equal(finalSession.dailyStats.dailyPnL, 20);

    await stopServer(server.child);
    const restarted = await startServer({ port, dbPath });
    try {
      const persisted = await json(await fetch(`${restarted.base}/api/demo/session`));
      assert.equal(persisted.history.filter((item) => item.id === sessionA.activeTrade.id).length, 1);
      assert.equal(persisted.activeTrade, null);
    } finally {
      await stopServer(restarted.child);
    }
  } finally {
    await stopServer(server.child);
    rmSync(dir, { recursive: true, force: true });
  }
});
