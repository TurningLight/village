import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  buildGovernanceFacts,
  issueModelId,
  issueBelongsToModel,
  getCompletedAt,
  buildGovernanceEvidence,
} from '../shared/governanceFacts.mjs';
import {
  GOVERNANCE_PROMPT_VERSION,
  REPORT_PROMPT_VERSION,
  recordMessages,
  reportMessages,
  assistantMessages,
} from './governancePrompts.mjs';

const LEGACY_MODELS = ['qinghe-demo', '2b79987cd49c4727b1bd12aa7ab62927'];
const MAX_BODY = 48 * 1024;
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const clean = (value, max = 6000) =>
  typeof value === 'string'
    ? value
        .replace(/(?<!\d)1[3-9]\d{9}(?!\d)/g, '[电话已隐去]')
        .replace(/(?<!\d)\d{17}[\dXx](?!\d)/g, '[证件号已隐去]')
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[邮箱已隐去]')
        .trim()
        .slice(0, max)
    : '';
const fail = (status, code, message) => Object.assign(new Error(message), { status, code });
const stamp = (clock) => new Date(clock()).toISOString();
const monthOf = (date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date(date));
const shanghaiTime = (value) => {
  const time = Date.parse(value);
  return Number.isFinite(time)
    ? `${new Date(time + 8 * 60 * 60 * 1000).toISOString().slice(0, -1)}+08:00`
    : value;
};
const llmEvidence = (value) => ({
  ...value,
  createdAt: shanghaiTime(value.createdAt),
  completedAt: value.completedAt ? shanghaiTime(value.completedAt) : null,
  history: value.history.map((entry) => ({ ...entry, time: shanghaiTime(entry.time) })),
});
function statisticalBrief(facts, readyCount, selectedCount) {
  const { reportedInMonth, completedInMonth, pendingNow, processingNow, openNow } = facts.counts;
  const counts = { reportedInMonth, completedInMonth, pendingNow, processingNow, openNow };
  const generated = shanghaiTime(facts.generatedAt).slice(0, 19).replace('T', ' ');
  const categories = facts.categories.length
    ? `本月新上报类别：${facts.categories.map((row) => `${row.name}${row.count}件`).join('，')}。`
    : '本月暂无新上报类别统计。';
  const hotspots = facts.hotspots.slice(0, 20);
  const places = hotspots.length
    ? `本月新上报地点分布：${hotspots.map((row) => `${row.area}${row.count}件，其中当前未办结${row.open}件`).join('；')}。${facts.hotspots.length > hotspots.length ? `仅列上报量最高的${hotspots.length}个地点，完整分布请查看统计列表。` : ''}`
    : '本月暂无新上报地点分布。';
  const text = `${facts.month}月度统计：本月新上报${reportedInMonth}件，本月当前仍已办结${completedInMonth}件。截至北京时间${generated}，当前待处理${pendingNow}件、处理中${processingNow}件，当前未办结合计${openNow}件（待处理与处理中之和，含往月未办结事项）。当前处理中不代表跨月办理数量，以上统计不推断跨月件数或办结率。\n${categories}\n${places}\n本月有效工作留痕${readyCount}条，本次汇总使用${selectedCount}条。统计只覆盖平台已登记事项，上报集中不代表事故率或风险等级。`;
  return { counts, text, timeZone: 'Asia/Shanghai', categories: facts.categories, hotspots };
}
function validateMonthlyResult(result, brief) {
  if (!Object.entries(brief.counts).every(([key, value]) => result.statistics?.[key] === value))
    throw fail(502, 'INVALID_RESULT', '月报统计核对未通过，未保存本次模型结果，请重试。');
  const summary = clean(result.summary, 12000);
  if (
    /未办结|待处理|待办|尚未办结|仍在处理|正在处理|尚在处理|尚未完成|仍未完成|有待处理/.test(
      summary,
    )
  )
    throw fail(
      502,
      'INVALID_RESULT',
      '月报叙述混入了未经核对的待办状态，未保存本次模型结果，请重试。',
    );
  if (
    /[0-9零〇一二三四五六七八九十百千万两]+\s*(?:件|条|处|项)|[%％]|百分之|办结率|跨月|\b\d{1,2}:\d{2}\b/.test(
      summary,
    )
  )
    throw fail(
      502,
      'INVALID_RESULT',
      '月报叙述重复了未经核对的统计或时刻，未保存本次模型结果，请重试。',
    );
}
const modelValid = (value) => typeof value === 'string' && value.trim() && value.length <= 200;
const monthValid = (value) => typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
function scope(modelId, month) {
  if (!modelValid(modelId) || !monthValid(month))
    throw fail(400, 'INVALID_SCOPE', '请选择有效的村庄和月份。');
}

