import { loadSketchfabViewer } from './sketchfab';
import type { ModelCamera, ModelPoint, SketchfabApi } from './sketchfab';
import type { ModelProjection, ProjectionOptions } from './projectionTypes';
import { projectionRequest, trackProjectionTextures } from './projectionAsync';
import { waitForProjectionCamera } from './projectionCamera';
import { fitProjectionCamera } from './projectionMath';

/** The public hosted API exposes perspective cameras only; capture a calibrated small-FOV overhead view. */
export async function captureOnlineProjection(
  modelId: string,
  reference?: ModelCamera,
  { signal, onProgress }: ProjectionOptions = {},
): Promise<ModelProjection> {
  signal?.throwIfAborted();
  onProgress?.('连接在线模型，准备独立俯视投影…');
  const Sketchfab = await loadSketchfabViewer();
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.title = '实景投影生成器';
    frame.tabIndex = -1;
    frame.setAttribute('aria-hidden', 'true');
    frame.allow = 'autoplay; fullscreen';
    const size = 1024;
    frame.style.cssText = `position:fixed;left:0;top:0;opacity:0.001;z-index:0;width:${size}px;height:${size}px;border:0;pointer-events:none;`;
    document.body.appendChild(frame);
    let viewer: SketchfabApi | undefined,
      finished = false;
    const textures = trackProjectionTextures();
    const textureProgress = (factor: number) => textures.update(factor);
    const finish = (error?: unknown, result?: ModelProjection) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      viewer?.removeEventListener('textureLoadProgress', textureProgress as never);
      signal?.removeEventListener('abort', abort);
      viewer?.stop();
      frame.remove();
      if (error)
        reject(
          error instanceof Error
            ? error
            : new Error('在线模型投影失败，请检查网络或上传完整本地模型。'),
        );
      else resolve(result!);
    };
    const abort = () => finish(new DOMException('投影任务已取消。', 'AbortError'));
    const timeout = setTimeout(
      () => finish(new Error('在线模型投影超时，请重试，或上传完整GLB/glTF生成正交底图。')),
      120000,
    );
    signal?.addEventListener('abort', abort, { once: true });
    const call = <T>(
      operation: (callback: (error: unknown, value?: T) => void) => void,
      message?: string,
      timeoutMs?: number,
    ) => projectionRequest<T>(operation, signal, message, timeoutMs);
    try {
      new Sketchfab('1.12.1', frame).init(modelId, {
        autostart: 1,
        camera: 0,
        dnt: 1,
        preload: 1,
        max_texture_size: 2048,
        ui_stop: 0,
        success(api) {
          if (finished) {
            api.stop();
            return;
          }
          viewer = api;
          onProgress?.('在线模型已连接，正在读取完整场景…');
          api.addEventListener('textureLoadProgress', textureProgress as never);
          api.addEventListener('viewerready', () => {
            void (async () => {
              if (!api.getScreenShot || !api.getFov || !api.setFov)
                throw new Error('该在线模型没有提供投影所需的相机或截图接口。请上传本地模型。');
              onProgress?.('正在定位整村俯视范围…');
              signal?.throwIfAborted();
              if (api.setEnableCameraConstraints)
                await call<unknown>((cb) =>
                  api.setEnableCameraConstraints(
                    false,
                    { preventCameraConstraintsFocus: true },
                    cb,
                  ),
                );
              await call<unknown>((cb) => api.recenterCamera(cb));
              const fitted = await waitForProjectionCamera(api, signal);
              const originalFov = await call<number>((cb) => api.getFov(cb));
              const distance = Math.hypot(...fitted.position.map((v, i) => v - fitted.target[i]));
              if (!Number.isFinite(distance) || distance <= 0)
                throw new Error('在线模型范围无效。');
              const half =
                distance *
                Math.sin((Math.max(10, Math.min(100, originalFov)) * Math.PI) / 360) *
                1.5;
              const fov = await call<number>((cb) => api.setFov(5, cb));
              const altitude = half / Math.tan((fov * Math.PI) / 360);
              const [x, y, z] = fitted.target;
              await call<unknown>((cb) =>
                api.setCameraLookAt(
                  [x, y - altitude * Math.tan((2 * Math.PI) / 180), z + altitude],
                  fitted.target,
                  0,
                  cb,
                ),
              );
              await waitForProjectionCamera(
                api,
                signal,
                {
                  position: [x, y - altitude * Math.tan((2 * Math.PI) / 180), z + altitude],
                  target: fitted.target,
                },
                fov,
              );
              await textures.wait(signal, onProgress);
              onProgress?.('正在校准底图与事件坐标…');
              // Calibrate the actual hosted camera, so height, camera roll and API orientation all match the captured image.
              const unit = distance * 0.15,
                samples = [] as { point: ModelPoint; uv: [number, number] }[];
              const points: ModelPoint[] = [];
              for (const dx of [-1, 1])
                for (const dy of [-1, 1])
                  for (const dz of [-1, 1])
                    points.push([x + dx * unit, y + dy * unit, z + dz * unit]);
              samples.push(
                ...(await Promise.all(
                  points.map(async (point) => {
                    const screen = await call<[number, number]>(
                      (cb) =>
                        api.getWorldToScreenCoordinates(point, (result) =>
                          result?.canvasCoord?.every(Number.isFinite)
                            ? cb(null, result.canvasCoord)
                            : cb(new Error('在线模型坐标投影失败。')),
                        ),
                      '底图坐标校准超时，请重试。',
                    );
                    return { point, uv: [screen[0] / size, screen[1] / size] as [number, number] };
                  }),
                )),
              );
              const transform = fitProjectionCamera(samples, [x, y, z], unit);
              onProgress?.('正在生成并保存二维底图…');
              const encoded = await call<string>(
                (cb) => api.getScreenShot(2048, 2048, 'image/png', cb),
                '底图影像生成超时，请重试。',
                25000,
              );
              if (!encoded?.startsWith('data:image/png;base64,'))
                throw new Error('在线模型未返回有效的底图。');
              const image = await (await fetch(encoded)).blob();
              signal?.throwIfAborted();
              finish(undefined, {
                version: 2,
                modelId,
                image,
                width: 2048,
                height: 2048,
                bounds: { minX: x - half, minY: y - half, maxX: x + half, maxY: y + half },
                transform,
                reference: reference ?? fitted,
                method: 'online-topdown',
                createdAt: new Date().toISOString(),
              });
            })().catch((error) => finish(error));
          });
          api.start();
        },
        error: () => finish(new Error('在线模型无法连接，不能生成俯视影像。请检查网络后重试。')),
      });
    } catch (error) {
      finish(error);
    }
  });
}
