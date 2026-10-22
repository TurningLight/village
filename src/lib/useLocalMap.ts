import { useCallback, useEffect, useRef, useState } from 'react';
import { collectModelFiles, modelErrorMessage, readMapState, saveCurrentModel, saveSketchfabMap, selectSavedLocalModel } from './modelStorage';
import type { SavedMapState } from './modelStorage';
import { BAGUA_SOURCE, parseSketchfabSource } from './mapSources';
import type { SketchfabSource } from './mapSources';
import { useAppStore } from '../store/useAppStore';
import { validateSketchfabModel } from './sketchfab';

function resetSceneSelection() {
  const state = useAppStore.getState();
  if (!state.showBuildings) state.toggleBuildings();
  state.selectIssue(null); state.selectBuilding(null); state.setCurrentRenovation(null);
}

export function useLocalMap() {
  const [saved, setSaved] = useState<SavedMapState>({ model: null, selection: BAGUA_SOURCE, online: BAGUA_SOURCE });
  const [restoring, setRestoring] = useState(true);
  const [restoreError, setRestoreError] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const operation = useRef(false);
  const restore = useCallback(async () => {
    setRestoring(true); setRestoreError('');
    try { setSaved(await readMapState()); }
    catch (cause) { setRestoreError(modelErrorMessage(cause)); }
    finally { setRestoring(false); }
  }, []);
  useEffect(() => {
    let cancelled = false;
    readMapState().then((state) => { if (!cancelled) setSaved(state); })
      .catch((cause) => { if (!cancelled) setRestoreError(modelErrorMessage(cause)); })
      .finally(() => { if (!cancelled) setRestoring(false); });
    return () => { cancelled = true; };
  }, []);

  const upload = async (files: File[]) => {
    if (operation.current || restoring) return;
    operation.current = true; setBusy(true); setError(''); setStatus('正在读取模型文件…');
    try {
      const candidate = await collectModelFiles(files);
      setStatus(`正在校验模型与纹理：${candidate.name}`);
      const { validateLocalModel } = await import('./localModelLoader');
      await validateLocalModel(candidate);
      setStatus('模型校验通过，正在保存为默认地图…');
      await saveCurrentModel(candidate);
      // Request durable storage where the browser allows it; a denial must not
      // turn a committed IndexedDB write into a reported upload failure.
      void Promise.resolve().then(() => navigator.storage?.persist?.()).catch(() => false);
      resetSceneSelection();
      setSaved((previous) => ({ ...previous, model: candidate, selection: { type: 'local' } })); setRestoreError('');
      setStatus('已保存为默认地图，刷新或重新打开此网址会自动恢复。');
    } catch (cause) { setError(modelErrorMessage(cause)); setStatus(''); }
    finally { operation.current = false; setBusy(false); }
  };

  const useOnline = async (input: string, name: string) => {
    if (operation.current || restoring) return;
    operation.current = true; setBusy(true); setError(''); setStatus('正在连接 Sketchfab 并校验模型，请稍候…');
    try {
      const source = parseSketchfabSource(input, name);
      await validateSketchfabModel(source.modelId);
      await saveSketchfabMap(source);
      resetSceneSelection();
      setSaved((previous) => ({ ...previous, selection: source, online: source })); setRestoreError('');
      setStatus('在线地图已设为默认，下次打开将恢复此选择。已上传的本地模型仍可切换回来。');
    } catch (cause) { setError(modelErrorMessage(cause)); setStatus(''); }
    finally { operation.current = false; setBusy(false); }
  };

  const useSavedLocal = async () => {
    if (operation.current || restoring) return;
    operation.current = true; setBusy(true); setError(''); setStatus('正在恢复已保存的本地模型…');
    try {
      const model = await selectSavedLocalModel();
      resetSceneSelection();
      setSaved((previous) => ({ ...previous, model, selection: { type: 'local' } })); setRestoreError('');
      setStatus('已切换为保存的本地模型，下次打开将恢复此选择。');
    } catch (cause) { setError(modelErrorMessage(cause)); setStatus(''); }
    finally { operation.current = false; setBusy(false); }
  };
  const clearFeedback = () => { if (!operation.current) { setStatus(''); setError(''); } };
  const model = saved.selection.type === 'local' ? saved.model : null;
  const online: SketchfabSource = saved.selection.type === 'sketchfab' ? saved.selection : saved.online;
  const activeId = model?.id ?? online.modelId;
  const activeName = model?.name ?? online.name;
  return { model, storedModel: saved.model, selection: saved.selection, online, activeId, activeName, restoring, restoreError, restore, busy, status, error, upload, useOnline, useSavedLocal, clearFeedback };
}
