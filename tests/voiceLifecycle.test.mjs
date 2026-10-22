import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function harness({
  enabled = true,
  start = async () => {},
  format = async () => ({ title: '路灯故障' }),
  transcribe = async () => '桥头路灯不亮',
} = {}) {
  let slots = [],
    cursor = 0,
    pending = [],
    output,
    closed = false,
    scheduled = false,
    now = 0;
  const intervals = new Map(),
    events = new Map(),
    calls = { start: 0, stop: 0, cancel: 0, transcribe: 0, format: 0, fields: [] };
  const equal = (a, b) => a?.length === b?.length && a.every((v, i) => Object.is(v, b[i]));
  const schedule = () => {
    if (!scheduled && !closed) {
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        render();
      });
    }
  };
  const react = {
    useState(initial) {
      const i = cursor++;
      slots[i] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [
        slots[i].value,
        (value) => {
          if (closed) return;
          const next = typeof value === 'function' ? value(slots[i].value) : value;
          if (!Object.is(next, slots[i].value)) {
            slots[i].value = next;
            schedule();
          }
        },
      ];
    },
    useRef(initial) {
      const i = cursor++;
      slots[i] ??= { current: initial };
      return slots[i];
    },
    useCallback(fn, deps) {
      const i = cursor++;
      if (!slots[i] || !equal(deps, slots[i].deps)) slots[i] = { value: fn, deps };
      return slots[i].value;
    },
    useEffect(fn, deps) {
      const i = cursor++;
      if (!slots[i] || !equal(deps, slots[i].deps)) {
        const cleanup = slots[i]?.cleanup;
        slots[i] = { deps };
        pending.push(() => {
          cleanup?.();
          slots[i].cleanup = fn();
        });
      }
    },
  };
  const document = {
    hidden: false,
    addEventListener: (name, fn) => events.set(name, fn),
    removeEventListener: (name) => events.delete(name),
  };
  const module = { exports: {} };
  const code = ts.transpileModule(
    fs.readFileSync(new URL('../src/mobile/services/useVoiceCapture.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    document,
    Date: { now: () => now },
    AbortController,
    Error,
    setInterval: (fn) => {
      const id = Symbol();
      intervals.set(id, fn);
      return id;
    },
    clearInterval: (id) => intervals.delete(id),
    require(name) {
      if (name === 'react') return react;
      if (name.includes('browserMedia'))
        return {
          BrowserRecorder: class {
            start() {
              calls.start++;
              return start();
            }
            async stop() {
              calls.stop++;
              return { blob: new Blob(['wav']), durationMs: 1000 };
            }
            cancel() {
              calls.cancel++;
            }
          },
        };
      if (name.includes('voiceHttp'))
        return {
          voiceGateway: {
            config: async () => ({ enabled }),
            transcribe: async (...args) => {
              calls.transcribe++;
              return transcribe(...args);
            },
            format: async (...args) => {
              calls.format++;
              return format(...args);
            },
          },
        };
      throw new Error(name);
    },
  });
  function render() {
    if (closed) return;
    cursor = 0;
    pending = [];
    output = module.exports.useVoiceCapture((fields) => calls.fields.push(fields));
    const effects = pending;
    pending = [];
    effects.forEach((fn) => fn());
  }
  render();
  return {
    get voice() {
      return output;
    },
    calls,
    intervals,
    advance(ms) {
      now += ms;
      [...intervals.values()].forEach((fn) => fn());
    },
    hide() {
      document.hidden = true;
      events.get('visibilitychange')?.();
    },
    close() {
      closed = true;
      slots.forEach((slot) => slot?.cleanup?.());
    },
  };
}
async function until(predicate) {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  assert.fail('voice state did not settle');
}

test('unconfigured voice never opens the microphone or fabricates text', async () => {
  const h = harness({ enabled: false });
  await until(() => h.voice.enabled === false);
  await h.voice.begin();
  await until(() => h.voice.phase === 'error');
  assert.equal(h.calls.start, 0);
  assert.equal(h.calls.transcribe, 0);
  assert.equal(h.voice.transcript, '');
  h.close();
});
test('releasing while microphone permission is pending cancels late startup without transcribing', async () => {
  let ready;
  const h = harness({ start: () => new Promise((resolve) => (ready = resolve)) });
  await until(() => h.voice.enabled === true);
  const pending = h.voice.begin();
  await until(() => h.voice.phase === 'preparing');
  await h.voice.release();
  ready();
  await pending;
  await until(() => h.voice.phase === 'idle');
  assert.equal(h.calls.transcribe, 0);
  assert.equal(h.intervals.size, 0);
  h.close();
});
test('release runs ASR then formatter; failed formatting retains editable transcript for retry', async () => {
  let fail = true;
  const h = harness({
    format: async () => {
      if (fail) throw new Error('整理服务繁忙');
      return { title: '桥头灯故障' };
    },
  });
  await until(() => h.voice.enabled === true);
  await h.voice.begin();
  await until(() => h.voice.phase === 'recording');
  await h.voice.release();
  await until(() => h.voice.phase === 'error');
  assert.equal(h.voice.transcript, '桥头路灯不亮');
  assert.equal(h.calls.fields.length, 0);
  fail = false;
  h.voice.setTranscript('东侧桥头路灯不亮');
  await until(() => h.voice.transcript === '东侧桥头路灯不亮');
  await h.voice.retryFormat();
  await until(() => h.voice.phase === 'idle');
  assert.equal(h.calls.transcribe, 1);
  assert.equal(h.calls.format, 2);
  assert.equal(h.calls.fields[0].title, '桥头灯故障');
  h.close();
});
test('60-second limit releases once; hiding or unmounting cancels recording and ignores late ASR', async () => {
  const timed = harness();
  await until(() => timed.voice.enabled === true);
  await timed.voice.begin();
  await until(() => timed.voice.phase === 'recording');
  timed.advance(60000);
  await until(() => timed.voice.phase === 'idle');
  timed.advance(60000);
  assert.equal(timed.calls.stop, 1);
  assert.equal(timed.calls.fields.length, 1);
  timed.close();
  let resolveText;
  const h = harness({ transcribe: () => new Promise((resolve) => (resolveText = resolve)) });
  await until(() => h.voice.enabled === true);
  await h.voice.begin();
  await until(() => h.voice.phase === 'recording');
  h.hide();
  await until(() => h.voice.phase === 'idle');
  assert.equal(h.calls.transcribe, 0);
  await h.voice.begin();
  await until(() => h.voice.phase === 'recording');
  const processing = h.voice.release();
  await until(() => h.calls.transcribe === 1);
  h.close();
  resolveText('晚到的识别结果');
  await processing;
  assert.equal(h.calls.fields.length, 0);
  assert.equal(h.intervals.size, 0);
});
