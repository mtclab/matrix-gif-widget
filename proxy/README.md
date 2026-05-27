# GIF API Proxy Server

Lightweight Express server to proxy GIF API requests, keeping your API keys server-side.

## Setup

```bash
cd proxy
npm install
```

## Configure

```bash
cp .env.example .env
# Edit .env with your API keys
```

## Run

```bash
npm start        # production
npm run dev      # development (auto-restart)
```

## Endpoints

- `GET /health` — Health check
- `GET /tenor/search?q=...&pos=...&limit=...` — Proxy Tenor search
- `GET /tenor/featured?pos=...&limit=...` — Proxy Tenor trending
- `GET /giphy/search?q=...&offset=...&limit=...` — Proxy Giphy search
- `GET /giphy/trending?offset=...&limit=...` — Proxy Giphy trending

## Using with the Widget

Set `VITE_GIF_PROXY_URL` to your proxy server URL:

```env
VITE_GIF_PROXY_URL=http://your-server:3100/tenor
VITE_GIF_API_KEY=not-needed-with-proxy
```

Or pass as URL params to the widget:

```
?provider=tenor&proxyUrl=http://your-server:3100/tenor
```