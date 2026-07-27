import { Router, type IRouter, type RequestHandler, type Response } from "express";
import { HttpError } from "../lib/demo-store";
import { demoStore as store } from "../lib/demo-store-instance";
import { requireAdmin, requireAuth, requiresHttpsError, type AuthenticatedRequest } from "./auth";

const router: IRouter = Router();

const requireWritableAuth: RequestHandler[] = [requireAuth, (req, res, next) => {
  if (requiresHttpsError(req)) {
    res.status(403).json({ error: "HTTPS is required for authentication and demo write operations" });
    return;
  }
  next();
}];

function userId(req: Parameters<RequestHandler>[0]): string {
  return (req as AuthenticatedRequest).user.id;
}

function handle(res: Response, fn: () => unknown): void {
  try {
    res.json(fn());
  } catch (err) {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    res.status(500).json({
      error: "Internal server error",
      ...(process.env["NODE_ENV"] === "production" ? {} : { detail: err instanceof Error ? err.message : String(err) }),
    });
  }
}

function escapeCsvCell(value: unknown): string {
  if (value == null) return "";
  let str = typeof value === "object" ? JSON.stringify(value) : String(value);
  if (/^[=+\-@]/.test(str)) str = `'${str}`;
  if (str.includes('"') || str.includes(",") || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

router.get("/demo/account", requireAuth, ((req, res) => handle(res, () => store.getAccount(userId(req)))) as RequestHandler);
router.put("/demo/account", requireWritableAuth, ((req, res) => handle(res, () => store.putAccount(userId(req), req.body))) as RequestHandler);
router.get("/demo/session", requireAuth, ((req, res) => handle(res, () => store.getSession(userId(req)))) as RequestHandler);
router.post("/demo/reset", requireWritableAuth, ((req, res) => handle(res, () => store.resetSession(userId(req), req.body))) as RequestHandler);
router.get("/demo/automation", requireAuth, ((req, res) => handle(res, () => store.getAutomation(userId(req)))) as RequestHandler);
router.put("/demo/automation", requireWritableAuth, ((req, res) => handle(res, () => store.setAutomation(userId(req), req.body))) as RequestHandler);

router.get("/demo/positions", requireAuth, ((req, res) => handle(res, () => store.getPositions(userId(req)))) as RequestHandler);
router.post("/demo/positions", requireWritableAuth, ((req, res) => handle(res, () => store.postPosition(userId(req), req.body))) as RequestHandler);
router.patch("/demo/positions/:id", requireWritableAuth, ((req, res) => handle(res, () => store.patchPosition(userId(req), String(req.params.id), req.body))) as RequestHandler);
router.post("/demo/signal", requireWritableAuth, ((req, res) => handle(res, () => store.openFromSignal(userId(req), req.body))) as RequestHandler);
router.post("/demo/price", requireWritableAuth, ((req, res) => handle(res, () => store.updatePrices(userId(req), req.body))) as RequestHandler);

router.get("/demo/trades", requireAuth, ((req, res) => handle(res, () => store.getTrades(userId(req)))) as RequestHandler);
router.post("/demo/trades", requireWritableAuth, ((req, res) => handle(res, () => store.postTrade(userId(req), req.body))) as RequestHandler);
router.get("/demo/trades/export", requireAuth, requireAdmin, ((req, res) => {
  const user = (req as AuthenticatedRequest).user;
  const format = req.query.format === "csv" ? "csv" : "json";
  const params = {
    from: typeof req.query.from === "string" ? req.query.from : undefined,
    to: typeof req.query.to === "string" ? req.query.to : undefined,
    symbol: typeof req.query.symbol === "string" ? req.query.symbol : undefined,
    direction: typeof req.query.direction === "string" ? req.query.direction : undefined,
    status: typeof req.query.status === "string" ? req.query.status : undefined,
    exitReason: typeof req.query.exitReason === "string" ? req.query.exitReason : undefined,
    limit: req.query.limit !== undefined ? Number(req.query.limit) : undefined,
  };
  try {
    const data = store.exportDemoTradeHistory(user, params);
    const fileTimestamp = new Date().toISOString().replace(/[:.]/g, "-");
    if (format === "csv") {
      const headers = [
        "Pair", "Direction", "EntryPrice", "ExitPrice", "OpenTime", "CloseTime", "DurationMs",
        "StopLoss", "StopLossOriginal", "Target1", "Target2", "ExitReason", "Status",
        "RiskAmount", "PositionSize", "RemainingPositionSize",
        "PnL", "RealizedPnL", "PartialPnL", "MFE_USDC", "MAE_USDC", "MFE_R", "MAE_R",
        "PeakGivebackUSDC", "OpenGivebackUSDC", "TotalGivebackUSDC", "PeakGivebackPct",
        "MaxPriceSinceEntry", "MinPriceSinceEntry", "MaxUnrealizedPnlUSDC", "MinUnrealizedPnlUSDC",
        "Target1Hit", "Breakeven", "Trailing", "SignalReasons", "ManagementTimeline"
      ];
      const rows = data.entries.map((trade) => [
        trade.pair,
        trade.direction,
        trade.entryPrice,
        trade.exitPrice,
        trade.openTime,
        trade.closeTime,
        trade.durationMs,
        trade.stopLoss,
        trade.stopLossOriginal,
        trade.target1,
        trade.target2,
        trade.exitReason,
        trade.status,
        trade.riskAmount,
        trade.positionSize,
        trade.remainingPositionSize,
        trade.pnlUSDC,
        trade.realizedPnlUSDC,
        trade.partialPnlUSDC,
        trade.mfeUSDC,
        trade.maeUSDC,
        trade.mfeR,
        trade.maeR,
        trade.peakGivebackUSDC,
        trade.openGivebackUSDC,
        trade.totalGivebackUSDC,
        trade.peakGivebackPct,
        trade.maxPriceSinceEntry,
        trade.minPriceSinceEntry,
        trade.maxUnrealizedPnlUSDC,
        trade.minUnrealizedPnlUSDC,
        trade.target1Hit,
        trade.breakeven,
        trade.trailing,
        trade.signalReasons,
        trade.managementTimeline,
      ].map(escapeCsvCell).join(","));
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="demo-trades-export-${fileTimestamp}.csv"`);
      res.send([headers.join(","), ...rows].join("\n"));
      return;
    }
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="demo-trades-export-${fileTimestamp}.json"`);
    res.json(data);
  } catch (err) {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    res.status(500).json({
      error: "Internal server error",
      ...(process.env["NODE_ENV"] === "production" ? {} : { detail: err instanceof Error ? err.message : String(err) }),
    });
  }
}) as RequestHandler);

router.post("/demo/migrate", requireWritableAuth, ((req, res) => handle(res, () => store.migrateSession(userId(req), req.body))) as RequestHandler);

export default router;
