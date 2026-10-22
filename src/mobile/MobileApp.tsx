import { useMemo, useState, useSyncExternalStore, useEffect, useRef } from 'react';
import { Link, NavLink, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import {
  Leaf,
  House,
  Plus,
  ClipboardCheck,
  UserRound,
  LoaderCircle,
  MapPin,
  RefreshCw,
  X,
} from 'lucide-react';
import { getResident } from './adapters/localResident';
import { useResidentIssues } from './services/useResidentIssues';
import Home from './pages/Home';
import Progress from './pages/Progress';
import Me from './pages/Me';
import IssueDetail from './pages/IssueDetail';
import Success from './pages/Success';
import ReportSheet from './pages/ReportSheet';
import { syncStatus } from '../services/sharedIssueSync';
import { useResidentMap } from './services/useResidentMap';
import { issuesForModel } from '../lib/issues';
import './mobile.css';
export default function MobileApp() {
  const syncPhase = useSyncExternalStore(syncStatus.subscribe, syncStatus.get);
  const villageMap = useResidentMap(),
    navigate = useNavigate();
  const [resident, setResident] = useState(getResident),
    {
      issues: listedIssues,
      error,
      loading,
      reload,
    } = useResidentIssues(villageMap.map?.modelId || '__waiting_real_map__'),
    location = useLocation();
  const issues = useMemo(
    () => issuesForModel(listedIssues, villageMap.map?.modelId || '__waiting_real_map__'),
    [listedIssues, villageMap.map?.modelId],
  );
  const reporting = location.pathname === '/mobile/report',
    detail = location.pathname.includes('/issues/'),
    success = location.pathname.includes('/success/');
  const previousModel = useRef(villageMap.map?.modelId);
  useEffect(() => {
    if (
      previousModel.current &&
      previousModel.current !== villageMap.map?.modelId &&
      (detail || success)
    )
      navigate('/mobile/progress?view=map', { replace: true });
    previousModel.current = villageMap.map?.modelId;
  }, [villageMap.map?.modelId, detail, success, navigate]);
  return (
    <div className="mobile-app">
      <header className="m-header">
        <Link to="/mobile" className="m-brand" aria-label="乡见首页">
          <span>
            <Leaf size={23} />
          </span>
          <strong>乡见</strong>
        </Link>
        <span className="m-village-label m-current-real-village">
          <MapPin size={14} />
          <span>{villageMap.map?.name || '等待实景同步'}</span>
        </span>
      </header>
      {syncPhase === 'offline' && (
        <p className="m-sync-note" role="status">
          暂时连不上村里服务，已有记录仍可查看，上报草稿会保留。
        </p>
      )}
      {villageMap.notice && (
        <div className="m-map-change-note" role="status">
          <span>{villageMap.notice}</span>
          <button aria-label="关闭村庄切换提示" onClick={villageMap.dismissNotice}>
            <X size={17} />
          </button>
        </div>
      )}
      <main className="m-scroll" key={location.pathname} id="mobile-main">
        {error ? (
          <div className="m-empty">
            <p role="alert">{error}</p>
            <button className="m-button" onClick={reload}>
              重新读取
            </button>
          </div>
        ) : loading || villageMap.loading ? (
          <div className="m-loading">
            <LoaderCircle className="m-spin" />
            正在读取村里动态…
          </div>
        ) : !villageMap.map ? (
          <div className="m-empty m-wait-real">
            <MapPin size={36} />
            <h1>等待电脑端实景村庄</h1>
            <p>在电脑管理端打开真实村庄模型，二维底图会自动同步到这里。</p>
            {villageMap.error && <p role="alert">{villageMap.error}</p>}
            <button className="m-button" onClick={villageMap.refresh}>
              <RefreshCw size={17} />
              重新连接
            </button>
          </div>
        ) : (
          <Routes>
            <Route index element={<Home issues={issues} map={villageMap.map} />} />
            <Route
              path="progress"
              element={
                <Progress
                  key={villageMap.map.modelId}
                  issues={issues}
                  residentId={resident.id}
                  map={villageMap.map}
                />
              }
            />
            <Route
              path="me"
              element={
                <Me
                  key={villageMap.map.modelId}
                  issues={issues}
                  resident={resident}
                  onResident={setResident}
                  map={villageMap.map}
                />
              }
            />
            <Route
              path="issues/:id"
              element={<IssueDetail issues={issues} map={villageMap.map} />}
            />
            <Route path="success/:id" element={<Success issues={issues} />} />
            <Route path="report" element={<Home issues={issues} map={villageMap.map} />} />
            <Route path="*" element={<Home issues={issues} map={villageMap.map} />} />
          </Routes>
        )}
      </main>
      {!detail && !success && villageMap.map && (
        <nav className="m-bottom-nav" aria-label="村民端导航">
          <NavLink end to="/mobile">
            <span className="m-nav-icon">
              <House size={22} />
            </span>
            <span>首页</span>
          </NavLink>
          <NavLink to="/mobile/report" className="m-nav-report">
            <span className="m-nav-plus">
              <Plus size={25} />
            </span>
            <span>随手报</span>
          </NavLink>
          <NavLink to="/mobile/progress">
            <span className="m-nav-icon">
              <ClipboardCheck size={22} />
            </span>
            <span>进度</span>
          </NavLink>
          <NavLink to="/mobile/me">
            <span className="m-nav-icon">
              <UserRound size={22} />
            </span>
            <span>我的</span>
          </NavLink>
        </nav>
      )}
      {reporting && !villageMap.loading && villageMap.map && (
        <ReportSheet
          key={villageMap.map.modelId}
          resident={resident}
          villageMap={villageMap.map}
          switchNotice={villageMap.notice}
        />
      )}
    </div>
  );
}
