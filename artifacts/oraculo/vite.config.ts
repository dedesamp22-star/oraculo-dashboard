import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';
import {
  APP_BUILD_CHANNEL,
  APP_DESCRIPTION,
  APP_DISPLAY_NAME,
  APP_NAME,
  APP_VERSION,
} from '../shared/appVersion';

const rawPort = process.env.PORT ?? '5173';

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH ?? '/';

function appMetadataHtml(): Plugin {
  return {
    name: 'oraculo-app-metadata',
    transformIndexHtml(html) {
      return html
        .replaceAll('%APP_TITLE%', `${APP_NAME} ${APP_VERSION}`)
        .replaceAll('%APP_DESCRIPTION%', APP_DESCRIPTION)
        .replaceAll('%APP_NAME%', APP_NAME)
        .replaceAll('%APP_DISPLAY_NAME%', APP_DISPLAY_NAME);
    },
  };
}

function pwaManifest() {
  return {
    name: `${APP_NAME} ${APP_VERSION}`,
    short_name: APP_NAME,
    description: APP_DESCRIPTION,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    theme_color: '#00f0ff',
    background_color: '#05070d',
    categories: ['finance', 'productivity'],
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
    ],
  };
}

function offlineHtml(): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#00f0ff" />
    <title>${APP_NAME} ${APP_VERSION} - Sem conexão</title>
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #05070d; color: #f5f7fb; font-family: Inter, system-ui, sans-serif; }
      main { width: min(88vw, 420px); border: 1px solid rgba(0,240,255,.35); padding: 24px; background: rgba(0,240,255,.05); }
      h1 { margin: 0 0 12px; font-size: 20px; letter-spacing: .12em; text-transform: uppercase; }
      p { margin: 0; color: rgba(245,247,251,.72); line-height: 1.55; }
    </style>
  </head>
  <body>
    <main>
      <h1>${APP_DISPLAY_NAME}</h1>
      <p>Sem conexão. Por segurança, dados demo, sessão, posições e histórico não são exibidos offline. Reconecte para carregar o estado oficial do servidor.</p>
    </main>
  </body>
</html>`;
}

function serviceWorkerSource(): string {
  const cacheName = `oraculo-${APP_VERSION}-${APP_BUILD_CHANNEL}-static`;
  return `
const CACHE_NAME = ${JSON.stringify(cacheName)};
const OFFLINE_URL = '/offline.html';
const STATIC_EXTENSIONS = ['.js', '.css', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.woff', '.woff2', '.ico'];

function isApiRequest(url) {
  return url.pathname.startsWith('/api/');
}

function isStaticRequest(request, url) {
  return request.method === 'GET' && STATIC_EXTENSIONS.some((extension) => url.pathname.endsWith(extension));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll([OFFLINE_URL, '/icon.svg']))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;
  if (isApiRequest(url)) {
    event.respondWith(fetch(request, { cache: 'no-store' }));
    return;
  }
  if (request.method !== 'GET') return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .catch(() => caches.match(OFFLINE_URL, { cacheName: CACHE_NAME })),
    );
    return;
  }

  if (!isStaticRequest(request, url)) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      const network = fetch(request).then((response) => {
        if (response.ok && response.type === 'basic') void cache.put(request, response.clone());
        return response;
      }).catch(() => cached);
      return cached ?? network;
    }),
  );
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }
  const title = typeof payload.title === 'string' ? payload.title : 'Oraculo';
  const body = typeof payload.body === 'string' ? payload.body : 'Novo alerta do Oraculo.';
  const url = typeof payload.url === 'string' && payload.url.startsWith('/') ? payload.url : '/';
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: '/icon.svg',
    badge: '/icon.svg',
    tag: typeof payload.tag === 'string' ? payload.tag : 'oraculo-alert',
    data: { url },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});
`.trim();
}

function pwaAssets(): Plugin {
  return {
    name: 'oraculo-pwa-assets',
    configureServer(server) {
      server.middlewares.use('/manifest.webmanifest', (_req, res) => {
        res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
        res.end(JSON.stringify(pwaManifest(), null, 2));
      });
      server.middlewares.use('/sw.js', (_req, res) => {
        res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
        res.end(serviceWorkerSource());
      });
      server.middlewares.use('/offline.html', (_req, res) => {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(offlineHtml());
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: JSON.stringify(pwaManifest(), null, 2) });
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: serviceWorkerSource() });
      this.emitFile({ type: 'asset', fileName: 'offline.html', source: offlineHtml() });
    },
  };
}

export default defineConfig({
  base: basePath,
  plugins: [
    appMetadataHtml(),
    pwaAssets(),
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== 'production' &&
    process.env.REPL_ID !== undefined
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, '..'),
            }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@shared': path.resolve(import.meta.dirname, '..', 'shared'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
    fs: {
      strict: true,
      allow: [
        path.resolve(import.meta.dirname),
        path.resolve(import.meta.dirname, '..', 'shared'),
      ],
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
