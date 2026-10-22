import * as THREE from 'three';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { projectionFrame } from './projectionMath';
import type { ModelCamera } from './sketchfab';
import type { ModelProjection, ProjectionOptions } from './projectionTypes';

/** Any loaded, world-aligned textured mesh can use this renderer. No village-specific geometry. */
export async function renderOrthographicProjection(
  renderer: THREE.WebGLRenderer,
  root: THREE.Object3D,
  modelId: string,
  reference: ModelCamera,
  options: ProjectionOptions = {},
): Promise<ModelProjection> {
  options.signal?.throwIfAborted();
  options.onProgress?.('读取模型边界，准备正交投影…');
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const frame = projectionFrame({
    minX: box.min.x,
    minY: box.min.y,
    maxX: box.max.x,
    maxY: box.max.y,
  });
  const b = frame.bounds,
    cx = (b.minX + b.maxX) / 2,
    cy = (b.minY + b.maxY) / 2;
  const span = Math.max(b.maxX - b.minX, b.maxY - b.minY, box.max.z - box.min.z, 1);
  const camera = new THREE.OrthographicCamera(
    -(b.maxX - b.minX) / 2,
    (b.maxX - b.minX) / 2,
    (b.maxY - b.minY) / 2,
    -(b.maxY - b.minY) / 2,
    0.01,
    span * 4 + 1,
  );
  camera.up.set(0, 1, 0);
  camera.position.set(cx, cy, box.max.z + span);
  camera.lookAt(cx, cy, box.min.z);
  camera.updateMatrixWorld();
  // Render the actual scene root with its textures. A temporary scene avoids touching the 3D camera/lights/layers.
  const parent = root.parent,
    index = parent?.children.indexOf(root) ?? 0,
    visible = root.visible;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#e5e8dd');
  const ambient = new THREE.HemisphereLight(0xffffff, 0x73816b, 2.3),
    sun = new THREE.DirectionalLight(0xfff4df, 2.5);
  sun.position.set(120, -100, 200);
  scene.add(ambient, sun);
  const target = new THREE.WebGLRenderTarget(frame.width, frame.height, {
    depthBuffer: true,
    type: THREE.HalfFloatType,
  });
  const output = new THREE.WebGLRenderTarget(frame.width, frame.height, { depthBuffer: false });
  const outputPass = new OutputPass();
  const previousTarget = renderer.getRenderTarget(),
    viewport = renderer.getViewport(new THREE.Vector4()),
    scissor = renderer.getScissor(new THREE.Vector4()),
    scissorTest = renderer.getScissorTest(),
    exposure = renderer.toneMappingExposure;
  const pixels = new Uint8Array(frame.width * frame.height * 4);
  options.onProgress?.('从模型上方渲染纹理影像…');
  try {
    scene.add(root);
    root.visible = true;
    renderer.toneMappingExposure = 1;
    renderer.setRenderTarget(target);
    renderer.setScissorTest(false);
    renderer.clear();
    renderer.render(scene, camera);
    outputPass.render(renderer, output, target, 0, false);
    renderer.readRenderTargetPixels(output, 0, 0, frame.width, frame.height, pixels);
  } finally {
    scene.remove(root);
    if (parent) {
      parent.add(root);
      parent.children.splice(parent.children.indexOf(root), 1);
      parent.children.splice(index, 0, root);
    }
    root.visible = visible;
    renderer.setRenderTarget(previousTarget);
    renderer.setViewport(viewport);
    renderer.setScissor(scissor);
    renderer.setScissorTest(scissorTest);
    renderer.toneMappingExposure = exposure;
    target.dispose();
    output.dispose();
    outputPass.dispose();
  }
  options.signal?.throwIfAborted();
  // WebGL is bottom-up; image and MapLibre coordinates start at the top-left.
  const flipped = new Uint8ClampedArray(pixels.length),
    stride = frame.width * 4;
  for (let y = 0; y < frame.height; y++)
    flipped.set(
      pixels.subarray((frame.height - y - 1) * stride, (frame.height - y) * stride),
      y * stride,
    );
  const canvas = document.createElement('canvas');
  canvas.width = frame.width;
  canvas.height = frame.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('浏览器无法编码投影底图。');
  context.putImageData(new ImageData(flipped, frame.width, frame.height), 0, 0);
  const image = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('投影底图编码失败。'))),
      'image/png',
    ),
  );
  options.signal?.throwIfAborted();
  return {
    version: 2,
    modelId,
    image,
    width: frame.width,
    height: frame.height,
    bounds: b,
    transform: { kind: 'orthographic' },
    reference,
    method: 'orthographic',
    createdAt: new Date().toISOString(),
  };
}
