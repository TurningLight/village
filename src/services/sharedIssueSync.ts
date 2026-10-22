import type { Issue } from '../types';
import { useAppStore } from '../store/useAppStore';
import { localIssueRepository } from './issueService';
import { subscribeToIssueStorage } from './issueSync';
export type SyncPhase = 'connecting' | 'connected' | 'offline';
let phase: SyncPhase = 'connecting';
const listeners = new Set<() => void>();
export const syncStatus = {
  get: () => phase,
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
function setPhase(value: SyncPhase) {
  if (value !== phase) {
    phase = value;
    listeners.forEach((fn) => fn());
  }
}
async function call(body?: Issue[], createOnly = false): Promise<Issue[]> {
  const response = await fetch(createOnly ? '/api/issues/report' : '/api/issues', {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify({ issues: body }) : undefined,
    signal: AbortSignal.timeout(10000),
  });
  let value;
  try {
    value = await response.json();
  } catch {
    throw new Error('村里服务暂时无法连接，请稍后重试，草稿会保留。');
  }
  if (!response.ok || !Array.isArray(value.issues))
    throw new Error(value.error?.message || '村里服务暂时无法连接，请稍后重试，草稿会保留。');
  return value.issues;
}
export function applySharedIssues(remote: Issue[]) {
  const state = useAppStore.getState(),
    village = state.village;
  if (!village) return;
  const rows = new Map(village.issues.map((i) => [i.id, i]));
  for (const issue of remote) {
    const old = rows.get(issue.id);
    if (!old || Date.parse(issue.updatedAt) >= Date.parse(old.updatedAt)) rows.set(issue.id, issue);
  }
  const next = [...rows.values()];
  if (JSON.stringify(next) === JSON.stringify(village.issues)) return;
  try {
    localIssueRepository.write(next);
  } catch {
    /* The shared server already persists the canonical records. */
  }
  applying = true;
  useAppStore.setState({ village: { ...village, issues: next } });
  applying = false;
}
export async function writeSharedIssues(issues: Issue[], createOnly = false) {
  try {
    const result = await call(issues, createOnly);
    applySharedIssues(result);
    setPhase('connected');
    return result;
  } catch (error) {
    setPhase('offline');
    throw error;
  }
}
let consumers = 0,
  applying = false,
  stopStore: (() => void) | undefined,
  stopStorage: (() => void) | undefined,
  interval: ReturnType<typeof setInterval> | undefined,
  debounce: ReturnType<typeof setTimeout> | undefined,
  running = false,
  again = false;
async function synchronize() {
  if (running) {
    again = true;
    return;
  }
  running = true;
  try {
    let remote = await call();
    const local = useAppStore.getState().village?.issues || [],
      known = new Map(remote.map((i) => [i.id, i]));
    const changes = local.filter(
      (i) => !known.has(i.id) || Date.parse(i.updatedAt) > Date.parse(known.get(i.id)!.updatedAt),
    );
    if (changes.length) remote = await call(changes);
    if (consumers) {
      applySharedIssues(remote);
      setPhase('connected');
    }
  } catch {
    if (consumers) setPhase('offline');
  } finally {
    running = false;
    if (again && consumers) {
      again = false;
      void synchronize();
    }
  }
}
export function connectSharedIssueSync() {
  consumers++;
  if (consumers === 1) {
    stopStorage = subscribeToIssueStorage();
    stopStore = useAppStore.subscribe(() => {
      if (applying) return;
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => void synchronize(), 200);
    });
    interval = setInterval(() => void synchronize(), 1800);
    void synchronize();
  }
  return () => {
    consumers--;
    if (consumers === 0) {
      stopStore?.();
      stopStorage?.();
      if (interval) clearInterval(interval);
      if (debounce) clearTimeout(debounce);
    }
  };
}
