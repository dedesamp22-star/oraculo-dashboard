import { Activity, AlertTriangle, Cpu, Database, Gauge, HardDrive, Server, Users } from 'lucide-react';

import type { ApiHealth } from '../hooks/useApiHealth';

function bytes(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return '--';
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(2)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${value} B`;
}

function seconds(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return '--';
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function time(value: string | null | undefined): string {
  if (!value) return '--';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '--';
  return date.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function pct(part: number | null | undefined, total: number | null | undefined): string {
  if (typeof part !== 'number' || typeof total !== 'number' || !Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return '--';
  return `${((part / total) * 100).toFixed(1)}%`;
}

function Metric({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'ok' | 'warn' | 'bad' | 'neutral' }) {
  const color = {
    ok: 'text-[#00ff66]',
    warn: 'text-[#ffaa00]',
    bad: 'text-[#ff4444]',
    neutral: 'text-foreground',
  }[tone];
  return (
    <div className="min-w-0 border border-border/50 bg-background/20 px-3 py-2">
      <span className="block truncate text-[9px] font-mono uppercase tracking-[0.16em] text-muted-foreground">{label}</span>
      <span className={`mt-1 block truncate text-xs font-mono font-bold tabular-nums ${color}`}>{value}</span>
    </div>
  );
}

export function ObservabilityPanel({ health, loading, error }: { health: ApiHealth | null; loading: boolean; error: string | null }) {
  const memoryUsed = health?.api.memory.rss;
  const memoryFree = health?.system?.freeMemory;
  const memoryTotal = health?.system?.totalMemory;
  const sqliteOk = health?.sqlite?.integrity === 'ok';
  const workerOk = health?.worker?.active && !health.worker.lastError;
  const load = health?.system?.loadAverage?.[0];

  return (
    <section className="bg-card/50 backdrop-blur-md border border-border relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
      <div className="p-4 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Gauge className="w-4 h-4 text-primary flex-shrink-0" />
            <div className="min-w-0">
              <h2 className="text-xs font-mono font-bold uppercase tracking-[0.2em]">Observabilidade</h2>
              <p className="text-[9px] font-mono text-muted-foreground uppercase tracking-[0.12em]">Saude da API, worker e SQLite</p>
            </div>
          </div>
          <span className={`text-[9px] font-mono font-bold uppercase tracking-[0.14em] ${error ? 'text-[#ff4444]' : health?.status === 'ok' ? 'text-[#00ff66]' : 'text-[#ffaa00]'}`}>
            {error ? 'offline' : loading ? 'checando' : health?.status ?? '--'}
          </span>
        </div>

        {error && (
          <div className="flex items-start gap-2 border border-[#ff4444]/40 bg-[#ff4444]/10 p-3 text-xs font-mono text-[#ffaaaa]">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Metric label="API uptime" value={seconds(health?.api.uptimeSec)} tone={health?.api.ok ? 'ok' : 'bad'} />
          <Metric label="Latencia health" value={health?.api.responseLatencyMs == null ? '--' : `${health.api.responseLatencyMs}ms`} tone="neutral" />
          <Metric label="Binance" value={health?.binance.ok ? `${health.binance.latencyMs ?? 0}ms` : 'degradada'} tone={health?.binance.ok ? 'ok' : 'warn'} />
          <Metric label="Worker" value={workerOk ? 'ativo' : health?.worker?.lastError ? 'erro' : 'aguardando'} tone={workerOk ? 'ok' : health?.worker?.lastError ? 'bad' : 'warn'} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <div className="border border-border/50 bg-background/20 p-3">
            <p className="flex items-center gap-2 text-[9px] font-mono uppercase tracking-[0.16em] text-muted-foreground">
              <Server className="w-3.5 h-3.5 text-primary" /> Sistema
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Metric label="RAM processo" value={bytes(memoryUsed)} />
              <Metric label="RAM livre" value={`${bytes(memoryFree)} / ${bytes(memoryTotal)}`} tone={memoryTotal && memoryFree && memoryFree / memoryTotal < 0.15 ? 'warn' : 'ok'} />
              <Metric label="RAM livre %" value={pct(memoryFree, memoryTotal)} />
              <Metric label="Load 1m" value={typeof load === 'number' && Number.isFinite(load) ? load.toFixed(2) : '--'} />
              <Metric label="CPU cores" value={String(health?.system?.cpus ?? '--')} />
              <Metric label="Node" value={health?.api.nodeVersion ?? '--'} />
            </div>
          </div>

          <div className="border border-border/50 bg-background/20 p-3">
            <p className="flex items-center gap-2 text-[9px] font-mono uppercase tracking-[0.16em] text-muted-foreground">
              <Database className="w-3.5 h-3.5 text-primary" /> SQLite / WAL
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Metric label="Integridade" value={health?.sqlite?.integrity ?? '--'} tone={sqliteOk ? 'ok' : 'bad'} />
              <Metric label="Journal" value={health?.sqlite?.journalMode ?? '--'} />
              <Metric label="Banco" value={bytes(health?.sqlite?.databaseBytes)} />
              <Metric label="WAL" value={bytes(health?.sqlite?.walBytes)} />
              <Metric label="Paginas" value={String(health?.sqlite?.pageCount ?? '--')} />
              <Metric label="Freelist" value={String(health?.sqlite?.freelistCount ?? '--')} />
            </div>
          </div>

          <div className="border border-border/50 bg-background/20 p-3">
            <p className="flex items-center gap-2 text-[9px] font-mono uppercase tracking-[0.16em] text-muted-foreground">
              <Users className="w-3.5 h-3.5 text-primary" /> Sessoes e alertas
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Metric label="Sessoes ativas" value={String(health?.sessions?.active ?? '--')} />
              <Metric label="Sessoes expiradas" value={String(health?.sessions?.expired ?? '--')} />
              <Metric label="Alertas" value={String(health?.notifications?.stored ?? '--')} />
              <Metric label="Nao lidos" value={String(health?.notifications?.unread ?? '--')} tone={(health?.notifications?.unread ?? 0) > 0 ? 'warn' : 'ok'} />
              <Metric label="Push subs" value={String(health?.notifications?.pushSubscriptions ?? '--')} />
              <Metric label="Entregas" value={String(health?.notifications?.deliveries ?? '--')} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Metric label="Ultimo ciclo" value={time(health?.worker?.lastCycleAt)} />
          <Metric label="Ultimo simbolo" value={health?.worker?.lastSymbol ?? '--'} />
          <Metric label="Ultima decisao" value={health?.worker?.lastDecision ?? '--'} />
          <Metric label="Score" value={health?.worker?.lastScore == null ? '--' : String(health.worker.lastScore)} />
          <Metric label="Duracao ciclo" value={health?.worker?.lastCycleDurationMs == null ? '--' : `${health.worker.lastCycleDurationMs}ms`} />
          <Metric label="Latencia worker" value={health?.worker?.lastLatencyMs == null ? '--' : `${health.worker.lastLatencyMs}ms`} />
          <Metric label="Proximo ciclo" value={time(health?.worker?.nextCycleAt)} />
          <Metric label="Motor" value={health?.worker?.engineVersion ?? '--'} />
        </div>

        {health?.worker?.lastError && (
          <p className="border border-[#ff4444]/35 bg-[#ff4444]/10 p-3 text-[11px] font-mono text-[#ffaaaa]">
            Ultimo erro do worker: {health.worker.lastError}
          </p>
        )}
        {health?.sqlite?.integrityError && (
          <p className="border border-[#ff4444]/35 bg-[#ff4444]/10 p-3 text-[11px] font-mono text-[#ffaaaa]">
            SQLite: {health.sqlite.integrityError}
          </p>
        )}

        <p className="flex items-center gap-2 text-[9px] font-mono uppercase tracking-[0.14em] text-muted-foreground">
          <Cpu className="w-3 h-3" />
          Gerado em {time(health?.generatedAt)}
          <HardDrive className="w-3 h-3 ml-2" />
          Leitura administrativa sem dados privados sensiveis
        </p>
      </div>
    </section>
  );
}