function completedSource(issue, modelId, nowTime) {
  if (issue.status !== 'completed' || !issueBelongsToModel(issue, modelId)) return null;
  const completedAt = getCompletedAt(issue);
  if (!completedAt || Date.parse(completedAt) > nowTime) return null;
  const cycle = hash({ completedAt });
  const evidence = buildGovernanceEvidence(issue);
  const sourceFingerprint = hash({
    version: GOVERNANCE_PROMPT_VERSION,
    evidence,
    // Material edits to omitted middle steps still invalidate a previous summary.
    history: issue.history.map(({ time, status, note }) => ({ time, status, note: clean(note) })),
    description: clean(issue.description),
  });
  return {
    id: `work-${hash([modelId, issue.id, cycle]).slice(0, 32)}`,
    modelId,
    issueId: issue.id,
    title: evidence.title,
    category: evidence.category,
    area: evidence.area,
    month: monthOf(completedAt),
    completedAt,
    sourceUpdatedAt: issue.updatedAt,
    sourceFingerprint,
    evidence,
  };
}
function parseResult(content) {
  try {
    const value = JSON.parse(content);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch {
    throw fail(502, 'INVALID_RESULT', '模型返回内容无法使用，请重试。');
  }
}
const filteredIds = (value, allowed) =>
  Array.isArray(value)
    ? [...new Set(value.filter((id) => typeof id === 'string' && allowed.has(id)))].slice(0, 100)
    : [];
const strings = (value, max = 8) =>
  Array.isArray(value)
    ? value
        .filter((v) => typeof v === 'string')
        .slice(0, max)
        .map((v) => clean(v, 600))
        .filter(Boolean)
    : [];

function boundedContext(facts, records) {
  const selected = [...records]
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
    .slice(0, 50);
  const limitations = [];
  if (records.length > selected.length)
    limitations.push(
      `本月共有 ${records.length} 条有效留痕，本次模型仅接收最近 ${selected.length} 条；总体统计仍覆盖全部事项，不能声称逐一审阅了其他留痕。`,
    );
  if (selected.some((r) => r.report.length > 1600))
    limitations.push('部分留痕正文超过1600字，本次仅提供前1600字；不得将截断内容补写为已发生。');
  if (facts.hotspots.length > 20 || facts.hotspots.some((h) => h.issueIds.length > 20))
    limitations.push(
      '本次模型仅接收上报量最高的20个地点，每个地点最多20个证据ID；总量统计未截断。',
    );
  return {
    facts: {
      ...facts,
      generatedAt: shanghaiTime(facts.generatedAt),
      evidence: facts.evidence.map(llmEvidence),
      hotspots: facts.hotspots
        .slice(0, 20)
        .map((h) => ({ ...h, issueIds: h.issueIds.slice(0, 20) })),
      limitations: [...facts.limitations, ...limitations],
    },
    records: selected.map((r) => ({
      issueId: r.issueId,
      title: r.title,
      category: r.category,
      area: r.area,
      status: 'completed',
      report: r.report.slice(0, 1600),
      completedAt: shanghaiTime(r.completedAt),
    })),
    sourceRecordIds: selected.map((r) => r.id),
    statisticalBrief: statisticalBrief(facts, records.length, selected.length),
    timeZone: 'Asia/Shanghai',
  };
}

export function createGovernanceService({
  file,
  readIssues,
  env = process.env,
  fetchImpl = fetch,
  now = Date.now,
} = {}) {
  let queue = Promise.resolve();
  let state;
  let worker = false;
  let scheduled = false;
  let active = 0;
  let closed = false;
  const controllers = new Set();
  const settings = () => ({
    key: (env.GOVERNANCE_API_KEY || env.DASHSCOPE_API_KEY || '').trim(),
    model: env.GOVERNANCE_MODEL || 'qwen-plus',
    base: (
      env.GOVERNANCE_BASE_URL ||
      env.DASHSCOPE_BASE_URL ||
      'https://dashscope.aliyuncs.com/compatible-mode/v1'
    ).replace(/\/$/, ''),
  });
  const config = () => ({
    enabled: !!settings().key,
    provider: '阿里云百炼',
    model: settings().model,
  });
  async function load() {
    if (state) return state;
    try {
      state = JSON.parse(await readFile(file, 'utf8'));
      if (state.version !== 1 || !Array.isArray(state.records) || !Array.isArray(state.monthly))
        throw new Error('Invalid governance store');
      for (const row of [...state.records, ...state.monthly]) {
        if (row.status === 'generating') row.status = 'pending';
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      state = { version: 1, records: [], monthly: [] };
    }
    return state;
  }
  async function persist() {
    await mkdir(dirname(file), { recursive: true, mode: 0o700 });
    const temp = `${file}.tmp`;
    await writeFile(temp, JSON.stringify(state), { mode: 0o600 });
    await rename(temp, file);
  }
  function transaction(operation) {
    const task = queue
      .catch(() => {})
      .then(async () => {
        await load();
        return operation();
      });
    queue = task.then(
      () => {},
      () => {},
    );
    return task;
  }
  function factsFor(issues, modelId, month) {
    return buildGovernanceFacts(issues, { modelId, month, now: new Date(now()) });
  }
  function monthlySource(issues, modelId, month) {
    const facts = factsFor(issues, modelId, month);
    const records = state.records.filter(
      (r) => r.modelId === modelId && r.month === month && !r.withdrawn && r.status === 'ready',
    );
    const { generatedAt: _generatedAt, ...stableFacts } = facts;
    const sourceFingerprint = hash({
      version: GOVERNANCE_PROMPT_VERSION,
      reportVersion: REPORT_PROMPT_VERSION,
      facts: stableFacts,
      completed: state.records
        .filter((r) => r.modelId === modelId && r.month === month)
        .map((r) => [r.id, r.sourceFingerprint, r.withdrawn]),
      records: records.map((r) => [r.id, r.report]),
    });
    const bounded = boundedContext(facts, records);
    return {
      sourceFingerprint,
      sourceRecordIds: bounded.sourceRecordIds,
      statisticalText: bounded.statisticalBrief.text,
      payload: {
        modelId,
        month,
        records: bounded.records,
        statisticalBrief: { counts: bounded.statisticalBrief.counts },
        generatedAt: bounded.facts.generatedAt,
        limitations: [
          '本次叙事仅覆盖所附已办结ready留痕；不包含任何未办结事项明细，不能推断单条事件的动态待办状态。',
          ...bounded.facts.limitations.filter(
            (text) => text.includes('本次模型') || text.includes('留痕正文'),
          ),
        ],
        timeZone: bounded.timeZone,
      },
    };
  }
  function invalidateReports(issues) {
    for (const report of state.monthly) {
      if (
        report.sourceFingerprint !==
        monthlySource(issues, report.modelId, report.month).sourceFingerprint
      )
        report.stale = true;
    }
  }
  function queueAutomaticMonthly(issues) {
    const groups = new Map();
    for (const record of state.records) {
      if (!record.withdrawn && record.status === 'ready')
        groups.set(JSON.stringify([record.modelId, record.month]), record);
    }
    for (const { modelId, month } of groups.values()) {
      // Batch all newly completed records before the one monthly model call.
      if (
        state.records.some(
          (r) =>
            r.modelId === modelId &&
            r.month === month &&
            !r.withdrawn &&
            ['pending', 'generating'].includes(r.status),
        )
      )
        continue;
      const source = monthlySource(issues, modelId, month);
      let report = state.monthly.find((r) => r.modelId === modelId && r.month === month);
      // A provider failure is retried only by a deliberate click or a material source change.
      if (report?.sourceFingerprint === source.sourceFingerprint) continue;
      if (!report) {
        report = {
          id: `month-${hash([modelId, month]).slice(0, 32)}`,
          modelId,
          month,
          report: '',
          generatedAt: null,
        };
        state.monthly.push(report);
      }
      Object.assign(report, {
        status: 'pending',
        error: '',
        sourceFingerprint: source.sourceFingerprint,
        sourceRecordIds: report.report ? report.sourceRecordIds : source.sourceRecordIds,
        stale: !!report.report,
        model: settings().model,
        updatedAt: stamp(now),
      });
    }
  }
  async function reconcile(current) {
    const result = await transaction(async () => {
      // Always reread inside the write queue: a request snapshot can already be obsolete.
      const issues = readIssues ? await readIssues() : current;
      const wanted = new Map();
      for (const issue of issues) {
        const model = issueModelId(issue);
        for (const modelId of model ? [model] : LEGACY_MODELS) {
          const source = completedSource(issue, modelId, now());
          if (source) wanted.set(source.id, source);
        }
      }
      const time = stamp(now);
      for (const record of state.records) {
        const source = wanted.get(record.id);
        if (!source) {
          if (!record.withdrawn) {
            record.withdrawn = true;
            record.updatedAt = time;
          }
        } else if (record.sourceFingerprint !== source.sourceFingerprint || record.withdrawn) {
          Object.assign(record, source, {
            withdrawn: false,
            status: 'pending',
            report: '',
            error: '',
            model: settings().model,
            generatedAt: null,
            updatedAt: time,
          });
        }
        wanted.delete(record.id);
      }
      for (const source of wanted.values()) {
        state.records.push({
          ...source,
          status: 'pending',
          withdrawn: false,
          report: '',
          error: '',
          model: settings().model,
          generatedAt: null,
          updatedAt: time,
        });
      }
      invalidateReports(issues);
      queueAutomaticMonthly(issues);
      await persist();
      return undefined;
    });
    kick();
    return result;
  }
  async function complete(messages, signal) {
    if (!settings().key)
      throw fail(503, 'NOT_CONFIGURED', '治理模型尚未配置，请联系管理员配置服务后重试。');
    if (active >= 2) throw fail(429, 'RATE_LIMIT', '治理模型正在处理其他任务，请稍后重试。');
    active++;
    const controller = new AbortController();
    controllers.add(controller);
    const s = settings();
    try {
      let response;
      try {
        response = await fetchImpl(`${s.base}/chat/completions`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${s.key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: s.model,
            enable_thinking: false,
            temperature: 0.2,
            response_format: { type: 'json_object' },
            stream: false,
            messages,
          }),
          signal: AbortSignal.any([
            controller.signal,
            ...(signal ? [signal] : []),
            AbortSignal.timeout(60000),
          ]),
        });
      } catch {
        if (signal?.aborted) throw fail(499, 'CANCELLED', '本次分析已取消。');
        throw fail(504, 'UPSTREAM_TIMEOUT', '治理模型连接超时，请稍后重试。');
      }
      if (!response.ok) {
        if ([401, 403].includes(response.status))
          throw fail(503, 'PROVIDER_AUTH', '治理模型配置暂不可用，请联系管理员检查后重试。');
        if (response.status === 429) throw fail(429, 'RATE_LIMIT', '治理模型繁忙，请稍后重试。');
        throw fail(502, 'PROVIDER_ERROR', '治理模型暂时没有响应，请稍后重试。');
      }
      let data;
      try {
        data = await response.json();
      } catch {
        throw fail(502, 'INVALID_RESULT', '模型返回内容无法使用，请重试。');
      }
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || content.length > 40000)
        throw fail(502, 'INVALID_RESULT', '模型返回内容无法使用，请重试。');
      return parseResult(content);
    } finally {
      active--;
      controllers.delete(controller);
      kick();
    }
  }
  function kick() {
    if (closed || scheduled || worker) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      if (!closed)
        void drain().catch(() => {
          /* The next reconcile retries local I/O; upstream errors are stored per task. */
        });
    });
  }
  async function drain() {
    if (worker || closed || active >= 2) return;
    worker = true;
    try {
      while (!closed && active < 2) {
        const task = await transaction(async () => {
          const record = state.records.find((r) => r.status === 'pending' && !r.withdrawn);
          const monthly = record ? null : state.monthly.find((r) => r.status === 'pending');
          const row = record || monthly;
          if (!row) return null;
          row.status = 'generating';
          row.model = settings().model;
          row.updatedAt = stamp(now);
          await persist();
          return { kind: record ? 'record' : 'monthly', row: structuredClone(row) };
        });
        if (!task) break;
        await generate(task);
      }
    } finally {
      worker = false;
    }
  }
  async function generate({ kind, row }) {
    let result, error;
    try {
      const issues = await readIssues();
      if (kind === 'record') {
        const issue = issues.find((i) => i.id === row.issueId);
        const fresh = issue && completedSource(issue, row.modelId, now());
        if (!fresh || fresh.id !== row.id || fresh.sourceFingerprint !== row.sourceFingerprint) {
          await reconcile(issues);
          return;
        }
        result = await complete(
          recordMessages({
            modelId: row.modelId,
            month: row.month,
            evidence: llmEvidence(fresh.evidence),
            timeZone: 'Asia/Shanghai',
            limitations: [
              '已按规则遮蔽已知身份信息及常见联系方式，自由文本不能保证完全匿名；描述最多600字，办理历史最多12条（最初2条和最近10条）、每条备注最多240字。完整流程需核对原始事件；不得将未提供的中间步骤补写为已发生。',
              '照片、责任人员、身份、签字等字段为隐私和最小化传输未提供；不能据此认定原记录没有照片、责任人员、验收或签字。',
            ],
          }),
        );
        if (!clean(result.summary, 4000))
          throw fail(502, 'INVALID_RESULT', '未生成有效的工作留痕，请重试。');
      } else {
        const source = monthlySource(issues, row.modelId, row.month);
        if (source.sourceFingerprint !== row.sourceFingerprint) {
          await transaction(async () => {
            const live = state.monthly.find((r) => r.id === row.id);
            if (live?.sourceFingerprint === row.sourceFingerprint) {
              live.stale = true;
              live.status = live.report ? 'ready' : 'error';
              live.error = '源记录已经变化，请更新月度总结。';
              await persist();
            }
          });
          return;
        }
        result = await complete(reportMessages(source.payload));
        if (!clean(result.summary, 12000))
          throw fail(502, 'INVALID_RESULT', '未生成有效的月度总结，请重试。');
        validateMonthlyResult(result, source.payload.statisticalBrief);
      }
    } catch (caught) {
      error = caught.status ? caught.message : '治理任务暂时无法完成，请稍后重试。';
    }
    if (closed) return;
    await transaction(async () => {
      const live = (kind === 'record' ? state.records : state.monthly).find((r) => r.id === row.id);
      if (!live || live.sourceFingerprint !== row.sourceFingerprint || live.status !== 'generating')
        return;
      const issues = await readIssues();
      if (kind === 'record') {
        const issue = issues.find((i) => i.id === row.issueId);
        const current = issue && completedSource(issue, row.modelId, now());
        if (
          !current ||
          current.id !== row.id ||
          current.sourceFingerprint !== row.sourceFingerprint ||
          live.withdrawn
        ) {
          live.withdrawn = !current || current.id !== row.id;
          live.status = 'error';
          live.error = '源事项已重新办理或内容已变化，本次生成结果已作废。';
          live.updatedAt = stamp(now);
          invalidateReports(issues);
          await persist();
          return;
        }
      } else if (
        monthlySource(issues, row.modelId, row.month).sourceFingerprint !== row.sourceFingerprint
      ) {
        live.stale = true;
        live.status = live.report ? 'ready' : 'error';
        live.error = '源记录已经变化，本次生成结果已作废，请更新月度总结。';
        live.updatedAt = stamp(now);
        await persist();
        return;
      }
      live.status = error ? 'error' : 'ready';
      live.error = error || '';
      live.report = error
        ? live.report
        : kind === 'record'
          ? clean(result.summary, 4000)
          : `${monthlySource(issues, row.modelId, row.month).statisticalText}\n\n${clean(result.summary, 12000)}`;
      live.generatedAt = error ? live.generatedAt : stamp(now);
      live.updatedAt = stamp(now);
      if (kind === 'monthly' && !error) {
        live.sourceRecordIds = monthlySource(issues, row.modelId, row.month).sourceRecordIds;
        live.stale = false;
      }
      invalidateReports(issues);
      if (kind === 'record') queueAutomaticMonthly(issues);
      await persist();
    });
  }
  async function overview(modelId, month) {
    scope(modelId, month);
    const issues = await readIssues();
    await reconcile(issues);
    return transaction(() =>
      structuredClone({
        config: config(),
        modelId,
        month,
        records: state.records
          .filter((r) => r.modelId === modelId && r.month === month)
          .sort((a, b) => b.completedAt.localeCompare(a.completedAt)),
        monthly: state.monthly.find((r) => r.modelId === modelId && r.month === month) || null,
        facts: factsFor(issues, modelId, month),
      }),
    );
  }
  async function retry(id) {
    if (typeof id !== 'string' || !/^work-[a-f0-9]{32}$/.test(id))
      throw fail(400, 'INVALID_RECORD', '请选择有效的留痕记录。');
    await reconcile();
    const record = await transaction(async () => {
      const row = state.records.find((r) => r.id === id);
      if (!row) throw fail(404, 'NOT_FOUND', '留痕记录不存在。');
      if (row.withdrawn) throw fail(409, 'WITHDRAWN', '事项已重新办理，原留痕已撤回。');
      if (row.status === 'error') {
        row.status = 'pending';
        row.error = '';
        row.updatedAt = stamp(now);
        await persist();
      }
      return structuredClone(row);
    });
    kick();
    return record;
  }
  async function monthly(modelId, month) {
    scope(modelId, month);
    const issues = await readIssues();
    await reconcile(issues);
    const report = await transaction(async () => {
      const source = monthlySource(issues, modelId, month);
      if (!source.sourceRecordIds.length)
        throw fail(409, 'NO_READY_RECORDS', '本月还没有可用的办结留痕，请先完成留痕生成后再汇总。');
      let row = state.monthly.find((r) => r.modelId === modelId && r.month === month);
      if (
        row &&
        row.sourceFingerprint === source.sourceFingerprint &&
        (['pending', 'generating'].includes(row.status) || (row.status === 'ready' && !row.stale))
      )
        return structuredClone(row);
      if (!row) {
        row = {
          id: `month-${hash([modelId, month]).slice(0, 32)}`,
          modelId,
          month,
          report: '',
          generatedAt: null,
        };
        state.monthly.push(row);
      }
      Object.assign(row, {
        status: 'pending',
        error: '',
        sourceFingerprint: source.sourceFingerprint,
        sourceRecordIds: row.report ? row.sourceRecordIds : source.sourceRecordIds,
        stale: !!row.report,
        model: settings().model,
        updatedAt: stamp(now),
      });
      await persist();
      return structuredClone(row);
    });
    kick();
    return report;
  }
  async function chat({ modelId, month, question, history = [] }, signal) {
    scope(modelId, month);
    if (
      typeof question !== 'string' ||
      !question.trim() ||
      question.length > 2000 ||
      !Array.isArray(history) ||
      history.length > 8 ||
      history.some(
        (h) =>
          !h ||
          !['user', 'assistant'].includes(h.role) ||
          typeof h.content !== 'string' ||
          h.content.length > 3000,
      )
    )
      throw fail(400, 'INVALID_QUESTION', '请填写 2000 字以内的问题，或开启新一轮分析。');
    const issues = await readIssues();
    await reconcile(issues);
    const source = await transaction(() => {
      const facts = factsFor(issues, modelId, month);
      const records = state.records.filter(
        (r) => r.modelId === modelId && r.month === month && r.status === 'ready' && !r.withdrawn,
      );
      const bounded = boundedContext(facts, records);
      return {
        facts: bounded.facts,
        records: bounded.records,
        statisticalBrief: bounded.statisticalBrief,
        timeZone: bounded.timeZone,
      };
    });
    const result = await complete(
      assistantMessages(
        source,
        clean(question, 2000),
        history.map((h) => ({ role: h.role, content: clean(h.content, 3000) })),
      ),
      signal,
    );
    const answer = clean(result.answer, 10000);
    if (!answer) throw fail(502, 'INVALID_RESULT', '未生成有效的分析回答，请重试。');
    const allowed = new Set([
      ...source.facts.evidence.map((e) => e.id),
      ...source.records.map((r) => r.issueId),
      ...source.facts.hotspots.flatMap((h) => h.issueIds),
    ]);
    const suggestions = Array.isArray(result.suggestions)
      ? result.suggestions
          .slice(0, 8)
          .filter((s) => s && typeof s === 'object')
          .map((s) => ({
            title: clean(s.title, 120),
            action: clean(s.action || s.detail, 2000),
            evidenceIds: filteredIds(s.evidenceIds, allowed),
          }))
          .filter((s) => s.title && s.action)
      : [];
    return {
      answer,
      evidenceIds: filteredIds(result.evidenceIds, allowed),
      suggestions,
      limitations: [...new Set([...source.facts.limitations, ...strings(result.limitations)])],
      model: settings().model,
      generatedAt: stamp(now),
    };
  }
  return {
    config,
    reconcile,
    overview,
    retry,
    monthly,
    chat,
    async idle() {
      for (let i = 0; i < 500; i++) {
        await queue;
        if (!worker && !scheduled) return;
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      throw new Error('Governance worker did not become idle');
    },
    close() {
      closed = true;
      for (const controller of controllers) controller.abort();
    },
  };
}

