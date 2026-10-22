import { memo, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Plus, ArrowUpRight, Mic, ArrowRight, Map } from 'lucide-react';
import type { Issue } from '../../types';
import IssueList from '../components/IssueList';
import type { SharedVillageMap } from '../../lib/sharedMapTypes';
function Home({ issues, map }: { issues: Issue[]; map: SharedVillageMap }) {
  const { pending, processing, completed, recent } = useMemo(() => {
    const counts = { pending: 0, processing: 0, completed: 0 };
    for (const issue of issues) counts[issue.status] += 1;
    const recent = [...issues]
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
      .slice(0, 3);
    return { ...counts, recent };
  }, [issues]);
  return (
    <>
      <section className="m-home-intro">
        <div className="m-home-welcome">
          <h1>
            家门口的事，
            <br />
            一起办好。
          </h1>
          {map.kind === 'real' && (
            <Link
              to="/mobile/progress?view=map"
              className="m-home-map"
              aria-label={`查看${map.name}实景地图`}
            >
              {map.projection ? (
                <img src={map.projection.imageUrl} alt="" width={96} height={80} />
              ) : (
                <Map size={32} />
              )}
              <span>
                实景地图
                <ArrowUpRight size={14} />
              </span>
            </Link>
          )}
        </div>
        <p>记录身边小事，让村庄一天天变好。</p>
      </section>
      <Link to="/mobile/report" className="m-report-entry">
        <div>
          <div className="m-entry-heading">
            <span className="m-entry-icon">
              <Plus size={24} />
            </span>
            <h2>随手报一件事</h2>
          </div>
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
    </>
  );
}

export default memo(Home);
