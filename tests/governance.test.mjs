import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGovernanceService } from '../server/governance.mjs';
import { createApiServer } from '../server/api.mjs';
import { GOVERNANCE_PROMPT_VERSION, REPORT_PROMPT_VERSION } from '../server/governancePrompts.mjs';

const NOW = Date.parse('2026-11-05T00:00:00Z');
const makeIssue = (id = 'lamp', modelId = 'real-a', completed = '2026-10-31T16:30:00Z') => ({
  id,
  title: '桥头路灯不亮',
  description: '桥头路灯连续两晚不亮，联系电话13812345678、a@example.com。',
  category: '设施故障',
  severity: 'medium',
  status: 'completed',
  area: '东侧桥头',
  reporter: '居民甲',
  residentId: 'private-resident',
  createdAt: '2026-10-30T00:00:00Z',
  updatedAt: completed,
  location: { local: { x: 70, y: 0, z: 5 }, geo: { lng: 120.5, lat: 30.5 } },
  sceneAnchor: { modelId, position: [70, 0, 5] },
  images: ['data:image/jpeg;base64,/9j/'],
  history: [
    { time: '2026-10-30T00:00:00Z', status: 'pending', operator: '居民甲', note: '问题已上报' },
    {
      time: '2026-10-31T00:00:00Z',
      status: 'processing',
      operator: '工作人员乙',
      note: '已安排检查',
    },
    { time: completed, status: 'completed', operator: '工作人员乙', note: '更换灯泡，恢复照明。' },
  ],
});
const result = (value) => ({
  ok: true,
  json: async () => ({ choices: [{ message: { content: JSON.stringify(value) } }] }),
});
const responseFor = (body) =>
  body.messages[0].content.includes('月度工作总结')
    ? result({
        title: '月度总结',
        summary: '本月已完成路灯维修，统计仅覆盖登记事项。',
        statistics: JSON.parse(body.messages[1].content).source.statisticalBrief.counts,
        evidenceIds: ['lamp'],
        limitations: [],
      })
    : result({
        summary: '接到桥头路灯故障上报后，安排检查并更换灯泡，记录显示已恢复照明。',
        evidenceIds: ['lamp'],
        limitations: [],
      });
async function setup(
  t,
  { initial = [makeIssue()], env = { DASHSCOPE_API_KEY: 'test-key' }, fetchImpl, file } = {},
) {
  const directory = file ? null : await mkdtemp(join(tmpdir(), 'governance-test-'));
  let rows = initial;
  const calls = [];
  const service = createGovernanceService({
    file: file || join(directory, 'governance.json'),
    readIssues: async () => structuredClone(rows),
    env,
    now: () => NOW,
    fetchImpl:
      fetchImpl ||
      (async (_url, options) => {
        const body = JSON.parse(options.body);
        calls.push(body);
        return responseFor(body);
      }),
  });
  t.after(async () => {
    service.close();
    if (directory) await rm(directory, { recursive: true, force: true });
  });
  return {
    service,
    calls,
    file: file || join(directory, 'governance.json'),
    get rows() {
      return rows;
    },
    set rows(value) {
      rows = value;
    },
  };
}
async function until(predicate) {
  for (let i = 0; i < 300; i++) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail('condition did not become true');
}

test('completion is durable, idempotent and scoped to Shanghai closing month; monthly summary forms automatically', async (t) => {
  const { service, calls, file } = await setup(t);
  await service.reconcile();
  await service.idle();
  const overview = await service.overview('real-a', '2026-11');
  assert.equal(overview.records.length, 1);
  assert.equal(overview.records[0].status, 'ready');
  assert.equal(overview.records[0].month, '2026-11');
  assert.equal(overview.monthly.status, 'ready');
  assert.deepEqual(overview.monthly.sourceRecordIds, [overview.records[0].id]);
  assert.equal((await service.overview('real-a', '2026-10')).records.length, 0);
  assert.equal((await service.overview('real-b', '2026-11')).records.length, 0);
  await service.reconcile();
  await service.idle();
  assert.equal(calls.length, 2);
  assert.equal(JSON.parse(await readFile(file, 'utf8')).records.length, 1);
  const context = JSON.stringify(calls);
  for (const privateValue of [
    '13812345678',
    'a@example.com',
    '居民甲',
    '工作人员乙',
    'private-resident',
    '120.5',
    'data:image',
    'sceneAnchor',
  ])
    assert.equal(context.includes(privateValue), false, privateValue);
  const persisted = await readFile(file, 'utf8');
  assert.equal(persisted.includes('reporter'), false);
  assert.equal(persisted.includes('operator'), false);
});

