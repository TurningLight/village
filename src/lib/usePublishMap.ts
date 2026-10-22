import { useCallback, useEffect, useState } from 'react';
import { publishSharedMap, selectSharedMap } from '../services/sharedMaps';
import type { ModelProjection, ProjectionView } from './projectionTypes';
import type { SharedProjection } from './sharedMapTypes';

type PublishState = { modelId: string; phase: 'publishing' | 'ready' | 'error'; message: string };
function sameProjection(shared: SharedProjection | undefined, current: ProjectionView['data']) {
  if (!shared || !current) return false;
  const key = (p: Omit<ModelProjection, 'image'>) =>
    JSON.stringify([
      p.version,
      p.modelId,
      p.width,
      p.height,
      p.bounds.minX,
      p.bounds.minY,
      p.bounds.maxX,
      p.bounds.maxY,
      p.transform.kind,
      ...(p.transform.kind === 'projective'
        ? [p.transform.matrix, p.transform.origin, p.transform.unit]
        : []),
      p.reference.position,
      p.reference.target,
      p.method,
      new Date(p.createdAt).toISOString(),
    ]);
  return key(shared) === key(current);
}
function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, ms);
    function abort() {
      clearTimeout(timer);
      reject(signal.reason);
    }
    signal.addEventListener('abort', abort, { once: true });
  });
}
/** The desktop owns active selection; image publication never changes that selection. */
export function usePublishMap({
  modelId,
  name,
  demo,
  restoring,
  projection,
}: {
  modelId: string;
  name: string;
  demo: boolean;
  restoring: boolean;
  projection: ProjectionView;
}) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<PublishState>({
    modelId: '',
    phase: 'publishing',
    message: '正在共享手机底图…',
  });
  const data =
    !demo && projection.modelId === modelId && projection.status === 'ready'
      ? projection.data
      : undefined;
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  useEffect(() => {
    const online = () => retry();
    window.addEventListener('online', online);
    return () => window.removeEventListener('online', online);
  }, [retry]);
  useEffect(() => {
    if (restoring || !modelId) return;
    const controller = new AbortController(),
      signal = controller.signal;
    const update = (next: Omit<PublishState, 'modelId'>) => {
      if (!signal.aborted) setState({ modelId, ...next });
    };
    const descriptor = { modelId, name, kind: demo ? ('demo' as const) : ('real' as const) };
    void (async () => {
      for (let i = 0; i < 4; i++) {
        try {
          update({
            phase: 'publishing',
            message: i ? '正在重试共享手机底图…' : '正在共享手机底图…',
          });
          const shared = await publishSharedMap(descriptor, undefined, signal);
          signal.throwIfAborted();
          await selectSharedMap(modelId, signal);
          signal.throwIfAborted();
          if (data && !sameProjection(shared.projection, data)) {
            await publishSharedMap(descriptor, data, signal);
            signal.throwIfAborted();
          }
          update({
            phase: 'ready',
            message: demo
              ? '手机端保留最近使用的实景村庄'
              : data || shared.projection
                ? '实景二维底图已共享到手机'
                : '村庄已同步，二维底图生成后自动共享',
          });
          return;
        } catch (error) {
          if (signal.aborted) return;
          if (i < 3) {
            await delay([1000, 3000, 8000][i], signal);
            continue;
          }
          update({
            phase: 'error',
            message: error instanceof Error ? error.message : '手机底图共享失败，请重试。',
          });
        }
      }
    })().catch(() => {
      /* Cancellation while backing off is expected on a village switch. */
    });
    return () => controller.abort();
  }, [modelId, name, demo, restoring, data, attempt]);
  return {
    ...state,
    message: state.modelId === modelId ? state.message : '正在共享手机底图…',
    retry,
  };
}
