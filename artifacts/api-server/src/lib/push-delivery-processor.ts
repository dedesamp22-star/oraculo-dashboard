import type webPush from "web-push";

export interface PushVapidConfig {
  configured: boolean;
  publicKey: string | null;
  privateKey: string | null;
  subject: string | null;
  reason?: string;
}

export interface ClaimedPushDelivery {
  id: string;
  userId: string;
  notificationId: string;
  subscriptionId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  payloadJson: string | null;
  attemptCount: number;
}

export interface PushDeliveryStore {
  getWebPushVapidConfig(): PushVapidConfig;
  claimWebPushDeliveries(options: {
    limit: number;
    maxAttempts: number;
    lockTimeoutMs: number;
    now: Date;
  }): ClaimedPushDelivery[];
  markWebPushDelivered(id: string, now: Date): void;
  markWebPushRetry(id: string, failure: string, nextAttemptAt: Date, now: Date): void;
  markWebPushPermanentFailure(id: string, failure: string, now: Date): void;
  removeInvalidPushSubscription(userId: string, id: string, reason: unknown): void;
}

export interface PushTransport {
  setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
  sendNotification(subscription: webPush.PushSubscription, payload: string): Promise<unknown>;
}

export interface PushDeliveryProcessorOptions {
  store: PushDeliveryStore;
  transport?: PushTransport;
  logger?: {
    info(payload: Record<string, unknown>, message?: string): void;
    warn(payload: Record<string, unknown>, message?: string): void;
    error(payload: Record<string, unknown>, message?: string): void;
  };
  intervalMs?: number;
  batchSize?: number;
  maxAttempts?: number;
  lockTimeoutMs?: number;
  baseBackoffMs?: number;
  sendTimeoutMs?: number;
}

export interface PushProcessResult {
  disabled: boolean;
  claimed: number;
  delivered: number;
  retried: number;
  permanentFailures: number;
}

const DEFAULT_INTERVAL_MS = 15_000;
const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_LOCK_TIMEOUT_MS = 120_000;
const DEFAULT_BACKOFF_MS = 30_000;
const DEFAULT_SEND_TIMEOUT_MS = 7_000;

