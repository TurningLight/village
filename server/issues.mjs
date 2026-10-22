import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
const statuses = ['pending', 'processing', 'completed'];
function validProjectionAnchor(value) {
  const point = (p) => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite);
  return (
    !!value &&
    typeof value.modelId === 'string' &&
    value.modelId.length > 0 &&
    value.modelId.length <= 200 &&
    typeof value.projectionCreatedAt === 'string' &&
    Number.isFinite(Date.parse(value.projectionCreatedAt)) &&
    Array.isArray(value.uv) &&
    value.uv.length === 2 &&
    value.uv.every((n) => Number.isFinite(n) && n >= 0 && n <= 1) &&
    point(value.ray?.start) &&
    point(value.ray?.end) &&
    value.ray.start.some((n, i) => n !== value.ray.end[i])
  );
}
export function validIssue(value) {
  const finitePoint = (p) => p && ['x', 'y', 'z'].every((key) => Number.isFinite(p[key]));
  return (
    !!value &&
    typeof value.id === 'string' &&
    /^[\w-]{1,128}$/.test(value.id) &&
    typeof value.title === 'string' &&
    value.title.trim().length > 0 &&
    value.title.length <= 120 &&
    typeof value.description === 'string' &&
    value.description.length <= 6000 &&
    typeof value.area === 'string' &&
    value.area.length <= 200 &&
    typeof value.reporter === 'string' &&
    typeof value.category === 'string' &&
    statuses.includes(value.status) &&
    ['low', 'medium', 'high'].includes(value.severity) &&
    Number.isFinite(Date.parse(value.createdAt)) &&
    Number.isFinite(Date.parse(value.updatedAt)) &&
    finitePoint(value.location?.local) &&
    Number.isFinite(value.location?.geo?.lng) &&
    Number.isFinite(value.location?.geo?.lat) &&
    Array.isArray(value.history) &&
    value.history.length <= 200 &&
    value.history.every(
      (h) =>
        h &&
        statuses.includes(h.status) &&
        typeof h.note === 'string' &&
        h.note.length <= 6000 &&
        typeof h.operator === 'string' &&
        Number.isFinite(Date.parse(h.time)),
    ) &&
    (!value.images ||
      (Array.isArray(value.images) &&
        value.images.length <= 4 &&
        value.images.every(
          (src) =>
            typeof src === 'string' &&
            src.length <= 700000 &&
            (/^(data:image\/(jpeg|png|webp);base64,)/.test(src) || /^https:\/\//.test(src)),
        ))) &&
    (!value.residentId ||
      (typeof value.residentId === 'string' && value.residentId.length <= 100)) &&
    (!value.projectionAnchor || validProjectionAnchor(value.projectionAnchor)) &&
    (!value.sceneAnchor ||
      (typeof value.sceneAnchor.modelId === 'string' &&
        Array.isArray(value.sceneAnchor.position) &&
        value.sceneAnchor.position.length === 3 &&
        value.sceneAnchor.position.every(Number.isFinite)))
  );
}
export function createIssueService(file) {
  let queue = Promise.resolve();
  async function read() {
    try {
      const value = JSON.parse(await readFile(file, 'utf8'));
      if (!Array.isArray(value) || !value.every(validIssue))
        throw new Error('Invalid persisted issues');
      return value;
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }
  return {
    read: () => queue.then(read),
    merge(incoming, { createOnly = false } = {}) {
      const operation = queue
        .catch(() => {})
        .then(async () => {
          const rows = await read(),
            byId = new Map(rows.map((i) => [i.id, i]));
          for (const row of incoming) {
            if (!validIssue(row)) throw new Error('Invalid issue');
            const old = byId.get(row.id);
            if (!old || (!createOnly && Date.parse(row.updatedAt) > Date.parse(old.updatedAt)))
              byId.set(row.id, row);
          }
          const result = [...byId.values()];
          await mkdir(dirname(file), { recursive: true, mode: 0o700 });
          const temporary = `${file}.tmp`;
          await writeFile(temporary, JSON.stringify(result), { mode: 0o600 });
          await rename(temporary, file);
          return result;
        });
      queue = operation.then(
        () => {},
        () => {},
      );
      return operation;
    },
  };
}
