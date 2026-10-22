import { useRef, useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  MapPin,
  Clock3,
  CheckCircle2,
  ClipboardCheck,
  X,
  UserRound,
} from 'lucide-react';
import type { Issue } from '../../types';
import { STATUS_LABELS, formatTime } from '../domain/report';
import MobileMap from '../components/MobileMap';
import type { SharedVillageMap } from '../../lib/sharedMapTypes';
export default function IssueDetail({ issues, map }: { issues: Issue[]; map: SharedVillageMap }) {
  const { id } = useParams(),
    issue = issues.find((i) => i.id === id),
    navigate = useNavigate(),
    [photo, setPhoto] = useState<string | null>(null),
    dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (photo) dialog.current?.showModal();
    else dialog.current?.close();
  }, [photo]);
  if (!issue)
    return (
      <div className="m-page">
        <Link to="/mobile/progress" className="m-text-button">
          <ArrowLeft size={18} />
          返回办理进度
        </Link>
        <div className="m-empty">
          <h1>暂未找到这条记录</h1>
          <p>记录可能在其他浏览器，或已被管理员移除。</p>
        </div>
      </div>
    );
  return (
    <article className="m-page m-detail">
      <button onClick={() => navigate(-1)} className="m-text-button">
        <ArrowLeft size={19} />
        返回
      </button>
      <div className={`m-detail-status ${issue.status}`}>
        <CheckCircle2 size={20} />
        <strong>{STATUS_LABELS[issue.status]}</strong>
        <span>
          {issue.status === 'pending'
            ? '村里收到后将按流程受理'
            : issue.status === 'processing'
              ? '正在跟进，请留意进度更新'
              : '事情已办好，感谢你的参与'}
        </span>
      </div>
      <span className="m-detail-category">{issue.category}</span>
      <h1>{issue.title}</h1>
      <p className="m-detail-description">{issue.description || '上报人未补充说明。'}</p>
      {!!issue.images?.length && (
        <div className="m-detail-photos">
          {issue.images.map((src, i) => (
            <button key={i} onClick={() => setPhoto(src)} aria-label={`查看现场照片${i + 1}`}>
              <img src={src} alt={`现场照片${i + 1}`} />
            </button>
          ))}
        </div>
      )}
      <div className="m-detail-facts">
        <p>
          <MapPin size={17} />
          <span>上报位置</span>
          <strong>{issue.area}</strong>
        </p>
        <p>
          <Clock3 size={17} />
          <span>上报时间</span>
          <strong>{formatTime(issue.createdAt)}</strong>
        </p>
        <p>
          <UserRound size={17} />
          <span>上报人</span>
          <strong>{issue.residentId ? '村民' : issue.reporter}</strong>
        </p>
      </div>
      <MobileMap
        map={map}
        point={issue.location.local}
        anchor={issue.projectionAnchor}
        issues={[issue]}
      />
      {issue.projectionAnchor && (
        <p className="m-form-help">位置来自实景二维底图选点，未作真实经纬度配准。</p>
      )}
      <h2 className="m-timeline-title">事情办到哪了</h2>
      <ol className="m-timeline">
        {issue.history.map((entry, i) => (
          <li
            key={`${entry.time}-${i}`}
            className={i === issue.history.length - 1 ? 'current' : ''}
          >
            <span className="m-timeline-dot">
              <ClipboardCheck size={14} />
            </span>
            <div>
              <strong>
                {i === 0
                  ? '问题已上报'
                  : entry.status === 'completed'
                    ? '办理完成'
                    : entry.status === 'processing'
                      ? '正在处理'
                      : '重新受理'}
              </strong>
              <time>{formatTime(entry.time)}</time>
              <p>{entry.note}</p>
              <small>{entry.operator}</small>
            </div>
          </li>
        ))}
      </ol>
      <p className="m-demo-note">编号 {issue.id.slice(-12).toUpperCase()} · 村庄共治记录</p>
      <dialog
        ref={dialog}
        className="m-photo-dialog"
        onCancel={(e) => {
          e.preventDefault();
          setPhoto(null);
        }}
      >
        <button aria-label="关闭照片" className="m-photo-close" onClick={() => setPhoto(null)}>
          <X />
        </button>
        {photo && <img src={photo} alt="现场照片大图" />}
      </dialog>
    </article>
  );
}
