import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendGifAsImage, SendGifError } from '../../src/hooks/useWidgetApi';

describe('sendGifAsImage', () => {
  const gifUrl = 'http://example.com/gif.gif';
  const gifData = { width: 128, height: 128, mimeType: 'image/gif', fileName: 'cat.gif' };

  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('throws SendGifError when api is null', async () => {
    await expect(sendGifAsImage(null, gifUrl, gifData)).rejects.toBeInstanceOf(SendGifError);
  });

  it('uploads via uploadFile then sends m.room.message with mxc URI', async () => {
    const blob = new Blob(['gifdata'], { type: 'image/gif' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(blob) }));
    const api = {
      uploadFile: vi.fn().mockResolvedValue({ content_uri: 'mxc://server/media' }),
      sendRoomEvent: vi.fn().mockResolvedValue(undefined),
    } as unknown as Parameters<typeof sendGifAsImage>[0];

    await sendGifAsImage(api, gifUrl, gifData);

    expect(api.uploadFile).toHaveBeenCalledOnce();
    expect(api.sendRoomEvent).toHaveBeenCalledWith(
      'm.room.message',
      expect.objectContaining({
        msgtype: 'm.image',
        url: 'mxc://server/media',
        body: 'cat.gif',
        info: expect.objectContaining({
          w: 128,
          h: 128,
          mimetype: 'image/gif',
        }),
      })
    );
  });

  it('falls back to HTTPS URL in m.room.message when uploadFile fails', async () => {
    const blob = new Blob(['gifdata'], { type: 'image/gif' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(blob) }));
    const api = {
      uploadFile: vi.fn().mockRejectedValue(new Error('MSC4039 unsupported')),
      sendRoomEvent: vi.fn().mockResolvedValue(undefined),
    } as unknown as Parameters<typeof sendGifAsImage>[0];

    await sendGifAsImage(api, gifUrl, gifData);

    expect(api.sendRoomEvent).toHaveBeenCalledWith(
      'm.room.message',
      expect.objectContaining({
        msgtype: 'm.image',
        url: gifUrl,
      })
    );
  });

  it('falls back to HTTPS URL when proxy fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const api = {
      uploadFile: vi.fn(),
      sendRoomEvent: vi.fn().mockResolvedValue(undefined),
    } as unknown as Parameters<typeof sendGifAsImage>[0];

    await sendGifAsImage(api, gifUrl, gifData);

    expect(api.uploadFile).not.toHaveBeenCalled();
    expect(api.sendRoomEvent).toHaveBeenCalledWith(
      'm.room.message',
      expect.objectContaining({ url: gifUrl })
    );
  });

  it('throws SendGifError when sendRoomEvent fails', async () => {
    const blob = new Blob(['gifdata'], { type: 'image/gif' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(blob) }));
    const api = {
      uploadFile: vi.fn().mockResolvedValue({ content_uri: 'mxc://server/media' }),
      sendRoomEvent: vi.fn().mockRejectedValue(new Error('capability not granted')),
    } as unknown as Parameters<typeof sendGifAsImage>[0];

    await expect(sendGifAsImage(api, gifUrl, gifData)).rejects.toBeInstanceOf(SendGifError);
    await expect(sendGifAsImage(api, gifUrl, gifData)).rejects.toThrow(/capability not granted/);
  });

  it('never calls sendSticker (custom widgets cannot send stickers)', async () => {
    const blob = new Blob(['gifdata'], { type: 'image/gif' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(blob) }));
    const sendSticker = vi.fn();
    const api = {
      uploadFile: vi.fn().mockResolvedValue({ content_uri: 'mxc://server/media' }),
      sendRoomEvent: vi.fn().mockResolvedValue(undefined),
      sendSticker,
    } as unknown as Parameters<typeof sendGifAsImage>[0];

    await sendGifAsImage(api, gifUrl, gifData);

    expect(sendSticker).not.toHaveBeenCalled();
  });
});