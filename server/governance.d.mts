import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Issue } from '../src/types/index';
import type {
  GovernanceConfig,
  GovernanceOverview,
  WorkRecord,
  MonthlyReport,
  GovernanceAnswer,
} from '../src/types/governance';

export interface GovernanceService {
  config(): GovernanceConfig;
  reconcile(issues?: Issue[]): Promise<void>;
  overview(modelId: string, month: string): Promise<GovernanceOverview>;
  retry(id: string): Promise<WorkRecord>;
  monthly(modelId: string, month: string): Promise<MonthlyReport>;
  chat(
    input: {
      modelId: string;
      month: string;
      question: string;
      history?: { role: 'user' | 'assistant'; content: string }[];
    },
    signal?: AbortSignal,
  ): Promise<GovernanceAnswer>;
  idle(): Promise<void>;
  close(): void;
}
export function createGovernanceService(options: {
  file: string;
  readIssues: () => Promise<Issue[]>;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  now?: () => number;
}): GovernanceService;
export function createGovernanceMiddleware(
  service: GovernanceService,
): (req: IncomingMessage, res: ServerResponse, next?: () => unknown) => Promise<unknown>;
