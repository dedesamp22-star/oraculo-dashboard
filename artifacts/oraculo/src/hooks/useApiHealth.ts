import { useCallback, useEffect, useState } from 'react';
import { apiJson } from '../lib/apiClient';

export interface ApiHealth {
  status: 'ok' | 'degraded';
  api: {
    ok: boolean;
    uptimeSec: number;
    memory: Record<string, number>;
  };
  binance: {
    ok: boolean;
    latencyMs: number | null;
    error: string | null;
  };
  generatedAt: string;
}

interface ApiHealthState {
  health: ApiHealth | null;
  loading: boolean;
  error: string | null;
  lastUpdate: Date | null;
}

const POLL_MS = 30_000;

export function useApiHealth(): ApiHealthState {
  const [state, setState] = useState<ApiHealthState>({
    health: null,
    loading: true,
    error: null,
    lastUpdate: null,
  });

  const refresh = useCallback(async () => {
    try {
      const health = await apiJson<ApiHealth>('/api/health', {}, { timeoutMs: 5_000, retries: 1 });
      setState({ health, loading: false, error: null, lastUpdate: new Date() });
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Falha ao consultar saude da API.',
        lastUpdate: new Date(),
      }));
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, POLL_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  return state;
}
