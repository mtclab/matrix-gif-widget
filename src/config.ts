function getConfig() {
  const params = new URLSearchParams(window.location.search);

  const provider = (params.get("provider") || "tenor") as "tenor" | "giphy";
  const apiKey = params.get("apiKey") || import.meta.env.VITE_GIF_API_KEY || "";
  const proxyUrl = params.get("proxyUrl") || import.meta.env.VITE_GIF_PROXY_URL || undefined;

  if (!apiKey && !proxyUrl) {
    console.warn("No GIF API key or proxy URL configured. Set VITE_GIF_API_KEY env var or pass apiKey/provider URL params.");
  }

  return {
    provider,
    apiKey,
    baseUrl: proxyUrl,
  };
}

export { getConfig };