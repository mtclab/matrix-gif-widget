# Matrix GIF Widget

A Matrix widget for searching and sending GIFs in Matrix rooms. Works as an iframe widget inside Element Web, Element Desktop, and other Matrix clients that support the Widget API.

## Features

- Search GIFs from Tenor or Giphy
- Trending GIFs on load
- Infinite scroll pagination
- Preview selected GIF before sending
- Sends GIFs as `m.image` events with `mxc://` URI (uploaded to Matrix media server)
- Dark/light theme following Matrix client theme
- Lightweight static SPA — no backend required for basic usage
- Optional proxy server for API key security

## Architecture

```
┌──────────────────────────────┐
│   Matrix Client (Element)    │
│                              │
│  ┌────────────────────────┐  │
│  │    Widget iframe        │  │
│  │  ┌──────────────────┐  │  │
│  │  │  GIF Search Bar  │  │  │
│  │  │  GIF Grid        │  │  │
│  │  │  Preview + Send  │  │  │
│  │  └──────────────────┘  │  │
│  └──────┬─────────────────┘  │
│         │ Widget API          │
│         ▼                    │
│  Matrix Protocol             │
│  (upload → mxc:// → m.image) │
└──────────────────────────────┘
         │ (optional proxy)
         ▼
┌──────────────────────────────┐
│ GIF Provider (Tenor/Giphy)  │
└──────────────────────────────┘
```

## Quick Start

### Development

```bash
# Set your GIF API key
export VITE_GIF_API_KEY="your-tenor-api-key"

# Install and run
npm install
npm run dev
```

Open Element Web, add a custom widget to a room with URL:

```
http://localhost:5173/?provider=tenor&apiKey=YOUR_KEY
```

### Production Build

```bash
npm run build
```

Static files output to `dist/` — deploy to any web server (nginx, Caddy, S3, Cloudflare Pages).

### Docker

```bash
# Build and run with Docker Compose
docker compose up -d

# With API proxy (recommended for production)
VITE_GIF_PROXY_URL=http://your-server:3100/tenor docker compose up -d
```

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_GIF_API_KEY` | Yes* | Tenor or Giphy API key |
| `VITE_GIF_PROXY_URL` | No | Proxy base URL (overrides direct API calls) |

\* Required unless using the proxy server.

### URL Parameters

Pass these as query parameters in the widget URL:

| Parameter | Values | Default | Description |
|-----------|--------|---------|-------------|
| `provider` | `tenor`, `giphy` | `tenor` | GIF provider |
| `apiKey` | string | env var | API key (avoid in production — use proxy instead) |
| `proxyUrl` | URL | env var | Proxy server base URL |

### Widget URL Example

```
https://your-domain.com/?provider=tenor
```

(If using proxy, API key is not needed in the URL.)

## API Proxy Server

For production, use the included proxy server to keep API keys server-side:

```bash
cd proxy
npm install
cp .env.example .env
# Edit .env with your API keys
npm start
```

See [proxy/README.md](proxy/README.md) for details.

## Adding Widget to a Matrix Room

### Element Web

1. Open a room
2. Click the room name → **Settings** → **Integrations**
3. Add a custom widget with your deployed widget URL
4. Or use Element's Integration Manager with the widget URL

### Via Matrix State Event

Send an `m.widget` state event:

```json
{
  "type": "m.widget",
  "state_key": "gif-widget",
  "content": {
    "type": "m.widget",
    "name": "GIF Picker",
    "url": "https://your-domain.com/?provider=tenor",
    "data": {}
  }
}
```

## Tech Stack

- **Frontend**: React 19 + TypeScript
- **Build**: Vite 8
- **Widget API**: `matrix-widget-api` v1.17+
- **GIF APIs**: Tenor API v2, Giphy API
- **Proxy**: Express 5 (optional, for API key security)
- **Deploy**: Static SPA + Docker/nginx

## Project Structure

```
src/
├── api/
│   ├── gif-api.ts        # Tenor/Giphy API client
│   └── index.ts
├── components/
│   ├── GifGrid.tsx       # Masonry grid with infinite scroll
│   ├── GifPreview.tsx    # Preview overlay with send button
│   ├── GifWidget.tsx     # Main widget orchestrator
│   └── index.ts
├── hooks/
│   ├── useGifSearch.ts   # GIF search state management
│   ├── useWidgetApi.ts   # Matrix Widget API hook
│   └── index.ts
├── types/
│   ├── gif.ts            # GIF and provider types
│   └── index.ts
├── config.ts             # Runtime configuration
├── index.css             # Dark/light theme styles
└── main.tsx              # App entry point

proxy/
├── server.mjs            # Express API key proxy
├── package.json
└── .env.example
```

## Development

```bash
npm install          # Install dependencies
npm run dev          # Start dev server (http://localhost:5173)
npm run build        # Production build
npm run lint         # Lint check
npm run preview      # Preview production build
```

## License

MIT