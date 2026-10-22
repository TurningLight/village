import { Issue } from '../types';
import { createLocation } from '../lib/coordinate';

// 8个预置的环境治理问题
export const mockIssues: Issue[] = [
  {
    id: 'issue-001',
    title: '村口道路局部破损',
    category: '道路破损',
    severity: 'medium',
    status: 'pending',
    description: '村委会门口道路出现多处裂缝和坑洼,影响村民出行安全,雨天易积水',
    location: createLocation({ x: -8, y: 0, z: -42 }),
    area: '村口区域',
    createdAt: '2026-10-15T09:30:00Z',
    updatedAt: '2026-10-15T09:30:00Z',
    reporter: '村民李大爷',
    history: [
      {
        time: '2026-10-15T09:30:00Z',
        status: 'pending',
        operator: '村民李大爷',
        note: '问题已上报',
      },
    ],
  },

  {
    id: 'issue-002',
    title: '东部路灯故障',
    category: '设施故障',
    severity: 'high',
    status: 'pending',
    description: '东侧主要路段路灯已连续三天不亮,夜间照明严重不足,存在安全隐患',
    location: createLocation({ x: 35, y: 0, z: -25 }),
    area: '东部住宅区',
    createdAt: '2026-10-12T20:15:00Z',
    updatedAt: '2026-10-12T20:15:00Z',
    reporter: '村民王女士',
    history: [
      {
        time: '2026-10-12T20:15:00Z',
        status: 'pending',
        operator: '村民王女士',
        note: '路灯不亮,影响夜间出行',
      },
    ],
  },

  {
    id: 'issue-003',
    title: '河道旁垃圾堆放',
    category: '垃圾堆放',
    severity: 'high',
    status: 'processing',
    description: '东侧河道旁有建筑垃圾和生活垃圾混合堆放,影响环境卫生和水质',
    location: createLocation({ x: 52, y: 0, z: -8 }),
    area: '东部住宅区',
    createdAt: '2026-10-10T14:20:00Z',
    updatedAt: '2026-10-18T10:00:00Z',
    reporter: '环境巡查员',
    history: [
      {
        time: '2026-10-10T14:20:00Z',
        status: 'pending',
        operator: '环境巡查员',
        note: '发现河道垃圾堆放问题',
      },
      {
        time: '2026-10-18T10:00:00Z',
        status: 'processing',
        operator: '村委工作人员',
        note: '已安排清理队伍,预计三天内完成',
      },
    ],
  },

  {
    id: 'issue-004',
    title: '部分路段积水',
    category: '积水问题',
    severity: 'medium',
    status: 'pending',
    description: '西部住宅区部分路段地势较低,雨后长时间积水,排水系统需要改善',
    location: createLocation({ x: -38, y: 0, z: -20 }),
    area: '西部住宅区',
    createdAt: '2026-10-14T08:45:00Z',
    updatedAt: '2026-10-14T08:45:00Z',
    reporter: '村民张师傅',
    history: [
      {
        time: '2026-10-14T08:45:00Z',
        status: 'pending',
        operator: '村民张师傅',
        note: '雨后积水严重,持续2天未消退',
      },
    ],
  },

  {
    id: 'issue-005',
    title: '公共广场设施损坏',
    category: '设施故障',
    severity: 'low',
    status: 'completed',
    description: '活动中心广场的部分健身器材出现生锈和松动,需要维修或更换',
    location: createLocation({ x: -18, y: 0, z: -5 }),
    area: '中部核心区',
    createdAt: '2026-10-05T16:30:00Z',
    updatedAt: '2026-10-16T14:00:00Z',
    reporter: '活动中心管理员',
    history: [
      {
        time: '2026-10-05T16:30:00Z',
        status: 'pending',
        operator: '活动中心管理员',
        note: '发现健身器材损坏',
      },
      {
        time: '2026-10-08T09:00:00Z',
        status: 'processing',
        operator: '维修队',
        note: '开始检修和加固',
      },
      {
        time: '2026-10-16T14:00:00Z',
        status: 'completed',
        operator: '维修队',
        note: '器材维修完成,重新涂漆加固',
      },
    ],
  },

  {
    id: 'issue-006',
    title: '闲置地块环境杂乱',
    category: '环境杂乱',
    severity: 'medium',
    status: 'pending',
    description: '中部区域一块闲置场地杂草丛生,堆放杂物,影响整体村容村貌',
    location: createLocation({ x: 10, y: 0, z: 8 }),
    area: '中部核心区',
    createdAt: '2026-10-13T11:00:00Z',
    updatedAt: '2026-10-13T11:00:00Z',
    reporter: '村委巡查',
    history: [
      {
        time: '2026-10-13T11:00:00Z',
        status: 'pending',
        operator: '村委巡查',
        note: '闲置地块需要整理',
      },
    ],
  },

  {
    id: 'issue-007',
    title: '垃圾收集点设置不合理',
    category: '设施缺失',
    severity: 'medium',
    status: 'processing',
    description: '北部区域缺少垃圾分类收集点,村民需走远路扔垃圾,部分垃圾随意丢弃',
    location: createLocation({ x: -25, y: 0, z: 33 }),
    area: '北部区域',
    createdAt: '2026-10-11T10:20:00Z',
    updatedAt: '2026-10-17T15:30:00Z',
    reporter: '村民代表',
    history: [
      {
        time: '2026-10-11T10:20:00Z',
        status: 'pending',
        operator: '村民代表',
        note: '反映北部垃圾收集不便',
      },
      {
        time: '2026-10-17T15:30:00Z',
        status: 'processing',
        operator: '村委规划组',
        note: '已制定垃圾收集点设置方案,待采购设施',
      },
    ],
  },

  {
    id: 'issue-008',
    title: '道路旁缺少休憩设施',
    category: '设施缺失',
    severity: 'low',
    status: 'pending',
    description: '主干道旁缺少长椅和遮阳设施,老年人行走中途缺少休息场所',
    location: createLocation({ x: -4, y: 0, z: 18 }),
    area: '中部核心区',
    createdAt: '2026-10-09T14:50:00Z',
    updatedAt: '2026-10-09T14:50:00Z',
    reporter: '老年协会',
    history: [
      {
        time: '2026-10-09T14:50:00Z',
        status: 'pending',
        operator: '老年协会',
        note: '建议增加休憩设施',
      },
    ],
  },
];
