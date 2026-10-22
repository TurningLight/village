import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import type { StoredModel } from './modelStorage';

export function disposeModel(root: THREE.Object3D) {
  const textures = new Set<THREE.Texture>();
  const materials = new Set<THREE.Material>();
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    mesh.geometry?.dispose();
    if (mesh.material) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(material);
  });
  for (const material of materials) {
    for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    material.dispose();
  }
  for (const texture of textures) {
    texture.dispose();
    if (typeof ImageBitmap !== 'undefined' && texture.source?.data instanceof ImageBitmap) texture.source.data.close();
  }
}

export async function loadLocalModel(model: StoredModel, renderer: THREE.WebGLRenderer): Promise<THREE.Group> {
  const manager = new THREE.LoadingManager();
  const urls = new Map<string, string>();
  const files = new Map(model.files.map((file) => [file.path, file.blob]));
  const origin = 'https://local-model.invalid/';
  const entryURL = new URL(model.entry.split('/').map(encodeURIComponent).join('/'), origin);
  const resourceBase = new URL('.', entryURL).href;
  let resourceError = '';
  manager.setURLModifier((url) => {
    if (/^(data:|blob:)/i.test(url)) return url;
    const resolved = new URL(url, resourceBase);
    if (resolved.origin !== new URL(origin).origin) {
      resourceError = '模型引用了网络资源，请将纹理和缓冲文件一起打包后上传。';
      throw new Error(resourceError);
    }
    const path = decodeURIComponent(resolved.pathname.slice(1));
    const blob = files.get(path);
    if (!blob) {
      resourceError = `缺少模型资源：${path}。请上传完整 ZIP 或模型文件夹。`;
      throw new Error(resourceError);
    }
    if (!urls.has(path)) urls.set(path, URL.createObjectURL(blob));
    return urls.get(path)!;
  });
  manager.onError = () => { resourceError ||= '模型纹理或缓冲数据读取失败，请检查资源是否完整。'; };
  const draco = new DRACOLoader().setDecoderPath(`${import.meta.env.BASE_URL}vendor/draco/`);
  const ktx2 = new KTX2Loader().setTranscoderPath(`${import.meta.env.BASE_URL}vendor/basis/`).detectSupport(renderer);
  const loader = new GLTFLoader(manager).setDRACOLoader(draco).setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
  let root: THREE.Group | undefined;
  try {
    const blob = files.get(model.entry);
    if (!blob) throw new Error('模型入口文件丢失，请重新上传完整模型。');
    const bytes = await blob.arrayBuffer();
    const isJSON = /\.gltf$/i.test(model.entry);
    if (!isJSON && (bytes.byteLength < 20 || new DataView(bytes).getUint32(0, true) !== 0x46546c67)) throw new Error('GLB 文件已损坏或格式不符，请重新导出 glTF 2.0 / GLB 模型。');
    const data = isJSON ? new TextDecoder().decode(bytes) : bytes;
    const gltf = await loader.parseAsync(data, resourceBase);
    root = new THREE.Group();
    // glTF is Y-up; the existing scene/issue APIs use Z-up.
    root.rotation.x = Math.PI / 2;
    root.add(gltf.scene);
    root.updateMatrixWorld(true);
    if (resourceError) throw new Error(resourceError);
    let meshes = 0;
    root.traverse((object) => { if ((object as THREE.Mesh).isMesh) meshes++; });
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const extent = Math.max(size.x, size.y, size.z);
    if (!meshes || !Number.isFinite(extent) || extent <= 0) throw new Error('模型中没有可显示的三维网格，请检查导出内容。');
    const center = box.getCenter(new THREE.Vector3());
    // A stable centered scale avoids precision loss in large survey coordinates.
    root.scale.setScalar(200 / extent);
    root.position.copy(center).multiplyScalar(-200 / extent);
    root.updateMatrixWorld(true);
    return root;
  } catch (cause) {
    if (root) disposeModel(root);
    if (cause instanceof SyntaxError) throw new Error('模型格式无效或文件损坏，请重新导出 glTF 2.0 / GLB 模型。');
    throw cause;
  } finally {
    urls.forEach((url) => URL.revokeObjectURL(url));
    draco.dispose();
    ktx2.dispose();
  }
}

export async function validateLocalModel(model: StoredModel) {
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'low-power' });
  let root: THREE.Group | undefined;
  try {
    root = await loadLocalModel(model, renderer);
    const scene = new THREE.Scene();
    scene.add(root, new THREE.HemisphereLight(0xffffff, 0x73816b, 2));
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 5000);
    camera.up.set(0, 0, 1);
    camera.position.set(220, -220, 220);
    camera.lookAt(0, 0, 0);
    renderer.setSize(64, 64);
    renderer.render(scene, camera);
  } finally {
    if (root) disposeModel(root);
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
