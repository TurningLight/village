import type { Issue } from '../src/types/index';
import type { GovernanceEvidence, GovernanceFacts } from '../src/types/governance';

export function monthInShanghai(value: string | number | Date): string;
export function issueModelId(issue: Issue): string | null;
export function issueModelIds(issue: Issue): string[];
export function issueBelongsToModel(issue: Issue, modelId: string): boolean;
export function getCompletedAt(issue: Issue): string | null;
export function buildGovernanceEvidence(issue: Issue): GovernanceEvidence;
export function buildGovernanceFacts(
  issues: Issue[],
  options: { modelId: string; month: string; now?: string | number | Date },
): GovernanceFacts;
