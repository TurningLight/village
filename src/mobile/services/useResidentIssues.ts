import { useEffect, useState, useCallback } from 'react';
import type { Issue } from '../../types';
import { residentGateway } from '../adapters/localResident';
import { DEMO_MODEL_ID } from '../../lib/issues';
export function useResidentIssues(modelId = DEMO_MODEL_ID) {
  const [request, setRequest] = useState(0);
  const [result, setResult] = useState<{
    modelId: string;
    request: number;
    issues: Issue[];
    error: string;
  } | null>(null);
  const reload = useCallback(() => setRequest((value) => value + 1), []);
  useEffect(() => {
    let active = true,
      sequence = 0;
    const read = () => {
      const current = ++sequence;
      void residentGateway
        .list(modelId)
        .then((issues) => {
          if (active && current === sequence) setResult({ modelId, request, issues, error: '' });
        })
        .catch(() => {
          if (active && current === sequence)
            setResult({ modelId, request, issues: [], error: '记录暂时无法读取，请重试。' });
        });
    };
    const stop = residentGateway.watch(read);
    read();
    return () => {
      active = false;
      stop();
    };
  }, [modelId, request]);
  const current = result?.modelId === modelId && result.request === request;
  return {
    issues: current ? result.issues : [],
    error: current ? result.error : '',
    loading: !current,
    reload,
  };
}
