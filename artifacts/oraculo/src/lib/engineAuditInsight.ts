import type { EngineAuditEntry, EngineAuditFilterRecord } from './demoApi';

export type EngineAuditBlockCategory =
  | 'operational-risk'
  | 'global-risk'
  | 'position-limit'
  | 'other'
  | null;

export interface EngineAuditInsight {
  confirmed: string[];
  pending: string[];
  decisiveReason: string;
  stageLabel: string;
  progressPct: number;
  summary: string;
  blockCategory?: EngineAuditBlockCategory;
}

type PartialAuditEntry = Partial<Omit<EngineAuditEntry, 'filtersBlocked'>> & {
  filtersBlocked?: Array<Partial<EngineAuditFilterRecord> | string | null | undefined> | null;
};

const NEUTRAL_REASON = 'Sem dados suficientes para interpretar este registro.';

function normalizeText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function uniqueStrings(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const text = normalizeText(value);
    if (!text) continue;
    const key = text.toLocaleLowerCase('pt-BR');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(text);
  }
  return result;
}

function uniqueFilterRecords(values: unknown): EngineAuditFilterRecord[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const result: EngineAuditFilterRecord[] = [];
  for (const value of values) {
    let name: string | null = null;
    let reason: string | null = null;
    let penalty: number | null | undefined;
    if (typeof value === 'string') {
      name = normalizeText(value);
      reason = name;
    } else if (value && typeof value === 'object') {
      const record = value as Partial<EngineAuditFilterRecord>;
      name = normalizeText(record.name);
      reason = normalizeText(record.reason) ?? name;
      penalty = typeof record.penalty === 'number' && Number.isFinite(record.penalty) ? record.penalty : null;
    }
    if (!name) continue;
    const key = name.toLocaleLowerCase('pt-BR');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ name, reason: reason ?? name, penalty });
  }
  return result;
}

function classifyBlock(entry: {
  decisionState: string;
  decisiveReason: string | null;
  blockedReasons: string[];
  pending: string[];
}): EngineAuditBlockCategory {
  if (entry.decisionState !== 'BLOQUEADO_RISCO') return null;
  const haystack = [entry.decisiveReason, ...entry.blockedReasons, ...entry.pending]
    .filter((value): value is string => Boolean(value))
    .join(' ')
    .toLocaleLowerCase('pt-BR');
  if (haystack.includes('posicoes simultaneas') || haystack.includes('posições simultâneas') || haystack.includes('3 posicoes') || haystack.includes('3 posições')) {
    return 'position-limit';
  }
  if (haystack.includes('global') || haystack.includes('2%')) return 'global-risk';
  if (haystack.includes('risco') || haystack.includes('stop') || haystack.includes('r/r') || haystack.includes('risk')) return 'operational-risk';
  return 'other';
}

function stageLabel(decisionState: string, blockCategory: EngineAuditBlockCategory): string {
  if (decisionState === 'ENTRADA_APROVADA') return 'Entrada aprovada';
  if (decisionState === 'SETUP_QUASE_PRONTO') return 'Setup quase pronto';
  if (decisionState === 'CONTEXTO_FORMANDO') return 'Contexto formando';
  if (decisionState === 'SEM_SETUP') return 'Sem setup';
  if (decisionState === 'BLOQUEADO_RISCO') {
    if (blockCategory === 'global-risk') return 'Bloqueado pelo risco global';
    if (blockCategory === 'position-limit') return 'Limite de posicoes atingido';
    if (blockCategory === 'operational-risk') return 'Bloqueado por risco operacional';
    return 'Bloqueado por risco';
  }
  if (decisionState === 'ERRO') return 'Erro';
  return 'Indefinido';
}

