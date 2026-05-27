import { useState, useCallback, useRef, useEffect } from "react";
import type { GifResult } from "../types";
import { useGifSearch } from "../hooks/useGifSearch";
import { useWidgetApi, sendGifAsImage } from "../hooks/useWidgetApi";
import { GifGrid } from "./GifGrid";
import { GifPreview } from "./GifPreview";
import type { GifProviderConfig } from "../types";

interface GifWidgetProps {
  config: GifProviderConfig;
}

export function GifWidget({ config }: GifWidgetProps) {
  const { api, ready, error: widgetError, theme } = useWidgetApi();
  const { results, loading, error: searchError, search, loadMore, hasMore, trend } = useGifSearch(config);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<GifResult | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    trend();
  }, [trend]);

  const onSearch = useCallback(
    (value: string) => {
      setQuery(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        if (value.trim()) {
          search(value.trim());
        } else {
          trend();
        }
      }, 300);
    },
    [search, trend]
  );

  const onSelect = useCallback((gif: GifResult) => {
    setSelected(gif);
  }, []);

  const onSend = useCallback(async () => {
    if (!api || !selected) return;
    setSending(true);
    setSendError(null);
    try {
      await sendGifAsImage(api, selected.full.url, {
        width: selected.full.width,
        height: selected.full.height,
        mimeType: "image/gif",
        fileName: selected.title || `gif-${selected.id}.gif`,
      });
      setSelected(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to send GIF";
      setSendError(message);
    } finally {
      setSending(false);
    }
  }, [api, selected]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape" && selected) {
        setSelected(null);
      }
    },
    [selected]
  );

  const error = widgetError || searchError || sendError;
  const themeClass = theme === "dark" ? "theme-dark" : "theme-light";

  return (
    <div className={`gif-widget ${themeClass}`} onKeyDown={handleKeyDown}>
      <div className="gif-widget__header">
        <div className="gif-widget__search">
          <svg className="gif-widget__search-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            className="gif-widget__search-input"
            placeholder="Search GIFs..."
            value={query}
            onChange={(e) => onSearch(e.target.value)}
            autoFocus
          />
          {query && (
            <button className="gif-widget__clear" onClick={() => onSearch("")} aria-label="Clear search">
              ×
            </button>
          )}
        </div>
      </div>

      <div className="gif-widget__content">
        {error && <div className="gif-widget__error">{error}</div>}
        {!ready && !widgetError && !api && <div className="gif-widget__loading">Connecting to Matrix...</div>}
        {!ready && !widgetError && api && <div className="gif-widget__loading">Negotiating capabilities...</div>}
        <GifGrid
          results={results}
          loading={loading}
          hasMore={hasMore}
          onLoadMore={loadMore}
          onSelect={onSelect}
        />
      </div>

      {selected && (
        <GifPreview
          gif={selected}
          sending={sending}
          onSend={onSend}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}