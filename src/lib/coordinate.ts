import { Vector3D, GeoCoordinate, Location } from '../types';

// 演示村庄的中心锚点 (虚构坐标)
// 使用中国浙江某虚构村庄坐标
export const DEMO_ANCHOR = {
  lng: 120.5,
  lat: 30.5,
};

// 1 Three.js 世界单位 ≈ 1米
// 地理坐标每度大约是111km
const METERS_PER_DEGREE = 111000;
const METERS_PER_LONGITUDE = METERS_PER_DEGREE * Math.cos((DEMO_ANCHOR.lat * Math.PI) / 180);

/**
 * 将本地Three.js坐标转换为地理坐标
 * @param local 本地坐标 (x, z平面是水平面, y是高度)
 * @returns 地理坐标 (lng, lat)
 */
export function localToGeo(local: Vector3D): GeoCoordinate {
  // X轴对应经度(东西方向)
  // Z轴对应纬度(南北方向)
  const lngOffset = local.x / METERS_PER_LONGITUDE;
  const latOffset = -local.z / METERS_PER_DEGREE; // Z轴负方向是北

  return {
    lng: DEMO_ANCHOR.lng + lngOffset,
    lat: DEMO_ANCHOR.lat + latOffset,
  };
}

/**
 * 将地理坐标转换为本地Three.js坐标
 * @param geo 地理坐标
 * @returns 本地坐标
 */
export function geoToLocal(geo: GeoCoordinate): Vector3D {
  const lngOffset = geo.lng - DEMO_ANCHOR.lng;
  const latOffset = geo.lat - DEMO_ANCHOR.lat;

  return {
    x: lngOffset * METERS_PER_LONGITUDE,
    y: 0,
    z: -latOffset * METERS_PER_DEGREE, // 地图北向上,Three.js Z负方向是北
  };
}

/**
 * 创建完整的位置对象
 * @param local 本地坐标
 * @returns 包含本地和地理坐标的位置对象
 */
export function createLocation(local: Vector3D): Location {
  return {
    local,
    geo: localToGeo(local),
  };
}

/**
 * 计算两点之间的距离
 * @param a 位置A
 * @param b 位置B
 * @returns 距离(米)
 */
export function distance(a: Vector3D, b: Vector3D): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
