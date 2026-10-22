import type { Issue } from '../types';

export type CompletedMarkerAcknowledgements = Record<string, string>;

export const DESKTOP_MARKER_STORAGE_KEY = 'village-desktop-completed-markers-v1';

/** Reading an archive changes its marker only, never the canonical issue. */
export function completedMarkerIdentity(issue: Issue): string {
  return JSON.stringify([
    issue.projectionAnchor?.modelId || issue.sceneAnchor?.modelId || 'legacy',
    issue.id,
  ]);
}

/** Later completion notes stay in the same cycle; a reopen starts a new one. */
export function completedMarkerCycle(issue: Issue): string | null {
  if (issue.status !== 'completed') return null;
  const history = issue.history
    .map((entry, index) => ({ ...entry, index, timestamp: Date.parse(entry.time) }))
    .filter((entry) => Number.isFinite(entry.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp || a.index - b.index);
  let closure = '',
    cycle = 0,
    previousStatus = '';
  for (const entry of history) {
    if (entry.status === 'completed' && previousStatus !== 'completed') {
      closure = new Date(entry.timestamp).toISOString();
      cycle += 1;
    }
    previousStatus = entry.status;
  }
  // Legacy completed records may not have a closing history entry. Keep a
  // stable identity so a refreshed note/updatedAt does not resurrect the pin.
  return JSON.stringify([issue.createdAt, closure, cycle]);
}

export function desktopIssueMarkerVisible(
  issue: Issue,
  acknowledged: CompletedMarkerAcknowledgements,
): boolean {
  const cycle = completedMarkerCycle(issue);
  return cycle === null || acknowledged[completedMarkerIdentity(issue)] !== cycle;
}

export function readCompletedMarkerAcknowledgements(): CompletedMarkerAcknowledgements {
  try {
    const raw = localStorage.getItem(DESKTOP_MARKER_STORAGE_KEY);
    if (!raw) return {};
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1)
      return {};
    const items = 'acknowledged' in value ? value.acknowledged : null;
    if (!items || typeof items !== 'object' || Array.isArray(items)) return {};
    return Object.fromEntries(
      Object.entries(items)
        .filter(
          ([key, cycle]) => key.length <= 1000 && typeof cycle === 'string' && cycle.length <= 1000,
        )
        .slice(-10000),
    );
  } catch {
    return {};
  }
}

export function saveCompletedMarkerAcknowledgements(value: CompletedMarkerAcknowledgements) {
  try {
    localStorage.setItem(
      DESKTOP_MARKER_STORAGE_KEY,
      JSON.stringify({ version: 1, acknowledged: value }),
    );
  } catch {
    // Marker acknowledgement remains available for this tab if storage is full.
  }
}
