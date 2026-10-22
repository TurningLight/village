import type { ReactNode } from 'react';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Building2,
  Check,
  ClipboardList,
  Columns2,
  Eye,
  Layers,
  LoaderCircle,
  Map,
  MapPin,
  Moon,
  Plus,
  RotateCcw,
  Sun,
  Settings2,
  CloudCheck,
} from 'lucide-react';
import Header from './components/layout/Header';
import StatsCards from './components/layout/StatsCards';
import ModelUpload from './components/scene3d/ModelUpload';
import GovernancePanel from './components/governance/GovernancePanel';
import type { VillageSceneHandle } from './components/scene3d/VillageScene';
import type { PickedLocation } from './components/issues/IssuePanel';
import { useLocalMap } from './lib/useLocalMap';
import { useModelProjection } from './lib/useModelProjection';
import { usePublishMap } from './lib/usePublishMap';
import { connectSharedIssueSync } from './services/sharedIssueSync';
import { useAppStore } from './store/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import { connectDesktopMarkerStorage, useDesktopMarkerStore } from './store/useDesktopMarkerStore';
import './index.css';
import './workspace.css';
const RealScene = lazy(() => import('./components/scene3d/VillageScene'));
const VillageMap = lazy(() => import('./components/map/VillageMap'));
const GovernanceTerminal = lazy(
  () => import('./components/governance-terminal/GovernanceTerminal'),
);
/** Do not load a hidden 3D viewer when opening an already saved 2D map.
 * Once needed, keep it mounted so switching views preserves its camera. */
