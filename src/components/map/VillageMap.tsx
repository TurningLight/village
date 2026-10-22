import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, ImageSource, Map as GLMap, Popup } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
maplibregl.setWorkerUrl(workerUrl);
maplibregl.setWorkerCount(2);
import { useAppStore } from '../../store/useAppStore';
import { useDesktopMarkerStore } from '../../store/useDesktopMarkerStore';
import { desktopIssueMarkerVisible } from '../../lib/desktopIssueMarkers';
import { spatialGeoJSON, geoPair } from '../../lib/spatial';
import { filteredIssues, issuesForModel } from '../../lib/issues';
import MapFallback from './MapFallback';
import type { ProjectionView } from '../../lib/projectionTypes';
import type { SketchfabSource } from '../../lib/mapSources';
import { sketchfabModelUrl } from '../../lib/mapSources';
import { BAGUA_MODEL_ID } from '../../lib/issues';
import { projectionLocalPoint } from '../../lib/projectionMath';
import { issueOnProjection } from '../../lib/projectionCoordinates';
import { Maximize2, RefreshCw, LoaderCircle } from 'lucide-react';

export default function VillageMap({
  modelId,
  demo,
  mini = false,
  projection,
  online,
}: {
  modelId: string;
  demo: boolean;
  mini?: boolean;
  projection?: ProjectionView;
  online?: SketchfabSource;
}) {
  const container = useRef<HTMLDivElement>(null),
    map = useRef<GLMap>(null),
    popup = useRef<Popup>(null);
  const [ready, setReady] = useState(false),
    [failed, setFailed] = useState(false);
  const {
    village,
    selectedBuildingId,
    selectedIssueId,
    currentRenovationId,
    selectionRevision,
    filterCategory,
    filterStatus,
    showBuildings,
    showIssues,
    layers,
  } = useAppStore();
  const acknowledged = useDesktopMarkerStore((state) => state.acknowledged);
  const shapes = useMemo(() => spatialGeoJSON(), []);
  const issues = useMemo(
    () =>
      filteredIssues(
        issuesForModel(village?.issues ?? [], modelId),
        filterCategory,
        filterStatus,
      ).filter((issue) => desktopIssueMarkerVisible(issue, acknowledged)),
    [village, modelId, filterCategory, filterStatus, acknowledged],
  );
  const image = !demo && projection?.modelId === modelId ? projection.data : undefined;
  const imageReady = !!image && projection?.status === 'ready';
  const imageCorners = useMemo(
    () =>
      image
        ? [
            geoPair(projectionLocalPoint([0, 0], image.bounds)),
            geoPair(projectionLocalPoint([1, 0], image.bounds)),
            geoPair(projectionLocalPoint([1, 1], image.bounds)),
            geoPair(projectionLocalPoint([0, 1], image.bounds)),
          ]
        : [],
    [image],
  );
  const mapLocation = useCallback(
    (issue: (typeof issues)[number]) =>
      demo
        ? issue.location.local
        : image
          ? issueOnProjection(issue, modelId, image, projection?.reference)
          : null,
    [demo, image, modelId, projection?.reference],
  );
  const fit = useCallback(() => {
    const m = map.current;
    if (!m) return;
    const points = (
      demo ? issuesForModel(useAppStore.getState().village?.issues ?? [], modelId) : []
    ).flatMap((i) => {
      const point = mapLocation(i);
      return point ? [geoPair(point)] : [];
    });
    if (!demo) points.push(...imageCorners);
    if (demo) points.push(geoPair({ x: -86, y: 0, z: -62 }), geoPair({ x: 96, y: 0, z: 66 }));
    const bounds = new maplibregl.LngLatBounds();
    points.forEach((p) => bounds.extend(p));
    if (bounds.isEmpty())
      bounds.extend(geoPair({ x: -70, y: 0, z: -55 })).extend(geoPair({ x: 75, y: 0, z: 55 }));
    m.fitBounds(bounds, { padding: mini ? 15 : 50, maxZoom: 19, duration: 500 });
  }, [demo, mini, modelId, imageCorners, mapLocation]);
  useEffect(() => {
    let disposed = false,
      m: GLMap;
    queueMicrotask(() => {
      if (!disposed) {
        setReady(false);
        setFailed(false);
      }
    });
    try {
      m = new maplibregl.Map({
        container: container.current,
        style: {
          version: 8,
          sources: {},
          layers: [
            { id: 'background', type: 'background', paint: { 'background-color': '#edf0df' } },
          ],
        },
        center: [120.5, 30.5],
        zoom: 17,
        attributionControl: false,
        pitch: 0,
        dragRotate: false,
      });
      map.current = m;
      m.addControl(new maplibregl.NavigationControl({ showCompass: !mini }), 'top-right');
      if (demo)
        m.addControl(new maplibregl.ScaleControl({ unit: 'metric', maxWidth: 90 }), 'bottom-left');
      m.on('load', () => {
        if (disposed) return;
        Object.entries(shapes).forEach(([id, data]) =>
          m.addSource(id, {
            type: 'geojson',
            data: demo ? data : { type: 'FeatureCollection', features: [] },
          }),
        );
        m.addSource('issues', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
        m.addLayer({
          id: 'fields',
          type: 'fill',
          source: 'fields',
          paint: { 'fill-color': '#afbd8b', 'fill-outline-color': '#95a876' },
        });
        m.addLayer({
          id: 'water',
          type: 'line',
          source: 'water',
          paint: {
            'line-color': '#8ebfc6',
            'line-width': ['interpolate', ['exponential', 2], ['zoom'], 15, 1.5, 20, 48],
          },
        });
        m.addLayer({
          id: 'roads',
          type: 'line',
          source: 'roads',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': '#b1b4a2',
            'line-width': [
              'interpolate',
              ['exponential', 2],
              ['zoom'],
              15,
              ['*', ['get', 'width'], 0.3],
              20,
              ['*', ['get', 'width'], 9.6],
            ],
          },
        });
        m.addLayer({
          id: 'buildings',
          type: 'fill',
          source: 'buildings',
          paint: {
            'fill-color': [
              'case',
              ['==', ['get', 'id'], ''],
              '#438b69',
              ['==', ['get', 'kind'], 'public'],
              '#99ae91',
              '#dfd4bb',
            ],
            'fill-outline-color': '#87947d',
          },
        });
        m.addLayer({
          id: 'facilities',
          type: 'circle',
          source: 'facilities',
          paint: {
            'circle-radius': mini ? 2 : 3,
            'circle-color': '#65785b',
            'circle-stroke-width': 1,
            'circle-stroke-color': '#fff',
          },
        });
        m.addLayer({
          id: 'issues',
          type: 'circle',
          source: 'issues',
          paint: {
            'circle-radius': ['case', ['==', ['get', 'id'], ''], 10, mini ? 5 : 7],
            'circle-color': [
              'case',
              ['==', ['get', 'status'], 'completed'],
              '#438b69',
              ['==', ['get', 'status'], 'processing'],
              '#cf9145',
              ['==', ['get', 'severity'], 'high'],
              '#bd5d50',
              '#d9a15d',
            ],
            'circle-stroke-color': '#fff',
            'circle-stroke-width': 2,
          },
        });
        m.on('click', (e) => {
          const hits = m.queryRenderedFeatures(e.point, { layers: ['issues', 'buildings'] });
          const hit = hits[0];
          if (!hit) return;
          const state = useAppStore.getState(),
            id = String(hit.properties.id);
          if (hit.layer.id === 'issues') state.selectIssue(id);
          else state.selectBuilding(id);
        });
        ['issues', 'buildings'].forEach((id) => {
          m.on('mouseenter', id, () => {
            m.getCanvas().style.cursor = 'pointer';
          });
          m.on('mouseleave', id, () => {
            m.getCanvas().style.cursor = '';
          });
        });
        setReady(true);
      });
      m.on('error', () => {
        if (!disposed) setFailed(true);
      });
    } catch {
      queueMicrotask(() => {
        if (!disposed) setFailed(true);
      });
      return;
    }
    const observer = new ResizeObserver(() => {
      if (!disposed) m.resize();
    });
    observer.observe(container.current);
    const lost = () => {
      if (!disposed) setFailed(true);
    };
    m.getCanvas().addEventListener('webglcontextlost', lost);
    return () => {
      disposed = true;
      observer.disconnect();
      popup.current?.remove();
      popup.current = null;
      m.getCanvas().removeEventListener('webglcontextlost', lost);
      m.remove();
      map.current = null;
    };
  }, [modelId, demo, mini, shapes]);
  useEffect(() => {
    const m = map.current;
    if (!ready || !m || failed || !m.getSource('issues')) return;
    if (!demo && imageReady && projection?.url) {
      const coordinates = imageCorners as [
        [number, number],
        [number, number],
        [number, number],
        [number, number],
      ];
      const source = m.getSource('model-raster') as ImageSource | undefined;
      if (source) source.updateImage({ url: projection.url, coordinates });
      else {
        m.addSource('model-raster', { type: 'image', url: projection.url, coordinates });
        m.addLayer(
          {
            id: 'model-imagery',
            type: 'raster',
            source: 'model-raster',
            paint: { 'raster-fade-duration': 0, 'raster-resampling': 'linear' },
          },
          'fields',
        );
      }
    } else if (m.getLayer('model-imagery')) {
      m.removeLayer('model-imagery');
      m.removeSource('model-raster');
    }
  }, [ready, failed, demo, imageReady, imageCorners, projection?.url]);
  useEffect(() => {
    if (ready) fit();
  }, [ready, fit]);
  useEffect(() => {
    const m = map.current;
    if (!ready || !m || failed || !m.getSource('issues')) return;
    (m.getSource('issues') as GeoJSONSource)?.setData({
      type: 'FeatureCollection',
      features: issues.flatMap((i) => {
        const point = mapLocation(i);
        return point
          ? [
              {
                type: 'Feature' as const,
                properties: { id: i.id, title: i.title, status: i.status, severity: i.severity },
                geometry: { type: 'Point' as const, coordinates: geoPair(point) },
              },
            ]
          : [];
      }),
    });
    m.setLayoutProperty(
      'issues',
      'visibility',
      showIssues && (demo || imageReady) ? 'visible' : 'none',
    );
    m.setLayoutProperty('buildings', 'visibility', showBuildings ? 'visible' : 'none');
    Object.entries(layers).forEach(([id, visible]) =>
      m.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none'),
    );
    m.setPaintProperty('buildings', 'fill-color', [
      'case',
      ['==', ['get', 'id'], selectedBuildingId ?? ''],
      '#438b69',
      ['==', ['get', 'kind'], 'public'],
      '#99ae91',
      '#dfd4bb',
    ]);
    m.setPaintProperty('issues', 'circle-radius', [
      'case',
      ['==', ['get', 'id'], selectedIssueId ?? ''],
      mini ? 7 : 10,
      mini ? 5 : 7,
    ]);
  }, [
    ready,
    failed,
    issues,
    layers,
    showBuildings,
    showIssues,
    selectedIssueId,
    selectedBuildingId,
    mini,
    mapLocation,
    demo,
    imageReady,
  ]);
  useEffect(() => {
    const m = map.current;
    if (!ready || !m || failed || !m.getSource('issues')) return;
    popup.current?.remove();
    popup.current = null;
    // A read completed pin disappears, while its original event still supports
    // detail viewing and deliberate "locate" actions from the archive.
    const issue = issuesForModel(village?.issues ?? [], modelId).find(
      (i) => i.id === selectedIssueId,
    );
    const building = demo ? village?.buildings.find((b) => b.id === selectedBuildingId) : null;
    const plan = demo ? village?.renovations.find((p) => p.id === currentRenovationId) : null;
    const target = issue ?? building ?? plan;
    if (!target) return;
    const location = issue ? mapLocation(issue) : target.location.local;
    if (!location) return;
    const center = geoPair(location);
    m.easeTo({ center, zoom: mini ? m.getZoom() : Math.max(m.getZoom(), 18.6), duration: 600 });
    if (!mini && (!issue || desktopIssueMarkerVisible(issue, acknowledged))) {
      const node = document.createElement('div');
      node.className = 'map-popup-content';
      const title = document.createElement('strong');
      title.textContent = 'title' in target ? target.title : 'name' in target ? target.name : '';
      node.append(title);
      const desc = document.createElement('p');
      desc.textContent = issue
        ? '已同步定位至三维视图'
        : building
          ? building.area
          : '微更新方案位置';
      node.append(desc);
      popup.current = new maplibregl.Popup({ closeButton: false, offset: 12 })
        .setLngLat(center)
        .setDOMContent(node)
        .addTo(m);
    }
  }, [
    ready,
    failed,
    selectedIssueId,
    selectedBuildingId,
    currentRenovationId,
    selectionRevision,
    issues,
    village,
    modelId,
    acknowledged,
    demo,
    mini,
    mapLocation,
  ]);
  return (
    <section
      className={`village-map ${mini ? 'mini-map' : ''}`}
      aria-label={mini ? '村庄小地图' : '乡村二维地图'}
      data-projection-method={image?.method}
      data-map-state={failed ? 'fallback' : ready ? 'ready' : 'loading'}
    >
      <div ref={container} className="map-canvas" />
      {failed && <MapFallback demo={demo} modelId={modelId} projection={projection} />}
      {!ready && !failed && <div className="map-loading">正在绘制本地地图…</div>}
      {!demo && !imageReady && (
        <div className="projection-state" role="status">
          {projection?.status !== 'error' && (
            <LoaderCircle className="loading-spin" size={mini ? 18 : 26} />
          )}
          <strong>{projection?.message ?? '等待实景模型载入…'}</strong>
          {!mini && (
            <p>
              {projection?.error ?? '自动从当前模型生成带纹理的平面投影，事件会叠加在同一底图上。'}
            </p>
          )}
          {projection?.status === 'error' && <button onClick={projection.retry}>重试生成</button>}
        </div>
      )}
      <div className="map-title">
        {demo ? '青禾村 · 二维地图' : '实景投影底图'}
        <small>
          {demo
            ? '本地演示数据'
            : !image
              ? '自动生成模型俯视影像'
              : image.method === 'orthographic'
                ? '模型正交投影 · 未地理配准'
                : '在线模型俯视投影 · 近似平面影像'}
        </small>
      </div>
      {!failed && (
        <button className="map-fit" onClick={fit} title="缩放至全村" aria-label="缩放至全村">
          <Maximize2 size={16} />
        </button>
      )}
      {!demo && imageReady && (
        <>
          <button
            className="projection-refresh"
            onClick={projection.retry}
            aria-label="重新生成模型投影"
            title="重新生成模型投影"
          >
            <RefreshCw size={16} />
          </button>
          {!mini && (
            <div className="projection-credit">
              <span role="status">{projection.message}</span>
              {projection.cacheStatus === 'unavailable' && (
                <button onClick={projection.save}>重试保存</button>
              )}
              {' · '}
              {image.method === 'online-topdown' ? (
                <>
                  <a href={sketchfabModelUrl(modelId)} target="_blank" rel="noreferrer">
                    {modelId === BAGUA_MODEL_ID
                      ? 'Old Media Art / Sketchfab'
                      : (online?.name ?? 'Sketchfab 模型')}
                  </a>
                  {modelId === BAGUA_MODEL_ID && (
                    <>
                      {' '}
                      ·{' '}
                      <a
                        href="https://creativecommons.org/licenses/by-nc/4.0/"
                        target="_blank"
                        rel="noreferrer"
                      >
                        CC BY-NC 4.0
                      </a>
                    </>
                  )}
                </>
              ) : (
                <span>由当前模型纹理自动生成</span>
              )}
            </div>
          )}
        </>
      )}
      {!mini && (
        <div className="map-legend">
          {demo && (
            <>
              <span>
                <i className="legend-building" />
                建筑
              </span>
              <span>
                <i className="legend-water" />
                水域
              </span>
            </>
          )}
          <span>
            <i className="legend-pending" />
            待处理
          </span>
          <span>
            <i className="legend-processing" />
            处理中
          </span>
          <span>
            <i className="legend-completed" />
            已完成
          </span>
          <span>{demo ? '北 ↑' : '模型方向 ↑'}</span>
        </div>
      )}
    </section>
  );
}
