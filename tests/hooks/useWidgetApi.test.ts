import { describe, it, expect, vi } from 'vitest';
import { sendGifAsImage } from '../../src/hooks/useWidgetApi';

describe('sendGifAsImage', () => {
  const gifUrl = 'http://example.com/gif.gif';
  const gifData = { width: 128, height: 128, mimeType: 'image/gif', fileName: 'cat.gif' };

  it('returns false when api is null', async () => {
    const ok = await sendGifAsImage(null, gifUrl, gifData);
    expect(ok).toBe(false);
  });

  it('returns false when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fail')));
    const api = { uploadFile: vi.fn(), sendRoomEvent: vi.fn() } as unknown as Parameters<typeof sendGifAsImage>[0];
    const ok = await sendGifAsImage(api, gifUrl, gifData);
    expect(ok).toBe(false);
    vi.unstubAllGlobals();
  });

  it('returns false when upload response lacks content URI', async () => {
    const blob = new Blob(['gifdata'], { type: 'image/gif' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(blob) }));
    const api = { uploadFile: vi.fn().mockResolvedValue({}) } as unknown as Parameters<typeof sendGifAsImage>[0];
    const ok = await sendGifAsImage(api, gifUrl, gifData);
    expect(ok).toBe(false);
    vi.unstubAllGlobals();
  });

  it('uploads and sends image successfully', async () => {
    const blob = new Blob(['gifdata'], { type: 'image/gif' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(blob) }));
    const api = {
      uploadFile: vi.fn().mockResolvedValue({ content_uri: 'mxc://server/media' }),
      sendRoomEvent: vi.fn().mockResolvedValue(undefined),
    } as unknown as Parameters<typeof sendGifAsImage>[0];
    const ok = await sendGifAsImage(api, gifUrl, gifData);
    expect(ok).toBe(true);
    expect(api.uploadFile).toHaveBeenCalledOnce();
    expect(api.sendRoomEvent).toHaveBeenCalledWith('m.room.message', expect.objectContaining({ msgtype: 'm.image' }));
    vi.unstubAllGlobals();
  });

  it('handles nested mxc fields', async () => {
    const blob = new Blob(['gifdata'], { type: 'image/gif' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(blob) }));
    const api = {
      uploadFile: vi.fn().mockResolvedValue({ mxc: 'mxc://server/media2' }),
      sendRoomEvent: vi.fn().mockResolvedValue(undefined),
    } as unknown as Parameters<typeof sendGifAsImage>[0];
    await sendGifAsImage(api, gifUrl, gifData);
    expect(api.sendRoomEvent).toHaveBeenCalledWith('m.room.message', expect.objectContaining({ url: 'mxc://server/media2' }));
    vi.unstubAllGlobals();
  });
});
