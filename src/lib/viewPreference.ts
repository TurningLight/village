import type { AppState } from '../types';
const KEY = 'village-view-mode';
export function readViewPreference(): AppState['viewMode'] {
  try {
    const value = localStorage.getItem(KEY);
    return value === '2d' || value === 'split' ? value : '3d';
  } catch {
    return '3d';
  }
}
export function saveViewPreference(value: AppState['viewMode']) {
  try {
    localStorage.setItem(KEY, value);
  } catch {
    /* The current view still works. */
  }
}
