import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';

const ALLOWED_TENOR_PATHS = /^\/(search|featured|categories|gifs|search_suggestions|autocomplete|trending)(\/|$|\?)/i;
const ALLOWED_GIPHY_PATHS = /^\/(search|trending|translate|random|gifs_by_id|categories|search_suggestions|autocomplete)(\/|$|\?)/i;

function buildTestApp(env = {}) {
  const TENOR_KEY = env.TENOR_API_KEY || '';
  const GIPHY_KEY = env.GIPHY_API_KEY || '';
  const CORS_ORIGINS = (env.CORS_ORIGINS || '').split(',').filter(Boolean);

  const app = express();
  app.use(express.json());

  if (CORS_ORIGINS.length > 0) {
    app.use((req, res, next) => {
      const origin = req.headers.origin;
      if (origin && CORS_ORIGINS.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      }
      if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
      next();
    });
  }

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  async function proxyTenor(req, res) {
    if (!TENOR_KEY) { res.status(500).json({ error: 'TENOR_API_KEY not configured' }); return; }
    const subpath = req.path.replace(/^\/?/, '');
    if (!ALLOWED_TENOR_PATHS.test('/' + subpath)) {
      res.status(400).json({ error: 'Invalid path' }); return;
    }
    const url = new URL(`https://tenor.googleapis.com/v2/${subpath}`);
    for (const [key, value] of Object.entries(req.query)) { if (key !== 'key') url.searchParams.set(key, String(value)); }
    url.searchParams.set('key', TENOR_KEY);
    url.searchParams.set('client_key', 'matrix-gif-widget');
    try { const upstream = await fetch(url.toString()); const data = await upstream.text(); res.set('Content-Type', upstream.headers.get('content-type') || 'application/json'); res.status(upstream.status).send(data); }
    catch { res.status(502).json({ error: 'Upstream Tenor request failed' }); }
  }

  async function proxyGiphy(req, res) {
    if (!GIPHY_KEY) { res.status(500).json({ error: 'GIPHY_API_KEY not configured' }); return; }
    const subpath = req.path.replace(/^\/?/, '');
    if (!ALLOWED_GIPHY_PATHS.test('/' + subpath)) {
      res.status(400).json({ error: 'Invalid path' }); return;
    }
    const url = new URL(`https://api.giphy.com/v1/gifs/${subpath}`);
    for (const [key, value] of Object.entries(req.query)) { if (key !== 'api_key') url.searchParams.set(key, String(value)); }
    url.searchParams.set('api_key', GIPHY_KEY);
    try { const upstream = await fetch(url.toString()); const data = await upstream.text(); res.set('Content-Type', upstream.headers.get('content-type') || 'application/json'); res.status(upstream.status).send(data); }
    catch { res.status(502).json({ error: 'Upstream Giphy request failed' }); }
  }

  app.use('/tenor', proxyTenor);
  app.use('/giphy', proxyGiphy);
  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  return app;
}