test('model context uses explicit Beijing times, authoritative Chinese statistical brief and privacy omission rules', async (t) => {
  const initial = [makeIssue('closed-1'), makeIssue('closed-2')];
  for (let index = 0; index < 4; index++) {
    const row = makeIssue(`pending-${index}`);
    row.status = 'pending';
    row.history = row.history.slice(0, 1);
    initial.push(row);
  }
  for (let index = 0; index < 2; index++) {
    const row = makeIssue(`processing-${index}`);
    row.status = 'processing';
    row.history = row.history.slice(0, 2);
    initial.push(row);
  }
  for (const row of initial) {
    row.createdAt = '2026-10-31T16:00:00Z';
    row.history[0].time = row.createdAt;
    if (row.history[1]) row.history[1].time = '2026-10-31T16:10:00Z';
    row.area = ['closed-1', 'closed-2', 'pending-0'].includes(row.id) ? '中部' : '桥头';
  }
  const fixture = await setup(t, { initial });
  await fixture.service.reconcile();
  await fixture.service.idle();
  const recordCall = fixture.calls.find(
    (body) => !body.messages[0].content.includes('月度工作总结'),
  );
  const recordSource = JSON.parse(recordCall.messages[1].content).source;
  assert.equal(recordSource.evidence.completedAt, '2026-11-01T00:30:00.000+08:00');
  assert.equal(recordSource.evidence.createdAt, '2026-11-01T00:00:00.000+08:00');
  assert.ok(recordSource.evidence.history.every((entry) => entry.time.endsWith('+08:00')));
  assert.match(recordCall.messages[0].content, /Asia\/Shanghai/);
  assert.match(recordCall.messages[0].content, /不意味着现实记录中不存在/);
  assert.match(recordCall.messages[0].content, /只代表上报者人工标记/);
  assert.match(recordSource.limitations.join(''), /不能保证完全匿名/);
  assert.match(recordSource.limitations.join(''), /最小化传输未提供/);
  const monthCall = fixture.calls.find((body) => body.messages[0].content.includes('月度工作总结'));
  const monthSource = JSON.parse(monthCall.messages[1].content).source;
  assert.deepEqual(monthSource.statisticalBrief.counts, {
    reportedInMonth: 8,
    completedInMonth: 2,
    pendingNow: 4,
    processingNow: 2,
    openNow: 6,
  });
  assert.equal(monthSource.generatedAt.endsWith('+08:00'), true);
  assert.ok(monthSource.records.every((record) => record.completedAt.endsWith('+08:00')));
  assert.ok(monthSource.records.every((record) => record.status === 'completed'));
  assert.ok(monthSource.records.every((record) => record.title && record.area && record.category));
  assert.deepEqual(monthSource.records.map((record) => record.issueId).sort(), [
    'closed-1',
    'closed-2',
  ]);
  assert.equal('facts' in monthSource, false);
  assert.equal('hotspots' in monthSource.statisticalBrief, false);
  assert.equal(JSON.stringify(monthSource).includes('pending-0'), false);
  assert.equal(JSON.stringify(monthSource).includes('processing-0'), false);
  assert.match(monthCall.messages[0].content, /不叙述任何待办、未办结、处理中事项/);
  const overview = await fixture.service.overview('real-a', '2026-11');
  assert.equal(overview.monthly.status, 'ready');
  assert.match(overview.monthly.report, /^2026-11月度统计/);
  assert.match(overview.monthly.report, /当前待处理4件、处理中2件，当前未办结合计6件/);
  assert.match(overview.monthly.report, /当前处理中不代表跨月办理数量/);
  assert.match(overview.monthly.report, /中部3件，其中当前未办结1件/);
  assert.equal(overview.records[0].completedAt, '2026-10-31T16:30:00.000Z');
});

