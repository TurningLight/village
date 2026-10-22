import { Link, useParams } from 'react-router-dom';
import { Check, ArrowRight } from 'lucide-react';
import type { Issue } from '../../types';
export default function Success({ issues }: { issues: Issue[] }) {
  const { id } = useParams(),
    issue = issues.find((i) => i.id === id);
  return (
    <div className="m-success">
      <span className="m-success-mark">
        <Check size={40} strokeWidth={2} />
      </span>
      <h1>已收到你的上报</h1>
      <p>
        谢谢你为村里多留一份心。
        <br />
        村里将按流程受理，进展随时可查。
      </p>
      {issue && (
        <div className="m-receipt">
          <span>你的上报</span>
          <strong>{issue.title}</strong>
          <p>编号 {issue.id.slice(-12).toUpperCase()}</p>
          <span className="m-status pending">等待受理</span>
        </div>
      )}
      <Link className="m-button full" to={`/mobile/issues/${id}`}>
        查看办理进度
        <ArrowRight size={18} />
      </Link>
      <Link className="m-text-button" to="/mobile">
        回到首页
      </Link>
    </div>
  );
}
