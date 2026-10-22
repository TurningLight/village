import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { inflateSync } from 'node:zlib';

export const MAX_MAP_IMAGE_BYTES = 16 * 1024 * 1024;
export const MAX_MAP_REQUEST_BYTES = 23 * 1024 * 1024;
const DEMO = {
  modelId: 'qinghe-demo',
  name: '青禾村 Demo',
  kind: 'demo',
  updatedAt: '2026-10-22T00:00:00.000Z',
};
const point = (p) => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite);
const text = (v, limit) =>
  typeof v === 'string' &&
  v.trim().length > 0 &&
  v.length <= limit &&
  [...v].every((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127);
export class MapServiceError extends Error {
  constructor(message, status = 400, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export function validMapId(value) {
  return text(value, 180);
}
export function validMapDescriptor(value) {
  return (
    !!value &&
    validMapId(value.modelId) &&
    text(value.name, 120) &&
    (value.kind === 'real'
      ? value.modelId !== DEMO.modelId
      : value.kind === 'demo' && value.modelId === DEMO.modelId)
  );
}
export function projectionMetadata(value, modelId) {
  const b = value?.bounds,
    t = value?.transform;
  if (
    !value ||
    value.version !== 2 ||
    value.modelId !== modelId ||
    !Number.isInteger(value.width) ||
    value.width < 1 ||
    value.width > 2048 ||
    !Number.isInteger(value.height) ||
    value.height < 1 ||
    value.height > 2048 ||
    !b ||
    !['minX', 'minY', 'maxX', 'maxY'].every((key) => Number.isFinite(b[key])) ||
    b.maxX <= b.minX ||
    b.maxY <= b.minY ||
    !Number.isFinite(b.maxX - b.minX) ||
    !Number.isFinite(b.maxY - b.minY) ||
    !point(value.reference?.position) ||
    !point(value.reference?.target) ||
    !['orthographic', 'online-topdown'].includes(value.method) ||
    typeof value.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(value.createdAt)) ||
    !(
      t?.kind === 'orthographic' ||
      (t?.kind === 'projective' &&
        Array.isArray(t.matrix) &&
        t.matrix.length === 11 &&
        t.matrix.every(Number.isFinite) &&
        point(t.origin) &&
        Number.isFinite(t.unit) &&
        t.unit > 0)
    )
  )
    throw new MapServiceError('二维底图的校准参数不完整，请在管理端重新生成。');
  return {
    version: 2,
    modelId,
    width: value.width,
    height: value.height,
    bounds: { minX: b.minX, minY: b.minY, maxX: b.maxX, maxY: b.maxY },
    transform:
      t.kind === 'orthographic'
        ? { kind: 'orthographic' }
        : { kind: 'projective', matrix: [...t.matrix], origin: [...t.origin], unit: t.unit },
    reference: { position: [...value.reference.position], target: [...value.reference.target] },
    method: value.method,
    createdAt: new Date(value.createdAt).toISOString(),
  };
}
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
/** Validate the whole bounded PNG stream before giving it a public immutable URL. */
export function validatePng(bytes, width, height) {
  const fail = () => {
    throw new MapServiceError('底图不是完整的 PNG 图片，或图片尺寸与校准参数不一致。');
  };
  if (
    !Buffer.isBuffer(bytes) ||
    bytes.length < 57 ||
    bytes.length > MAX_MAP_IMAGE_BYTES ||
    !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    fail();
  let offset = 8,
    count = 0,
    ended = false,
    channels = 0,
    palette = false,
    imageData = [];
  while (offset + 12 <= bytes.length) {
    const size = bytes.readUInt32BE(offset),
      end = offset + 12 + size;
    if (end > bytes.length) fail();
    const type = bytes.toString('ascii', offset + 4, offset + 8),
      data = bytes.subarray(offset + 8, end - 4);
    if (
      !/^[A-Za-z]{4}$/.test(type) ||
      crc32(bytes.subarray(offset + 4, end - 4)) !== bytes.readUInt32BE(end - 4)
    )
      fail();
    if (!count && type !== 'IHDR') fail();
    if (type === 'IHDR') {
      if (
        count ||
        size !== 13 ||
        data.readUInt32BE(0) !== width ||
        data.readUInt32BE(4) !== height ||
        data[8] !== 8 ||
        data[10] !== 0 ||
        data[11] !== 0 ||
        data[12] !== 0
      )
        fail();
      channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[data[9]];
      if (!channels) fail();
    } else if (type === 'IDAT') imageData.push(data);
    else if (type === 'PLTE') {
      if (!size || size % 3 || size > 768) fail();
      palette = true;
    } else if (type === 'IEND') {
      if (size || !imageData.length || end !== bytes.length) fail();
      ended = true;
      break;
    } else if (
      type === 'acTL' ||
      (![
        'tRNS',
        'gAMA',
        'cHRM',
        'sRGB',
        'iCCP',
        'pHYs',
        'tEXt',
        'zTXt',
        'iTXt',
        'bKGD',
        'sBIT',
        'tIME',
      ].includes(type) &&
        type[0] === type[0].toUpperCase())
    )
      fail();
    offset = end;
    count++;
  }
  if (!ended || (bytes[25] === 3 && !palette)) fail();
  const row = width * channels + 1,
    expected = row * height;
  let raw;
  try {
    raw = inflateSync(Buffer.concat(imageData), { maxOutputLength: expected + 1 });
  } catch {
    fail();
  }
  if (raw.length !== expected) fail();
  for (let i = 0; i < height; i++) if (raw[i * row] > 4) fail();
}
function decodeImage(value, metadata) {
  if (
    typeof value !== 'string' ||
    value.length < 4 ||
    value.length > Math.ceil(MAX_MAP_IMAGE_BYTES / 3) * 4 ||
    value.length % 4 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(value)
  )
    throw new MapServiceError('底图过大或图片内容无效，请重新生成后重试。');
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length > MAX_MAP_IMAGE_BYTES || bytes.toString('base64') !== value)
    throw new MapServiceError('底图过大或图片内容无效。');
  validatePng(bytes, metadata.width, metadata.height);
  return bytes;
}
async function atomic(file, bytes) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, bytes, { mode: 0o600 });
    await rename(temporary, file);
  } finally {
    await unlink(temporary).catch(() => {});
  }
}
function validStoredProjection(p, modelId) {
  projectionMetadata(p, modelId);
  if (!/^[a-f0-9]{64}$/.test(p.revision) || p.imageUrl !== `/api/maps/images/${p.revision}.png`)
    throw new Error('Invalid stored projection URL');
}
export function createMapService(directory) {
  const file = join(directory, 'catalog.json'),
    images = join(directory, 'images');
  let queue = Promise.resolve();
  async function read() {
    try {
      const value = JSON.parse(await readFile(file, 'utf8'));
      if (
        !Array.isArray(value.maps) ||
        value.maps.length > 200 ||
        !value.maps.every(validMapDescriptor) ||
        new Set(value.maps.map((row) => row.modelId)).size !== value.maps.length ||
        !value.maps.some((row) => row.modelId === value.activeModelId)
      )
        throw new Error('Invalid map catalog');
      for (const row of value.maps) {
        if (!Number.isFinite(Date.parse(row.updatedAt))) throw new Error('Invalid map date');
        if (row.projection) validStoredProjection(row.projection, row.modelId);
      }
      let activeRealModelId = value.activeRealModelId;
      if (!Object.hasOwn(value, 'activeRealModelId')) {
        // Old catalogs stored a single desktop selection. Recover its current
        // real source, or the most recently used real descriptor behind Demo.
        activeRealModelId =
          value.maps.find((row) => row.modelId === value.activeModelId && row.kind === 'real')
            ?.modelId ??
          value.maps
            .filter((row) => row.kind === 'real')
            .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0]?.modelId ??
          null;
      }
      if (
        activeRealModelId !== null &&
        !value.maps.some((row) => row.kind === 'real' && row.modelId === activeRealModelId)
      )
        throw new Error('Invalid active real map');
      const state = { ...value, activeRealModelId, selections: value.selections || {} };
      if (!Object.hasOwn(value, 'activeRealModelId')) await atomic(file, JSON.stringify(state));
      return state;
    } catch (error) {
      if (error.code === 'ENOENT')
        return {
          activeModelId: DEMO.modelId,
          activeRealModelId: null,
          maps: [{ ...DEMO }],
          selections: {},
        };
      throw error;
    }
  }
  const catalog = ({ activeModelId, activeRealModelId, maps }) => ({
    activeModelId,
    activeRealModelId,
    maps,
  });
  function mutate(action) {
    const result = queue
      .catch(() => {})
      .then(async () => {
        const state = await read(),
          result = await action(state);
        await mkdir(directory, { recursive: true, mode: 0o700 });
        await atomic(file, JSON.stringify(state));
        return result;
      });
    queue = result.then(
      () => {},
      () => {},
    );
    return result;
  }
  return {
    read() {
      // Serialise the one-time legacy migration together with all writes.
      const operation = queue
        .catch(() => {})
        .then(read)
        .then(catalog);
      queue = operation.then(
        () => {},
        () => {},
      );
      return operation;
    },
    /** Hold the map queue until the report is committed so regeneration cannot
     * invalidate the calibration between validation and the event write. */
    withCurrentProjections(anchors, commit) {
      if (!anchors.length) return commit();
      const operation = queue
        .catch(() => {})
        .then(async () => {
          const state = await read();
          for (const anchor of anchors) {
            const village = state.maps.find((row) => row.modelId === anchor.modelId);
            if (!village || village.kind !== 'real' || !village.projection)
              throw new MapServiceError(
                '这个村庄的实景底图尚未共享，请刷新村庄地图后重新选点，已填写内容会保留。',
                409,
                'MAP_NOT_SHARED',
              );
            if (state.activeRealModelId !== anchor.modelId)
              throw new MapServiceError(
                '电脑端已切换实景村庄，请刷新并确认当前村庄，再重新选择位置后提交，已填写内容会保留。',
                409,
                'MAP_CHANGED',
              );
            if (village.projection.createdAt !== anchor.projectionCreatedAt)
              throw new MapServiceError(
                '村庄实景底图已更新，请刷新地图并重新选点后提交，已填写内容会保留。',
                409,
                'MAP_PROJECTION_STALE',
              );
          }
          return commit();
        });
      queue = operation.then(
        () => {},
        () => {},
      );
      return operation;
    },
    publish(value) {
      if (!validMapDescriptor(value))
        return Promise.reject(new MapServiceError('地图名称或模型标识无效。'));
      let metadata, bytes;
      try {
        if (value.projection) {
          if (value.kind !== 'real') throw new MapServiceError('示意村庄不需要实景底图。');
          metadata = projectionMetadata(value.projection.metadata, value.modelId);
          bytes = decodeImage(value.projection.imageBase64, metadata);
        }
      } catch (error) {
        return Promise.reject(error);
      }
      return mutate(async (state) => {
        const index = state.maps.findIndex((row) => row.modelId === value.modelId),
          old = state.maps[index];
        if (index < 0 && state.maps.length >= 200)
          throw new MapServiceError('已保存的地图过多，请联系管理员整理。');
        const row = {
          modelId: value.modelId,
          name: value.name.trim(),
          kind: value.kind,
          updatedAt: new Date().toISOString(),
          ...(old?.projection ? { projection: old.projection } : {}),
        };
        if (
          metadata &&
          bytes &&
          (!old?.projection ||
            Date.parse(metadata.createdAt) >= Date.parse(old.projection.createdAt))
        ) {
          const revision = createHash('sha256')
            .update(JSON.stringify(metadata))
            .update(bytes)
            .digest('hex');
          await mkdir(images, { recursive: true, mode: 0o700 });
          await atomic(join(images, `${revision}.png`), bytes);
          row.projection = { ...metadata, revision, imageUrl: `/api/maps/images/${revision}.png` };
        }
        if (index < 0) state.maps.push(row);
        else state.maps[index] = row;
        return row;
      });
    },
    select({ modelId, selectionSession, selectionVersion } = {}) {
      if (
        !validMapId(modelId) ||
        (selectionSession !== undefined &&
          (!/^[\w-]{1,100}$/.test(selectionSession) ||
            !Number.isSafeInteger(selectionVersion) ||
            selectionVersion < 1))
      )
        return Promise.reject(new MapServiceError('地图选择内容无效。'));
      return mutate((state) => {
        if (!state.maps.some((row) => row.modelId === modelId))
          throw new MapServiceError('该地图尚未共享，请在管理端重试。', 404);
        if (selectionSession) {
          if ((state.selections[selectionSession] || 0) >= selectionVersion) return catalog(state);
          // Keep the anti-reordering journal bounded across repeated desktop sessions.
          state.selections[selectionSession] = selectionVersion;
          const sessions = Object.keys(state.selections);
          for (const key of sessions.slice(0, Math.max(0, sessions.length - 100)))
            delete state.selections[key];
        }
        state.activeModelId = modelId;
        if (state.maps.find((row) => row.modelId === modelId)?.kind === 'real')
          state.activeRealModelId = modelId;
        return catalog(state);
      });
    },
    async image(revision) {
      if (!/^[a-f0-9]{64}$/.test(revision)) throw new MapServiceError('底图地址无效。', 404);
      try {
        return await readFile(join(images, `${revision}.png`));
      } catch (error) {
        if (error.code === 'ENOENT')
          throw new MapServiceError('底图尚未共享，请在管理端重试。', 404);
        throw error;
      }
    },
  };
}