test('monthly statistics echo and narrative guard reject conflicting aggregates instead of persisting false success', async (t) => {
  let malformed = true;
  const fixture = await setup(t, {
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      if (!body.messages[0].content.includes('月度工作总结')) return responseFor(body);
      const counts = JSON.parse(body.messages[1].content).source.statisticalBrief.counts;
      return result({
        summary: malformed ? '已办结四件。' : '已依据登记流程完成照明维修，建议后续核查照明状态。',
        statistics: counts,
      });
    },
  });
  await fixture.service.reconcile();
  await fixture.service.idle();
  let overview = await fixture.service.overview('real-a', '2026-11');
  assert.equal(overview.monthly.status, 'error');
  assert.equal(overview.monthly.report, '');
  assert.match(overview.monthly.error, /统计或时刻/);
  malformed = false;
  await fixture.service.monthly('real-a', '2026-11');
  await fixture.service.idle();
  overview = await fixture.service.overview('real-a', '2026-11');
  assert.equal(overview.monthly.status, 'ready');
  assert.equal(overview.monthly.report.includes('未办结四件'), false);
  const wrongEcho = await setup(t, {
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      if (!body.messages[0].content.includes('月度工作总结')) return responseFor(body);
      const counts = JSON.parse(body.messages[1].content).source.statisticalBrief.counts;
      return result({ summary: '已完成照明维修。', statistics: { ...counts, pendingNow: 123 } });
    },
  });
  await wrongEcho.service.reconcile();
  await wrongEcho.service.idle();
  const wrong = await wrongEcho.service.overview('real-a', '2026-11');
  assert.equal(wrong.monthly.status, 'error');
  assert.match(wrong.monthly.error, /统计核对未通过/);
});

test('monthly narrative cannot reclassify a completed record as unfinished, and older report remains stale with its original references during regeneration', async (t) => {
  const guarded = await setup(t, {
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      if (!body.messages[0].content.includes('月度工作总结')) return responseFor(body);
      const source = JSON.parse(body.messages[1].content).source;
      return result({
        summary: '桥头路灯维修已进入流程，但尚未办结。',
        statistics: source.statisticalBrief.counts,
      });
    },
  });
  await guarded.service.reconcile();
  await guarded.service.idle();
  const rejected = await guarded.service.overview('real-a', '2026-11');
  assert.equal(rejected.records[0].status, 'ready');
  assert.equal(rejected.monthly.status, 'error');
  assert.equal(rejected.monthly.report, '');
  assert.match(rejected.monthly.error, /待办状态/);

  let monthlyCalls = 0,
    releaseNew;
  const fixture = await setup(t, {
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      if (body.messages[0].content.includes('月度工作总结')) {
        monthlyCalls++;
        if (monthlyCalls === 2)
          return new Promise((resolve) => {
            releaseNew = () => resolve(responseFor(body));
          });
      }
      return responseFor(body);
    },
  });
  await fixture.service.reconcile();
  await fixture.service.idle();
  const old = (await fixture.service.overview('real-a', '2026-11')).monthly;
  fixture.rows = [...fixture.rows, makeIssue('new-closed')];
  await fixture.service.reconcile();
  await until(() => !!releaseNew);
  const during = (await fixture.service.overview('real-a', '2026-11')).monthly;
  assert.equal(during.status, 'generating');
  assert.equal(during.stale, true);
  assert.equal(during.report, old.report);
  assert.deepEqual(during.sourceRecordIds, old.sourceRecordIds);
  const reused = await fixture.service.monthly('real-a', '2026-11');
  assert.equal(reused.status, 'generating');
  assert.equal(reused.stale, true);
  assert.deepEqual(reused.sourceRecordIds, old.sourceRecordIds);
  assert.equal(monthlyCalls, 2);
  releaseNew();
  await fixture.service.idle();
  const ready = (await fixture.service.overview('real-a', '2026-11')).monthly;
  assert.equal(ready.status, 'ready');
  assert.equal(ready.stale, false);
  assert.equal(ready.sourceRecordIds.length, 2);
  assert.notEqual(ready.report, old.report);
  assert.match(ready.report, /本月当前仍已办结2件/);
});

