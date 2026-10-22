import { useState } from 'react';
import { buildingPositions, fields, roads, waterBodies } from '../../data/villageLayout';
import { rectangle } from '../../lib/spatial';
import { filteredIssues, issuesForModel } from '../../lib/issues';
import type { ProjectionView } from '../../lib/projectionTypes';
import { issueOnProjection } from '../../lib/projectionCoordinates';
import { projectionLocalPoint } from '../../lib/projectionMath';
import { useAppStore } from '../../store/useAppStore';
import { useDesktopMarkerStore } from '../../store/useDesktopMarkerStore';
import { desktopIssueMarkerVisible } from '../../lib/desktopIssueMarkers';
export default function MapFallback({
  modelId,
  demo,
  projection,
}: {
  modelId: string;
  demo: boolean;
  projection?: ProjectionView;
}) {
  const [zoom, setZoom] = useState(1),
    s = useAppStore();
  const acknowledged = useDesktopMarkerStore((state) => state.acknowledged);
  const issues = filteredIssues(
    issuesForModel(s.village?.issues ?? [], modelId),
    s.filterCategory,
    s.filterStatus,
  ).filter((issue) => desktopIssueMarkerVisible(issue, acknowledged));
  const image =
    !demo && projection?.status === 'ready' && projection.modelId === modelId
      ? projection.data
      : undefined;
  const corner = image ? projectionLocalPoint([0, 0], image.bounds) : { x: -100, z: -75 };
  const width = -corner.x * 2,
    height = -corner.z * 2;
  const points = (p: { x: number; z: number }[]) => p.map((v) => `${v.x},${v.z}`).join(' ');
  return (
    <div className="map-fallback">
      <p role="status">
        {demo ? 'WebGL地图不可用，已显示简化平面图' : 'WebGL地图不可用，已显示同一模型投影底图'}
      </p>
      <div className="fallback-buttons">
        <button aria-label="平面图放大" onClick={() => setZoom((z) => Math.min(4, z + 0.3))}>
          ＋
        </button>
        <button aria-label="平面图缩小" onClick={() => setZoom((z) => Math.max(0.5, z - 0.3))}>
          −
        </button>
        <button onClick={() => setZoom(1)}>全村</button>
      </div>
      <svg
        viewBox={
          demo
            ? `${-110 / zoom} ${-82 / zoom} ${220 / zoom} ${164 / zoom}`
            : `${(corner.x * 1.1) / zoom} ${(corner.z * 1.1) / zoom} ${(width * 1.1) / zoom} ${(height * 1.1) / zoom}`
        }
        role="img"
        aria-label={demo ? '村庄简化平面图' : '实景模型投影底图'}
      >
        {image && projection?.url && (
          <image
            href={projection.url}
            x={corner.x}
            y={corner.z}
            width={width}
            height={height}
            preserveAspectRatio="none"
          />
        )}
        {demo && (
          <>
            {s.layers.fields &&
              fields.map((f) => (
                <polygon
                  key={f.id}
                  points={points(rectangle(f.center, f.width, f.depth))}
                  fill="#a7b880"
                />
              ))}
            {s.layers.water &&
              waterBodies.map((w) => (
                <polyline
                  key={w.id}
                  points={points(w.points)}
                  fill="none"
                  stroke="#8fc8d8"
                  strokeWidth={w.width}
                />
              ))}
            {s.layers.roads &&
              roads.map((r) => (
                <polyline
                  key={r.id}
                  points={points(r.points)}
                  fill="none"
                  stroke="#a5a797"
                  strokeWidth={r.width}
                />
              ))}
            {s.showBuildings &&
              buildingPositions.map((b) => (
                <polygon
                  key={b.id}
                  points={points(rectangle(b.position, b.size.width, b.size.depth, b.rotation))}
                  fill={s.selectedBuildingId === b.id ? '#438b69' : '#e2d3b7'}
                  stroke="#6f8069"
                  strokeWidth={0.4}
                  role="button"
                  tabIndex={0}
                  aria-label={`选择建筑：${b.name}`}
                  onClick={() => s.selectBuilding(b.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') s.selectBuilding(b.id);
                  }}
                />
              ))}
          </>
        )}
        {s.showIssues &&
          issues.flatMap((i) => {
            const point = demo
              ? i.location.local
              : image
                ? issueOnProjection(i, modelId, image, projection?.reference)
                : null;
            if (!point) return [];
            return [
              <circle
                key={i.id}
                cx={point.x}
                cy={point.z}
                r={s.selectedIssueId === i.id ? 3.5 : 2.5}
                fill={
                  i.status === 'completed'
                    ? '#438b69'
                    : i.status === 'processing'
                      ? '#d3913e'
                      : '#bf6555'
                }
                stroke="#fff"
                strokeWidth={0.7}
                role="button"
                tabIndex={0}
                aria-label={`定位问题：${i.title}`}
                onClick={() => s.selectIssue(i.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') s.selectIssue(i.id);
                }}
              />,
            ];
          })}
      </svg>
    </div>
  );
}
