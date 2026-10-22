// 空间坐标定义
export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface GeoCoordinate {
  lng: number;
  lat: number;
}

// 位置信息 - 同时包含本地坐标和地理坐标
export interface Location {
  local: Vector3D; // 本地Three.js坐标
  geo: GeoCoordinate; // 地理坐标(用于地图显示)
}

// 建筑类型
export type BuildingType = 'residential' | 'public' | 'commercial';

// 建筑信息
export interface Building {
  id: string;
  name: string;
  type: BuildingType;
  location: Location;
  area: string; // 所属片区
  status: string; // 使用状态
  relatedIssues: string[]; // 关联问题ID
}

export interface Road {
  id: string;
  name: string;
  width: number;
  points: Vector3D[];
}
export interface Field {
  id: string;
  name: string;
  center: Vector3D;
  width: number;
  depth: number;
}
export interface WaterBody {
  id: string;
  name: string;
  width: number;
  points: Vector3D[];
}
export interface Facility {
  id: string;
  name: string;
  kind: 'light' | 'square' | 'waste' | 'bench';
  location: Location;
}
export type SpatialLayer = 'roads' | 'fields' | 'water' | 'facilities';

// 问题类型
export type IssueCategory =
  '道路破损' | '设施故障' | '垃圾堆放' | '积水问题' | '设施缺失' | '环境杂乱' | '其他';

// 严重程度
export type IssueSeverity = 'low' | 'medium' | 'high';

// 处理状态
export type IssueStatus = 'pending' | 'processing' | 'completed';

// 处理记录
export interface IssueHistory {
  time: string;
  status: IssueStatus;
  operator: string;
  note: string;
}

// 环境问题
export interface Issue {
  id: string;
  title: string;
  category: IssueCategory;
  severity: IssueSeverity;
  status: IssueStatus;
  description: string;
  location: Location;
  area: string;
  createdAt: string;
  updatedAt: string;
  reporter: string;
  history: IssueHistory[];
  images?: string[]; // 现场照片
  residentId?: string; // Local resident identity; replace with authenticated ownership when adding a backend.
  // Exact hit in the hosted or uploaded model's world space; independent of the camera.
  sceneAnchor?: {
    modelId: string;
    position: [number, number, number];
  };
  // An exact point on a particular 2D projection. Its ray must hit the model
  // before it can be treated as a measured 3D surface position.
  projectionAnchor?: {
    modelId: string;
    projectionCreatedAt: string;
    uv: [number, number];
    ray: {
      start: [number, number, number];
      end: [number, number, number];
    };
  };
}

// 微更新方案
export interface RenovationPlan {
  id: string;
  name: string;
  issueId: string;
  targetArea: string;
  description: string;
  beforeState: string;
  afterState: string;
  location: Location;
  images?: {
    before?: string;
    after?: string;
  };
}

// 村庄数据
export interface Village {
  id: string;
  name: string;
  center: Location;
  buildings: Building[];
  issues: Issue[];
  renovations: RenovationPlan[];
  roads: Road[];
  fields: Field[];
  waterBodies: WaterBody[];
  facilities: Facility[];
}

// 视图模式
export type ViewMode = '3d' | '2d' | 'split';

// 时间模式
export type TimeMode = 'day' | 'night';

// 应用状态 (Zustand)
export interface AppState {
  // 村庄数据
  village: Village | null;
  setVillage: (village: Village) => void;

  // 选中状态
  selectedBuildingId: string | null;
  selectBuilding: (id: string | null) => void;

  selectedIssueId: string | null;
  selectIssue: (id: string | null) => void;

  // 视图控制
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;

  timeMode: TimeMode;
  setTimeMode: (mode: TimeMode) => void;

  // 图层显示
  showBuildings: boolean;
  showIssues: boolean;
  showRenovations: boolean;
  toggleBuildings: () => void;
  toggleIssues: () => void;
  toggleRenovations: () => void;

  layers: Record<SpatialLayer, boolean>;
  toggleLayer: (layer: SpatialLayer) => void;
  selectionRevision: number;
  focusSelection: () => void;

  // 微更新方案
  currentRenovationId: string | null;
  setCurrentRenovation: (id: string | null) => void;

  renovationMode: 'before' | 'after';
  setRenovationMode: (mode: 'before' | 'after') => void;

  // 问题筛选
  filterCategory: IssueCategory | 'all';
  filterStatus: IssueStatus | 'all';
  setFilterCategory: (category: IssueCategory | 'all') => void;
  setFilterStatus: (status: IssueStatus | 'all') => void;

  // 问题操作
  updateIssueStatus: (id: string, status: IssueStatus, note: string) => void;
  addIssue: (issue: Omit<Issue, 'id' | 'createdAt' | 'updatedAt' | 'history'>) => Issue;
}
