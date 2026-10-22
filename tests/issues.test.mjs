import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { webcrypto } from 'node:crypto';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { tmpdir } from 'node:os';
import { createIssueService } from '../server/issues.mjs';
import { loadApp as loadSharedApp } from './helpers/appHarness.mjs';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');

// Execute the real TypeScript store and selectors without browser/network use.
function loadApp(storage = new Map(), failWrites = false) {
  const cache = new Map();
  const localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => { if (failWrites) throw new Error('quota'); storage.set(key, value); },
  };
  let store;
  function load(relative) {
    const file = path.resolve(root, relative);
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file, module);
    const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
      fileName: file,
    }).outputText;
    const localRequire = (name) => {
      if (name.endsWith('.css')) return {};
      if (!name.startsWith('.')) return require(name);
      let target = path.resolve(path.dirname(file), name);
      if (!path.extname(target)) target += fs.existsSync(target + '.tsx') ? '.tsx' : '.ts';
      // SSR uses the real current store state instead of Zustand's frozen
      // getInitialState snapshot; no UI event is simulated by a browser.
      if (store && target === path.resolve(root, 'src/store/useAppStore.ts')) return { useAppStore: (selector) => selector(store.getState()) };
      return load(target);
    };
    vm.runInNewContext(output, {
      module, exports: module.exports, require: localRequire, localStorage, crypto: webcrypto,
      console: { ...console, error() {} }, Date, Math, Map, Set, Error,
    }, { filename: file });
    return module.exports;
  }
  store = load('src/store/useAppStore.ts').useAppStore;
  return { store, storage, helpers: load('src/lib/issues.ts'), load };
}

function issueInput() {
  return {
    title: '  巷道排水疏通  ', description: '  清理堵塞物  ', category: '积水问题', severity: 'high', status: 'pending',
    location: { local: { x: 12, y: 3, z: -18 }, geo: { lng: 120.5, lat: 30.5 } },
    sceneAnchor: { modelId: '2b79987cd49c4727b1bd12aa7ab62927', position: [23.45, -67.89, 12.34] },
    area: '村内选点', reporter: '管理员',
  };
}

test('uploaded maps isolate their anchors and pending list from other models and legacy demo data', () => {
  const app = loadApp();
  const local = app.store.getState().addIssue({ ...issueInput(), title: '当前上传地图事件', sceneAnchor: { modelId: 'local-a', position: [1, 2, 3] } });
  app.store.getState().addIssue({ ...issueInput(), title: '其他地图事件', sceneAnchor: { modelId: 'local-b', position: [4, 5, 6] } });
  const issues = app.store.getState().village.issues;
  assert.equal(app.helpers.issuesForModel(issues, 'local-a').length, 1);
  assert.equal(app.helpers.issuesForModel(issues, 'local-a')[0].id, local.id);
  assert(!app.helpers.issuesForModel(issues).some((issue) => issue.sceneAnchor?.modelId?.startsWith('local-')));
  app.store.getState().selectIssue(null);
  const Panel = app.load('src/components/issues/IssuePanel.tsx').default;
  const markup = renderToStaticMarkup(React.createElement(Panel, { modelId: 'local-a', draft: null }));
  assert(markup.includes('当前上传地图事件'));
  assert(!markup.includes('其他地图事件'));
  assert(!markup.includes('村口道路局部破损'));
});

test('new event saves exact clicked model coordinates, selects marker, enables layer and resets filters', () => {
  const { store, storage } = loadApp();
  store.setState({ showIssues: false, filterCategory: '其他', filterStatus: 'processing' });
  const before = store.getState().village.issues.length;
  const result = store.getState().addIssue(issueInput());
  const state = store.getState();
  assert.equal(state.village.issues.length, before + 1);
  assert.equal(result.title, '巷道排水疏通');
  assert.equal(result.description, '清理堵塞物');
  assert.equal(state.selectedIssueId, result.id);
  assert.equal(state.showIssues, true);
  assert.equal(state.filterCategory, 'all');
  assert.equal(state.filterStatus, 'all');
  assert.equal(result.status, 'pending');
  assert.equal(JSON.stringify(result.sceneAnchor), JSON.stringify(issueInput().sceneAnchor));
  assert.equal(JSON.parse(storage.get('village-issues')).at(-1).sceneAnchor.position[0], 23.45);
});

