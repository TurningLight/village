import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, X, MapPin, AlignLeft } from 'lucide-react';
import type { Issue } from '../../types';
import IssueList from '../components/IssueList';
import MobileMap from '../components/MobileMap';
import { useNavigate } from 'react-router-dom';
import { STATUS_LABELS } from '../domain/report';
import type { SharedVillageMap } from '../../lib/sharedMapTypes';
export default function Progress({
  issues,
  residentId,
  map: villageMap,
}: {
  issues: Issue[];
  residentId: string;
  map: SharedVillageMap;
}) {
  const [params, setParams] = useSearchParams(),
    [query, setQuery] = useState(''),
    [status, setStatus] = useState('all'),
    [map, setMap] = useState(() => villageMap.kind === 'real' || params.get('view') === 'map'),
    navigate = useNavigate();
  const mine = params.get('mine') === '1';
  const scoped = issues.filter((i) => !mine || i.residentId === residentId),
    visible = scoped
      .filter(
        (i) =>
          (status === 'all' || i.status === status) &&
          (!query || `${i.title} ${i.area} ${i.description}`.includes(query)),
      )
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return (
    <div className="m-page">
      <div className="m-page-heading">
        <div>
          <h1>{mine ? '我的上报' : '办理进度'}</h1>
          <p>{mine ? '你关心的事，一路跟进。' : '村里的事，进展看得见。'}</p>
        </div>
        <button
          className="m-icon-button"
          aria-label={map ? '切换为列表' : '切换为地图'}
          onClick={() => setMap(!map)}
        >
          {map ? <AlignLeft size={21} /> : <MapPin size={21} />}
        </button>
      </div>
      <div className="m-search">
        <Search size={19} />
        <input
          aria-label="搜索问题或地点"
          placeholder="搜索问题或地点"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button aria-label="清除搜索" onClick={() => setQuery('')}>
            <X size={17} />
          </button>
        )}
      </div>
      <div className="m-filter-tabs" role="group" aria-label="按办理状态筛选">
        {['all', 'pending', 'processing', 'completed'].map((value) => (
          <button
            key={value}
            aria-pressed={status === value}
            className={status === value ? 'active' : ''}
            onClick={() => setStatus(value)}
          >
            {value === 'all' ? '全部' : STATUS_LABELS[value as keyof typeof STATUS_LABELS]}
            <span>{scoped.filter((i) => value === 'all' || i.status === value).length}</span>
          </button>
        ))}
      </div>
      <label className="m-mine-toggle">
        <input
          type="checkbox"
          checked={mine}
          onChange={(e) => setParams(e.target.checked ? { mine: '1' } : {})}
        />
        只看我的上报<span>{visible.length} 条记录</span>
      </label>
      {map && (
        <MobileMap
          map={villageMap}
          issues={visible}
          onIssue={(id) => navigate(`/mobile/issues/${id}`)}
        />
      )}
      <IssueList
        issues={visible}
        emptyTitle={query ? '没有找到相关问题' : mine ? '还没有上报记录' : '暂时没有相关问题'}
        emptyDescription={
          query ? '换个关键词或筛选条件再试试。' : '发现问题就随手报，进度会在这里更新。'
        }
      />
    </div>
  );
}
