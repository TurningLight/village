import { RenovationPlan } from '../types';
import { createLocation } from '../lib/coordinate';

export const mockRenovations: RenovationPlan[] = [
  {
    id: 'renovation-001',
    name: '路灯修复与照明提升',
    issueId: 'issue-002',
    targetArea: '东部住宅区',
    description: '修复故障路灯,更换LED灯头,提升夜间照明效果',
    beforeState: '路灯故障,夜间无照明',
    afterState: '路灯恢复正常,LED灯头节能明亮',
    location: createLocation({ x: 35, y: 0, z: -25 }),
  },

  {
    id: 'renovation-002',
    name: '公共活动空间优化',
    issueId: 'issue-005',
    targetArea: '中部核心区',
    description: '增加休憩长椅、树木绿化和地面铺装,改善公共活动场地',
    beforeState: '场地简单,休憩设施不足,缺少绿化',
    afterState: '增设长椅、树木,铺装整洁,休憩环境改善',
    location: createLocation({ x: -25, y: 0, z: -5 }),
  },

  {
    id: 'renovation-003',
    name: '垃圾收集点规范化改造',
    issueId: 'issue-007',
    targetArea: '北部区域',
    description: '设置规范的分类垃圾收集点,增加标识,美化周围环境',
    beforeState: '收集设施混乱,存在垃圾堆放',
    afterState: '规范分类收集设施,环境整洁有序',
    location: createLocation({ x: -25, y: 0, z: 33 }),
  },
];
