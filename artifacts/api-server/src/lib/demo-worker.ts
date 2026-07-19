import { logger } from "./logger";
import { demoStore } from "./demo-store-instance";
import { analyzeLegacyDemoSignal, fetchDisplayPrice } from "./demo-worker-engine";

const TICK_MS = 30_000;

let started = false;
let running = false;

async function tick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const automation = demoStore.getAutomation();
    if (!automation.enabled) return;
    const symbol = automation.symbol || "BTCUSDT";
    const price = await fetchDisplayPrice(symbol);
    demoStore.updatePrices({ pair: symbol, price });

    const { signal } = await analyzeLegacyDemoSignal(symbol);
    if (signal.decision !== "SEM ENTRADA") {
      demoStore.openFromSignal(signal);
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
