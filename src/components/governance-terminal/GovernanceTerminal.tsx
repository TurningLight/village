import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  Bot,
  Check,
  CircleAlert,
  Clipboard,
  Download,
  FileText,
  LoaderCircle,
  MapPin,
  RefreshCw,
  Search,
} from 'lucide-react';
import { generateMonthlyReport, retryWorkRecord } from '../../services/governanceService';
import type { GovernanceFacts, GovernanceOverview, WorkRecord } from '../../types/governance';
import AssistantDrawer from './AssistantDrawer';
import useGovernanceOverview from './useGovernanceOverview';
import { EvidenceLinks, TextParagraphs } from './terminalText';
import { monthLabel, terminalDate } from './terminalFormat';
import './governance-terminal.css';

export interface GovernanceTerminalProps {
  modelId: string;
  modelName: string;
  demo?: boolean;
  onOpenIssue: (id: string) => void;
  onOpenWorkspace?: () => void;
}

function currentMonth() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date());
}

const statusLabels: Record<WorkRecord['status'], string> = {
  ready: '已留痕',
  pending: '待生成',
  generating: '整理中',
  error: '生成失败',
};
const issueStatusLabels = { pending: '待处理', processing: '处理中', completed: '已办结' };
type RecordFilter = 'all' | 'ready' | 'waiting' | 'error' | 'withdrawn';

function WorkRecordItem({
  record,
  enabled,
  retrying,
  onRetry,
  onOpenIssue,
}: {
  record: WorkRecord;
  enabled: boolean;
  retrying: boolean;
  onRetry: (id: string) => void;
  onOpenIssue: (id: string) => void;
}) {
  const pending = record.status === 'pending' || record.status === 'generating';
  return (
    <article className={`gt-record${record.withdrawn ? ' gt-record-withdrawn' : ''}`}>
      <div className="gt-record-heading">
        <div>
          <h3>{record.title}</h3>
          <p className="gt-record-meta">
            <span>{record.category}</span>
            <span>{record.area || '未填写地点'}</span>
            <span>{terminalDate(record.completedAt)} 办结</span>
          </p>
        </div>
        <span className={`gt-status gt-status-${record.withdrawn ? 'withdrawn' : record.status}`}>
          {record.withdrawn ? (
            '已重新打开'
          ) : (
            <>
              {pending ? (
                <LoaderCircle
                  size={13}
                  className={record.status === 'generating' ? 'gt-spin' : ''}
                />
              ) : record.status === 'error' ? (
                <CircleAlert size={13} />
              ) : (
                <Check size={13} />
              )}
              {statusLabels[record.status]}
            </>
          )}
        </span>
      </div>
      {record.withdrawn && (
        <p className="gt-form-hint">事项已重新进入办理，本条历史档案保留，不纳入当前月报。</p>
      )}
      {record.status === 'ready' && record.report ? (
        <TextParagraphs text={record.report} className="gt-record-report" />
      ) : (
        <p
          className={`gt-record-placeholder${record.status === 'error' ? ' gt-inline-error' : ''}`}
        >
          {record.status === 'error'
            ? record.error || '本次留痕生成失败，请重试。'
            : record.status === 'generating'
              ? '正在将办理流程与结果整理为工作留痕，完成后自动保存。'
              : enabled
                ? '已接收办结事项，等待模型整理工作留痕。'
                : '已保存办结事实。治理模型连接后可生成工作留痕。'}
        </p>
      )}
      <div className="gt-record-actions">
        <details className="gt-record-evidence">
          <summary>
            原始办理流程<span>{record.evidence.history.length} 条记录</span>
          </summary>
          <div className="gt-original-evidence">
            <p>
              <strong>上报内容</strong>
              {record.evidence.description || '未填写描述'}
            </p>
            <ol>
              {record.evidence.history.map((entry, index) => (
                <li key={`${entry.time}-${index}`}>
                  <div>
                    <time dateTime={entry.time}>{terminalDate(entry.time)}</time>
                    <span>{issueStatusLabels[entry.status] || entry.status}</span>
                  </div>
                  <p>{entry.note || '未填写办理说明'}</p>
                </li>
              ))}
            </ol>
          </div>
        </details>
        <div className="gt-record-action-buttons">
          {!record.withdrawn && record.status === 'error' && (
            <button
              type="button"
              className="gt-text-button"
              onClick={() => onRetry(record.id)}
              disabled={!enabled || retrying}
              title={!enabled ? '请先在服务端配置治理模型' : undefined}
            >
              {retrying ? <LoaderCircle size={14} className="gt-spin" /> : <RefreshCw size={14} />}
              重试生成
            </button>
          )}
          <button
            type="button"
            className="gt-text-button"
            onClick={() => onOpenIssue(record.issueId)}
          >
            查看原事件
            <ArrowUpRight size={14} />
          </button>
        </div>
      </div>
      {record.status === 'ready' && record.generatedAt && (
        <p className="gt-record-attribution">
          模型整理 · {record.model} · {terminalDate(record.generatedAt)}
        </p>
      )}
    </article>
  );
}

