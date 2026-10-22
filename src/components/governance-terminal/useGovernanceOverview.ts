import { useEffect, useState } from 'react';
import { readGovernanceOverview } from '../../services/governanceService';
import type { GovernanceOverview } from '../../types/governance';

export default function useGovernanceOverview(modelId: string, month: string) {
  const [overview, setOverview] = useState<GovernanceOverview | null>(null);
  const [attempted, setAttempted] = useState('');
  const [failure, setFailure] = useState({ key: '', message: '' });
  const [refreshVersion, setRefreshVersion] = useState(0);
  const requestKey = `${modelId}:${month}:${refreshVersion}`;
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const read = async () => {
      try {
        const result = await readGovernanceOverview(modelId, month, controller.signal);
        if (controller.signal.aborted) return;
        setOverview(result);
        setFailure({ key: requestKey, message: '' });
      } catch (cause) {
        if (controller.signal.aborted) return;
        setFailure({
          key: requestKey,
          message: cause instanceof Error ? cause.message : '治理数据读取失败，请刷新重试。',
        });
      } finally {
        if (!controller.signal.aborted) {
          setAttempted(requestKey);
          timer = setTimeout(read, 3000);
        }
      }
    };
    void read();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [modelId, month, requestKey]);
  const current = overview?.modelId === modelId && overview.month === month ? overview : null;
  return {
    overview: current,
    loading: attempted !== requestKey && !current,
    error: failure.key === requestKey ? failure.message : '',
    refresh: () => setRefreshVersion((value) => value + 1),
  };
}
