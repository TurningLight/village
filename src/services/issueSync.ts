import { useAppStore } from '../store/useAppStore';
import { isIssueList, ISSUE_STORAGE_KEY } from './issueService';

/** Same-origin windows only. Cross-device sync belongs in an HTTP/realtime adapter. */
export function subscribeToIssueStorage() {
  const listener = (event: StorageEvent) => {
    if (event.key !== ISSUE_STORAGE_KEY || event.storageArea !== localStorage || !event.newValue)
      return;
    try {
      const issues: unknown = JSON.parse(event.newValue);
      if (!isIssueList(issues)) return;
      const state = useAppStore.getState();
      if (!state.village) return;
      useAppStore.setState({
        village: { ...state.village, issues },
        selectedIssueId: issues.some((i) => i.id === state.selectedIssueId)
          ? state.selectedIssueId
          : null,
      });
    } catch {
      /* Ignore malformed external writes, keeping the last usable state. */
    }
  };
  window.addEventListener('storage', listener);
  return () => window.removeEventListener('storage', listener);
}
