import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const CATALOG_KEY = 'village-mobile-map-catalog';
const demo = {
  modelId: 'qinghe-demo',
  name: '青禾村 Demo',
  kind: 'demo',
  updatedAt: '2026-10-22T04:00:00Z',
};
const real = (modelId, revision = '1') => ({
  modelId,
  name: `${modelId}村`,
  kind: 'real',
  updatedAt: `2026-10-22T04:00:0${revision || '0'}Z`,
  ...(revision
    ? {
        projection: {
          revision,
          createdAt: `2026-10-22T04:00:0${revision}Z`,
          imageUrl: `/api/maps/images/${modelId}-${revision}.png`,
        },
      }
    : {}),
});
const catalog = (activeRealModelId, maps, activeModelId = activeRealModelId || demo.modelId) => ({
  activeModelId,
  activeRealModelId,
  maps: [demo, ...maps],
});
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
async function settle() {
  for (let i = 0; i < 12; i++) await Promise.resolve();
}

/** Runs the real hook with deterministic network and timers, including effect
 * cleanup on refresh and unmount. No HTTP requests or real polling are needed. */
function harness({ cached, corruptCache, storageFailure = false, issueModelId } = {}) {
  const slots = [],
    intervals = new Map(),
    requests = [],
    writes = [];
  const storage = new Map();
  const watchers = new Set();
  let currentIssueModel = issueModelId;
  if (cached) storage.set(CATALOG_KEY, JSON.stringify(cached));
  if (corruptCache) storage.set(CATALOG_KEY, corruptCache);
  let cursor = 0,
    effects = [],
    output,
    closed = false,
    scheduled = false,
    renderCount = 0;
  const same = (a, b) => a?.length === b?.length && a.every((value, i) => Object.is(value, b[i]));
  function schedule() {
    if (closed || scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      render();
    });
  }
  const react = {
    useState(initial) {
      const i = cursor++;
      slots[i] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [
        slots[i].value,
        (value) => {
          if (closed) return;
          const next = typeof value === 'function' ? value(slots[i].value) : value;
          if (!Object.is(next, slots[i].value)) {
            slots[i].value = next;
            schedule();
          }
        },
      ];
    },
    useRef(initial) {
      const i = cursor++;
      slots[i] ??= { current: initial };
      return slots[i];
    },
    useCallback(fn, deps) {
      const i = cursor++;
      if (!slots[i] || !same(deps, slots[i].deps)) slots[i] = { value: fn, deps };
      return slots[i].value;
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
  const source = fs.readFileSync(
    new URL(
      issueModelId
        ? '../src/mobile/services/useResidentIssues.ts'
        : '../src/mobile/services/useResidentMap.ts',
      import.meta.url,
    ),
    'utf8',
  );
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    AbortController,
    Error,
    localStorage: {
      getItem: (key) => storage.get(key) || null,
      setItem(key, value) {
        if (storageFailure) throw new Error('storage is full');
        writes.push({ key, value });
        storage.set(key, value);
      },
    },
    setInterval(fn) {
      const id = Symbol();
      intervals.set(id, fn);
      return id;
    },
    clearInterval: (id) => intervals.delete(id),
    require(name) {
      if (name === 'react') return react;
      if (name.endsWith('localResident'))
        return {
          residentGateway: {
            list(modelId) {
              const request = { ...deferred(), modelId };
              requests.push(request);
              return request.promise;
            },
            watch(fn) {
              watchers.add(fn);
              return () => watchers.delete(fn);
            },
          },
        };
      if (name.endsWith('/issues')) return { DEMO_MODEL_ID: 'qinghe-demo' };
      if (name.endsWith('sharedMaps'))
        return {
          readSharedMaps(signal) {
            const request = { ...deferred(), signal };
            requests.push(request);
            return request.promise;
          },
        };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  function render() {
    if (closed) return;
    renderCount++;
    cursor = 0;
    effects = [];
    output = issueModelId
      ? module.exports.useResidentIssues(currentIssueModel)
      : module.exports.useResidentMap();
    const pending = effects;
    effects = [];
    pending.forEach((fn) => fn());
  }
  render();
  return {
    requests,
    writes,
    intervals,
    resolveMap: module.exports.residentMapFromCatalog,
    notifyIssueChange() {
      [...watchers].forEach((fn) => fn());
    },
    switchIssueModel(modelId) {
      currentIssueModel = modelId;
      render();
    },
    get state() {
      return output;
    },
    get renderCount() {
      return renderCount;
    },
    get saved() {
      return JSON.parse(storage.get(CATALOG_KEY) || 'null');
    },
    poll() {
      [...intervals.values()].forEach((fn) => fn());
    },
    close() {
      closed = true;
      slots.forEach((slot) => slot?.cleanup?.());
    },
  };
}

test('resident catalog resolution never exposes the demo or silently substitutes a different real village', async () => {
  const h = harness({ corruptCache: '{invalid' });
  assert.equal(h.state.map, null);
  const a = real('A');
  assert.equal(h.resolveMap(catalog(null, [a])), null);
  assert.equal(h.resolveMap(catalog('absent', [a])), null);
  assert.equal(h.resolveMap(catalog(demo.modelId, [a])), null);
  assert.equal(h.resolveMap(catalog('A', [a], demo.modelId)).modelId, 'A');
  h.requests[0].resolve(catalog(null, []));
  await settle();
  assert.equal(h.state.loading, false);
  assert.equal(h.state.map, null);
  assert.equal(h.state.error, '');
  h.close();
});

test('desktop A → B switches immediately even before B has an image, then follows B projection updates without reviving A', async () => {
  const h = harness();
  h.requests[0].resolve(catalog('A', [real('A')]));
  await settle();
  assert.equal(h.state.map.modelId, 'A');
  assert.equal(h.state.notice, '', 'initial synchronization is not a village switch');

  h.poll();
  h.requests[1].resolve(catalog('B', [real('A'), real('B', null)]));
  await settle();
  assert.equal(h.state.map.modelId, 'B');
  assert.equal(
    h.state.map.projection,
    undefined,
    'never put the old A image under the B village name',
  );
  assert.match(h.state.notice, /B村/);
  h.state.dismissNotice();
  await settle();

  h.poll();
  h.requests[2].resolve(catalog('B', [real('A'), real('B', '1')]));
  await settle();
  assert.equal(h.state.map.projection.imageUrl, '/api/maps/images/B-1.png');
  assert.equal(h.state.notice, '');
  h.poll();
  h.requests[3].resolve(catalog('B', [real('A'), real('B', '2')]));
  await settle();
  assert.equal(h.state.map.projection.imageUrl, '/api/maps/images/B-2.png');
  assert.equal(h.state.notice, '', 'a new capture of the same village is not a model switch');
  assert.equal(h.saved.activeRealModelId, 'B');
  assert.equal(h.saved.maps.find((map) => map.modelId === 'B').projection.revision, '2');
  h.close();
});

test('desktop demo selection retains the last real village and never offers a demo map to the resident', async () => {
  const h = harness({ cached: catalog('A', [real('A')]) });
  assert.equal(h.state.map.modelId, 'A');
  h.requests[0].resolve(catalog('A', [real('A')], demo.modelId));
  await settle();
  assert.equal(h.state.map.modelId, 'A');
  assert.equal(h.state.map.kind, 'real');
  assert.equal(h.state.notice, '');
  assert.equal(h.saved.activeModelId, demo.modelId);
  h.close();
});

test('polling does not overlap; refreshed requests cancel stale responses so old villages cannot overwrite UI or persisted catalog', async () => {
  const h = harness({ cached: catalog('A', [real('A')]) });
  const old = h.requests[0];
  h.poll();
  h.poll();
  assert.equal(h.requests.length, 1, 'slow network reads cannot accumulate each polling tick');

  h.state.refresh();
  await settle();
  assert.equal(old.signal.aborted, true);
  assert.equal(h.intervals.size, 1);
  assert.equal(h.requests.length, 2);
  h.requests[1].resolve(catalog('B', [real('A'), real('B')]));
  await settle();
  assert.equal(h.state.map.modelId, 'B');
  const writesBeforeLateResult = h.writes.length;
  old.resolve(catalog('A', [real('A')]));
  await settle();
  assert.equal(h.state.map.modelId, 'B');
  assert.equal(h.saved.activeRealModelId, 'B');
  assert.equal(
    h.writes.length,
    writesBeforeLateResult,
    'an aborted late response cannot poison the next launch cache',
  );
  assert.equal(h.state.error, '');
  h.close();
});

test('unmount removes polling and ignores a late response, including cache writes', async () => {
  const h = harness();
  const pending = h.requests[0];
  h.close();
  const rendersAtClose = h.renderCount;
  assert.equal(pending.signal.aborted, true);
  assert.equal(h.intervals.size, 0);
  pending.resolve(catalog('A', [real('A')]));
  await settle();
  assert.equal(h.writes.length, 0);
  assert.equal(h.renderCount, rendersAtClose);
});

test('temporary read failure preserves the real cached village; a later read recovers even when browser storage is unavailable', async () => {
  const h = harness({ cached: catalog('A', [real('A')]), storageFailure: true });
  h.requests[0].reject(new Error('connection unavailable'));
  await settle();
  assert.equal(h.state.loading, false);
  assert.equal(h.state.map.modelId, 'A');
  assert.equal(h.state.error, 'connection unavailable');
  h.poll();
  h.requests[1].resolve(catalog('B', [real('A'), real('B')]));
  await settle();
  assert.equal(h.state.map.modelId, 'B');
  assert.equal(h.state.error, '', 'localStorage failures cannot suppress a successful server map');
  assert.match(h.state.notice, /B村/);
  h.close();
});

test('an A-village manual reload cannot replace B records after the desktop changes villages', async () => {
  const h = harness({ issueModelId: 'A' });
  h.requests[0].resolve([{ id: 'A-1' }]);
  await settle();
  assert.equal(h.state.issues[0].id, 'A-1');

  h.state.reload();
  await settle();
  assert.equal(h.requests[1].modelId, 'A');
  h.switchIssueModel('B');
  assert.equal(h.requests[2].modelId, 'B');
  h.requests[2].resolve([{ id: 'B-1' }]);
  await settle();
  assert.equal(h.state.issues[0].id, 'B-1');
  h.requests[1].resolve([{ id: 'A-2' }]);
  await settle();
  assert.equal(
    h.state.issues[0].id,
    'B-1',
    'the late A reload must not clear or replace the current B records',
  );
  assert.equal(h.state.error, '');
  h.close();
});

test('newer issue updates win over an older request or failure from the same village', async () => {
  const h = harness({ issueModelId: 'A' });
  h.requests[0].resolve([{ id: 'A-initial' }]);
  await settle();
  h.notifyIssueChange();
  h.notifyIssueChange();
  h.requests[2].resolve([{ id: 'A-latest' }]);
  await settle();
  h.requests[1].resolve([{ id: 'A-obsolete' }]);
  await settle();
  assert.equal(h.state.issues[0].id, 'A-latest');

  h.notifyIssueChange();
  h.notifyIssueChange();
  h.requests[4].resolve([{ id: 'A-recovered' }]);
  await settle();
  h.requests[3].reject(new Error('old network failure'));
  await settle();
  assert.equal(h.state.issues[0].id, 'A-recovered');
  assert.equal(
    h.state.error,
    '',
    'an old failed request cannot hide a newer successful village list',
  );
  assert.equal(h.state.loading, false);
  h.close();
});
