import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './helpers/appHarness.mjs';

test('shared geometry preserves building IDs, closed rotated footprints and metre-based coordinates', () => {
  const app = loadApp(),
    { spatialGeoJSON, rectangle } = app.load('src/lib/spatial.ts');
  const { localToGeo, geoToLocal } = app.load('src/lib/coordinate.ts');
  const shapes = spatialGeoJSON(),
    village = app.store.getState().village;
  assert.equal(shapes.buildings.features.length, village.buildings.length);
  for (const building of village.buildings) {
    const feature = shapes.buildings.features.find((f) => f.id === building.id);
    assert(feature);
    const ring = feature.geometry.coordinates[0];
    assert.equal(ring.length, 5);
    assert.equal(JSON.stringify(ring[0]), JSON.stringify(ring[4]));
  }
  const corner = rectangle({ x: 0, y: 0, z: 0 }, 10, 4, Math.PI / 2)[0];
  assert(Math.abs(corner.x + 2) < 1e-8);
  assert(Math.abs(corner.z - 5) < 1e-8);
  const origin = localToGeo({ x: 0, y: 0, z: 0 }),
    east = localToGeo({ x: 100, y: 0, z: 0 }),
    north = localToGeo({ x: 0, y: 0, z: -100 });
  assert(
    Math.abs((east.lng - origin.lng) * 111000 * Math.cos((origin.lat * Math.PI) / 180) - 100) <
      1e-6,
  );
  assert(Math.abs((north.lat - origin.lat) * 111000 - 100) < 1e-6);
  const roundtrip = geoToLocal(localToGeo({ x: -52, y: 0, z: 37 }));
  assert(Math.abs(roundtrip.x + 52) < 1e-6);
  assert(Math.abs(roundtrip.z - 37) < 1e-6);
  assert(village.roads.every((r) => shapes.roads.features.some((f) => f.id === r.id)));
  assert(village.facilities.every((f) => shapes.facilities.features.some((g) => g.id === f.id)));
});

test('governance lifecycle saves acceptance, completion and reopening without losing history', () => {
  const app = loadApp(),
    s = app.store;
  const issue = s.getState().village.issues.find((i) => i.status === 'pending');
  const length = issue.history.length;
  s.getState().updateIssueStatus(issue.id, 'processing', '安排人员现场处理');
  s.getState().updateIssueStatus(issue.id, 'completed', '完成修复');
  s.getState().updateIssueStatus(issue.id, 'pending', '复查后重新受理');
  const restored = loadApp(app.storage)
    .store.getState()
    .village.issues.find((i) => i.id === issue.id);
  assert.equal(restored.status, 'pending');
  assert.equal(restored.history.length, length + 3);
  assert.equal(restored.history.at(-2).note, '完成修复');
  assert.equal(restored.history.at(-1).note, '复查后重新受理');
  assert.throws(() => s.getState().updateIssueStatus(issue.id, 'invalid', ''), /状态/);
});

test('all views share filtered events including completed records and exclusive object selection', () => {
  const app = loadApp(),
    s = app.store,
    { issuesForModel, filteredIssues, DEMO_MODEL_ID } = app.load('src/lib/issues.ts');
  const rows = issuesForModel(s.getState().village.issues, DEMO_MODEL_ID);
  const completed = filteredIssues(rows, 'all', 'completed');
  assert.equal(completed.length, 1);
  assert.equal(filteredIssues(rows, '其他', 'completed').length, 0);
  s.getState().selectIssue(rows[0].id);
  const first = s.getState().selectionRevision;
  s.getState().selectBuilding('building-01');
  assert.equal(s.getState().selectedIssueId, null);
  assert(s.getState().selectionRevision > first);
  s.getState().setCurrentRenovation('renovation-001');
  assert.equal(s.getState().selectedBuildingId, null);
  assert.equal(s.getState().renovationMode, 'before');
  const issueStatus = s.getState().village.issues.find((i) => i.id === 'issue-002').status;
  s.getState().setRenovationMode('after');
  assert.equal(s.getState().village.issues.find((i) => i.id === 'issue-002').status, issueStatus);
  s.getState().selectIssue(rows[0].id);
  assert.equal(s.getState().currentRenovationId, null);
});

test('new demo events stay isolated from imported real models after reload', () => {
  const app = loadApp(),
    { createLocation } = app.load('src/lib/coordinate.ts'),
    { issuesForModel, DEMO_MODEL_ID } = app.load('src/lib/issues.ts');
  const issue = app.store.getState().addIssue({
    title: '测试广场地砖',
    description: '局部地砖松动',
    category: '设施故障',
    severity: 'medium',
    status: 'pending',
    reporter: '管理员',
    area: '公共广场',
    location: createLocation({ x: -25, y: 0, z: -5 }),
    sceneAnchor: { modelId: DEMO_MODEL_ID, position: [-25, 0, -5] },
  });
  const restored = loadApp(app.storage).store.getState().village.issues;
  assert(issuesForModel(restored, DEMO_MODEL_ID).some((i) => i.id === issue.id));
  assert(!issuesForModel(restored).some((i) => i.id === issue.id));
  assert.equal(issuesForModel(restored, 'local-test').length, 0);
});

test('renovation areas and shared facilities stay aligned and outside building footprints', () => {
  const app = loadApp(),
    village = app.store.getState().village;
  const { buildingPositions } = app.load('src/data/villageLayout.ts');
  const pairs = [
    ['renovation-001', 'light-8'],
    ['renovation-002', 'square-01'],
    ['renovation-003', 'waste-01'],
  ];
  for (const [planId, facilityId] of pairs) {
    const point = village.renovations.find((p) => p.id === planId).location.local;
    const facility = village.facilities.find((f) => f.id === facilityId).location.local;
    assert.equal(JSON.stringify(point), JSON.stringify(facility));
    for (const building of buildingPositions) {
      const dx = point.x - building.position.x,
        dz = point.z - building.position.z;
      const localX = dx * Math.cos(building.rotation) - dz * Math.sin(building.rotation);
      const localZ = dx * Math.sin(building.rotation) + dz * Math.cos(building.rotation);
      assert(
        !(Math.abs(localX) < building.size.width / 2 && Math.abs(localZ) < building.size.depth / 2),
        `${planId} overlaps ${building.id}`,
      );
    }
  }
});
