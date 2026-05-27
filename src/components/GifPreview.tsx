import type { GifResult } from "../types";

interface GifPreviewProps {
  gif: GifResult;
  sending: boolean;
  onSend: () => void;
  onClose: () => void;
}

export function GifPreview({ gif, sending, onSend, onClose }: GifPreviewProps) {
  return (
    <div className="gif-preview-overlay" onClick={onClose}>
      <div className="gif-preview" onClick={(e) => e.stopPropagation()}>
        <div className="gif-preview__image-wrapper">
          <img
            src={gif.full.url}
            alt={gif.title || "GIF preview"}
            className="gif-preview__image"
          />
        </div>
        <div className="gif-preview__actions">
          <button
            className="gif-preview__send"
            onClick={onSend}
            disabled={sending}
          >
            {sending ? "Sending..." : "Send GIF"}
          </button>
          <button className="gif-preview__cancel" onClick={onClose}>
            Cancel
          </button>
        </div>
        {gif.title && <div className="gif-preview__title">{gif.title}</div>}
      </div>
    </div>
  );
}