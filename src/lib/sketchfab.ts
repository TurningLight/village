import type { ModelProjection, ProjectionOptions } from './projectionTypes';
export type ModelPoint = [number, number, number];
export interface ModelCamera {
  position: ModelPoint;
  target: ModelPoint;
}
interface ModelNode {
  instanceID: number;
  type: string;
}
export interface ModelClickInfo {
  position3D?: ModelPoint | Float32Array | Float64Array;
  position2D?: [number, number] | Float32Array | Float64Array;
}
export interface SketchfabApi {
  captureMapProjection?: (options?: ProjectionOptions) => Promise<ModelProjection>;
  getScreenShot?: (
    width: number,
    height: number,
    mime: string,
    callback: (error: unknown, data: string) => void,
  ) => void;
  getFov?: (callback: (error: unknown, fov: number) => void) => void;
  setFov?: (fov: number, callback: (error: unknown, fov: number) => void) => void;
  setEnableCameraConstraints?: (
    enabled: boolean,
    options: { preventCameraConstraintsFocus: boolean },
    callback: (error: unknown) => void,
  ) => void;
  setUserInteraction?: (enabled: boolean, callback?: (error: unknown) => void) => void;
  start: () => void;
  stop: () => void;
  addEventListener: (
    event: string,
    callback: (info?: ModelClickInfo) => void,
    options?: { pick: 'fast' | 'slow' },
  ) => void;
  removeEventListener: (event: string, callback: (info?: ModelClickInfo) => void) => void;
  recenterCamera: (callback: (error: unknown) => void) => void;
  getCameraLookAt: (callback: (error: unknown, camera: ModelCamera) => void) => void;
  setCameraLookAt: (
    position: ModelPoint,
    target: ModelPoint,
    duration?: number,
    callback?: (error: unknown) => void,
  ) => void;
  setBackground: (options: { color: number[] }) => void;
  getNodeMap: (callback: (error: unknown, nodes: Record<string, ModelNode>) => void) => void;
  show: (id: number) => void;
  hide: (id: number) => void;
  pickFromScene: (
    start: ModelPoint,
    end: ModelPoint,
    callback: (error: unknown, hit: { position3D?: ModelPoint }) => void,
  ) => void;
  pickFromScreen: (
    screen: [number, number],
    callback: (error: unknown, hit?: ModelClickInfo) => void,
  ) => void;
  getWorldToScreenCoordinates: (
    point: ModelPoint,
    callback: (coordinates: { canvasCoord: [number, number] }) => void,
  ) => void;
}
interface ViewerOptions {
  success: (api: SketchfabApi) => void;
  error: () => void;
  [option: string]: unknown;
}
interface SketchfabConstructor {
  new (
    version: string,
    iframe: HTMLIFrameElement,
  ): { init: (uid: string, options: ViewerOptions) => void };
}
declare global {
  interface Window {
    Sketchfab?: SketchfabConstructor;
  }
}

let sdkPromise: Promise<SketchfabConstructor> | undefined;

// The official Viewer SDK is served locally. Model assets remain hosted by
// the author; obtaining the source archive requires a Sketchfab login.
export function loadSketchfabViewer() {
  if (window.Sketchfab) return Promise.resolve(window.Sketchfab);
  if (!sdkPromise) {
    sdkPromise = new Promise<SketchfabConstructor>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `${import.meta.env.BASE_URL}vendor/sketchfab-viewer-1.12.1.js`;
      script.async = true;
      script.onload = () => {
        if (window.Sketchfab) resolve(window.Sketchfab);
        else {
          sdkPromise = undefined;
          script.remove();
          reject(new Error('Viewer SDK unavailable'));
        }
      };
      script.onerror = () => {
        sdkPromise = undefined;
        script.remove();
        reject(new Error('Viewer SDK failed to load'));
      };
      document.head.appendChild(script);
    });
  }
  return sdkPromise;
}

// Wait for a real viewerready before committing a new online default map.
// Keep the frame rendered (rather than display:none) for Viewer API support.
export async function validateSketchfabModel(modelId: string) {
  const Sketchfab = await loadSketchfabViewer();
  return new Promise<void>((resolve, reject) => {
    const iframe = document.createElement('iframe');
    iframe.title = 'Sketchfab 模型连接校验';
    iframe.setAttribute('aria-hidden', 'true');
    iframe.tabIndex = -1;
    iframe.allow = 'autoplay; fullscreen';
    iframe.style.cssText =
      'position:fixed;left:-10000px;top:0;width:640px;height:480px;border:0;pointer-events:none;';
    document.body.appendChild(iframe);
    let viewer: SketchfabApi | undefined;
    let finished = false;
    const finish = (error?: Error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      viewer?.stop();
      iframe.remove();
      if (error) reject(error);
      else resolve();
    };
    const timeout = window.setTimeout(
      () =>
        finish(
          new Error('Sketchfab 连接超时，原地图已保留。请检查网络或模型是否允许公开嵌入后重试。'),
        ),
      90000,
    );
    try {
      new Sketchfab('1.12.1', iframe).init(modelId, {
        autostart: 1,
        camera: 0,
        dnt: 1,
        preload: 0,
        max_texture_size: 4096,
        ui_stop: 0,
        success(api) {
          if (finished) {
            api.stop();
            return;
          }
          viewer = api;
          api.addEventListener('viewerready', () => finish());
          api.start();
        },
        error: () =>
          finish(
            new Error(
              '无法载入该 Sketchfab 模型，原地图已保留。请检查链接、网络及模型的公开嵌入权限。',
            ),
          ),
      });
    } catch {
      finish(new Error('Sketchfab 初始化失败，原地图已保留，请重试。'));
    }
  });
}
