import { Building, Vector3D } from '../types';
import { createLocation } from '../lib/coordinate';

// 建筑布局数据 - 精心设计的乡村空间结构
// 坐标系: X轴东西, Z轴南北, Y轴高度
// 村庄大小约120m × 100m

export const buildingPositions: Array<{
  id: string;
  name: string;
  type: Building['type'];
  position: Vector3D;
  size: { width: number; depth: number; height: number };
  rotation: number; // 旋转角度
  color: string; // 颜色标识
  area: string;
}> = [
  // === 村口区域 (南部) ===
  {
    id: 'building-01',
    name: '村委会',
    type: 'public',
    position: { x: 0, y: 0, z: -45 },
    size: { width: 15, depth: 10, height: 6 },
    rotation: 0,
    color: '#E8C4A0',
    area: '村口区域',
  },

  // === 东部住宅区 ===
  {
    id: 'building-02',
    name: '东1号民居',
    type: 'residential',
    position: { x: 35, y: 0, z: -35 },
    size: { width: 10, depth: 8, height: 5 },
    rotation: Math.PI / 6,
    color: '#D4B8A0',
    area: '东部住宅区',
  },
  {
    id: 'building-03',
    name: '东2号民居',
    type: 'residential',
    position: { x: 48, y: 0, z: -30 },
    size: { width: 9, depth: 7, height: 4.5 },
    rotation: -Math.PI / 8,
    color: '#C8ADA0',
    area: '东部住宅区',
  },
  {
    id: 'building-04',
    name: '东3号民居',
    type: 'residential',
    position: { x: 40, y: 0, z: -18 },
    size: { width: 11, depth: 9, height: 5.5 },
    rotation: Math.PI / 4,
    color: '#D9C4B0',
    area: '东部住宅区',
  },
  {
    id: 'building-05',
    name: '东4号民居',
    type: 'residential',
    position: { x: 52, y: 0, z: -12 },
    size: { width: 8, depth: 7, height: 4 },
    rotation: 0,
    color: '#C5B0A0',
    area: '东部住宅区',
  },
  {
    id: 'building-06',
    name: '东5号民居',
    type: 'residential',
    position: { x: 45, y: 0, z: 2 },
    size: { width: 10, depth: 8, height: 5 },
    rotation: -Math.PI / 6,
    color: '#D0BBA8',
    area: '东部住宅区',
  },

  // === 西部住宅区 ===
  {
    id: 'building-07',
    name: '西1号民居',
    type: 'residential',
    position: { x: -35, y: 0, z: -32 },
    size: { width: 9, depth: 8, height: 4.5 },
    rotation: -Math.PI / 5,
    color: '#C8B4A0',
    area: '西部住宅区',
  },
  {
    id: 'building-08',
    name: '西2号民居',
    type: 'residential',
    position: { x: -48, y: 0, z: -28 },
    size: { width: 10, depth: 7, height: 5 },
    rotation: Math.PI / 7,
    color: '#D5C0A8',
    area: '西部住宅区',
  },
  {
    id: 'building-09',
    name: '西3号民居',
    type: 'residential',
    position: { x: -40, y: 0, z: -15 },
    size: { width: 11, depth: 9, height: 5.5 },
    rotation: -Math.PI / 4,
    color: '#C0ACA0',
    area: '西部住宅区',
  },
  {
    id: 'building-10',
    name: '西4号民居',
    type: 'residential',
    position: { x: -50, y: 0, z: -8 },
    size: { width: 8, depth: 7, height: 4 },
    rotation: 0,
    color: '#CEBAA0',
    area: '西部住宅区',
  },
  {
    id: 'building-11',
    name: '西5号民居',
    type: 'residential',
    position: { x: -42, y: 0, z: 5 },
    size: { width: 9, depth: 8, height: 4.5 },
    rotation: Math.PI / 6,
    color: '#D2BDA8',
    area: '西部住宅区',
  },

  // === 中部核心区 ===
  {
    id: 'building-12',
    name: '中1号民居',
    type: 'residential',
    position: { x: -15, y: 0, z: -25 },
    size: { width: 10, depth: 8, height: 5 },
    rotation: 0,
    color: '#D8C8B0',
    area: '中部核心区',
  },
  {
    id: 'building-13',
    name: '中2号民居',
    type: 'residential',
    position: { x: 15, y: 0, z: -22 },
    size: { width: 9, depth: 7, height: 4.5 },
    rotation: Math.PI / 8,
    color: '#CCB8A0',
    area: '中部核心区',
  },
  {
    id: 'building-14',
    name: '中3号民居',
    type: 'residential',
    position: { x: -8, y: 0, z: -10 },
    size: { width: 11, depth: 9, height: 5.5 },
    rotation: -Math.PI / 7,
    color: '#D4C0A8',
    area: '中部核心区',
  },
  {
    id: 'building-15',
    name: '中4号民居',
    type: 'residential',
    position: { x: 18, y: 0, z: -8 },
    size: { width: 10, depth: 8, height: 5 },
    rotation: Math.PI / 5,
    color: '#C8B4A0',
    area: '中部核心区',
  },

  // === 北部区域 ===
  {
    id: 'building-16',
    name: '北1号民居',
    type: 'residential',
    position: { x: -25, y: 0, z: 20 },
    size: { width: 9, depth: 8, height: 4.5 },
    rotation: 0,
    color: '#D0BCA8',
    area: '北部区域',
  },
  {
    id: 'building-17',
    name: '北2号民居',
    type: 'residential',
    position: { x: 10, y: 0, z: 25 },
    size: { width: 10, depth: 7, height: 5 },
    rotation: -Math.PI / 6,
    color: '#C6B2A0',
    area: '北部区域',
  },
  {
    id: 'building-18',
    name: '北3号民居',
    type: 'residential',
    position: { x: -10, y: 0, z: 35 },
    size: { width: 8, depth: 7, height: 4 },
    rotation: Math.PI / 4,
    color: '#D6C2A8',
    area: '北部区域',
  },

  // === 公共设施 ===
  {
    id: 'building-19',
    name: '活动中心',
    type: 'public',
    position: { x: -18, y: 0, z: 5 },
    size: { width: 12, depth: 10, height: 5 },
    rotation: 0,
    color: '#E0CCA8',
    area: '中部核心区',
  },
  {
    id: 'building-20',
    name: '小卖部',
    type: 'commercial',
    position: { x: 8, y: 0, z: -38 },
    size: { width: 6, depth: 5, height: 3.5 },
    rotation: 0,
    color: '#A8C4D8',
    area: '村口区域',
  },
];

