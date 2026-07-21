import { logger } from "./logger";
import { demoStore } from "./demo-store-instance";
import { analyzeDemoSignal, fetchDisplayPrice } from "./demo-worker-engine";

const TICK_MS = 30_000;

let started = false;
let running = false;

async function tick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const users = demoStore.getAutomationUsers();
    if (users.length === 0) return;
    for (const { user, automation } of users) {
      const symbol = automation.symbol || "BTCUSDT";
      const price = await fetchDisplayPrice(symbol);
      demoStore.updatePrices(user.id, { pair: symbol, price });

      const { signal } = await analyzeDemoSignal(symbol);
      if (signal.decision !== "SEM ENTRADA") {
        demoStore.openFromSignal(user.id, signal);
      }
    }
  } catch (err) {
    logger.warn({ err }, "Demo worker tick failed");
  } finally {
    running = false;
  }
}

export function startDemoWorker(): void {
  if (started) return;
  started = true;
  setInterval(() => void tick(), TICK_MS);
  void tick();
  logger.info({ intervalMs: TICK_MS }, "Demo worker started");
}
