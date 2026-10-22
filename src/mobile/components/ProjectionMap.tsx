import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Crosshair, LoaderCircle, MapPin, Maximize, Minus, Plus, RotateCcw } from 'lucide-react';
import type { Issue, Vector3D } from '../../types';
import type { SharedVillageMap } from '../../lib/sharedMapTypes';
import { createProjectionAnchor, issueProjectionUV } from '../../lib/projectionCoordinates';
import { projectionLocalPoint } from '../../lib/projectionMath';
import { validProjectionAnchor } from '../../lib/issues';
import './projection-map.css';

export interface ProjectionMapProps {
  map: SharedVillageMap;
  point?: Vector3D | null;
  anchor?: Issue['projectionAnchor'];
  onPick?: (point: Vector3D, anchor: NonNullable<Issue['projectionAnchor']>) => void;
  issues?: Issue[];
  onIssue?: (id: string) => void;
}
type ScreenPoint = { x: number; y: number };
type View = { zoom: number; x: number; y: number };
const clampZoom = (value: number) => Math.max(1, Math.min(8, value));

export default function ProjectionMap(props: ProjectionMapProps) {
  return (
    <ProjectionMapCanvas
      key={`${props.map.modelId}:${props.map.projection?.revision ?? 'unavailable'}`}
      {...props}
    />
  );
}

