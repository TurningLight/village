import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const reference = {position:[200,-200,160],target:[0,0,0]};
const record = (id='village-a') => ({version:2,modelId:id,image:new Blob(['png'],{type:'image/png'}),width:2048,height:2048,
  bounds:{minX:-100,minY:-100,maxX:100,maxY:100},transform:{kind:'orthographic'},reference,method:'orthographic',createdAt:new Date().toISOString()});
function transpile(path) { return ts.transpileModule(fs.readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText; }
function harness({saved=new Map(),online=true,create=async id=>record(id),failSave=false}={}) {
  let slots=[],cursor=0,pending=[],output,scheduled=false,closed=false,props={id:'village-a',enabled:true,online},renders=0,captures=0,writes=0,persisted=0;
  const resources=new Set();
  const equal=(a,b)=>a?.length===b?.length&&a.every((v,i)=>Object.is(v,b[i]));
  const schedule=()=>{if(!scheduled&&!closed){scheduled=true;queueMicrotask(()=>{scheduled=false;render();});}};
  const react={
    useState(initial){const i=cursor++;slots[i]??={value:typeof initial==='function'?initial():initial};return [slots[i].value,value=>{if(closed)return;const next=typeof value==='function'?value(slots[i].value):value;if(!Object.is(next,slots[i].value)){slots[i].value=next;schedule();}}];},
    useRef(initial){const i=cursor++;slots[i]??={current:initial};return slots[i];},
    useCallback(fn,deps){const i=cursor++;if(!slots[i]||!equal(deps,slots[i].deps))slots[i]={value:fn,deps};return slots[i].value;},
    useEffect(fn,deps){const i=cursor++;if(!slots[i]||!equal(deps,slots[i].deps)){const cleanup=slots[i]?.cleanup;slots[i]={deps};pending.push(()=>{cleanup?.();slots[i].cleanup=fn();});}},
  };
  const module={exports:{}};
  vm.runInNewContext(transpile('../src/lib/useModelProjection.ts'),{
    module,exports:module.exports,AbortController,Error,Map,URL:{createObjectURL(){const url=`blob:${resources.size}-${Math.random()}`;resources.add(url);return url;},revokeObjectURL:url=>resources.delete(url)},
    require(name){if(name==='react')return react;if(name==='./projectionCache')return {
      readProjection:async id=>saved.get(id)??null,validProjection:data=>!!data.image&&data.modelId,
      saveProjection:async data=>{writes++;if(failSave)throw new Error('quota');saved.set(data.modelId,data);},requestProjectionPersistence:()=>persisted++,
    };if(name==='./onlineProjection')return {captureOnlineProjection:async(...args)=>{captures++;return create(...args);}};throw new Error(name);},
  });
  function render(){if(closed)return;cursor=0;pending=[];output=module.exports.useModelProjection(props.id,props.enabled,()=>{},props.online);renders++;const effects=pending;pending=[];effects.forEach(fn=>fn());}
  render();
  return {
    get view(){return output.view;},get captures(){return captures;},get writes(){return writes;},get persisted(){return persisted;},resources,saved,
    source:value=>output.onSource(value),failure:(id,message)=>output.onFailure(id,message),retry:()=>output.view.retry(),save:()=>output.view.save(),
    update(value){props={...props,...value};render();},allowSave(){failSave=false;},
    close(){closed=true;slots.forEach(slot=>slot?.cleanup?.());},get renders(){return renders;},
  };
}
async function until(predicate) { for(let i=0;i<100;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,5));}assert.fail('state did not settle'); }

test('a saved 2D map opens without a 3D source, captures nothing, and restores after a fresh mount',async()=>{
  const saved=new Map([['village-a',record()]]);
  const first=harness({saved});await until(()=>first.view.cacheStatus==='saved');
  assert.equal(first.captures,0);assert.equal(first.writes,0);assert.equal(first.view.cacheChecked,true);
  first.close();assert.equal(first.resources.size,0);
  const reopened=harness({saved});await until(()=>reopened.view.cacheStatus==='saved');
  assert.equal(reopened.captures,0);assert.equal(reopened.view.data.modelId,'village-a');reopened.close();
});