// 转换为完整的Building对象
export const buildings: Building[] = buildingPositions.map((b) => ({
  id: b.id,
  name: b.name,
  type: b.type,
  location: createLocation(b.position),
  area: b.area,
  status: '正常使用',
  relatedIssues: [],
}));

// 其他空间元素的位置数据

// 道路节点 - 用于构建道路网络
export const roadNodes: Vector3D[] = [
  // 主道路 - 南北贯穿
  { x: 0, y: 0, z: -50 }, // 村口
  { x: 0, y: 0, z: -35 },
  { x: 0, y: 0, z: -15 },
  { x: 0, y: 0, z: 5 },
  { x: 0, y: 0, z: 25 },
  { x: 0, y: 0, z: 42 }, // 北端

  // 东西支路
  { x: -40, y: 0, z: -35 },
  { x: 40, y: 0, z: -35 },
  { x: -35, y: 0, z: -15 },
  { x: 35, y: 0, z: -15 },
  { x: -30, y: 0, z: 5 },
  { x: 30, y: 0, z: 5 },
  { x: -25, y: 0, z: 25 },
  { x: 25, y: 0, z: 25 },
];

// Stable geometry across renders, reloads and map conversions.
export const treePositions: Vector3D[] = Array.from({ length: 60 }, (_, i) => {
  const angle = (i * Math.PI * 2) / 60;
  const radius = 68 + (i % 4) * 2.5;
  return { x: Math.cos(angle) * radius, y: 0, z: Math.sin(angle) * radius * 0.82 };
}).filter((p) =>
  buildingPositions.every((b) => Math.hypot(p.x - b.position.x, p.z - b.position.z) > 10),
);

