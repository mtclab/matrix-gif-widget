import { useCallback, useRef, useEffect } from "react";
import type { GifResult } from "../types";

interface GifGridProps {
  results: GifResult[];
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onSelect: (gif: GifResult) => void;
}

export function GifGrid({ results, loading, hasMore, onLoadMore, onSelect }: GifGridProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  const observerCallback = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (entries[0]?.isIntersecting && hasMore && !loading) {
        onLoadMore();
      }
    },
    [hasMore, loading, onLoadMore]
  );

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(observerCallback, { rootMargin: "200px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [observerCallback]);

  return (
    <div className="gif-grid">
      {results.map((gif) => (
        <button
          key={gif.id}
          className="gif-grid__item"
          onClick={() => onSelect(gif)}
          title={gif.title || "GIF"}
        >
          <img
            src={gif.preview.url}
            alt={gif.title || "GIF"}
            className="gif-grid__img"
            loading="lazy"
            width={gif.preview.width || 130}
            height={gif.preview.height || 100}
          />
        </button>
      ))}
      {loading && <div className="gif-grid__loader">Loading...</div>}
      {hasMore && <div ref={sentinelRef} className="gif-grid__sentinel" />}
      {!hasMore && results.length > 0 && <div className="gif-grid__end">No more GIFs</div>}
    </div>
  );
}