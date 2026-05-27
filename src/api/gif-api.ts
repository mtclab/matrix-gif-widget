import type { GifResult, GifSearchResponse, GifProviderConfig } from "../types";

const TENOR_BASE = "https://tenor.googleapis.com/v2";
const GIPHY_BASE = "https://api.giphy.com/v1/gifs";

interface TenorMediaFormat {
  url: string;
  dims: [number, number];
  size: number;
  mime: string;
}

interface TenorResult {
  id: string;
  content_description: string;
  media_formats: Record<string, TenorMediaFormat>;
}

interface GiphyImages {
  original?: { url: string; width: string; height: string; size: string };
  fixed_width?: { url: string; width: string; height: string; size: string };
  fixed_width_small?: { url: string; width: string; height: string; size: string };
}

interface GiphyData {
  id: string;
  title: string;
  images: GiphyImages;
}

function tenorToGif(r: TenorResult): GifResult {
  const gif = r.media_formats["gif"];
  const tiny = r.media_formats["tinygif"];
  return {
    id: r.id,
    title: r.content_description || "",
    url: gif?.url || "",
    preview: {
      url: tiny?.url || gif?.url || "",
      width: tiny?.dims?.[0] || gif?.dims?.[0] || 0,
      height: tiny?.dims?.[1] || gif?.dims?.[1] || 0,
      size: tiny?.size || gif?.size || 0,
      mime: tiny?.mime || "image/gif",
    },
    full: {
      url: gif?.url || "",
      width: gif?.dims?.[0] || 0,
      height: gif?.dims?.[1] || 0,
      size: gif?.size || 0,
      mime: "image/gif",
    },
    source: "tenor",
  };
}

function giphyToGif(g: GiphyData): GifResult {
  const fixed = g.images.fixed_width;
  const preview = g.images.fixed_width_small;
  return {
    id: g.id,
    title: g.title || "",
    url: g.images.original?.url || "",
    preview: {
      url: preview?.url || fixed?.url || "",
      width: Number(preview?.width || fixed?.width || 0),
      height: Number(preview?.height || fixed?.height || 0),
      size: Number(preview?.size || fixed?.size || 0),
      mime: "image/gif",
    },
    full: {
      url: fixed?.url || g.images.original?.url || "",
      width: Number(fixed?.width || 0),
      height: Number(fixed?.height || 0),
      size: Number(fixed?.size || 0),
      mime: "image/gif",
    },
    source: "giphy",
  };
}

async function searchTenor(config: GifProviderConfig, query: string, pos?: string, limit = 20): Promise<GifSearchResponse> {
  const params = new URLSearchParams({
    q: query,
    key: config.apiKey,
    limit: String(limit),
    client_key: "matrix-gif-widget",
    media_filter: "gif,tinygif",
    content_filter: "low",
  });
  if (pos) params.set("pos", pos);

  const res = await fetch(`${config.baseUrl || TENOR_BASE}/search?${params}`);
  if (!res.ok) throw new Error(`Tenor API error: ${res.status}`);

  const data = await res.json() as { results: TenorResult[]; next: string | null };
  return {
    results: data.results.map(tenorToGif),
    next: data.next ?? null,
  };
}

async function searchGiphy(config: GifProviderConfig, query: string, offset?: string, limit = 20): Promise<GifSearchResponse> {
  const params = new URLSearchParams({
    api_key: config.apiKey,
    q: query,
    limit: String(limit),
    rating: "pg-13",
  });
  if (offset) params.set("offset", offset);

  const res = await fetch(`${config.baseUrl || GIPHY_BASE}/search?${params}`);
  if (!res.ok) throw new Error(`Giphy API error: ${res.status}`);

  const data = await res.json() as { data: GiphyData[]; pagination: { offset: number; count: number } };
  return {
    results: data.data.map(giphyToGif),
    next: String(data.pagination.offset + data.pagination.count),
  };
}

async function trendingTenor(config: GifProviderConfig, pos?: string, limit = 20): Promise<GifSearchResponse> {
  const params = new URLSearchParams({
    key: config.apiKey,
    limit: String(limit),
    client_key: "matrix-gif-widget",
    media_filter: "gif,tinygif",
    content_filter: "low",
  });
  if (pos) params.set("pos", pos);

  const res = await fetch(`${config.baseUrl || TENOR_BASE}/featured?${params}`);
  if (!res.ok) throw new Error(`Tenor trending error: ${res.status}`);

  const data = await res.json() as { results: TenorResult[]; next: string | null };
  return {
    results: data.results.map(tenorToGif),
    next: data.next ?? null,
  };
}

async function trendingGiphy(config: GifProviderConfig, offset?: string, limit = 20): Promise<GifSearchResponse> {
  const params = new URLSearchParams({
    api_key: config.apiKey,
    limit: String(limit),
    rating: "pg-13",
  });
  if (offset) params.set("offset", offset);

  const res = await fetch(`${config.baseUrl || GIPHY_BASE}/trending?${params}`);
  if (!res.ok) throw new Error(`Giphy trending error: ${res.status}`);

  const data = await res.json() as { data: GiphyData[]; pagination: { offset: number; count: number } };
  return {
    results: data.data.map(giphyToGif),
    next: String(data.pagination.offset + data.pagination.count),
  };
}

export function createGifApi(config: GifProviderConfig) {
  return {
    search(query: string, cursor?: string | null, limit?: number): Promise<GifSearchResponse> {
      if (config.provider === "tenor") return searchTenor(config, query, cursor ?? undefined, limit);
      return searchGiphy(config, query, cursor ?? undefined, limit);
    },
    trending(cursor?: string | null, limit?: number): Promise<GifSearchResponse> {
      if (config.provider === "tenor") return trendingTenor(config, cursor ?? undefined, limit);
      return trendingGiphy(config, cursor ?? undefined, limit);
    },
  };
}