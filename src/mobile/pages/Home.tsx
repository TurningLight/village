import { Link } from 'react-router-dom';
import { Plus, ArrowUpRight, Mic, ArrowRight, CheckCheck, Map } from 'lucide-react';
import type { Issue } from '../../types';
import IssueList from '../components/IssueList';
import type { SharedVillageMap } from '../../lib/sharedMapTypes';
export default function Home({ issues, map }: { issues: Issue[]; map: SharedVillageMap }) {
  const pending = issues.filter((i) => i.status === 'pending').length,
    processing = issues.filter((i) => i.status === 'processing').length,
    completed = issues.filter((i) => i.status === 'completed').length;
  const recent = [...issues]
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, 3);
  return (
    <>
      <section className="m-home-intro">
        <h1>
          家门口的事，
          <br />
          一起办好。
        </h1>
        <p>
          记录身边的小问题，
          <br />
          让我们的村庄一天天变好。
        </p>
      </section>
      <Link to="/mobile/report" className="m-report-entry">
        <div>
          <span className="m-entry-icon">
            <Plus size={24} />
          </span>
          <h2>随手报一件事</h2>
          <p>拍张照，说两句，把事情交给村里。</p>
          <span className="m-voice-tag">
            <Mic size={14} />
            支持语音填写
          </span>
        </div>
        <ArrowUpRight size={28} strokeWidth={1.6} />
      </Link>
      <div className="m-village-pulse" aria-label="村庄办理情况">
        <div>
          <strong>{pending}</strong>
          <span>
            <i className="pending" />
            待受理
          </span>
        </div>
        <div>
          <strong>{processing}</strong>
          <span>
            <i className="processing" />
            处理中
          </span>
        </div>
        <div>
          <strong>{completed}</strong>
          <span>
            <i className="completed" />
            已办结
          </span>
        </div>
      </div>
      {map.kind === 'real' && (
        <Link to="/mobile/progress?view=map" className="m-real-map-entry">
          {map.projection ? (
            <img src={map.projection.imageUrl} alt={`${map.name}实景二维底图缩略图`} />
          ) : (
            <span className="m-real-map-icon">
              <Map size={28} />
            </span>
          )}
          <span>
            <strong>看看村里的实景地图</strong>
            <small>
              {map.projection ? '查看底图，找到问题发生的位置' : '等待管理端共享二维底图'}
            </small>
          </span>
          <ArrowRight size={18} />
        </Link>
      )}
      <section className="m-feed">
        <div className="m-section-heading">
          <h2>村里正在办</h2>
          <Link to="/mobile/progress">
            全部进度
            <ArrowRight size={15} />
          </Link>
        </div>
        <IssueList issues={recent} />
      </section>
      <div className="m-kind-note">
        <CheckCheck size={18} />
        <p>每一条上报，都能在办理进度里找到回响。</p>
      </div>
      <p className="m-demo-note">
        {map.name}
        {map.kind === 'demo' ? ' · 示意地图' : ' · 实景模型投影'} · 共同参与，让家乡更好
      </p>
    </>
  );
}
