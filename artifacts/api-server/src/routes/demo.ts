import { Router, type IRouter, type RequestHandler, type Response } from "express";
import { HttpError, verifySessionCookie } from "../lib/demo-store";
import { demoStore as store } from "../lib/demo-store-instance";
import { requiresHttpsError } from "./auth";

const router: IRouter = Router();

function cookieValue(header: string | undefined, name: string): string | undefined {
  return header?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
}

const requireAuth: RequestHandler = (req, res, next) => {
  if (requiresHttpsError(req)) {
    res.status(403).json({ error: "HTTPS is required for authentication and demo write operations" });
    return;
  }
  const ok = verifySessionCookie(cookieValue(req.headers.cookie, "oraculo_session"), process.env["ORACULO_SESSION_SECRET"]);
  if (!ok) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  next();
};

function handle(res: Response, fn: () => unknown): void {
  try {
    res.json(fn());
  } catch (err) {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  }
}

router.get("/demo/account", (_req, res) => handle(res, () => store.getAccount()));
router.put("/demo/account", requireAuth, (req, res) => handle(res, () => store.putAccount(req.body)));
router.get("/demo/session", (_req, res) => handle(res, () => store.getSession()));
router.post("/demo/reset", requireAuth, (req, res) => handle(res, () => store.resetSession(req.body)));
router.get("/demo/automation", (_req, res) => handle(res, () => store.getAutomation()));
router.put("/demo/automation", requireAuth, (req, res) => handle(res, () => store.setAutomation(req.body)));

router.get("/demo/positions", (_req, res) => handle(res, () => store.getPositions()));
router.post("/demo/positions", requireAuth, (req, res) => handle(res, () => store.postPosition(req.body)));
router.patch("/demo/positions/:id", requireAuth, (req, res) => handle(res, () => store.patchPosition(String(req.params.id), req.body)));
router.post("/demo/signal", requireAuth, (req, res) => handle(res, () => store.openFromSignal(req.body)));
router.post("/demo/price", requireAuth, (req, res) => handle(res, () => store.updatePrices(req.body)));

router.get("/demo/trades", (_req, res) => handle(res, () => store.getTrades()));
router.post("/demo/trades", requireAuth, (req, res) => handle(res, () => store.postTrade(req.body)));

router.post("/demo/migrate", requireAuth, (req, res) => handle(res, () => store.migrateSession(req.body)));

export default router;
