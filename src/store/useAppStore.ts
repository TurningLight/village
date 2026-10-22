import { readViewPreference, saveViewPreference } from '../lib/viewPreference';
import { create } from 'zustand';
import { AppState, Village, Issue } from '../types';
import { buildings, roads, fields, waterBodies, facilities } from '../data/villageLayout';
import { mockIssues } from '../data/mockIssues';
import { mockRenovations } from '../data/mockRenovations';
import { createLocation } from '../lib/coordinate';
import { ISSUE_CATEGORIES, validModelPoint } from '../lib/issues';
import { localIssueRepository } from '../services/issueService';

// 初始化村庄数据
const initialVillage: Village = {
  id: 'qinghe-village',
  name: '青禾村Demo',
  center: createLocation({ x: 0, y: 0, z: 0 }),
  buildings,
  roads,
  fields,
  waterBodies,
  facilities,
  issues: mockIssues,
  renovations: mockRenovations,
};

const loadIssuesFromStorage = () => localIssueRepository.read(mockIssues);
const saveIssuesToStorage = (issues: Issue[]) => localIssueRepository.write(issues);

export const useAppStore = create<AppState>((set, get) => ({
  // 初始化村庄数据
  village: {
    ...initialVillage,
    issues: loadIssuesFromStorage(),
  },
  setVillage: (village) => set({ village }),

  // 选中状态
  selectedBuildingId: null,
  selectBuilding: (id) =>
    set((state) => ({
      selectedBuildingId: id,
      selectedIssueId: null,
      currentRenovationId: null,
      selectionRevision: state.selectionRevision + 1,
    })),

  selectedIssueId: null,
  selectIssue: (id) =>
    set((state) => ({
      selectedIssueId: id,
      selectedBuildingId: null,
      currentRenovationId: null,
      selectionRevision: state.selectionRevision + 1,
    })),

  // 视图控制
  viewMode: readViewPreference(),
  setViewMode: (mode) => {
    saveViewPreference(mode);
    set({ viewMode: mode });
  },

  timeMode: 'day',
  setTimeMode: (mode) => set({ timeMode: mode }),

  // 图层显示
  showBuildings: true,
  showIssues: true,
  showRenovations: false,
  toggleBuildings: () => set((state) => ({ showBuildings: !state.showBuildings })),
  toggleIssues: () => set((state) => ({ showIssues: !state.showIssues })),
  toggleRenovations: () => set((state) => ({ showRenovations: !state.showRenovations })),

  layers: { roads: true, fields: true, water: true, facilities: true },
  toggleLayer: (layer) =>
    set((state) => ({ layers: { ...state.layers, [layer]: !state.layers[layer] } })),
  selectionRevision: 0,
  focusSelection: () => set((state) => ({ selectionRevision: state.selectionRevision + 1 })),

  // 微更新方案
  currentRenovationId: null,
  setCurrentRenovation: (id) =>
    set((state) => ({
      currentRenovationId: id,
      selectedIssueId: null,
      selectedBuildingId: null,
      renovationMode: 'before',
      selectionRevision: state.selectionRevision + 1,
    })),

  renovationMode: 'before',
  setRenovationMode: (mode) => set({ renovationMode: mode }),

  // 问题筛选
  filterCategory: 'all',
  filterStatus: 'all',
  setFilterCategory: (category) => set({ filterCategory: category }),
  setFilterStatus: (status) => set({ filterStatus: status }),

  // 问题操作
  updateIssueStatus: (id, status, note) => {
    if (!['pending', 'processing', 'completed'].includes(status))
      throw new Error('无效的办理状态。');
    const village = get().village;
    if (!village) return;
    const issue = village.issues.find((item) => item.id === id);
    if (!issue || issue.status === status) return;

    const updatedIssues = village.issues.map((issue) => {
      if (issue.id === id) {
        const now = new Date().toISOString();
        const newHistory = [
          ...issue.history,
          {
            time: now,
            status,
            operator: '管理员',
            note,
          },
        ];

        return {
          ...issue,
          status,
          updatedAt: now,
          history: newHistory,
        };
      }
      return issue;
    });

    const updatedVillage = {
      ...village,
      issues: updatedIssues,
    };

    saveIssuesToStorage(updatedIssues);
    set({
      village: updatedVillage,
      ...(status === 'completed' && get().selectedIssueId === id ? { selectedIssueId: null } : {}),
    });
  },

  addIssue: (issueData) => {
    const village = get().village;
    if (!village) throw new Error('村庄数据尚未加载，请稍后重试。');
    if (
      !ISSUE_CATEGORIES.includes(issueData.category) ||
      !['low', 'medium', 'high'].includes(issueData.severity)
    )
      throw new Error('请选择有效的问题类型与关注程度。');
    const title = issueData.title.trim();
    if (!title || title.length > 60) throw new Error('请输入 1 至 60 字的事件标题。');
    if (
      !validModelPoint([
        issueData.location?.local?.x,
        issueData.location?.local?.y,
        issueData.location?.local?.z,
      ])
    )
      throw new Error('选点位置无效。');
    if (issueData.sceneAnchor && !validModelPoint(issueData.sceneAnchor.position)) {
      throw new Error('选点位置无效，请重新在模型上选点。');
    }

    const now = new Date().toISOString();
    const newIssue: Issue = {
      ...issueData,
      title,
      location: createLocation(issueData.location.local),
      description: issueData.description.trim(),
      status: 'pending',
      id: `issue-${crypto.randomUUID()}`,
      createdAt: now,
      updatedAt: now,
      history: [
        {
          time: now,
          status: 'pending',
          operator: issueData.reporter,
          note: '问题已上报',
        },
      ],
    };

    const updatedIssues = [...village.issues, newIssue];
    const updatedVillage = {
      ...village,
      issues: updatedIssues,
    };

    saveIssuesToStorage(updatedIssues);
    set({
      village: updatedVillage,
      selectedIssueId: newIssue.id,
      selectedBuildingId: null,
      currentRenovationId: null,
      selectionRevision: get().selectionRevision + 1,
      showIssues: true,
      filterCategory: 'all',
      filterStatus: 'all',
    });
    return newIssue;
  },
}));
