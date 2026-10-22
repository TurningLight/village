import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { IDBFactory } from 'fake-indexeddb';

function context() {
  const sent = [],
    storage = new Map(),
    indexedDB = new IDBFactory(),
    cache = new Map();
  const state = { village: { issues: [] } };
  function load(url) {
    if (cache.has(url.href)) return cache.get(url.href).exports;
    const module = { exports: {} };
    cache.set(url.href, module);
    const code = ts.transpileModule(fs.readFileSync(url, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(code, {
      module,
      exports: module.exports,
      indexedDB,
      Promise,
      structuredClone,
      ArrayBuffer,
      Number,
      Date,
      Math,
      JSON,
      Error,
      localStorage: {
        getItem: (key) => storage.get(key) || null,
        setItem: (key, value) => storage.set(key, value),
      },
      require(name) {
        if (name.includes('useAppStore'))
          return { useAppStore: { getState: () => state, subscribe: () => () => {} } };
        if (name.includes('sharedIssueSync'))
          return {
            connectSharedIssueSync: () => () => {},
            writeSharedIssues: async (rows, createOnly) => {
              sent.push({ rows, createOnly });
              return rows;
            },
          };
        if (name.endsWith('/id')) return { createClientId: () => `unique-${sent.length}` };
        return load(new URL(`${name}.ts`, url));
      },
    });
    return module.exports;
  }
  return {
    adapter: load(new URL('../src/mobile/adapters/localResident.ts', import.meta.url)),
    domain: load(new URL('../src/mobile/domain/report.ts', import.meta.url)),
    sent,
    state,
    indexedDB,
  };
}
const anchor = (modelId = 'real-a', uv = [0.3, 0.7]) => ({
  modelId,
  projectionCreatedAt: '2026-10-22T00:00:00Z',
  uv,
  ray: { start: [3, 7, 100], end: [3, 7, -100] },
});
const draft = (modelId = 'real-a') => ({
  modelId,
  modelName: '实景村庄',
  title: '村边路灯不亮',
  description: '村边这盏路灯连续两晚不亮，影响通行。',
  category: '设施故障',
  severity: 'medium',
  area: '村边桥头',
  point: { x: -40, y: 0, z: 95 },
  projectionAnchor: anchor(modelId),
  images: [],
});
const plain = (value) => JSON.parse(JSON.stringify(value));

test('real-village mobile reports preserve calibrated image anchors and never invent mesh positions', async () => {
  const { adapter, domain, sent } = context();
  const input = draft();
  assert.equal(
    domain.validateReport(input),
    null,
    'real image coordinates are independent of the demo rectangle',
  );
  const issue = await adapter.residentGateway.report(input, { id: 'resident', name: '测试村民' });
  assert.deepEqual(plain(issue.projectionAnchor), input.projectionAnchor);
  assert.equal(issue.sceneAnchor, undefined);
  assert.equal(sent[0].createOnly, true);
  assert.match(domain.validateReport({ ...input, projectionAnchor: anchor('real-b') }), /当前村庄/);
  assert.match(domain.validateReport({ ...input, projectionAnchor: undefined }), /重新标出位置/);
});

test('mobile issue lists and draft storage isolate two real villages and the legacy demo', async () => {
  const { adapter, state } = context();
  const a = draft('real-a'),
    b = { ...draft('real-b'), title: '另一村水沟堵塞' };
  const demo = {
    ...draft('qinghe-demo'),
    point: { x: 2, y: 0, z: 3 },
    projectionAnchor: undefined,
  };
  await Promise.all([
    adapter.draftStorage.write(a),
    adapter.draftStorage.write(b),
    adapter.draftStorage.write(demo),
  ]);
  assert.equal((await adapter.draftStorage.read('real-a')).title, a.title);
  assert.equal((await adapter.draftStorage.read('real-b')).title, b.title);
  await adapter.draftStorage.clear('real-a');
  assert.equal(await adapter.draftStorage.read('real-a'), null);
  assert.equal((await adapter.draftStorage.read('real-b')).title, b.title);
  assert.equal((await adapter.draftStorage.read()).modelId, 'qinghe-demo');
  const resident = { id: 'resident', name: '村民' };
  const one = await adapter.residentGateway.report(a, resident),
    two = await adapter.residentGateway.report(b, resident),
    three = await adapter.residentGateway.report(demo, resident);
  state.village.issues = [one, two, three];
  assert.deepEqual(
    plain((await adapter.residentGateway.list('real-a')).map((i) => i.projectionAnchor.modelId)),
    ['real-a'],
  );
  assert.equal((await adapter.residentGateway.list()).length, 1);
});
