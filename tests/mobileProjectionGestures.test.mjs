import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

/** Small hook runner to exercise the actual component's pointer handlers.
 * It does not replace browser layout testing; the viewport is deterministic. */
function harness({ shared = true } = {}) {
  const slots = [],
    cache = new Map(),
    picks = [];
  let cursor = 0,
    effects = [],
    output;
  const same = (a, b) => a?.length === b?.length && a.every((n, i) => Object.is(n, b[i]));
  const react = {
    useState(initial) {
      const i = cursor++;
      slots[i] ??= { value: initial };
      return [
        slots[i].value,
        (next) => {
          slots[i].value = typeof next === 'function' ? next(slots[i].value) : next;
        },
      ];
    },
    useRef(initial) {
      const i = cursor++;
      slots[i] ??= { current: initial };
      return slots[i];
    },
    useMemo(fn) {
      cursor++;
      return fn();
    },
    useEffect(fn, deps) {
      const i = cursor++;
      if (!slots[i] || !same(slots[i].deps, deps)) {
        slots[i] = { deps };
        effects.push(fn);
      }
    },
  };
  const jsx = (type, props) => ({ type, props });
  function load(url) {
    if (cache.has(url.href)) return cache.get(url.href).exports;
    const module = { exports: {} };
    cache.set(url.href, module);
    const code = ts.transpileModule(fs.readFileSync(url, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText;
    vm.runInNewContext(code, {
      module,
      exports: module.exports,
      ResizeObserver: class {
        constructor(fn) {
          this.fn = fn;
        }
        observe() {
          this.fn([{ contentRect: { width: 400, height: 300 } }]);
        }
        disconnect() {}
      },
      require(name) {
        if (name === 'react') return react;
        if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'fragment' };
        if (name === 'lucide-react') return new Proxy({}, { get: (_target, key) => String(key) });
        if (name.endsWith('.css')) return {};
        return load(new URL(`${name}.ts`, url));
      },
      Number,
      Date,
      Promise,
      ArrayBuffer,
    });
    return module.exports;
  }
  const Component = load(
    new URL('../src/mobile/components/ProjectionMap.tsx', import.meta.url),
  ).default;
  const projection = {
    modelId: 'real-test',
    createdAt: '2026-10-22T04:00:00Z',
    revision: 'capture-1',
    imageUrl: '/api/test.png',
    width: 800,
    height: 400,
    bounds: { minX: -100, maxX: 100, minY: -50, maxY: 50 },
    transform: { kind: 'orthographic' },
    reference: { position: [50, -100, 200], target: [0, 0, 0] },
  };
  const props = {
    map: {
      modelId: 'real-test',
      name: '测试村',
      kind: 'real',
      projection: shared ? projection : undefined,
    },
    onPick: (point, anchor) => picks.push({ point, anchor }),
  };
  const viewport = { getBoundingClientRect: () => ({ left: 0, top: 0 }), setPointerCapture() {} };
  const nodes = (node) =>
    !node || typeof node !== 'object'
      ? []
      : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)];
  function render() {
    cursor = 0;
    effects = [];
    const child = Component(props);
    output = child.type(child.props);
    nodes(output).forEach((node) => {
      if (node.props?.ref) node.props.ref.current = viewport;
    });
    const pending = effects;
    effects = [];
    pending.forEach((fn) => fn());
  }
  render();
  render();
  const find = (predicate) => nodes(output).find(predicate);
  const state = () => find((node) => node.props?.className?.startsWith('m-projection-viewport'));
  return {
    picks,
    find,
    ready() {
      find((node) => node.type === 'img').props.onLoad();
      render();
    },
    pointer(kind, id, x, y) {
      state().props[kind]({
        pointerId: id,
        pointerType: 'touch',
        button: 0,
        clientX: x,
        clientY: y,
        currentTarget: viewport,
        target: { closest: () => null },
      });
      render();
    },
    click(label) {
      find((node) => node.props?.['aria-label'] === label).props.onClick();
      render();
    },
    image() {
      return find((node) => node.type === 'img');
    },
  };
}

test('light tap selects the actual image UV; letterboxed padding never becomes a false location', () => {
  const h = harness();
  h.ready();
  h.pointer('onPointerDown', 1, 250, 170);
  h.pointer('onPointerUp', 1, 250, 170);
  assert.equal(h.picks.length, 1);
  assert.equal(h.picks[0].anchor.uv[0], 0.625);
  assert.equal(h.picks[0].anchor.uv[1], 0.6);
  assert.equal(h.picks[0].anchor.modelId, 'real-test');
  h.pointer('onPointerDown', 2, 200, 10);
  h.pointer('onPointerUp', 2, 200, 10);
  assert.equal(h.picks.length, 1);
});

test('drag, pinch and pointer cancellation never submit a location, while explicit center picking accounts for pan and zoom', () => {
  const h = harness();
  h.ready();
  h.pointer('onPointerDown', 1, 100, 150);
  h.pointer('onPointerMove', 1, 180, 150);
  h.pointer('onPointerUp', 1, 180, 150);
  assert.equal(h.picks.length, 0);
  h.click('在地图中心选点');
  assert.equal(h.picks.length, 1);
  assert.equal(h.picks[0].anchor.uv[0], 0.3);
  h.click('显示完整地图');
  h.pointer('onPointerDown', 2, 150, 150);
  h.pointer('onPointerDown', 3, 250, 150);
  h.pointer('onPointerMove', 2, 100, 150);
  h.pointer('onPointerMove', 3, 300, 150);
  assert.match(h.image().props.style.transform, /scale\(2\)/);
  h.pointer('onPointerUp', 2, 100, 150);
  h.pointer('onPointerUp', 3, 300, 150);
  assert.equal(h.picks.length, 1);
  h.pointer('onPointerDown', 4, 200, 150);
  h.pointer('onPointerCancel', 4, 200, 150);
  assert.equal(h.picks.length, 1);
});

test('unshared maps never display an invented demo image and loading images cannot be picked', () => {
  const missing = harness({ shared: false });
  assert.equal(missing.image(), undefined);
  missing.pointer('onPointerDown', 1, 200, 150);
  missing.pointer('onPointerUp', 1, 200, 150);
  assert.equal(missing.picks.length, 0);
  const loading = harness();
  loading.pointer('onPointerDown', 1, 200, 150);
  loading.pointer('onPointerUp', 1, 200, 150);
  assert.equal(loading.picks.length, 0);
});
