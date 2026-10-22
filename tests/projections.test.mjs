import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';
import { IDBFactory } from 'fake-indexeddb';

function loadModules(indexedDB = new IDBFactory()) {
  const cache = new Map();
  function load(url) {
    if (cache.has(url.href)) return cache.get(url.href).exports;
    const module = { exports: {} };
    cache.set(url.href, module);
    const output = ts.transpileModule(fs.readFileSync(url, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(output, {
      module, exports: module.exports,
      require: (name) => load(new URL(`${name}.ts`, url)),
      indexedDB, Blob, DOMException, Date, Error, Number, Object, Map, Set, URL, setTimeout, clearTimeout,
    });
    return module.exports;
  }
  return {
    math: load(new URL('../src/lib/projectionMath.ts', import.meta.url)),
    camera: load(new URL('../src/lib/projectionCamera.ts', import.meta.url)),
    cache: load(new URL('../src/lib/projectionCache.ts', import.meta.url)),
    coordinates: load(new URL('../src/lib/projectionCoordinates.ts', import.meta.url)),
  };
}
const reference = { position: [180, -180, 160], target: [0, 0, 0] };
function record(id = 'village-a', time = '2026-10-21T12:00:00Z') {
  return { version: 2, modelId: id, image: new Blob(['png'], { type: 'image/png' }), width: 2048, height: 1024,
    bounds: { minX: -100, minY: -50, maxX: 100, maxY: 50 }, transform: { kind: 'orthographic' },
    reference, method: 'orthographic', createdAt: time };
}
function close(a, b, tolerance = 1e-7) { assert(Math.abs(a - b) < tolerance, `${a} differs from ${b}`); }

test('orthographic frame contains every transformed mesh, including edge buildings and large survey coordinates', () => {
  const { math } = loadModules();
  const root = new THREE.Group();
  root.position.set(720000, 3600000, 50);
  root.rotation.z = 0.37;
  // Multiple disconnected groups and tall edge buildings must all fit, regardless of aspect ratio.
  for (let i = 0; i < 27; i++) {
    const group = new THREE.Group();
    group.position.set(i * 80 - 1000, (i % 3) * 23, i % 2 * 30);
    group.rotation.z = i * 0.2;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(23, 17, i === 26 ? 140 : 15));
    group.add(mesh); root.add(group);
  }
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const frame = math.projectionFrame({ minX: box.min.x, minY: box.min.y, maxX: box.max.x, maxY: box.max.y });
  const projection = { bounds: frame.bounds, transform: { kind: 'orthographic' } };
  let buildings = 0;
  root.traverse(object => {
    if (!object.isMesh) return;
    buildings++;
    const position = object.geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      const point = new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(object.matrixWorld);
      const uv = math.projectWorldPoint(point.toArray(), projection);
      assert(uv.every(v => v > 0 && v < 1), `building ${buildings} cropped`);
      const local = math.projectionLocalPoint(uv, frame.bounds);
      const scale = 200 / Math.max(frame.bounds.maxX - frame.bounds.minX, frame.bounds.maxY - frame.bounds.minY);
      close(local.x / scale + (frame.bounds.minX + frame.bounds.maxX)/2, point.x);
      close(-local.z / scale + (frame.bounds.minY + frame.bounds.maxY)/2, point.y);
      assert(Math.abs(local.x) <= 100 && Math.abs(local.z) <= 100);
      // Orthographic placement is independent of roof elevation.
      const high = math.projectWorldPoint([point.x, point.y, point.z + 10000], projection);
      close(high[0], uv[0]); close(high[1], uv[1]);
    }
  });
  assert.equal(buildings, 27);
  assert.equal(Math.max(frame.width, frame.height), 2048);
  close(frame.width / frame.height, (frame.bounds.maxX - frame.bounds.minX) / (frame.bounds.maxY - frame.bounds.minY), 0.01);
  assert.throws(() => math.projectionFrame({minX: 0,minY: 0,maxX: 0,maxY: 2}), /范围无效/);
});

