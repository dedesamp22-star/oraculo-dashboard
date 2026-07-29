import app from "./app";
import { logger } from "./lib/logger";
import { startDemoWorker, stopDemoWorker } from "./lib/demo-worker";
import { demoStore } from "./lib/demo-store-instance";
import { PushDeliveryProcessor } from "./lib/push-delivery-processor";
import type { Server } from "node:http";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);
const host = process.env["ORACULO_API_HOST"] ?? "0.0.0.0";
const pushDeliveryProcessor = new PushDeliveryProcessor({ store: demoStore, logger });
let server: Server | null = null;

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

server = app.listen({ host, port }, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ host, port }, "Server listening");
  pushDeliveryProcessor.start();
  startDemoWorker();
});

let shuttingDown = false;

function closeServer(): Promise<void> {
  if (!server) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server?.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function gracefulShutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Shutting down API server");
  try {
    stopDemoWorker();
    pushDeliveryProcessor.stop();
    await closeServer();
    process.exitCode = 0;
  } catch (err) {
    process.exitCode = 1;
    logger.error({ err, signal }, "Error during graceful shutdown");
  }
}

process.once("SIGTERM", () => void gracefulShutdown("SIGTERM"));
process.once("SIGINT", () => void gracefulShutdown("SIGINT"));
