export type ApiFailureKind = 'USER_OFFLINE' | 'API_UNAVAILABLE' | 'BINANCE_UNAVAILABLE' | 'SERVER_TIMEOUT' | 'HTTP_ERROR';

export class ApiClientError extends Error {
  constructor(
    public kind: ApiFailureKind,
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_RETRIES = 2;

function apiUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function online(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

function abortError(): ApiClientError {
  return new ApiClientError('SERVER_TIMEOUT', 'Requisicao cancelada.');
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

function linkAbortSignals(controller: AbortController, signal?: AbortSignal | null): () => void {
  if (!signal) return () => undefined;
  if (signal.aborted) {
    controller.abort();
    return () => undefined;
  }
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  return () => signal.removeEventListener('abort', abort);
}

function messageForStatus(path: string, status: number): ApiClientError {
  if (path.startsWith('/api/binance') && status === 502) {
    return new ApiClientError('BINANCE_UNAVAILABLE', 'Binance indisponivel no momento. O servidor esta online, mas a Binance nao respondeu.', status);
  }
  if (status >= 500) {
    return new ApiClientError('API_UNAVAILABLE', `API do Oraculo indisponivel ou instavel (${status}).`, status);
  }
  return new ApiClientError('HTTP_ERROR', `Requisicao recusada pela API do Oraculo (${status}).`, status);
}

export async function apiFetch(path: string, init: RequestInit = {}, options: { timeoutMs?: number; retries?: number } = {}): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = options.retries ?? DEFAULT_RETRIES;
  const externalSignal = init.signal;
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const unlinkAbort = linkAbortSignals(controller, externalSignal);
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    try {
      const { signal: _ignoredSignal, ...requestInit } = init;
      const res = await fetch(apiUrl(path), {
        ...requestInit,
        signal: controller.signal,
      });
      if (!res.ok) throw messageForStatus(path, res.status);
      return res;
    } catch (err) {
      lastError = err;
      if (externalSignal?.aborted) throw abortError();
      if (isAbortError(err) && !timedOut) throw abortError();
      if (err instanceof ApiClientError && err.kind === 'HTTP_ERROR') throw err;
      if (attempt < retries) await delay(500 * 2 ** attempt);
    } finally {
      window.clearTimeout(timeout);
      unlinkAbort();
    }
  }

  if (!online()) throw new ApiClientError('USER_OFFLINE', 'Sua internet parece estar offline. Verifique a conexao do dispositivo.');
  if (isAbortError(lastError)) {
    throw new ApiClientError('SERVER_TIMEOUT', 'Tempo esgotado ao consultar o servidor do Oraculo.');
  }
  if (lastError instanceof ApiClientError) throw lastError;
  throw new ApiClientError('API_UNAVAILABLE', 'Servidor/VPS indisponivel ou sem resposta no momento.');
}

export async function apiJson<T>(path: string, init: RequestInit = {}, options?: { timeoutMs?: number; retries?: number }): Promise<T> {
  const res = await apiFetch(path, init, options);
  return await res.json() as T;
}
