import { Building2, AlertCircle, Clock, CheckCircle, ListTodo } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { useMemo } from 'react';
import { BAGUA_MODEL_ID, DEMO_MODEL_ID, filteredIssues, issuesForModel } from '../../lib/issues';

export default function StatsCards({ modelId = BAGUA_MODEL_ID }: { modelId?: string }) {
  const village = useAppStore((state) => state.village);

  const category = useAppStore((s) => s.filterCategory);
  const status = useAppStore((s) => s.filterStatus);
  const stats = useMemo(() => {
    if (!village) {
      return {
        buildingCount: 0,
        totalIssues: 0,
        pendingIssues: 0,
        processingIssues: 0,
        completedIssues: 0,
      };
    }

    const issues = filteredIssues(issuesForModel(village.issues, modelId), category, status);
    return {
      buildingCount: modelId === DEMO_MODEL_ID ? village.buildings.length : '—',
      totalIssues: issues.length,
      pendingIssues: issues.filter((i) => i.status === 'pending').length,
      processingIssues: issues.filter((i) => i.status === 'processing').length,
      completedIssues: issues.filter((i) => i.status === 'completed').length,
    };
  }, [village, modelId, category, status]);

  const cards = [
    {
      title: modelId === DEMO_MODEL_ID ? '村庄建筑' : '模型建筑',
      value: stats.buildingCount,
      icon: Building2,
      color: 'bg-blue-500',
      textColor: 'text-blue-600',
    },
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
