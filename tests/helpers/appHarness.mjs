import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { webcrypto } from 'node:crypto';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '../..');
export function loadApp(storage = new Map(), failWrites = false) {
  const cache = new Map();
  const localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => {
      if (failWrites) throw new Error('quota');
      storage.set(key, value);
    },
  };
  function load(relative) {
    const file = path.resolve(root, relative);
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file, module);
    const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
      fileName: file,
    }).outputText;
    const localRequire = (name) => {
      if (!name.startsWith('.')) return require(name);
      let target = path.resolve(path.dirname(file), name);
      if (!path.extname(target)) target += fs.existsSync(target + '.tsx') ? '.tsx' : '.ts';
      return load(target);
    };
    vm.runInNewContext(
      output,
      {
        module,
        exports: module.exports,
        require: localRequire,
        localStorage,
        crypto: webcrypto,
        Date,
        Math,
        Map,
        Set,
        Error,
        console: { ...console, error() {} },
      },
      { filename: file },
    );
    return module.exports;
  }
  return { store: load('src/store/useAppStore.ts').useAppStore, load, storage };
}
