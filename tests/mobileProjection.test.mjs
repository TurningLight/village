import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';
import { validIssue } from '../server/issues.mjs';

function modules() {
  const cache = new Map();
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
      require: (name) => load(new URL(`${name}.ts`, url)),
      ArrayBuffer,
      Promise,
      Number,
      Date,
    });
    return module.exports;
  }
  return {
    coordinates: load(new URL('../src/lib/projectionCoordinates.ts', import.meta.url)),
    math: load(new URL('../src/lib/projectionMath.ts', import.meta.url)),
    issues: load(new URL('../src/lib/issues.ts', import.meta.url)),
    repository: load(new URL('../src/services/issueService.ts', import.meta.url)),
  };
}
const createdAt = '2026-10-22T04:00:00Z';
const projection = (override = {}) => ({
  modelId: 'real-village-a',
  createdAt,
  bounds: { minX: -100, minY: -50, maxX: 100, maxY: 50 },
  transform: { kind: 'orthographic' },
  reference: { position: [100, -150, 200], target: [0, 0, 0] },
  ...override,
});
const issue = (override = {}) => ({
  id: 'issue-projection-test',
  title: '房前路灯损坏',
  description: '房前路灯连续两晚未亮',
  category: '设施故障',
  severity: 'medium',
  status: 'pending',
  area: '东侧',
  reporter: '测试村民',
  createdAt,
  updatedAt: createdAt,
  location: { local: { x: 0, y: 0, z: 0 }, geo: { lng: 0, lat: 0 } },
  history: [{ time: createdAt, status: 'pending', operator: '测试村民', note: '问题已上报' }],
  ...override,
});
const close = (a, b, tolerance = 1e-6) =>
  assert(Math.abs(a - b) < tolerance, `${a} differs from ${b}`);
const atHeight = (ray, z) => {
  const t = (z - ray.start[2]) / (ray.end[2] - ray.start[2]);
  return ray.start.map((n, i) => n + (ray.end[i] - n) * t);
};

test('mobile orthographic picks retain exact normalized UV and use a vertical mesh ray, without claiming a surface hit', () => {
  const { coordinates, math } = modules(),
    map = projection(),
    uv = [0.625, 0.7];
  const anchor = coordinates.createProjectionAnchor(uv, map);
  assert(anchor);
  assert.equal(anchor.modelId, map.modelId);
  assert.equal(anchor.projectionCreatedAt, createdAt);
  close(anchor.ray.start[0], 25);
  close(anchor.ray.start[1], -20);
  close(anchor.ray.end[0], 25);
  close(anchor.ray.end[1], -20);
  assert(anchor.ray.start[2] > 100 && anchor.ray.end[2] < -100);
  for (const z of [-50, 0, 130]) {
    const actual = math.projectWorldPoint(atHeight(anchor.ray, z), map);
    close(actual[0], uv[0]);
    close(actual[1], uv[1]);
  }
  const row = issue({ projectionAnchor: anchor });
  assert.equal(row.sceneAnchor, undefined);
  const local = coordinates.issueOnProjection(row, map.modelId, map);
  close(local.x, 25);
  close(local.z, 20);
});

test('calibrated perspective image picks invert camera roll and large model origins at varying roof heights', () => {
  const { coordinates, math } = modules();
  const origin = [700000, 3000000, 140],
    unit = 70;
  const camera = new THREE.PerspectiveCamera(5, 1.4, 1, 100000);
  camera.up.set(0.3, 1, 0);
  camera.position.set(origin[0] + 20, origin[1] - 4, origin[2] + 4000);
  camera.lookAt(...origin);
  camera.updateMatrixWorld();
  const actual = (point) => {
    const p = new THREE.Vector3(...point).project(camera);
    return [(p.x + 1) / 2, (1 - p.y) / 2];
  };
  const samples = [];
  for (const x of [-1, 1])
    for (const y of [-1, 1])
      for (const z of [-1, 1]) {
        const point = [origin[0] + x * unit, origin[1] + y * unit, origin[2] + z * unit];
        samples.push({ point, uv: actual(point) });
      }
  const transform = math.fitProjectionCamera(samples, origin, unit);
  const map = projection({
    transform,
    bounds: {
      minX: origin[0] - 100,
      maxX: origin[0] + 100,
      minY: origin[1] - 100,
      maxY: origin[1] + 100,
    },
    reference: { position: camera.position.toArray(), target: origin },
  });
  for (const offset of [
    [0, 0, 0],
    [40, -25, 190],
    [-70, 40, 30],
    [20, 60, 80],
  ]) {
    const point = origin.map((n, i) => n + offset[i]),
      uv = actual(point),
      anchor = coordinates.createProjectionAnchor(uv, map);
    assert(anchor);
    const unprojected = atHeight(anchor.ray, point[2]);
    unprojected.forEach((n, i) => close(n, point[i], 1e-5));
    const reprojected = math.projectWorldPoint(unprojected, map);
    close(reprojected[0], uv[0]);
    close(reprojected[1], uv[1]);
  }
});

