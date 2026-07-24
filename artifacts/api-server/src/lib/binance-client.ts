const BINANCE_BASE = "https://api.binance.us/api/v3";
const BINANCE_TIMEOUT_MS = 8_000;

export class BinanceUpstreamError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function binanceFetch(path: string, timeoutMs = BINANCE_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${BINANCE_BASE}${path}`, { signal: controller.signal });
    if (!res.ok) {
      throw new BinanceUpstreamError(res.status, `Binance upstream error ${res.status}: ${res.statusText}`);
    }
    return res;
  } finally {
    clearTimeout(timeout);
  }
}

export async function checkBinanceHealth(): Promise<{ ok: boolean; latencyMs: number | null; error: string | null }> {
  const started = Date.now();
  try {
    await binanceFetch("/time", 4_000);
    return { ok: true, latencyMs: Date.now() - started, error: null };
  } catch (err) {
    return {
      ok: false,
      latencyMs: null,
      error: err instanceof Error ? err.message : "Unknown Binance health error",
    };
  }
}