export function createGovernanceMiddleware(service) {
  const clients = new Map();
  const send = (res, status, value) => {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(JSON.stringify(value));
  };
  return async (req, res, next = () => {}) => {
    const path = (req.url || '').split('?')[0];
    if (path !== '/api/governance' && !path.startsWith('/api/governance/')) return next();
    const abort = new AbortController();
    const cancel = () => {
      if (!res.writableEnded) abort.abort();
    };
    req.on('aborted', cancel);
    res.on('close', cancel);
    try {
      if (req.method === 'GET') {
        if (path === '/api/governance/config') return send(res, 200, service.config());
        if (path === '/api/governance') {
          const query = new URL(req.url, 'http://local').searchParams;
          return send(res, 200, await service.overview(query.get('modelId'), query.get('month')));
        }
      }
      const retry = /^\/api\/governance\/records\/(work-[a-f0-9]{32})\/retry$/.exec(path);
      if (
        req.method !== 'POST' ||
        (!retry && !['/api/governance/monthly', '/api/governance/chat'].includes(path))
      )
        throw fail(404, 'NOT_FOUND', '治理接口不存在。');
      if (req.headers.origin) {
        let origin;
        try {
          origin = new URL(req.headers.origin).host;
        } catch {
          /* Denied below. */
        }
        if (origin !== req.headers.host) throw fail(403, 'ORIGIN', '请求来源无效。');
      }
      if (!String(req.headers['content-type'] || '').startsWith('application/json'))
        throw fail(415, 'CONTENT_TYPE', '请使用 JSON 请求格式。');
      const time = Date.now();
      for (const [key, row] of clients) if (time - row.start > 60000) clients.delete(key);
      const ip = req.socket.remoteAddress || 'local';
      const client = clients.get(ip) || { start: time, count: 0 };
      client.count++;
      clients.set(ip, client);
      if (client.count > 30) throw fail(429, 'RATE_LIMIT', '操作有些频繁，请稍后再试。');
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_BODY) throw fail(413, 'TOO_LARGE', '治理请求内容过大，请缩短问题后重试。');
        chunks.push(chunk);
      }
      let body;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        throw fail(400, 'INVALID_INPUT', '请求内容无效。');
      }
      if (!body || typeof body !== 'object' || Array.isArray(body))
        throw fail(400, 'INVALID_INPUT', '请求内容无效。');
      if (retry) return send(res, 202, { record: await service.retry(retry[1]) });
      if (path.endsWith('/monthly'))
        return send(res, 202, { monthly: await service.monthly(body.modelId, body.month) });
      return send(res, 200, await service.chat(body, abort.signal));
    } catch (error) {
      if (!res.writableEnded && !res.destroyed)
        send(res, error.status || 500, {
          error: {
            code: error.code || 'INTERNAL',
            message: error.status ? error.message : '智慧治理服务暂不可用，请稍后重试。',
          },
        });
    } finally {
      req.off('aborted', cancel);
      res.off('close', cancel);
    }
  };
}
