# Matrix GIF Widget — Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        User's Browser                              │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  Element Web / Desktop                                       │  │
│  │                                                               │  │
│  │  ┌─────────────────────────────────────────────────────────┐  │  │
│  │  │  Matrix Room                                            │  │  │
│  │  │                                                         │  │  │
│  │  │   ┌─────────────────────────────────────────────────┐  │  │  │
│  │  │   │  Widget iframe                                  │  │  │  │
│  │  │   │                                                 │  │  │  │
│  │  │   │   ┌─────────────────────────┐                  │  │  │  │
│  │  │   │   │  Search: [cat GIFs  🔍] │                  │  │  │  │
│  │  │   │   └─────────────────────────┘                  │  │  │  │
│  │  │   │                                                 │  │  │  │
│  │  │   │   ┌──────┐ ┌──────┐ ┌──────┐                  │  │  │  │
│  │  │   │   │ 🐱   │ │ 🐱   │ │ 🐱   │  ← trending     │  │  │  │
│  │  │   │   └──────┘ └──────┘ └──────┘                  │  │  │  │
│  │  │   │   ┌──────┐ ┌──────┐ ┌──────┐                  │  │  │  │
│  │  │   │   │ 🐱   │ │ 🐱   │ │ 🐱   │  ← infinite     │  │  │  │
│  │  │   │   └──────┘ └──────┘ └──────┘     scroll       │  │  │  │
│  │  │   │                                                 │  │  │  │
│  │  │   │   ┌─ Preview Overlay ──────────────┐            │  │  │  │
│  │  │   │   │  [GIF animation]                │            │  │  │  │
│  │  │   │   │  [Send GIF] [Cancel]            │            │  │  │  │
│  │  │   │   └─────────────────────────────────┘            │  │  │  │
│  │  │   └─────────────────────────────────────────────────┘  │  │  │
│  │   └─────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

            │                              │
   ① Search GIFs (HTTP)        ② Send GIF (Widget API)
   /tenor/search?q=cat          uploadFile → mxc://
   /giphy/search?q=cat          sendRoomEvent → m.image
            │                              │
            ▼                              ▼
┌─────────────────────────────┐   ┌──────────────────────────┐
│  Single Express Server      │   │  Matrix Homeserver       │
│  (port 3000)                │   │  (e.g. matrix.org)      │
│                             │   │                          │
│  ┌───────────────────────┐  │   │  • Receives file upload │
│  │  SPA static files     │  │   │  • Returns mxc:// URI    │
│  │  (dist/)              │  │   │  • Distributes m.image   │
│  │  X-Frame-Options:     │  │   │    to room members      │
│  │  ALLOWALL              │  │   └──────────────────────────┘
│  │  CSP: frame-ancestors *│  │
│  └───────────────────────┘  │
│                             │
│  ┌───────────────────────┐  │
│  │  /tenor/*  ──────────────│──→ Tenor API v2
│  │  (injects API key)      │ │   tenor.googleapis.com
│  └───────────────────────┘  │
│                             │
│  ┌───────────────────────┐  │
│  │  /giphy/*  ──────────────│──→ Giphy API
│  │  (injects API key)      │ │   api.giphy.com
│  └───────────────────────┘  │
│                             │
└─────────────────────────────┘


─────────────────────────────────────────────────────────────────────
  DATA FLOW — Sending a GIF
─────────────────────────────────────────────────────────────────────

  User clicks "Send GIF"
         │
         ▼
  ┌──────────────┐     fetch(gifUrl)      ┌────────────────┐
  │  Widget SPA   │ ───────────────────── │ Tenor / Giphy  │
  │              │      (direct CDN)       │  CDN (gif URL)  │
  └──────┬───────┘                         └────────────────┘
         │ receives Blob
         ▼
  ┌──────────────┐     uploadFile(blob)    ┌────────────────┐
  │  Widget SPA   │ ───────────────────── │  Homeserver    │
  │              │   via Widget API         │  media/        │
  └──────┬───────┘                         │  upload → mxc  │
         │ receives mxc:// URI             └────────────────┘
         ▼
  ┌──────────────┐     sendRoomEvent()     └────────────────┘
  │  Widget SPA   │ ───────────────────── ──┘
  │              │   msgtype: m.image
  │              │   url: mxc://domain/...
  └──────────────┘


─────────────────────────────────────────────────────────────────────
  DEPLOYMENT — Single Container
─────────────────────────────────────────────────────────────────────

  docker compose up -d

  One service, one container:

    ┌─────────────────────────────────────────────┐
    │  matrix-gif-widget container (:3000)       │
    │                                             │
    │  Express 5 server:                          │
    │    /tenor/*  → proxies to Tenor API         │
    │    /giphy/*  → proxies to Giphy API         │
    │    /*        → serves React SPA (dist/)     │
    │                                             │
    │  Environment:                              │
    │    TENOR_API_KEY=...                        │
    │    GIPHY_API_KEY=...                         │
    │    PORT=3000                                 │
    └─────────────────────────────────────────────┘

  No nginx, no separate proxy container.
  Your front-facing reverse proxy (nginx, Caddy, Traefik)
  terminates TLS and forwards to :3000.


─────────────────────────────────────────────────────────────────────
  HOW THE WIDGET GETS ADDED TO A ROOM
─────────────────────────────────────────────────────────────────────

  Element Web:
    Room → Settings → Integrations → Add Custom Widget
    URL: https://gif.example.com/?provider=tenor

  Or via Matrix state event:
    PUT /_matrix/client/v3/rooms/{roomId}/state/im.vector.modular.widgets/gif-widget
    {
      "type": "im.vector.modular.widgets",
      "url": "https://gif.example.com/?provider=tenor",
      "name": "GIF Picker"
    }

  Element opens the URL in an iframe and injects the Widget API
  via postMessage — the widget auto-negotiates capabilities.
```

## Route Details

| Route | Purpose |
|-------|---------|
| `GET /health` | Health check endpoint |
| `GET /tenor/*` | Proxy to `tenor.googleapis.com/v2/*` with server-side API key |
| `GET /giphy/*` | Proxy to `api.giphy.com/v1/gifs/*` with server-side API key |
| `GET /*` | Static SPA files from `dist/` (SPA fallback to `index.html`) |

All responses include `X-Frame-Options: ALLOWALL` and `Content-Security-Policy: frame-ancestors *` headers to allow iframe embedding in Matrix clients.

## Widget API Capabilities

The widget requests these capabilities from the Matrix client:

- `m.sticker` — send stickers/images
- `m.image` message type — send GIF as image message
- Screenshots capability
- Visibility and theme change handling

## Theme Support

The widget listens for `ThemeChange` actions from the Matrix client and switches between `theme-dark` and `theme-light` CSS variable sets automatically.