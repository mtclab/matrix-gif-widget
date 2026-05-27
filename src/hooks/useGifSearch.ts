import { useState, useRef, useCallback } from "react";
import type { GifResult, GifSearchResponse } from "../types";
import { createGifApi } from "../api/gif-api";

interface GifProviderConfig {
  provider: "tenor" | "giphy";
  apiKey: string;
  baseUrl?: string;
}

interface UseGifSearchReturn {
  results: GifResult[];
  loading: boolean;
  error: string | null;
  search: (query: string) => void;
  loadMore: () => void;
  hasMore: boolean;
  trend: () => void;
}

export function useGifSearch(config: GifProviderConfig): UseGifSearchReturn {
  const [results, setResults] = useState<GifResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [query, setQuery] = useState<string>("");
  const abortRef = useRef<AbortController | null>(null);
  const apiRef = useRef(createGifApi(config));
  const api = apiRef.current;

  const search = useCallback(
    (q: string) => {
      abortRef.current?.abort();
      abortRef.current = new AbortController();

      setQuery(q);
      setResults([]);
      setCursor(null);
      setHasMore(true);
      setError(null);
      setLoading(true);

      api.search(q, undefined, 20)
        .then((res: GifSearchResponse) => {
          setResults(res.results);
          setCursor(res.next);
          setHasMore(res.results.length >= 20);
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === "AbortError") return;
          setError(err instanceof Error ? err.message : "Search failed");
        })
        .finally(() => setLoading(false));
    },
    [api]
  );

  const trend = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setQuery("");
    setResults([]);
    setCursor(null);
    setHasMore(true);
    setError(null);
    setLoading(true);

    api.trending(undefined, 20)
      .then((res: GifSearchResponse) => {
        setResults(res.results);
        setCursor(res.next);
        setHasMore(res.results.length >= 20);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Trending failed");
      })
      .finally(() => setLoading(false));
  }, [api]);

  const loadMore = useCallback(() => {
    if (!cursor || loading) return;

    setLoading(true);
    const fn = query ? api.search(query, cursor, 20) : api.trending(cursor, 20);

    fn
      .then((res: GifSearchResponse) => {
        setResults((prev) => [...prev, ...res.results]);
        setCursor(res.next);
        setHasMore(res.results.length >= 20);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Load more failed");
      })
      .finally(() => setLoading(false));
  }, [api, query, cursor, loading]);

  return { results, loading, error, search, loadMore, hasMore, trend };
}