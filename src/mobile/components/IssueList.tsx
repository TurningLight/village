import { Link } from 'react-router-dom';
import { MapPin, ChevronRight, ClipboardList } from 'lucide-react';
import type { Issue } from '../../types';
import { STATUS_LABELS, formatTime } from '../domain/report';
import { categoryIcons } from './categoryIcons';
export function IssueRow({ issue }: { issue: Issue }) {
  const Icon = categoryIcons[issue.category] || ClipboardList;
  return (
    <Link className="m-issue-row" to={`/mobile/issues/${issue.id}`}>
      {issue.images?.[0] ? (
        <img src={issue.images[0]} alt="现场照片" className="m-issue-thumbnail" loading="lazy" />
      ) : (
        <div className="m-category-icon">
          <Icon size={24} strokeWidth={1.6} />
        </div>
      )}
      <div className="m-issue-copy">
        <div className="m-issue-top">
          <span className={`m-status ${issue.status}`}>{STATUS_LABELS[issue.status]}</span>
          <time>{formatTime(issue.createdAt)}</time>
        </div>
        <h3>{issue.title}</h3>
        <p>
          <MapPin size={12} />
          {issue.area}
        </p>
      </div>
      <ChevronRight className="m-row-arrow" size={16} />
    </Link>
  );
}
export default function IssueList({
  issues,
  emptyTitle = '还没有相关记录',
  emptyDescription = '发现村里的小问题，可以随手告诉我们。',
}: {
  issues: Issue[];
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  return issues.length ? (
    <div className="m-issue-list">
      {issues.map((issue) => (
        <IssueRow key={issue.id} issue={issue} />
      ))}
    </div>
  ) : (
    <div className="m-empty">
      <ClipboardList size={34} strokeWidth={1.4} />
      <h3>{emptyTitle}</h3>
      <p>{emptyDescription}</p>
      <Link to="/mobile/report" className="m-button small">
        去上报一件事
      </Link>
    </div>
  );
}
