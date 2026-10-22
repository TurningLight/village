import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadApp } from './helpers/appHarness.mjs';

const plain = (value) => JSON.parse(JSON.stringify(value));
function setup(storage, failWrites) {
  const app = loadApp(storage, failWrites);
  return {
    ...app,
    markerStore: app.load('src/store/useDesktopMarkerStore.ts').useDesktopMarkerStore,
    markers: app.load('src/lib/desktopIssueMarkers.ts'),
  };
}
function visible(app, issue) {
  return app.markers.desktopIssueMarkerVisible(issue, app.markerStore.getState().acknowledged);
}

const entry = (time, status, note = '状态记录') => ({ time, status, note, operator: '测试员' });

test('viewing a completed archive hides only its desktop marker and survives a page reload', () => {
  const app = setup();
  const issue = app.store.getState().village.issues.find((item) => item.status === 'completed');
  const before = plain(app.store.getState().village.issues);
  const { filteredIssues, DEMO_MODEL_ID, issuesForModel } = app.load('src/lib/issues.ts');
  assert.equal(visible(app, issue), true);
  app.markerStore.getState().acknowledgeViewedIssue(issue);
  assert.equal(visible(app, issue), false);
  assert.deepEqual(
    plain(app.store.getState().village.issues),
    before,
    'reading is not an event edit',
  );
  assert(
    filteredIssues(
      issuesForModel(app.store.getState().village.issues, DEMO_MODEL_ID),
      'all',
      'completed',
    ).some((item) => item.id === issue.id),
    'archive lists and shared/mobile selectors retain completed records',
  );
  const restored = setup(app.storage);
  assert.equal(visible(restored, issue), false);
  const pending = app.store.getState().village.issues.find((item) => item.status === 'pending');
  assert.equal(visible(restored, pending), true);
});

test('reading an open issue does not prematurely dismiss its future completed marker', () => {
  const app = setup();
  const issue = app.store.getState().village.issues.find((item) => item.status === 'pending');
  app.markerStore.getState().acknowledgeViewedIssue(issue);
  assert.equal(Object.keys(app.markerStore.getState().acknowledged).length, 0);
  const completed = {
    ...issue,
    status: 'completed',
    history: [...issue.history, entry('2026-10-22T04:00:00Z', 'completed')],
  };
  assert.equal(visible(app, completed), true);
  app.markerStore.getState().acknowledgeViewedIssue(completed);
  assert.equal(visible(app, completed), false);
});

test('a completion note stays acknowledged, while reopen and reclose create a fresh marker even in the same millisecond', () => {
  const app = setup();
  const base = app.store.getState().village.issues[0];
  const time = '2026-10-22T04:00:00Z';
  const first = {
    ...base,
    status: 'completed',
    history: [entry(time, 'pending'), entry(time, 'completed')],
  };
  app.markerStore.getState().acknowledgeViewedIssue(first);
  const annotated = {
    ...first,
    title: '补充标题',
    updatedAt: '2026-10-22T05:00:00Z',
    history: [...first.history, entry(time, 'completed', '补充验收说明')],
  };
  assert.equal(visible(app, annotated), false);
  const reopened = {
    ...annotated,
    status: 'processing',
    history: [...annotated.history, entry(time, 'processing', '复查重新受理')],
  };
  assert.equal(visible(app, reopened), true);
  const second = {
    ...reopened,
    status: 'completed',
    history: [...reopened.history, entry(time, 'completed', '再次办结')],
  };
  assert.equal(visible(app, second), true);
  app.markerStore.getState().acknowledgeViewedIssue(second);
  assert.equal(visible(app, second), false);
});

test('same IDs in different actual villages have independent desktop acknowledgements', () => {
  const app = setup();
  const original = app.store
    .getState()
    .village.issues.find((issue) => issue.status === 'completed');
  const first = {
    ...original,
    projectionAnchor: undefined,
    sceneAnchor: { modelId: 'real-village-a', position: [1, 2, 3] },
  };
  const second = { ...first, sceneAnchor: { ...first.sceneAnchor, modelId: 'real-village-b' } };
  app.markerStore.getState().acknowledgeViewedIssue(first);
  assert.equal(visible(app, first), false);
  assert.equal(visible(app, second), true);
});

test('the rendered desktop fallback map removes a read completed circle without removing active circles', () => {
  const app = setup();
  const completed = app.store
    .getState()
    .village.issues.find((issue) => issue.status === 'completed');
  const pending = app.store.getState().village.issues.find((issue) => issue.status === 'pending');
  const { DEMO_MODEL_ID } = app.load('src/lib/issues.ts');
  const Map = app.load('src/components/map/MapFallback.tsx').default;
  const before = renderToStaticMarkup(
    React.createElement(Map, { demo: true, modelId: DEMO_MODEL_ID }),
  );
  assert(before.includes(`定位问题：${completed.title}`));
  app.markerStore.getState().acknowledgeViewedIssue(completed);
  const restored = setup(app.storage);
  const RestoredMap = restored.load('src/components/map/MapFallback.tsx').default;
  const after = renderToStaticMarkup(
    React.createElement(RestoredMap, { demo: true, modelId: DEMO_MODEL_ID }),
  );
  assert(!after.includes(`定位问题：${completed.title}`));
  assert(after.includes(`定位问题：${pending.title}`));
  assert.equal(
    restored.store.getState().village.issues.length,
    app.store.getState().village.issues.length,
  );
});

test('malformed local acknowledgements and denied storage never break event viewing', () => {
  const storage = new Map([['village-desktop-completed-markers-v1', '{invalid-json']]);
  const app = setup(storage, true);
  assert.equal(Object.keys(app.markerStore.getState().acknowledged).length, 0);
  const issue = app.store.getState().village.issues.find((item) => item.status === 'completed');
  app.markerStore.getState().acknowledgeViewedIssue(issue);
  assert.equal(visible(app, issue), false, 'in-memory dismiss still works');
  assert.equal(issue.status, 'completed');
});
