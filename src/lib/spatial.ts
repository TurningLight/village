import type { Feature, FeatureCollection, Polygon } from 'geojson';
import type { Vector3D } from '../types';
import { buildingPositions, roads, fields, waterBodies, facilities } from '../data/villageLayout';
import { localToGeo } from './coordinate';

export function rectangle(
  center: Vector3D,
  width: number,
  depth: number,
  rotation = 0,
): Vector3D[] {
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
    [-1, -1],
  ].map(([x, z]) => {
    const dx = (x * width) / 2,
      dz = (z * depth) / 2;
    return {
      x: center.x + dx * Math.cos(rotation) + dz * Math.sin(rotation),
      y: 0,
      z: center.z - dx * Math.sin(rotation) + dz * Math.cos(rotation),
    };
  });
}
export const geoPair = (p: Vector3D): [number, number] => {
  const g = localToGeo(p);
  return [g.lng, g.lat];
};
const polygon = (id: string, points: Vector3D[], properties = {}): Feature<Polygon> => ({
  type: 'Feature',
  id,
  properties: { id, ...properties },
  geometry: { type: 'Polygon', coordinates: [points.map(geoPair)] },
});
export function spatialGeoJSON(): Record<string, FeatureCollection> {
  return {
    buildings: {
      type: 'FeatureCollection',
      features: buildingPositions.map((b) =>
        polygon(b.id, rectangle(b.position, b.size.width, b.size.depth, b.rotation), {
          name: b.name,
          kind: b.type,
        }),
      ),
    },
    fields: {
      type: 'FeatureCollection',
      features: fields.map((f) =>
        polygon(f.id, rectangle(f.center, f.width, f.depth), { name: f.name }),
      ),
    },
    roads: {
      type: 'FeatureCollection',
      features: roads.map((r) => ({
        type: 'Feature',
        id: r.id,
        properties: { id: r.id, name: r.name, width: r.width },
        geometry: { type: 'LineString', coordinates: r.points.map(geoPair) },
      })),
    },
    water: {
      type: 'FeatureCollection',
      features: waterBodies.map((w) => ({
        type: 'Feature',
        id: w.id,
        properties: { id: w.id, name: w.name },
        geometry: { type: 'LineString', coordinates: w.points.map(geoPair) },
      })),
    },
    facilities: {
      type: 'FeatureCollection',
      features: facilities.map((f) => ({
        type: 'Feature',
        id: f.id,
        properties: { id: f.id, name: f.name, kind: f.kind },
        geometry: { type: 'Point', coordinates: geoPair(f.location.local) },
      })),
    },
  };
}
