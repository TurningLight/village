import { AlarmClock, AlertCircle, Clock, CheckCircle, ListTodo } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { useEffect, useMemo, useState } from 'react';
import { BAGUA_MODEL_ID, DEMO_MODEL_ID, filteredIssues, issuesForModel } from '../../lib/issues';

const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const timeFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  hourCycle: 'h23',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

function DateTimeCard() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="stat-card stat-clock" title="北京时间">
      <div className="stat-content">
        <div>
          <p className="text-sm text-gray-600 mb-1">{dateFormatter.format(now)}</p>
          <p className="stat-value">
            <time dateTime={now.toISOString()}>{timeFormatter.format(now)}</time>
          </p>
        </div>
        <div className="stat-icon" aria-hidden="true">
          <AlarmClock size={21} />
        </div>
      </div>
    </div>
  );
}

export default function StatsCards({ modelId = BAGUA_MODEL_ID }: { modelId?: string }) {
  const village = useAppStore((state) => state.village);

  const category = useAppStore((s) => s.filterCategory);
  const status = useAppStore((s) => s.filterStatus);
  const stats = useMemo(() => {
    if (!village) {
      return {
        totalIssues: 0,
        pendingIssues: 0,
        processingIssues: 0,
        completedIssues: 0,
      };
    }

    const issues = filteredIssues(issuesForModel(village.issues, modelId), category, status);
    return {
      totalIssues: issues.length,
      pendingIssues: issues.filter((i) => i.status === 'pending').length,
      processingIssues: issues.filter((i) => i.status === 'processing').length,
      completedIssues: issues.filter((i) => i.status === 'completed').length,
    };
  }, [village, modelId, category, status]);

  const cards = [
    {
      title: '问题总数',
      value: stats.totalIssues,
      icon: AlertCircle,
      color: 'bg-purple-500',
      textColor: 'text-purple-600',
    },
    {
      title: '待处理',
      value: stats.pendingIssues,
      icon: ListTodo,
      color: 'bg-orange-500',
      textColor: 'text-orange-600',
    },
    {
      title: '处理中',
      value: stats.processingIssues,
      icon: Clock,
      color: 'bg-yellow-500',
      textColor: 'text-yellow-600',
    },
    {
      title: '已完成',
      value: stats.completedIssues,
      icon: CheckCircle,
      color: 'bg-green-500',
      textColor: 'text-green-600',
    },
  ];

  return (
    <section
      className="stats-bar"
      aria-label="当前地图治理数据概况"
      title={
        modelId === DEMO_MODEL_ID
          ? '虚构青禾村的模拟统计，事件数量跟随当前筛选条件'
          : modelId === BAGUA_MODEL_ID
            ? '以下为原有演示业务数据，并非八卦村的实际建筑与问题统计'
            : '事件仅统计当前模型；实景网格不自动识别建筑数量'
      }
    >
      <DateTimeCard />
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div key={card.title} className="stat-card">
            <div className="stat-content">
              <div>
                <p className="text-sm text-gray-600 mb-1">{card.title}</p>
                <p className="stat-value">{card.value}</p>
              </div>
              <div className={`stat-icon ${card.textColor}`}>
                <Icon size={21} />
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
}
