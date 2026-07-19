import { Router, type IRouter } from "express";
import { makeSessionCookie, verifySessionCookie } from "../lib/demo-store";

const router: IRouter = Router();

function cookieValue(header: string | undefined, name: string): string | undefined {
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

router.get("/auth/me", (req, res) => {
  const ok = verifySessionCookie(cookieValue(req.headers.cookie, "oraculo_session"), process.env["ORACULO_SESSION_SECRET"]);
  res.json({ authenticated: ok });
});

router.post("/auth/login", (req, res) => {
  if (rejectHttp(req, res)) return;
  const configuredPassword = process.env["ORACULO_ADMIN_PASSWORD"];
  const secret = process.env["ORACULO_SESSION_SECRET"];
  if (!configuredPassword || !secret) {
    res.status(503).json({ error: "Admin auth is not configured" });
    return;
  }
  if (req.body?.password !== configuredPassword) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  const secure = process.env["ORACULO_COOKIE_SECURE"] === "true";
  const cookie = [
    `oraculo_session=${makeSessionCookie(secret)}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    "Max-Age=43200",
    secure ? "Secure" : "",
  ].filter(Boolean).join("; ");
  res.setHeader("Set-Cookie", cookie);
  res.json({ authenticated: true });
});

router.post("/auth/logout", (_req, res) => {
  if (rejectHttp(_req, res)) return;
  res.setHeader("Set-Cookie", "oraculo_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
  res.json({ authenticated: false });
});

export default router;
