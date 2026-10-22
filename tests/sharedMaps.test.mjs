import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createApiServer } from '../server/api.mjs';
import { createMapService, validatePng, MAX_MAP_IMAGE_BYTES } from '../server/maps.mjs';
const png = await readFile(
  new URL('./fixtures/models/gltf-folder/textures/测试纹理.png', import.meta.url),
);
const metadata = (modelId = 'village-a', createdAt = '2026-10-22T08:00:00.000Z') => ({
  version: 2,
  modelId,
  width: 4,
  height: 4,
  bounds: { minX: -10, minY: -20, maxX: 10, maxY: 20 },
  transform: {
    kind: 'projective',
    matrix: [0.1, 0, 0, 0.5, 0, 0.1, 0, 0.5, 0, 0, 0],
    origin: [0, 0, 0],
    unit: 20,
  },
  reference: { position: [0, 0, 30], target: [0, 0, 0] },
  method: 'online-topdown',
  createdAt,
});
const descriptor = (modelId = 'village-a') => ({
  modelId,
  name: `实景村庄 ${modelId}`,
  kind: 'real',
});
const upload = (modelId = 'village-a', createdAt) => ({
  ...descriptor(modelId),
  projection: { metadata: metadata(modelId, createdAt), imageBase64: png.toString('base64') },
});
async function setup(t, { server = false } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'village-map-test-'));
  const repo = createMapService(join(directory, 'maps'));
  let api;
  if (server) {
    api = createApiServer({ env: {}, file: join(directory, 'issues.json') });
    await new Promise((resolve) => api.listen(0, '127.0.0.1', resolve));
  }
  t.after(async () => {
    if (api) await new Promise((resolve) => api.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  return { repo, directory, url: api ? `http://127.0.0.1:${api.address().port}` : undefined };
}
const put = (url, path, body, headers = {}) =>
  fetch(url + path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

test('shared maps persist calibrated PNGs, preserve immutable revisions, and never let publication change active selection', async (t) => {
  const { repo, directory } = await setup(t);
  assert.equal((await repo.read()).activeModelId, 'qinghe-demo');
  const a = await repo.publish(upload());
  assert.equal(a.projection.createdAt, metadata().createdAt);
  assert.deepEqual(a.projection.transform, metadata().transform);
  assert.equal((await repo.read()).activeModelId, 'qinghe-demo');
  assert.deepEqual(await repo.image(a.projection.revision), png);
  await repo.select({ modelId: 'village-a' });
  const b = await repo.publish(upload('village-b'));
  await repo.select({ modelId: 'village-b' });
  await repo.publish(upload('village-a', '2026-10-22T08:10:00.000Z'));
  assert.equal(
    (await repo.read()).activeModelId,
    'village-b',
    'a late image from A must not select A',
  );
  assert.deepEqual(await repo.image(a.projection.revision), png, 'old image URLs stay usable');
  const reopened = createMapService(join(directory, 'maps'));
  const catalog = await reopened.read();
  assert.equal(catalog.activeModelId, 'village-b');
  assert.equal(
    catalog.maps.find((row) => row.modelId === 'village-b').projection.revision,
    b.projection.revision,
  );
  const renamed = await reopened.publish({ ...descriptor('village-b'), name: '更新名称' });
  assert.equal(
    renamed.projection.revision,
    b.projection.revision,
    'descriptor-only updates retain a working map',
  );
});

test('selection intent rejects out-of-order A-to-B requests and stale projection retries keep the newer calibration', async (t) => {
  const { repo } = await setup(t);
  await repo.publish(upload());
  await repo.publish(upload('village-b'));
  await repo.select({
    modelId: 'village-b',
    selectionSession: 'desktop-test',
    selectionVersion: 2,
  });
  await repo.select({
    modelId: 'village-a',
    selectionSession: 'desktop-test',
    selectionVersion: 1,
  });
  assert.equal((await repo.read()).activeModelId, 'village-b');
  const newest = await repo.publish(upload('village-a', '2026-10-22T09:00:00.000Z'));
  const stale = await repo.publish(upload('village-a', '2026-10-22T07:00:00.000Z'));
  assert.equal(stale.projection.revision, newest.projection.revision);
  await assert.rejects(repo.select({ modelId: 'unknown' }), /尚未共享/);
});

test('invalid PNGs, mismatched model IDs and broken calibration cannot replace a committed image', async (t) => {
  const { repo } = await setup(t);
  const saved = await repo.publish(upload());
  const cases = [
    {
      ...upload(),
      projection: { metadata: metadata('other-village'), imageBase64: png.toString('base64') },
    },
    {
      ...upload(),
      projection: { metadata: { ...metadata(), width: 5 }, imageBase64: png.toString('base64') },
    },
    {
      ...upload(),
      projection: { metadata: metadata(), imageBase64: Buffer.from('<svg/>').toString('base64') },
    },
    {
      ...upload(),
      projection: {
        metadata: {
          ...metadata(),
          transform: { kind: 'projective', matrix: [1], origin: [0, 0, 0], unit: 0 },
        },
        imageBase64: png.toString('base64'),
      },
    },
    {
      ...upload(),
      projection: {
        metadata: metadata(),
        imageBase64: 'A'.repeat(Math.ceil(MAX_MAP_IMAGE_BYTES / 3) * 4 + 4),
      },
    },
  ];
  for (const value of cases) await assert.rejects(repo.publish(value));
  const corrupted = Buffer.from(png);
  corrupted[40] ^= 1;
  assert.throws(() => validatePng(corrupted, 4, 4), /PNG/);
  assert.throws(() => validatePng(Buffer.concat([png, Buffer.from('garbage')]), 4, 4), /PNG/);
  assert.equal(
    (await repo.read()).maps.find((row) => row.modelId === 'village-a').projection.revision,
    saved.projection.revision,
  );
  await assert.rejects(repo.image('../../issues.json'), /地址无效/);
});

test('shared map HTTP API works through a phone origin and serves only immutable PNG paths', async (t) => {
  const { url } = await setup(t, { server: true });
  const host = new URL(url).host;
  let response = await put(url, '/api/maps/village-a', upload(), { Origin: `https://${host}` });
  assert.equal(response.status, 200);
  const saved = await response.json();
  const image = await fetch(url + saved.projection.imageUrl);
  assert.equal(image.headers.get('Content-Type'), 'image/png');
  assert.match(image.headers.get('Cache-Control'), /immutable/);
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), png);
  response = await put(url, '/api/maps/active', { modelId: 'village-a' });
  assert.equal((await response.json()).activeModelId, 'village-a');
  assert.equal((await (await fetch(url + '/api/maps')).json()).maps.length, 2);
  assert.equal(
    (await put(url, '/api/maps/village-a', upload(), { Origin: 'https://foreign.example' })).status,
    403,
  );
  assert.equal((await put(url, '/api/maps/village-a', upload(), { Origin: 'null' })).status, 403);
  assert.equal((await put(url, '/api/maps/village-b', upload())).status, 400);
  assert.equal((await fetch(url + '/api/maps/images/not-a-revision.png')).status, 404);
  assert.equal((await fetch(url + '/api/maps/images/%2e%2e%2fissues.json')).status, 404);
  assert.equal((await (await fetch(url + '/api/voice/config')).json()).enabled, false);
  assert.equal((await (await fetch(url + '/api/issues')).json()).issues.length, 0);
});

test('corrupted persisted catalogs fail without silently discarding previously saved maps', async (t) => {
  const { repo, directory } = await setup(t);
  await repo.publish(upload());
  const file = join(directory, 'maps/catalog.json');
  await writeFile(file, '{corrupted');
  await assert.rejects(repo.publish(descriptor('village-b')));
  assert.equal(await readFile(file, 'utf8'), '{corrupted');
});

// A small hook harness verifies cancellation without a browser, real 3D assets or keys.
function publisherHarness({ initial, publish, select }) {
  let slots = [],
    cursor = 0,
    pending = [],
    output,
    props = initial,
    scheduled = false,
    closed = false;
  const listeners = new Map();
  const equal = (a, b) =>
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
      slots[i] ??= { value: initial };
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
    useCallback(fn, deps) {
      const i = cursor++;
      if (!slots[i] || !equal(deps, slots[i].deps)) slots[i] = { value: fn, deps };
      return slots[i].value;
    },
    useEffect(fn, deps) {
      const i = cursor++;
      if (!slots[i] || !equal(deps, slots[i].deps)) {
        const cleanup = slots[i]?.cleanup;
        slots[i] = { deps };
        pending.push(() => {
          cleanup?.();
          slots[i].cleanup = fn();
        });
      }
    },
  };
  const module = { exports: {} };
  const source = ts.transpileModule(
    fs.readFileSync(new URL('../src/lib/usePublishMap.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  vm.runInNewContext(source, {
    module,
    exports: module.exports,
    AbortController,
    Error,
    JSON,
    Date,
    // Avoid multi-second backoff in these deterministic lifecycle checks.
    setTimeout: (callback) => setTimeout(callback, 1),
    clearTimeout,
    window: {
      addEventListener: (name, fn) => listeners.set(name, fn),
      removeEventListener: (name) => listeners.delete(name),
    },
    require(name) {
      if (name === 'react') return react;
      if (name === '../services/sharedMaps')
        return { publishSharedMap: publish, selectSharedMap: select };
      throw new Error(name);
    },
  });
  function render() {
    if (closed) return;
    cursor = 0;
    pending = [];
    output = module.exports.usePublishMap(props);
    const effects = pending;
    pending = [];
    effects.forEach((fn) => fn());
  }
  render();
  return {
    get output() {
      return output;
    },
    update(value) {
      props = { ...props, ...value };
      render();
    },
    online: () => listeners.get('online')?.(),
    close() {
      closed = true;
      slots.forEach((slot) => slot.cleanup?.());
    },
  };
}
async function until(predicate) {
  for (let i = 0; i < 150; i++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 3));
  }
  assert.fail('publisher did not settle');
}
function view(modelId = 'village-a') {
  return {
    modelId,
    status: 'ready',
    data: { ...metadata(modelId), image: new Blob([png], { type: 'image/png' }) },
    message: '',
    retry() {},
  };
}

