import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

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

async function startServer({ port, dbPath }) {
  const child = spawn(node, [path.join(root, "dist", "index.mjs")], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: "test",
      ORACULO_DB_PATH: dbPath,
      ORACULO_ADMIN_PASSWORD: "local-test-password",
      ORACULO_INITIAL_ADMIN_USERNAME: "admin",
      ORACULO_INITIAL_ADMIN_NAME: "Admin Teste",
      ORACULO_INITIAL_ADMIN_PASSWORD: "local-test-password",
      ORACULO_SESSION_SECRET: "local-test-session-secret-32-bytes",
      ORACULO_REQUIRE_HTTPS: process.env.ORACULO_REQUIRE_HTTPS ?? "false",
      ORACULO_TELEGRAM_BOT_TOKEN: "123456:test-bot-token-not-real",
      ORACULO_TELEGRAM_WEBHOOK_SECRET: "telegram-webhook-secret-test",
      ORACULO_TELEGRAM_BOT_USERNAME: "OraculoTestBot",
      ORACULO_TELEGRAM_MOCK: "true",
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
    body: JSON.stringify({ username: "admin", password: "local-test-password" }),
  });
  assert.equal(res.status, 200);
  const cookie = res.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie?.startsWith("oraculo_session="));
  return cookie;
}

async function loginAs(base, username, password) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  assert.equal(res.status, 200);
  const cookie = res.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie?.startsWith("oraculo_session="));
  return cookie;
}

async function authedJson(base, cookie, path) {
  return await json(await fetch(`${base}${path}`, { headers: { Cookie: cookie } }));
}

async function createUser(base, adminCookie, body) {
  const res = await fetch(`${base}/api/auth/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify(body),
  });
  assert.equal(res.status, 200);
  return await json(res);
}

async function json(res) {
  return await res.json();
}

async function postPosition(base, cookie, trade) {
  const res = await fetch(`${base}/api/demo/positions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(trade),
  });
  assert.equal(res.status, 200);
  return await json(res);
}

async function postPrice(base, cookie, pair, price) {
  const res = await fetch(`${base}/api/demo/price`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ pair, price }),
  });
  assert.equal(res.status, 200);
  return await json(res);
}

async function startSimulation(base, cookie, overrides = {}) {
  const scenario = {
    symbol: "BTCUSDT",
    direction: "BUY",
    entry: 100,
    stopLoss: 95,
    target1: 105,
    target2: 110,
    quantity: 2,
    riskAmount: 10,
    maxDurationMs: 90 * 60 * 1000,
    initialPrice: 100,
    ...overrides,
  };
  const res = await fetch(`${base}/api/admin/simulations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(scenario),
  });
  assert.equal(res.status, 200);
  return await json(res);
}

async function stepSimulation(base, cookie, id, step, extra = {}) {
  const res = await fetch(`${base}/api/admin/simulations/${id}/step`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ step, idempotencyKey: `${step}:test`, ...extra }),
  });
  assert.equal(res.status, 200);
  return await json(res);
}

async function simulationEvents(base, cookie, id) {
  return await authedJson(base, cookie, `/api/admin/simulations/${id}/events`);
}

async function notifications(base, cookie, query = "") {
  return await authedJson(base, cookie, `/api/notifications${query}`);
}

async function setNotificationPrefs(base, cookie, body) {
  const res = await fetch(`${base}/api/notification-preferences`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(body),
  });
  assert.equal(res.status, 200);
  return await json(res);
}

async function subscribeDummyPush(base, cookie, endpoint) {
  const res = await fetch(`${base}/api/push/subscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ endpoint, keys: { p256dh: "dummy-p256dh", auth: "dummy-auth" } }),
  });
  assert.equal(res.status, 200);
  return await json(res);
}

async function waitFor(condition, message, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.fail(message);
}

async function runHomologationTradeFlow(base, cookie, trade) {
  const initialSession = await authedJson(base, cookie, "/api/demo/session");
  assert.equal(initialSession.activeTrade, null);

  assert.equal((await fetch(`${base}/api/demo/automation`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ enabled: true, symbol: trade.pair }),
  })).status, 200);

  await postPosition(base, cookie, trade);
  const opened = await authedJson(base, cookie, "/api/demo/session");
  assert.equal(opened.activeTrade.id, trade.id);
  assert.equal(opened.dailyStats.totalTrades, 0);

  const partial = await postPrice(base, cookie, trade.pair, trade.target1);
  assert.equal(partial.activeTrade.target1Hit, true);
  assert.equal(partial.activeTrade.remainingPositionSize, trade.positionSize * 0.5);
  assert.equal(partial.activeTrade.isBreakevenStop, true);
  assert.ok(trade.direction === "BUY"
    ? partial.activeTrade.stopLoss >= trade.entry
    : partial.activeTrade.stopLoss <= trade.entry);
  assert.ok(partial.realizedPnlUSDC > 0);
  assert.equal(partial.dailyStats.totalTrades, 0);

  const trailed = await postPrice(base, cookie, trade.pair, trade.direction === "BUY" ? trade.target1 + 1 : trade.target1 - 1);
  assert.ok(trade.direction === "BUY"
    ? trailed.activeTrade.stopLoss >= partial.activeTrade.stopLoss
    : trailed.activeTrade.stopLoss <= partial.activeTrade.stopLoss);

  const closed = await postPrice(base, cookie, trade.pair, trade.target2);
  assert.equal(closed.activeTrade, null);
  assert.equal(closed.history[0].id, trade.id);
  assert.equal(closed.history[0].status, "WIN");
  assert.equal(closed.dailyStats.totalTrades, 1);
  assert.equal(closed.dailyStats.wins, 1);
  assert.ok(closed.balance > initialSession.balance);
  return closed;
}

function getUserId(dbPath, username) {
  const db = new DatabaseSync(dbPath);
  try {
    const row = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
    assert.ok(row?.id, `missing user ${username}`);
    return String(row.id);
  } finally {
    db.close();
  }
}

function upsertDiagnostic(db, {
  userId,
  symbol = "BTCUSDT",
  status = "WAIT",
  decision = "SEM ENTRADA",
  direction = "AGUARDAR",
  score = 0,
  fingerprint = `${userId}:${symbol}:${status}`,
  minutesAgo = 0,
  adminPayload = {},
  userPayload = {},
}) {
  const finished = new Date(Date.now() - minutesAgo * 60_000).toISOString();
  const started = new Date(Date.now() - minutesAgo * 60_000 - 1200).toISOString();
  const summary = userPayload.summary ?? `${symbol} ${status}`;
  const quality = userPayload.quality ?? (score >= 70 ? "valida" : "aguardar");
  db.prepare(`
    INSERT INTO worker_diagnostics
      (id, user_id, symbol, status, worker_active, automation_active, cycle_started_at, cycle_finished_at,
       cycle_duration_ms, latency_ms, decision, score, direction, quality, summary, next_cycle_at, last_error,
       engine_version, fingerprint, admin_json, user_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, 1, ?, ?, 1200, 48, ?, ?, ?, ?, ?, ?, ?, '0.5', ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, symbol, fingerprint) DO UPDATE SET
      cycle_finished_at = excluded.cycle_finished_at,
      score = excluded.score,
      summary = excluded.summary,
      admin_json = excluded.admin_json,
      user_json = excluded.user_json,
      updated_at = excluded.updated_at
  `).run(
    `diag_${userId}_${symbol}_${fingerprint}`.replace(/[^a-zA-Z0-9_]/g, "_"),
    userId,
    symbol,
    status,
    started,
    finished,
    decision,
    score,
    direction,
    quality,
    summary,
    new Date(Date.now() + 30_000).toISOString(),
    status === "ERROR" ? "simulated worker error" : null,
    fingerprint,
    JSON.stringify({
      symbol,
      indicators: { ema9: 100, ema21: 99.8, ema200: 98.4, atr: 12, volumeRelative: 1.2 },
      filters: { approved: ["Tendencia 1H"], rejected: status === "BLOCKED" ? ["R/R"] : [], all: [] },
      score: { raw: score + 5, final: score, penalties: status === "BLOCKED" ? ["R/R"] : [] },
      strategySecret: "admin-only",
      ...adminPayload,
    }),
    JSON.stringify({ symbol, status, direction, quality, summary, ...userPayload }),
    finished,
    finished,
  );
}