test('completion removes event from all active markers and pending rows, retains history and updates counts', () => {
  const { store, helpers } = loadApp();
  const created = store.getState().addIssue(issueInput());
  const before = store.getState().village.issues;
  const count = helpers.activeIssues(before).length;
  const completed = before.filter((issue) => issue.status === 'completed').length;
  store.getState().updateIssueStatus(created.id, 'completed', '现场已处理完毕');
  const state = store.getState();
  assert.equal(helpers.activeIssues(state.village.issues).length, count - 1);
  assert(!helpers.activeIssues(state.village.issues).some((issue) => issue.id === created.id));
  assert.equal(state.village.issues.length, before.length);
  assert.equal(state.village.issues.filter((issue) => issue.status === 'completed').length, completed + 1);
  assert.equal(state.selectedIssueId, null);
  assert.equal(state.village.issues.at(-1).history.at(-1).note, '现场已处理完毕');
});

test('repeated completion is idempotent; legacy demonstration events can also be completed', () => {
  const { store, helpers } = loadApp();
  const target = helpers.activeIssues(store.getState().village.issues)[0];
  store.getState().selectIssue(target.id);
  store.getState().updateIssueStatus(target.id, 'completed', '已办结');
  const historyLength = store.getState().village.issues.find((issue) => issue.id === target.id).history.length;
  store.getState().updateIssueStatus(target.id, 'completed', '重复点击');
  assert.equal(store.getState().village.issues.find((issue) => issue.id === target.id).history.length, historyLength);
  assert(!helpers.activeIssues(store.getState().village.issues).some((issue) => issue.id === target.id));
});

test('reload restores new anchors and keeps completed events out of pending', () => {
  const app = loadApp();
  const active = app.store.getState().addIssue(issueInput());
  const completed = app.store.getState().addIssue({ ...issueInput(), title: '另一个事件' });
  app.store.getState().updateIssueStatus(completed.id, 'completed', '办结');
  const reloaded = loadApp(app.storage);
  const rows = reloaded.store.getState().village.issues;
  assert(reloaded.helpers.activeIssues(rows).some((issue) => issue.id === active.id));
  assert(!reloaded.helpers.activeIssues(rows).some((issue) => issue.id === completed.id));
  assert.equal(JSON.stringify(rows.find((issue) => issue.id === active.id).sceneAnchor), JSON.stringify(active.sceneAnchor));
});

