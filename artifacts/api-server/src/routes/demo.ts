import { Router, type IRouter, type RequestHandler, type Response } from "express";
import { HttpError } from "../lib/demo-store";
import { demoStore as store } from "../lib/demo-store-instance";
import { requireAuth, requiresHttpsError, type AuthenticatedRequest } from "./auth";

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

router.post("/demo/migrate", requireWritableAuth, ((req, res) => handle(res, () => store.migrateSession(userId(req), req.body))) as RequestHandler);

export default router;