test('a mobile image ray resolves against the real mesh and never substitutes display-plane coordinates on a miss', async () => {
  const { coordinates } = modules(),
    anchor = coordinates.createProjectionAnchor([0.625, 0.7], projection());
  const root = new THREE.Group();
  const roof = new THREE.Mesh(new THREE.BoxGeometry(15, 10, 32), new THREE.MeshBasicMaterial());
  roof.position.set(25, -20, 16);
  root.add(roof);
  root.updateMatrixWorld(true);
  let calls = 0;
  const pick = (start, end, callback) => {
    calls++;
    const from = new THREE.Vector3(...start),
      direction = new THREE.Vector3(...end).sub(from).normalize();
    const hits = new THREE.Raycaster(from, direction).intersectObject(root, true);
    callback(null, hits.length ? { position3D: hits[0].point.toArray() } : {});
  };
  const hit = await coordinates.projectionSurfacePoint(anchor, 'real-village-a', pick);
  close(hit[0], 25);
  close(hit[1], -20);
  close(hit[2], 32);
  const miss = coordinates.createProjectionAnchor([0.1, 0.1], projection());
  assert.equal(await coordinates.projectionSurfacePoint(miss, 'real-village-a', pick), null);
  assert.equal(await coordinates.projectionSurfacePoint(anchor, 'other-village', pick), null);
  assert.equal(calls, 2, 'a foreign model must never be raycast');
  assert.equal(
    await coordinates.projectionSurfacePoint(anchor, 'real-village-a', (_a, _b, cb) =>
      cb(new Error('viewer failed'), {}),
    ),
    null,
  );
  assert.equal(
    await coordinates.projectionSurfacePoint(anchor, 'real-village-a', (_a, _b, cb) =>
      cb(null, { position3D: [NaN, 0, 0] }),
    ),
    null,
  );
});

test('mobile anchors isolate models and capture versions while exact 3D anchors and legacy records retain their mapping', () => {
  const { coordinates, issues } = modules(),
    map = projection();
  const anchor = coordinates.createProjectionAnchor([0.3, 0.4], map),
    row = issue({ projectionAnchor: anchor });
  assert.equal(issues.issuesForModel([row], 'real-village-a').length, 1);
  assert.equal(issues.issuesForModel([row], 'qinghe-demo').length, 0);
  assert.equal(issues.issuesForModel([row], 'other').length, 0);
  const moved = projection({ createdAt: '2026-10-23T04:00:00Z' });
  assert.equal(
    coordinates.issueOnProjection(row, map.modelId, moved),
    null,
    'never reuse UV after crop or camera changes',
  );
  assert.equal(coordinates.issueOnProjection(row, 'other', map), null);
  const exact = issue({ sceneAnchor: { modelId: map.modelId, position: [25, -20, 90] } });
  const position = coordinates.issueOnProjection(exact, map.modelId, moved);
  close(position.x, 25);
  close(position.z, 20);
  assert.equal(issues.issuesForModel([exact], 'other').length, 0);
  assert.equal(issues.issuesForModel([issue()], 'qinghe-demo').length, 1);
  assert.equal(issues.issuesForModel([issue()], 'new-real-village').length, 0);
});

test('client and server reject corrupt projection anchors and camera inversions without dropping valid image reports', () => {
  const { coordinates, issues, repository } = modules(),
    map = projection();
  const anchor = coordinates.createProjectionAnchor([0, 1], map),
    row = issue({ projectionAnchor: anchor });
  assert(issues.validProjectionAnchor(anchor));
  assert(repository.isIssueList([row]));
  assert(validIssue(row));
  for (const bad of [
    null,
    {},
    { ...anchor, modelId: '' },
    { ...anchor, projectionCreatedAt: 'invalid' },
    { ...anchor, uv: [NaN, 0] },
    { ...anchor, uv: [1.01, 0.5] },
    { ...anchor, uv: [0.1] },
    { ...anchor, ray: { start: [1, 2, 3], end: [1, 2, 3] } },
    { ...anchor, ray: { start: [1, Infinity, 3], end: [1, 2, 0] } },
  ]) {
    assert.equal(issues.validProjectionAnchor(bad), false);
    if (bad) {
      assert.equal(repository.isIssueList([issue({ projectionAnchor: bad })]), false);
      assert.equal(validIssue(issue({ projectionAnchor: bad })), false);
    }
  }
  assert.equal(coordinates.createProjectionAnchor([-0.01, 0.5], map), null);
  assert.equal(
    coordinates.createProjectionAnchor(
      [0.5, 0.5],
      projection({
        transform: { kind: 'projective', matrix: Array(11).fill(0), origin: [0, 0, 0], unit: 1 },
      }),
    ),
    null,
  );
  assert.equal(
    coordinates.createProjectionAnchor(
      [0.5, 0.5],
      projection({ bounds: { minX: 0, maxX: 0, minY: 0, maxY: 1 } }),
    ),
    null,
  );
});
