import { unzipSync } from 'three/addons/libs/fflate.module.js';
import { BAGUA_SOURCE, parseSketchfabSource } from './mapSources';
import type { MapSelection, SketchfabSource } from './mapSources';

export interface ModelFile { path: string; blob: Blob; }
export interface StoredModel {
  id: string;
  name: string;
  entry: string;
  files: ModelFile[];
  size: number;
  savedAt: string;
}

export interface SavedMapState {
  model: StoredModel | null;
  selection: MapSelection;
  online: SketchfabSource;
}

export const MAX_MODEL_BYTES = 512 * 1024 * 1024;
const DATABASE = 'village-models';
const STORE = 'models';

export function normalizeModelPath(path: string) {
  const parts: string[] = [];
  for (const part of path.replaceAll('\\', '/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (!parts.length) throw new Error('模型资源路径超出了文件包目录。');
      parts.pop();
    } else parts.push(part);
  }
  return parts.join('/');
}

export async function collectModelFiles(input: File[]): Promise<StoredModel> {
  if (!input.length) throw new Error('请选择模型文件。');
  if (input.reduce((sum, file) => sum + file.size, 0) > MAX_MODEL_BYTES) throw new Error('模型文件总大小不能超过 512 MB，请先简化模型或压缩纹理。');
  let files: ModelFile[];
  if (input.length === 1 && /\.zip$/i.test(input[0].name)) {
    let expandedSize = 0;
    let oversized = false;
    let archive: Record<string, Uint8Array>;
    try {
      archive = unzipSync(new Uint8Array(await input[0].arrayBuffer()), { filter(entry) {
        if (entry.name.endsWith('/') || entry.name.startsWith('__MACOSX/')) return false;
        expandedSize += entry.originalSize;
        if (expandedSize > MAX_MODEL_BYTES) { oversized = true; return false; }
        return true;
      } });
    } catch { throw new Error('ZIP 无法解压，请重新导出完整、未加密的模型压缩包。'); }
    if (oversized) throw new Error('ZIP 解压后超过 512 MB，请先简化模型或压缩纹理。');
    files = Object.entries(archive).map(([path, bytes]) => ({ path: normalizeModelPath(path), blob: new Blob([bytes.slice().buffer as ArrayBuffer]) }));
  } else {
    files = input.map((file) => ({ path: normalizeModelPath(file.webkitRelativePath || file.name), blob: file }));
  }
  if (new Set(files.map((file) => file.path)).size !== files.length) throw new Error('文件包包含重复路径，请整理后重新上传。');
  const entries = files.filter((file) => /\.(glb|gltf)$/i.test(file.path));
  if (!entries.length) throw new Error('未找到 GLB 或 glTF 模型。请选择 .glb，或包含 .gltf、.bin 和纹理的 ZIP / 文件夹。');
  if (entries.length > 1) throw new Error('文件包中有多个模型，请只保留一个 .glb 或 .gltf 入口后重新上传。');
  return {
    id: `local-${crypto.randomUUID()}`, name: entries[0].path.split('/').at(-1)!, entry: entries[0].path,
    files, size: files.reduce((sum, file) => sum + file.blob.size, 0), savedAt: new Date().toISOString(),
  };
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('浏览器不支持本地模型存储，请使用 Chrome、Edge 或 Safari 的普通窗口。')); return; }
    const request = indexedDB.open(DATABASE, 1);
    let blocked = false;
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onerror = () => reject(request.error);
    request.onblocked = () => { blocked = true; reject(new Error('模型存储被其他页面占用，请关闭其他项目页面后重试。')); };
    request.onsuccess = () => {
      const database = request.result;
      if (blocked) { database.close(); return; }
      database.onversionchange = () => database.close();
      resolve(database);
    };
  });
}

export async function readSavedModel(): Promise<StoredModel | null> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE, 'readonly');
      const request = transaction.objectStore(STORE).get('current');
      transaction.oncomplete = () => resolve(request.result ?? null);
      transaction.onabort = () => reject(transaction.error ?? new Error('读取已保存模型失败。'));
      transaction.onerror = () => reject(transaction.error);
    });
  } finally { database.close(); }
}

export async function readMapState(): Promise<SavedMapState> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE, 'readonly');
      const store = transaction.objectStore(STORE);
      const model = store.get('current');
      const selection = store.get('selection');
      const online = store.get('online');
      transaction.oncomplete = () => {
        const savedModel = model.result ?? null;
        const savedOnline = online.result ?? BAGUA_SOURCE;
        // Existing users stored only 'current'; keep their local map selected.
        const chosen = selection.result ?? (savedModel ? { type: 'local' } : BAGUA_SOURCE);
        resolve({ model: savedModel, selection: chosen, online: savedOnline });
      };
      transaction.onabort = () => reject(transaction.error ?? new Error('读取地图设置失败。'));
      transaction.onerror = () => reject(transaction.error);
    });
  } finally { database.close(); }
}

export async function saveSketchfabMap(source: SketchfabSource): Promise<void> {
  const validated = parseSketchfabSource(source.modelId, source.name);
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE, 'readwrite');
      const store = transaction.objectStore(STORE);
      store.put(validated, 'selection');
      store.put(validated, 'online');
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error ?? new Error('保存在线地图设置失败，原地图已保留。'));
      transaction.onerror = () => reject(transaction.error);
    });
  } finally { database.close(); }
}

export async function selectSavedLocalModel(): Promise<StoredModel> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE, 'readwrite');
      const store = transaction.objectStore(STORE);
      const request = store.get('current');
      let missing = false;
      request.onsuccess = () => {
        if (!request.result) { missing = true; transaction.abort(); return; }
        store.put({ type: 'local' }, 'selection');
      };
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(missing ? new Error('尚未保存本地模型，请先上传模型文件。') : transaction.error ?? new Error('切换本地地图失败。'));
      transaction.onerror = () => reject(transaction.error);
    });
  } finally { database.close(); }
}

// Replacing the single current record is atomic: a failed write retains the old map.
export async function saveCurrentModel(model: StoredModel): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE, 'readwrite');
      transaction.objectStore(STORE).put(model, 'current');
      transaction.objectStore(STORE).put({ type: 'local' }, 'selection');
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error ?? new Error('模型保存失败。'));
      transaction.onerror = () => reject(transaction.error);
    });
  } finally { database.close(); }
}

export function modelErrorMessage(cause: unknown) {
  if (cause instanceof DOMException && cause.name === 'QuotaExceededError') return '浏览器存储空间不足，原地图已保留。请释放空间或上传更小的模型。';
  return cause instanceof Error ? cause.message : '模型载入失败，请检查模型文件和浏览器存储设置后重试。';
}
