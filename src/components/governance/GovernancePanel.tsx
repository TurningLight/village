import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  CheckCheck,
  ChevronRight,
  ClipboardList,
  FileText,
  LocateFixed,
  MapPin,
  Plus,
  Wrench,
  X,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import {
  DEMO_MODEL_ID,
  filteredIssues,
  issuesForModel,
  ISSUE_CATEGORIES,
  ISSUE_SEVERITY_LABEL,
  ISSUE_STATUS_LABEL,
} from '../../lib/issues';
import { IssueComposer } from '../issues/IssuePanel';
import DesktopIssuePhotos from '../issues/DesktopIssuePhotos';
import type { PickedLocation } from '../issues/IssuePanel';
import type { IssueCategory, IssueStatus } from '../../types';
export default function GovernancePanel({
  modelId,
  demo,
  tab,
  onTab,
  onClose,
  onCreate,
  draft,
  onCancelDraft,
  onNotice,
}: {
  modelId: string;
  demo: boolean;
  tab: 'issues' | 'plans';
  onTab: (v: 'issues' | 'plans') => void;
  onClose: () => void;
  onCreate: () => void;
  draft: PickedLocation | null;
  onCancelDraft: () => void;
  onNotice: (v: string) => void;
}) {
  const s = useAppStore(),
    [error, setError] = useState(''),
    [note, setNote] = useState('');
  const all = issuesForModel(s.village?.issues ?? [], modelId),
    rows = filteredIssues(all, s.filterCategory, s.filterStatus);
  const selected = all.find((i) => i.id === s.selectedIssueId),
    building = demo ? s.village?.buildings.find((b) => b.id === s.selectedBuildingId) : null;
  const plan = demo ? s.village?.renovations.find((p) => p.id === s.currentRenovationId) : null;
  const changeStatus = (status: IssueStatus) => {
    if (!selected) return;
    try {
      s.updateIssueStatus(
        selected.id,
        status,
        note.trim() ||
          (status === 'processing'
            ? '已受理，安排现场处理。'
            : status === 'completed'
              ? '确认办结，未补充具体处置与验收说明。'
              : '重新受理，待安排处理。'),
      );
      setNote('');
      onTab('issues');
      onNotice(
        status === 'completed'
          ? '事件已办结并保存，同步到服务后将自动生成工作留痕。'
          : '办理状态已更新。',
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败，请重试。');
    }
  };
  const choosePlan = (id: string) => {
    if (!s.showRenovations) s.toggleRenovations();
    if (!s.layers.facilities) s.toggleLayer('facilities');
    s.setCurrentRenovation(id);
  };
  return (
    <aside className="governance-panel" aria-label="治理工作面板">
      <div className="panel-tabs">
        <button
          className={tab === 'issues' ? 'active' : ''}
          onClick={() => {
            onTab('issues');
            s.setCurrentRenovation(null);
          }}
        >
          <ClipboardList size={16} />
          治理事件
        </button>
        <button
          className={tab === 'plans' ? 'active' : ''}
          onClick={() => {
            onTab('plans');
            s.selectIssue(null);
            s.selectBuilding(null);
          }}
        >
          <Wrench size={16} />
          微更新
        </button>
        <button aria-label="收起信息面板" className="panel-hide" onClick={onClose}>
          <X size={17} />
        </button>
      </div>
      <div className="panel-scroll">
        {draft ? (
          <>
            <div className="panel-heading">
              <h2>录入待办事件</h2>
              <p>已在场景中选中位置</p>
            </div>
            <IssueComposer
              draft={draft}
              onCancel={onCancelDraft}
              onSaved={onCancelDraft}
              onNotice={onNotice}
            />
          </>
        ) : building ? (
          <>
            <button className="text-button" onClick={() => s.selectBuilding(null)}>
              <ArrowLeft size={15} />
              返回事件列表
            </button>
            <div className="panel-heading">
              <Building2 size={25} />
              <h2>{building.name}</h2>
              <p>{building.id}</p>
            </div>
            <dl className="detail-facts">
              <div>
                <dt>建筑类型</dt>
                <dd>
                  {
                    { residential: '农村住宅', public: '公共服务', commercial: '商业服务' }[
                      building.type
                    ]
                  }
                </dd>
              </div>
              <div>
                <dt>所属区域</dt>
                <dd>{building.area}</dd>
              </div>
              <div>
                <dt>使用状态</dt>
                <dd>{building.status}</dd>
              </div>
              <div>
                <dt>本地坐标</dt>
                <dd>
                  {building.location.local.x}m, {building.location.local.z}m
                </dd>
              </div>
            </dl>
            <h3 className="subheading">附近环境问题</h3>
            <p className="panel-help">建筑周边15米范围的演示事件</p>
            {all
              .filter(
                (i) =>
                  Math.hypot(
                    i.location.local.x - building.location.local.x,
                    i.location.local.z - building.location.local.z,
                  ) < 15,
              )
              .map((i) => (
                <button className="event-row" key={i.id} onClick={() => s.selectIssue(i.id)}>
                  <span>{i.title}</span>
                  <ChevronRight size={16} />
                </button>
              ))}
            {!all.some(
              (i) =>
                Math.hypot(
                  i.location.local.x - building.location.local.x,
                  i.location.local.z - building.location.local.z,
                ) < 15,
            ) && <p className="empty-note">附近暂无事件</p>}
          </>
        ) : tab === 'plans' ? (
          <>
            <div className="panel-heading">
              <h2>小更新，让村庄更宜居</h2>
              <p>选择方案，在三维场景中对比改造效果。</p>
            </div>
            {!demo ? (
              <div className="panel-empty">
                <Wrench size={28} />
                <h3>请切换至青禾村 Demo</h3>
                <p>实景模型未分割设施对象，预设改造在青禾村中展示。</p>
              </div>
            ) : (
              <>
                <div className="plan-list">
                  {s.village?.renovations.map((p, i) => (
                    <button
                      key={p.id}
                      className={`plan-row ${plan?.id === p.id ? 'active' : ''}`}
                      onClick={() => choosePlan(p.id)}
                    >
                      <span className="plan-letter">{String.fromCharCode(65 + i)}</span>
                      <span>
                        <strong>{p.name}</strong>
                        <small>{p.targetArea}</small>
                      </span>
                      <ChevronRight size={16} />
                    </button>
                  ))}
                </div>
                {plan ? (
                  <div className="plan-detail">
                    <h3>{plan.name}</h3>
                    <p>{plan.description}</p>
                    <div className="compare-switch" role="group" aria-label="改造效果对比">
                      <button
                        className={s.renovationMode === 'before' ? 'active' : ''}
                        aria-pressed={s.renovationMode === 'before'}
                        onClick={() => s.setRenovationMode('before')}
                      >
                        改造前
                      </button>
                      <button
                        className={s.renovationMode === 'after' ? 'active' : ''}
                        aria-pressed={s.renovationMode === 'after'}
                        onClick={() => s.setRenovationMode('after')}
                      >
                        改造后
                      </button>
                    </div>
                    <div className="effect-description">
                      <strong>{s.renovationMode === 'before' ? '现状问题' : '预期效果'}</strong>
                      <p>{s.renovationMode === 'before' ? plan.beforeState : plan.afterState}</p>
                    </div>
                    {plan.id === 'renovation-001' && (
                      <button
                        className="secondary-action"
                        onClick={() => s.setTimeMode(s.timeMode === 'night' ? 'day' : 'night')}
                      >
                        {s.timeMode === 'night' ? '切回日间' : '切换夜间查看照明'}
                      </button>
                    )}
                    <button className="text-button" onClick={s.focusSelection}>
                      <LocateFixed size={15} />
                      重新定位方案区域
                    </button>
                    <p className="panel-help">方案为效果预览。事件办理状态需要单独更新。</p>
                  </div>
                ) : (
                  <p className="empty-note">选择一个方案开始对比</p>
                )}
              </>
            )}
          </>
        ) : selected ? (
          <>
            <button className="text-button" onClick={() => s.selectIssue(null)}>
              <ArrowLeft size={15} />
              返回全部事件
            </button>
            <div className="panel-heading">
              <div className="event-tags">
                <span className={`status-tag ${selected.status}`}>
                  {ISSUE_STATUS_LABEL[selected.status]}
                </span>
                <span>{ISSUE_SEVERITY_LABEL[selected.severity]}</span>
              </div>
              <h2>{selected.title}</h2>
              <p>{selected.description || '暂无补充说明'}</p>
            </div>
            <DesktopIssuePhotos key={selected.id} images={selected.images} title={selected.title} />
            <dl className="detail-facts">
              <div>
                <dt>类别</dt>
                <dd>{selected.category}</dd>
              </div>
              <div>
                <dt>区域</dt>
                <dd>{selected.area}</dd>
              </div>
              <div>
                <dt>上报人</dt>
                <dd>{selected.reporter}</dd>
              </div>
              <div>
                <dt>上报时间</dt>
                <dd>{new Date(selected.createdAt).toLocaleString('zh-CN', { hour12: false })}</dd>
              </div>
            </dl>
            <button className="secondary-action" onClick={s.focusSelection}>
              <LocateFixed size={15} />
              定位到此事件
            </button>
            <h3 className="subheading">办理进度</h3>
            <ol className="history-list">
              {selected.history.map((h, i) => (
                <li key={i}>
                  <span className={`timeline-dot ${h.status}`} />
                  <strong>{ISSUE_STATUS_LABEL[h.status]}</strong>
                  <p>{h.note}</p>
                  <small>
                    {h.operator} · {new Date(h.time).toLocaleString('zh-CN', { hour12: false })}
                  </small>
                </li>
              ))}
            </ol>
            {selected.status === 'completed' && (
              <div className="work-record-entry">
                <p>办结记录同步后自动整理为工作留痕，按办结月份汇入治理终端。</p>
                <Link to="/governance" className="text-button">
                  <FileText size={16} />
                  查看工作留痕与月报
                  <ChevronRight size={15} />
                </Link>
              </div>
            )}
            <label className="field-label" htmlFor="handling-note">
              {selected.status === 'completed' ? '重新受理说明' : '处理说明'} <small>选填</small>
            </label>
            <textarea
              id="handling-note"
              className="handling-note"
              value={note}
              maxLength={500}
              rows={3}
              onChange={(e) => setNote(e.target.value)}
              placeholder="记录实际处理措施、处理结果或后续安排，便于生成可核查的工作留痕"
            />
            {error && (
              <p className="issue-error" role="alert">
                {error}
              </p>
            )}
            <div className="status-actions">
              {selected.status === 'pending' && (
                <button className="primary-action" onClick={() => changeStatus('processing')}>
                  受理并开始处理
                </button>
              )}
              {selected.status !== 'completed' ? (
                <button
                  className={
                    selected.status === 'processing' ? 'primary-action' : 'secondary-action'
                  }
                  onClick={() => changeStatus('completed')}
                >
                  <CheckCheck size={16} />
                  确认办结
                </button>
              ) : (
                <button className="secondary-action" onClick={() => changeStatus('pending')}>
                  重新受理
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="panel-heading panel-heading-action">
              <div>
                <h2>治理事件</h2>
                <p>
                  共 {all.length} 条记录 · 当前显示 {rows.length} 条
                </p>
              </div>
              <button aria-label="新增事件" className="icon-action" onClick={onCreate}>
                <Plus size={19} />
              </button>
            </div>
            <div className="event-filters">
              <label>
                问题类型
                <select
                  aria-label="按问题类型筛选"
                  value={s.filterCategory}
                  onChange={(e) => s.setFilterCategory(e.target.value as IssueCategory | 'all')}
                >
                  <option value="all">全部类型</option>
                  {ISSUE_CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label>
                办理状态
                <select
                  aria-label="按办理状态筛选"
                  value={s.filterStatus}
                  onChange={(e) => s.setFilterStatus(e.target.value as IssueStatus | 'all')}
                >
                  <option value="all">全部状态</option>
                  {Object.entries(ISSUE_STATUS_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="event-list">
              {rows.map((issue) => (
                <button
                  className="event-row"
                  key={issue.id}
                  onClick={() => s.selectIssue(issue.id)}
                >
                  <span className={`event-dot ${issue.status} ${issue.severity}`}>
                    <AlertCircle size={16} />
                  </span>
                  <span className="event-row-copy">
                    <strong>{issue.title}</strong>
                    <small>
                      {issue.area} · {issue.category}
                    </small>
                  </span>
                  <span className={`status-text ${issue.status}`}>
                    {ISSUE_STATUS_LABEL[issue.status]}
                  </span>
                </button>
              ))}
            </div>
            {!rows.length && (
              <div className="panel-empty">
                <ClipboardList size={28} />
                <h3>没有匹配的事件</h3>
                <p>调整筛选条件，或在场景中新增事件。</p>
                <button
                  className="text-button"
                  onClick={() => {
                    s.setFilterCategory('all');
                    s.setFilterStatus('all');
                  }}
                >
                  清除筛选
                </button>
              </div>
            )}
            <p className="panel-local-note">
              <MapPin size={14} />
              {modelId === DEMO_MODEL_ID ? '虚构村庄演示数据' : '模型相对选点，未经地理配准'}
              <br />
              本地演示服务同步 · 浏览器保留副本
            </p>
          </>
        )}
      </div>
    </aside>
  );
}