test('desktop publisher cancels late A selection, skips an already shared revision, and retries after a disconnected service', async () => {
  let lateA,
    active = '',
    failed = true;
  const calls = [],
    existing = new Map();
  const initial = {
    modelId: 'village-a',
    name: 'A 村',
    demo: false,
    restoring: false,
    projection: view(),
  };
  const h = publisherHarness({
    initial,
    publish: async (descriptor, data) => {
      calls.push({ modelId: descriptor.modelId, image: !!data });
      if (descriptor.modelId === 'village-a' && !lateA)
        await new Promise((resolve) => (lateA = resolve));
      if (failed && descriptor.modelId === 'village-b') throw new Error('断开连接');
      if (data) {
        const { image: _image, ...rest } = data;
        existing.set(descriptor.modelId, {
          imageUrl: '/api/maps/images/test.png',
          revision: 'test',
          ...rest,
        });
      }
      return { ...descriptor, projection: existing.get(descriptor.modelId) };
    },
    select: async (id) => {
      active = id;
      return { activeModelId: active, maps: [] };
    },
  });
  await until(() => lateA);
  h.update({ modelId: 'village-b', name: 'B 村', projection: view('village-b') });
  lateA();
  await until(() => h.output.phase === 'error');
  assert.equal(active, '', 'a descriptor resolving after A was abandoned cannot select A');
  failed = false;
  h.output.retry();
  await until(() => h.output.phase === 'ready');
  assert.equal(active, 'village-b');
  assert.equal(calls.filter((row) => row.modelId === 'village-b' && row.image).length, 1);
  h.output.retry();
  await until(
    () =>
      h.output.phase === 'ready' &&
      calls.filter((row) => row.modelId === 'village-b' && !row.image).length >= 6,
  );
  assert.equal(
    calls.filter((row) => row.modelId === 'village-b' && row.image).length,
    1,
    'retrying an already committed calibrated image does not resend its PNG',
  );
  h.close();
});