test('monthly prompt migrations regenerate only the summary while ready individual work records retain their fingerprints', async (t) => {
  assert.equal(GOVERNANCE_PROMPT_VERSION, '2026-10-22.2');
  assert.equal(REPORT_PROMPT_VERSION, '2026-10-22.monthly.3');
  const fixture = await setup(t);
  await fixture.service.reconcile();
  await fixture.service.idle();
  fixture.service.close();
  const saved = JSON.parse(await readFile(fixture.file, 'utf8'));
  const workFingerprint = saved.records[0].sourceFingerprint;
  const workReport = saved.records[0].report;
  saved.monthly[0].sourceFingerprint = 'old-monthly-prompt-fingerprint';
  await writeFile(fixture.file, JSON.stringify(saved));
  const migrated = await setup(t, { file: fixture.file });
  await migrated.service.reconcile();
  await migrated.service.idle();
  const overview = await migrated.service.overview('real-a', '2026-11');
  assert.equal(overview.records[0].sourceFingerprint, workFingerprint);
  assert.equal(overview.records[0].report, workReport);
  assert.equal(overview.monthly.status, 'ready');
  assert.equal(overview.monthly.stale, false);
  assert.equal(migrated.calls.length, 1);
  assert.match(migrated.calls[0].messages[0].content, /月度工作总结/);
});

test('same-cycle completion notes regenerate the same record, reopen withdraws it and closes into a new cycle', async (t) => {
  const fixture = await setup(t);
  await fixture.service.reconcile();
  await fixture.service.idle();
  const first = (await fixture.service.overview('real-a', '2026-11')).records[0];
  fixture.rows[0].history.push({
    time: '2026-11-02T00:00:00Z',
    status: 'completed',
    operator: '工作人员乙',
    note: '补充确认通电正常。',
  });
  fixture.rows[0].updatedAt = '2026-11-02T00:00:00Z';
  await fixture.service.reconcile();
  await fixture.service.idle();
  const amended = (await fixture.service.overview('real-a', '2026-11')).records;
  assert.equal(amended.length, 1);
  assert.equal(amended[0].id, first.id);
  assert.equal(amended[0].completedAt, first.completedAt);
  assert.notEqual(amended[0].sourceFingerprint, first.sourceFingerprint);
  fixture.rows[0].status = 'processing';
  fixture.rows[0].history.push({
    time: '2026-11-03T00:00:00Z',
    status: 'processing',
    operator: '工作人员乙',
    note: '再次闪烁，重新办理。',
  });
  await fixture.service.reconcile();
  await fixture.service.idle();
  const reopened = await fixture.service.overview('real-a', '2026-11');
  assert.equal(reopened.records[0].withdrawn, true);
  assert.equal(reopened.monthly.stale, true);
  await assert.rejects(() => fixture.service.retry(first.id), { code: 'WITHDRAWN' });
  fixture.rows[0].status = 'completed';
  fixture.rows[0].history.push({
    time: '2026-11-04T00:00:00Z',
    status: 'completed',
    operator: '工作人员乙',
    note: '排查接线并修复。',
  });
  await fixture.service.reconcile();
  await fixture.service.idle();
  const closed = await fixture.service.overview('real-a', '2026-11');
  assert.equal(closed.records.length, 2);
  assert.equal(closed.records.filter((r) => !r.withdrawn).length, 1);
  assert.notEqual(closed.records.find((r) => !r.withdrawn).id, first.id);
});