describe('server proxy', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('returns health ok', async () => {
    const app = buildTestApp();
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('returns 500 when tenor key missing', async () => {
    const app = buildTestApp({});
    const res = await request(app).get('/tenor/search?q=hello');
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/TENOR_API_KEY not configured/);
  });

  it('returns 500 when giphy key missing', async () => {
    const app = buildTestApp({});
    const res = await request(app).get('/giphy/search?q=hello');
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/GIPHY_API_KEY not configured/);
  });

  it('forwards tenor request and injects key', async () => {
    const upstream = vi.fn().mockResolvedValue({ status: 200, headers: { get: () => 'application/json' }, text: () => Promise.resolve('{"results":[]}') });
    vi.stubGlobal('fetch', upstream);
    const app = buildTestApp({ TENOR_API_KEY: 'tk' });
    const res = await request(app).get('/tenor/search?q=cat');
    expect(res.status).toBe(200);
    const url = upstream.mock.calls[0][0];
    expect(url).toContain('tenor.googleapis.com');
    const parsed = new URL(url);
    expect(parsed.searchParams.get('key')).toBe('tk');
    expect(parsed.searchParams.get('q')).toBe('cat');
  });

  it('forwards giphy request and injects api_key', async () => {
    const upstream = vi.fn().mockResolvedValue({ status: 200, headers: { get: () => 'application/json' }, text: () => Promise.resolve('{"data":[]}') });
    vi.stubGlobal('fetch', upstream);
    const app = buildTestApp({ GIPHY_API_KEY: 'gk' });
    const res = await request(app).get('/giphy/search?q=dog');
    expect(res.status).toBe(200);
    const url = upstream.mock.calls[0][0];
    expect(url).toContain('api.giphy.com');
    const parsed = new URL(url);
    expect(parsed.searchParams.get('api_key')).toBe('gk');
    expect(parsed.searchParams.get('q')).toBe('dog');
  });

  it('strips client-supplied key in tenor proxy', async () => {
    const upstream = vi.fn().mockResolvedValue({ status: 200, headers: { get: () => 'application/json' }, text: () => Promise.resolve('[]') });
    vi.stubGlobal('fetch', upstream);
    const app = buildTestApp({ TENOR_API_KEY: 'tk' });
    await request(app).get('/tenor/search?q=cat&key=bad');
    const url = upstream.mock.calls[0][0];
    expect(new URL(url).searchParams.get('key')).toBe('tk');
  });

  it('strips client-supplied api_key in giphy proxy', async () => {
    const upstream = vi.fn().mockResolvedValue({ status: 200, headers: { get: () => 'application/json' }, text: () => Promise.resolve('[]') });
    vi.stubGlobal('fetch', upstream);
    const app = buildTestApp({ GIPHY_API_KEY: 'gk' });
    await request(app).get('/giphy/search?q=dog&api_key=bad');
    const url = upstream.mock.calls[0][0];
    expect(new URL(url).searchParams.get('api_key')).toBe('gk');
  });

  it('returns 502 on upstream tenor failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
    const app = buildTestApp({ TENOR_API_KEY: 'tk' });
    const res = await request(app).get('/tenor/search?q=cat');
    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/Upstream Tenor/);
  });

  it('returns 502 on upstream giphy failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
    const app = buildTestApp({ GIPHY_API_KEY: 'gk' });
    const res = await request(app).get('/giphy/search?q=dog');
    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/Upstream Giphy/);
  });

  it('blocks SSRF path traversal on tenor route', async () => {
    const app = buildTestApp({ TENOR_API_KEY: 'tk' });
    const res = await request(app).get('/tenor/../../internal/');
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('blocks SSRF path traversal on giphy route', async () => {
    const app = buildTestApp({ GIPHY_API_KEY: 'gk' });
    const res = await request(app).get('/giphy/../../etc/passwd');
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('blocks unknown tenor endpoints', async () => {
    const app = buildTestApp({ TENOR_API_KEY: 'tk' });
    const res = await request(app).get('/tenor/unknown_endpoint?q=cat');
    expect(res.status).toBe(400);
  });

  it('blocks unknown giphy endpoints', async () => {
    const app = buildTestApp({ GIPHY_API_KEY: 'gk' });
    const res = await request(app).get('/giphy/unknown_endpoint?q=dog');
    expect(res.status).toBe(400);
  });

  it('allows valid tenor search path', async () => {
    const upstream = vi.fn().mockResolvedValue({ status: 200, headers: { get: () => 'application/json' }, text: () => Promise.resolve('[]') });
    vi.stubGlobal('fetch', upstream);
    const app = buildTestApp({ TENOR_API_KEY: 'tk' });
    const res = await request(app).get('/tenor/search?q=cat');
    expect(res.status).toBe(200);
  });

  it('allows valid giphy trending path', async () => {
    const upstream = vi.fn().mockResolvedValue({ status: 200, headers: { get: () => 'application/json' }, text: () => Promise.resolve('[]') });
    vi.stubGlobal('fetch', upstream);
    const app = buildTestApp({ GIPHY_API_KEY: 'gk' });
    const res = await request(app).get('/giphy/trending?limit=10');
    expect(res.status).toBe(200);
  });

  it('sets CORS headers for allowed origins', async () => {
    const app = buildTestApp({ CORS_ORIGINS: 'https://element.example.com' });
    const res = await request(app)
      .options('/health')
      .set('Origin', 'https://element.example.com');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('https://element.example.com');
  });

  it('does not set CORS headers for disallowed origins', async () => {
    const app = buildTestApp({ CORS_ORIGINS: 'https://element.example.com' });
    const res = await request(app)
      .get('/health')
      .set('Origin', 'https://evil.com');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('does not set CORS headers when CORS_ORIGINS is empty', async () => {
    const app = buildTestApp({});
    const res = await request(app).get('/health');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});