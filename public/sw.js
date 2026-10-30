// GHOST PROTOCOL - Offline-First Service Worker (PWA & Tactical Field Cache)
const CACHE_NAME = 'ghost-protocol-shell-v4';
const DATA_CACHE_NAME = 'ghost-protocol-data-v4';
const TILE_CACHE_NAME = 'ghost-protocol-tiles-v4';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/assets/squadron-showdown/characters/naresh_clean.png',
  '/assets/squadron-showdown/characters/lexi_clean.png',
  '/assets/squadron-showdown/characters/penguin_bhai_clean.png',
  '/assets/squadron-showdown/characters/girimon_clean.png',
  '/assets/squadron-showdown/characters/dq_sprite.png',
  '/assets/aistudio/dheeraj_b0cdc76b.png',
  '/assets/aistudio/vijay_e1402ef4.png',
  '/assets/aistudio/anhiyan_9b0cd04d.png',
  '/assets/squadron-showdown/characters/fighter_009_kael.svg',
  '/assets/squadron-showdown/characters/fighter_010_zara.svg',
  '/assets/squadron-showdown/characters/fighter_011_rex.svg',
  '/assets/squadron-showdown/characters/fighter_012_kenji.svg'
];

const CACHEABLE_API_PREFIXES = [
  '/api/admin/telemetry-config',
  '/api/charging',
  '/api/autopilot/missions',
  '/api/autopilot/weather',
  '/api/places/',
  '/api/jet-engineer/submissions',
  '/api/jet-engineer/history',
  '/api/rides',
  '/api/emergency',
  '/api/problems',
  '/api/modifications',
  '/api/marketplace',
  '/api/service-reviews',
  '/api/discussions',
  '/api/polls',
  '/api/petitions',
  '/api/contributions',
  '/api/contribution-config',
  '/api/notifications'
];

function createOfflineRadarTileResponse(urlPathname) {
  const parts = String(urlPathname || '').split('/').filter(Boolean);
  const z = parts[0] || '0';
  const x = parts[1] || '0';
  const y = (parts[2] || '0').replace('.png', '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
    <rect width="256" height="256" fill="#090D14"/>
    <path d="M0 64H256M0 128H256M0 192H256M64 0V256M128 0V256M192 0V256" stroke="#152030" stroke-width="1"/>
    <rect width="256" height="256" fill="none" stroke="#1E2D42" stroke-width="1" stroke-dasharray="4 4"/>
    <circle cx="128" cy="128" r="3" fill="none" stroke="#283B54" stroke-width="1"/>
    <text x="12" y="242" fill="#334763" font-family="monospace" font-size="9">OFFLINE GRID Z${z} • ${x},${y}</text>
  </svg>`;
  return new Response(svg, {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml;charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME && key !== DATA_CACHE_NAME && key !== TILE_CACHE_NAME) {
            return caches.delete(key);
          }
          return undefined;
        })
      )
    )
  );
  self.clients.claim();
});

let swSessionToken = null;

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'GP_SESSION_TOKEN') {
    swSessionToken = event.data.token || null;
  } else if (event.data && event.data.type === 'GP_PRECACHE_TILES' && Array.isArray(event.data.urls)) {
    const urls = event.data.urls;
    event.waitUntil(
      caches.open(TILE_CACHE_NAME).then(async cache => {
        await Promise.allSettled(
          urls.map(async tileUrl => {
            const existing = await cache.match(tileUrl);
            if (existing) return;
            const res = await fetch(tileUrl, { mode: 'cors' });
            if (res && res.status === 200) {
              await cache.put(tileUrl, res.clone());
            }
          })
        );
      })
    );
  }
});

function withSessionAuth(request) {
  if (!swSessionToken || request.headers.has('Authorization')) {
    return request;
  }
  const headers = new Headers(request.headers);
  headers.set('Authorization', `Bearer ${swSessionToken}`);
  return new Request(request, { headers });
}

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Never cache SSE event streams
  if (url.pathname === '/api/charging/stream') {
    return;
  }

  // Forward non-GET or /api/auth/* same-origin API requests with session Authorization header if present
  if (
    url.origin === self.location.origin &&
    url.pathname.startsWith('/api/') &&
    (request.method !== 'GET' || url.pathname.startsWith('/api/auth/') || url.pathname.startsWith('/api/admin/users'))
  ) {
    if (swSessionToken && !request.headers.has('Authorization')) {
      event.respondWith(fetch(withSessionAuth(request)));
    }
    return;
  }

  if (request.method !== 'GET') return;

  // Cache OpenStreetMap map tiles for offline map viewing (Stale-While-Revalidate + Tactical Offline SVG Grid Fallback)
  if (url.hostname.includes('tile.openstreetmap.org')) {
    event.respondWith(
      caches.open(TILE_CACHE_NAME).then(async cache => {
        const cachedTile = await cache.match(request);
        const fetchPromise = fetch(request)
          .then(networkResponse => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(request, networkResponse.clone());
            }
            return networkResponse;
          })
          .catch(() => cachedTile || createOfflineRadarTileResponse(url.pathname));
        return cachedTile || fetchPromise;
      })
    );
    return;
  }

  // Network-First with Offline Cache Fallback for GHOST PROTOCOL GET API routes
  if (
    url.origin === self.location.origin &&
    CACHEABLE_API_PREFIXES.some(prefix => url.pathname.startsWith(prefix))
  ) {
    event.respondWith(
      caches.open(DATA_CACHE_NAME).then(async cache => {
        try {
          const networkResponse = await fetch(withSessionAuth(request));
          if (networkResponse && networkResponse.status === 200) {
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        } catch {
          const cachedResponse = await cache.match(request);
          if (cachedResponse) {
            return cachedResponse;
          }
          return new Response(
            JSON.stringify({
              offline: true,
              error: 'Device is offline and no cached snapshot was found for this endpoint.'
            }),
            {
              status: 503,
              headers: { 'Content-Type': 'application/json' }
            }
          );
        }
      })
    );
    return;
  }

  // Network-First with Offline Fallback for same-origin App Shell, JS, CSS, Fonts, and Icons (exclude /api/)
  if (url.origin === self.location.origin && !url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(request, clone);
            });
          }
          return networkResponse;
        })
        .catch(async () => {
          const cachedResponse = await caches.match(request);
          if (cachedResponse) return cachedResponse;
          if (request.mode === 'navigate') {
            const indexFallback = await caches.match('/index.html');
            if (indexFallback) return indexFallback;
          }
          return new Response('Offline resource unavailable', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/plain' }
          });
        })
    );
  }
});
