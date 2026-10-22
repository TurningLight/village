import type { IssueCategory, IssueSeverity, IssueStatus } from './index';

export interface GovernanceEvidence {
  id: string;
  title: string;
  description: string;
  category: IssueCategory;
  severity: IssueSeverity;
  status: IssueStatus;
  area: string;
  createdAt: string;
  completedAt: string | null;
  history: { time: string; status: IssueStatus; note: string }[];
}
export interface GovernanceFacts {
  modelId: string;
  month: string;
  generatedAt: string;
  counts: {
    totalInVillage: number;
    reportedInMonth: number;
    completedInMonth: number;
    pendingNow: number;
    processingNow: number;
    openNow: number;
    averageCompletionHours: number | null;
    completionSampleCount: number;
  };
  categories: { name: string; count: number }[];
  hotspots: { area: string; count: number; open: number; issueIds: string[] }[];
  trend: { day: string; reported: number; completed: number }[];
  evidence: GovernanceEvidence[];
  evidenceTotal: number;
  limitations: string[];
}
export type GenerationStatus = 'pending' | 'generating' | 'ready' | 'error';
export interface WorkRecord {
  id: string;
  modelId: string;
  issueId: string;
  title: string;
  category: string;
  area: string;
  month: string;
  completedAt: string;
  sourceUpdatedAt: string;
  sourceFingerprint: string;
  status: GenerationStatus;
  withdrawn: boolean;
  report: string;
  error: string;
  model: string;
  generatedAt: string | null;
  updatedAt: string;
  evidence: GovernanceEvidence;
}
export interface MonthlyReport {
  id: string;
  modelId: string;
  month: string;
  status: GenerationStatus;
  report: string;
  error: string;
  sourceFingerprint: string;
  sourceRecordIds: string[];
  stale: boolean;
  model: string;
  generatedAt: string | null;
  updatedAt: string;
}
export interface GovernanceConfig {
  enabled: boolean;
  provider: string;
  model: string;
}
export interface GovernanceOverview {
  config: GovernanceConfig;
  modelId: string;
  month: string;
  records: WorkRecord[];
  monthly: MonthlyReport | null;
  facts: GovernanceFacts;
}
export interface GovernanceAnswer {
  answer: string;
  evidenceIds: string[];
  suggestions: { title: string; action: string; evidenceIds: string[] }[];
  limitations: string[];
  model: string;
  generatedAt: string;
}
