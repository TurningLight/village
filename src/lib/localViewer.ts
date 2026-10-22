import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { renderOrthographicProjection } from './localProjection';
import { disposeModel, loadLocalModel } from './localModelLoader';
import type { StoredModel } from './modelStorage';
import type { ModelCamera, ModelClickInfo, ModelPoint, SketchfabApi } from './sketchfab';

export async function createLocalViewer(
  container: HTMLDivElement,
  model: StoredModel,
  onError: () => void,
): Promise<SketchfabApi> {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.domElement.setAttribute('aria-label', `本地实景模型：${model.name}`);
  renderer.domElement.tabIndex = 0;
  let root: THREE.Group;
  try {
    root = await loadLocalModel(model, renderer);
  } catch (error) {
    renderer.dispose();
    renderer.forceContextLoss();
    throw error;
  }
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe0e8e0);
  const ambient = new THREE.HemisphereLight(0xffffff, 0x73816b, 2.3);
  const sun = new THREE.DirectionalLight(0xfff4df, 2.5);
  sun.position.set(120, -100, 200);
  scene.add(root, ambient, sun);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 10000);
  camera.up.set(0, 0, 1);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.minDistance = 0.2;
  controls.maxDistance = 4000;
  controls.screenSpacePanning = true;
  container.appendChild(renderer.domElement);
  const resize = () => {
    const { width, height } = container.getBoundingClientRect();
    renderer.setSize(Math.max(1, width), Math.max(1, height));
    camera.aspect = Math.max(1, width) / Math.max(1, height);
    camera.updateProjectionMatrix();
  };
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  const fit = () => {
    const sphere = new THREE.Box3().setFromObject(root).getBoundingSphere(new THREE.Sphere());
    const vertical = THREE.MathUtils.degToRad(camera.fov / 2);
    const horizontal = Math.atan(Math.tan(vertical) * camera.aspect);
    const distance = (sphere.radius / Math.sin(Math.min(vertical, horizontal))) * 1.5;
    controls.target.copy(sphere.center);
    camera.position
      .copy(sphere.center)
      .add(new THREE.Vector3(1, -1, 0.95).normalize().multiplyScalar(distance));
    controls.update();
    camera.updateMatrixWorld();
  };
  fit();
  let disposed = false;
  let running = false;
  let frame = 0;
  let tween: {
    from: THREE.Vector3;
    to: THREE.Vector3;
    targetFrom: THREE.Vector3;
    targetTo: THREE.Vector3;
    start: number;
    duration: number;
  } | null = null;
  const listeners = new Map<string, Set<(info?: ModelClickInfo) => void>>();
  const emit = (name: string, info?: ModelClickInfo) =>
    listeners.get(name)?.forEach((listener) => listener(info));
  const render = (now: number) => {
    if (disposed || !running) return;
    if (tween) {
      const progress = Math.min(1, (now - tween.start) / tween.duration);
      const alpha = 1 - (1 - progress) ** 3;
      camera.position.lerpVectors(tween.from, tween.to, alpha);
      controls.target.lerpVectors(tween.targetFrom, tween.targetTo, alpha);
      if (progress === 1) tween = null;
    }
    controls.update();
    renderer.render(scene, camera);
    frame = requestAnimationFrame(render);
  };
  const point = (vector: THREE.Vector3): ModelPoint => [vector.x, vector.y, vector.z];
  const getCamera = (): ModelCamera => ({
    position: point(camera.position),
    target: point(controls.target),
  });
  const raycaster = new THREE.Raycaster();
  const raycastScreen = (x: number, y: number) => {
    if (!root.visible) return undefined;
    camera.updateMatrixWorld();
    raycaster.setFromCamera(
      new THREE.Vector2(
        (x / renderer.domElement.clientWidth) * 2 - 1,
        -(y / renderer.domElement.clientHeight) * 2 + 1,
      ),
      camera,
    );
    return raycaster.intersectObject(root, true)[0];
  };
  let down: { x: number; y: number; id: number; moved: boolean } | null = null;
  let pointers = 0;
  const pointerDown = (event: PointerEvent) => {
    pointers++;
    tween = null;
    if (pointers > 1) {
      if (down) down.moved = true;
      return;
    }
    if (event.button === 0)
      down = { x: event.clientX, y: event.clientY, id: event.pointerId, moved: false };
  };
  const pointerMove = (event: PointerEvent) => {
    if (down && Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5) down.moved = true;
  };
  const pointerUp = (event: PointerEvent) => {
    pointers = Math.max(0, pointers - 1);
    const original = down;
    down = null;
    if (
      disposed ||
      !original ||
      original.id !== event.pointerId ||
      original.moved ||
      Math.hypot(event.clientX - original.x, event.clientY - original.y) > 5
    )
      return;
    const rect = renderer.domElement.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const hit = raycastScreen(x, y);
    if (hit) emit('click', { position3D: point(hit.point), position2D: [x, y] });
  };
  const cancelPointer = () => {
    down = null;
    pointers = 0;
  };
  const contextLost = (event: Event) => {
    event.preventDefault();
    if (!disposed) onError();
  };
  renderer.domElement.addEventListener('pointerdown', pointerDown);
  renderer.domElement.addEventListener('pointermove', pointerMove);
  renderer.domElement.addEventListener('pointerup', pointerUp);
  renderer.domElement.addEventListener('pointercancel', cancelPointer);
  renderer.domElement.addEventListener('webglcontextlost', contextLost);

  return {
    captureMapProjection(options) {
      if (disposed) return Promise.reject(new Error('模型已切换，请重新生成当前模型投影。'));
      return renderOrthographicProjection(renderer, root, model.id, getCamera(), options);
    },
    start() {
      if (disposed || running) return;
      running = true;
      frame = requestAnimationFrame(render);
      queueMicrotask(() => {
        if (!disposed) emit('viewerready');
      });
    },
    stop() {
      if (disposed) return;
      disposed = true;
      running = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      listeners.clear();
      renderer.domElement.removeEventListener('pointerdown', pointerDown);
      renderer.domElement.removeEventListener('pointermove', pointerMove);
      renderer.domElement.removeEventListener('pointerup', pointerUp);
      renderer.domElement.removeEventListener('pointercancel', cancelPointer);
      renderer.domElement.removeEventListener('webglcontextlost', contextLost);
      disposeModel(root);
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
    addEventListener(event, callback) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(callback);
    },
    removeEventListener(event, callback) {
      listeners.get(event)?.delete(callback);
    },
    recenterCamera(callback) {
      fit();
      callback(null);
    },
    getCameraLookAt(callback) {
      callback(null, getCamera());
    },
    setCameraLookAt(position, target, duration = 0) {
      if (duration > 0 && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        tween = {
          from: camera.position.clone(),
          to: new THREE.Vector3(...position),
          targetFrom: controls.target.clone(),
          targetTo: new THREE.Vector3(...target),
          start: performance.now(),
          duration: duration * 1000,
        };
      } else {
        tween = null;
        camera.position.set(...position);
        controls.target.set(...target);
        controls.update();
        camera.updateMatrixWorld();
      }
    },
    setBackground({ color }) {
      scene.background = new THREE.Color().setRGB(
        color[0],
        color[1],
        color[2],
        THREE.SRGBColorSpace,
      );
      const night = color[0] < 0.2;
      ambient.intensity = night ? 0.8 : 2.3;
      sun.intensity = night ? 0.4 : 2.5;
      renderer.toneMappingExposure = night ? 0.55 : 1;
    },
    getNodeMap(callback) {
      callback(null, { model: { instanceID: 1, type: 'Geometry' } });
    },
    show() {
      root.visible = true;
    },
    hide() {
      root.visible = false;
    },
    pickFromScene(start, end, callback) {
      if (!root.visible) {
        callback(null, {});
        return;
      }
      const from = new THREE.Vector3(...start);
      const direction = new THREE.Vector3(...end).sub(from);
      raycaster.set(from, direction.normalize());
      const hit = raycaster.intersectObject(root, true)[0];
      callback(null, hit ? { position3D: point(hit.point) } : {});
    },
    pickFromScreen(screen, callback) {
      const hit = raycastScreen(screen[0], screen[1]);
      callback(null, hit ? { position3D: point(hit.point) } : undefined);
    },
    getWorldToScreenCoordinates(position, callback) {
      camera.updateMatrixWorld();
      const projected = new THREE.Vector3(...position).project(camera);
      callback({
        canvasCoord:
          projected.z > 1 || projected.z < -1
            ? [-1000, -1000]
            : [
                ((projected.x + 1) / 2) * renderer.domElement.clientWidth,
                ((1 - projected.y) / 2) * renderer.domElement.clientHeight,
              ],
      });
    },
  };
}