function chooseDecisiveReason(input: {
  decisionState: string;
  blockCategory: EngineAuditBlockCategory;
  decisiveReason: string | null;
  blockedReasons: string[];
  pending: string[];
}): string {
  if (input.blockCategory === 'global-risk') return 'Limite global de risco atingido.';
  if (input.blockCategory === 'position-limit') return 'Limite de posicoes simultaneas atingido.';
  if (input.blockCategory === 'operational-risk' && input.decisiveReason) return input.decisiveReason;
  if (input.decisiveReason) return input.decisiveReason;
  if (input.blockedReasons.length > 0) return input.blockedReasons[0];
  if (input.pending.length > 0) return input.pending[0];
  return stageLabel(input.decisionState, input.blockCategory) || NEUTRAL_REASON;
}

function plural(count: number, singular: string, pluralText: string): string {
  return count === 1 ? singular : pluralText;
}

function compactList(items: string[], maxItems = 3): string {
  const visible = items.slice(0, maxItems);
  const suffix = items.length > maxItems ? ` e mais ${items.length - maxItems}` : '';
  return `${visible.join(', ')}${suffix}`;
}

function buildSummary(params: {
  confirmed: string[];
  pending: string[];
  decisiveReason: string;
  decisionState: string;
  progressPct: number;
}): string {
  const confirmedText = `${params.confirmed.length} ${plural(params.confirmed.length, 'condicao confirmada', 'condicoes confirmadas')}`;
  if (params.pending.length > 0) {
    const pendingText = `${params.pending.length} ${plural(params.pending.length, 'condicao pendente', 'condicoes pendentes')}: ${compactList(params.pending)}.`;
    const inconsistentApproved = params.decisionState === 'ENTRADA_APROVADA'
      ? ' Registro aprovado com pendencias registradas; revisar consistencia da origem.'
      : '';
    return `${confirmedText}. Restam ${pendingText}${inconsistentApproved}`;
  }
  if (params.confirmed.length > 0) {
    return params.decisionState === 'ENTRADA_APROVADA'
      ? `${confirmedText}. Sem pendencias registradas.`
      : `${confirmedText}. Nenhuma pendencia registrada neste registro.`;
  }
  if (params.decisiveReason && params.decisiveReason !== NEUTRAL_REASON) {
    return `Sem condicoes confirmadas ou pendentes registradas. Motivo: ${params.decisiveReason}`;
  }
  return NEUTRAL_REASON;
}

export function buildEngineAuditInsight(entry: PartialAuditEntry | null | undefined): EngineAuditInsight {
  if (!entry) {
    return {
      confirmed: [],
      pending: [],
      decisiveReason: NEUTRAL_REASON,
      stageLabel: 'Indefinido',
      progressPct: 0,
      summary: NEUTRAL_REASON,
      blockCategory: null,
    };
  }

  const confirmed = uniqueStrings(entry.filtersPassed);
  const missingConditions = uniqueStrings(entry.missingConditions);
  const filtersBlocked = uniqueFilterRecords(entry.filtersBlocked);
  const pending = missingConditions.length > 0 ? missingConditions : filtersBlocked.map((item) => item.reason || item.name);
  const blockedReasons = uniqueStrings(entry.blockedReasons);
  const decisionState = normalizeText(entry.decisionState) ?? '';
  const rawDecisiveReason = normalizeText(entry.decisiveReason);
  const total = confirmed.length + pending.length;
  const progressPct = total === 0 ? 0 : Math.round((confirmed.length / total) * 100);
  const blockCategory = classifyBlock({ decisionState, decisiveReason: rawDecisiveReason, blockedReasons, pending });
  const label = stageLabel(decisionState, blockCategory);
  const decisiveReason = chooseDecisiveReason({
    decisionState,
    blockCategory,
    decisiveReason: rawDecisiveReason,
    blockedReasons,
    pending,
  });

  return {
    confirmed,
    pending,
    decisiveReason,
    stageLabel: label,
    progressPct,
    summary: buildSummary({ confirmed, pending, decisiveReason, decisionState, progressPct }),
    blockCategory,
  };
}
