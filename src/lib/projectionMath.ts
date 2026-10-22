import type { ModelPoint } from './sketchfab';
import type { ModelProjection, ProjectionBounds, ProjectionTransform } from './projectionTypes';

export function projectionFrame(bounds: ProjectionBounds, maxSize = 2048) {
  const width = bounds.maxX - bounds.minX,
    height = bounds.maxY - bounds.minY;
  if (![width, height].every((n) => Number.isFinite(n) && n > 0))
    throw new Error('模型平面范围无效，无法生成投影。');
  const pad = Math.max(width, height) * 0.035;
  const padded = {
    minX: bounds.minX - pad,
    minY: bounds.minY - pad,
    maxX: bounds.maxX + pad,
    maxY: bounds.maxY + pad,
  };
  const w = width + pad * 2,
    h = height + pad * 2,
    scale = Math.min(2048, Math.max(64, maxSize)) / Math.max(w, h);
  return {
    bounds: padded,
    width: Math.max(64, Math.round(w * scale)),
    height: Math.max(64, Math.round(h * scale)),
  };
}
export function projectWorldPoint(
  point: ModelPoint,
  projection: Pick<ModelProjection, 'bounds' | 'transform'>,
): [number, number] | null {
  if (!point.every(Number.isFinite)) return null;
  const t = projection.transform,
    b = projection.bounds;
  if (t.kind === 'orthographic')
    return [(point[0] - b.minX) / (b.maxX - b.minX), (b.maxY - point[1]) / (b.maxY - b.minY)];
  const p = point.map((n, i) => (n - t.origin[i]) / t.unit),
    m = t.matrix;
  const d = m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + 1;
  if (!Number.isFinite(d) || d <= 1e-8) return null;
  const u = (m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3]) / d;
  const v = (m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7]) / d;
  return Number.isFinite(u) && Number.isFinite(v) ? [u, v] : null;
}
/** A centered display plane keeps MapLibre stable for arbitrary model origins and units.
 * This is deliberately not a geographic registration or a metre conversion. */
export function projectionLocalPoint(uv: [number, number], bounds: ProjectionBounds) {
  const width = bounds.maxX - bounds.minX,
    height = bounds.maxY - bounds.minY;
  const scale = 200 / Math.max(width, height);
  return { x: (uv[0] - 0.5) * width * scale, y: 0, z: (uv[1] - 0.5) * height * scale };
}

/** Fit a 3D-to-image camera from public world-to-screen samples, including height and camera roll. */
export function fitProjectionCamera(
  samples: { point: ModelPoint; uv: [number, number] }[],
  origin: ModelPoint,
  unit: number,
): ProjectionTransform {
  if (samples.length < 6 || !Number.isFinite(unit) || unit <= 0)
    throw new Error('投影校准点不足。');
  const rows: number[][] = [],
    values: number[] = [];
  for (const {
    point,
    uv: [u, v],
  } of samples) {
    if (![...point, u, v].every(Number.isFinite)) throw new Error('投影校准坐标无效。');
    const [x, y, z] = point.map((n, i) => (n - origin[i]) / unit);
    rows.push(
      [x, y, z, 1, 0, 0, 0, 0, -u * x, -u * y, -u * z],
      [0, 0, 0, 0, x, y, z, 1, -v * x, -v * y, -v * z],
    );
    values.push(u, v);
  }
  const n = 11,
    a = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n + 1 }, (_, j) =>
        rows.reduce((sum, r, k) => sum + r[i] * (j === n ? values[k] : r[j]), 0),
      ),
    );
  for (let c = 0; c < n; c++) {
    let pivot = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[pivot][c])) pivot = r;
    if (Math.abs(a[pivot][c]) < 1e-10) throw new Error('无法校准投影相机，请重试或上传完整模型。');
    [a[c], a[pivot]] = [a[pivot], a[c]];
    const div = a[c][c];
    for (let j = c; j <= n; j++) a[c][j] /= div;
    for (let r = 0; r < n; r++)
      if (r !== c) {
        const factor = a[r][c];
        for (let j = c; j <= n; j++) a[r][j] -= factor * a[c][j];
      }
  }
  const transform: ProjectionTransform = {
    kind: 'projective',
    matrix: a.map((r) => r[n]),
    origin: [...origin],
    unit,
  };
  for (const sample of samples) {
    const projected = projectWorldPoint(sample.point, {
      bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
      transform,
    });
    if (!projected || Math.hypot(projected[0] - sample.uv[0], projected[1] - sample.uv[1]) > 0.002)
      throw new Error('底图与三维坐标校准误差过大，请重新生成。');
  }
  return transform;
}