function FactStrip({ facts }: { facts: GovernanceFacts }) {
  const counts = facts.counts;
  return (
    <dl className="gt-fact-strip" aria-label="村庄办理数据">
      <div>
        <dt>本月上报</dt>
        <dd>
          {counts.reportedInMonth}
          <span>件</span>
        </dd>
        <p>按上报时间统计</p>
      </div>
      <div>
        <dt>本月办结</dt>
        <dd>
          {counts.completedInMonth}
          <span>件</span>
        </dd>
        <p>按当前有效办结时间统计</p>
      </div>
      <div>
        <dt>当前待处理</dt>
        <dd>
          {counts.pendingNow}
          <span>件</span>
        </dd>
        <p>另有 {counts.processingNow} 件正在办理</p>
      </div>
      <div>
        <dt>平均办结耗时</dt>
        <dd>
          {counts.averageCompletionHours === null ? (
            <span className="gt-no-sample">暂无样本</span>
          ) : (
            <>
              {Number(counts.averageCompletionHours.toFixed(1))}
              <span>小时</span>
            </>
          )}
        </dd>
        <p>有效耗时样本 {counts.completionSampleCount} 件</p>
      </div>
    </dl>
  );
}

function Distribution({
  facts,
  onOpenIssue,
}: {
  facts: GovernanceFacts;
  onOpenIssue: (id: string) => void;
}) {
  const maxCategory = Math.max(1, ...facts.categories.map((item) => item.count));
  return (
    <section className="gt-distribution" aria-label="治理事实分布">
      <div className="gt-category-section">
        <h2>本月事件类别</h2>
        <p className="gt-section-note">按本月上报事项统计，保留原始分类。</p>
        {facts.categories.length ? (
          <ul className="gt-category-bars">
            {facts.categories.map((category) => (
              <li key={category.name}>
                <span>{category.name}</span>
                <div aria-hidden="true">
                  <i style={{ width: `${(category.count / maxCategory) * 100}%` }} />
                </div>
                <strong>
                  {category.count}
                  <span> 件</span>
                </strong>
              </li>
            ))}
          </ul>
        ) : (
          <p className="gt-empty-inline">本月尚无上报事项。</p>
        )}
      </div>
      <div className="gt-hotspot-section">
        <h2>事件集中地点</h2>
        <p className="gt-section-note">按已填写地点聚合事件，不等同于事故发生率。</p>
        {facts.hotspots.length ? (
          <ol className="gt-hotspots">
            {facts.hotspots.map((spot) => (
              <li key={spot.area}>
                <div className="gt-hotspot-heading">
                  <h3>
                    <MapPin size={15} />
                    {spot.area || '未填写地点'}
                  </h3>
                  <p>
                    <strong>{spot.count}</strong> 件<span> · 未办结 {spot.open} 件</span>
                  </p>
                </div>
                <EvidenceLinks
                  ids={spot.issueIds}
                  evidence={facts.evidence}
                  onOpenIssue={onOpenIssue}
                  prefix="查看依据"
                />
              </li>
            ))}
          </ol>
        ) : (
          <p className="gt-empty-inline">暂无可聚合的地点记录。</p>
        )}
      </div>
    </section>
  );
}