test("0.4 homologation integrated flow persists and isolates admin and second user", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "oraculo-demo-homologation-"));
  const dbPath = path.join(dir, "oraculo.sqlite");
  const port = 5133;
  let server = await startServer({ port, dbPath });
  try {
    const adminCookie = await login(server.base);
    await createUser(server.base, adminCookie, {
      username: "homologacao",
      name: "Usuario Homologacao",
      password: "homologacao-safe-123",
      role: "user",
    });
    const userCookie = await loginAs(server.base, "homologacao", "homologacao-safe-123");

    const adminClosed = await runHomologationTradeFlow(server.base, adminCookie, sampleTrade({
      id: "homolog_admin_btc",
      pair: "BTCUSDT",
      target2: 110,
    }));
    const userClosed = await runHomologationTradeFlow(server.base, userCookie, sampleTrade({
      id: "homolog_user_eth",
      pair: "ETHUSDT",
      target2: 110,
    }));

    assert.equal(adminClosed.history.some((trade) => trade.id === "homolog_user_eth"), false);
    assert.equal(userClosed.history.some((trade) => trade.id === "homolog_admin_btc"), false);

    assert.equal((await fetch(`${server.base}/api/auth/logout`, { method: "POST", headers: { Cookie: adminCookie } })).status, 200);
    assert.equal((await fetch(`${server.base}/api/demo/session`, { headers: { Cookie: adminCookie } })).status, 401);

    await stopServer(server.child);
    server = await startServer({ port, dbPath });
    const adminCookieAfterRestart = await login(server.base);
    const userCookieAfterRestart = await loginAs(server.base, "homologacao", "homologacao-safe-123");
    const persistedAdmin = await authedJson(server.base, adminCookieAfterRestart, "/api/demo/session");
    const persistedUser = await authedJson(server.base, userCookieAfterRestart, "/api/demo/session");

    assert.equal(persistedAdmin.history.some((trade) => trade.id === "homolog_admin_btc"), true);
    assert.equal(persistedAdmin.history.some((trade) => trade.id === "homolog_user_eth"), false);
    assert.equal(persistedUser.history.some((trade) => trade.id === "homolog_user_eth"), true);
    assert.equal(persistedUser.history.some((trade) => trade.id === "homolog_admin_btc"), false);
    assert.equal(persistedAdmin.dailyStats.totalTrades, 1);
    assert.equal(persistedUser.dailyStats.totalTrades, 1);
  } finally {
    await stopServer(server.child);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("multiuser auth isolates demo data and protects sessions", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "oraculo-demo-auth-"));
  const dbPath = path.join(dir, "oraculo.sqlite");
  const port = 5132;
  const server = await startServer({ port, dbPath });
  try {
    const privateRead = await fetch(`${server.base}/api/demo/session`);
    assert.equal(privateRead.status, 401);

    const invalidPassword = await fetch(`${server.base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "wrong-password" }),
    });
    const unknownUser = await fetch(`${server.base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "nobody", password: "wrong-password" }),
    });
    assert.equal(invalidPassword.status, 401);
    assert.equal(unknownUser.status, 401);
    assert.deepEqual(await json(invalidPassword), await json(unknownUser));

    const adminCookie = await login(server.base);
    const me = await authedJson(server.base, adminCookie, "/api/auth/me");
    assert.equal(me.authenticated, true);
    assert.equal(me.user.username, "admin");
    assert.equal(me.user.password_hash, undefined);
    assert.equal(me.user.password_salt, undefined);

    const alice = await createUser(server.base, adminCookie, {
      username: "alice",
      name: "Alice",
      password: "same-safe-password-123",
      role: "user",
    });
    const bob = await createUser(server.base, adminCookie, {
      username: "bob",
      name: "Bob",
      password: "same-safe-password-123",
      role: "user",
    });
    assert.equal(alice.user.password_hash, undefined);
    assert.equal(bob.user.password_salt, undefined);

    const db = new DatabaseSync(dbPath);
    try {
      const hashes = db.prepare("SELECT username, password_hash, password_salt FROM users WHERE username IN ('alice','bob') ORDER BY username").all();
      assert.equal(hashes.length, 2);
      assert.notEqual(hashes[0].password_salt, hashes[1].password_salt);
      assert.notEqual(hashes[0].password_hash, hashes[1].password_hash);
    } finally {
      db.close();
    }

    const aliceCookie = await loginAs(server.base, "alice", "same-safe-password-123");
    const bobCookie = await loginAs(server.base, "bob", "same-safe-password-123");

    await postPosition(server.base, aliceCookie, sampleTrade({ id: "alice_btc", pair: "BTCUSDT" }));
    await postPosition(server.base, bobCookie, sampleTrade({ id: "bob_eth", pair: "ETHUSDT" }));

    const alicePositions = await authedJson(server.base, aliceCookie, "/api/demo/positions");
    const bobPositions = await authedJson(server.base, bobCookie, "/api/demo/positions");
    assert.deepEqual(alicePositions.map((item) => item.id), ["alice_btc"]);
    assert.deepEqual(bobPositions.map((item) => item.id), ["bob_eth"]);

    const crossPatch = await fetch(`${server.base}/api/demo/positions/bob_eth`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: aliceCookie },
      body: JSON.stringify({ stopLoss: 99 }),
    });
    assert.equal(crossPatch.status, 404);

    const bobClosedTrade = sampleTrade({ id: "bob_closed", pair: "SOLUSDT", status: "WIN", closeTime: Date.now(), closePrice: 110, exitReason: "TARGET_2" });
    assert.equal((await fetch(`${server.base}/api/demo/trades`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: bobCookie },
      body: JSON.stringify(bobClosedTrade),
    })).status, 200);
    assert.equal((await fetch(`${server.base}/api/demo/trades`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: aliceCookie },
      body: JSON.stringify(bobClosedTrade),
    })).status, 404);

    const aliceAutomation = await fetch(`${server.base}/api/demo/automation`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: aliceCookie },
      body: JSON.stringify({ enabled: true, symbol: "SOLUSDT" }),
    });
    assert.equal(aliceAutomation.status, 200);
    assert.equal((await authedJson(server.base, aliceCookie, "/api/demo/automation")).enabled, true);
    assert.equal((await authedJson(server.base, bobCookie, "/api/demo/automation")).enabled, false);

    const adminCreate = await fetch(`${server.base}/api/auth/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: aliceCookie },
      body: JSON.stringify({ username: "mallory", password: "safe-password-1234" }),
    });
    assert.equal(adminCreate.status, 403);

    const publicBinanceValidation = await fetch(`${server.base}/api/binance/klines?symbol=BTCUSDT&interval=bad&limit=1`);
    assert.equal(publicBinanceValidation.status, 400);

    const db2 = new DatabaseSync(dbPath);
    try {
      db2.prepare("UPDATE users SET active = 0 WHERE username = 'bob'").run();
      const aliceSessionId = aliceCookie.split("=")[1].split(".")[0];
      db2.prepare("UPDATE auth_sessions SET expires_at = ? WHERE id = ?").run(Date.now() - 1000, aliceSessionId);
    } finally {
      db2.close();
    }
    const expiredAlice = await fetch(`${server.base}/api/demo/session`, { headers: { Cookie: aliceCookie } });
    assert.equal(expiredAlice.status, 401);

    const inactiveBob = await fetch(`${server.base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "bob", password: "same-safe-password-123" }),
    });
    assert.equal(inactiveBob.status, 401);

    const logout = await fetch(`${server.base}/api/auth/logout`, { method: "POST", headers: { Cookie: aliceCookie } });
    assert.equal(logout.status, 200);
    const afterLogout = await fetch(`${server.base}/api/demo/session`, { headers: { Cookie: aliceCookie } });
    assert.equal(afterLogout.status, 401);
  } finally {
    await stopServer(server.child);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("worker diagnostics API separates admin details, user DTOs, history, dedupe, and isolation", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "oraculo-worker-diagnostics-"));
  const dbPath = path.join(dir, "oraculo.sqlite");
  const port = 5134;
  let server = await startServer({ port, dbPath });
  try {
    const unauthorized = await fetch(`${server.base}/api/worker/diagnostics`);
    assert.equal(unauthorized.status, 401);

    const adminCookie = await login(server.base);
    await createUser(server.base, adminCookie, {
      username: "cliente",
      name: "Cliente",
      password: "cliente-safe-123",
      role: "user",
    });
    const userCookie = await loginAs(server.base, "cliente", "cliente-safe-123");
    const adminId = getUserId(dbPath, "admin");
    const userId = getUserId(dbPath, "cliente");

    const db = new DatabaseSync(dbPath);
    try {
      upsertDiagnostic(db, { userId: adminId, symbol: "BTCUSDT", status: "WAIT", decision: "SEM ENTRADA", direction: "AGUARDAR", score: 35, fingerprint: "btc-wait", minutesAgo: 6 });
      upsertDiagnostic(db, { userId: adminId, symbol: "ETHUSDT", status: "APPROVED", decision: "BUY", direction: "COMPRA", score: 82, fingerprint: "eth-buy", minutesAgo: 5 });
      upsertDiagnostic(db, { userId: adminId, symbol: "SOLUSDT", status: "APPROVED", decision: "SELL", direction: "VENDA", score: 78, fingerprint: "sol-sell", minutesAgo: 4 });
      upsertDiagnostic(db, { userId: adminId, symbol: "BTCUSDT", status: "BLOCKED", decision: "SEM ENTRADA", direction: "AGUARDAR", score: 62, fingerprint: "btc-blocked", minutesAgo: 3 });
      upsertDiagnostic(db, { userId: adminId, symbol: "ETHUSDT", status: "ERROR", decision: "ERROR", direction: "ERRO", score: null, fingerprint: "eth-error", minutesAgo: 2 });
      upsertDiagnostic(db, { userId: adminId, symbol: "SOLUSDT", status: "WAIT", decision: "SEM ENTRADA", direction: "AGUARDAR", score: 40, fingerprint: "dedupe-window", minutesAgo: 1, userPayload: { summary: "primeira leitura" } });
      upsertDiagnostic(db, { userId: adminId, symbol: "SOLUSDT", status: "WAIT", decision: "SEM ENTRADA", direction: "AGUARDAR", score: 44, fingerprint: "dedupe-window", minutesAgo: 0, userPayload: { summary: "leitura atualizada" } });
      upsertDiagnostic(db, { userId, symbol: "BTCUSDT", status: "BLOCKED", decision: "SEM ENTRADA", direction: "AGUARDAR", score: 51, fingerprint: "user-btc-blocked", minutesAgo: 0 });
    } finally {
      db.close();
    }

    const userAdminRoute = await fetch(`${server.base}/api/worker/diagnostics/admin`, { headers: { Cookie: userCookie } });
    assert.equal(userAdminRoute.status, 403);

    const userDiagnostics = await authedJson(server.base, userCookie, "/api/worker/diagnostics?limit=10");
    assert.equal(userDiagnostics.history.length, 1);
    assert.equal(userDiagnostics.current.symbol, "BTCUSDT");
    assert.equal(userDiagnostics.current.status, "BLOCKED");
    assert.equal(userDiagnostics.current.full, undefined);
    assert.equal(JSON.stringify(userDiagnostics).includes("strategySecret"), false);

    const adminDiagnostics = await authedJson(server.base, adminCookie, "/api/worker/diagnostics?limit=10");
    assert.equal(adminDiagnostics.history.length, 6);
    assert.equal(adminDiagnostics.current.symbol, "SOLUSDT");
    assert.equal(adminDiagnostics.current.summary, "leitura atualizada");
    assert.ok(adminDiagnostics.current.full);
    assert.equal(adminDiagnostics.current.full.strategySecret, "admin-only");
    assert.deepEqual(new Set(adminDiagnostics.history.map((item) => item.symbol)), new Set(["BTCUSDT", "ETHUSDT", "SOLUSDT"]));
    assert.ok(adminDiagnostics.history.some((item) => item.status === "WAIT"));
    assert.ok(adminDiagnostics.history.some((item) => item.status === "APPROVED" && item.decision === "BUY"));
    assert.ok(adminDiagnostics.history.some((item) => item.status === "APPROVED" && item.decision === "SELL"));
    assert.ok(adminDiagnostics.history.some((item) => item.status === "BLOCKED"));
    assert.ok(adminDiagnostics.history.some((item) => item.status === "ERROR"));

    await stopServer(server.child);
    server = await startServer({ port, dbPath });
    const adminAfterReload = await login(server.base);
    const persisted = await authedJson(server.base, adminAfterReload, "/api/worker/diagnostics?limit=10");
    assert.equal(persisted.history.length, 6);
    assert.equal(persisted.current.summary, "leitura atualizada");
  } finally {
    await stopServer(server.child);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("controlled simulation protects admin routes and isolates homologation data", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "oraculo-controlled-sim-auth-"));
  const dbPath = path.join(dir, "oraculo.sqlite");
  const port = 5135;
  const server = await startServer({ port, dbPath });
  try {
    assert.equal((await fetch(`${server.base}/api/admin/simulations/current`)).status, 401);

    const adminCookie = await login(server.base);
    await createUser(server.base, adminCookie, {
      username: "simuser",
      name: "Sim User",
      password: "sim-user-safe-123",
      role: "user",
    });
    await createUser(server.base, adminCookie, {
      username: "admin2",
      name: "Admin 2",
      password: "admin-two-safe-123",
      role: "admin",
    });
    const userCookie = await loginAs(server.base, "simuser", "sim-user-safe-123");
    const admin2Cookie = await loginAs(server.base, "admin2", "admin-two-safe-123");

    assert.equal((await fetch(`${server.base}/api/admin/simulations/current`, { headers: { Cookie: userCookie } })).status, 403);
    assert.equal((await fetch(`${server.base}/api/admin/simulations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: userCookie },
      body: JSON.stringify({ symbol: "BTCUSDT" }),
    })).status, 403);

    await postPosition(server.base, adminCookie, sampleTrade({ id: "real_admin_position", pair: "BTCUSDT" }));
    const blocked = await fetch(`${server.base}/api/admin/simulations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ symbol: "BTCUSDT", direction: "BUY", entry: 100, stopLoss: 95, target1: 105, target2: 110, quantity: 1 }),
    });
    assert.equal(blocked.status, 409);
    await fetch(`${server.base}/api/demo/positions/real_admin_position`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ status: "LOSS", closePrice: 95, exitReason: "STOP_LOSS" }),
    });

    const simA = await startSimulation(server.base, adminCookie, { symbol: "BTCUSDT" });
    const simB = await startSimulation(server.base, admin2Cookie, { symbol: "ETHUSDT" });
    assert.equal(simA.scenario.symbol, "BTCUSDT");
    assert.equal(simB.scenario.symbol, "ETHUSDT");
    assert.notEqual(simA.userId, simB.userId);

    const currentA = await authedJson(server.base, adminCookie, "/api/admin/simulations/current");
    const currentB = await authedJson(server.base, admin2Cookie, "/api/admin/simulations/current");
    assert.equal(currentA.id, simA.id);
    assert.equal(currentB.id, simB.id);
  } finally {
    await stopServer(server.child);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("controlled simulation runs BUY and SELL flows through demo management without contaminating real stats", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "oraculo-controlled-sim-flow-"));
  const dbPath = path.join(dir, "oraculo.sqlite");
  const port = 5136;
  let server = await startServer({ port, dbPath });
  try {
    const adminCookie = await login(server.base);
    const realBefore = await authedJson(server.base, adminCookie, "/api/demo/session");
    const buy = await startSimulation(server.base, adminCookie, { direction: "BUY", entry: 100, stopLoss: 95, target1: 105, target2: 110, quantity: 2 });

    const outOfOrder = await fetch(`${server.base}/api/admin/simulations/${buy.id}/step`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ step: "TARGET2", idempotencyKey: "bad-order" }),
    });
    assert.equal(outOfOrder.status, 409);

    let state = await stepSimulation(server.base, adminCookie, buy.id, "OPEN");
    assert.equal(state.session.activeTrade.pair, "BTCUSDT");
    state = await stepSimulation(server.base, adminCookie, buy.id, "TARGET1");
    assert.equal(state.session.activeTrade.target1Hit, true);
    assert.equal(state.session.activeTrade.remainingPositionSize, 1);
    assert.ok(state.session.activeTrade.stopLoss >= 100);
    assert.ok(state.session.realizedPnlUSDC > 0);

    const duplicate = await stepSimulation(server.base, adminCookie, buy.id, "TARGET1");
    assert.equal(duplicate.session.activeTrade.remainingPositionSize, 1);

    state = await stepSimulation(server.base, adminCookie, buy.id, "TRAILING");
    assert.ok(state.session.activeTrade.stopLoss >= duplicate.session.activeTrade.stopLoss);
    state = await stepSimulation(server.base, adminCookie, buy.id, "TARGET2");
    assert.equal(state.status, "COMPLETED");
    assert.equal(state.session.activeTrade, null);
    assert.equal(state.session.history[0].status, "WIN");
    assert.equal(state.session.dailyStats.totalTrades, 1);

    const realAfterBuy = await authedJson(server.base, adminCookie, "/api/demo/session");
    assert.equal(realAfterBuy.dailyStats.totalTrades, realBefore.dailyStats.totalTrades);
    assert.equal(realAfterBuy.history.some((trade) => trade.id.startsWith("sim_trade_")), false);

    const sell = await startSimulation(server.base, adminCookie, { symbol: "SOLUSDT", direction: "SELL", entry: 100, stopLoss: 105, target1: 95, target2: 90, quantity: 2, initialPrice: 100 });
    await stepSimulation(server.base, adminCookie, sell.id, "OPEN");
    state = await stepSimulation(server.base, adminCookie, sell.id, "TARGET1");
    assert.equal(state.session.activeTrade.target1Hit, true);
    assert.equal(state.session.activeTrade.remainingPositionSize, 1);
    assert.ok(state.session.activeTrade.stopLoss <= 100);
    state = await stepSimulation(server.base, adminCookie, sell.id, "TARGET2");
    assert.equal(state.status, "COMPLETED");
    assert.equal(state.session.history[0].status, "WIN");

    await stopServer(server.child);
    server = await startServer({ port, dbPath });
    const adminCookieAfterReload = await login(server.base);
    const persisted = await authedJson(server.base, adminCookieAfterReload, "/api/admin/simulations/current");
    assert.equal(persisted.id, sell.id);
    assert.equal(persisted.status, "COMPLETED");
  } finally {
    await stopServer(server.child);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("controlled simulation covers stop, timeout, loss of strength, cancel and event history", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "oraculo-controlled-sim-events-"));
  const dbPath = path.join(dir, "oraculo.sqlite");
  const port = 5137;
  const server = await startServer({ port, dbPath });
  try {
    const adminCookie = await login(server.base);

    const stopBeforePartial = await startSimulation(server.base, adminCookie, { symbol: "BTCUSDT" });
    await stepSimulation(server.base, adminCookie, stopBeforePartial.id, "OPEN");
    let state = await stepSimulation(server.base, adminCookie, stopBeforePartial.id, "STOP");
    assert.equal(state.status, "COMPLETED");
    assert.equal(state.session.history[0].status, "LOSS");
    assert.equal(state.session.history[0].exitReason, "STOP_LOSS");

    const stopAfterPartial = await startSimulation(server.base, adminCookie, { symbol: "ETHUSDT" });
    await stepSimulation(server.base, adminCookie, stopAfterPartial.id, "OPEN");
    state = await stepSimulation(server.base, adminCookie, stopAfterPartial.id, "TARGET1");
    const stopAfterBe = await stepSimulation(server.base, adminCookie, stopAfterPartial.id, "STOP");
    assert.equal(stopAfterBe.session.history[0].exitReason, "BREAKEVEN");
    assert.equal(stopAfterBe.session.history[0].partialPnlUSDC > 0, true);

    const timeout = await startSimulation(server.base, adminCookie, { symbol: "SOLUSDT" });
    await stepSimulation(server.base, adminCookie, timeout.id, "OPEN");
    state = await stepSimulation(server.base, adminCookie, timeout.id, "TIMEOUT");
    assert.equal(state.session.history[0].exitReason, "TIMEOUT");

    const loss = await startSimulation(server.base, adminCookie, { symbol: "BTCUSDT" });
    await stepSimulation(server.base, adminCookie, loss.id, "OPEN");
    state = await stepSimulation(server.base, adminCookie, loss.id, "LOSS_OF_STRENGTH");
    assert.equal(state.session.history[0].exitReason, "LOSS_OF_STRENGTH");

    const cancel = await startSimulation(server.base, adminCookie, { symbol: "ETHUSDT" });
    await stepSimulation(server.base, adminCookie, cancel.id, "OPEN");
    state = await json(await fetch(`${server.base}/api/admin/simulations/${cancel.id}/cancel`, { method: "POST", headers: { Cookie: adminCookie } }));
    assert.equal(state.status, "CANCELLED");
    assert.equal(state.session.activeTrade, null);
    const events = await simulationEvents(server.base, adminCookie, cancel.id);
    assert.ok(events.some((event) => event.step === "CANCEL"));
  } finally {
    await stopServer(server.child);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("notifications are private, idempotent, readable, preference-aware and push-ready", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "oraculo-notifications-"));
  const dbPath = path.join(dir, "oraculo.sqlite");
  const port = 5138;
  const server = await startServer({ port, dbPath });
  try {
    assert.equal((await fetch(`${server.base}/api/notifications`)).status, 401);

    const adminCookie = await login(server.base);
    await createUser(server.base, adminCookie, {
      username: "alertuser",
      name: "Alert User",
      password: "alert-user-safe-123",
      role: "user",
    });
    const userCookie = await loginAs(server.base, "alertuser", "alert-user-safe-123");

    let adminAlerts = await notifications(server.base, adminCookie);
    assert.equal(adminAlerts.unreadCount, 0);

    await subscribeDummyPush(server.base, adminCookie, "https://push.example.test/device-a");
    await subscribeDummyPush(server.base, adminCookie, "https://push.example.test/device-b");
    const pushList = await authedJson(server.base, adminCookie, "/api/push/subscriptions");
    assert.equal(pushList.length, 2);
    assert.equal(JSON.stringify(pushList).includes("dummy-auth"), false);

    await setNotificationPrefs(server.base, adminCookie, { push: true, includeBlockedEntries: true });
    await fetch(`${server.base}/api/notifications/test`, { method: "POST", headers: { Cookie: adminCookie } });
    await fetch(`${server.base}/api/notifications/test`, { method: "POST", headers: { Cookie: adminCookie } });
    adminAlerts = await notifications(server.base, adminCookie);
    assert.equal(adminAlerts.items.filter((item) => item.type === "test").length, 1);

    const trade = sampleTrade({ id: "alert_btc", pair: "BTCUSDT", positionSize: 2, remainingPositionSize: 2 });
    await postPosition(server.base, adminCookie, trade);
    await postPrice(server.base, adminCookie, trade.pair, trade.target1);
    await postPrice(server.base, adminCookie, trade.pair, trade.target1);
    await postPrice(server.base, adminCookie, trade.pair, trade.target1 + 1);
    await postPrice(server.base, adminCookie, trade.pair, trade.target2);

    adminAlerts = await notifications(server.base, adminCookie, "?limit=50");
    const types = adminAlerts.items.map((item) => item.type);
    assert.equal(types.filter((type) => type === "demo_entry_opened").length, 1);
    assert.equal(types.filter((type) => type === "target1_hit").length, 1);
    assert.equal(types.filter((type) => type === "partial_executed").length, 1);
    assert.equal(types.filter((type) => type === "breakeven_moved").length, 1);
    assert.equal(types.filter((type) => type === "trailing_updated").length <= 1, true);
    assert.equal(types.filter((type) => type === "target2_hit").length, 1);
    assert.equal(JSON.stringify(adminAlerts).includes("password"), false);
    assert.equal(JSON.stringify(adminAlerts).includes("oraculo_session"), false);

    const unreadBefore = adminAlerts.unreadCount;
    await fetch(`${server.base}/api/notifications/${adminAlerts.items[0].id}/read`, { method: "POST", headers: { Cookie: adminCookie } });
    adminAlerts = await notifications(server.base, adminCookie);
    assert.equal(adminAlerts.unreadCount, unreadBefore - 1);
    await fetch(`${server.base}/api/notifications/read-all`, { method: "POST", headers: { Cookie: adminCookie } });
    adminAlerts = await notifications(server.base, adminCookie);
    assert.equal(adminAlerts.unreadCount, 0);

    const userAlerts = await notifications(server.base, userCookie, "?limit=50");
    assert.equal(userAlerts.items.some((item) => item.relatedEventId === "alert_btc"), false);

    await setNotificationPrefs(server.base, userCookie, { internal: false });
    await fetch(`${server.base}/api/notifications/test`, { method: "POST", headers: { Cookie: userCookie } });
    assert.equal((await notifications(server.base, userCookie)).items.length, 0);

    await setNotificationPrefs(server.base, userCookie, { internal: true, quietHours: { enabled: true, start: "00:00", end: "23:59" } });
    await fetch(`${server.base}/api/notifications/test`, { method: "POST", headers: { Cookie: userCookie } });
    assert.equal((await notifications(server.base, userCookie)).items.length, 0);
  } finally {
    await stopServer(server.child);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Telegram integration links private chats, protects secrets and delivers idempotent alerts", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "oraculo-telegram-"));
  const dbPath = path.join(dir, "oraculo.sqlite");
  const port = 5148;
  const server = await startServer({ port, dbPath });
  let db;
  try {
    assert.equal((await fetch(`${server.base}/api/integrations/telegram/status`)).status, 401);

    const adminCookie = await login(server.base);
    await createUser(server.base, adminCookie, {
      username: "telegramuser",
      name: "Telegram User",
      password: "telegram-user-safe-123",
      role: "user",
    });
    const userCookie = await loginAs(server.base, "telegramuser", "telegram-user-safe-123");

    let status = await authedJson(server.base, adminCookie, "/api/integrations/telegram/status");
    assert.equal(status.configured, true);
    assert.equal(status.connected, false);
    assert.equal(JSON.stringify(status).includes("chat_id"), false);
    assert.equal(JSON.stringify(status).includes("test-bot-token"), false);

    const linkRes = await fetch(`${server.base}/api/integrations/telegram/link-code`, {
      method: "POST",
      headers: { Cookie: adminCookie },
    });
    assert.equal(linkRes.status, 200);
    const link = await json(linkRes);
    assert.match(link.code, /^[A-Z0-9]{8}$/);
    assert.ok(link.deepLink.includes("OraculoTestBot"));

    db = new DatabaseSync(dbPath);
    const codeRows = db.prepare("SELECT code_hash, used_at, expires_at FROM telegram_link_codes").all();
    assert.equal(codeRows.length, 1);
    assert.notEqual(codeRows[0].code_hash, link.code);
    assert.equal(codeRows[0].used_at, null);
    assert.ok(Date.parse(codeRows[0].expires_at) > Date.now());

    const badSecret = await fetch(`${server.base}/api/integrations/telegram/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-telegram-bot-api-secret-token": "bad" },
      body: JSON.stringify({}),
    });
    assert.equal(badSecret.status, 401);

    const groupUpdate = await fetch(`${server.base}/api/integrations/telegram/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-telegram-bot-api-secret-token": "telegram-webhook-secret-test" },
      body: JSON.stringify({ message: { chat: { id: -10, type: "group" }, text: `/start ${link.code}` } }),
    });
    assert.equal(groupUpdate.status, 200);
    assert.equal((await json(groupUpdate)).reason, "private_chat_required");

    const connectRes = await fetch(`${server.base}/api/integrations/telegram/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-telegram-bot-api-secret-token": "telegram-webhook-secret-test" },
      body: JSON.stringify({ message: { chat: { id: 987654, type: "private" }, from: { username: "denilson" }, text: `/start ${link.code}` } }),
    });
    assert.equal(connectRes.status, 200);
    assert.equal((await json(connectRes)).linked, true);
    assert.notEqual(db.prepare("SELECT used_at FROM telegram_link_codes WHERE code_hash = ?").get(codeRows[0].code_hash).used_at, null);

    const reuseRes = await fetch(`${server.base}/api/integrations/telegram/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-telegram-bot-api-secret-token": "telegram-webhook-secret-test" },
      body: JSON.stringify({ message: { chat: { id: 222, type: "private" }, text: `/start ${link.code}` } }),
    });
    assert.equal((await json(reuseRes)).reason, "invalid_or_expired_code");

    status = await authedJson(server.base, adminCookie, "/api/integrations/telegram/status");
    assert.equal(status.connected, true);
    assert.equal(status.telegramUsername, "denilson");
    assert.equal(JSON.stringify(status).includes("987654"), false);

    await setNotificationPrefs(server.base, adminCookie, { telegram: true, includeSimulation: true });
    const testRes = await fetch(`${server.base}/api/integrations/telegram/test`, { method: "POST", headers: { Cookie: adminCookie } });
    assert.equal(testRes.status, 200);
    await waitFor(() => Number(db.prepare("SELECT COUNT(*) AS count FROM notification_deliveries WHERE provider = 'telegram' AND status = 'delivered'").get().count) === 1, "telegram test delivery was not flushed");
    let deliveryCount = db.prepare("SELECT COUNT(*) AS count FROM notification_deliveries WHERE provider = 'telegram' AND status = 'delivered'").get().count;
    assert.equal(Number(deliveryCount), 1);

    const trade = sampleTrade({ id: "telegram_btc", pair: "BTCUSDT", positionSize: 2, remainingPositionSize: 2 });
    await postPosition(server.base, adminCookie, trade);
    await postPrice(server.base, adminCookie, trade.pair, trade.target1);
    await postPrice(server.base, adminCookie, trade.pair, trade.target1);
    await postPrice(server.base, adminCookie, trade.pair, trade.target1 + 1);
    await postPrice(server.base, adminCookie, trade.pair, trade.stopLoss);

    const adminAlerts = await notifications(server.base, adminCookie, "?limit=80");
    const types = adminAlerts.items.map((item) => item.type);
    assert.equal(types.filter((type) => type === "demo_entry_opened").length, 1);
    assert.equal(types.filter((type) => type === "partial_executed").length, 1);
    assert.equal(types.filter((type) => type === "breakeven_moved").length, 1);
    assert.equal(types.filter((type) => type === "trailing_updated").length <= 1, true);
    assert.equal(types.some((type) => type === "stop_loss" || type === "target2_hit" || type === "loss_of_strength" || type === "timeout"), true);

    const simulation = await startSimulation(server.base, adminCookie, { symbol: "ETHUSDT" });
    await stepSimulation(server.base, adminCookie, simulation.id, "OPEN");
    const simAlert = (await notifications(server.base, adminCookie, "?source=HOMOLOGATION&limit=20")).items[0];
    assert.equal(simAlert.source, "HOMOLOGATION");

    const userTelegram = await authedJson(server.base, userCookie, "/api/integrations/telegram/status");
    assert.equal(userTelegram.connected, false);
    assert.equal((await notifications(server.base, userCookie)).items.length, 0);
    assert.equal(JSON.stringify(adminAlerts).includes("test-bot-token"), false);
    assert.equal(server.logs().includes("test-bot-token"), false);

    const disconnect = await fetch(`${server.base}/api/integrations/telegram`, { method: "DELETE", headers: { Cookie: adminCookie } });
    assert.equal(disconnect.status, 200);
    assert.equal((await authedJson(server.base, adminCookie, "/api/integrations/telegram/status")).connected, false);
  } finally {
    db?.close();
    await stopServer(server.child);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("simulation notifications are marked HOMOLOGATION and normal demo history stays separate", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "oraculo-notifications-sim-"));
  const dbPath = path.join(dir, "oraculo.sqlite");
  const port = 5139;
  const server = await startServer({ port, dbPath });
  try {
    const adminCookie = await login(server.base);
    const sim = await startSimulation(server.base, adminCookie, { symbol: "SOLUSDT" });
    await stepSimulation(server.base, adminCookie, sim.id, "OPEN");
    await stepSimulation(server.base, adminCookie, sim.id, "TARGET1");
    await stepSimulation(server.base, adminCookie, sim.id, "TARGET2");
    const alerts = await notifications(server.base, adminCookie, "?source=HOMOLOGATION&limit=20");
    assert.ok(alerts.items.some((item) => item.type === "simulation_started"));
    assert.ok(alerts.items.some((item) => item.type === "simulation_event"));
    assert.ok(alerts.items.some((item) => item.type === "simulation_completed"));
    assert.equal(alerts.items.every((item) => item.source === "HOMOLOGATION"), true);
    assert.equal(JSON.stringify(alerts).includes("CONTROLLED_SIMULATION"), true);
    const realSession = await authedJson(server.base, adminCookie, "/api/demo/session");
    assert.equal(realSession.history.some((trade) => trade.id.startsWith("sim_trade_")), false);
  } finally {
    await stopServer(server.child);
    rmSync(dir, { recursive: true, force: true });
  }
});

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
    const tradesAfterMigration = await authedJson(server.base, cookie, "/api/demo/trades");
    assert.equal(tradesAfterMigration.filter((item) => item.id === "migrated_1").length, 1);

    await stopServer(server.child);
    server = await startServer({ port, dbPath });
    const persistedTrades = await authedJson(server.base, cookie, "/api/demo/trades");
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
      body: JSON.stringify({ username: "admin", password: "local-test-password" }),
    });
    assert.equal(blockedLogin.status, 403);
    assert.match((await blockedLogin.text()), /HTTPS is required/);

    const blockedSpoof = await fetch(`${server.base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-Proto": "http" },
      body: JSON.stringify({ username: "admin", password: "local-test-password" }),
    });
    assert.equal(blockedSpoof.status, 403);

    const allowedLocalHttps = await fetch(`${server.base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-Proto": "https" },
      body: JSON.stringify({ username: "admin", password: "local-test-password" }),
    });
    assert.equal(allowedLocalHttps.status, 200);
    assert.match(allowedLocalHttps.headers.get("set-cookie") ?? "", /HttpOnly/);
    assert.match(allowedLocalHttps.headers.get("set-cookie") ?? "", /Secure/);
    assert.match(allowedLocalHttps.headers.get("set-cookie") ?? "", /SameSite=Lax/);
  } finally {
    delete process.env.ORACULO_REQUIRE_HTTPS;
    await stopServer(server.child);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("health endpoint reports API and Binance state", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "oraculo-demo-health-"));
  const dbPath = path.join(dir, "oraculo.sqlite");
  const port = 5127;
  const server = await startServer({ port, dbPath });
  try {
    const res = await fetch(`${server.base}/api/health`);
    assert.equal(res.status, 200);
    const health = await json(res);
    assert.equal(health.appName, "Oráculo");
    assert.equal(health.version, "0.5");
    assert.equal(health.displayName, "ORÁCULO 0.5");
    assert.equal(health.buildChannel, "homologation");
    assert.equal(health.api.ok, true);
    assert.ok(["ok", "degraded"].includes(health.status));
    assert.equal(typeof health.api.uptimeSec, "number");
    assert.equal(typeof health.api.startedAt, "string");
    assert.equal(typeof health.api.pid, "number");
    assert.equal(typeof health.api.nodeVersion, "string");
    assert.equal(typeof health.api.responseLatencyMs, "number");
    assert.equal(typeof health.binance.ok, "boolean");
    assert.equal(health.system, undefined);
    assert.equal(health.worker, undefined);
    assert.equal(health.sqlite, undefined);
    assert.equal(health.sessions, undefined);
    assert.equal(health.notifications, undefined);
    assert.equal(typeof health.generatedAt, "string");
  } finally {
    await stopServer(server.child);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("public oracle state is sanitized and follows global operational state", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "oraculo-public-state-"));
  const dbPath = path.join(dir, "oraculo.sqlite");
  const port = 5148;
  let server = await startServer({ port, dbPath });
  try {
    const initialRes = await fetch(`${server.base}/api/oracle/state`);
    assert.equal(initialRes.status, 200);
    const initial = await json(initialRes);
    assert.deepEqual(Object.keys(initial).sort(), ["state", "updatedAt"]);
    assert.equal(initial.state, "waiting");
    assert.equal(JSON.stringify(initial).includes("admin"), false);
    assert.equal(JSON.stringify(initial).includes("BTCUSDT"), false);

    const adminCookie = await login(server.base);
    await postPosition(server.base, adminCookie, sampleTrade({ direction: "BUY" }));
    const buyState = await json(await fetch(`${server.base}/api/oracle/state`));
    assert.equal(buyState.state, "buy");
    assert.deepEqual(Object.keys(buyState).sort(), ["state", "updatedAt"]);

    const db = new DatabaseSync(dbPath);
    try {
      db.prepare("DELETE FROM demo_positions").run();
      const adminId = getUserId(dbPath, "admin");
      upsertDiagnostic(db, {
        userId: adminId,
        symbol: "ETHUSDT",
        status: "APPROVED",
        decision: "SELL",
        direction: "SELL",
        score: 82,
        fingerprint: "public-sell-approved",
      });
    } finally {
      db.close();
    }

    const sellState = await json(await fetch(`${server.base}/api/oracle/state`));
    assert.equal(sellState.state, "sell");
    assert.deepEqual(Object.keys(sellState).sort(), ["state", "updatedAt"]);
    assert.equal(JSON.stringify(sellState).includes("ETHUSDT"), false);
    assert.equal(JSON.stringify(sellState).includes("score"), false);
    assert.equal(JSON.stringify(sellState).includes("strategySecret"), false);
  } finally {
    await stopServer(server.child);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("admin observability exposes expanded health only to admins", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "oraculo-demo-observability-"));
  const dbPath = path.join(dir, "oraculo.sqlite");
  const port = 5139;
  const server = await startServer({ port, dbPath });
  try {
    const unauthenticated = await fetch(`${server.base}/api/admin/observability`);
    assert.equal(unauthenticated.status, 401);

    const adminCookie = await login(server.base);
    await createUser(server.base, adminCookie, {
      username: "observability-user",
      name: "Observability User",
      password: "observability-user-password",
      role: "user",
    });
    const userCookie = await loginAs(server.base, "observability-user", "observability-user-password");

    const forbidden = await fetch(`${server.base}/api/admin/observability`, { headers: { Cookie: userCookie } });
    assert.equal(forbidden.status, 403);

    const res = await fetch(`${server.base}/api/admin/observability`, { headers: { Cookie: adminCookie } });
    assert.equal(res.status, 200);
    const health = await json(res);
    assert.equal(health.version, "0.5");
    assert.equal(health.buildChannel, "homologation");
    assert.equal(typeof health.system.cpus, "number");
    assert.equal(typeof health.system.totalMemory, "number");
    assert.equal(typeof health.system.freeMemory, "number");
    assert.equal(typeof health.worker.active, "boolean");
    assert.equal(typeof health.worker.automationUsers, "number");
    assert.equal(typeof health.worker.diagnosticsStored, "number");
    assert.equal(typeof health.worker.engineVersion, "string");
    assert.equal(health.sqlite.integrity, "ok");
    assert.equal(health.sqlite.journalMode, "wal");
    assert.equal(typeof health.sqlite.databaseBytes, "number");
    assert.equal(typeof health.sqlite.walBytes, "number");
    assert.equal(health.sqlite.databasePath, undefined);
    assert.equal(typeof health.sessions.active, "number");
    assert.equal(typeof health.notifications.stored, "number");
    assert.equal(JSON.stringify(health).includes("password_hash"), false);
    assert.equal(JSON.stringify(health).includes("token_hash"), false);
  } finally {
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
    assert.equal(sessionA.dailyStats.totalTrades, 0);

    const browserBDuplicate = await fetch(`${server.base}/api/demo/signal`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(signal),
    });
    assert.equal(browserBDuplicate.status, 200);

    const browserBSession = await authedJson(server.base, cookie, "/api/demo/session");
    assert.equal(browserBSession.activeTrade.id, sessionA.activeTrade.id);
    assert.equal((await authedJson(server.base, cookie, "/api/demo/positions")).length, 1);

    for (let i = 0; i < 2; i++) {
      const target1 = await fetch(`${server.base}/api/demo/price`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ pair: "BTCUSDT", price: 105 }),
      });
      assert.equal(target1.status, 200);
    }
    const afterTarget1 = await authedJson(server.base, cookie, "/api/demo/session");
    assert.equal(afterTarget1.activeTrade.target1Hit, true);
    assert.ok(afterTarget1.activeTrade.stopLoss >= 100.02);
    assert.equal(afterTarget1.activeTrade.remainingPositionSize, 1);
    assert.equal(afterTarget1.activeTrade.realizedPnlUSDC, 5);
    assert.equal(afterTarget1.realizedPnlUSDC, 5);
    assert.equal(afterTarget1.unrealizedPnlUSDC, 5);
    assert.equal(afterTarget1.partialPnlUSDC, 5);
    assert.ok(afterTarget1.openRiskUSDC > 0);
    assert.equal(afterTarget1.history.length, 0);
    assert.equal(afterTarget1.dailyStats.totalTrades, 0);
    assert.equal(afterTarget1.dailyStats.wins, 0);
    assert.equal(afterTarget1.dailyStats.dailyPnL, 5);

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

    const finalSession = await authedJson(server.base, cookie, "/api/demo/session");
    assert.equal(finalSession.activeTrade, null);
    assert.equal(finalSession.history.filter((item) => item.id === sessionA.activeTrade.id).length, 1);
    assert.equal(finalSession.dailyStats.totalTrades, 1);
    assert.equal(finalSession.dailyStats.wins, 1);
    assert.equal(finalSession.dailyStats.dailyPnL, 15);
    assert.equal(finalSession.realizedPnlUSDC, 15);
    assert.equal(finalSession.unrealizedPnlUSDC, 0);

    await stopServer(server.child);
    const restarted = await startServer({ port, dbPath });
    try {
      const persisted = await authedJson(restarted.base, cookie, "/api/demo/session");
      assert.equal(persisted.history.filter((item) => item.id === sessionA.activeTrade.id).length, 1);
      assert.equal(persisted.activeTrade, null);
      assert.equal(persisted.realizedPnlUSDC, 15);
    } finally {
      await stopServer(restarted.child);
    }
  } finally {
    await stopServer(server.child);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("operation management realizes partial and closes stale scalps by max duration", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "oraculo-demo-management-"));
  const dbPath = path.join(dir, "oraculo.sqlite");
  const port = 5126;
  const server = await startServer({ port, dbPath });
  try {
    const cookie = await login(server.base);
    const oldTrade = sampleTrade({
      id: "timeout_1",
      openTime: Date.now() - 91 * 60 * 1000,
      maxDurationMs: 90 * 60 * 1000,
    });
    const opened = await fetch(`${server.base}/api/demo/positions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(oldTrade),
    });
    assert.equal(opened.status, 200);

    const updated = await fetch(`${server.base}/api/demo/price`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ pair: "BTCUSDT", price: 101 }),
    });
    assert.equal(updated.status, 200);
    const session = await json(updated);
    assert.equal(session.activeTrade, null);
    assert.equal(session.history[0].exitReason, "TIMEOUT");
    assert.equal(session.history[0].pnlUSDC, 2);
  } finally {
    await stopServer(server.child);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("management keeps partial idempotent and statistics count only final closes", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "oraculo-demo-partial-"));
  const dbPath = path.join(dir, "oraculo.sqlite");
  const port = 5127;
  const server = await startServer({ port, dbPath });
  try {
    const cookie = await login(server.base);
    const trade = sampleTrade({ id: "partial_once" });
    await postPosition(server.base, cookie, trade);

    const first = await postPrice(server.base, cookie, "BTCUSDT", 105);
    assert.equal(first.activeTrade.target1Hit, true);
    assert.equal(first.activeTrade.remainingPositionSize, 1);
    assert.equal(first.activeTrade.partialPnlUSDC, 5);
    assert.equal(first.activeTrade.realizedPnlUSDC, 5);
    assert.equal(first.dailyStats.totalTrades, 0);
    assert.equal(first.dailyStats.wins, 0);
    assert.equal(first.dailyStats.dailyPnL, 5);

    const second = await postPrice(server.base, cookie, "BTCUSDT", 105);
    assert.equal(second.activeTrade.remainingPositionSize, 1);
    assert.equal(second.activeTrade.partialPnlUSDC, 5);
    assert.equal(second.activeTrade.realizedPnlUSDC, 5);
    assert.equal(second.dailyStats.dailyPnL, 5);
    assert.equal(second.history.length, 0);

    const closed = await postPrice(server.base, cookie, "BTCUSDT", 110);
    assert.equal(closed.activeTrade, null);
    assert.equal(closed.history[0].status, "WIN");
    assert.equal(closed.history[0].realizedPnlUSDC, 15);
    assert.equal(closed.dailyStats.totalTrades, 1);
    assert.equal(closed.dailyStats.wins, 1);
    assert.equal(closed.dailyStats.losses, 0);
    assert.equal(closed.dailyStats.breakevens, 0);
    assert.equal(closed.dailyStats.dailyPnL, 15);
    assert.equal(closed.unrealizedPnlUSDC, 0);
  } finally {
    await stopServer(server.child);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("breakeven buffer works for BUY and SELL without counting wins early", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "oraculo-demo-breakeven-"));
  const dbPath = path.join(dir, "oraculo.sqlite");
  const port = 5128;
  const server = await startServer({ port, dbPath });
  try {
    const cookie = await login(server.base);
    await postPosition(server.base, cookie, sampleTrade({ id: "buy_be" }));
    const buy = await postPrice(server.base, cookie, "BTCUSDT", 105);
    assert.ok(Math.abs(buy.activeTrade.stopLoss - 100.02) < 0.000001 || buy.activeTrade.stopLoss > 100.02);
    assert.equal(buy.dailyStats.wins, 0);

    await postPrice(server.base, cookie, "BTCUSDT", 110);
    await postPosition(server.base, cookie, sampleTrade({
      id: "sell_be",
      pair: "ETHUSDT",
      direction: "SELL",
      entry: 100,
      stopLoss: 105,
      stopLossOriginal: 105,
      target1: 95,
      target2: 90,
    }));
    const sell = await postPrice(server.base, cookie, "ETHUSDT", 95);
    assert.ok(sell.activeTrade.stopLoss <= 99.98);
    assert.equal(sell.activeTrade.isBreakevenStop, true);
    assert.equal(sell.activeTrade.remainingPositionSize, 1);
  } finally {
    await stopServer(server.child);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("adaptive trailing never worsens and uses symbol-specific bounds", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "oraculo-demo-trailing-"));
  const dbPath = path.join(dir, "oraculo.sqlite");
  const port = 5129;
  const server = await startServer({ port, dbPath });
  try {
    const cookie = await login(server.base);
    await postPosition(server.base, cookie, sampleTrade({ id: "btc_trailing" }));
    const btc = await postPrice(server.base, cookie, "BTCUSDT", 106);
    const btcStop = btc.activeTrade.stopLoss;
    assert.ok(btcStop >= 106 * (1 - 0.0035) - 0.000001);
    assert.ok(btcStop <= 106 * (1 - 0.0018) + 0.000001);

    const notWorse = await postPrice(server.base, cookie, "BTCUSDT", btcStop + 0.05);
    assert.equal(notWorse.activeTrade.stopLoss, btcStop);

    await postPrice(server.base, cookie, "BTCUSDT", 110);
    await postPosition(server.base, cookie, sampleTrade({ id: "sol_trailing", pair: "SOLUSDT" }));
    const sol = await postPrice(server.base, cookie, "SOLUSDT", 106);
    const solStop = sol.activeTrade.stopLoss;
    assert.ok(solStop >= 106 * (1 - 0.005) - 0.000001);
    assert.ok(solStop <= 106 * (1 - 0.0025) + 0.000001);
    assert.ok(solStop < btcStop);
  } finally {
    await stopServer(server.child);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loss of strength requires a combination of signals", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "oraculo-demo-strength-"));
  const dbPath = path.join(dir, "oraculo.sqlite");
  const port = 5130;
  const server = await startServer({ port, dbPath });
  try {
    const cookie = await login(server.base);
    await postPosition(server.base, cookie, sampleTrade({
      id: "strength_alert",
      target1Hit: true,
      isBreakevenStop: true,
      stopLoss: 100.02,
      remainingPositionSize: 1,
      realizedPnlUSDC: 5,
      partialPnlUSDC: 5,
      target1ClosePrice: 105,
    }));
    const alertOnly = await postPrice(server.base, cookie, "BTCUSDT", 104.8);
    assert.equal(alertOnly.activeTrade.id, "strength_alert");
    assert.equal(alertOnly.history.length, 0);

    await postPrice(server.base, cookie, "BTCUSDT", 110);
    await postPosition(server.base, cookie, sampleTrade({
      id: "strength_close",
      target1Hit: true,
      isBreakevenStop: true,
      stopLoss: 100.02,
      remainingPositionSize: 1,
      realizedPnlUSDC: 5,
      partialPnlUSDC: 5,
      target1ClosePrice: 105,
    }));
    await postPrice(server.base, cookie, "BTCUSDT", 105.2);
    await postPrice(server.base, cookie, "BTCUSDT", 105.1);
    const closed = await postPrice(server.base, cookie, "BTCUSDT", 105);
    assert.equal(closed.activeTrade, null);
    assert.equal(closed.history[0].exitReason, "LOSS_OF_STRENGTH");
  } finally {
    await stopServer(server.child);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("event priority prevents duplicate partial, stop, target2, trailing and timeout closes", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "oraculo-demo-priority-"));
  const dbPath = path.join(dir, "oraculo.sqlite");
  const port = 5131;
  const server = await startServer({ port, dbPath });
  try {
    const cookie = await login(server.base);
    await postPosition(server.base, cookie, sampleTrade({ id: "stop_priority" }));
    const stopped = await postPrice(server.base, cookie, "BTCUSDT", 95);
    assert.equal(stopped.activeTrade, null);
    assert.equal(stopped.history[0].exitReason, "STOP_LOSS");
    assert.equal(stopped.history[0].target1Hit, false);

    await postPosition(server.base, cookie, sampleTrade({ id: "target2_priority" }));
    const target2 = await postPrice(server.base, cookie, "BTCUSDT", 110);
    assert.equal(target2.activeTrade, null);
    assert.equal(target2.history[0].exitReason, "TARGET_2");
    assert.equal(target2.history[0].target1Hit, false);

    await postPosition(server.base, cookie, sampleTrade({
      id: "timeout_first_tick",
      openTime: Date.now() - 90 * 60 * 1000 - 1,
      maxDurationMs: 90 * 60 * 1000,
    }));
    const timedOut = await postPrice(server.base, cookie, "BTCUSDT", 101);
    assert.equal(timedOut.activeTrade, null);
    assert.equal(timedOut.history[0].exitReason, "TIMEOUT");
    assert.equal(timedOut.history[0].closePrice, 101);
  } finally {
    await stopServer(server.child);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("audit export endpoint security, limits, CSV escaping and combined filters", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "oraculo-audit-export-"));
  const dbPath = path.join(dir, "oraculo.sqlite");
  const port = 5132;
  const server = await startServer({ port, dbPath });
  try {
    // 1. Rejeitar acesso sem autenticação (401)
    const unauth = await fetch(`${server.base}/api/worker/audit/export`);
    assert.equal(unauth.status, 401);

    const cookie = await login(server.base);

    // Conecta diretamente ao banco sqlite criado no teste
    const db = new DatabaseSync(dbPath);

    // Obtém id do usuário admin inserido no startup
    const adminUser = db.prepare("SELECT id FROM users WHERE username = 'admin'").get();
    const adminId = String(adminUser.id);
    const now = new Date().toISOString();
    const past48h = new Date(Date.now() - 48 * 3600 * 1000).toISOString();

    const insertStmt = db.prepare(`
      INSERT INTO engine_audit_log (
        id, user_id, symbol, analyzed_at, score, score_contextual, score_raw,
        direction, decision, decision_state, trigger_stage, rr_status,
        trend_1h, trend_15m, filters_passed_json, filters_blocked_json,
        filters_penalty_json, blocked_reasons_json, quality_penalties_json,
        decisive_reason, missing_conditions_json, entry_price, stop_price,
        target1, target2, rr, volume_relative, engine_version, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Inserção 1: BTCUSDT (Recente, BUY, ENTRADA_APROVADA) com aspas/vírgulas/quebras de linha
    insertStmt.run(
      "audit-1", adminId, "BTCUSDT", now, 85, 80, 85,
      "LONG", "BUY", "ENTRADA_APROVADA", "TRIGGER_5M", "RR_OK",
      "ALTA", "ALTA", JSON.stringify(["trend"]), JSON.stringify([{ name: "test", reason: 'motivo com "aspas", vírgula, e \n nova linha' }]),
      "[]", JSON.stringify(['motivo com "aspas", vírgula, e \n nova linha']), "[]",
      'motivo decisivo com "aspas", vírgula e \n nova linha', "[]", 100000, 99000,
      102000, 105000, 2.0, 1.5, "1.0.0", now
    );

    // Inserção 2: ETHUSDT (Antigo 48h, SEM ENTRADA, BLOQUEADO_RISCO)
    insertStmt.run(
      "audit-2", adminId, "ETHUSDT", past48h, 40, 30, 40,
      "NEUTRAL", "SEM ENTRADA", "BLOQUEADO_RISCO", "NONE", "RR_BAD",
      "BAIXA", "NEUTRO", "[]", JSON.stringify([{ name: "risk", reason: "alto risco" }]),
      "[]", JSON.stringify(["alto risco"]), "[]",
      "alto risco", "[]", null, null,
      null, null, null, 0.5, "1.0.0", past48h
    );

    db.close();

    // 2. Filtros combinados no export (JSON)
    const filteredRes = await fetch(`${server.base}/api/worker/audit/export?hours=24&symbol=BTCUSDT&decision=BUY&state=ENTRADA_APROVADA`, {
      headers: { Cookie: cookie },
    });
    assert.equal(filteredRes.status, 200);
    const jsonResult = await filteredRes.json();
    assert.equal(jsonResult.total, 1);
    assert.equal(jsonResult.entries[0].symbol, "BTCUSDT");
    assert.equal(jsonResult.entries[0].decision, "BUY");
    assert.equal(jsonResult.entries[0].decisionState, "ENTRADA_APROVADA");

    // 3. Teto max limit 5000 ao passar 9999
    const limitRes = await fetch(`${server.base}/api/worker/audit/export?limit=9999`, {
      headers: { Cookie: cookie },
    });
    assert.equal(limitRes.status, 200);
    const limitJson = await limitRes.json();
    assert.equal(limitJson.filters.limit, 5000);

    // 4. Formato CSV com escaping correto de aspas, vírgulas e quebras de linha
    const csvRes = await fetch(`${server.base}/api/worker/audit/export?format=csv&symbol=BTCUSDT`, {
      headers: { Cookie: cookie },
    });
    assert.equal(csvRes.status, 200);
    assert.equal(csvRes.headers.get("content-type").includes("text/csv"), true);
    const csvText = await csvRes.text();
    assert.equal(csvText.includes('""aspas""'), true);
    assert.equal(csvText.includes('"motivo com ""aspas"", vírgula, e \n nova linha"'), true);
  } finally {
    await stopServer(server.child);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("audit intelligent summary statistics, periods, rankings and symbol breakdown", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "oraculo-audit-summary-"));
  const dbPath = path.join(dir, "oraculo.sqlite");
  const port = 5133;
  const server = await startServer({ port, dbPath });
  try {
    // 1. Acesso não-admin retorna 401
    const unauth = await fetch(`${server.base}/api/worker/audit/summary`);
    assert.equal(unauth.status, 401);

    const cookie = await login(server.base);
    const db = new DatabaseSync(dbPath);

    const adminUser = db.prepare("SELECT id FROM users WHERE username = 'admin'").get();
    const adminId = String(adminUser.id);

    const now = new Date().toISOString();
    const ago3h = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
    const ago12h = new Date(Date.now() - 12 * 3600 * 1000).toISOString();
    const ago3d = new Date(Date.now() - 3 * 86400 * 1000).toISOString();

    const insertStmt = db.prepare(`
      INSERT INTO engine_audit_log (
        id, user_id, symbol, analyzed_at, score, score_contextual, score_raw,
        direction, decision, decision_state, trigger_stage, rr_status,
        trend_1h, trend_15m, filters_passed_json, filters_blocked_json,
        filters_penalty_json, blocked_reasons_json, quality_penalties_json,
        decisive_reason, missing_conditions_json, entry_price, stop_price,
        target1, target2, rr, volume_relative, engine_version, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Inserção 1: BTCUSDT (3h atrás) - BUY / ENTRADA_APROVADA / Score 90
    insertStmt.run(
      "sum-1", adminId, "BTCUSDT", ago3h, 90, 85, 90,
      "LONG", "BUY", "ENTRADA_APROVADA", "TRIGGER_5M", "RR_OK",
      "ALTA", "ALTA", "[]", "[]", "[]", "[]", "[]",
      "Entrada aprovada por volume", "[]", 100000, 99000,
      102000, 105000, 2.0, 1.5, "1.0.0", ago3h
    );

    // Inserção 2: ETHUSDT (12h atrás) - SEM ENTRADA / BLOQUEADO_RISCO / Score 40 / Bloqueio: EMA_DISTANCE / Missing: VOLUME_CONFIRMATION
    insertStmt.run(
      "sum-2", adminId, "ETHUSDT", ago12h, 40, 30, 40,
      "NEUTRAL", "SEM ENTRADA", "BLOQUEADO_RISCO", "NONE", "RR_BAD",
      "BAIXA", "NEUTRO", "[]", "[]", "[]",
      JSON.stringify(["EMA_DISTANCE", "EXHAUSTION_RISK"]), "[]",
      "Bloqueado por risco de exaustao", JSON.stringify(["VOLUME_CONFIRMATION"]),
      null, null, null, null, null, 0.5, "1.0.0", ago12h
    );

    // Inserção 3: SOLUSDT (3 dias atrás) - SEM ENTRADA / CONTEXTO_FORMANDO / Score 60 / Bloqueio: EMA_DISTANCE
    insertStmt.run(
      "sum-3", adminId, "SOLUSDT", ago3d, 60, 50, 60,
      "LONG", "SEM ENTRADA", "CONTEXTO_FORMANDO", "NONE", "RR_OK",
      "ALTA", "NEUTRO", "[]", "[]", "[]",
      JSON.stringify(["EMA_DISTANCE"]), "[]",
      "Aguardando confirmacao 15m", JSON.stringify(["TRIGGER_BREAKOUT"]),
      null, null, null, null, null, 1.0, "1.0.0", ago3d
    );

    db.close();

    // 2. Período sem dados (1h) -> estado vazio sem erro
    const emptyRes = await fetch(`${server.base}/api/worker/audit/summary?period=1h`, {
      headers: { Cookie: cookie },
    });
    assert.equal(emptyRes.status, 200);
    const emptyJson = await emptyRes.json();
    assert.equal(emptyJson.total, 0);
    assert.equal(emptyJson.avgScore, null);
    assert.equal(emptyJson.topBlockedReasons.length, 0);

    // 3. Período 24h (deve trazer sum-1 e sum-2 -> total 2)
    const p24Res = await fetch(`${server.base}/api/worker/audit/summary?period=24h`, {
      headers: { Cookie: cookie },
    });
    assert.equal(p24Res.status, 200);
    const p24 = await p24Res.json();
    assert.equal(p24.total, 2);
    assert.equal(p24.avgScore, 65); // (90 + 40) / 2 = 65
    assert.equal(p24.maxScore, 90);
    assert.equal(p24.byDecision["BUY"].count, 1);
    assert.equal(p24.byDecision["BUY"].pct, 50);
    assert.equal(p24.byDecision["SEM ENTRADA"].count, 1);
    assert.equal(p24.byDecision["SEM ENTRADA"].pct, 50);

    // Rankings em 24h
    assert.equal(p24.topBlockedReasons[0].name, "EMA_DISTANCE");
    assert.equal(p24.topBlockedReasons[0].count, 1);
    assert.equal(p24.topMissingConditions[0].name, "VOLUME_CONFIRMATION");

    // 4. Período 7d (deve trazer sum-1, sum-2, sum-3 -> total 3)
    const p7dRes = await fetch(`${server.base}/api/worker/audit/summary?period=7d`, {
      headers: { Cookie: cookie },
    });
    assert.equal(p7dRes.status, 200);
    const p7d = await p7dRes.json();
    assert.equal(p7d.total, 3);
    assert.equal(p7d.topBlockedReasons[0].name, "EMA_DISTANCE");
    assert.equal(p7d.topBlockedReasons[0].count, 2); // presente em sum-2 e sum-3
    assert.equal(p7d.topBlockedReasons[0].pct, 66.7); // 2/3 = 66.7%

    // 5. Visão por Ativo (BTCUSDT, ETHUSDT, SOLUSDT em 7d)
    assert.ok(p7d.bySymbol["BTCUSDT"]);
    assert.equal(p7d.bySymbol["BTCUSDT"].total, 1);
    assert.equal(p7d.bySymbol["BTCUSDT"].avgScore, 90);

    assert.ok(p7d.bySymbol["ETHUSDT"]);
    assert.equal(p7d.bySymbol["ETHUSDT"].total, 1);
    assert.equal(p7d.bySymbol["ETHUSDT"].avgScore, 40);

    assert.ok(p7d.bySymbol["SOLUSDT"]);
    assert.equal(p7d.bySymbol["SOLUSDT"].total, 1);

    // 6. Filtro por símbolo (symbol=BTCUSDT em 7d)
    const btcRes = await fetch(`${server.base}/api/worker/audit/summary?period=7d&symbol=BTCUSDT`, {
      headers: { Cookie: cookie },
    });
    assert.equal(btcRes.status, 200);
    const btcJson = await btcRes.json();
    assert.equal(btcJson.total, 1);
    assert.equal(btcJson.symbol, "BTCUSDT");
    assert.equal(btcJson.byDecision["BUY"].count, 1);
    assert.equal(btcJson.byDecision["BUY"].pct, 100);
  } finally {
    await stopServer(server.child);
    rmSync(dir, { recursive: true, force: true });
  }
});