test('mobile reports require the current shared real projection while generic history sync keeps old anchors', async (t) => {
  const { url } = await setup(t, { server: true });
  const report = (id, modelId = 'village-a', projectionCreatedAt = metadata().createdAt) => ({
    id,
    title: '实景地图上报测试',
    description: '村口道路需要检修。',
    category: '道路破损',
    severity: 'medium',
    status: 'pending',
    area: '村口',
    reporter: '测试村民',
    residentId: 'resident-map-test',
    createdAt: '2026-10-22T10:00:00.000Z',
    updatedAt: '2026-10-22T10:00:00.000Z',
    location: { local: { x: 0, y: 0, z: 0 }, geo: { lng: 0, lat: 0 } },
    projectionAnchor: {
      modelId,
      projectionCreatedAt,
      uv: [0.5, 0.5],
      ray: { start: [0, 0, 30], end: [0, 0, -30] },
    },
    history: [],
  });
  const postReport = (rows, path = '/api/issues/report') =>
    fetch(url + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ issues: rows }),
    });
  const count = async () => (await (await fetch(url + '/api/issues')).json()).issues.length;
  let response = await postReport([report('unknown-map')]);
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error.code, 'MAP_NOT_SHARED');
  await put(url, '/api/maps/village-b', descriptor('village-b'));
  assert.equal((await postReport([report('map-without-image', 'village-b')])).status, 409);
  assert.equal((await postReport([report('demo-projection', 'qinghe-demo')])).status, 409);
  assert.equal(await count(), 0, 'unknown, demo and unpublished projections cannot create issues');

  await put(url, '/api/maps/village-a', upload());
  await put(url, '/api/maps/active', { modelId: 'village-a' });
  assert.equal((await postReport([report('current-report')])).status, 200);
  assert.equal(await count(), 1);
  const newTime = '2026-10-22T09:00:00.000Z';
  await put(url, '/api/maps/village-a', upload('village-a', newTime));
  response = await postReport([report('stale-report')]);
  assert.equal(response.status, 409);
  const error = (await response.json()).error;
  assert.equal(error.code, 'MAP_PROJECTION_STALE');
  assert.match(error.message, /重新选点/);
  assert.match(error.message, /保留/);
  assert.equal(await count(), 1);
  assert.equal(
    (await postReport([report('batch-fresh', 'village-a', newTime), report('batch-stale')])).status,
    409,
  );
  assert.equal(
    await count(),
    1,
    'one stale anchor rejects the entire batch without partial writes',
  );
  assert.equal((await postReport([report('new-report', 'village-a', newTime)])).status, 200);
  assert.equal((await postReport([report('old-history')], '/api/issues')).status, 200);
  assert.equal(
    await count(),
    3,
    'generic history synchronization can still preserve older anchors',
  );
});

