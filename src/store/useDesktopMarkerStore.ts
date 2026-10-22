import { create } from 'zustand';
import type { Issue } from '../types';
import {
  completedMarkerCycle,
  completedMarkerIdentity,
  DESKTOP_MARKER_STORAGE_KEY,
  readCompletedMarkerAcknowledgements,
  saveCompletedMarkerAcknowledgements,
} from '../lib/desktopIssueMarkers';
import type { CompletedMarkerAcknowledgements } from '../lib/desktopIssueMarkers';

interface DesktopMarkerState {
  acknowledged: CompletedMarkerAcknowledgements;
  acknowledgeViewedIssue: (issue: Issue) => void;
}

/** Desktop presentation state is deliberately separate from shared issue data. */
export const useDesktopMarkerStore = create<DesktopMarkerState>((set, get) => ({
  acknowledged: readCompletedMarkerAcknowledgements(),
  acknowledgeViewedIssue(issue) {
    const cycle = completedMarkerCycle(issue);
    if (cycle === null) return;
    const key = completedMarkerIdentity(issue);
    if (get().acknowledged[key] === cycle) return;
    const acknowledged = { ...get().acknowledged, [key]: cycle };
    saveCompletedMarkerAcknowledgements(acknowledged);
    set({ acknowledged });
  },
}));

export function connectDesktopMarkerStorage() {
  const refresh = (event: StorageEvent) => {
    if (event.key === DESKTOP_MARKER_STORAGE_KEY || event.key === null)
      useDesktopMarkerStore.setState({ acknowledged: readCompletedMarkerAcknowledgements() });
  };
  window.addEventListener('storage', refresh);
  return () => window.removeEventListener('storage', refresh);
}