function ProjectionMapCanvas({ map, anchor, onPick, issues = [], onIssue }: ProjectionMapProps) {
  const projection = map.projection;
  const viewport = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 320, height: 320 });
  const [view, setView] = useState<View>({ zoom: 1, x: 0, y: 0 });
  const viewRef = useRef(view);
  const [imageState, setImageState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [notice, setNotice] = useState('');
  const pointers = useRef(new Map<number, ScreenPoint>());
  const gesture = useRef<{
    origin: ScreenPoint;
    previous: ScreenPoint;
    moved: boolean;
    pinched: boolean;
    distance: number;
    view: View;
  } | null>(null);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const imageSize = useMemo(() => {
    if (!projection) return { width: 1, height: 1 };
    const ratio = Math.min(size.width / projection.width, size.height / projection.height);
    return { width: projection.width * ratio, height: projection.height * ratio };
  }, [projection, size]);
  const markers = useMemo(
    () =>
      projection
        ? issues.flatMap((issue) => {
            const uv = issueProjectionUV(issue, map.modelId, projection);
            return uv && uv.every((n) => n >= 0 && n <= 1) ? [{ issue, uv }] : [];
          })
        : [],
    [issues, map.modelId, projection],
  );
  const selectedUV =
    projection &&
    validProjectionAnchor(anchor) &&
    anchor.modelId === map.modelId &&
    anchor.projectionCreatedAt === projection.createdAt
      ? anchor.uv
      : null;
  const outdated = !!anchor && !selectedUV;
  const needsRelocation = projection
    ? issues.filter(
        (issue) =>
          issue.projectionAnchor?.modelId === map.modelId &&
          !issueProjectionUV(issue, map.modelId, projection),
      ).length
    : 0;
  const updateView = (next: View) => {
    viewRef.current = next;
    setView(next);
  };
  const zoom = (factor: number) => {
    const current = viewRef.current,
      nextZoom = clampZoom(current.zoom * factor),
      scale = nextZoom / current.zoom;
    updateView({ zoom: nextZoom, x: current.x * scale, y: current.y * scale });
  };
  const pickAt = (x: number, y: number) => {
    if (!onPick || !projection || imageState !== 'ready') return;
    const current = viewRef.current;
    const uv: [number, number] = [
      (x - size.width / 2 - current.x) / (imageSize.width * current.zoom) + 0.5,
      (y - size.height / 2 - current.y) / (imageSize.height * current.zoom) + 0.5,
    ];
    if (!uv.every((n) => n >= 0 && n <= 1)) {
      setNotice('请在实景影像范围内选择位置。');
      return;
    }
    const picked = createProjectionAnchor(uv, projection);
    if (!picked) {
      setNotice('这份影像的坐标校准不可用，请在管理端重新生成投影。');
      return;
    }
    setNotice('位置已标记，可继续放大核对。');
    onPick(projectionLocalPoint(uv, projection.bounds), picked);
  };
  const screenPoint = (event: ReactPointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  };
  const down = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (
      imageState !== 'ready' ||
      (event.target as Element).closest('button') ||
      (event.pointerType === 'mouse' && event.button !== 0)
    )
      return;
    const position = screenPoint(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, position);
    const points = [...pointers.current.values()];
    if (points.length === 1)
      gesture.current = {
        origin: position,
        previous: position,
        moved: false,
        pinched: false,
        distance: 0,
        view: viewRef.current,
      };
    if (points.length === 2 && gesture.current) {
      const center = { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 };
      gesture.current = {
        ...gesture.current,
        origin: center,
        previous: center,
        moved: true,
        pinched: true,
        distance: Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y),
        view: viewRef.current,
      };
    }
  };
  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId) || !gesture.current) return;
    const point = screenPoint(event);
    pointers.current.set(event.pointerId, point);
    const state = gesture.current,
      points = [...pointers.current.values()];
    if (points.length === 2 && state.distance > 0) {
      const center = { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 };
      const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      const nextZoom = clampZoom((state.view.zoom * distance) / state.distance),
        scale = nextZoom / state.view.zoom;
      updateView({
        zoom: nextZoom,
        x: center.x - size.width / 2 - (state.origin.x - size.width / 2 - state.view.x) * scale,
        y: center.y - size.height / 2 - (state.origin.y - size.height / 2 - state.view.y) * scale,
      });
      return;
    }
    if (points.length === 1) {
      if (Math.hypot(point.x - state.origin.x, point.y - state.origin.y) > 8) state.moved = true;
      if (state.moved)
        updateView({
          ...viewRef.current,
          x: viewRef.current.x + point.x - state.previous.x,
          y: viewRef.current.y + point.y - state.previous.y,
        });
      state.previous = point;
    }
  };
  const end = (event: ReactPointerEvent<HTMLDivElement>, cancelled = false) => {
    if (!pointers.current.has(event.pointerId)) return;
    const state = gesture.current,
      position = screenPoint(event);
    pointers.current.delete(event.pointerId);
    if (
      !cancelled &&
      state &&
      !state.moved &&
      !state.pinched &&
      Math.hypot(position.x - state.origin.x, position.y - state.origin.y) <= 8
    )
      pickAt(position.x, position.y);
    if (!pointers.current.size) gesture.current = null;
    else if (state) {
      state.previous = [...pointers.current.values()][0];
      state.moved = true;
    }
  };
  const at = (uv: [number, number]) => ({
    left: `${size.width / 2 + view.x + (uv[0] - 0.5) * imageSize.width * view.zoom}px`,
    top: `${size.height / 2 + view.y + (uv[1] - 0.5) * imageSize.height * view.zoom}px`,
  });
  const retryImage = () => {
    setImageState('loading');
    setAttempt((n) => n + 1);
  };
  const src = projection
    ? `${projection.imageUrl}${attempt ? `${projection.imageUrl.includes('?') ? '&' : '?'}retry=${attempt}` : ''}`
    : '';

  return (
    <div className="m-projection-map">
      <div
        ref={viewport}
        className={`m-projection-viewport ${onPick ? 'is-picking' : ''}`}
        aria-label={`${map.name}实景二维地图`}
        onContextMenu={(event) => event.preventDefault()}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={(e) => end(e)}
        onPointerCancel={(e) => end(e, true)}
        onLostPointerCapture={(e) => end(e, true)}
      >
        {projection && (
          <img
            className="m-projection-image"
            src={src}
            alt={`${map.name}三维实景模型生成的平面投影`}
            draggable={false}
            onLoad={() => setImageState('ready')}
            onError={() => setImageState('error')}
            style={{
              width: imageSize.width,
              height: imageSize.height,
              transform: `translate(-50%, -50%) translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
              opacity: imageState === 'ready' ? 1 : 0,
            }}
          />
        )}
        {imageState === 'ready' && projection && (
          <>
            {markers.map(({ issue, uv }) => (
              <button
                key={issue.id}
                type="button"
                className={`m-projection-marker ${issue.status}`}
                style={at(uv)}
                aria-label={`查看事件：${issue.title}`}
                title={issue.title}
                disabled={!onIssue}
                onClick={() => onIssue?.(issue.id)}
              >
                <span />
              </button>
            ))}
            {selectedUV && (
              <span className="m-projection-picked" style={at(selectedUV)} aria-label="已选位置">
                <MapPin size={29} fill="currentColor" />
                <i />
              </span>
            )}
            <div className="m-projection-caption">
              <span>实景投影</span>
              <span>{map.name}</span>
            </div>
            <div className="m-projection-controls" aria-label="地图缩放">
              <button
                type="button"
                aria-label="放大地图"
                onClick={() => zoom(1.5)}
                disabled={view.zoom >= 8}
              >
                <Plus size={19} />
              </button>
              <button
                type="button"
                aria-label="缩小地图"
                onClick={() => zoom(1 / 1.5)}
                disabled={view.zoom <= 1}
              >
                <Minus size={19} />
              </button>
              <button
                type="button"
                aria-label="显示完整地图"
                onClick={() => updateView({ zoom: 1, x: 0, y: 0 })}
              >
                <Maximize size={18} />
              </button>
              {onPick && (
                <button
                  type="button"
                  aria-label="在地图中心选点"
                  onClick={() => pickAt(size.width / 2, size.height / 2)}
                >
                  <Crosshair size={19} />
                </button>
              )}
            </div>
            {onPick && (
              <span className="m-projection-reticle" aria-hidden="true">
                <Crosshair size={22}/>
              </span>
            )}
          </>
        )}
        {(!projection || imageState !== 'ready') && (
          <div className="m-projection-state" role="status">
            {projection && imageState === 'loading' ? (
              <>
                <LoaderCircle className="m-spin" size={25} />
                <strong>正在载入实景地图</strong>
                <span>首次载入后可直接查看共享投影</span>
              </>
            ) : (
              <>
                <MapPin size={27} />
                <strong>
                  {projection ? '实景影像暂时无法载入' : '这座村庄还没有共享二维影像'}
                </strong>
                <span>
                  {projection ? '请检查网络后重试。' : '请在电脑管理端生成并共享模型的平面投影。'}
                </span>
                {projection && (
                  <button type="button" onClick={retryImage}>
                    <RotateCcw size={15} />
                    重新载入
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
      <p className="m-projection-hint" role="status">
        {outdated
          ? '投影已更新，请在当前实景地图上重新选择位置。'
          : notice ||
            (needsRelocation
              ? `${needsRelocation} 条事件来自旧版投影，需重新定位，可从事件列表查看。`
              : onPick
                ? '单指拖动、双指缩放，轻点影像标记事件位置。'
                : '单指拖动、双指缩放，点击事件查看办理进度。')}
      </p>
    </div>
  );
}
