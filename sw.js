/* ERP JW Finance - Service Worker (PWA) - v8.3.0
   Observação: SW só funciona em http(s) ou localhost, não em file://
*/
const CACHE_NAME = 'erp-jw-finance-v8.3.0';
const ASSETS = [
  './',
  './index.html',
  './dashboard.html',
  './consolidado.html',
  './historico.html',
  './charts.html',
  './metas.html',
  './perfil.html',
  './gerenciadores.html',
  './css/style.css',
  './manifest.json',
  './js/core/firebase-init.js',
  './js/core/core.js',
  './js/utils/ui.js',
  './js/core/config.js',
  './js/features/dashboard.js',
  './js/features/consolidado.js',
  './js/features/historico.js',
  './js/features/charts.js',
  './js/features/metas.js',
  './js/features/perfil.js',
  './js/features/gerenciadores.js',
  './js/core/constants.js',
  './js/features/index.js',
  './js/sync/sync-service.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => (k !== CACHE_NAME) ? caches.delete(k) : null)))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
