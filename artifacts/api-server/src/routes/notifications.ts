import { Router, type IRouter, type RequestHandler, type Response } from "express";
import { HttpError } from "../lib/demo-store";
import { demoStore as store } from "../lib/demo-store-instance";
import { requireAuth, requiresHttpsError, type AuthenticatedRequest } from "./auth";

const router: IRouter = Router();

const requireWritableAuth: RequestHandler[] = [requireAuth, (req, res, next) => {
  if (requiresHttpsError(req)) {
    res.status(403).json({ error: "HTTPS is required for notification write operations" });
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

router.get("/notifications", requireAuth, ((req, res) => {
  handle(res, () => store.getNotifications(user(req), req.query));
}) as RequestHandler);

router.post("/notifications/:id/read", requireWritableAuth, ((req, res) => {
  handle(res, () => store.markNotificationRead(user(req).id, String(req.params.id)));
}) as RequestHandler);

router.post("/notifications/read-all", requireWritableAuth, ((req, res) => {
  handle(res, () => store.markAllNotificationsRead(user(req).id));
}) as RequestHandler);

router.get("/notification-preferences", requireAuth, ((req, res) => {
  handle(res, () => store.getNotificationPreferences(user(req).id));
}) as RequestHandler);

router.put("/notification-preferences", requireWritableAuth, ((req, res) => {
  handle(res, () => store.putNotificationPreferences(user(req).id, req.body));
}) as RequestHandler);

router.get("/push/public-key", requireAuth, ((_req, res) => {
  handle(res, () => store.getPushPublicKey());
}) as RequestHandler);

router.get("/push/subscriptions", requireAuth, ((req, res) => {
  handle(res, () => store.listPushSubscriptions(user(req).id));
}) as RequestHandler);

router.post("/push/subscribe", requireWritableAuth, ((req, res) => {
  handle(res, () => store.subscribePush(user(req).id, req.body, req.headers["user-agent"]));
}) as RequestHandler);

router.delete("/push/subscribe/:id", requireWritableAuth, ((req, res) => {
  handle(res, () => store.deletePushSubscription(user(req).id, String(req.params.id)));
}) as RequestHandler);

router.post("/notifications/test", requireWritableAuth, ((req, res) => {
  handle(res, () => store.createTestNotification(user(req)));
}) as RequestHandler);

export default router;
