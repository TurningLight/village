import type {
  GovernanceAnswer,
  GovernanceOverview,
  MonthlyReport,
  WorkRecord,
} from '../types/governance';

export class GovernanceServiceError extends Error {
  code: string;
  constructor(message: string, code = 'GOVERNANCE_UNAVAILABLE') {
    super(message);
    this.name = 'GovernanceServiceError';
    this.code = code;
  }
}

async function request<T>(path: string, options: RequestInit = {}, signal?: AbortSignal) {
  const timeout = AbortSignal.timeout(90000);
  try {
    const response = await fetch(path, {
      ...options,
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    let value: unknown;
    try {
      value = await response.json();
    } catch {
      throw new GovernanceServiceError('治理服务返回内容不完整，请刷新重试。');
    }
    if (!response.ok) {
      const failure = value as { error?: { code?: string; message?: string } };
      throw new GovernanceServiceError(
        failure?.error?.message || '本次操作未完成，请稍后重试。',
        failure?.error?.code,
      );
    }
    return value as T;
  } catch (error) {
    if (signal?.aborted) throw error;
    if (error instanceof GovernanceServiceError) throw error;
    if (timeout.aborted)
      throw new GovernanceServiceError('模型响应超时，请稍后重试。', 'GOVERNANCE_TIMEOUT');
    throw new GovernanceServiceError('无法连接治理服务，请确认电脑 API 服务正在运行。');
  }
}

const jsonPost = (value: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(value),
});

const strings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'string');
const statuses = new Set(['pending', 'generating', 'ready', 'error']);
function validRecord(value: WorkRecord) {
  return (
    !!value &&
    typeof value.id === 'string' &&
    typeof value.modelId === 'string' &&
    typeof value.month === 'string' &&
    typeof value.issueId === 'string' &&
    typeof value.title === 'string' &&
    typeof value.report === 'string' &&
    statuses.has(value.status) &&
    !!value.evidence &&
    typeof value.evidence.description === 'string' &&
    Array.isArray(value.evidence.history) &&
    value.evidence.history.every(
      (entry) =>
        typeof entry.time === 'string' &&
        typeof entry.note === 'string' &&
        typeof entry.status === 'string',
    )
  );
}
function validMonthly(value: MonthlyReport) {
  return (
    !!value &&
    typeof value.modelId === 'string' &&
    typeof value.month === 'string' &&
    typeof value.report === 'string' &&
    statuses.has(value.status) &&
    strings(value.sourceRecordIds)
  );
}

export async function readGovernanceOverview(modelId: string, month: string, signal?: AbortSignal) {
  const query = new URLSearchParams({ modelId, month });
  const result = await request<GovernanceOverview>(`/api/governance?${query}`, {}, signal);
  if (
    !result ||
    result.modelId !== modelId ||
    result.month !== month ||
    !Array.isArray(result.records) ||
    !result.records.every(
      (record) => validRecord(record) && record.modelId === modelId && record.month === month,
    ) ||
    result.facts?.modelId !== modelId ||
    result.facts?.month !== month ||
    !result.facts?.counts ||
    !Array.isArray(result.facts.categories) ||
    !Array.isArray(result.facts.hotspots) ||
    !Array.isArray(result.facts.evidence) ||
    !Array.isArray(result.facts.limitations) ||
    (result.monthly !== null &&
      (!validMonthly(result.monthly) ||
        result.monthly.modelId !== modelId ||
        result.monthly.month !== month)) ||
    !result.config ||
    typeof result.config.enabled !== 'boolean'
  )
    throw new GovernanceServiceError('当前村庄的治理数据不完整，请刷新重试。');
  return result;
}

export async function retryWorkRecord(id: string, signal?: AbortSignal) {
  const result = await request<{ record: WorkRecord }>(
    `/api/governance/records/${encodeURIComponent(id)}/retry`,
    jsonPost({}),
    signal,
  );
  if (!validRecord(result?.record) || result.record.id !== id)
    throw new GovernanceServiceError('留痕任务返回内容不完整，请刷新查看。');
  return result.record;
}

export async function generateMonthlyReport(modelId: string, month: string, signal?: AbortSignal) {
  const result = await request<{ monthly: MonthlyReport }>(
    '/api/governance/monthly',
    jsonPost({ modelId, month }),
    signal,
  );
  if (
    !validMonthly(result?.monthly) ||
    result.monthly.modelId !== modelId ||
    result.monthly.month !== month
  )
    throw new GovernanceServiceError('月报任务返回内容不完整，请刷新查看。');
  return result.monthly;
}

export interface GovernanceChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function askGovernanceAssistant(
  modelId: string,
  month: string,
  question: string,
  history: GovernanceChatMessage[],
  signal?: AbortSignal,
) {
  const result = await request<GovernanceAnswer>(
    '/api/governance/chat',
    jsonPost({
      modelId,
      month,
      question,
      history: history
        .slice(-8)
        .map(({ role, content }) => ({ role, content: content.slice(0, 3000) })),
    }),
    signal,
  );
  if (
    !result ||
    typeof result.answer !== 'string' ||
    !strings(result.evidenceIds) ||
    !Array.isArray(result.suggestions) ||
    !result.suggestions.every(
      (suggestion) =>
        !!suggestion &&
        typeof suggestion.title === 'string' &&
        typeof suggestion.action === 'string' &&
        strings(suggestion.evidenceIds),
    ) ||
    !strings(result.limitations)
  )
    throw new GovernanceServiceError('助手回复不完整，请重新提问。');
  return result;
}