test('calibrated online camera matches independent perspective projections, including roofs, roll and offset origin', () => {
  const { math } = loadModules();
  const origin = [700000, 3000000, 100], unit = 60;
  const camera = new THREE.PerspectiveCamera(5, 1, 1, 100000);
  camera.up.set(0.4, 1, 0);
  camera.position.set(origin[0] + 10, origin[1] - 2, origin[2] + 3000);
  camera.lookAt(...origin); camera.updateMatrixWorld();
  const actual = point => { const p = new THREE.Vector3(...point).project(camera); return [(p.x + 1) / 2, (1 - p.y) / 2]; };
  const samples = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
    const point = [origin[0] + x * unit, origin[1] + y * unit, origin[2] + z * unit];
    samples.push({ point, uv: actual(point) });
  }
  const transform = math.fitProjectionCamera(samples, origin, unit);
  for (const offset of [[0,0,0], [60,20,190], [-70,45,15], [20,-90,75]]) {
    const point = offset.map((v,i) => v + origin[i]);
    const result = math.projectWorldPoint(point, { ...record(), transform });
    const expected = actual(point);
    close(result[0], expected[0]); close(result[1], expected[1]);
  }
  assert.throws(() => math.fitProjectionCamera(samples.slice(0,4), origin, unit), /不足/);
  assert.throws(() => math.fitProjectionCamera(Array(8).fill(samples[0]), origin, unit), /无法校准/);
  assert.equal(math.projectWorldPoint([NaN, 0, 0], record()), null);
});

test('event map positions use exact model anchors, survive camera changes and never use stale relative positions', () => {
  const { coordinates } = loadModules();
  const issue = { sceneAnchor: { modelId:'village-a', position:[25, -20, 90] }, location:{local:{x:-999,y:0,z:999}} };
  const position = coordinates.issueOnProjection(issue, 'village-a', record());
  close(position.x, 25); close(position.z, 20);
  const changedCamera = {position:[9999,9999,9999],target:[42,42,42]};
  const again = coordinates.issueOnProjection(issue, 'village-a', record(), changedCamera);
  close(again.x, 25); close(again.z, 20);
  assert.equal(coordinates.issueOnProjection(issue, 'other-village', record()), null);
});

test('projection caches isolate villages, restore PNG and calibration, reject corrupt records and permanently retain every village', async () => {
  const database = new IDBFactory();
  const { cache } = loadModules(database);
  assert.equal(await cache.readProjection('missing'), null);
  await cache.saveProjection(record());
  const restored = await loadModules(database).cache.readProjection('village-a');
  assert.equal(await restored.image.text(), 'png');
  assert.equal(restored.transform.kind, 'orthographic');
  assert.equal(restored.bounds.minX, -100);
  await assert.rejects(cache.saveProjection({...record(),transform:{kind:'projective',matrix:[1]}}), /不完整/);
  assert.equal((await cache.readProjection('village-a')).transform.kind,'orthographic');
  for (let i=1;i<=6;i++) await cache.saveProjection(record(`village-${i}`,`2026-10-21T13:00:0${i}Z`));
  assert.equal((await cache.readProjection('village-a')).modelId,'village-a');
  assert.equal((await cache.readProjection('village-1')).modelId,'village-1');
  for (let i=2;i<=6;i++) assert.equal((await cache.readProjection(`village-${i}`)).modelId,`village-${i}`);
});


test('online capture waits for final camera pose and FOV rather than the start-of-move acknowledgement', async () => {
  const { camera } = loadModules();
  const expected = {position:[0,-0.001,5000],target:[0,0,0]};
  let readings = 0;
  const api = {
    getCameraLookAt(callback) { readings++; callback(null, readings < 3 ? reference : expected); },
    getFov(callback) { callback(null,readings < 5 ? 45 : 5); },
  };
  const fitted = await camera.waitForProjectionCamera(api, undefined, expected, 5);
  assert.equal(fitted.position[2], 5000);
  assert(readings >= 9);
  const controller = new AbortController();
  const pending = camera.waitForProjectionCamera(api, controller.signal);
  controller.abort();
  await assert.rejects(pending, /取消/);
});
