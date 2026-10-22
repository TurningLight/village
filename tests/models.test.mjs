import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import ts from 'typescript';
import { IDBFactory } from 'fake-indexeddb';
import { unzipSync, zipSync, strToU8 } from 'three/addons/libs/fflate.module.js';

const fixtures = new URL('./fixtures/models/', import.meta.url);
function loadModules(indexedDB = new IDBFactory()) {
  const cache = new Map();
  function load(url) {
    if (cache.has(url.href)) return cache.get(url.href).exports;
    const module = { exports: {} };
    cache.set(url.href, module);
    const source = fs.readFileSync(url, 'utf8');
    const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(output, {
      module, exports: module.exports,
      require: (name) => name.startsWith('.') ? load(new URL(`${name}.ts`, url)) : ({ unzipSync }),
      indexedDB, crypto: webcrypto, Blob, File, DOMException, Uint8Array, Map, Set, Error, URL,
    });
    return module.exports;
  }
  return { storage: load(new URL('../src/lib/modelStorage.ts', import.meta.url)), sources: load(new URL('../src/lib/mapSources.ts', import.meta.url)) };
}
function loadStorage(indexedDB) { return loadModules(indexedDB).storage; }
function fixture(name) { return new File([fs.readFileSync(new URL(name, fixtures))], name); }

test('GLB resource bytes and model identity survive storage close/reopen and atomic replacement', async () => {
  const database = new IDBFactory();
  const storage = loadStorage(database);
  assert.equal(await storage.readSavedModel(), null);
  const model = await storage.collectModelFiles([fixture('示例村庄.glb')]);
  await storage.saveCurrentModel(model);
  const reopened = loadStorage(database);
  const restored = await reopened.readSavedModel();
  assert.equal(restored.id, model.id);
  assert.equal(restored.name, '示例村庄.glb');
  assert.deepEqual(new Uint8Array(await restored.files[0].blob.arrayBuffer()), new Uint8Array(await model.files[0].blob.arrayBuffer()));
  const next = await storage.collectModelFiles([fixture('示例村庄-gltf.zip')]);
  await storage.saveCurrentModel(next);
  assert.equal((await reopened.readSavedModel()).id, next.id);
});

test('failed replacement preserves the previously committed map', async () => {
  const storage = loadStorage();
  const original = await storage.collectModelFiles([fixture('示例村庄.glb')]);
  await storage.saveCurrentModel(original);
  await assert.rejects(storage.saveCurrentModel({ ...original, id: 'bad-model', uncloneable: () => {} }));
  assert.equal((await storage.readSavedModel()).id, original.id);
});

test('ZIP and selected folders preserve nested buffer and texture paths', async () => {
  const storage = loadStorage();
  const zip = await storage.collectModelFiles([fixture('示例村庄-gltf.zip')]);
  assert.equal(zip.entry, 'village/scene.gltf');
  assert(zip.files.some((file) => file.path === 'village/buffers/village.bin'));
  const entry = new File(['{}'], 'scene.gltf');
  Object.defineProperty(entry, 'webkitRelativePath', { value: 'village/scene.gltf' });
  const texture = new File(['png bytes'], 'roof.png');
  Object.defineProperty(texture, 'webkitRelativePath', { value: 'village/textures/roof.png' });
  const folder = await storage.collectModelFiles([entry, texture]);
  assert.equal(folder.entry, 'village/scene.gltf');
  assert.equal(folder.files[1].path, 'village/textures/roof.png');
});

test('unsupported, ambiguous, damaged archives and over-limit input fail before saving', async () => {
  const storage = loadStorage();
  await assert.rejects(storage.collectModelFiles([new File(['test'], 'model.obj')]), /未找到/);
  await assert.rejects(storage.collectModelFiles([fixture('示例村庄.glb'), new File(['{}'], 'scene.gltf')]), /多个模型/);
  await assert.rejects(storage.collectModelFiles([new File(['not zip'], 'broken.zip')]), /无法解压/);
  const oversized = new File(['small'], 'large.glb');
  Object.defineProperty(oversized, 'size', { value: storage.MAX_MODEL_BYTES + 1 });
  await assert.rejects(storage.collectModelFiles([oversized]), /512 MB/);
  const duplicate = zipSync({ 'scene.gltf': strToU8('{}'), 'folder/../scene.gltf': strToU8('{}') });
  await assert.rejects(storage.collectModelFiles([new File([duplicate], 'duplicates.zip')]), /重复路径/);
  assert.equal(await storage.readSavedModel(), null);
});

