import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';

const source = (path) =>
  ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
const plain = (value) => JSON.parse(JSON.stringify(value));
const overview = (modelId = 'A', month = '2026-10') => ({
  config: { enabled: true, provider: '阿里云百炼', model: 'qwen-plus' },
  modelId,
  month,
  records: [],
  monthly: null,
  facts: {
    modelId,
    month,
    counts: {},
    categories: [],
    hotspots: [],
    evidence: [],
    limitations: [],
  },
});
const answer = {
  answer: '按原始记录分析。',
  evidenceIds: ['issue-1'],
  suggestions: [{ title: '现场排查', action: '复核事件地点', evidenceIds: ['issue-1'] }],
  limitations: ['事件数量不等同于事故率。'],
  model: 'qwen-plus',
  generatedAt: '2026-10-22T04:00:00Z',
};
function client(fetcher) {
  const module = { exports: {} };
  vm.runInNewContext(source('../src/services/governanceService.ts'), {
    module,
    exports: module.exports,
    fetch: fetcher,
    AbortSignal,
    URLSearchParams,
    Error,
    Set,
  });
  return module.exports;
}

test('governance client encodes village and month and rejects mismatched scope before displaying another village', async () => {
  const requests = [];
  let value = overview('real /村');
  const api = client(async (url, options) => {
    requests.push({ url, options });
    return { ok: true, json: async () => value };
  });
  const result = await api.readGovernanceOverview('real /村', '2026-10');
  assert.equal(result.modelId, 'real /村');
  const query = new URL(requests[0].url, 'http://local').searchParams;
  assert.equal(query.get('modelId'), 'real /村');
  assert.equal(query.get('month'), '2026-10');
  value = { ...overview('real /村'), facts: overview('B').facts };
  await assert.rejects(api.readGovernanceOverview('real /村', '2026-10'), /数据不完整/);
  value = {
    ...overview('real /村'),
    monthly: { modelId: 'B', month: '2026-10', report: '', status: 'pending', sourceRecordIds: [] },
  };
  await assert.rejects(api.readGovernanceOverview('real /村', '2026-10'), /数据不完整/);
});

test('governance client returns recoverable API errors, does not hide cancellation and rejects malformed assistant data', async () => {
  const api = client(async () => ({
    ok: false,
    json: async () => ({ error: { code: 'NO_READY_RECORDS', message: '请先等待办结留痕生成。' } }),
  }));
  await assert.rejects(
    api.generateMonthlyReport('A', '2026-10'),
    (error) => error.code === 'NO_READY_RECORDS' && /等待办结/.test(error.message),
  );
  const controller = new AbortController();
  controller.abort();
  const aborted = client(async () => {
    throw new DOMException('Aborted', 'AbortError');
  });
  await assert.rejects(
    aborted.readGovernanceOverview('A', '2026-10', controller.signal),
    (error) => error.name === 'AbortError',
  );
  const malformed = client(async () => ({
    ok: true,
    json: async () => ({ ...answer, suggestions: [{ title: '缺少行动与依据' }] }),
  }));
  await assert.rejects(
    malformed.askGovernanceAssistant('A', '2026-10', '分析本月', []),
    /回复不完整/,
  );
});

