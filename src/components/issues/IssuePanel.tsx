import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCheck,
  ChevronRight,
  ClipboardList,
  Clock,
  MapPin,
  Plus,
  X,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import DesktopIssuePhotos from './DesktopIssuePhotos';
import { createLocation } from '../../lib/coordinate';
import {
  activeIssues,
  BAGUA_MODEL_ID,
  issuesForModel,
  ISSUE_CATEGORIES,
  ISSUE_SEVERITY_LABEL,
  ISSUE_STATUS_LABEL,
} from '../../lib/issues';
import type { ModelPoint } from '../../lib/sketchfab';
import type { Issue, IssueCategory, IssueSeverity, Vector3D } from '../../types';

export interface PickedLocation {
  modelId?: string;
  position: ModelPoint;
  local: Vector3D;
}
interface PanelProps {
  modelId?: string;
  draft: PickedLocation | null;
  onCancelDraft: () => void;
  onSaved: () => void;
  onClose: () => void;
  onNotice: (message: string) => void;
  onLocate: (issue: Issue) => void;
}

export function IssueComposer({
  draft,
  onCancel,
  onSaved,
  onNotice,
}: {
  draft: PickedLocation;
  onCancel: () => void;
  onSaved: () => void;
  onNotice: (message: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<IssueCategory>('其他');
  const [area, setArea] = useState('村内选点');
  const [severity, setSeverity] = useState<IssueSeverity>('medium');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const savingRef = useRef(false);
  const addIssue = useAppStore((state) => state.addIssue);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (savingRef.current) return;
    if (!title.trim()) {
      setError('请填写事件标题。');
      titleRef.current?.focus();
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setError('');
    try {
      addIssue({
        title,
        description,
        category,
        severity,
        status: 'pending',
        location: createLocation(draft.local),
        sceneAnchor: { modelId: draft.modelId ?? BAGUA_MODEL_ID, position: [...draft.position] },
        area: area.trim() || '村内选点',
        reporter: '管理员',
      });
      onSaved();
      onNotice('事件已加入待办，选点位置已标记。');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败，请重试。');
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <form className="issue-form" onSubmit={submit}>
      <div className="issue-location">
        <MapPin size={16} />
        <div>
          <strong>已选中村内位置</strong>
          <span>事件将固定标记在本次点击处</span>
        </div>
        <Check size={16} />
      </div>
      <label htmlFor="issue-title">
        事件标题 <span className="field-required">必填</span>
      </label>
      <input
        ref={titleRef}
        id="issue-title"
        value={title}
        onChange={(event) => {
          setTitle(event.target.value);
          setError('');
        }}
        maxLength={60}
        required
        placeholder="例如：巷道积水，需要疏通"
        aria-invalid={!!error && !title.trim()}
        aria-describedby={error ? 'issue-form-error' : undefined}
      />
      <div className="issue-field-row">
        <div>
          <label htmlFor="issue-category">事件类型</label>
          <select
            id="issue-category"
            value={category}
            onChange={(event) => setCategory(event.target.value as IssueCategory)}
          >
            {ISSUE_CATEGORIES.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="issue-severity">关注程度</label>
          <select
            id="issue-severity"
            value={severity}
            onChange={(event) => setSeverity(event.target.value as IssueSeverity)}
          >
            {Object.entries(ISSUE_SEVERITY_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <label htmlFor="issue-area">所属区域</label>
      <input
        id="issue-area"
        value={area}
        maxLength={40}
        onChange={(event) => setArea(event.target.value)}
        placeholder="例如：村口区域、公共广场"
      />
      <label htmlFor="issue-description">
        补充说明 <span>选填</span>
      </label>
      <textarea
        id="issue-description"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        maxLength={1000}
        rows={4}
        placeholder="描述现场情况、影响范围或处理建议"
      />
      <p className="issue-local-note">记录保存在当前浏览器，刷新页面后仍可查看。</p>
      {error && (
        <p id="issue-form-error" className="issue-error" role="alert">
          {error}
        </p>
      )}
      <div className="issue-form-actions">
        <button type="button" className="issue-secondary" onClick={onCancel} disabled={saving}>
          取消
        </button>
        <button type="submit" className="issue-primary" disabled={saving}>
          <Plus size={16} />
          {saving ? '保存中…' : '加入待办'}
        </button>
      </div>
    </form>
  );
}

export default function IssuePanel({
  modelId = BAGUA_MODEL_ID,
  draft,
  onCancelDraft,
  onSaved,
  onClose,
  onNotice,
  onLocate,
}: PanelProps) {
  const village = useAppStore((state) => state.village);
  const selectedIssueId = useAppStore((state) => state.selectedIssueId);
  const selectIssue = useAppStore((state) => state.selectIssue);
  const updateIssueStatus = useAppStore((state) => state.updateIssueStatus);
  const filterCategory = useAppStore((state) => state.filterCategory);
  const filterStatus = useAppStore((state) => state.filterStatus);
  const [error, setError] = useState('');
  const headingRef = useRef<HTMLHeadingElement>(null);
  const modelIssues = issuesForModel(village?.issues ?? [], modelId);
  const tasks = activeIssues(modelIssues, filterCategory, filterStatus);
  const allTasks = activeIssues(modelIssues);
  const selected = allTasks.find((issue) => issue.id === selectedIssueId);

  useEffect(() => {
    if (!draft) headingRef.current?.focus();
  }, [selectedIssueId, draft]);

  const complete = () => {
    if (!selected) return;
    try {
      updateIssueStatus(selected.id, 'completed', '确认办结，已从待办移除。');
      setError('');
      onNotice(`“${selected.title}”已办结，地图标记已移除。`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '办结失败，请重试。');
    }
  };

  return (
    <section
      className="issue-panel"
      role="dialog"
      aria-modal="false"
      aria-labelledby="issue-panel-title"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <header className="issue-panel-header">
        <div>
          {!draft && selected ? (
            <button
              className="issue-back"
              type="button"
              aria-label="返回待办列表"
              onClick={() => {
                selectIssue(null);
                setError('');
              }}
            >
              <ArrowLeft size={17} />
            </button>
          ) : (
            <ClipboardList size={19} />
          )}
          <h2 id="issue-panel-title" ref={headingRef} tabIndex={-1}>
            {draft ? '录入待办事件' : selected ? '事件详情' : '待办事件'}
          </h2>
          {!draft && !selected && <span className="issue-count">{allTasks.length}</span>}
        </div>
        <button
          className="issue-panel-close"
          type="button"
          onClick={onClose}
          aria-label={draft ? '取消录入' : '关闭待办弹窗'}
        >
          <X size={18} />
        </button>
      </header>
      <div className="issue-panel-body">
        {draft ? (
          <IssueComposer
            draft={draft}
            onCancel={onCancelDraft}
            onSaved={onSaved}
            onNotice={onNotice}
          />
        ) : selected ? (
          <div className="issue-task-detail" key={selected.id}>
            <div className="issue-meta">
              <span className={`issue-status ${selected.status}`}>
                {ISSUE_STATUS_LABEL[selected.status]}
              </span>
              <span className={`issue-priority ${selected.severity}`}>
                {ISSUE_SEVERITY_LABEL[selected.severity]}
              </span>
              <span>{selected.category}</span>
            </div>
            <h3>{selected.title}</h3>
            <p className="issue-description">{selected.description || '暂无补充说明。'}</p>
            <DesktopIssuePhotos key={selected.id} images={selected.images} title={selected.title} />
            <dl className="issue-facts">
              <div>
                <dt>位置</dt>
                <dd>{selected.area}</dd>
              </div>
              <div>
                <dt>录入人</dt>
                <dd>{selected.reporter}</dd>
              </div>
              <div>
                <dt>录入时间</dt>
                <dd>{new Date(selected.createdAt).toLocaleString('zh-CN', { hour12: false })}</dd>
              </div>
            </dl>
            <p className="issue-data-note">
              {selected.sceneAnchor
                ? '模型选点记录，非测绘地理坐标。'
                : '原有模拟事件，不代表该村实际情况。'}
            </p>
            {error && (
              <p className="issue-error" role="alert">
                {error}
              </p>
            )}
            <div className="issue-resolution">
              <p>办理完成后确认，事件将移出待办并取消高亮。</p>
              <button type="button" className="issue-primary" onClick={complete}>
                <CheckCheck size={17} />
                确认办结
              </button>
            </div>
          </div>
        ) : (
          <div className="issue-list">
            <p className="issue-list-hint">点击模型中的建筑或地面，即可在该位置录入事件。</p>
            {tasks.length ? (
              tasks.map((issue) => (
                <button
                  key={issue.id}
                  type="button"
                  className="issue-list-row"
                  onClick={() => {
                    setError('');
                    selectIssue(issue.id);
                    onLocate(issue);
                  }}
                >
                  <span className={`issue-list-indicator ${issue.status} ${issue.severity}`}>
                    <Clock size={16} />
                  </span>
                  <span className="issue-list-content">
                    <strong>{issue.title}</strong>
                    <span>
                      {issue.area} · {ISSUE_STATUS_LABEL[issue.status]}
                    </span>
                  </span>
                  <ChevronRight size={15} className="issue-row-arrow" aria-hidden="true" />
                </button>
              ))
            ) : (
              <div className="issue-empty">
                <CheckCheck size={30} />
                <h3>{allTasks.length ? '当前筛选下没有待办' : '待办已全部办结'}</h3>
                <p>
                  {allTasks.length
                    ? '调整现有筛选条件可查看其他事件。'
                    : '新的事件可直接在模型上点击录入。'}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