test('online generation starts without loading the main viewer and a late viewerready never restarts or aborts it',async()=>{
  let finish,signal;
  const h=harness({create:(id,reference,options)=>{signal=options.signal;return new Promise(resolve=>finish=()=>resolve(record(id)));}});
  await until(()=>h.captures===1);
  h.source({modelId:'village-a',reference});await new Promise(resolve=>setTimeout(resolve,10));
  h.source({modelId:'village-a',reference:{position:[300,300,300],target:[0,0,0]}});
  await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(h.captures,1);assert.equal(signal.aborted,false);
  finish();await until(()=>h.view.cacheStatus==='saved');assert.equal(h.writes,1);assert.equal(h.persisted,1);h.close();
});

test('manual regeneration is consumed once; returning to the village or re-enabling the map uses the committed cache',async()=>{
  const h=harness({saved:new Map([['village-a',record()],['village-b',record('village-b')]])});
  await until(()=>h.view.cacheStatus==='saved');h.retry();await until(()=>h.writes===1&&h.view.cacheStatus==='saved');
  assert.equal(h.captures,1);
  h.update({enabled:false});h.update({enabled:true});await until(()=>h.view.cacheStatus==='saved');
  h.update({id:'village-b'});await until(()=>h.view.modelId==='village-b'&&h.view.cacheStatus==='saved');
  h.update({id:'village-a'});await until(()=>h.view.modelId==='village-a'&&h.view.cacheStatus==='saved');
  assert.equal(h.captures,1);assert.equal(h.writes,1);h.close();
});

test('quota failure leaves the finished map usable; retry saving writes the same image without generating again',async()=>{
  const h=harness({failSave:true});await until(()=>h.view.cacheStatus==='unavailable');
  assert.equal(h.view.status,'ready');const data=h.view.data;
  h.allowSave();h.save();await until(()=>h.view.cacheStatus==='saved');
  assert.equal(h.captures,1);assert.equal(h.writes,2);assert.equal(h.saved.get('village-a'),data);h.close();
});

test('local maps check persistent storage before requesting the model, and generate only after a source is ready',async()=>{
  const saved=harness({online:false,saved:new Map([['village-a',record()]])});
  await until(()=>saved.view.cacheStatus==='saved');saved.failure('village-a','3D network failed');
  await new Promise(resolve=>setTimeout(resolve,10));assert.equal(saved.view.status,'ready');saved.close();
  const missing=harness({online:false});await until(()=>missing.view.cacheChecked);
  assert.equal(missing.view.status,'waiting');let calls=0;
  missing.source({modelId:'village-a',reference,capture:async()=>{calls++;return record();}});
  await until(()=>missing.view.cacheStatus==='saved');assert.equal(calls,1);missing.close();
});

function loadAsync() {
  const module={exports:{}};
  vm.runInNewContext(transpile('../src/lib/projectionAsync.ts'),{module,exports:module.exports,setTimeout,clearTimeout,DOMException,Error,Date});
  return module.exports;
}
test('a missing hosted callback times out, cancellation rejects immediately, and late replies cannot win',async()=>{
  const {projectionRequest}=loadAsync();let late;
  const pending=projectionRequest(cb=>late=cb,undefined,'接口超时',15);
  await assert.rejects(pending,/接口超时/);late(null,'late');
  const controller=new AbortController();const cancelled=projectionRequest(()=>{},controller.signal,'接口超时',5000);controller.abort();
  await assert.rejects(cancelled,/取消/);
});

test('missing texture-complete events and continuous HD progress both have a short bounded wait',async()=>{
  const {trackProjectionTextures}=loadAsync();
  const noEvent=trackProjectionTextures();const started=Date.now();await noEvent.wait(undefined,undefined,40,10);
  assert(Date.now()-started<300);
  const streaming=trackProjectionTextures();const interval=setInterval(()=>streaming.update(0.5),2);
  try{const started=Date.now();await streaming.wait(undefined,undefined,50,10);assert(Date.now()-started<300);}finally{clearInterval(interval);}
  const complete=trackProjectionTextures();complete.update(1);
  const controller=new AbortController();controller.abort();await assert.rejects(complete.wait(controller.signal),/abort/i);
});
