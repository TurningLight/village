import type { ModelProjection } from './projectionTypes';

/** The mobile client downloads a calibrated image, never the original 3D asset. */
export type SharedProjection = Omit<ModelProjection, 'image'> & {
  revision: string;
  imageUrl: string;
};
export interface SharedVillageMap {
  modelId: string;
  name: string;
  kind: 'demo' | 'real';
  updatedAt: string;
  projection?: SharedProjection;
}
export interface SharedMapCatalog {
  activeModelId: string;
  /** The resident client follows the desktop's last selected real source. */
  activeRealModelId: string | null;
  maps: SharedVillageMap[];
}
export type SharedMapDescriptor = Pick<SharedVillageMap, 'modelId' | 'name' | 'kind'>;
