import type { Issue } from '../../types';
import type { ReportDraft, ResidentIdentity, VoiceFields } from '../domain/report';
export interface ResidentGateway {
  list(modelId?: string): Promise<Issue[]>;
  report(draft: ReportDraft, resident: ResidentIdentity): Promise<Issue>;
  watch(listener: () => void): () => void;
}
export interface DraftStorage {
  read(modelId?: string): Promise<ReportDraft | null>;
  write(draft: ReportDraft): Promise<void>;
  clear(modelId?: string): Promise<void>;
}
export interface AudioClip {
  blob: Blob;
  durationMs: number;
}
export interface RecorderPort {
  start(): Promise<void>;
  stop(): Promise<AudioClip>;
  cancel(): void;
}
export interface VoiceGateway {
  config(): Promise<{ enabled: boolean; provider: string; maxSeconds: number }>;
  transcribe(clip: AudioClip, signal?: AbortSignal): Promise<string>;
  format(text: string, signal?: AbortSignal): Promise<VoiceFields>;
}
