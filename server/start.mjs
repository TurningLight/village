import { createServer, request as proxyRequest } from 'node:http';
import { existsSync, createReadStream, statSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
for (const file of ['.env', '.env.local']) if (existsSync(file)) process.loadEnvFile(file);
const mobile = process.argv.includes('--mobile'),
  root = resolve(mobile ? 'dist/mobile' : 'dist/web');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
};
const port =
  Number(mobile ? process.env.MOBILE_PORT : process.env.WEB_PORT) || (mobile ? 5184 : 5181);
createServer((req, res) => {
  if (req.url?.startsWith('/api/')) {
    const upstream = proxyRequest(
      {
        hostname: '127.0.0.1',
        port: Number(process.env.API_PORT) || 5190,
        path: req.url,
        method: req.method,
        headers: req.headers,
      },
      (response) => {
        res.writeHead(response.statusCode || 502, response.headers);
        response.pipe(res);
      },
    );
    upstream.on('error', () => {
      if (!res.headersSent) res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: '本地服务未启动，请稍后重试。' } }));
    });
    req.pipe(upstream);
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400);
    return res.end();
  }
  let file = resolve(root, `.${pathname}`);
  if (!file.startsWith(`${root}${sep}`) && file !== root) {
    res.writeHead(403);
    return res.end();
  }
  if (!extname(pathname)) file = resolve(root, mobile ? 'mobile.html' : 'index.html');
  if (!existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404);
    return res.end('Not found');
  }
  res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' });
  createReadStream(file).pipe(res);
}).listen(port, process.env.HOST || '0.0.0.0', () =>
  console.log(`${mobile ? 'Resident' : 'Management'} app: http://localhost:${port}`),
);
