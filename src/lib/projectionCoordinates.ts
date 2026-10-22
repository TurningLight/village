import type { Issue } from '../types';
import type { ModelCamera, ModelPoint, SketchfabApi } from './sketchfab';
import type { ModelProjection } from './projectionTypes';
import {
  localToModelPoint,
  readModelPoint,
  validModelPoint,
  validProjectionAnchor,
} from './issues';
import { projectWorldPoint, projectionLocalPoint } from './projectionMath';

export type ProjectionGeometry = Pick<
  ModelProjection,
  'modelId' | 'bounds' | 'transform' | 'reference' | 'createdAt'
>;

/** A point in the shared image. Old UVs cannot be reused after a different
 * capture: a changed crop or camera would otherwise move the reported event. */
export function issueProjectionUV(
  issue: Issue,
  modelId: string,
  projection: ProjectionGeometry,
  reference: ModelCamera = projection.reference,
): [number, number] | null {
  if (projection.modelId !== modelId) return null;
  const anchor = issue.projectionAnchor;
  if (anchor) {
    if (!validProjectionAnchor(anchor) || anchor.modelId !== modelId) return null;
    if (anchor.projectionCreatedAt === projection.createdAt) return [...anchor.uv];
    // A true mesh hit can be reprojected into another capture. A ray alone
    // cannot supply the unknown surface height, so require re-positioning.
    if (issue.sceneAnchor?.modelId !== modelId) return null;
  }
  if (issue.sceneAnchor && issue.sceneAnchor.modelId !== modelId) return null;
  const point: ModelPoint =
    issue.sceneAnchor?.modelId === modelId && validModelPoint(issue.sceneAnchor.position)
      ? issue.sceneAnchor.position
      : localToModelPoint(issue.location.local, reference);
  return projectWorldPoint(point, projection);
}

export function issueOnProjection(
  issue: Issue,
  modelId: string,
  projection: ProjectionGeometry,
  reference: ModelCamera = projection.reference,
) {
  const uv = issueProjectionUV(issue, modelId, projection, reference);
  return uv ? projectionLocalPoint(uv, projection.bounds) : null;
}

/** Invert the image camera at two elevations. This produces a picking ray,
 * never an assumed mesh hit. Calculation in the calibrated normalized frame
 * retains accuracy for projected models whose origins are very large. */
export function projectionPickingRay(
  uv: [number, number],
  projection: ProjectionGeometry,
): NonNullable<Issue['projectionAnchor']>['ray'] | null {
  if (!uv.every((n) => Number.isFinite(n) && n >= 0 && n <= 1)) return null;
  const { bounds, reference, transform } = projection;
  const width = bounds.maxX - bounds.minX,
    height = bounds.maxY - bounds.minY;
  const distance = Math.hypot(...reference.position.map((n, i) => n - reference.target[i]));
  if (
    ![width, height, distance].every((n) => Number.isFinite(n) && n > 0) ||
    !validModelPoint(reference.target)
  )
    return null;
  const span = Math.max(width, height, distance) * 2;
  const high = reference.target[2] + span,
    low = reference.target[2] - span;
  if (transform.kind === 'orthographic') {
    const x = bounds.minX + uv[0] * width,
      y = bounds.maxY - uv[1] * height;
    return { start: [x, y, high], end: [x, y, low] };
  }
  const { matrix: m, origin, unit } = transform;
  if (
    m.length !== 11 ||
    !m.every(Number.isFinite) ||
    !validModelPoint(origin) ||
    !Number.isFinite(unit) ||
    unit <= 0
  )
    return null;
  const [u, v] = uv;
  const a = m[0] - u * m[8],
    b = m[1] - u * m[9],
    c = m[2] - u * m[10];
  const d = m[4] - v * m[8],
    e = m[5] - v * m[9],
    f = m[6] - v * m[10];
  const determinant = a * e - b * d;
  if (Math.abs(determinant) <= Math.max(1, Math.hypot(a, b) * Math.hypot(d, e)) * 1e-12)
    return null;
  const atHeight = (z: number): ModelPoint => {
    const nz = (z - origin[2]) / unit;
    const r = u - m[3] - c * nz,
      s = v - m[7] - f * nz;
    return [
      origin[0] + ((r * e - b * s) / determinant) * unit,
      origin[1] + ((a * s - r * d) / determinant) * unit,
      z,
    ];
  };
  const start = atHeight(high),
    end = atHeight(low);
  return validModelPoint(start) && validModelPoint(end) ? { start, end } : null;
}

export function createProjectionAnchor(
  uv: [number, number],
  projection: ProjectionGeometry,
): Issue['projectionAnchor'] | null {
  const ray = projectionPickingRay(uv, projection);
  if (!ray) return null;
  const anchor = {
    modelId: projection.modelId,
    projectionCreatedAt: projection.createdAt,
    uv: [...uv] as [number, number],
    ray,
  };
  return validProjectionAnchor(anchor) ? anchor : null;
}

/** Resolve a mobile image location against the actual mesh. A miss remains a
 * miss; the image display plane is never substituted for a surface position. */
export function projectionSurfacePoint(
  anchor: Issue['projectionAnchor'],
  modelId: string,
  pick: SketchfabApi['pickFromScene'],
): Promise<ModelPoint | null> {
  if (!validProjectionAnchor(anchor) || anchor.modelId !== modelId) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      pick(anchor.ray.start, anchor.ray.end, (error, hit) => {
        resolve(error ? null : readModelPoint(hit?.position3D));
      });
    } catch {
      resolve(null);
    }
  });
}
