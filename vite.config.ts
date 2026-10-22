import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
export default defineConfig(({ mode }) => {
  const secureMobile = mode === 'mobile-https',
    mobile = mode === 'mobile' || secureMobile,
    env = loadEnv(mode, process.cwd(), '');
  const target = `http://127.0.0.1:${env.API_PORT || process.env.API_PORT || 5190}`;
  let https;
  if (secureMobile) {
    const cert = resolve(
        env.MOBILE_HTTPS_CERT_FILE ||
          process.env.MOBILE_HTTPS_CERT_FILE ||
          '.certs/mobile-cert.pem',
      ),
      key = resolve(
        env.MOBILE_HTTPS_KEY_FILE || process.env.MOBILE_HTTPS_KEY_FILE || '.certs/mobile-key.pem',
      );
    try {
      https = { cert: readFileSync(cert), key: readFileSync(key) };
    } catch {
      throw new Error(
        '手机HTTPS证书尚未准备好。请先按 docs/语音配置与手机HTTPS测试.md 生成 .certs/mobile-cert.pem 和 .certs/mobile-key.pem，或配置 MOBILE_HTTPS_CERT_FILE / MOBILE_HTTPS_KEY_FILE。',
      );
    }
  }
  return {
    cacheDir: secureMobile
      ? 'node_modules/.vite-mobile-https'
      : mobile
        ? 'node_modules/.vite-mobile'
        : 'node_modules/.vite-web',
    plugins: [
      react(),
      ...(mobile
        ? [
            {
              name: 'mobile-entry',
              configureServer(server: import('vite').ViteDevServer) {
                server.middlewares.use((req, _res, next) => {
                  const path = (req.url || '').split('?')[0];
                  if (path === '/dev/phone-rootCA.crt') {
                    if (req.method !== 'GET' && req.method !== 'HEAD') {
                      _res.writeHead(405, { Allow: 'GET, HEAD' });
                      _res.end();
                      return;
                    }
                    try {
                      const certificate = readFileSync(resolve('.certs/phone-rootCA.crt'));
                      _res.writeHead(200, {
                        'Content-Type': 'application/x-x509-ca-cert',
                        'Content-Disposition': 'attachment; filename="phone-rootCA.crt"',
                        'Cache-Control': 'no-store',
                        'X-Content-Type-Options': 'nosniff',
                      });
                      _res.end(req.method === 'HEAD' ? undefined : certificate);
                    } catch {
                      _res.writeHead(404);
                      _res.end('Development CA certificate is not prepared.');
                    }
                    return;
                  }
                  if (
                    (path === '/' || path === '/mobile' || path.startsWith('/mobile/')) &&
                    !path.includes('.')
                  )
                    req.url = '/mobile.html';
                  next();
                });
              },
              configurePreviewServer(server: import('vite').PreviewServer) {
                server.middlewares.use((req, _res, next) => {
                  const path = (req.url || '').split('?')[0];
                  if (
                    (path === '/' || path === '/mobile' || path.startsWith('/mobile/')) &&
                    !path.includes('.')
                  )
                    req.url = '/mobile.html';
                  next();
                });
              },
            },
          ]
        : []),
    ],
    server: {
      host: '0.0.0.0',
      port: secureMobile
        ? Number(env.MOBILE_HTTPS_PORT || process.env.MOBILE_HTTPS_PORT || 5175)
        : mobile
          ? 5174
          : 5173,
      strictPort: true,
      https,
      fs: {
        deny: [
          '.env',
          '.env.*',
          '*.{crt,pem,key}',
          '**/.git/**',
          '**/.certs/**',
          '**/.local-data/**',
        ],
      },
      proxy: { '/api': { target } },
    },
    preview: {
      host: '0.0.0.0',
      port: mobile ? 5184 : 5181,
      strictPort: true,
      proxy: { '/api': { target } },
    },
    build: {
      outDir: mobile ? 'dist/mobile' : 'dist/web',
      rollupOptions: { input: resolve(mobile ? 'mobile.html' : 'index.html') },
    },
  };
});
