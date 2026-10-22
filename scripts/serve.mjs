import { spawn } from 'node:child_process';
const jobs = [
  ['server/api.mjs'],
  ['server/start.mjs', '--web'],
  ['server/start.mjs', '--mobile'],
].map((args) => spawn(process.execPath, args, { stdio: 'inherit' }));
let closing = false;
const stop = () => {
  if (closing) return;
  closing = true;
  jobs.forEach((job) => job.kill('SIGTERM'));
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
jobs.forEach((job) =>
  job.on('exit', (code) => {
    if (code && !closing) {
      stop();
      process.exitCode = code;
    }
  }),
);
