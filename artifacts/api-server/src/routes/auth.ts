import { Router, type IRouter, type Request, type RequestHandler } from "express";
import { AUTH_COOKIE_NAME, HttpError, type AuthUser } from "../lib/demo-store";
import { demoStore as store } from "../lib/demo-store-instance";

const router: IRouter = Router();

export interface AuthenticatedRequest extends Request {
  user: AuthUser;
}

export function cookieValue(header: string | undefined, name: string): string | undefined {
  return header?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
}

function isTrustedLocalProxy(remoteAddress: string | undefined): boolean {
  return remoteAddress === "127.0.0.1" || remoteAddress === "::1" || remoteAddress === "::ffff:127.0.0.1";
}

export function requiresHttpsError(req: { socket: { remoteAddress?: string }; headers: Record<string, string | string[] | undefined> }): boolean {
  if (process.env["ORACULO_REQUIRE_HTTPS"] !== "true") return false;
  const forwardedProto = req.headers["x-forwarded-proto"];
  const proto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
  return !(isTrustedLocalProxy(req.socket.remoteAddress) && proto === "https");
}

function rejectHttp(req: Parameters<typeof requiresHttpsError>[0], res: { status: (code: number) => { json: (body: unknown) => void } }): boolean {
  if (!requiresHttpsError(req)) return false;
  res.status(403).json({ error: "HTTPS is required for authentication and demo write operations" });
  return true;
}

function authCookie(value: string, maxAge: number): string {
  const secure = process.env["ORACULO_COOKIE_SECURE"] === "true" || process.env["ORACULO_REQUIRE_HTTPS"] === "true";
  return [
    `${AUTH_COOKIE_NAME}=${value}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${maxAge}`,
    secure ? "Secure" : "",
  ].filter(Boolean).join("; ");
}

function clearAuthCookie(): string {
  const secure = process.env["ORACULO_COOKIE_SECURE"] === "true" || process.env["ORACULO_REQUIRE_HTTPS"] === "true";
  return [
    `${AUTH_COOKIE_NAME}=`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    "Max-Age=0",
    secure ? "Secure" : "",
  ].filter(Boolean).join("; ");
}

export const requireAuth: RequestHandler = (req, res, next) => {
  const user = store.sessionUser(cookieValue(req.headers.cookie, AUTH_COOKIE_NAME));
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  (req as AuthenticatedRequest).user = user;
  next();
};

export const requireAdmin: RequestHandler = (req, res, next) => {
  const user = (req as AuthenticatedRequest).user;
  if (!user || user.role !== "admin") {
    res.status(403).json({ error: "Admin required" });
    return;
  }
  next();
};

function handle(res: { status: (code: number) => { json: (body: unknown) => void }; json: (body: unknown) => void }, fn: () => unknown): void {
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

router.get("/auth/me", (req, res) => {
  const user = store.sessionUser(cookieValue(req.headers.cookie, AUTH_COOKIE_NAME));
  res.json(user ? { authenticated: true, user } : { authenticated: false });
});

router.post("/auth/login", (req, res) => {
  if (rejectHttp(req, res)) return;
  handle(res, () => {
    const result = store.authenticate(req.body, { userAgent: req.headers["user-agent"], ip: req.ip });
    res.setHeader("Set-Cookie", authCookie(result.cookieValue, result.maxAge));
    return { authenticated: true, user: result.user };
  });
});

router.post("/auth/logout", (req, res) => {
  if (rejectHttp(req, res)) return;
  store.logout(cookieValue(req.headers.cookie, AUTH_COOKIE_NAME));
  res.setHeader("Set-Cookie", clearAuthCookie());
  res.json({ authenticated: false });
});

router.post("/auth/users", requireAuth, (req, res) => {
  const user = (req as AuthenticatedRequest).user;
  handle(res, () => ({ user: store.createUser(user, req.body) }));
});

export default router;
