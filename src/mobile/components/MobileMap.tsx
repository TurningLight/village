import type { ProjectionMapProps } from './ProjectionMap';
import ProjectionMap from './ProjectionMap';

/** Resident maps always use the desktop's shared real-village projection. */
export default function MobileMap(props: ProjectionMapProps) {
  return <ProjectionMap {...props} />;
}
