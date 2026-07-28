import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const root = path.resolve(import.meta.dirname, "..");

function transpileTo(tempDir, moduleName) {
  const source = readFileSync(path.join(root, "src", "lib", `${moduleName}.ts`), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: `${moduleName}.ts`,
  }).outputText;
  writeFileSync(path.join(tempDir, `${moduleName}.js`), output);
}

function loadProcessor() {
  const tempDir = mkdtempSync(path.join(tmpdir(), "oraculo-push-processor-"));
  transpileTo(tempDir, "push-delivery-processor");
  return {
    PushDeliveryProcessor: require(path.join(tempDir, "push-delivery-processor.js")).PushDeliveryProcessor,
    tempDir,
  };
}

function loadDemoStoreAndProcessor() {
  const tempDir = mkdtempSync(path.join(tmpdir(), "oraculo-push-store-"));
  for (const moduleName of ["push-delivery-processor", "push-notifications", "telegram-notifications"]) {
    transpileTo(tempDir, moduleName);
  }
  const source = readFileSync(path.join(root, "src", "lib", "demo-store.ts"), "utf8")
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
  writeFileSync(path.join(tempDir, "demo-store.cjs"), output);
  return {
    DemoStore: require(path.join(tempDir, "demo-store.cjs")).DemoStore,
    PushDeliveryProcessor: require(path.join(tempDir, "push-delivery-processor.js")).PushDeliveryProcessor,
    tempDir,
  };
}

function payload(overrides = {}) {
  return JSON.stringify({
    title: "Alerta",
    body: "Mensagem",
    tag: "oraculo-test",
    url: "/relatorio-operacoes",
    ...overrides,
  });
}

function delivery(overrides = {}) {
  const id = overrides.id ?? `dlv_${Math.random().toString(16).slice(2)}`;
  return {
    id,
    userId: "user_1",
    notificationId: `ntf_${id}`,
    subscriptionId: `push_${id}`,
    endpoint: `https://push.example/${id}/super-secret-endpoint-token-1234567890`,
    p256dh: "p256dh",
    auth: "auth",
    payloadJson: payload(),
    attemptCount: 0,
    status: "queued",
    nextAttemptAt: null,
    lockedAt: null,
    failure: null,
    deliveredAt: null,
    revoked: false,
    ...overrides,
  };
}

class FakeStore {
  constructor({ configured = true, deliveries = [] } = {}) {
    this.configured = configured;
    this.deliveries = deliveries;
    this.revoked = [];
  }

  getWebPushVapidConfig() {
    if (!this.configured) return { configured: false, publicKey: null, privateKey: null, subject: null, reason: "missing VAPID configuration" };
    return { configured: true, publicKey: "public-key", privateKey: "private-key", subject: "mailto:ops@example.com" };
  }

  claimWebPushDeliveries({ limit, maxAttempts }) {
    const claimed = [];
    for (const item of this.deliveries) {
      if (claimed.length >= limit) break;
      if (item.revoked || item.attemptCount >= maxAttempts) continue;
      if (!["queued", "failed"].includes(item.status)) continue;
      item.status = "sending";
      item.lockedAt = new Date().toISOString();
      claimed.push({ ...item });
    }
    return claimed;
  }

  markWebPushDelivered(id, now) {
    const item = this.deliveries.find((candidate) => candidate.id === id);
    item.status = "delivered";
    item.attemptCount += 1;
    item.deliveredAt = now.toISOString();
    item.failure = null;
    item.lockedAt = null;
  }

  markWebPushRetry(id, failure, nextAttemptAt) {
    const item = this.deliveries.find((candidate) => candidate.id === id);
    item.status = "failed";
    item.attemptCount += 1;
    item.failure = failure;
    item.nextAttemptAt = nextAttemptAt.toISOString();
    item.lockedAt = null;
  }

  markWebPushPermanentFailure(id, failure) {
    const item = this.deliveries.find((candidate) => candidate.id === id);
    item.status = "failed";
    item.attemptCount += 1;
    item.failure = failure;
    item.nextAttemptAt = null;
    item.lockedAt = null;
  }

  removeInvalidPushSubscription(userId, id, reason) {
    const item = this.deliveries.find((candidate) => candidate.userId === userId && candidate.subscriptionId === id);
    if (item) item.revoked = true;
    this.revoked.push({ userId, id, reason: String(reason) });
  }
}

