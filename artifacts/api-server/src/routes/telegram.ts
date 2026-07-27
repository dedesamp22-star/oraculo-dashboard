import { Router, type IRouter, type RequestHandler, type Response } from "express";
import { HttpError } from "../lib/demo-store";
import { demoStore as store } from "../lib/demo-store-instance";
import { requireAdmin, requireAuth, requiresHttpsError, type AuthenticatedRequest } from "./auth";

const router: IRouter = Router();

const requireWritableAuth: RequestHandler[] = [requireAuth, (req, res, next) => {
  if (requiresHttpsError(req)) {
    res.status(403).json({ error: "HTTPS is required for Telegram integration writes" });
    return;
  }
  next();
}];

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

function user(req: Parameters<RequestHandler>[0]) {
  return (req as AuthenticatedRequest).user;
}

router.post("/integrations/telegram/link-code", requireWritableAuth, ((req, res) => {
  handle(res, () => store.createTelegramLinkCode(user(req).id));
}) as RequestHandler);

router.get("/integrations/telegram/status", requireAuth, ((req, res) => {
  handle(res, () => store.getTelegramStatus(user(req).id));
}) as RequestHandler);

router.get("/integrations/telegram/admin/status", requireAuth, requireAdmin, ((req, res) => {
  handle(res, () => store.getTelegramAdminStatus(user(req)));
}) as RequestHandler);

router.post("/integrations/telegram/test", requireWritableAuth, ((req, res) => {
  handle(res, () => store.createTelegramTestNotification(user(req)));
}) as RequestHandler);

router.post("/integrations/telegram/admin/test", requireWritableAuth, requireAdmin, ((req, res) => {
  handle(res, () => store.createTelegramAdminTestNotification(user(req)));
}) as RequestHandler);

router.delete("/integrations/telegram", requireWritableAuth, ((req, res) => {
  handle(res, () => store.disconnectTelegram(user(req).id));
}) as RequestHandler);

router.post("/integrations/telegram/webhook", ((req, res) => {
  const expected = process.env["ORACULO_TELEGRAM_WEBHOOK_SECRET"];
  const received = req.headers["x-telegram-bot-api-secret-token"];
  const secret = Array.isArray(received) ? received[0] : received;
  if (!expected || secret !== expected) {
    res.status(401).json({ error: "Invalid Telegram webhook secret" });
    return;
  }
  handle(res, () => store.processTelegramWebhook(req.body));
}) as RequestHandler);

export default router;
