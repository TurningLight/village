import type { ModelProjection } from './projectionTypes';
const DB = 'village-projections',
  STORE = 'images';
function open() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'modelId' });
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('投影缓存被其他窗口占用。'));
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}
export function validProjection(data: unknown): data is ModelProjection {
  const p = data as ModelProjection;
  return (
    !!p &&
    p.version === 2 &&
    typeof p.modelId === 'string' &&
    p.image instanceof Blob &&
    p.image.size > 0 &&
    p.image.type === 'image/png' &&
    Number.isInteger(p.width) &&
    p.width > 0 &&
    p.width <= 2048 &&
    Number.isInteger(p.height) &&
    p.height > 0 &&
    p.height <= 2048 &&
    p.bounds &&
    Object.values(p.bounds).length === 4 &&
    Object.values(p.bounds).every(Number.isFinite) &&
    p.bounds.maxX > p.bounds.minX &&
    p.bounds.maxY > p.bounds.minY &&
    p.reference?.position?.length === 3 &&
    p.reference.position.every(Number.isFinite) &&
    p.reference?.target?.length === 3 &&
    p.reference.target.every(Number.isFinite) &&
    ['orthographic', 'online-topdown'].includes(p.method) &&
    Number.isFinite(Date.parse(p.createdAt)) &&
    (p.transform?.kind === 'orthographic' ||
      (p.transform?.kind === 'projective' &&
        p.transform.matrix?.length === 11 &&
        p.transform.matrix.every(Number.isFinite) &&
        p.transform.origin?.length === 3 &&
        p.transform.origin.every(Number.isFinite) &&
        Number.isFinite(p.transform.unit) &&
        p.transform.unit > 0))
  );
}
export async function readProjection(modelId: string): Promise<ModelProjection | null> {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly'),
        req = tx.objectStore(STORE).get(modelId);
      tx.oncomplete = () => resolve(validProjection(req.result) ? req.result : null);
      tx.onabort = () => reject(tx.error);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export async function saveProjection(projection: ModelProjection) {
  if (!validProjection(projection)) throw new Error('投影数据不完整，未写入缓存。');
  const db = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite'),
        store = tx.objectStore(STORE);
      store.put(projection);
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** Best effort durable browser storage. A denial never discards a successful IDB write. */
let persistenceRequested = false;
export function requestProjectionPersistence() {
  if (persistenceRequested || typeof navigator === 'undefined') return;
  persistenceRequested = true;
  void Promise.resolve()
    .then(async () => {
      const storage = navigator.storage;
      if (!storage?.persist || (await storage.persisted?.())) return;
      await storage.persist();
    })
    .catch(() => false);
}