test('mobile report photos survive desktop synchronization, processing, completion and repository reopen', async (t) => {
  const directory = fs.mkdtempSync(path.join(tmpdir(), 'village-desktop-photos-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'issues.json');
  const repository = createIssueService(file);
  const images = [
    `data:image/png;base64,${fs.readFileSync(path.join(root, 'tests/fixtures/models/gltf-folder/textures/测试纹理.png')).toString('base64')}`,
    'data:image/jpeg;base64,/9j/',
  ];
  const report = {
    ...issueInput(),
    id: 'issue-mobile-photo-roundtrip',
    reporter: '测试村民',
    residentId: 'resident-photo-test',
    createdAt: '2026-01-01T01:00:00Z',
    updatedAt: '2026-01-01T01:00:00Z',
    images,
    history: [{ time: '2026-01-01T01:00:00Z', status: 'pending', operator: '测试村民', note: '问题已上报' }],
  };
  await repository.merge([report], { createOnly: true });

  const desktop = loadSharedApp(new Map([['village-issues', '[]']]));
  const { applySharedIssues } = desktop.load('src/services/sharedIssueSync.ts');
  applySharedIssues(await repository.read());
  const current = () => desktop.store.getState().village.issues.find((issue) => issue.id === report.id);
  assert.equal(JSON.stringify(current().images), JSON.stringify(images));

  for (const [status, note] of [['processing', '已受理照片上报'], ['completed', '已核对照片并完成处置']]) {
    desktop.store.getState().updateIssueStatus(report.id, status, note);
    assert.equal(JSON.stringify(current().images), JSON.stringify(images));
    await repository.merge([current()]);
    applySharedIssues(await repository.read());
  }
  const restored = (await createIssueService(file).read())[0];
  assert.equal(restored.status, 'completed');
  assert.equal(restored.history.length, 3);
  assert.equal(restored.residentId, report.residentId);
  assert.deepEqual(restored.images, images);
  assert.deepEqual(JSON.parse(desktop.storage.get('village-issues'))[0].images, images);
});

test('failed storage writes neither create events nor remove pending/highlight state', () => {
  const { store, helpers } = loadApp(new Map(), true);
  const before = store.getState().village.issues;
  assert.throws(() => store.getState().addIssue(issueInput()), /保存失败/);
  assert.equal(store.getState().village.issues, before);
  const target = helpers.activeIssues(before)[0];
  store.getState().selectIssue(target.id);
  assert.throws(() => store.getState().updateIssueStatus(target.id, 'completed', '办结'), /保存失败/);
  assert.equal(store.getState().selectedIssueId, target.id);
  assert.equal(store.getState().village.issues.find((issue) => issue.id === target.id).status, target.status);
});

test('validation rejects whitespace titles and invalid clicked points, rapid creates use unique ids', () => {
  const { store } = loadApp();
  assert.throws(() => store.getState().addIssue({ ...issueInput(), title: '   ' }), /标题/);
  assert.throws(() => store.getState().addIssue({ ...issueInput(), sceneAnchor: { modelId: 'x', position: [NaN, 0, 0] } }), /位置无效/);
  const first = store.getState().addIssue(issueInput());
  const second = store.getState().addIssue(issueInput());
  assert.notEqual(first.id, second.id);
});

test('empty saved data is preserved; malformed saved data falls back safely', () => {
  assert.equal(loadApp(new Map([['village-issues', '[]']])).store.getState().village.issues.length, 0);
  for (const raw of ['{bad json', '{}', '[null]']) {
    const state = loadApp(new Map([['village-issues', raw]])).store.getState();
    assert.equal(state.village.issues.length, 8);
  }
});

test('legacy model/local conversion preserves horizontal coordinates using the fitted camera reference', () => {
  const { helpers } = loadApp();
  const camera = { position: [200, -300, 400], target: [10, 20, 30] };
  const point = [45, -78, 92];
  const local = helpers.modelPointToLocal(point, camera);
  assert(Math.abs(local.x - (45 - 10) / helpers.modelScale(camera)) < 1e-10);
  assert(Math.abs(local.z - 98 / helpers.modelScale(camera)) < 1e-10);
  const projected = helpers.localToModelPoint(local, camera);
  assert(Math.abs(projected[0] - point[0]) < 1e-10);
  assert(Math.abs(projected[1] - point[1]) < 1e-10);
});

test('form and event detail render labeled fields and completion control; completed rows disappear', () => {
  const app = loadApp();
  const Panel = app.load('src/components/issues/IssuePanel.tsx').default;
  const props = { draft: null, onCancelDraft() {}, onSaved() {}, onClose() {}, onNotice() {}, onLocate() {} };
  const form = renderToStaticMarkup(React.createElement(Panel, { ...props, draft: { position: [1, 2, 3], local: { x: 0, y: 0, z: 0 } } }));
  assert(form.includes('录入待办事件'));
  assert(form.includes('id="issue-title"'));
  assert(form.includes('加入待办'));
  const issue = app.store.getState().addIssue(issueInput());
  const detail = renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(Panel, props)));
  assert(detail.includes('确认办结'));
  assert(detail.includes('巷道排水疏通'));
  app.store.getState().updateIssueStatus(issue.id, 'completed', '完成');
  const list = renderToStaticMarkup(React.createElement(Panel, props));
  assert(!list.includes('巷道排水疏通'));
  assert(!list.includes('确认办结'));
});

test('desktop event details expose all synchronized photos and omit the gallery for records without photos', () => {
  const app = loadApp();
  const Panel = app.load('src/components/issues/IssuePanel.tsx').default;
  const photos = ['data:image/jpeg;base64,cGhvdG8tMQ==', 'data:image/png;base64,cGhvdG8tMg=='];
  app.store.getState().addIssue({ ...issueInput(), images: photos });
  const render = () => renderToStaticMarkup(React.createElement(MemoryRouter, null,
    React.createElement(Panel, { draft: null })));
  const detail = render();
  for (const src of photos) assert(detail.includes(src), 'the saved photo reaches the rendered detail');
  assert(detail.includes('查看第 1 张现场照片'));
  assert(detail.includes('查看第 2 张现场照片'));
  assert(detail.includes('关闭照片预览'));
  app.store.getState().addIssue(issueInput());
  assert(!render().includes('上报现场照片'), 'an empty record does not show a broken or placeholder photo');
});

