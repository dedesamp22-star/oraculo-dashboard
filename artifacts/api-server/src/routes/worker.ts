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

router.get("/worker/audit/summary", requireAuth, requireAdmin, ((req, res) => {
  const user = (req as AuthenticatedRequest).user;
  const symbol = typeof req.query.symbol === "string" ? req.query.symbol : undefined;
  handle(res, () => store.getEngineAuditSummary(user, symbol));
}) as RequestHandler);

export default router;

