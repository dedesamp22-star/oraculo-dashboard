import app from "./app";
import { logger } from "./lib/logger";
import { startDemoWorker } from "./lib/demo-worker";
import { demoStore } from "./lib/demo-store-instance";
import { PushDeliveryProcessor } from "./lib/push-delivery-processor";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);
const host = process.env["ORACULO_API_HOST"] ?? "0.0.0.0";
const pushDeliveryProcessor = new PushDeliveryProcessor({ store: demoStore, logger });

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen({ host, port }, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ host, port }, "Server listening");
  pushDeliveryProcessor.start();
  startDemoWorker();
});

function shutdownPushProcessor(): void {
  pushDeliveryProcessor.stop();
}

process.once("SIGTERM", shutdownPushProcessor);
process.once("SIGINT", shutdownPushProcessor);
