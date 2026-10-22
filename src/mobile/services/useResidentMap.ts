import { useCallback, useEffect, useRef, useState } from 'react';
import { readSharedMaps } from '../../services/sharedMaps';
import type { SharedMapCatalog, SharedVillageMap } from '../../lib/sharedMapTypes';

const CATALOG_KEY = 'village-mobile-map-catalog';
const EMPTY_CATALOG: SharedMapCatalog = {
  activeModelId: 'qinghe-demo',
  activeRealModelId: null,
  maps: [],
};
export function residentMapFromCatalog(catalog: SharedMapCatalog): SharedVillageMap | null {
  return (
    catalog.maps.find((map) => map.kind === 'real' && map.modelId === catalog.activeRealModelId) ||
    null
  );
}
function savedCatalog(): SharedMapCatalog | null {
  try {
    const value = JSON.parse(localStorage.getItem(CATALOG_KEY) || 'null');
    if (
      Array.isArray(value?.maps) &&
      value.maps.every(
        (m: SharedVillageMap) =>
          typeof m?.modelId === 'string' &&
          typeof m.name === 'string' &&
          ['demo', 'real'].includes(m.kind),
      )
    )
      return value;
  } catch {
    /* The shared API restores the current real village. */
  }
  return null;
}
/** The resident app follows the desktop's real-model selection. It never offers
 * the demo village and never carries a point across two model identities. */
export function useResidentMap() {
  const [catalog, setCatalog] = useState<SharedMapCatalog>(() => savedCatalog() || EMPTY_CATALOG),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [request, setRequest] = useState(0);
  const previousReal = useRef<string | null>(residentMapFromCatalog(catalog)?.modelId || null);
  useEffect(() => {
    const controller = new AbortController();
    let busy = false;
    const read = async () => {
      if (busy) return;
      busy = true;
      try {
        const next = await readSharedMaps(controller.signal);
        if (controller.signal.aborted) return;
        const map = residentMapFromCatalog(next);
        if (previousReal.current && previousReal.current !== map?.modelId)
          setNotice(`电脑端已切换到${map?.name || '新的实景村庄'}，请核对当前村庄后录入。`);
        previousReal.current = map?.modelId || null;
        setCatalog((previous) =>
          JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
        );
        try {
          localStorage.setItem(CATALOG_KEY, JSON.stringify(next));
        } catch {
          /* The server persists canonical maps. */
        }
        setError('');
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : '村庄底图暂时无法读取。');
      } finally {
        busy = false;
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void read();
    const interval = setInterval(() => void read(), 2500);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [request]);
  const refresh = useCallback(() => setRequest((value) => value + 1), []);
  return {
    map: residentMapFromCatalog(catalog),
    loading,
    error,
    notice,
    dismissNotice: () => setNotice(''),
    refresh,
  };
}
