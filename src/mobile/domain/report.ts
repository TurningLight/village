import type { Issue, IssueCategory, IssueSeverity, Vector3D } from '../../types';
import { ISSUE_CATEGORIES, DEMO_MODEL_ID, validProjectionAnchor } from '../../lib/issues';
export interface ResidentIdentity {
  id: string;
  name: string;
}
export interface ReportDraft {
  modelId?: string;
  modelName?: string;
  projectionAnchor?: Issue['projectionAnchor'];
  submissionId?: string;
  title: string;
  description: string;
  category: IssueCategory | '';
  severity: IssueSeverity;
  area: string;
  point: Vector3D | null;
  images: string[];
}
export interface VoiceFields {
  title: string;
  description: string;
  category: IssueCategory;
  severity: IssueSeverity;
  area: string;
}
export const EMPTY_REPORT: ReportDraft = {
  title: '',
  description: '',
  category: '',
  severity: 'medium',
  area: '',
  point: null,
  images: [],
};
export const RESIDENT_MODEL_ID = DEMO_MODEL_ID;
export function validateReport(draft: ReportDraft): string | null {
  if (!draft.title.trim() || draft.title.trim().length > 60) return '请填写 1–60 字的问题标题。';
  if (!ISSUE_CATEGORIES.includes(draft.category as IssueCategory)) return '请选择问题类型。';
  if (draft.description.trim().length < 5 || draft.description.trim().length > 1200)
    return '请用 5–1200 字说明具体情况。';
  if (!draft.area.trim()) return '请填写具体位置，例如村口桥边。';
  if (!draft.point || ![draft.point.x, draft.point.y, draft.point.z].every(Number.isFinite))
    return '请在村庄地图上标出位置。';
  const real = !!draft.modelId && draft.modelId !== DEMO_MODEL_ID;
  if (
    real &&
    (!validProjectionAnchor(draft.projectionAnchor) ||
      draft.projectionAnchor.modelId !== draft.modelId)
  )
    return '请在当前村庄的实景底图上重新标出位置。';
  if (!real && (Math.abs(draft.point.x) > 110 || Math.abs(draft.point.z) > 82))
    return '标记位置超出村庄示意范围，请重新选点。';
  if (draft.images.length > 4) return '最多添加 4 张现场照片。';
  return null;
}
export function mergeVoiceFields(draft: ReportDraft, fields: VoiceFields): ReportDraft {
  const description = draft.description.trim();
  return {
    ...draft,
    title: draft.title.trim() ? draft.title : fields.title,
    category: draft.category || fields.category,
    area: draft.area.trim() ? draft.area : fields.area,
    severity: draft.severity,
    description: description
      ? `${description}\n${fields.description}`.slice(0, 1200)
      : fields.description,
  };
}
export const STATUS_LABELS = {
  pending: '待受理',
  processing: '处理中',
  completed: '已办结',
} as const;
export function formatTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}
