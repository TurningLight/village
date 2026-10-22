import { createServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createVoiceMiddleware } from './voice.mjs';
import { createIssueService, validIssue } from './issues.mjs';
import { createMapService, MapServiceError, MAX_MAP_REQUEST_BYTES } from './maps.mjs';
import { createGovernanceService, createGovernanceMiddleware } from './governance.mjs';
export function createApiServer({
  env = process.env,
  file = resolve('.local-data/issues.json'),
  mapDirectory = join(dirname(file), 'maps'),
  governanceFile = join(dirname(file), 'governance.json'),
  fetchImpl = fetch,
} = {}) {
  const voice = createVoiceMiddleware({ env, fetchImpl }),
    issues = createIssueService(file),
    maps = createMapService(mapDirectory),
    governance = createGovernanceService({
      file: governanceFile,
      readIssues: issues.read,
      env,
      fetchImpl,
    }),
    governanceMiddleware = createGovernanceMiddleware(governance);
  // Recovery and initial ingestion are independent of opening the terminal page.
  void governance.reconcile().catch(() => {});
  const send = (res, status, value) => {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(JSON.stringify(value));
  };
  const server = createServer(
    (req, res) =>
      void voice(req, res, () =>
        governanceMiddleware(req, res, async () => {
          try {
            const path = (req.url || '').split('?')[0];
            if (path === '/api/health') return send(res, 200, { ok: true });
            if (path === '/api/maps' || path.startsWith('/api/maps/')) {
              try {
                if (req.method === 'GET' && path === '/api/maps')
                  return send(res, 200, await maps.read());
                const image = /^\/api\/maps\/images\/([a-f0-9]{64})\.png$/.exec(path);
                if (req.method === 'GET' && image) {
                  const bytes = await maps.image(image[1]);
                  res.writeHead(200, {
                    'Content-Type': 'image/png',
                    'Content-Length': bytes.length,
                    'Cache-Control': 'public, max-age=31536000, immutable',
                    'X-Content-Type-Options': 'nosniff',
                  });
                  return res.end(bytes);
                }
                if (
                  req.method !== 'PUT' ||
                  path === '/api/maps' ||
                  path.startsWith('/api/maps/images/')
                )
                  return send(res, 404, { error: { message: '地图接口不存在。' } });
                if (req.headers.origin) {
                  let host;
                  try {
                    host = new URL(req.headers.origin).host;
                  } catch {
                    /* Invalid origin is denied. */
                  }
                  if (host !== req.headers.host)
                    return send(res, 403, { error: { message: '请求来源无效。' } });
                }
                const chunks = [];
                let size = 0;
                for await (const chunk of req) {
                  size += chunk.length;
                  if (size > MAX_MAP_REQUEST_BYTES)
                    return send(res, 413, {
                      error: { message: '二维底图过大，请重新生成后重试。' },
                    });
                  chunks.push(chunk);
                }
                let value;
                try {
                  value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
                } catch {
                  return send(res, 400, { error: { message: '地图请求内容无效。' } });
                }
                if (path === '/api/maps/active') return send(res, 200, await maps.select(value));
                let modelId;
                try {
                  modelId = decodeURIComponent(path.slice('/api/maps/'.length));
                } catch {
                  return send(res, 400, { error: { message: '模型标识无效。' } });
                }
                if (!value || value.modelId !== modelId)
                  return send(res, 400, { error: { message: '模型标识与底图不一致。' } });
                return send(res, 200, await maps.publish(value));
              } catch (error) {
                return send(res, error instanceof MapServiceError ? error.status : 500, {
                  error: {
                    message:
                      error instanceof MapServiceError
                        ? error.message
                        : '村庄底图暂时无法保存，请稍后重试。',
                  },
                });
              }
            }
            const report = path === '/api/issues/report';
            if (path !== '/api/issues' && !report)
              return send(res, 404, { error: { message: '接口不存在。' } });
            if (req.method === 'GET' && !report)
              return send(res, 200, { issues: await issues.read() });
            if (req.method !== 'POST')
              return send(res, 405, { error: { message: '请求方法无效。' } });
            if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host)
              return send(res, 403, { error: { message: '请求来源无效。' } });
            let size = 0;
            const chunks = [];
            for await (const chunk of req) {
              size += chunk.length;
              if (size > 16 * 1024 * 1024)
                return send(res, 413, { error: { message: '本次记录太大，请减少照片后重试。' } });
              chunks.push(chunk);
            }
            let body;
            try {
              body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            } catch {
              return send(res, 400, { error: { message: '请求内容无效。' } });
            }
            if (
              !Array.isArray(body.issues) ||
              body.issues.length > 1000 ||
              !body.issues.every(validIssue)
            )
              return send(res, 400, { error: { message: '事件内容不完整，请检查后重试。' } });
            const commit = () => issues.merge(body.issues, { createOnly: report });
            const saved = report
              ? await maps.withCurrentProjections(
                  body.issues.flatMap((issue) =>
                    issue.projectionAnchor ? [issue.projectionAnchor] : [],
                  ),
                  commit,
                )
              : await commit();
            // Persist the queue before acknowledging completion; model generation runs in the background.
            // A governance storage error must never undo a successfully saved event.
            await governance.reconcile(saved).catch(() => {});
            send(res, 200, { issues: saved });
          } catch (error) {
            if (!res.writableEnded)
              send(res, error instanceof MapServiceError ? error.status : 500, {
                error: {
                  ...(error instanceof MapServiceError && error.code ? { code: error.code } : {}),
                  message:
                    error instanceof MapServiceError
                      ? error.message
                      : '记录暂时无法保存，请稍后重试。',
                },
              });
          }
        }),
      ),
  );
  server.on('close', () => governance.close());
  return server;
}
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  for (const file of ['.env', '.env.local']) if (existsSync(file)) process.loadEnvFile(file);
  const port = Number(process.env.API_PORT) || 5190;
  createApiServer().listen(port, '127.0.0.1', () =>
    console.log(`Shared local API: http://127.0.0.1:${port}`),
  );
}
