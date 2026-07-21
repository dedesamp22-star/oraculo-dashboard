import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const dist = path.resolve("dist/public");

test("manifest is installable and uses Oraculo 0.5 metadata", () => {
  const manifest = JSON.parse(readFileSync(path.join(dist, "manifest.webmanifest"), "utf8"));
  assert.equal(manifest.name, "Oráculo 0.5");
  assert.equal(manifest.short_name, "Oráculo");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.orientation, "portrait");
  assert.equal(manifest.theme_color, "#00f0ff");
  assert.equal(manifest.background_color, "#05070d");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  assert.ok(Array.isArray(manifest.icons));
  assert.ok(manifest.icons.some((icon) => icon.src === "/icon.svg" && icon.purpose.includes("maskable")));
});

test("service worker keeps API network-only and caches only static assets", () => {
  const sw = readFileSync(path.join(dist, "sw.js"), "utf8");
  assert.match(sw, /CACHE_NAME = "oraculo-0\.5-homologation-static"/);
  assert.match(sw, /url\.pathname\.startsWith\('\/api\/'\)/);
  assert.match(sw, /fetch\(request, \{ cache: 'no-store' \}\)/);
  assert.doesNotMatch(sw, /cache\.put\(request[\s\S]*\/api\//);
  assert.match(sw, /STATIC_EXTENSIONS/);
  assert.match(sw, /OFFLINE_URL = '\/offline\.html'/);
});

test("offline page does not expose private demo data", () => {
  const offline = readFileSync(path.join(dist, "offline.html"), "utf8");
  assert.match(offline, /Sem conexão|Sem conex/);
  assert.match(offline, /dados demo/i);
  assert.doesNotMatch(offline, /balance|positions|trades|cookie|sessionId|token/i);
});
