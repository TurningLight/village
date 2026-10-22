import { readModelPoint } from './issues';
import type { ModelClickInfo, ModelPoint, SketchfabApi } from './sketchfab';

// Install after viewerready: listener options and picking both need the scene.
export function listenForModelClicks(
  api: SketchfabApi,
  onHit: (point: ModelPoint) => void,
  onMiss: (message: string) => void,
) {
  let disposed = false;
  let request = 0;
  const click = (info?: ModelClickInfo) => {
    if (disposed) return;
    const current = ++request;
    const point = readModelPoint(info?.position3D);
    if (point) { onHit(point); return; }

    // Some click events only carry viewport coordinates. Use them directly:
    // Sketchfab already supplies device-pixel coordinates with a bottom origin.
    const screen = info?.position2D;
    if (!screen || screen.length !== 2 || !Number.isFinite(screen[0]) || !Number.isFinite(screen[1])) {
      onMiss('未取得选点位置，请点击模型中的建筑或地面。');
      return;
    }
    api.pickFromScreen([screen[0], screen[1]], (error, hit) => {
      if (disposed || request !== current) return;
      const picked = !error && readModelPoint(hit?.position3D);
      if (picked) onHit(picked);
      else onMiss(error ? '选点失败，请重新点击模型中的建筑或地面。' : '此处未命中村庄模型，请点击建筑或地面。');
    });
  };
  // This static scan needs no animated-mesh CPU picking.
  api.addEventListener('click', click, { pick: 'fast' });
  return () => {
    disposed = true;
    ++request;
    api.removeEventListener('click', click);
  };
}