test('projection regeneration waits until an already validated report has committed', async (t) => {
  const { repo } = await setup(t);
  await repo.publish(upload());
  await repo.select({ modelId: 'village-a' });
  let finishCommit,
    enteredCommit = false,
    published = false;
  const saving = repo.withCurrentProjections(
    [{ modelId: 'village-a', projectionCreatedAt: metadata().createdAt }],
    async () => {
      enteredCommit = true;
      await new Promise((resolve) => (finishCommit = resolve));
      return 'committed';
    },
  );
  await until(() => enteredCommit);
  const regeneration = repo
    .publish(upload('village-a', '2026-10-22T09:00:00.000Z'))
    .then(() => (published = true));
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(published, false, 'a map cannot change between report validation and commit');
  finishCommit();
  assert.equal(await saving, 'committed');
  await regeneration;
  await assert.rejects(
    repo.withCurrentProjections(
      [{ modelId: 'village-a', projectionCreatedAt: metadata().createdAt }],
      () => assert.fail('stale commit must not run'),
    ),
    (error) => error.status === 409,
  );
});

test('resident active real map follows selection before its image is ready and survives Demo, publication and restart', async (t) => {
  const { repo, directory } = await setup(t);
  assert.equal((await repo.read()).activeRealModelId, null);
  await repo.publish(upload('village-a'));
  assert.equal(
    (await repo.read()).activeRealModelId,
    null,
    'publishing a real image does not select it',
  );
  await repo.select({ modelId: 'village-a' });
  assert.equal((await repo.read()).activeRealModelId, 'village-a');
  await repo.select({ modelId: 'qinghe-demo' });
  assert.equal((await repo.read()).activeModelId, 'qinghe-demo');
  assert.equal(
    (await repo.read()).activeRealModelId,
    'village-a',
    'desktop Demo never becomes the resident map',
  );
  await repo.publish(descriptor('village-b'));
  await repo.select({
    modelId: 'village-b',
    selectionSession: 'desktop-active-real',
    selectionVersion: 2,
  });
  let catalog = await repo.read();
  assert.equal(catalog.activeRealModelId, 'village-b');
  assert.equal(
    catalog.maps.find((row) => row.modelId === catalog.activeRealModelId).projection,
    undefined,
    'B is the selected resident map even before B has an image',
  );
  await repo.select({
    modelId: 'village-a',
    selectionSession: 'desktop-active-real',
    selectionVersion: 1,
  });
  await repo.publish(upload('village-a', '2026-10-22T12:00:00.000Z'));
  catalog = await repo.read();
  assert.equal(
    catalog.activeRealModelId,
    'village-b',
    'late A selection and image cannot reactivate A',
  );
  await repo.select({ modelId: 'qinghe-demo' });
  const reopened = createMapService(join(directory, 'maps'));
  assert.equal((await reopened.read()).activeRealModelId, 'village-b');
  assert.equal(
    JSON.parse(await readFile(join(directory, 'maps/catalog.json'), 'utf8')).activeRealModelId,
    'village-b',
  );
});

