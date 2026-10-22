import type { ModelProjection } from '../lib/projectionTypes';
import type {
  SharedMapCatalog,
  SharedMapDescriptor,
  SharedVillageMap,
} from '../lib/sharedMapTypes';
import { createClientId } from '../lib/id';

const selectionSession = createClientId();
let selectionVersion = 0;
function combinedSignal(signal?: AbortSignal) {
  const timeout = AbortSignal.timeout(45000);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}
async function request<T>(
  path: string,
  options: RequestInit = {},
  signal?: AbortSignal,
): Promise<T> {
  try {
    const response = await fetch(path, { ...options, signal: combinedSignal(signal) });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error?.message || '村庄底图暂时无法共享，请稍后重试。');
    return value as T;
  } catch (error) {
    if (signal?.aborted) throw error;
    if (error instanceof Error && error.name !== 'TypeError' && error.name !== 'TimeoutError')
      throw error;
    throw new Error('无法连接村庄地图服务，请确认电脑服务正在运行后重试。');
  }
}
export async function readSharedMaps(signal?: AbortSignal) {
  const result = await request<SharedMapCatalog>('/api/maps', {}, signal);
  if (!result || typeof result.activeModelId !== 'string' || !Array.isArray(result.maps))
    throw new Error('村庄地图列表不完整，请稍后重试。');
  return result;
}
async function imageBase64(blob: Blob, signal?: AbortSignal) {
  if (blob.type !== 'image/png' || blob.size < 1 || blob.size > 16 * 1024 * 1024)
    throw new Error('二维底图过大或格式不正确，请重新生成后共享。');
  signal?.throwIfAborted();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  signal?.throwIfAborted();
  let binary = '';
  for (let start = 0; start < bytes.length; start += 8192)
    binary += String.fromCharCode(...bytes.subarray(start, start + 8192));
  return btoa(binary);
}
export async function publishSharedMap(
  descriptor: SharedMapDescriptor,
  projection?: ModelProjection,
  signal?: AbortSignal,
) {
  let payload: object = descriptor;
  if (projection) {
    const { image, ...metadata } = projection;
    if (metadata.modelId !== descriptor.modelId)
      throw new Error('底图与当前村庄不一致，未进行共享。');
    payload = {
      ...descriptor,
      projection: { metadata, imageBase64: await imageBase64(image, signal) },
    };
  }
  return request<SharedVillageMap>(
    `/api/maps/${encodeURIComponent(descriptor.modelId)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    signal,
  );
}
/** Selection is separate from image publication: a late image can never change the active village. */
export function selectSharedMap(modelId: string, signal?: AbortSignal) {
  return request<SharedMapCatalog>(
    '/api/maps/active',
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelId, selectionSession, selectionVersion: ++selectionVersion }),
    },
    signal,
  );
}
