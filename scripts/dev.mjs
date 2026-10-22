import { spawn } from 'node:child_process';
const children = [
  ['server/api.mjs'],
  ['node_modules/vite/bin/vite.js', '--mode', 'web'],
  ['node_modules/vite/bin/vite.js', '--mode', 'mobile'],
].map((args) => spawn(process.execPath, args, { stdio: 'inherit' }));
let closing = false;
const stop = () => {
  if (closing) return;
  closing = true;
  children.forEach((child) => child.kill('SIGTERM'));
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
children.forEach((child) =>
  child.on('exit', (code) => {
    if (!closing && code) {
      stop();
      process.exitCode = code;
    }
  }),
);
