import { projectionRequest } from './projectionAsync';
import type { ModelCamera, SketchfabApi } from './sketchfab';

/** SDK camera callbacks acknowledge the start of a move, not the rendered final pose. */
export async function waitForProjectionCamera(
  api: SketchfabApi,
  signal?: AbortSignal,
  expected?: ModelCamera,
  expectedFov?: number,
) {
  let previous: ModelCamera | undefined;
  let stable = 0;

  const pause = () =>
    new Promise<void>((resolve, reject) => {
      signal?.throwIfAborted();
      const abort = () => {
        clearTimeout(timer);
        reject(new DOMException('投影任务已取消。', 'AbortError'));
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', abort);
        resolve();
      }, 120);
      signal?.addEventListener('abort', abort, { once: true });
    });
  for (let i = 0; i < 65; i++) {
    await pause();
    const camera = await projectionRequest<ModelCamera>(
      (cb) => api.getCameraLookAt(cb),
      signal,
      '在线相机没有响应，请重试。',
      4000,
    );
    const scale = Math.max(1, Math.hypot(...camera.position.map((v, j) => v - camera.target[j])));
    const delta = (a: ModelCamera, b: ModelCamera) =>
      Math.max(
        ...a.position.map((v, j) => Math.abs(v - b.position[j])),
        ...a.target.map((v, j) => Math.abs(v - b.target[j])),
      ) / scale;
    const fov =
      expectedFov === undefined
        ? undefined
        : await projectionRequest<number>(
            (cb) => api.getFov!(cb),
            signal,
            '在线相机视角没有响应，请重试。',
            4000,
          );
    const matches =
      !expected || (delta(camera, expected) < 1e-5 && Math.abs(fov! - expectedFov!) < 0.01);
    stable = previous && delta(camera, previous) < 1e-6 && matches ? stable + 1 : 0;
    if (stable >= 5) return camera;
    previous = camera;
  }

  throw new Error('在线相机未能稳定到完整俯视范围，请重试或上传本地模型生成正交投影。');
}