// 路灯位置
export const streetLightPositions: Vector3D[] = [
  { x: -5, y: 0, z: -45 },
  { x: 5, y: 0, z: -35 },
  { x: -5, y: 0, z: -25 },
  { x: 5, y: 0, z: -15 },
  { x: -5, y: 0, z: -5 },
  { x: 5, y: 0, z: 5 },
  { x: -5, y: 0, z: 15 },
  { x: 5, y: 0, z: 25 },
  { x: 35, y: 0, z: -25 }, // 东侧路灯(故障)
  { x: -35, y: 0, z: -25 },
];

// 农田区域 (矩形区域定义)
export const farmlandAreas = [
  { center: { x: 25, y: 0, z: 40 }, width: 30, depth: 15 },
  { center: { x: -48, y: 0, z: 40 }, width: 25, depth: 18 },
  { center: { x: 84, y: 0, z: 15 }, width: 15, depth: 25 },
  { center: { x: -65, y: 0, z: 0 }, width: 18, depth: 22 },
];

// 河道路径
export const riverPath: Vector3D[] = [
  { x: 70, y: 0, z: -55 },
  { x: 68, y: 0, z: -30 },
  { x: 67, y: 0, z: -10 },
  { x: 68, y: 0, z: 10 },
  { x: 72, y: 0, z: 30 },
  { x: 74, y: 0, z: 55 },
];

// 公共活动广场
export const squareArea = {
  center: { x: -25, y: 0, z: -5 },
  width: 14,
  depth: 8,
};

// 待更新场地
export const renovationSite = {
  center: { x: 10, y: 0, z: 8 },
  width: 15,
  depth: 12,
};

// Shared spatial objects: these exact paths and extents drive both renderers.
export const roads: import('../types').Road[] = [
  {
    id: 'road-main',
    name: '青禾路',
    width: 7,
    points: [
      { x: 0, y: 0, z: -56 },
      { x: 0, y: 0, z: 48 },
    ],
  },
  ...[-35, -15, 5, 25].map((z, i) => ({
    id: `road-branch-${i}`,
    name: `村巷${i + 1}`,
    width: 4,
    points: [
      { x: -56, y: 0, z },
      { x: 58, y: 0, z },
    ],
  })),
  ...buildingPositions.map((b) => {
    const z = [-35, -15, 5, 25].reduce((a, c) =>
      Math.abs(c - b.position.z) < Math.abs(a - b.position.z) ? c : a,
    );
    return {
      id: `lane-${b.id}`,
      name: `${b.name}入户路`,
      width: 1.6,
      points: [
        { x: b.position.x, y: 0, z },
        { x: b.position.x, y: 0, z: b.position.z },
      ],
    };
  }),
];
export const fields: import('../types').Field[] = farmlandAreas.map((f, i) => ({
  ...f,
  id: `field-${i}`,
  name: `农田${i + 1}`,
}));
export const waterBodies: import('../types').WaterBody[] = [
  { id: 'water-01', name: '青禾渠', width: 5, points: riverPath },
];
export const facilities: import('../types').Facility[] = [
  ...streetLightPositions.map((p, i) => ({
    id: `light-${i}`,
    name: `路灯${i + 1}`,
    kind: 'light' as const,
    location: createLocation(p),
  })),
  {
    id: 'square-01',
    name: '公共活动广场',
    kind: 'square',
    location: createLocation(squareArea.center),
  },
  {
    id: 'waste-01',
    name: '分类收集点',
    kind: 'waste',
    location: createLocation({ x: -25, y: 0, z: 33 }),
  },
  {
    id: 'bench-01',
    name: '村口休憩长椅',
    kind: 'bench',
    location: createLocation({ x: 10, y: 0, z: -48 }),
  },
];
