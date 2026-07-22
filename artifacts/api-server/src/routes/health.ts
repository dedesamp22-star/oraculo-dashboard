import { Router, type IRouter } from "express";
import os from "node:os";
import { HealthCheckResponse } from "@workspace/api-zod";
import { checkBinanceHealth } from "../lib/binance-client";
import { demoStore } from "../lib/demo-store-instance";
import { APP_METADATA } from "@shared/appVersion";

const router: IRouter = Router();
const startedAt = new Date().toISOString();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/health", async (_req, res) => {
  const started = process.hrtime.bigint();
  const binance = await checkBinanceHealth();
  const observability = demoStore.getObservabilitySnapshot();
  const responseLatencyMs = Number((process.hrtime.bigint() - started) / 1_000_000n);
  const workerLatest = observability.worker.latest;
  res.json({
    ...APP_METADATA,
    status: binance.ok && observability.sqlite.integrity === "ok" ? "ok" : "degraded",
    api: {
      ok: true,
      uptimeSec: Math.round(process.uptime()),
      startedAt,
      pid: process.pid,
      nodeVersion: process.version,
      memory: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      responseLatencyMs,
    },
    binance,
    system: {
      platform: process.platform,
      arch: process.arch,
      cpus: os.cpus().length,
      loadAverage: os.loadavg(),
      totalMemory: os.totalmem(),
      freeMemory: os.freemem(),
      uptimeSec: Math.round(os.uptime()),
    },
    worker: {
      active: true,
      automationUsers: observability.worker.automationUsers,
      diagnosticsStored: observability.worker.diagnosticsStored,
      lastCycleAt: workerLatest?.generatedAt ?? null,
      lastSymbol: workerLatest?.symbol ?? null,
      lastDecision: workerLatest?.decision ?? null,
      lastDirection: workerLatest?.direction ?? null,
      lastScore: workerLatest?.score ?? null,
      lastStatus: workerLatest?.status ?? "WAIT",
      lastLatencyMs: workerLatest?.latencyMs ?? null,
      lastCycleDurationMs: workerLatest?.cycleDurationMs ?? null,
      nextCycleAt: workerLatest?.nextCycleAt ?? null,
      lastError: workerLatest?.lastError ?? null,
      engineVersion: workerLatest?.engineVersion ?? APP_METADATA.version,
    },
    sqlite: observability.sqlite,
    sessions: observability.sessions,
    notifications: observability.notifications,
    generatedAt: new Date().toISOString(),
  });
});

export default router;
