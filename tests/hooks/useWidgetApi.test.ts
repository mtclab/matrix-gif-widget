import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendGifAsImage } from '../../src/hooks/useWidgetApi';

describe('sendGifAsImage', () => {
  const gifUrl = 'http://example.com/gif.gif';
  const gifData = { width: 128, height: 128, mimeType: 'image/gif', fileName: 'cat.gif' };

  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns false when api is null', async () => {
    const ok = await sendGifAsImage(null, gifUrl, gifData);
    expect(ok).toBe(false);
  });

  it('falls back to sendSticker with HTTP URL when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fail')));
    const api = {
      sendSticker: vi.fn().mockResolvedValue(undefined),
      sendRoomEvent: vi.fn().mockResolvedValue(undefined),
    } as unknown as Parameters<typeof sendGifAsImage>[0];
    const ok = await sendGifAsImage(api, gifUrl, gifData);
    expect(ok).toBe(true);
    expect(api.sendSticker).toHaveBeenCalledWith(expect.objectContaining({
      name: 'cat.gif',
      content: expect.objectContaining({ url: gifUrl }),
    }));
    vi.unstubAllGlobals();
  });

  it('uses mxc URI when uploadFile succeeds', async () => {
    const blob = new Blob(['gifdata'], { type: 'image/gif' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(blob) }));
    const api = {
      uploadFile: vi.fn().mockResolvedValue({ content_uri: 'mxc://server/media' }),
      sendSticker: vi.fn().mockResolvedValue(undefined),
      sendRoomEvent: vi.fn().mockResolvedValue(undefined),
    } as unknown as Parameters<typeof sendGifAsImage>[0];
    const ok = await sendGifAsImage(api, gifUrl, gifData);
    expect(ok).toBe(true);
    expect(api.uploadFile).toHaveBeenCalledOnce();
    expect(api.sendSticker).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.objectContaining({ url: 'mxc://server/media' }),
    }));
    vi.unstubAllGlobals();
  });

  it('falls back to HTTP URL in sendSticker when uploadFile fails', async () => {
    const blob = new Blob(['gifdata'], { type: 'image/gif' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(blob) }));
    const api = {
      uploadFile: vi.fn().mockRejectedValue(new Error('MSC4039 unsupported')),
      sendSticker: vi.fn().mockResolvedValue(undefined),
      sendRoomEvent: vi.fn().mockResolvedValue(undefined),
    } as unknown as Parameters<typeof sendGifAsImage>[0];
    const ok = await sendGifAsImage(api, gifUrl, gifData);
    expect(ok).toBe(true);
    expect(api.sendSticker).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.objectContaining({ url: gifUrl }),
    }));
    vi.unstubAllGlobals();
  });

  it('falls back to sendRoomEvent when sendSticker fails', async () => {
    const blob = new Blob(['gifdata'], { type: 'image/gif' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(blob) }));
    const api = {
      uploadFile: vi.fn().mockResolvedValue({ content_uri: 'mxc://server/media' }),
      sendSticker: vi.fn().mockRejectedValue(new Error('sticker not supported')),
      sendRoomEvent: vi.fn().mockResolvedValue(undefined),
    } as unknown as Parameters<typeof sendGifAsImage>[0];
    const ok = await sendGifAsImage(api, gifUrl, gifData);
    expect(ok).toBe(true);
    expect(api.sendRoomEvent).toHaveBeenCalledWith('m.room.message', expect.objectContaining({
      msgtype: 'm.image',
      url: 'mxc://server/media',
    }));
    vi.unstubAllGlobals();
  });

  it('returns false when all methods fail', async () => {
    const blob = new Blob(['gifdata'], { type: 'image/gif' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(blob) }));
    const api = {
      uploadFile: vi.fn().mockRejectedValue(new Error('fail')),
      sendSticker: vi.fn().mockRejectedValue(new Error('fail')),
      sendRoomEvent: vi.fn().mockRejectedValue(new Error('fail')),
    } as unknown as Parameters<typeof sendGifAsImage>[0];
    const ok = await sendGifAsImage(api, gifUrl, gifData);
    expect(ok).toBe(false);
    vi.unstubAllGlobals();
  });
});