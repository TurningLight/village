import type { ModelCamera, ModelPoint } from './sketchfab';

export interface ProjectionBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
export type ProjectionTransform =
  | { kind: 'orthographic' }
  | { kind: 'projective'; matrix: number[]; origin: ModelPoint; unit: number };
export interface ModelProjection {
  version: 2;
  modelId: string;
  image: Blob;
  width: number;
  height: number;
  bounds: ProjectionBounds;
  transform: ProjectionTransform;
  reference: ModelCamera;
  method: 'orthographic' | 'online-topdown';
  createdAt: string;
}
export interface ProjectionOptions {
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
}
export interface ProjectionSource {
  modelId: string;
  reference: ModelCamera;
  capture?: (options: ProjectionOptions) => Promise<ModelProjection>;
}
export interface ProjectionView {
  modelId: string;
  status: 'waiting' | 'generating' | 'ready' | 'error';
  data?: ModelProjection;
  url?: string;
  reference?: ModelCamera;
  message: string;
  error?: string;
  cacheChecked?: boolean;
  cacheStatus?: 'saving' | 'saved' | 'unavailable';
  save?: () => void;
  retry: () => void;
}
