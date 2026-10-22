import type { IncomingMessage, ServerResponse } from 'node:http';
export function createVoiceMiddleware(options?: {
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
}): (req: IncomingMessage, res: ServerResponse, next?: () => void) => Promise<void>;
export const VOICE_CATEGORIES: string[];
export function normalizeVoiceFields(value: unknown): {
  title: string;
  description: string;
  category: string;
  area: string;
  severity: string;
};
