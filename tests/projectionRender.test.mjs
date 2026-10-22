import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';

function harness() {
  let encoded, renderCount = 0, outputCount = 0;
  const currentViewport = new THREE.Vector4(0, 0, 900, 600);
  const originalTarget = { name: 'main-render-target' };
  let currentTarget = originalTarget, scissorTest = true;
  const renderer = {
    toneMappingExposure: 1.4,
    getRenderTarget: () => currentTarget,
    setRenderTarget(value) { currentTarget = value; },
    getViewport: value => value.copy(currentViewport),
    getScissor: value => value.set(10, 10, 300, 200),
    getScissorTest: () => scissorTest,
    setScissorTest(value) { scissorTest = value; },
    setViewport(value) { currentViewport.copy(value); },
    setScissor() {}, clear() {},
    render(scene, camera) {
      renderCount++;
      scene.updateMatrixWorld(true);
      const meshes = [];
      scene.traverse(object => { if(object.isMesh) meshes.push(object); });
      assert.equal(meshes.length, 27);
      assert(camera.isOrthographicCamera);
      for (const mesh of meshes) {
        const vertices = mesh.geometry.attributes.position;
        for(let i=0;i<vertices.count;i++) {
          const ndc = new THREE.Vector3().fromBufferAttribute(vertices,i).applyMatrix4(mesh.matrixWorld).project(camera);
          assert(Math.abs(ndc.x)<1 && Math.abs(ndc.y)<1 && Math.abs(ndc.z)<1, `cropped building vertex ${ndc.toArray()}`);
        }
      }
    },
    readRenderTargetPixels(target,x,y,width,height,pixels) {
      assert.equal(outputCount,1);
      pixels.fill(200);
      pixels[0]=11; pixels[(height-1)*width*4]=99;
    },
  };
  const modules = new Map();
  function load(url) {
    if(modules.has(url.href)) return modules.get(url.href).exports;
    const module={exports:{}}; modules.set(url.href,module);
    const code=ts.transpileModule(fs.readFileSync(url,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    vm.runInNewContext(code,{
      module,exports:module.exports,
      require:name=>name==='three'?THREE:name.includes('OutputPass')?{OutputPass:class {
        render(renderer,output,input) { outputCount++; assert.notEqual(output,input); }
        dispose() {}
      }}:load(new URL(`${name}.ts`,url)),
      Blob, Error, Uint8Array, Uint8ClampedArray,
      ImageData:class { constructor(data,width,height) { Object.assign(this,{data,width,height}); } },
      document:{createElement:()=>({ getContext:()=>({ putImageData(image) {encoded=image;} }),toBlob:cb=>cb(new Blob(['png'],{type:'image/png'})) })},
    });
    return module.exports;
  }
  const root=new THREE.Group();
  root.rotation.z=0.51;
  root.position.set(100, -40, 17);
  for(let i=0;i<27;i++) {
    const group=new THREE.Group();
    group.position.set(i*10-130,(i%3)*15,i%2*25);
    group.rotation.z=i*0.3;
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(6,9,i===26?180:12));
    group.add(mesh);root.add(group);
  }
  const parent=new THREE.Scene(),before=new THREE.Group(),after=new THREE.Group();
  parent.add(before,root,after);
  const project=load(new URL('../src/lib/localProjection.ts',import.meta.url)).renderOrthographicProjection;
  return {project,renderer,root,parent,before,after,get encoded(){return encoded;},get renderCount(){return renderCount;},originalTarget,currentViewport};
}

test('actual orthographic render includes all nested edge buildings and heights, flips pixels and restores the live viewer',async()=>{
  const h=harness();
  const data=await h.project(h.renderer,h.root,'any-village',{position:[300,-300,200],target:[0,0,0]});
  assert.equal(data.method,'orthographic');
  assert.equal(h.renderCount,1);
  assert.equal(h.encoded.data[0],99);
  assert.equal(h.encoded.data[(h.encoded.height-1)*h.encoded.width*4],11);
  assert.equal(h.root.parent,h.parent);
  assert.deepEqual(h.parent.children,[h.before,h.root,h.after]);
  assert.equal(h.renderer.getRenderTarget(),h.originalTarget);
  assert.equal(h.renderer.getScissorTest(),true);
  assert.equal(h.renderer.toneMappingExposure,1.4);
  assert.deepEqual(h.currentViewport.toArray(),[0,0,900,600]);
});

test('failed or cancelled generation leaves the live model and renderer intact',async()=>{
  const h=harness();h.renderer.render=()=>{throw new Error('GPU allocation failed');};
  await assert.rejects(h.project(h.renderer,h.root,'other-village',{position:[300,-300,200],target:[0,0,0]}),/GPU allocation failed/);
  assert.equal(h.root.parent,h.parent);assert.deepEqual(h.parent.children,[h.before,h.root,h.after]);
  assert.equal(h.renderer.getRenderTarget(),h.originalTarget);
  const controller=new AbortController();controller.abort();
  await assert.rejects(h.project(h.renderer,h.root,'cancelled',{position:[1,1,1],target:[0,0,0]},{signal:controller.signal}),/abort/i);
  assert.equal(h.renderCount,0);
});
