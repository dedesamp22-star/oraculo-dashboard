import { useCallback, useEffect, useState } from 'react';
import { apiJson } from '../lib/apiClient';
import type { OracleVisualState } from '@shared/oracleVisualState';

interface OracleGlobalStateResponse {
  state: OracleVisualState;
  updatedAt: string;
}

interface OracleGlobalState {
  state: OracleVisualState;
  updatedAt: string | null;
  loading: boolean;
  error: string | null;
}

const POLL_MS = 10_000;

function isOracleVisualState(value: string | null): value is OracleVisualState {
  return value === 'waiting' || value === 'analyzing' || value === 'buy' || value === 'sell';
}

function readDevOverride(): OracleVisualState | null {
  if (!import.meta.env.DEV || typeof window === 'undefined') return null;
  const value = new URLSearchParams(window.location.search).get('globalOracleState');
  return isOracleVisualState(value) ? value : null;
}

export function useOracleGlobalState(enabled = true): OracleGlobalState {
  const [state, setState] = useState<OracleGlobalState>({
    state: 'waiting',
    updatedAt: null,
    loading: true,
    error: null,
  });

  const refresh = useCallback(async () => {
    if (!enabled) return;
    const devOverride = readDevOverride();
    if (devOverride) {
      setState({ state: devOverride, updatedAt: new Date().toISOString(), loading: false, error: null });
      return;
    }
    try {
      const next = await apiJson<OracleGlobalStateResponse>('/api/oracle/state', {}, { timeoutMs: 4_000, retries: 1 });
      setState({ state: next.state, updatedAt: next.updatedAt, loading: false, error: null });
    } catch (err) {
      setState({
        state: 'waiting',
        updatedAt: null,
        loading: false,
        error: err instanceof Error ? err.message : 'Estado global indisponivel.',
      });
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setState({ state: 'waiting', updatedAt: null, loading: false, error: null });
      return;
    }
    refresh();
    const id = window.setInterval(refresh, POLL_MS);
    return () => window.clearInterval(id);
  }, [enabled, refresh]);

  return state;
}
