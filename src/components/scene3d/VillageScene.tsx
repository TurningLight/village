import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AlertCircle,
  CheckCheck,
  ArrowUpRight,
  ClipboardList,
  Clock,
  Layers3,
  LoaderCircle,
  MapPin,
  MousePointer2,
  RotateCcw,
  Wrench,
  X,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { useDesktopMarkerStore } from '../../store/useDesktopMarkerStore';
import { desktopIssueMarkerVisible } from '../../lib/desktopIssueMarkers';
import { loadSketchfabViewer } from '../../lib/sketchfab';
import { listenForModelClicks } from '../../lib/modelPicking';
import { projectionSurfacePoint } from '../../lib/projectionCoordinates';
import type { ModelCamera, ModelPoint, SketchfabApi } from '../../lib/sketchfab';
import type { Issue, Vector3D } from '../../types';
import IssuePanel from '../issues/IssuePanel';
import type { ProjectionSource } from '../../lib/projectionTypes';
import type { StoredModel } from '../../lib/modelStorage';
import { modelErrorMessage } from '../../lib/modelStorage';
import type { PickedLocation } from '../issues/IssuePanel';
import { BAGUA_SOURCE, sketchfabModelUrl } from '../../lib/mapSources';
import type { SketchfabSource } from '../../lib/mapSources';
import {
  activeIssues,
  filteredIssues,
  issuesForModel,
  BAGUA_MODEL_ID,
  localToModelPoint,
  modelPointToLocal,
  validModelPoint,
} from '../../lib/issues';

const INITIAL_CAMERA_DISTANCE_RATIO = 0.8;

export interface VillageSceneHandle {
  resetView: () => void;
  topView: () => void;
  reload?: () => void;
}
interface SceneMarker {
  id: string;
  title: string;
  location: Vector3D;
  kind: 'issue' | 'renovation';
  status?: 'pending' | 'processing' | 'completed';
  severity?: 'low' | 'medium' | 'high';
  sceneAnchor?: Issue['sceneAnchor'];
  projectionAnchor?: Issue['projectionAnchor'];
}

const VillageScene = forwardRef<
  VillageSceneHandle,
  {
    model?: StoredModel | null;
    online?: SketchfabSource;
    managed?: boolean;
    onDraft?: (draft: PickedLocation) => void;
    onProjectionSource?: (source: ProjectionSource) => void;
    onProjectionFailure?: (modelId: string, message: string) => void;
  }
