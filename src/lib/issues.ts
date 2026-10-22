export const DEMO_MODEL_ID = 'qinghe-demo';
import type { Issue, IssueCategory, IssueStatus } from '../types';
import type { Vector3D } from '../types';
import type { ModelCamera, ModelPoint } from './sketchfab';

export const BAGUA_MODEL_ID = '2b79987cd49c4727b1bd12aa7ab62927';
export const ISSUE_CATEGORIES: IssueCategory[] = [
  '道路破损',
  '设施故障',
  '垃圾堆放',
  '积水问题',
  '设施缺失',
  '环境杂乱',
  '其他',
];
export const ISSUE_STATUS_LABEL = { pending: '待处理', processing: '处理中', completed: '已办结' };
export const ISSUE_SEVERITY_LABEL = { low: '一般', medium: '关注', high: '紧急' };

export function issuesForModel(issues: Issue[], modelId = BAGUA_MODEL_ID) {
  return issues.filter((issue) =>
    issue.projectionAnchor
      ? issue.projectionAnchor.modelId === modelId
      : issue.sceneAnchor
        ? issue.sceneAnchor.modelId === modelId
        : modelId === BAGUA_MODEL_ID || modelId === DEMO_MODEL_ID,
  );
}

export function activeIssues(
  issues: Issue[],
  category: IssueCategory | 'all' = 'all',
  status: IssueStatus | 'all' = 'all',
) {
  return issues.filter(
    (issue) =>
      issue.status !== 'completed' &&
      (category === 'all' || issue.category === category) &&
      (status === 'all' || issue.status === status),
  );
}

export function validModelPoint(point: unknown): point is [number, number, number] {
  return (
    Array.isArray(point) &&
    point.length === 3 &&
    point.every((value) => typeof value === 'number' && Number.isFinite(value))
  );
}

export function validProjectionAnchor(
  value: unknown,
): value is NonNullable<Issue['projectionAnchor']> {
  if (!value || typeof value !== 'object') return false;
  const anchor = value as Partial<NonNullable<Issue['projectionAnchor']>>;
  return (
    typeof anchor.modelId === 'string' &&
    anchor.modelId.length > 0 &&
    anchor.modelId.length <= 200 &&
    typeof anchor.projectionCreatedAt === 'string' &&
    Number.isFinite(Date.parse(anchor.projectionCreatedAt)) &&
    Array.isArray(anchor.uv) &&
    anchor.uv.length === 2 &&
    anchor.uv.every(
      (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1,
    ) &&
    !!anchor.ray &&
    validModelPoint(anchor.ray.start) &&
    validModelPoint(anchor.ray.end) &&
    anchor.ray.start.some((value, index) => value !== anchor.ray!.end[index])
  );
}

// postMessage preserves typed arrays from the WebGL viewer. Normalize these
// at the API boundary; persisted anchors must still be ordinary JSON arrays.
export function readModelPoint(point: unknown): ModelPoint | null {
  if (!Array.isArray(point) && !ArrayBuffer.isView(point)) return null;
  const values = point as ArrayLike<number>;
  if (values.length !== 3) return null;
  const result: ModelPoint = [values[0], values[1], values[2]];
  return validModelPoint(result) ? result : null;
}

export function modelScale(camera: ModelCamera) {
  return Math.hypot(...camera.position.map((value, index) => value - camera.target[index])) / 260;
}

export function modelPointToLocal(point: ModelPoint, camera: ModelCamera): Vector3D {
  const scale = modelScale(camera);
  return {
    x: (point[0] - camera.target[0]) / scale,
    y: (point[2] - camera.target[2]) / scale,
    z: -(point[1] - camera.target[1]) / scale,
  };
}

export function localToModelPoint(local: Vector3D, camera: ModelCamera): ModelPoint {
  const scale = modelScale(camera);
  return [
    camera.target[0] + local.x * scale,
    camera.target[1] - local.z * scale,
    camera.target[2] + scale * 6.5,
  ];
}

export function filteredIssues(
  issues: Issue[],
  category: IssueCategory | 'all' = 'all',
  status: IssueStatus | 'all' = 'all',
) {
  return issues.filter(
    (issue) =>
      (category === 'all' || issue.category === category) &&
      (status === 'all' || issue.status === status),
  );
}
