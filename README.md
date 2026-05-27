# Matrix GIF Widget

A Matrix widget for searching and sending GIFs in Matrix rooms. Works as an iframe widget inside Element Web, Element Desktop, and other Matrix clients that support the Widget API.

Single Express server serves both the static SPA and the API proxy — no separate nginx or proxy container needed.

## Features

- Search GIFs from Tenor or Giphy
- Trending GIFs on load
- Infinite scroll pagination
- Preview selected GIF before sending
- Sends GIFs as `m.image` events with `mxc://` URI (uploaded to Matrix media server)
- Dark/light theme following Matrix client theme
- Unified server: static SPA + API proxy in one container
- API keys stay server-side (never exposed to browser)

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│  User's Browser (Element Web)                              │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Matrix Room                                         │  │
│  │  ┌────────────────────────────────────────────────┐  │  │
│  │  │  Widget iframe (SPA served by Express)         │  │  │
│  │  │                                                │  │  │
│  │  │   Search ──→ /tenor/search?q=cat              │  │  │
│  │  │      │         (proxied with server API key)    │  │  │
│  │  │      ↓                                         │  │  │
│  │  │   GIF Grid ──→ Click ──→ Preview ──→ Send      │  │  │
│  │  │                              │                  │  │  │
│  │  └──────────────────────────────┼──────────────────┘  │  │
│  │                                 │ Widget API         │  │
│  └─────────────────────────────────┼────────────────────┘  │
│                                    │                        │
│  ┌─────────────────────────────────┼────────────────────┐  │
│  │  Matrix Homeserver               │                    │  │
│  │  ① uploadFile(gif blob) ─────────┘                    │  │
│  │  ② returns mxc:// URI                                 │  │
│  │  ③ sendRoomEvent(m.image with mxc://)                  │  │
│  └────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘

        ┌────────────────────────────────────────┐
        │  Single Express Server (port 3000)      │
        │                                         │
        │  /tenor/*  → proxy to Tenor API v2      │
        │  /giphy/*  → proxy to Giphy API         │
        │  /*        → serve static SPA (dist/)   │
        │                                         │
        │  TENOR_API_KEY and GIPHY_API_KEY        │
        │  injected server-side, never in browser │
        └────────────────────────────────────────┘
```

## Quick Start

### Development (frontend only, no proxy)

```bash
export VITE_GIF_API_KEY="your-tenor-api-key"
npm install
npm run dev
```

Open Element Web, add a widget with URL:

```
http://localhost:5173/?provider=tenor&apiKey=YOUR_KEY&widgetId=$matrix_widget_id&userId=$matrix_user_id&roomId=$matrix_room_id&theme=$theme
```

### Development (full server with proxy)

```bash
npm install
npm run build
TENOR_API_KEY=your-key npm run start:dev
```

Widget URL (same origin, no API key needed in browser):

```
http://localhost:3000/?provider=tenor&widgetId=$matrix_widget_id&userId=$matrix_user_id&roomId=$matrix_room_id&theme=$theme
```

### Docker

```bash
docker compose up -d
```

Set API keys via environment variables or `.env` file:

```env
TENOR_API_KEY=your-tenor-key
GIPHY_API_KEY=your-giphy-key
```

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TENOR_API_KEY` | Yes* | Tenor API key (server-side) |
| `GIPHY_API_KEY` | No | Giphy API key (server-side) |
| `VITE_GIF_API_KEY` | No* | API key for direct calls (dev only, no proxy) |
| `VITE_GIF_PROXY_URL` | No | Override proxy base URL (defaults to same origin) |
| `PORT` | No | Server port (default: 3000) |

\* Either `TENOR_API_KEY` (for proxy) or `VITE_GIF_API_KEY` (for direct) must be set.

### URL Parameters

| Parameter | Values | Default | Description |
|-----------|--------|---------|-------------|
| `provider` | `tenor`, `giphy` | `tenor` | GIF provider |
| `apiKey` | string | env var | API key (avoid in production) |
| `proxyUrl` | URL | same origin | Proxy base URL |

### Widget URL Examples

Production (proxy, no key in URL):
```
https://gif.your-domain.com/?provider=tenor&widgetId=$matrix_widget_id&userId=$matrix_user_id&roomId=$matrix_room_id&theme=$theme
```

**Important:** The `$matrix_*` template placeholders are required. Element substitutes these when loading the widget:
- `$matrix_widget_id` — the widget's unique ID (required for WidgetApi handshake)
- `$matrix_user_id` — the current user's Matrix ID
- `$matrix_room_id` — the room ID the widget is in
- `$theme` — the client's current theme (`light` or `dark`)

Without `widgetId`, the WidgetApi cannot complete capability negotiation and all sends will fail with "Not ready or unknown widget ID".

Development (direct API):
```
http://localhost:5173/?provider=tenor&apiKey=YOUR_KEY&widgetId=$matrix_widget_id&userId=$matrix_user_id&roomId=$matrix_room_id&theme=$theme
```

## Adding Widget to a Matrix Room

### Element Web

1. Open a room
2. Click the room name → **Settings** → **Integrations**
3. Add a custom widget with the URL including `$matrix_*` placeholders (see above)

### Via Matrix State Event

```json
{
  "type": "im.vector.modular.widgets",
  "state_key": "gif-widget",
  "content": {
    "type": "im.vector.modular.widgets",
    "name": "GIF Picker",
    "url": "https://gif.your-domain.com/?provider=tenor&widgetId=$matrix_widget_id&userId=$matrix_user_id&roomId=$matrix_room_id&theme=$theme",
    "data": {}
  }
}
```

**Note:** This widget uses `sendRoomEvent("m.room.message")` to send GIFs as `m.image` messages. It does **not** use `sendSticker` — that capability is only available to `m.stickerpicker` type widgets.

## Tech Stack

- **Backend**: Express 5 (serves SPA + proxies GIF APIs)
- **Frontend**: React 19 + TypeScript
- **Build**: Vite 8
- **Widget API**: `matrix-widget-api` v1.17+
- **GIF APIs**: Tenor API v2, Giphy API
- **Deploy**: Single Docker container (no nginx needed)

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

server.mjs                # Express server (SPA + API proxy)
Dockerfile                # Multi-stage build → single container
docker-compose.yml        # Single-service deployment
```

## Development

```bash
npm install              # Install dependencies
npm run dev              # Start Vite dev server (http://localhost:5173)
npm run build            # Production build
npm run start:dev        # Run server with --watch
npm run start            # Run production server
npm run lint             # Lint check
```

## License

MIT