function SceneMount({ needed, children }: { needed: boolean; children: ReactNode }) {
  const [mounted, setMounted] = useState(needed);
  if (needed && !mounted) setMounted(true);
  return mounted || needed ? children : null;
}
function App() {
  const location = useLocation(),
    navigate = useNavigate();
  const page = location.pathname === '/governance' ? 'governance' : 'workspace';
  const scene = useRef<VillageSceneHandle>(null),
    map = useLocalMap(),
    s = useAppStore(
      useShallow((state) => ({
        village: state.village,
        selectedBuildingId: state.selectedBuildingId,
        selectedIssueId: state.selectedIssueId,
        selectBuilding: state.selectBuilding,
        selectIssue: state.selectIssue,
        setCurrentRenovation: state.setCurrentRenovation,
        setTimeMode: state.setTimeMode,
        setViewMode: state.setViewMode,
        showBuildings: state.showBuildings,
        showIssues: state.showIssues,
        timeMode: state.timeMode,
        toggleBuildings: state.toggleBuildings,
        toggleIssues: state.toggleIssues,
        viewMode: state.viewMode,
      })),
    );
  const demo = false;
  const [uploadOpen, setUploadOpen] = useState(false),
    [panelOpen, setPanelOpen] = useState(false),
    [picking, setPicking] = useState(false),
    [draft, setDraft] = useState<PickedLocation | null>(null),
    [notice, setNotice] = useState(''),
    [mini, setMini] = useState(true);
  const modelId = map.activeId;
  const reloadScene = useCallback(() => scene.current?.reload?.(), []);
  const projection = useModelProjection(
    modelId,
    !demo && !map.restoring && !map.restoreError,
    reloadScene,
    map.selection.type === 'sketchfab',
  );
  const sharedMap = usePublishMap({
    modelId,
    name: map.activeName,
    demo,
    restoring: !demo && (map.restoring || !!map.restoreError),
    projection: projection.view,
  });
  useEffect(connectSharedIssueSync, []);
  useEffect(connectDesktopMarkerStorage, []);
  useEffect(() => {
    if (page !== 'workspace' || !s.selectedIssueId) return;
    const issue = s.village?.issues.find((item) => item.id === s.selectedIssueId);
    if (issue) useDesktopMarkerStore.getState().acknowledgeViewedIssue(issue);
  }, [page, s.selectedIssueId, s.village]);
  useEffect(() => {
    document.title = `乡见 · ${page === 'governance' ? '智慧治理终端' : '可视化事件处理工作台'}`;
  }, [page]);
  useEffect(() => {
    // Each visit opens the three-dimensional village with the two-dimensional
    // preview below it; the resident can then expand a side-by-side comparison.
    useAppStore.getState().setViewMode('3d');
  }, []);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 4500);
    return () => clearTimeout(t);
  }, [notice]);
  const opened = panelOpen || !!s.selectedIssueId || !!s.selectedBuildingId;
  const panelTab = 'issues';
  const acceptDraft = useCallback((picked: PickedLocation) => {
    setDraft((previous) => {
      if (previous) return previous;
      return picked;
    });
    setPicking(false);
    setPanelOpen(true);
    const state = useAppStore.getState();
    state.selectIssue(null);
    state.selectBuilding(null);
    state.setCurrentRenovation(null);
  }, []);
  const create = () => {
    if (!s.showBuildings) s.toggleBuildings();
    if (draft) return;
    setPicking(true);
    s.setViewMode(s.viewMode === '2d' ? 'split' : s.viewMode);
    setNotice('请点击三维场景中的建筑或地面，选择事件位置。');
  };
  const setView = (mode: typeof s.viewMode) => {
    if (draft && mode === '2d') {
      setNotice('请先保存或取消当前事件。');
      return;
    }
    s.setViewMode(mode);
  };
  return (
    <div className={`village-app workspace-app ${s.timeMode === 'night' ? 'workspace-night' : ''}`}>
      <Header
        modelName={map.activeName}
        demo={demo}
        online={!demo && map.selection.type === 'sketchfab'}
        page={page}
        onPageChange={(next) => navigate(next === 'governance' ? '/governance' : '/')}
      />
      <SceneMount needed={page === 'workspace'}>
        <section
          className="desktop-workspace"
          hidden={page !== 'workspace'}
          aria-label="可视化事件处理工作台"
        >
          <StatsCards modelId={modelId} />
          <div className="workspace-toolbar">
            <div className="view-switch" role="group" aria-label="空间视图">
              {(
                [
                  { id: '3d', label: '3D村庄', Icon: Building2 },
                  { id: '2d', label: '2D地图', Icon: Map },
                  { id: 'split', label: '分屏', Icon: Columns2 },
                ] as const
              ).map(({ id, label, Icon }) => (
                <button
                  key={id}
                  aria-pressed={s.viewMode === id}
                  className={s.viewMode === id ? 'active' : ''}
                  onClick={() => setView(id)}
                >
                  <Icon size={16} />
                  {label}
                </button>
              ))}
            </div>
            <span className="toolbar-separator" />
            <button
              onClick={() => scene.current?.resetView()}
              disabled={s.viewMode === '2d'}
              title="重置视角"
            >
              <RotateCcw size={16} />
              <span>重置</span>
            </button>
            <button
              onClick={() => scene.current?.topView()}
              disabled={s.viewMode === '2d'}
              title="俯视视角"
            >
              <Eye size={16} />
              <span>俯视</span>
            </button>
            <button
              aria-label={s.timeMode === 'day' ? '切换夜间' : '切换日间'}
              aria-pressed={s.timeMode === 'night'}
              onClick={() => s.setTimeMode(s.timeMode === 'day' ? 'night' : 'day')}
              disabled={s.viewMode === '2d'}
            >
              {s.timeMode === 'day' ? <Moon size={16} /> : <Sun size={16} />}
              <span>{s.timeMode === 'day' ? '夜间' : '日间'}</span>
            </button>
            <details className="layer-menu">
              <summary>
                <Layers size={16} />
                图层
              </summary>
              <div className="layer-options">
                <label>
                  <input type="checkbox" checked={s.showBuildings} onChange={s.toggleBuildings} />
                  {demo ? '建筑' : '实景网格'}
                </label>
                <label>
                  <input type="checkbox" checked={s.showIssues} onChange={s.toggleIssues} />
                  治理事件
                </label>
                {s.viewMode === '3d' && (
                  <label>
                    <input type="checkbox" checked={mini} onChange={() => setMini((v) => !v)} />
                    小地图
                  </label>
                )}
              </div>
            </details>
            <div className="toolbar-spacer" />
            <button
              aria-label="治理事件"
              className={opened && panelTab === 'issues' ? 'active' : ''}
              onClick={() => {
                if (draft) {
                  setPanelOpen(true);
                  return;
                }
                const next = !(opened && panelTab === 'issues');
                s.selectIssue(null);
                setPanelOpen(next);
              }}
            >
              <ClipboardList size={16} />
              <span>治理事件</span>
            </button>
            <button aria-label="新增事件" className="new-event-button" onClick={create}>
              <Plus size={16} />
              <span>新增事件</span>
            </button>
          </div>
          <main className="governance-workspace">
            <div className={`spatial-workspace view-${s.viewMode}`}>
              <div className="scene-source">
                <span className="source-label">当前场景</span>
                <button className="active" aria-pressed={true}>
                  实景模型
                </button>
                <button
                  className="source-settings model-upload-toggle"
                  onClick={() => {
                    if (draft) {
                      setNotice('请先保存或取消当前事件。');
                      return;
                    }
                    setUploadOpen((v) => !v);
                  }}
                  aria-expanded={uploadOpen}
                >
                  <Settings2 size={14} aria-hidden="true" />
                  地图设置
                </button>
                <span role="status" className="scene-sync-status">
                  {sharedMap.phase === 'ready' && <CloudCheck size={14} aria-hidden="true" />}
                  {sharedMap.message}
                  {sharedMap.phase === 'error' && (
                    <button onClick={sharedMap.retry}>重试共享</button>
                  )}
                </span>
              </div>
              <div className="spatial-panes">
                <div
                  className="scene-pane"
                  style={s.viewMode === '2d' ? { display: 'none' } : undefined}
                >
                  <SceneMount
                    key={modelId}
                    needed={
                      s.viewMode !== '2d' ||
                      (!demo &&
                        map.selection.type === 'local' &&
                        !!projection.view.cacheChecked &&
                        projection.view.status !== 'ready')
                    }
                  >
                    <Suspense
                      fallback={
                        <div className="workspace-loading">
                          <LoaderCircle className="loading-spin" />
                          正在准备三维场景…
                        </div>
                      }
                    >
                      {map.restoring || map.restoreError ? (
                        <div className="workspace-loading">
                          {map.restoring ? (
                            '正在恢复实景设置…'
                          ) : (
                            <>
                              <p>{map.restoreError}</p>
                              <button onClick={map.restore}>重试</button>
                            </>
                          )}
                        </div>
                      ) : (
                        <RealScene
                          key={map.activeId}
                          ref={scene}
                          model={map.model}
                          online={map.online}
                          managed
                          onDraft={acceptDraft}
                          onProjectionSource={projection.onSource}
                          onProjectionFailure={projection.onFailure}
                        />
                      )}
                    </Suspense>
                  </SceneMount>
                  {picking && (
                    <div className="pick-banner">
                      <MapPin size={17} />
                      点击建筑或地面选择位置
                      <button onClick={() => setPicking(false)}>取消选点</button>
                    </div>
                  )}
                  {s.viewMode === '3d' && mini && (
                    <div className="minimap-holder">
                      <Suspense fallback={null}>
                        <VillageMap
                          key={`mini-${modelId}`}
                          modelId={modelId}
                          demo={demo}
                          projection={projection.view}
                          online={map.online}
                          mini
                        />
                      </Suspense>
                      <button onClick={() => setView('split')}>展开分屏</button>
                    </div>
                  )}
                </div>
                {s.viewMode !== '3d' && (
                  <div className="map-pane">
                    <Suspense fallback={<div className="workspace-loading">正在准备地图…</div>}>
                      <VillageMap
                        key={`main-${modelId}`}
                        modelId={modelId}
                        demo={demo}
                        projection={projection.view}
                        online={map.online}
                      />
                    </Suspense>
                  </div>
                )}
              </div>
              {uploadOpen && (
                <div className="upload-overlay">
                  <ModelUpload
                    storedModel={map.storedModel}
                    selection={map.selection}
                    online={map.online}
                    busy={map.busy || map.restoring}
                    status={map.status}
                    error={map.error}
                    onFiles={(files) => {
                      void map.upload(files);
                    }}
                    onOnline={(input, name) => {
                      void map.useOnline(input, name);
                    }}
                    onUseSaved={() => {
                      void map.useSavedLocal();
                    }}
                    onSourceChange={map.clearFeedback}
                    onClose={() => setUploadOpen(false)}
                  />
                </div>
              )}
            </div>
            {opened && (
              <GovernancePanel
                key={`${modelId}-${draft ? 'draft' : (s.selectedIssueId ?? s.selectedBuildingId ?? 'list')}`}
                demo={demo}
                modelId={modelId}
                tab={panelTab}
                onTab={() => {
                  if (draft) {
                    setNotice('请先保存或取消当前事件。');
                    return;
                  }
                  setPanelOpen(true);
                }}
                onClose={() => {
                  if (draft) {
                    setNotice('请先保存或取消当前事件。');
                    return;
                  }
                  s.selectIssue(null);
                  setPanelOpen(false);
                }}
                onCreate={create}
                draft={draft}
                onCancelDraft={() => setDraft(null)}
                onNotice={setNotice}
              />
            )}
          </main>
          {notice && (
            <div className="workspace-notice" role="status">
              <Check size={16} />
              {notice}
            </div>
          )}
        </section>
      </SceneMount>
      {page === 'governance' && (
        <Suspense
          fallback={
            <div className="workspace-loading" role="status">
              正在准备智慧治理终端…
            </div>
          }
        >
          <GovernanceTerminal
            key={modelId}
            modelId={modelId}
            modelName={map.activeName}
            demo={demo}
            onOpenWorkspace={() => navigate('/')}
            onOpenIssue={(id) => {
              s.selectBuilding(null);
              s.setCurrentRenovation(null);
              s.selectIssue(id);
              setPanelOpen(true);
              if (!s.showIssues) s.toggleIssues();
              navigate('/');
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
export default App;
