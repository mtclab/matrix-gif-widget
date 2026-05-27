export interface GifImage {
  url: string;
  width: number;
  height: number;
  size: number;
  mime: string;
}

export interface GifResult {
  id: string;
  title: string;
  url: string;
  preview: GifImage;
  full: GifImage;
  source: string;
}

export interface GifSearchResponse {
  results: GifResult[];
  next: string | null;
}

export type GifProvider = "tenor" | "giphy";

export interface GifProviderConfig {
  provider: GifProvider;
  apiKey: string;
  baseUrl?: string;
}

export interface WidgetConfig {
  gifProvider: "tenor" | "giphy";
  apiKey: string;
  proxyUrl?: string;
  locale?: string;
  contentRating?: "g" | "pg" | "pg-13" | "r";
}