function envInt(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

export function getPushProcessorRuntimeConfig(): {
  intervalMs: number;
  batchSize: number;
  maxAttempts: number;
  lockTimeoutMs: number;
  baseBackoffMs: number;
  sendTimeoutMs: number;
} {
  return {
    intervalMs: envInt("ORACULO_PUSH_DELIVERY_INTERVAL_MS", DEFAULT_INTERVAL_MS, 5_000, 300_000),
    batchSize: envInt("ORACULO_PUSH_DELIVERY_BATCH_SIZE", DEFAULT_BATCH_SIZE, 1, 50),
    maxAttempts: envInt("ORACULO_PUSH_MAX_ATTEMPTS", DEFAULT_MAX_ATTEMPTS, 1, 10),
    lockTimeoutMs: envInt("ORACULO_PUSH_LOCK_TIMEOUT_MS", DEFAULT_LOCK_TIMEOUT_MS, 30_000, 900_000),
    baseBackoffMs: envInt("ORACULO_PUSH_RETRY_BASE_MS", DEFAULT_BACKOFF_MS, 5_000, 900_000),
    sendTimeoutMs: envInt("ORACULO_PUSH_TIMEOUT_MS", DEFAULT_SEND_TIMEOUT_MS, 1_000, 60_000),
  };
}

function sanitizeFailure(error: unknown): string {
  const statusCode = typeof error === "object" && error !== null && "statusCode" in error
    ? Number((error as { statusCode?: unknown }).statusCode)
    : null;
  const name = error instanceof Error ? error.name : "PushError";
  const message = error instanceof Error ? error.message : String(error ?? "unknown error");
  const cleaned = message
    .replace(/https?:\/\/\S+/gi, "[redacted-url]")
    .replace(/[A-Za-z0-9_-]{24,}/g, "[redacted]")
    .replace(/[<>]/g, "")
    .slice(0, 180);
  return statusCode ? `${name} HTTP ${statusCode}: ${cleaned}` : `${name}: ${cleaned}`;
}

function errorStatusCode(error: unknown): number | null {
  if (typeof error !== "object" || error === null || !("statusCode" in error)) return null;
  const value = Number((error as { statusCode?: unknown }).statusCode);
  return Number.isFinite(value) ? value : null;
}

function validatePayload(value: string | null): string | null {
  if (!value) return null;
  try {
    const payload = JSON.parse(value) as Record<string, unknown>;
    const title = typeof payload.title === "string" ? payload.title : null;
    const body = typeof payload.body === "string" ? payload.body : null;
    const tag = typeof payload.tag === "string" ? payload.tag : null;
    const url = typeof payload.url === "string" && payload.url.startsWith("/") ? payload.url : null;
    if (!title || !body || !tag || !url) return null;
    return JSON.stringify({ title, body, tag, url });
  } catch {
    return null;
  }
}

function subscriptionFromDelivery(delivery: ClaimedPushDelivery): webPush.PushSubscription {
  return {
    endpoint: delivery.endpoint,
    keys: {
      p256dh: delivery.p256dh,
      auth: delivery.auth,
    },
  };
}

function retryDelay(baseBackoffMs: number, attemptCount: number): number {
  return Math.min(baseBackoffMs * 2 ** Math.max(0, attemptCount), 30 * 60_000);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: NodeJS.Timeout | null = null;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new Error("Push delivery timeout")), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function defaultTransport(): Promise<PushTransport> {
  const mod = await import("web-push");
  const candidate = (mod.default ?? mod) as PushTransport;
  return candidate;
}

export class PushDeliveryProcessor {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private stopped = false;
  private transportPromise: Promise<PushTransport> | null = null;
  private configuredSignature: string | null = null;

  constructor(private readonly options: PushDeliveryProcessorOptions) {}

  start(): void {
    if (this.timer) return;
    this.stopped = false;
    const config = getPushProcessorRuntimeConfig();
    this.timer = setInterval(() => void this.processOnce(), this.options.intervalMs ?? config.intervalMs);
    this.timer.unref?.();
    void this.processOnce();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async processOnce(): Promise<PushProcessResult> {
    if (this.running || this.stopped) {
      return { disabled: false, claimed: 0, delivered: 0, retried: 0, permanentFailures: 0 };
    }
    this.running = true;
    try {
      const runtime = getPushProcessorRuntimeConfig();
      const vapid = this.options.store.getWebPushVapidConfig();
      if (!vapid.configured || !vapid.publicKey || !vapid.privateKey || !vapid.subject) {
        this.options.logger?.warn({ reason: vapid.reason ?? "missing VAPID configuration" }, "Web Push processor disabled");
        return { disabled: true, claimed: 0, delivered: 0, retried: 0, permanentFailures: 0 };
      }

      const transport = await this.getTransport();
      const signature = `${vapid.subject}:${vapid.publicKey}`;
      if (this.configuredSignature !== signature) {
        transport.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
        this.configuredSignature = signature;
      }

      const deliveries = this.options.store.claimWebPushDeliveries({
        limit: this.options.batchSize ?? runtime.batchSize,
        maxAttempts: this.options.maxAttempts ?? runtime.maxAttempts,
        lockTimeoutMs: this.options.lockTimeoutMs ?? runtime.lockTimeoutMs,
        now: new Date(),
      });
      const result: PushProcessResult = { disabled: false, claimed: deliveries.length, delivered: 0, retried: 0, permanentFailures: 0 };
      for (const delivery of deliveries) {
        const outcome = await this.processDelivery(delivery, transport, runtime);
        result.delivered += outcome === "delivered" ? 1 : 0;
        result.retried += outcome === "retried" ? 1 : 0;
        result.permanentFailures += outcome === "failed" ? 1 : 0;
      }
      return result;
    } finally {
      this.running = false;
    }
  }

  private async getTransport(): Promise<PushTransport> {
    if (this.options.transport) return this.options.transport;
    this.transportPromise ??= defaultTransport();
    return await this.transportPromise;
  }

  private async processDelivery(
    delivery: ClaimedPushDelivery,
    transport: PushTransport,
    runtime: ReturnType<typeof getPushProcessorRuntimeConfig>,
  ): Promise<"delivered" | "retried" | "failed"> {
    const payload = validatePayload(delivery.payloadJson);
    const now = new Date();
    if (!payload) {
      this.options.store.markWebPushPermanentFailure(delivery.id, "Invalid push payload", now);
      return "failed";
    }

    try {
      await withTimeout(transport.sendNotification(subscriptionFromDelivery(delivery), payload), this.options.sendTimeoutMs ?? runtime.sendTimeoutMs);
      this.options.store.markWebPushDelivered(delivery.id, new Date());
      return "delivered";
    } catch (error) {
      const statusCode = errorStatusCode(error);
      const failure = sanitizeFailure(error);
      if (statusCode === 404 || statusCode === 410) {
        this.options.store.removeInvalidPushSubscription(delivery.userId, delivery.subscriptionId, failure);
        this.options.store.markWebPushPermanentFailure(delivery.id, failure, new Date());
        return "failed";
      }
      if (statusCode !== null && statusCode >= 400 && statusCode < 500 && statusCode !== 429) {
        this.options.store.markWebPushPermanentFailure(delivery.id, failure, new Date());
        return "failed";
      }
      const nextAttempt = delivery.attemptCount + 1;
      if (nextAttempt >= (this.options.maxAttempts ?? runtime.maxAttempts)) {
        this.options.store.markWebPushPermanentFailure(delivery.id, failure, new Date());
        return "failed";
      }
      const nextAttemptAt = new Date(Date.now() + retryDelay(this.options.baseBackoffMs ?? runtime.baseBackoffMs, delivery.attemptCount));
      this.options.store.markWebPushRetry(delivery.id, failure, nextAttemptAt, new Date());
      return "retried";
    }
  }
}
