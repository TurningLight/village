import { useCallback, useEffect, useRef, useState } from 'react';
import {
  readProjection,
  saveProjection,
  validProjection,
  requestProjectionPersistence,
} from './projectionCache';
import type { ModelProjection, ProjectionSource, ProjectionView } from './projectionTypes';

type ViewState = Omit<ProjectionView, 'retry' | 'save'>;
export function useModelProjection(
  modelId: string,
  enabled: boolean,
  onReload: () => void,
  online = false,
) {
  const source = useRef<ProjectionSource | null>(null);
  const consumedRequest = useRef(new Map<string, number>());
  const [sourceInfo, setSourceInfo] = useState<ProjectionSource | null>(null);
  const [failure, setFailure] = useState<{ modelId: string; message: string } | null>(null);
  const [request, setRequest] = useState({ modelId: '', version: 0 });
  const [state, setState] = useState<ViewState>({
    modelId: '',
    status: 'waiting',
    cacheChecked: false,
    message: '正在读取本地投影底图…',
  });
  const onSource = useCallback((next: ProjectionSource) => {
    source.current = next;
    setSourceInfo(next);
    setFailure(null);
  }, []);
  const onFailure = useCallback((id: string, message: string) => {
    if (source.current?.modelId === id) source.current = null;
    setSourceInfo((previous) => (previous?.modelId === id ? null : previous));
    setFailure({ modelId: id, message });
  }, []);
  // Online capture can start without loading the main 3D viewer. Changes to that
  // viewer's reference/callback must never restart a projection already in flight.
  const sourceKey = online ? 'online' : (sourceInfo?.modelId ?? '');
  const version = request.modelId === modelId ? request.version : 0;
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let url: string | undefined;
    const publish = (next: ViewState) => {
      if (!controller.signal.aborted) setState(next);
    };
    const progress = (message: string) =>
      publish({ modelId, status: 'generating', cacheChecked: true, message });
    void (async () => {
      const force = version > (consumedRequest.current.get(modelId) ?? 0);
      let cached: ModelProjection | null = null;
      if (!force) {
        try {
          cached = await readProjection(modelId);
        } catch {
          /* Storage denial must not prevent a new projection. */
        }
      }
      if (controller.signal.aborted) return;
      if (cached) {
        requestProjectionPersistence();
        url = URL.createObjectURL(cached.image);
        publish({
          modelId,
          status: 'ready',
          data: cached,
          url,
          cacheChecked: true,
          cacheStatus: 'saved',
          message: '已从本地恢复二维底图',
        });
        return;
      }
      const currentSource = source.current?.modelId === modelId ? source.current : null;
      if (!online && !currentSource?.capture) {
        publish({
          modelId,
          status: 'waiting',
          cacheChecked: true,
          message: '首次使用此模型，等待三维模型准备投影…',
        });
        return;
      }
      consumedRequest.current.set(modelId, version);
      progress(force ? '正在重新生成二维底图…' : '首次生成模型二维底图…');
      const options = { signal: controller.signal, onProgress: progress };
      const generated = online
        ? await (
            await import('./onlineProjection')
          ).captureOnlineProjection(modelId, currentSource?.reference, options)
        : await currentSource!.capture!(options);
      controller.signal.throwIfAborted();
      const data = generated;
      if (!validProjection(data)) throw new Error('模型投影参数无效，请重新生成。');
      url = URL.createObjectURL(data.image);
      const ready: ViewState = {
        modelId,
        status: 'ready',
        data,
        url,
        cacheChecked: true,
        cacheStatus: 'saving',
        message: '正在保存二维底图到本地…',
      };
      // Present the finished image immediately; persistence must not delay drawing.
      publish(ready);
      try {
        await saveProjection(data);
        requestProjectionPersistence();
        publish({ ...ready, cacheStatus: 'saved', message: '已保存本地，下次直接打开' });
      } catch {
        publish({
          ...ready,
          cacheStatus: 'unavailable',
          message: '本地保存失败；本次可查看，请重试保存。',
        });
      }
    })().catch((error) => {
      if (!controller.signal.aborted)
        publish({
          modelId,
          status: 'error',
          cacheChecked: true,
          message: '无法生成模型投影',
          error: error instanceof Error ? error.message : '请重试或上传完整模型。',
        });
    });
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [modelId, enabled, sourceKey, version, online]);
  const retry = useCallback(() => {
    setFailure(null);
    setRequest((previous) => ({
      modelId,
      version: previous.modelId === modelId ? previous.version + 1 : 1,
    }));
    if (!online && source.current?.modelId !== modelId) onReload();
  }, [modelId, online, onReload]);
  const save = useCallback(() => {
    if (state.modelId !== modelId || !state.data) return;
    const data = state.data;
    const update = (cacheStatus: ViewState['cacheStatus'], message: string) =>
      setState((previous) =>
        previous.modelId === modelId && previous.data === data
          ? { ...previous, cacheStatus, message }
          : previous,
      );
    update('saving', '正在保存二维底图到本地…');
    void saveProjection(data)
      .then(() => {
        requestProjectionPersistence();
        update('saved', '已保存本地，下次直接打开');
      })
      .catch(() => update('unavailable', '本地保存失败；请检查浏览器存储空间后重试。'));
  }, [modelId, state]);
  const current: ViewState =
    state.modelId === modelId
      ? state
      : { modelId, status: 'waiting', cacheChecked: false, message: '正在读取本地投影底图…' };
  const reference =
    sourceInfo?.modelId === modelId ? sourceInfo.reference : current.data?.reference;
  const view: ProjectionView = {
    ...current,
    reference,
    retry,
    save,
    ...(!online && failure?.modelId === modelId && current.status !== 'ready'
      ? { status: 'error', error: failure.message, message: '模型尚未载入' }
      : {}),
  };
  return { view, onSource, onFailure };
}
