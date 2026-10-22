import type { Issue } from '../types';
import { validProjectionAnchor } from '../lib/issues';

export const ISSUE_STORAGE_KEY = 'village-issues';

/** Replace this adapter with HTTP/WebSocket calls when connecting FastAPI. */
export interface IssueRepository {
  read(fallback: Issue[]): Issue[];
  write(issues: Issue[]): void;
}

export function isIssueList(value: unknown): value is Issue[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        item &&
        typeof item.id === 'string' &&
        typeof item.title === 'string' &&
        typeof item.description === 'string' &&
        typeof item.category === 'string' &&
        typeof item.area === 'string' &&
        typeof item.reporter === 'string' &&
        ['pending', 'processing', 'completed'].includes(item.status) &&
        ['low', 'medium', 'high'].includes(item.severity) &&
        Number.isFinite(Date.parse(item.createdAt)) &&
        Number.isFinite(Date.parse(item.updatedAt)) &&
        Array.isArray(item.history) &&
        item.history.every(
          (entry) =>
            entry &&
            typeof entry.note === 'string' &&
            typeof entry.operator === 'string' &&
            Number.isFinite(Date.parse(entry.time)) &&
            ['pending', 'processing', 'completed'].includes(entry.status),
        ) &&
        item.location?.local &&
        ['x', 'y', 'z'].every((axis) => Number.isFinite(item.location.local[axis])) &&
        (!item.projectionAnchor || validProjectionAnchor(item.projectionAnchor)) &&
        (!item.sceneAnchor ||
          (typeof item.sceneAnchor.modelId === 'string' &&
            Array.isArray(item.sceneAnchor.position) &&
            item.sceneAnchor.position.length === 3 &&
            item.sceneAnchor.position.every(Number.isFinite))),
    )
  );
}

export const localIssueRepository: IssueRepository = {
  read(fallback) {
    try {
      const raw = localStorage.getItem(ISSUE_STORAGE_KEY);
      if (raw !== null) {
        const data: unknown = JSON.parse(raw);
        if (isIssueList(data)) return data;
      }
    } catch (error) {
      console.error('读取事件失败，暂时使用演示数据。', error);
    }
    return fallback;
  },
  write(issues) {
    try {
      localStorage.setItem(ISSUE_STORAGE_KEY, JSON.stringify(issues));
    } catch {
      throw new Error('保存失败，请检查浏览器存储空间或隐私设置后重试。');
    }
  },
};