>(function VillageScene(
  {
    model,
    online = BAGUA_SOURCE,
    managed = false,
    onDraft,
    onProjectionSource,
    onProjectionFailure,
  },
  ref,
) {
  const MODEL_ID = model?.id ?? online.modelId;
  const MODEL_URL = sketchfabModelUrl(online.modelId);
  const isBagua = !model && MODEL_ID === BAGUA_MODEL_ID;
  const localContainerRef = useRef<HTMLDivElement>(null);
  const [loadError, setLoadError] = useState('');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const apiRef = useRef<SketchfabApi | null>(null);
  const cameraRef = useRef<ModelCamera | null>(null);
  const defaultViewRef = useRef<ModelCamera | null>(null);
  const geometryRef = useRef<number[]>([]);
  const markerElements = useRef(new Map<string, HTMLButtonElement>());
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [draft, setDraft] = useState<PickedLocation | null>(null);
  const draftPointRef = useRef<ModelPoint | null>(null);
  const boardButtonRef = useRef<HTMLButtonElement>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const village = useAppStore((state) => state.village);
  const acknowledged = useDesktopMarkerStore((state) => state.acknowledged);
  const timeMode = useAppStore((state) => state.timeMode);
  const showBuildings = useAppStore((state) => state.showBuildings);
  const showIssues = useAppStore((state) => state.showIssues);
  const showRenovations = useAppStore((state) => state.showRenovations);
  const filterCategory = useAppStore((state) => state.filterCategory);
  const filterStatus = useAppStore((state) => state.filterStatus);
  const selectedIssueId = useAppStore((state) => state.selectedIssueId);
  const selectIssue = useAppStore((state) => state.selectIssue);
  const currentRenovationId = useAppStore((state) => state.currentRenovationId);
  const setCurrentRenovation = useAppStore((state) => state.setCurrentRenovation);
  const selectBuilding = useAppStore((state) => state.selectBuilding);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 4500);
    return () => clearTimeout(timer);
  }, [notice]);

  const cancelDraft = () => {
    draftPointRef.current = null;
    setDraft(null);
  };
  const closePanel = () => {
    cancelDraft();
    setPanelOpen(false);
    selectIssue(null);
    boardButtonRef.current?.focus();
  };

  const locateIssue = useCallback(
    (issue: Issue) => {
      const reference = cameraRef.current;
      const api = apiRef.current;
      if (!reference || !api) return;
      const state = useAppStore.getState();
      if (!state.showBuildings) state.toggleBuildings();
      if (!state.showIssues) state.toggleIssues();
      const focus = (point: ModelPoint) =>
        api.getCameraLookAt((error, camera) => {
          if (apiRef.current !== api) return;
          if (error || !camera) return;
          api.setCameraLookAt(
            camera.position.map(
              (value, index) => value - camera.target[index] + point[index],
            ) as ModelPoint,
            point,
            0.6,
          );
        });
      if (issue.sceneAnchor?.modelId === MODEL_ID && validModelPoint(issue.sceneAnchor.position)) {
        focus(issue.sceneAnchor.position);
      } else if (issue.projectionAnchor) {
        void projectionSurfacePoint(
          issue.projectionAnchor,
          MODEL_ID,
          api.pickFromScene.bind(api),
        ).then((point) => {
          if (apiRef.current !== api) return;
          if (point) focus(point);
          else setNotice('该事件保留了二维影像位置，但射线未命中模型表面，请在二维视图核对位置。');
        });
      } else {
        focus(localToModelPoint(issue.location.local, reference));
      }
    },
    [MODEL_ID],
  );

  const selectionRevision = useAppStore((state) => state.selectionRevision);
  useEffect(() => {
    if (!managed || phase !== 'ready') return;
    const issue = issuesForModel(village?.issues ?? [], MODEL_ID).find(
      (item) => item.id === selectedIssueId,
    );
    if (issue) locateIssue(issue);
  }, [selectedIssueId, selectionRevision, phase, managed, MODEL_ID, village, locateIssue]);

  useImperativeHandle(
    ref,
    () => ({
      reload() {
        setPhase('loading');
        setAttempt((value) => value + 1);
      },
      resetView() {
        const camera = defaultViewRef.current;
        if (camera) apiRef.current?.setCameraLookAt(camera.position, camera.target, 0.8);
      },
      topView() {
        const camera = defaultViewRef.current;
        if (!camera) return;
        const distance = Math.hypot(...camera.position.map((v, i) => v - camera.target[i]));
        // Sketchfab world coordinates are Z-up. A small Y offset avoids a
        // singular camera orientation directly above the target.
        apiRef.current?.setCameraLookAt(
          [camera.target[0], camera.target[1] - distance * 0.001, camera.target[2] + distance],
          camera.target,
          0.8,
        );
      },
    }),
    [],
  );

  useEffect(() => {
    let disposed = false;
    let viewer: SketchfabApi | null = null;
    let stopPicking: (() => void) | undefined;
    cameraRef.current = null;
    defaultViewRef.current = null;
    geometryRef.current = [];
    const fail = () => {
      if (!disposed) {
        setPhase('error');
        onProjectionFailure?.(
          MODEL_ID,
          '实景模型未能加载，无法生成平面投影。请检查网络或重新选择模型。',
        );
      }
    };
    const timeout = window.setTimeout(fail, 90000);
    const connect = (api: SketchfabApi) => {
      if (disposed) {
        api.stop();
        return;
      }
      viewer = api;
      apiRef.current = api;
      api.addEventListener('viewerready', () => {
        if (disposed) return;
        api.recenterCamera((recenterError) => {
          if (disposed || recenterError) {
            fail();
            return;
          }
          api.getCameraLookAt((error, camera) => {
            if (disposed) return;
            if (error || !camera?.position || !camera?.target) {
              fail();
              return;
            }
            clearTimeout(timeout);
            // Keep the fitted camera as the coordinate reference so zoom
            // does not move existing issue or business-building anchors.
            cameraRef.current = camera;
            onProjectionSource?.({
              modelId: MODEL_ID,
              reference: camera,
              capture: api.captureMapProjection?.bind(api),
            });
            const position = camera.position.map(
              (value, index) =>
                camera.target[index] +
                (value - camera.target[index]) * INITIAL_CAMERA_DISTANCE_RATIO,
            ) as ModelPoint;
            defaultViewRef.current = { position, target: [...camera.target] };
            api.setCameraLookAt(position, camera.target, 0);
            stopPicking?.();
            stopPicking = listenForModelClicks(
              api,
              (position) => {
                if (disposed) return;
                const state = useAppStore.getState();
                if (!state.showBuildings) return;
                if (draftPointRef.current) {
                  setNotice('请先保存或取消当前事件，再选择新位置。');
                  return;
                }
                if (managed && onDraft) {
                  onDraft({
                    modelId: MODEL_ID,
                    position,
                    local: modelPointToLocal(position, cameraRef.current!),
                  });
                  return;
                }
                draftPointRef.current = position;
                setDraft({
                  modelId: MODEL_ID,
                  position,
                  local: modelPointToLocal(position, cameraRef.current!),
                });
                state.selectIssue(null);
                state.selectBuilding(null);
                state.setCurrentRenovation(null);
                setPanelOpen(true);
              },
              (message) => {
                if (!disposed) setNotice(message);
              },
            );
            setPhase('ready');
          });
        });
        api.getNodeMap((error, nodes) => {
          if (disposed || error) return;
          geometryRef.current = Object.values(nodes)
            .filter((node) => node.type === 'Geometry')
            .map((node) => node.instanceID);
          const visible = useAppStore.getState().showBuildings;
          geometryRef.current.forEach((id) => (visible ? api.show(id) : api.hide(id)));
        });
      });
      api.start();
    };
    // Defer startup so StrictMode's initial effect cleanup cancels the first
    // initialization before the iframe starts a second WebGL context.
    const startup = requestAnimationFrame(() => {
      setLoadError('');
      if (model && localContainerRef.current) {
        import('../../lib/localViewer')
          .then(({ createLocalViewer }) => {
            if (disposed || !localContainerRef.current) return;
            return createLocalViewer(localContainerRef.current, model, fail).then(connect);
          })
          .catch((cause) => {
            if (!disposed) {
              setLoadError(modelErrorMessage(cause));
              fail();
            }
          });
        return;
      }
      loadSketchfabViewer()
        .then((Sketchfab) => {
          if (disposed || !iframeRef.current) return;
          const client = new Sketchfab('1.12.1', iframeRef.current);
          client.init(MODEL_ID, {
            autostart: 1,
            camera: 0,
            dnt: 1,
            preload: 0,
            max_texture_size: 4096,
            ui_stop: 0,
            success: connect,
            error: fail,
          });
        })
        .catch(fail);
    });
    return () => {
      disposed = true;
      clearTimeout(timeout);
      cancelAnimationFrame(startup);
      stopPicking?.();
      viewer?.stop();
      apiRef.current = null;
    };
  }, [attempt, model, MODEL_ID, managed, onDraft, onProjectionSource, onProjectionFailure]);

  useEffect(() => {
    if (phase !== 'ready' || !apiRef.current) return;
    const api = apiRef.current;
    geometryRef.current.forEach((id) => (showBuildings ? api.show(id) : api.hide(id)));
  }, [phase, showBuildings]);

  useEffect(() => {
    const frame = localContainerRef.current ?? iframeRef.current;
    const api = apiRef.current;
    if (phase !== 'ready' || !frame || !api) return;
    let disposed = false;
    let width = frame.clientWidth,
      height = frame.clientHeight;
    let update = 0;
    const observer = new ResizeObserver(() => {
      if (!frame.clientWidth || !frame.clientHeight) return;
      if (width === frame.clientWidth && height === frame.clientHeight) return;
      width = frame.clientWidth;
      height = frame.clientHeight;
      cancelAnimationFrame(update);
      update = requestAnimationFrame(() => {
        // Sketchfab can keep API screen coordinates from the previous layout
        // until its camera updates. Refresh the same pose after a split resize;
        // never rescale world points or change the user's viewing direction.
        api.getCameraLookAt((error, current) => {
          if (!disposed && !error && current)
            api.setCameraLookAt(current.position, current.target, 0);
        });
      });
    });
    observer.observe(frame);
    return () => {
      disposed = true;
      observer.disconnect();
      cancelAnimationFrame(update);
    };
  }, [phase]);

  useEffect(() => {
    if (phase !== 'ready') return;
    apiRef.current?.setBackground({
      color: timeMode === 'day' ? [0.88, 0.91, 0.88] : [0.09, 0.13, 0.16],
    });
  }, [phase, timeMode]);

  const markers = useMemo<SceneMarker[]>(() => {
    const issues: SceneMarker[] = showIssues
      ? (managed ? filteredIssues : activeIssues)(
          issuesForModel(village?.issues ?? [], MODEL_ID),
          filterCategory,
          filterStatus,
        )
          .filter((issue) => desktopIssueMarkerVisible(issue, acknowledged))
          .map((issue) => ({
            id: issue.id,
            title: issue.title,
            status: issue.status,
            severity: issue.severity,
            sceneAnchor: issue.sceneAnchor,
            projectionAnchor: issue.projectionAnchor,
            kind: 'issue',
            location: issue.location.local,
          }))
      : [];
    const renovations: SceneMarker[] =
      !managed && isBagua && showRenovations
        ? (village?.renovations ?? []).map((plan) => ({
            id: plan.id,
            title: plan.name,
            location: plan.location.local,
            kind: 'renovation',
          }))
        : [];
    return [...issues, ...renovations];
  }, [
    village,
    showIssues,
    showRenovations,
    filterCategory,
    filterStatus,
    MODEL_ID,
    isBagua,
    managed,
    acknowledged,
  ]);

  useEffect(() => {
    const api = apiRef.current;
    const camera = cameraRef.current;
    if (phase !== 'ready' || !api || !camera || !markers.length || !showBuildings) return;
    let disposed = false;
    let pending = false;
    const distance = Math.hypot(...camera.position.map((v, i) => v - camera.target[i]));
    // Existing business coordinates become demonstration anchors. They are
    // not surveyed issue locations and are never written back to the store.
    const positions = new Map<string, ModelPoint>();
    markers.forEach((marker) => {
      const element = markerElements.current.get(marker.id);
      if (element) element.style.visibility = 'hidden';
      if (
        marker.sceneAnchor?.modelId === MODEL_ID &&
        validModelPoint(marker.sceneAnchor.position)
      ) {
        const [x, y, z] = marker.sceneAnchor.position;
        positions.set(marker.id, [x, y, z + distance * 0.006]);
        return;
      }
      if (marker.projectionAnchor) {
        void projectionSurfacePoint(
          marker.projectionAnchor,
          MODEL_ID,
          api.pickFromScene.bind(api),
        ).then((point) => {
          if (!disposed && point)
            positions.set(marker.id, [point[0], point[1], point[2] + distance * 0.006]);
        });
        return;
      }
      const point = localToModelPoint(marker.location, camera);
      positions.set(marker.id, point);
      api.pickFromScene(
        [point[0], point[1], camera.target[2] + distance],
        [point[0], point[1], camera.target[2] - distance],
        (error, hit) => {
          if (!disposed && !error && hit?.position3D) {
            positions.set(marker.id, [
              hit.position3D[0],
              hit.position3D[1],
              hit.position3D[2] + distance * 0.012,
            ]);
          }
        },
      );
    });
    const updatePositions = () => {
      if (disposed || pending || document.hidden) return;
      pending = true;
      let remaining = positions.size;
      if (!remaining) {
        pending = false;
        return;
      }
      positions.forEach((point, id) => {
        api.getWorldToScreenCoordinates(point, ({ canvasCoord }) => {
          if (disposed) return;
          const element = markerElements.current.get(id);
          const frame = localContainerRef.current ?? iframeRef.current;
          if (element && frame && canvasCoord) {
            const [x, y] = canvasCoord;
            const visible =
              Number.isFinite(x) &&
              Number.isFinite(y) &&
              x > 12 &&
              x < frame.clientWidth - 12 &&
              y > 12 &&
              y < frame.clientHeight - 12;
            element.style.visibility = visible ? 'visible' : 'hidden';
            element.style.left = `${x}px`;
            element.style.top = `${y}px`;
          }
          if (--remaining === 0) pending = false;
        });
      });
    };
    updatePositions();
    const interval = window.setInterval(updatePositions, 80);
    return () => {
      disposed = true;
      clearInterval(interval);
    };
  }, [phase, markers, showBuildings, MODEL_ID]);

  const selectedPlan =
    isBagua && showRenovations
      ? village?.renovations.find((plan) => plan.id === currentRenovationId)
      : null;
  const taskCount = activeIssues(issuesForModel(village?.issues ?? [], MODEL_ID)).length;

  return (
    <div
      className={`village-scene bagua-scene ${timeMode === 'night' ? 'is-night' : ''}`}
      data-viewer-state={phase}
    >
      <div className="bagua-model-stage">
        {model ? (
          <div ref={localContainerRef} className="local-model-canvas" />
        ) : (
          <iframe
            key={attempt}
            ref={iframeRef}
            className="bagua-model-frame"
            title={`${online.name} · Sketchfab 在线模型`}
            allow="autoplay; fullscreen; xr-spatial-tracking"
            allowFullScreen
          />
        )}
        {phase === 'ready' && showBuildings && (
          <div className="bagua-marker-layer" aria-label="模拟治理问题与微更新方案">
            {markers.map((marker, index) => {
              const selected =
                marker.kind === 'issue'
                  ? marker.id === selectedIssueId
                  : marker.id === currentRenovationId;
              const Icon =
                marker.kind === 'renovation'
                  ? Wrench
                  : marker.status === 'completed'
                    ? CheckCheck
                    : marker.status === 'processing'
                      ? Clock
                      : AlertCircle;
              return (
                <button
                  key={marker.id}
                  ref={(element) => {
                    if (element) markerElements.current.set(marker.id, element);
                    else markerElements.current.delete(marker.id);
                  }}
                  className={`bagua-marker ${marker.kind === 'renovation' ? 'renovation' : marker.status} ${marker.severity === 'high' ? 'severity-high' : ''} ${selected ? 'is-selected' : ''}`}
                  aria-label={`${marker.kind === 'issue' ? (managed ? '治理事件' : '待办事件') : '微更新方案'}：${marker.title}`}
                  aria-pressed={selected}
                  title={marker.title}
                  onClick={() => {
                    if (draftPointRef.current) {
                      setNotice('请先保存或取消当前事件。');
                      return;
                    }
                    if (marker.kind === 'issue') {
                      setCurrentRenovation(null);
                      selectIssue(marker.id);
                      setPanelOpen(true);
                    } else {
                      selectIssue(null);
                      setPanelOpen(false);
                      setCurrentRenovation(selected ? null : marker.id);
                    }
                  }}
                >
                  <span className="bagua-marker-icon">
                    <Icon size={15} />
                    <span className="bagua-marker-number">{index + 1}</span>
                  </span>
                  <span className="bagua-marker-label">{marker.title}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      {phase !== 'ready' && (
        <div className="bagua-loading" role="status" aria-live="polite">
          {phase === 'loading' ? (
            <LoaderCircle className="loading-spin" size={28} />
          ) : (
            <AlertCircle size={28} />
          )}
          <h2>
            {phase === 'loading'
              ? model
                ? '正在载入已保存的实景模型'
                : `正在载入${online.name}`
              : '模型暂时无法显示'}
          </h2>
          <p>
            {phase === 'loading'
              ? model
                ? model.name
                : '正在连接 Sketchfab 并加载模型与纹理，请稍候'
              : loadError ||
                (model
                  ? '请重试，或通过“地图设置”重新载入完整模型文件。'
                  : '请检查网络连接后重试，或打开模型原页查看；也可在地图设置中切换来源。')}
          </p>
          {phase === 'error' && (
            <button
              className="model-retry"
              onClick={() => {
                setPhase('loading');
                setAttempt((value) => value + 1);
              }}
            >
              <RotateCcw size={15} />
              重新加载
            </button>
          )}
          {!model && (
            <a href={MODEL_URL} target="_blank" rel="noreferrer">
              查看原始模型 <ArrowUpRight size={13} />
            </a>
          )}
        </div>
      )}
      {!managed && phase === 'ready' && (
        <div className="issue-entry-bar">
          <button
            ref={boardButtonRef}
            type="button"
            className="issue-board-toggle"
            aria-expanded={panelOpen}
            aria-controls="issue-workspace"
            onClick={() => {
              if (draftPointRef.current) {
                setNotice('请先保存或取消当前事件。');
                return;
              }
              setPanelOpen(!panelOpen);
              selectIssue(null);
              setCurrentRenovation(null);
            }}
          >
            <ClipboardList size={17} />
            待办事件<span>{taskCount}</span>
          </button>
          <span className="issue-pick-hint">
            <MousePointer2 size={14} />
            点击建筑或地面，录入事件
          </span>
        </div>
      )}
      {!managed && panelOpen && phase === 'ready' && (
        <div id="issue-workspace">
          <IssuePanel
            modelId={MODEL_ID}
            key={draft ? 'draft' : (selectedIssueId ?? 'list')}
            draft={draft}
            onCancelDraft={cancelDraft}
            onSaved={cancelDraft}
            onClose={closePanel}
            onNotice={setNotice}
            onLocate={locateIssue}
          />
        </div>
      )}
      {notice && (
        <div className="issue-notice" role="status" aria-live="polite">
          {notice}
        </div>
      )}
      {!managed && selectedPlan && !panelOpen && phase === 'ready' && (
        <aside className="bagua-detail" aria-label="模拟业务详情">
          <button
            className="detail-close"
            aria-label="关闭详情"
            onClick={() => {
              setCurrentRenovation(null);
              selectIssue(null);
              selectBuilding(null);
            }}
          >
            <X size={16} />
          </button>
          <span className="bagua-detail-tag">微更新方案</span>
          <h3>{selectedPlan.name}</h3>
          <p>{selectedPlan.description}</p>
          <span className="bagua-detail-note">示例业务数据，不代表该村实际情况</span>
        </aside>
      )}
      {!showBuildings && phase === 'ready' && (
        <div className="bagua-layer-hidden">
          <Layers3 size={20} />
          <span>实景模型图层已隐藏</span>
          <small>航拍模型为整体网格，包含建筑、植被及地面</small>
        </div>
      )}
      <div className="bagua-bottom-bar">
        <span className="bagua-navigation-hint">
          <MapPin size={13} />
          拖动旋转 · 滚轮缩放 · 点击录入事件
        </span>
        {model ? (
          <span className="bagua-credit local-model-credit" title={model.name}>
            当前地图：{model.name} · 本地已保存
          </span>
        ) : (
          <span className="bagua-credit">
            <a href={MODEL_URL} target="_blank" rel="noreferrer">
              {isBagua
                ? '模型：Old Media Art / Sketchfab'
                : `${online.name} · 在 Sketchfab 查看模型与署名`}
            </a>
            {isBagua && (
              <>
                <span>·</span>
                <a
                  href="https://creativecommons.org/licenses/by-nc/4.0/"
                  target="_blank"
                  rel="noreferrer"
                >
                  CC BY-NC 4.0 · 非商业使用
                </a>
              </>
            )}
          </span>
        )}
      </div>
    </div>
  );
});

export default VillageScene;
