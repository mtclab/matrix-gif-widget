import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('getConfig', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_GIF_API_KEY', '');
    vi.stubEnv('VITE_GIF_PROXY_URL', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults to tenor provider and empty key', async () => {
    vi.stubGlobal('location', new URL('http://localhost:3000'));
    const { getConfig } = await import('../../src/config');
    const cfg = getConfig();
    expect(cfg.provider).toBe('tenor');
    expect(cfg.apiKey).toBe('');
  });

  it('reads provider from query params (giphy)', async () => {
    vi.stubGlobal('location', new URL('http://localhost:3000/?provider=giphy'));
    const { getConfig } = await import('../../src/config');
    const cfg = getConfig();
    expect(cfg.provider).toBe('giphy');
  });

  it('reads apiKey from env only (not URL params)', async () => {
    vi.stubEnv('VITE_GIF_API_KEY', 'env-key');
    vi.stubGlobal('location', new URL('http://localhost:3000'));
    const { getConfig } = await import('../../src/config');
    const cfg = getConfig();
    expect(cfg.apiKey).toBe('env-key');
  });

  it('ignores apiKey in URL params (security)', async () => {
    vi.stubGlobal('location', new URL('http://localhost:3000/?apiKey=evil'));
    const { getConfig } = await import('../../src/config');
    const cfg = getConfig();
    expect(cfg.apiKey).toBe('');
  });

  it('ignores proxyUrl in URL params (security)', async () => {
    vi.stubGlobal('location', new URL('http://localhost:3000/?proxyUrl=http://evil.com'));
    const { getConfig } = await import('../../src/config');
    const cfg = getConfig();
    expect(cfg.baseUrl).toBe('http://localhost:3000/tenor');
  });

  it('uses explicit proxyUrl from env', async () => {
    vi.stubEnv('VITE_GIF_PROXY_URL', 'http://env-proxy.com');
    vi.stubGlobal('location', new URL('http://localhost:3000'));
    const { getConfig } = await import('../../src/config');
    const cfg = getConfig();
    expect(cfg.baseUrl).toBe('http://env-proxy.com/tenor');
  });

  it('defaults to same-origin proxy when no apiKey or proxyUrl are set', async () => {
    vi.stubEnv('VITE_GIF_API_KEY', '');
    vi.stubEnv('VITE_GIF_PROXY_URL', '');
    vi.stubGlobal('location', new URL('http://localhost:3000'));
    const { getConfig } = await import('../../src/config');
    const cfg = getConfig();
    expect(cfg.apiKey).toBe('');
    expect(cfg.baseUrl).toBe('http://localhost:3000/tenor');
  });

  it('does not use default proxy when apiKey is present', async () => {
    vi.stubEnv('VITE_GIF_API_KEY', 'real-key');
    vi.stubGlobal('location', new URL('http://localhost:3000'));
    const { getConfig } = await import('../../src/config');
    const cfg = getConfig();
    expect(cfg.baseUrl).toBeUndefined();
  });

  it('computes giphy baseUrl when provider is giphy', async () => {
    vi.stubGlobal('location', new URL('http://localhost:3000/?provider=giphy'));
    const { getConfig } = await import('../../src/config');
    const cfg = getConfig();
    expect(cfg.baseUrl).toBe('http://localhost:3000/giphy');
  });

  it('strips trailing slashes from proxyUrl', async () => {
    vi.stubEnv('VITE_GIF_PROXY_URL', 'http://proxy.example.com/');
    vi.stubGlobal('location', new URL('http://localhost:3000'));
    const { getConfig } = await import('../../src/config');
    const cfg = getConfig();
    expect(cfg.baseUrl).toBe('http://proxy.example.com/tenor');
  });
});