test('missing key and provider failure are honest persisted errors without retry loops; explicit retry succeeds', async (t) => {
  const env = {};
  const fixture = await setup(t, { env });
  await fixture.service.reconcile();
  await fixture.service.idle();
  let overview = await fixture.service.overview('real-a', '2026-11');
  assert.equal(overview.config.enabled, false);
  assert.equal(overview.records[0].status, 'error');
  assert.match(overview.records[0].error, /尚未配置/);
  assert.equal(overview.monthly, null);
  await assert.rejects(() => fixture.service.monthly('real-a', '2026-11'), {
    code: 'NO_READY_RECORDS',
  });
  await fixture.service.reconcile();
  await fixture.service.idle();
  assert.equal(fixture.calls.length, 0);
  env.GOVERNANCE_API_KEY = 'new-test-key';
  await fixture.service.retry(overview.records[0].id);
  await fixture.service.idle();
  overview = await fixture.service.overview('real-a', '2026-11');
  assert.equal(overview.records[0].status, 'ready');
  assert.equal(overview.monthly.status, 'ready');
  const broken = await setup(t, {
    fetchImpl: async () => ({ ok: false, status: 401, text: async () => 'secret-upstream' }),
  });
  await broken.service.reconcile();
  await broken.service.idle();
  const record = (await broken.service.overview('real-a', '2026-11')).records[0];
  assert.equal(record.status, 'error');
  assert.equal(record.error.includes('secret-upstream'), false);
});

test('an in-flight record result cannot overwrite reopened or edited authoritative events', async (t) => {
  let resolveFetch;
  const fixture = await setup(t, {
    fetchImpl: async () =>
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
  });
  await fixture.service.reconcile();
  await until(() => !!resolveFetch);
  fixture.rows[0].status = 'processing';
  fixture.rows[0].history.push({
    time: '2026-11-03T00:00:00Z',
    status: 'processing',
    operator: '工作人员乙',
    note: '重开',
  });
  await fixture.service.reconcile();
  resolveFetch(result({ summary: '不应保存的旧结果' }));
  await fixture.service.idle();
  const overview = await fixture.service.overview('real-a', '2026-11');
  assert.equal(overview.records[0].withdrawn, true);
  assert.equal(overview.records[0].report, '');
  assert.equal(overview.monthly, null);
});

test('in-flight monthly source change preserves old content as stale and never writes a late obsolete result', async (t) => {
  let releaseMonthly;
  const fixture = await setup(t, {
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      if (body.messages[0].content.includes('月度工作总结'))
        return new Promise((resolve) => {
          releaseMonthly = resolve;
        });
      return responseFor(body);
    },
  });
  await fixture.service.reconcile();
  await until(() => !!releaseMonthly);
  fixture.rows[0].status = 'processing';
  fixture.rows[0].history.push({
    time: '2026-11-03T00:00:00Z',
    status: 'processing',
    operator: '工作人员乙',
    note: '重开',
  });
  await fixture.service.reconcile();
  releaseMonthly(result({ summary: '不应保存的旧月报' }));
  await fixture.service.idle();
  const overview = await fixture.service.overview('real-a', '2026-11');
  assert.equal(overview.monthly.stale, true);
  assert.equal(overview.monthly.report, '');
  assert.equal(overview.monthly.status, 'error');
});

test('a material edit during generation invalidates the late answer and regenerates the same record from fresh content', async (t) => {
  let releaseFirst;
  let recordCalls = 0;
  const fixture = await setup(t, {
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      if (body.messages[0].content.includes('月度工作总结')) return responseFor(body);
      recordCalls++;
      if (recordCalls === 1)
        return new Promise((resolve) => {
          releaseFirst = resolve;
        });
      assert.match(body.messages[1].content, /已检查灯座后恢复照明/);
      return result({ summary: '已检查灯座后恢复照明。' });
    },
  });
  await fixture.service.reconcile();
  await until(() => !!releaseFirst);
  const id = (await fixture.service.overview('real-a', '2026-11')).records[0].id;
  fixture.rows[0].history.at(-1).note = '已检查灯座后恢复照明。';
  await fixture.service.reconcile();
  releaseFirst(result({ summary: '过期旧结果：已采购全新设备。' }));
  await fixture.service.idle();
  const records = (await fixture.service.overview('real-a', '2026-11')).records;
  assert.equal(records.length, 1);
  assert.equal(records[0].id, id);
  assert.equal(records[0].report, '已检查灯座后恢复照明。');
  assert.equal(recordCalls, 2);
});

