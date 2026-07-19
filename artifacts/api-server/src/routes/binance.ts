// Read-only Binance public market-data proxy.
// No API key required. Spot endpoints only — no futures, no orders.
import { Router, type IRouter } from "express";
import { binanceFetch } from "../lib/binance-client";

const router: IRouter = Router();

// GET /api/binance/price?symbol=BTCUSDT
router.get("/binance/price", async (req, res): Promise<void> => {
  const symbol = String(req.query.symbol ?? "BTCUSDT").toUpperCase();
  try {
    const upstream = await binanceFetch(`/ticker/price?symbol=${symbol}`);
    const data = await upstream.json();
    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Binance price fetch failed");
    res.status(502).json({ error: "Failed to fetch price from Binance" });
  }
});

// GET /api/binance/klines?symbol=BTCUSDT&interval=1h&limit=50
router.get("/binance/klines", async (req, res): Promise<void> => {
  const symbol   = String(req.query.symbol   ?? "BTCUSDT").toUpperCase();
  const interval = String(req.query.interval ?? "1h");
  const limit    = Math.min(Number(req.query.limit ?? 50), 500);

  // Allow only known safe intervals
  const allowed = ["1m","3m","5m","15m","30m","1h","2h","4h","6h","8h","12h","1d","3d","1w","1M"];
  if (!allowed.includes(interval)) {
    res.status(400).json({ error: "Invalid interval" });
    return;
  }

  try {
    const upstream = await binanceFetch(
      `/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
    );
    const data = await upstream.json();
    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Binance klines fetch failed");
    res.status(502).json({ error: "Failed to fetch klines from Binance" });
  }
});

export default router;