class MockTransport {
  constructor(handler = async () => undefined) {
    this.handler = handler;
    this.sent = [];
    this.vapid = null;
  }

  setVapidDetails(subject, publicKey, privateKey) {
    this.vapid = { subject, publicKey, privateKey };
  }

  async sendNotification(subscription, body) {
    this.sent.push({ subscription, body });
    return await this.handler(subscription, body);
  }
}

test("missing VAPID disables processor without claiming or sending", async () => {
  const { PushDeliveryProcessor, tempDir } = loadProcessor();
  try {
    const store = new FakeStore({ configured: false, deliveries: [delivery()] });
    const transport = new MockTransport();
    const result = await new PushDeliveryProcessor({ store, transport }).processOnce();
    assert.equal(result.disabled, true);
    assert.equal(transport.sent.length, 0);
    assert.equal(store.deliveries[0].status, "queued");
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("pending delivery is sent once and completed deliveries are not resent", async () => {
  const { PushDeliveryProcessor, tempDir } = loadProcessor();
  try {
    const item = delivery();
    const store = new FakeStore({ deliveries: [item] });
    const transport = new MockTransport();
    const processor = new PushDeliveryProcessor({ store, transport });
    const first = await processor.processOnce();
    const second = await processor.processOnce();
    assert.equal(first.delivered, 1);
    assert.equal(second.claimed, 0);
    assert.equal(transport.sent.length, 1);
    assert.equal(item.status, "delivered");
    assert.ok(item.deliveredAt);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("two concurrent processors do not duplicate the same delivery", async () => {
  const { PushDeliveryProcessor, tempDir } = loadProcessor();
  try {
    const item = delivery();
    const store = new FakeStore({ deliveries: [item] });
    const transport = new MockTransport(async () => new Promise((resolve) => setTimeout(resolve, 25)));
    const processorA = new PushDeliveryProcessor({ store, transport });
    const processorB = new PushDeliveryProcessor({ store, transport });
    await Promise.all([processorA.processOnce(), processorB.processOnce()]);
    assert.equal(transport.sent.length, 1);
    assert.equal(item.status, "delivered");
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("404 and 410 disable invalid subscriptions permanently", async () => {
  const { PushDeliveryProcessor, tempDir } = loadProcessor();
  try {
    for (const statusCode of [404, 410]) {
      const item = delivery({ id: `dlv_${statusCode}` });
      const store = new FakeStore({ deliveries: [item] });
      const transport = new MockTransport(async () => {
        const error = new Error(`Gone ${item.endpoint}`);
        error.statusCode = statusCode;
        throw error;
      });
      await new PushDeliveryProcessor({ store, transport }).processOnce();
      assert.equal(item.status, "failed");
      assert.equal(item.revoked, true);
      assert.equal(item.nextAttemptAt, null);
      assert.doesNotMatch(item.failure, /super-secret-endpoint-token/);
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("429, timeout and 5xx are retried, then stop at max attempts", async () => {
  const { PushDeliveryProcessor, tempDir } = loadProcessor();
  try {
    const retryCases = [
      { error: Object.assign(new Error("too many requests"), { statusCode: 429 }) },
      { error: Object.assign(new Error("server error"), { statusCode: 503 }) },
    ];
    for (const entry of retryCases) {
      const item = delivery();
      const store = new FakeStore({ deliveries: [item] });
      const transport = new MockTransport(async () => { throw entry.error; });
      const result = await new PushDeliveryProcessor({ store, transport, maxAttempts: 3 }).processOnce();
      assert.equal(result.retried, 1);
      assert.equal(item.status, "failed");
      assert.ok(item.nextAttemptAt);
    }

    const timeoutItem = delivery();
    const timeoutStore = new FakeStore({ deliveries: [timeoutItem] });
    const timeoutTransport = new MockTransport(async () => new Promise(() => undefined));
    await new PushDeliveryProcessor({ store: timeoutStore, transport: timeoutTransport, sendTimeoutMs: 5, maxAttempts: 3 }).processOnce();
    assert.equal(timeoutItem.status, "failed");
    assert.ok(timeoutItem.nextAttemptAt);

    const maxed = delivery({ attemptCount: 2 });
    const maxedStore = new FakeStore({ deliveries: [maxed] });
    const maxedTransport = new MockTransport(async () => {
      const error = new Error("too many requests");
      error.statusCode = 429;
      throw error;
    });
    await new PushDeliveryProcessor({ store: maxedStore, transport: maxedTransport, maxAttempts: 3 }).processOnce();
    assert.equal(maxed.status, "failed");
    assert.equal(maxed.nextAttemptAt, null);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("one subscription failure does not block other deliveries", async () => {
  const { PushDeliveryProcessor, tempDir } = loadProcessor();
  try {
    const bad = delivery({ id: "bad" });
    const good = delivery({ id: "good" });
    const store = new FakeStore({ deliveries: [bad, good] });
    const transport = new MockTransport(async (subscription) => {
      if (subscription.endpoint.includes("/bad/")) {
        const error = new Error("temporary outage");
        error.statusCode = 503;
        throw error;
      }
    });
    const result = await new PushDeliveryProcessor({ store, transport, maxAttempts: 3 }).processOnce();
    assert.equal(result.delivered, 1);
    assert.equal(result.retried, 1);
    assert.equal(good.status, "delivered");
    assert.equal(bad.status, "failed");
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("invalid payload is permanently failed without sending", async () => {
  const { PushDeliveryProcessor, tempDir } = loadProcessor();
  try {
    const item = delivery({ payloadJson: JSON.stringify({ title: "missing url" }) });
    const store = new FakeStore({ deliveries: [item] });
    const transport = new MockTransport();
    const result = await new PushDeliveryProcessor({ store, transport }).processOnce();
    assert.equal(result.permanentFailures, 1);
    assert.equal(transport.sent.length, 0);
    assert.equal(item.status, "failed");
    assert.match(item.failure, /Invalid push payload/);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("admin test notification enters the real queue and can be processed", async () => {
  const { DemoStore, PushDeliveryProcessor, tempDir } = loadDemoStoreAndProcessor();
  const dbDir = mkdtempSync(path.join(tmpdir(), "oraculo-push-admin-db-"));
  const oldPublic = process.env.ORACULO_VAPID_PUBLIC_KEY;
  const oldPrivate = process.env.ORACULO_VAPID_PRIVATE_KEY;
  const oldSubject = process.env.ORACULO_VAPID_SUBJECT;
  try {
    process.env.ORACULO_VAPID_PUBLIC_KEY = "public-key";
    process.env.ORACULO_VAPID_PRIVATE_KEY = "private-key";
    process.env.ORACULO_VAPID_SUBJECT = "mailto:ops@example.com";
    const store = new DemoStore(path.join(dbDir, "oraculo.sqlite"));
    const now = new Date().toISOString();
    const admin = { id: "admin", username: "admin", name: "Admin", role: "admin", active: true, createdAt: now, lastLoginAt: null };
    const user = store.createUser(admin, { username: "push-admin", name: "Push Admin", password: "local-password", role: "admin" });
    store.putNotificationPreferences(user.id, { push: true });
    store.subscribePush(user.id, {
      endpoint: "https://push.example/admin",
      keys: { p256dh: "p256dh", auth: "auth" },
    }, "test-agent");
    const notification = store.createTestNotification(user);
    assert.ok(notification);
    const transport = new MockTransport();
    const result = await new PushDeliveryProcessor({ store, transport }).processOnce();
    assert.equal(result.delivered, 1);
    assert.equal(transport.sent.length, 1);
    const sentPayload = JSON.parse(transport.sent[0].body);
    assert.equal(sentPayload.url, "/");
    store.close();
  } finally {
    if (oldPublic === undefined) delete process.env.ORACULO_VAPID_PUBLIC_KEY;
    else process.env.ORACULO_VAPID_PUBLIC_KEY = oldPublic;
    if (oldPrivate === undefined) delete process.env.ORACULO_VAPID_PRIVATE_KEY;
    else process.env.ORACULO_VAPID_PRIVATE_KEY = oldPrivate;
    if (oldSubject === undefined) delete process.env.ORACULO_VAPID_SUBJECT;
    else process.env.ORACULO_VAPID_SUBJECT = oldSubject;
    rmSync(dbDir, { recursive: true, force: true });
    rmSync(tempDir, { recursive: true, force: true });
  }
});
