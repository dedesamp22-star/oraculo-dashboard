import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { checkBinanceHealth } from "../lib/binance-client";
import { APP_METADATA } from "@shared/appVersion";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/health", async (_req, res) => {
  const binance = await checkBinanceHealth();
  res.json({
    ...APP_METADATA,
    status: binance.ok ? "ok" : "degraded",
    api: {
      ok: true,
      uptimeSec: Math.round(process.uptime()),
      memory: process.memoryUsage(),
    },
    binance,
    generatedAt: new Date().toISOString(),
  });
});

export default router;