test('normalized resource paths reject traversal outside the package; quota errors give recovery guidance', () => {
  const storage = loadStorage();
  assert.equal(storage.normalizeModelPath('village\\textures\\..\\mesh.bin'), 'village/mesh.bin');
  assert.throws(() => storage.normalizeModelPath('../private/file'), /超出了/);
  assert.match(storage.modelErrorMessage(new DOMException('quota', 'QuotaExceededError')), /原地图已保留/);
});

test('Sketchfab parser accepts page links, embed links and IDs, rejects other hosts and non-model pages', () => {
  const { sources } = loadModules();
  const uid = sources.BAGUA_SOURCE.modelId;
  for (const input of [uid.toUpperCase(), `https://sketchfab.com/3d-models/${uid}`, `https://sketchfab.com/3d-models/licha-village-${uid}?share=1`, `https://www.sketchfab.com/models/${uid}/embed?autostart=1`]) {
    assert.equal(sources.parseSketchfabSource(input).modelId, uid);
  }
  assert.equal(sources.parseSketchfabSource(uid, '  自定义地图  ').name, '自定义地图');
  for (const input of ['not-a-model', 'https://sketchfab.com/oldMediaArt', `https://evil.example/3d-models/${uid}`, `https://sketchfab.com.evil.example/3d-models/${uid}`, `javascript:${uid}`]) {
    assert.throws(() => sources.parseSketchfabSource(input), /请输入 Sketchfab/);
  }
});

test('source selection persists and switching Sketchfab/local keeps the exact local file and anchor identity', async () => {
  const database = new IDBFactory();
  const { storage, sources } = loadModules(database);
  assert.equal((await storage.readMapState()).selection.modelId, sources.BAGUA_SOURCE.modelId);
  const local = await storage.collectModelFiles([fixture('示例村庄.glb')]);
  await storage.saveCurrentModel(local);
  assert.equal((await storage.readMapState()).selection.type, 'local');
  await storage.saveSketchfabMap(sources.BAGUA_SOURCE);
  const reopened = loadStorage(database);
  const onlineState = await reopened.readMapState();
  assert.equal(onlineState.selection.type, 'sketchfab');
  assert.equal(onlineState.selection.modelId, sources.BAGUA_SOURCE.modelId);
  assert.equal(onlineState.model.id, local.id);
  const restored = await reopened.selectSavedLocalModel();
  assert.equal(restored.id, local.id);
  assert.equal((await loadStorage(database).readMapState()).selection.type, 'local');
  assert.deepEqual(new Uint8Array(await restored.files[0].blob.arrayBuffer()), new Uint8Array(await local.files[0].blob.arrayBuffer()));
  const custom = sources.parseSketchfabSource('1234567890abcdef1234567890abcdef', '其他在线模型');
  await storage.saveSketchfabMap(custom);
  await storage.selectSavedLocalModel();
  assert.equal((await storage.readMapState()).online.name, '其他在线模型');
});

test('invalid source changes leave the selected map intact; switching local requires saved resources', async () => {
  const { storage, sources } = loadModules();
  await storage.saveSketchfabMap(sources.BAGUA_SOURCE);
  await assert.rejects(storage.selectSavedLocalModel(), /请先上传/);
  await assert.rejects(storage.saveSketchfabMap({ type: 'sketchfab', modelId: 'bad-id', name: 'bad' }), /请输入 Sketchfab/);
  const state = await storage.readMapState();
  assert.equal(state.selection.modelId, sources.BAGUA_SOURCE.modelId);
  assert.equal(state.model, null);
});

test('legacy local-only storage restores as local without overwriting its resources', async () => {
  const database = new IDBFactory();
  const storage = loadStorage(database);
  const local = await storage.collectModelFiles([fixture('示例村庄.glb')]);
  await new Promise((resolve, reject) => {
    const request = database.open('village-models', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('models');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction('models', 'readwrite');
      transaction.objectStore('models').put(local, 'current');
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onabort = () => reject(transaction.error);
    };
  });
  const restored = await storage.readMapState();
  assert.equal(restored.selection.type, 'local');
  assert.equal(restored.model.id, local.id);
});
