import { Router, type IRouter, type RequestHandler, type Response } from "express";
import { HttpError } from "../lib/demo-store";
import { demoStore as store } from "../lib/demo-store-instance";
import { requireAdmin, requireAuth, type AuthenticatedRequest } from "./auth";

const router: IRouter = Router();

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

router.get("/worker/diagnostics", requireAuth, ((req, res) => {
  const user = (req as AuthenticatedRequest).user;
  const limit = Number(req.query.limit ?? 10);
  handle(res, () => store.getWorkerDiagnostics(user, limit));
}) as RequestHandler);

router.get("/worker/diagnostics/admin", requireAuth, requireAdmin, ((req, res) => {
  const user = (req as AuthenticatedRequest).user;
  const limit = Number(req.query.limit ?? 20);
  handle(res, () => store.getWorkerDiagnostics(user, limit));
}) as RequestHandler);

router.get("/worker/audit", requireAuth, requireAdmin, ((req, res) => {
  const user = (req as AuthenticatedRequest).user;
  const symbol = typeof req.query.symbol === "string" ? req.query.symbol : undefined;
  const limit = req.query.limit !== undefined ? Number(req.query.limit) : 50;
  const offset = req.query.offset !== undefined ? Number(req.query.offset) : 0;
  handle(res, () => store.getEngineAuditLog(user, { symbol, limit, offset }));
}) as RequestHandler);

function escapeCsvCell(val: unknown): string {
  if (val == null) return "";
  let str: string;
  if (typeof val === "object") {
    if (Array.isArray(val)) {
      if (val.length === 0) return "";
      if (typeof val[0] === "string") {
        str = val.join("; ");
      } else if (typeof val[0] === "object" && val[0] !== null && "name" in val[0]) {
        str = val.map((f: { name: string; reason?: string }) => f.reason ? `${f.name}: ${f.reason}` : f.name).join("; ");
      } else {
        str = JSON.stringify(val);
      }
    } else {
      str = JSON.stringify(val);
    }
  } else {
    str = String(val);
  }
  if (str.includes('"') || str.includes(",") || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

router.get("/worker/audit/summary", requireAuth, requireAdmin, ((req, res) => {
  const user = (req as AuthenticatedRequest).user;
  const symbol = typeof req.query.symbol === "string" ? req.query.symbol : undefined;
  const period = typeof req.query.period === "string" ? req.query.period : undefined;
  handle(res, () => store.getEngineAuditSummary(user, { symbol, period }));
}) as RequestHandler);


router.get("/worker/audit/export", requireAuth, requireAdmin, ((req, res) => {
  const user = (req as AuthenticatedRequest).user;
  const hours = req.query.hours !== undefined ? Number(req.query.hours) : undefined;
  const symbol = typeof req.query.symbol === "string" ? req.query.symbol : undefined;
  const decision = typeof req.query.decision === "string" ? req.query.decision : undefined;
  const state = typeof req.query.state === "string" ? req.query.state : undefined;
  const limit = req.query.limit !== undefined ? Number(req.query.limit) : 1000;
  const format = req.query.format === "csv" ? "csv" : "json";

  try {
    const data = store.exportEngineAuditLog(user, { hours, symbol, decision, state, limit });
    const fileTimestamp = new Date().toISOString().replace(/[:.]/g, "-");

    if (format === "csv") {
      const headers = [
        "ID", "AnalyzedAt", "Symbol", "Direction", "Decision", "State",
        "TriggerStage", "Score", "ScoreContextual", "ScoreRaw", "RRStatus",
        "Trend1H", "Trend15M", "EntryPrice", "StopPrice", "Target1", "Target2",
        "RR", "VolumeRelative", "BlockedCount", "BlockedReasons", "DecisiveReason", "EngineVersion"
      ];
      const rows = data.entries.map((entry) => [
        escapeCsvCell(entry.id),
        escapeCsvCell(entry.analyzedAt),
        escapeCsvCell(entry.symbol),
        escapeCsvCell(entry.direction),
        escapeCsvCell(entry.decision),
        escapeCsvCell(entry.decisionState),
        escapeCsvCell(entry.triggerStage),
        escapeCsvCell(entry.score),
        escapeCsvCell(entry.scoreContextual),
        escapeCsvCell(entry.scoreRaw),
        escapeCsvCell(entry.rrStatus),
        escapeCsvCell(entry.trend1h),
        escapeCsvCell(entry.trend15m),
        escapeCsvCell(entry.entryPrice),
        escapeCsvCell(entry.stopPrice),
        escapeCsvCell(entry.target1),
        escapeCsvCell(entry.target2),
        escapeCsvCell(entry.rr),
        escapeCsvCell(entry.volumeRelative),
        escapeCsvCell(entry.filtersBlocked.length),
        escapeCsvCell(entry.blockedReasons),
        escapeCsvCell(entry.decisiveReason),
        escapeCsvCell(entry.engineVersion),
      ].join(","));

      const csvContent = [headers.join(","), ...rows].join("\n");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="audit-export-${fileTimestamp}.csv"`);
      res.send(csvContent);
      return;
    }

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="audit-export-${fileTimestamp}.json"`);
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

export default router;


