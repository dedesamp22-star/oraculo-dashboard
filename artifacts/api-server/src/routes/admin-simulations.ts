import { Router, type IRouter, type RequestHandler, type Response } from "express";
import { HttpError } from "../lib/demo-store";
import { demoStore as store } from "../lib/demo-store-instance";
import { requireAdmin, requireAuth, requiresHttpsError, type AuthenticatedRequest } from "./auth";

const router: IRouter = Router();

const requireWritableAdmin: RequestHandler[] = [requireAuth, requireAdmin, (req, res, next) => {
  if (requiresHttpsError(req)) {
    res.status(403).json({ error: "HTTPS is required for controlled simulation operations" });
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

router.post("/admin/simulations", requireWritableAdmin, ((req, res) => {
  handle(res, () => store.createControlledSimulation(user(req), req.body));
}) as RequestHandler);

router.get("/admin/simulations/current", requireAuth, requireAdmin, ((req, res) => {
  handle(res, () => store.getCurrentControlledSimulation(user(req)));
}) as RequestHandler);

router.post("/admin/simulations/:id/step", requireWritableAdmin, ((req, res) => {
  handle(res, () => store.stepControlledSimulation(user(req), String(req.params.id), req.body));
}) as RequestHandler);

router.post("/admin/simulations/:id/cancel", requireWritableAdmin, ((req, res) => {
  handle(res, () => store.cancelControlledSimulation(user(req), String(req.params.id)));
}) as RequestHandler);

router.get("/admin/simulations/:id/events", requireAuth, requireAdmin, ((req, res) => {
  handle(res, () => store.getControlledSimulationEvents(user(req), String(req.params.id)));
}) as RequestHandler);

export default router;