test('several closures form one monthly batch and legacy unanchored data is never copied into arbitrary real models', async (t) => {
  const legacy = makeIssue('legacy');
  delete legacy.sceneAnchor;
  const fixture = await setup(t, {
    initial: [makeIssue('one'), makeIssue('two'), makeIssue('other', 'real-b'), legacy],
  });
  await fixture.service.reconcile();
  await fixture.service.idle();
  const real = await fixture.service.overview('real-a', '2026-11');
  assert.deepEqual(real.records.map((r) => r.issueId).sort(), ['one', 'two']);
  assert.equal(real.monthly.sourceRecordIds.length, 2);
  const monthCalls = fixture.calls.filter((c) => c.messages[0].content.includes('月度工作总结'));
  assert.equal(monthCalls.length, 4); // real-a, real-b and two explicit legacy-compatible scopes.
  assert.deepEqual(
    (await fixture.service.overview('qinghe-demo', '2026-11')).records.map((r) => r.issueId),
    ['legacy'],
  );
  assert.equal((await fixture.service.overview('arbitrary-village', '2026-11')).records.length, 0);
});

test('global model concurrency is bounded and JSON provider output never leaks through unparsed', async (t) => {
  const pending = [];
  const fixture = await setup(t, {
    initial: [],
    fetchImpl: async () => new Promise((resolve) => pending.push(resolve)),
  });
  const input = { modelId: 'real-a', month: '2026-11', question: '分析' };
  const first = fixture.service.chat(input),
    second = fixture.service.chat(input);
  await until(() => pending.length === 2);
  await assert.rejects(() => fixture.service.chat(input), { code: 'RATE_LIMIT' });
  for (const resolve of pending)
    resolve(
      result({
        answer: '尚无登记数据，无法判断多发点。',
        evidenceIds: ['fake'],
        suggestions: [],
        limitations: ['无样本'],
      }),
    );
  const answers = await Promise.all([first, second]);
  assert.deepEqual(answers[0].evidenceIds, []);
  assert.deepEqual(answers[1].evidenceIds, []);
});

test('restart resumes persisted generating tasks once and retained ready reports incur no extra model calls', async (t) => {
  const first = await setup(t);
  await first.service.reconcile();
  await first.service.idle();
  first.service.close();
  const saved = JSON.parse(await readFile(first.file, 'utf8'));
  saved.records[0].status = 'generating';
  saved.records[0].report = '';
  saved.monthly = [];
  await writeFile(first.file, JSON.stringify(saved));
  const restarted = await setup(t, { file: first.file });
  await restarted.service.reconcile();
  await restarted.service.idle();
  const overview = await restarted.service.overview('real-a', '2026-11');
  assert.equal(overview.records[0].status, 'ready');
  assert.equal(overview.monthly.status, 'ready');
  assert.equal(restarted.calls.length, 2);
  await restarted.service.reconcile();
  await restarted.service.idle();
  assert.equal(restarted.calls.length, 2);
});

test('missing and future completion history never invent a closing timestamp or generate a work record', async (t) => {
  const noHistory = makeIssue('missing');
  noHistory.history = [];
  const future = makeIssue('future', 'real-a', '2027-01-01T00:00:00Z');
  const fixture = await setup(t, { initial: [noHistory, future] });
  await fixture.service.reconcile();
  await fixture.service.idle();
  const overview = await fixture.service.overview('real-a', '2026-11');
  assert.equal(overview.records.length, 0);
  assert.equal(fixture.calls.length, 0);
  assert.equal(overview.facts.counts.completedInMonth, 0);
  assert.ok(overview.facts.limitations.some((s) => s.includes('可信办结时间')));
});

