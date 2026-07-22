import { useCallback, useEffect, useState } from 'react';
import { apiJson } from '../lib/apiClient';

export interface ApiHealth {
  status: 'ok' | 'degraded';
  api: {
    ok: boolean;
    uptimeSec: number;
    startedAt?: string;
    pid?: number;
    nodeVersion?: string;
    memory: Record<string, number>;
    cpuUsage?: Record<string, number>;
    responseLatencyMs?: number;
  };
  binance: {
    ok: boolean;
    latencyMs: number | null;
    error: string | null;
  };
  system?: {
    platform: string;
    arch: string;
    cpus: number;
    loadAverage: number[];
    totalMemory: number;
    freeMemory: number;
    uptimeSec: number;
  };
  worker?: {
    active: boolean;
    automationUsers: number;
    diagnosticsStored: number;
    lastCycleAt: string | null;
    lastSymbol: string | null;
    lastDecision: string | null;
    lastDirection: string | null;
    lastScore: number | null;
    lastStatus: string;
    lastLatencyMs: number | null;
    lastCycleDurationMs: number | null;
    nextCycleAt: string | null;
    lastError: string | null;
    engineVersion: string;
  };
  sqlite?: {
    databaseBytes: number;
    walBytes: number;
    shmBytes: number;
    journalMode: string;
    pageCount: number;
    pageSize: number;
    freelistCount: number;
    integrity: 'ok' | 'error';
    integrityError: string | null;
  };
  sessions?: {
    active: number;
    expired: number;
    revoked: number;
  };
  notifications?: {
    stored: number;
    unread: number;
    pushSubscriptions: number;
    deliveries: number;
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

export function useApiHealth(enabled = true): ApiHealthState {
  const [state, setState] = useState<ApiHealthState>({
    health: null,
    loading: true,
    error: null,
    lastUpdate: null,
  });

  const refresh = useCallback(async () => {
    if (!enabled) return;
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
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setState({
        health: null,
        loading: false,
        error: null,
        lastUpdate: null,
      });
      return;
    }
    refresh();
    const id = window.setInterval(refresh, POLL_MS);
    return () => window.clearInterval(id);
  }, [enabled, refresh]);

  return state;
}