function pickingHarness(app, onHit = () => {}) {
  let listener;
  const rays = [];
  const misses = [];
  const api = {
    addEventListener(name, handler, options) {
      assert.equal(name, 'click');
      assert.equal(options.pick, 'fast');
      listener = handler;
    },
    removeEventListener(name, handler) {
      assert.equal(name, 'click');
      assert.equal(listener, handler);
      listener = null;
    },
    pickFromScreen(screen, callback) { rays.push({ screen, callback }); },
  };
  const { listenForModelClicks } = app.load('src/lib/modelPicking.ts');
  const stop = listenForModelClicks(api, onHit, (message) => misses.push(message));
  return { emit: (info) => listener?.(info), rays, misses, stop };
}

test('viewer typed-array click coordinates reach event creation and reload as JSON arrays', () => {
  const app = loadApp();
  const camera = { position: [200, -300, 400], target: [10, 20, 30] };
  const { createLocation } = app.load('src/lib/coordinate.ts');
  const created = [];
  const picker = pickingHarness(app, (point) => {
    const input = issueInput();
    created.push(app.store.getState().addIssue({
      ...input,
      location: createLocation(app.helpers.modelPointToLocal(point, camera)),
      sceneAnchor: { modelId: input.sceneAnchor.modelId, position: point },
    }));
  });
  // Previously the click entry silently returned for these valid API values.
  assert.equal(app.helpers.validModelPoint(new Float64Array([12, 34, 56])), false);
  for (const position3D of [[12, 34, 56], new Float32Array([12, 34, 56]), new Float64Array([12, 34, 56])]) {
    picker.emit({ position3D });
  }
  assert.equal(created.length, 3);
  const reloaded = loadApp(app.storage);
  for (const event of created) {
    const restored = reloaded.store.getState().village.issues.find((issue) => issue.id === event.id);
    assert(Array.isArray(restored.sceneAnchor.position));
    assert.equal(JSON.stringify(restored.sceneAnchor.position), '[12,34,56]');
  }
  assert.equal(picker.rays.length, 0);
  assert.equal(picker.misses.length, 0);
  picker.stop();
});

test('screen-only clicks use viewer raycasting without changing pixel ratio or Y origin', () => {
  const app = loadApp();
  const points = [];
  const picker = pickingHarness(app, (point) => points.push(point));
  picker.emit({ position2D: new Float64Array([640, 180]) });
  assert.equal(JSON.stringify(picker.rays[0].screen), '[640,180]');
  assert.equal(points.length, 0);
  picker.rays[0].callback(null, { position3D: new Float64Array([21, 22, 23]) });
  assert.equal(JSON.stringify(points), '[[21,22,23]]');
  picker.stop();
});

test('misses and raycast failures give feedback and never fabricate a location', () => {
  const app = loadApp();
  const points = [];
  const picker = pickingHarness(app, (point) => points.push(point));
  picker.emit({ position3D: [NaN, 1, 2] });
  picker.emit({ position2D: [30, 40] });
  picker.rays[0].callback(null, {});
  picker.emit({ position2D: [30, 40] });
  picker.rays[1].callback(new Error('pick failed'));
  assert.equal(points.length, 0);
  assert.equal(picker.misses.length, 3);
  assert.match(picker.misses[0], /未取得/);
  assert.match(picker.misses[1], /未命中/);
  assert.match(picker.misses[2], /失败/);
  picker.stop();
});

test('out-of-order or disposed picking responses cannot reopen a stale location', () => {
  const app = loadApp();
  const points = [];
  const picker = pickingHarness(app, (point) => points.push(point));
  picker.emit({ position2D: [10, 20] });
  picker.emit({ position3D: [4, 5, 6] });
  picker.rays[0].callback(null, { position3D: [1, 2, 3] });
  assert.equal(JSON.stringify(points), '[[4,5,6]]');
  picker.emit({ position2D: [30, 40] });
  picker.stop();
  picker.rays[1].callback(null, { position3D: [7, 8, 9] });
  assert.equal(points.length, 1);
});