test('assistant uses authoritative scoped context, strips untrusted facts and validates JSON/evidence IDs', async (t) => {
  const captured = [];
  const fixture = await setup(t, {
    initial: [makeIssue('lamp', 'real-a'), makeIssue('foreign', 'real-b')],
    fetchImpl: async (_url, options) => {
      captured.push(JSON.parse(options.body));
      return result({
        answer: '桥头设施故障记录需现场核查。',
        evidenceIds: ['lamp', 'foreign', 'fake', 'lamp'],
        suggestions: [
          { title: '巡检', action: '核查桥头照明。', evidenceIds: ['lamp', 'foreign'] },
        ],
        limitations: ['样本不足'],
      });
    },
  });
  // Keep events open so the test isolates the interactive request from the worker.
  fixture.rows = fixture.rows.map((row) => ({
    ...row,
    status: 'processing',
    history: row.history.slice(0, 2),
  }));
  const answer = await fixture.service.chat({
    modelId: 'real-a',
    month: '2026-10',
    question: '哪些地点上报集中？',
    facts: { total: 9999 },
  });
  assert.deepEqual(answer.evidenceIds, ['lamp']);
  assert.deepEqual(answer.suggestions[0].evidenceIds, ['lamp']);
  const context = JSON.stringify(captured[0]);
  assert.equal(context.includes('foreign'), false);
  assert.equal(context.includes('9999'), false);
  assert.match(captured[0].messages[0].content, /不可信业务数据/);
  await assert.rejects(
    () => fixture.service.chat({ modelId: 'real-a', month: '2026-10', question: 'x'.repeat(2001) }),
    { code: 'INVALID_QUESTION' },
  );
  await assert.rejects(
    () => fixture.service.chat({ modelId: 'real-a', month: 'bad', question: '问题' }),
    { code: 'INVALID_SCOPE' },
  );
  const malformed = await setup(t, {
    initial: [],
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'not JSON' } }] }),
    }),
  });
  await assert.rejects(
    () => malformed.service.chat({ modelId: 'real-a', month: '2026-10', question: '分析' }),
    { code: 'INVALID_RESULT' },
  );
});

test('API validates origin/body and recovers governance from event completion without opening the terminal', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'governance-api-'));
  const file = join(directory, 'issues.json');
  let calls = 0;
  const server = createApiServer({
    env: { GOVERNANCE_API_KEY: 'test-key' },
    file,
    fetchImpl: async (_url, options) => {
      calls++;
      return responseFor(JSON.parse(options.body));
    },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body, headers = {}) =>
    fetch(base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  const issue = makeIssue('api-lamp', 'real-a', '2026-10-21T00:00:00Z');
  issue.createdAt = '2026-10-19T00:00:00Z';
  issue.history[0].time = issue.createdAt;
  issue.history[1].time = '2026-10-20T00:00:00Z';
  const save = await post('/api/issues', { issues: [issue] });
  assert.equal(save.status, 200);
  await until(async () => {
    try {
      return (
        JSON.parse(await readFile(join(directory, 'governance.json'), 'utf8')).records[0]
          ?.status === 'ready'
      );
    } catch {
      return false;
    }
  });
  assert.ok(calls >= 1);
  assert.equal(
    (
      await post(
        '/api/governance/chat',
        { modelId: 'real-a', month: '2026-10', question: '分析' },
        { Origin: 'https://evil.example' },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await post(
        '/api/governance/chat',
        { modelId: 'real-a', month: '2026-10', question: '分析' },
        { Origin: 'invalid' },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await post('/api/governance/chat', {
        modelId: 'real-a',
        month: '2026-10',
        question: 'x'.repeat(50000),
      })
    ).status,
    413,
  );
  const config = await (await fetch(base + '/api/governance/config')).json();
  assert.equal(config.enabled, true);
  assert.equal(JSON.stringify(config).includes('test-key'), false);
  const invalid = await fetch(base + '/api/governance/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{broken',
  });
  assert.equal(invalid.status, 400);
});