function MonthlyDocument({
  overview,
  modelName,
  generating,
  onGenerate,
  onOpenIssue,
  onNotice,
}: {
  overview: GovernanceOverview;
  modelName: string;
  generating: boolean;
  onGenerate: () => void;
  onOpenIssue: (id: string) => void;
  onNotice: (message: string) => void;
}) {
  const monthly = overview.monthly;
  const ready = overview.records.filter((record) => !record.withdrawn && record.status === 'ready');
  const waiting = overview.records.filter(
    (record) => !record.withdrawn && record.status !== 'ready',
  );
  const busy = generating || monthly?.status === 'pending' || monthly?.status === 'generating';
  const sourceRecords = monthly
    ? monthly.sourceRecordIds
        .map((id) => overview.records.find((record) => record.id === id))
        .filter((record): record is WorkRecord => !!record)
    : [];
  const reportText = monthly?.report
    ? `${modelName} ${monthLabel(overview.month)}工作总结\nAI 整理稿，请核对原始办理记录后使用。\n\n${monthly.report}\n\n模型：${monthly.model}\n生成时间：${monthly.generatedAt || '未记录'}\n来源办结事项：${sourceRecords.map((record) => `${record.title}（${record.issueId}）`).join('、')}${monthly.stale ? '\n提示：该月报生成后数据已有变化，请更新后再使用。' : ''}`
    : '';
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(reportText);
      onNotice('月报已复制，可粘贴到工作汇报中。');
    } catch {
      onNotice('当前浏览器无法复制，请使用“下载文本”保存月报。');
    }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([reportText], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${modelName.replace(/[\\/:*?"<>|]/g, '')}-${overview.month}-工作总结.txt`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    onNotice('月报文本已下载。');
  };
  return (
    <section className="gt-monthly" aria-labelledby="gt-monthly-heading">
      <div className="gt-section-heading">
        <div>
          <h2 id="gt-monthly-heading">月度工作总结</h2>
          <p>汇集有效办结留痕，形成可追溯的工作汇报。</p>
        </div>
        <button
          type="button"
          className="gt-button gt-button-primary"
          onClick={onGenerate}
          disabled={!overview.config.enabled || !ready.length || busy}
          title={
            !overview.config.enabled
              ? '请先在服务端配置治理模型'
              : !ready.length
                ? '至少需要一份已生成的有效办结留痕'
                : undefined
          }
        >
          {busy ? <LoaderCircle size={15} className="gt-spin" /> : <FileText size={15} />}
          {busy
            ? '正在整理'
            : monthly?.status === 'error'
              ? '重试生成'
              : monthly?.report
                ? monthly.stale
                  ? '更新月报'
                  : '检查更新'
                : '生成月报'}
        </button>
      </div>
      {monthly?.stale && (
        <p className="gt-monthly-stale" role="status">
          <CircleAlert size={16} />
          生成后办理数据已有变化，请更新月报后使用。
        </p>
      )}
      {monthly?.status === 'error' && (
        <p className="gt-inline-error" role="alert">
          {monthly.error || '月报生成失败，请重新生成。'}
        </p>
      )}
      {monthly?.report ? (
        <>
          <article className="gt-monthly-document">
            <div className="gt-document-title">
              <h3>
                {modelName}
                <br />
                {monthLabel(overview.month)}工作总结
              </h3>
              <p>
                AI 整理稿 · 请核对后使用
                <br />
                模型整理 · {monthly.model}
                <br />
                生成于 {terminalDate(monthly.generatedAt)}
              </p>
            </div>
            <TextParagraphs text={monthly.report} />
            <footer className="gt-document-sources">
              <p>来源留痕 {monthly.sourceRecordIds.length} 份 · 点击核对原事件</p>
              <div>
                {sourceRecords.map((record) => (
                  <button key={record.id} type="button" onClick={() => onOpenIssue(record.issueId)}>
                    {record.title}
                    <ArrowUpRight size={13} />
                  </button>
                ))}
              </div>
            </footer>
          </article>
          <div className="gt-document-tools">
            <button className="gt-text-button" type="button" onClick={() => void copy()}>
              <Clipboard size={15} />
              复制全文
            </button>
            <button className="gt-text-button" type="button" onClick={download}>
              <Download size={15} />
              下载文本
            </button>
          </div>
        </>
      ) : (
        <div className="gt-monthly-empty">
          <FileText size={31} strokeWidth={1.4} />
          <h3>{busy ? '正在整理本月工作总结' : '让办结工作留下完整记录'}</h3>
          <p>
            {busy
              ? '模型正在归纳已留痕事项的处理流程与结果，完成后会自动存储在本月。'
              : ready.length
                ? `已有 ${ready.length} 份有效留痕，可以生成本月工作总结。`
                : '事项办结并生成工作留痕后，即可在这里汇总月报。'}
          </p>
        </div>
      )}
      <p className="gt-monthly-scope">
        可汇总 {ready.length} 份有效留痕
        {waiting.length ? `，另有 ${waiting.length} 份待生成或需重试` : ''}
        。模型只整理已记录的流程与结果，汇报前请核对。
      </p>
    </section>
  );
}

export default function GovernanceTerminal({
  modelId,
  modelName,
  demo = false,
  onOpenIssue,
  onOpenWorkspace,
}: GovernanceTerminalProps) {
  const [month, setMonth] = useState(currentMonth);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<RecordFilter>('all');
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [recordBusy, setRecordBusy] = useState<Set<string>>(new Set());
  const [monthlyBusy, setMonthlyBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const requests = useRef(new Set<AbortController>());
  const { overview, loading, error, refresh } = useGovernanceOverview(modelId, month);
  useEffect(() => {
    const activeRequests = requests.current;
    return () => {
      activeRequests.forEach((controller) => controller.abort());
      activeRequests.clear();
    };
  }, [modelId, month]);
  const selectMonth = (value: string) => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return;
    setMonth(value);
    setQuery('');
    setFilter('all');
    setRecordBusy(new Set());
    setMonthlyBusy(false);
    setActionError('');
    setNotice('');
  };
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 6000);
    return () => clearTimeout(timer);
  }, [notice]);
  const records = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return (overview?.records || []).filter((record) => {
      if (filter === 'ready' && (record.withdrawn || record.status !== 'ready')) return false;
      if (
        filter === 'waiting' &&
        (record.withdrawn || !['pending', 'generating'].includes(record.status))
      )
        return false;
      if (filter === 'error' && (record.withdrawn || record.status !== 'error')) return false;
      if (filter === 'withdrawn' && !record.withdrawn) return false;
      return (
        !term ||
        `${record.title} ${record.category} ${record.area} ${record.report}`
          .toLocaleLowerCase()
          .includes(term)
      );
    });
  }, [overview, query, filter]);
  const retry = async (id: string) => {
    if (recordBusy.has(id)) return;
    const controller = new AbortController();
    requests.current.add(controller);
    setRecordBusy((current) => new Set([...current, id]));
    setActionError('');
    try {
      await retryWorkRecord(id, controller.signal);
      if (controller.signal.aborted) return;
      refresh();
    } catch (cause) {
      if (!controller.signal.aborted)
        setActionError(cause instanceof Error ? cause.message : '留痕任务提交失败，请重试。');
    } finally {
      requests.current.delete(controller);
      if (!controller.signal.aborted)
        setRecordBusy((current) => new Set([...current].filter((value) => value !== id)));
    }
  };
  const generate = async () => {
    if (monthlyBusy) return;
    const controller = new AbortController();
    requests.current.add(controller);
    setMonthlyBusy(true);
    setActionError('');
    try {
      const result = await generateMonthlyReport(modelId, month, controller.signal);
      if (controller.signal.aborted) return;
      refresh();
      setNotice(
        result.status === 'ready' && !result.stale
          ? '本月总结已是最新，无需重复整理。'
          : '月报整理任务已提交，完成后会自动保存。',
      );
    } catch (cause) {
      if (!controller.signal.aborted)
        setActionError(cause instanceof Error ? cause.message : '月报任务提交失败，请重试。');
    } finally {
      requests.current.delete(controller);
      if (!controller.signal.aborted) setMonthlyBusy(false);
    }
  };
  return (
    <main className="gt-terminal">
      <div className="gt-page-inner">
        <div className="gt-page-heading">
          <div>
            <h1>智慧治理终端</h1>
            <p>
              <MapPin size={15} />
              {modelName}
              {demo && <span className="gt-demo-label">模拟数据</span>}
              <span className="gt-heading-description">从事项办结，到工作留痕与治理研判</span>
            </p>
          </div>
          <div className="gt-heading-actions">
            <label className="gt-month-picker">
              <span>工作月份</span>
              <input
                type="month"
                value={month}
                min="2000-01"
                max={currentMonth()}
                onChange={(event) => selectMonth(event.target.value)}
              />
            </label>
            <button
              className="gt-icon-button"
              type="button"
              onClick={refresh}
              aria-label="刷新治理数据"
              title="刷新治理数据"
            >
              <RefreshCw size={17} />
            </button>
            {onOpenWorkspace && (
              <button
                className="gt-button gt-button-plain gt-back-workspace"
                type="button"
                onClick={onOpenWorkspace}
              >
                <ArrowLeft size={15} />
                事件工作台
              </button>
            )}
          </div>
        </div>
        {error && (
          <div className="gt-service-error" role="alert">
            <CircleAlert size={17} />
            <p>
              {error}
              {overview && ' 当前保留上次读取的数据。'}
            </p>
            <button type="button" className="gt-text-button" onClick={refresh}>
              重新连接
            </button>
          </div>
        )}
        {actionError && (
          <div className="gt-service-error" role="alert">
            <CircleAlert size={17} />
            <p>{actionError}</p>
            <button type="button" className="gt-text-button" onClick={() => setActionError('')}>
              关闭提示
            </button>
          </div>
        )}
        {notice && (
          <p className="gt-notice" role="status">
            <Check size={16} />
            {notice}
          </p>
        )}
        {loading && (
          <div className="gt-loading" role="status">
            <LoaderCircle size={23} className="gt-spin" />
            <p>正在读取本村办理记录…</p>
          </div>
        )}
        {!loading && !overview && (
          <div className="gt-load-empty">
            <FileText size={35} strokeWidth={1.4} />
            <h2>治理数据暂未连接</h2>
            <p>请确认 API 服务正在运行，然后重新读取当前村庄的办理记录。</p>
            <button type="button" className="gt-button gt-button-primary" onClick={refresh}>
              重新读取
            </button>
          </div>
        )}
        {overview && (
          <>
            <FactStrip facts={overview.facts} />
            {!overview.config.enabled && (
              <p className="gt-config-note">
                <CircleAlert size={16} />
                <span>
                  办结事实会持续存档。模型留痕、月报和助手需在服务端 .env.local 配置百炼 API Key
                  后启用，密钥不在浏览器中填写。
                </span>
              </p>
            )}
            <div className="gt-main-columns">
              <section className="gt-records" aria-labelledby="gt-records-heading">
                <div className="gt-section-heading">
                  <div>
                    <h2 id="gt-records-heading">
                      办结工作留痕
                      <span>
                        {overview.records.filter((record) => !record.withdrawn).length} 份
                      </span>
                    </h2>
                    <p>从事件工作台自动接收，原始流程与模型汇报一并保留。</p>
                  </div>
                </div>
                <div className="gt-record-toolbar">
                  <label className="gt-search">
                    <Search size={16} />
                    <span className="gt-sr-only">搜索办结留痕</span>
                    <input
                      type="search"
                      placeholder="搜索事项、地点或留痕内容"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                    />
                  </label>
                  <label className="gt-record-filter">
                    <span className="gt-sr-only">留痕状态</span>
                    <select
                      value={filter}
                      onChange={(event) => setFilter(event.target.value as RecordFilter)}
                    >
                      <option value="all">全部档案</option>
                      <option value="ready">已留痕</option>
                      <option value="waiting">待整理</option>
                      <option value="error">生成失败</option>
                      <option value="withdrawn">已重新打开</option>
                    </select>
                  </label>
                </div>
                <div className="gt-record-list">
                  {records.length ? (
                    records.map((record) => (
                      <WorkRecordItem
                        key={record.id}
                        record={record}
                        enabled={overview.config.enabled}
                        retrying={recordBusy.has(record.id)}
                        onRetry={(id) => void retry(id)}
                        onOpenIssue={onOpenIssue}
                      />
                    ))
                  ) : (
                    <div className="gt-records-empty">
                      <FileText size={29} strokeWidth={1.5} />
                      <h3>
                        {overview.records.length ? '没有符合条件的档案' : '本月还没有办结档案'}
                      </h3>
                      <p>
                        {overview.records.length
                          ? '可以调整搜索内容或留痕状态。'
                          : '事项在工作台办结后，会自动进入这里，整理流程与结果。'}
                      </p>
                      {overview.records.length > 0 && (
                        <button
                          type="button"
                          className="gt-text-button"
                          onClick={() => {
                            setQuery('');
                            setFilter('all');
                          }}
                        >
                          清除筛选
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <p className="gt-records-footnote">
                  本页月份按办结时间归档；重新打开的事项保留历史档案。
                </p>
              </section>
              <MonthlyDocument
                overview={overview}
                modelName={modelName}
                generating={monthlyBusy}
                onGenerate={() => void generate()}
                onOpenIssue={onOpenIssue}
                onNotice={setNotice}
              />
            </div>
            <Distribution facts={overview.facts} onOpenIssue={onOpenIssue} />
            <footer className="gt-data-footer">
              <p>
                原始事实来自当前村庄事件记录 · 数据截至 {terminalDate(overview.facts.generatedAt)}
              </p>
              {!!overview.facts.limitations.length && (
                <details>
                  <summary>统计范围与数据说明</summary>
                  <ul>
                    {overview.facts.limitations.map((item, index) => (
                      <li key={index}>{item}</li>
                    ))}
                  </ul>
                </details>
              )}
            </footer>
          </>
        )}
      </div>
      <button
        className="gt-assistant-launcher"
        type="button"
        aria-label="打开村庄治理分析助手"
        title="打开村庄治理分析助手"
        onClick={() => setAssistantOpen(true)}
      >
        <Bot size={25} />
      </button>
      <AssistantDrawer
        key={`${modelId}:${month}`}
        open={assistantOpen}
        modelId={modelId}
        modelName={modelName}
        month={month}
        overview={overview}
        onClose={() => setAssistantOpen(false)}
        onOpenIssue={onOpenIssue}
      />
    </main>
  );
}
