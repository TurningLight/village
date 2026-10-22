import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function viewerHarness() {
  const state = { frames: 0, stopped: 0, started: 0, timeout: null, options: null, ready: null, modelId: null };
  const api = { start() { state.started++; }, stop() { state.stopped++; }, addEventListener(event, callback) { if (event === 'viewerready') state.ready = callback; } };
  class Sketchfab {
    init(id, options) { state.modelId = id; state.options = options; options.success(api); }
  }
  const module = { exports: {} };
  const source = fs.readFileSync(new URL('../src/lib/sketchfab.ts', import.meta.url), 'utf8').replaceAll('import.meta.env.BASE_URL', "'/'");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(output, {
    module, exports: module.exports, Error,
    window: { Sketchfab, setTimeout(callback) { state.timeout = callback; return 1; } },
    clearTimeout() { state.timeout = null; },
    document: {
      createElement() { return { style: {}, setAttribute() {}, remove() { state.frames--; } }; },
      body: { appendChild() { state.frames++; } },
    },
  });
  return { state, validate: module.exports.validateSketchfabModel };
}

test('online validation waits for viewerready and cleans up the preview frame', async () => {
  const { state, validate } = viewerHarness();
  let resolved = false;
  const pending = validate('2b79987cd49c4727b1bd12aa7ab62927').then(() => { resolved = true; });
  await Promise.resolve();
  assert.equal(state.frames, 1);
  assert.equal(state.started, 1);
  assert.equal(resolved, false);
  state.ready();
  await pending;
  assert.equal(resolved, true);
  assert.equal(state.frames, 0);
  assert.equal(state.stopped, 1);
  assert.equal(state.timeout, null);
});

test('online connection failure and timeout reject without leaving background frames', async () => {
  for (const failure of ['error', 'timeout']) {
    const { state, validate } = viewerHarness();
    const pending = validate('1234567890abcdef1234567890abcdef');
    const rejected = assert.rejects(pending, /原地图已保留/);
    await Promise.resolve();
    if (failure === 'error') state.options.error(); else state.timeout();
    await rejected;
    assert.equal(state.frames, 0);
    assert.equal(state.stopped, 1);
    state.ready();
    assert.equal(state.frames, 0, 'late viewerready cannot finish or remove the frame twice');
  }
});