test('assistant requests send only the scoped question and bounded plain-text conversation, preserving untrusted text as text', async () => {
  let sent;
  const api = client(async (url, options) => {
    sent = { url, ...options };
    return { ok: true, json: async () => answer };
  });
  const history = Array.from({ length: 10 }, (_, i) => ({
    role: i % 2 ? 'assistant' : 'user',
    content: `${i}:` + '复核'.repeat(2500),
    evidenceIds: ['not-sent'],
  }));
  const question = '<script>原始文本</script>';
  const result = await api.askGovernanceAssistant('A', '2026-10', question, history);
  const payload = JSON.parse(sent.body);
  assert.equal(sent.url, '/api/governance/chat');
  assert.deepEqual(Object.keys(payload).sort(), ['history', 'modelId', 'month', 'question']);
  assert.equal(payload.history.length, 8);
  assert.match(payload.history[0].content, /^2:/);
  assert.equal(payload.history[0].content.length, 3000);
  assert.deepEqual(Object.keys(payload.history[0]).sort(), ['content', 'role']);
  assert.equal(payload.question, question);
  assert.deepEqual(plain(result), answer);
});

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { resolve, reject, promise };
}
async function settle() {
  for (let i = 0; i < 12; i++) await Promise.resolve();
}
function hookHarness() {
  let modelId = 'A',
    month = '2026-10',
    cursor = 0,
    effects = [],
    output,
    scheduled = false,
    closed = false;
  const slots = [],
    requests = [],
    timers = new Map();
  const same = (a, b) =>
    a?.length === b?.length && a.every((value, index) => Object.is(value, b[index]));
  const schedule = () => {
    if (!closed && !scheduled) {
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        render();
      });
    }
  };
  const react = {
    useState(initial) {
      const i = cursor++;
      slots[i] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [
        slots[i].value,
        (value) => {
          if (closed) return;
          slots[i].value = typeof value === 'function' ? value(slots[i].value) : value;
          schedule();
        },
      ];
    },
    useEffect(fn, deps) {
      const i = cursor++;
      if (!slots[i] || !same(deps, slots[i].deps)) {
        const cleanup = slots[i]?.cleanup;
        slots[i] = { deps };
        effects.push(() => {
          cleanup?.();
          slots[i].cleanup = fn();
        });
      }
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(source('../src/components/governance-terminal/useGovernanceOverview.ts'), {
    module,
    exports: module.exports,
    AbortController,
    Error,
    setTimeout(fn) {
      const id = Symbol();
      timers.set(id, fn);
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    require(name) {
      if (name === 'react') return react;
      if (name.endsWith('governanceService'))
        return {
          readGovernanceOverview(modelId, month, signal) {
            const request = { modelId, month, signal, ...deferred() };
            requests.push(request);
            return request.promise;
          },
        };
      throw new Error(name);
    },
  });
  function render() {
    if (closed) return;
    cursor = 0;
    effects = [];
    output = module.exports.default(modelId, month);
    const jobs = effects;
    effects = [];
    jobs.forEach((job) => job());
  }
  render();
  return {
    requests,
    timers,
    get state() {
      return output;
    },
    scope(id, value = month) {
      modelId = id;
      month = value;
      render();
    },
    poll() {
      const pending = [...timers.values()];
      timers.clear();
      pending.forEach((fn) => fn());
    },
    close() {
      closed = true;
      slots.forEach((slot) => slot.cleanup?.());
    },
  };
}

test('governance polling keeps existing content visible and never overlaps slow model reads', async () => {
  const h = hookHarness();
  assert.equal(h.state.loading, true);
  assert.equal(h.timers.size, 0);
  h.poll();
  assert.equal(h.requests.length, 1);
  h.requests[0].resolve(overview());
  await settle();
  assert.equal(h.state.loading, false);
  assert.equal(h.state.overview.modelId, 'A');
  h.poll();
  h.poll();
  assert.equal(h.requests.length, 2);
  assert.equal(h.state.loading, false);
  h.requests[1].reject(new Error('连接暂时中断'));
  await settle();
  assert.equal(h.state.overview.modelId, 'A');
  assert.equal(h.state.error, '连接暂时中断');
  h.poll();
  h.requests[2].resolve(overview());
  await settle();
  assert.equal(h.state.error, '');
  h.close();
});

test('village and month changes cancel pending reads; late replies cannot replace the current scope', async () => {
  const h = hookHarness();
  const old = h.requests[0];
  h.scope('B', '2026-09');
  assert.equal(old.signal.aborted, true);
  assert.equal(h.state.overview, null);
  h.requests[1].resolve(overview('B', '2026-09'));
  await settle();
  old.resolve(overview('A'));
  await settle();
  assert.equal(h.state.overview.modelId, 'B');
  assert.equal(h.state.overview.month, '2026-09');
  h.state.refresh();
  await settle();
  const latest = h.requests.at(-1);
  assert.equal(h.state.loading, false, 'refresh retains the current document');
  h.close();
  assert.equal(latest.signal.aborted, true);
  assert.equal(h.timers.size, 0);
  latest.resolve(overview('B', '2026-09'));
  await settle();
  assert.equal(h.timers.size, 0, 'an unmounted page cannot restart its polling');
});