test('legacy map catalogs migrate the current real model or most recently used real source and persist the result', async (t) => {
  const { repo, directory } = await setup(t);
  await repo.publish(upload('village-a'));
  await repo.publish(upload('village-b'));
  const file = join(directory, 'maps/catalog.json');
  let legacy = JSON.parse(await readFile(file, 'utf8'));
  delete legacy.activeRealModelId;
  legacy.activeModelId = 'village-a';
  await writeFile(file, JSON.stringify(legacy));
  let reopened = createMapService(join(directory, 'maps'));
  assert.equal(
    (await reopened.read()).activeRealModelId,
    'village-a',
    'the current real source takes precedence over another more recent descriptor',
  );
  assert.equal(JSON.parse(await readFile(file, 'utf8')).activeRealModelId, 'village-a');
  legacy.activeModelId = 'qinghe-demo';
  legacy.maps.find((row) => row.modelId === 'village-a').updatedAt = '2026-10-22T11:00:00.000Z';
  legacy.maps.find((row) => row.modelId === 'village-b').updatedAt = '2026-10-22T12:00:00.000Z';
  await writeFile(file, JSON.stringify(legacy));
  reopened = createMapService(join(directory, 'maps'));
  assert.equal((await reopened.read()).activeRealModelId, 'village-b');
  assert.equal(JSON.parse(await readFile(file, 'utf8')).activeRealModelId, 'village-b');
  legacy.maps = legacy.maps.filter((row) => row.kind === 'demo');
  await writeFile(file, JSON.stringify(legacy));
  reopened = createMapService(join(directory, 'maps'));
  assert.equal((await reopened.read()).activeRealModelId, null);
});

test('late phone reports for A are rejected atomically after the desktop switches to real village B', async (t) => {
  const { url } = await setup(t, { server: true });
  await put(url, '/api/maps/village-a', upload());
  await put(url, '/api/maps/village-b', upload('village-b'));
  await put(url, '/api/maps/active', { modelId: 'village-a' });
  const record = {
    id: 'late-phone-a',
    title: '旧村庄迟到提交',
    description: '村口道路需要检修。',
    category: '道路破损',
    severity: 'medium',
    status: 'pending',
    area: '村口',
    reporter: '测试村民',
    createdAt: '2026-10-22T10:00:00.000Z',
    updatedAt: '2026-10-22T10:00:00.000Z',
    location: { local: { x: 0, y: 0, z: 0 }, geo: { lng: 0, lat: 0 } },
    projectionAnchor: {
      modelId: 'village-a',
      projectionCreatedAt: metadata().createdAt,
      uv: [0.5, 0.5],
      ray: { start: [0, 0, 30], end: [0, 0, -30] },
    },
    history: [],
  };
  await put(url, '/api/maps/active', { modelId: 'village-b' });
  const send = (path) =>
    fetch(url + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ issues: [record] }),
    });
  const response = await send('/api/issues/report');
  assert.equal(response.status, 409);
  const error = (await response.json()).error;
  assert.equal(error.code, 'MAP_CHANGED');
  assert.match(error.message, /电脑端已切换/);
  assert.match(error.message, /确认当前村庄/);
  assert.equal((await (await fetch(url + '/api/issues')).json()).issues.length, 0);
  assert.equal(
    (await send('/api/issues')).status,
    200,
    'generic history synchronization retains A records after switching to B',
  );
});

test('a desktop village switch cannot interleave between validating a phone village and committing its report', async (t) => {
  const { repo } = await setup(t);
  await repo.publish(upload());
  await repo.publish(upload('village-b'));
  await repo.select({ modelId: 'village-a' });
  let finishCommit,
    enteredCommit = false,
    switched = false;
  const anchor = { modelId: 'village-a', projectionCreatedAt: metadata().createdAt };
  const saving = repo.withCurrentProjections([anchor], async () => {
    enteredCommit = true;
    await new Promise((resolve) => (finishCommit = resolve));
    return 'A committed before B became active';
  });
  await until(() => enteredCommit);
  const switching = repo.select({ modelId: 'village-b' }).then(() => (switched = true));
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(switched, false);
  finishCommit();
  assert.equal(await saving, 'A committed before B became active');
  await switching;
  await assert.rejects(
    repo.withCurrentProjections([anchor], () => assert.fail('late A must not commit')),
    (error) => error.status === 409 && error.code === 'MAP_CHANGED',
  );
});
