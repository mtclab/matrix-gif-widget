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
│  │  │   ┌─────────────────────────────────────────────────┐   │  │  │
│  │  │   │  Widget iframe                                  │   │  │  │
│  │  │   │                                                 │   │  │  │
│  │  │   │   ┌─────────────────────────────────────────┐   │   │  │  │
│  │  │   │   │  Matrix GIF Widget (React SPA)         │   │   │  │  │
│  │  │   │   │                                         │   │   │  │  │
│  │  │   │   │   ┌─────────────────────────┐          │   │   │  │  │
│  │  │   │   │   │  Search: [cat GIFs  🔍] │          │   │   │  │  │
│  │  │   │   │   └─────────────────────────┘          │   │   │  │  │
│  │  │   │   │                                         │   │   │  │  │
│  │  │   │   │   ┌──────┐ ┌──────┐ ┌──────┐          │   │   │  │  │
│  │  │   │   │   │ 🐱   │ │ 🐱   │ │ 🐱   │  ← grid  │   │   │  │  │
│  │  │   │   │   └──────┘ └──────┘ └──────┘          │   │   │  │  │
│  │  │   │   │   ┌──────┐ ┌──────┐ ┌──────┐          │   │   │  │  │
│  │  │   │   │   │ 🐱   │ │ 🐱   │ │ 🐱   │          │   │   │  │  │
│  │  │   │   │   └──────┘ └──────┘ └──────┘          │   │   │  │  │
│  │  │   │   │                                         │   │   │  │  │
│  │  │   │   │   ┌─ Preview Overlay ──────────────┐   │   │  │  │  │
│  │  │   │   │   │  [GIF animation]                │   │   │  │  │  │
│  │  │   │   │   │  [Send GIF] [Cancel]            │   │   │  │  │  │
│  │  │   │   │   └─────────────────────────────────┘   │   │  │  │  │
│  │  │   │   └─────────────────────────────────────────┘   │   │  │  │
│  │  │   └─────────────────────────────────────────────────┘   │  │  │
│  │  └─────────────────────────────────────────────────────────┘   │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

                        │                           │
            ① Widget API (postMessage)      ② GIF search (HTTP)
            (within iframe boundary)         (direct or proxied)
                        │                           │
                        ▼                           ▼
┌──────────────────────────┐         ┌──────────────────────────────┐
│  Matrix Homeserver       │         │  GIF API Proxy (optional)   │
│  (e.g. matrix.org)       │         │  (Express on port :3100)     │
│                          │         │                              │
│  • Upload media          │         │  GET /tenor/search?q=...     │
│    → returns mxc:// URI  │         │  GET /tenor/featured          │
│  • Send m.room.message   │         │  GET /giphy/search?q=...     │
│    with mxc:// URL       │         │  GET /giphy/trending          │
│                          │         │                              │
│  ③ uploadFile(blob)      │         │  Injects server-side API     │
│  ④ sendRoomEvent()       │         │  keys — no keys in browser   │
│                          │         └──────────┬───────────────────┘
└──────────────────────────┘                    │
                                                │  forwards with key
                                                ▼
                                 ┌──────────────────────────────┐
                                 │  Tenor API (v2)               │
                                 │  tenor.googleapis.com/v2      │
                                 ├──────────────────────────────┤
                                 │  Giphy API                    │
                                 │  api.giphy.com/v1/gifs        │
                                 └──────────────────────────────┘


─────────────────────────────────────────────────────────────────────
  DATA FLOW — Sending a GIF
─────────────────────────────────────────────────────────────────────

  User clicks "Send GIF"
         │
         ▼
  ┌──────────────┐     fetch(gifUrl)      ┌────────────────┐
  │  Widget SPA   │ ───────────────────── │ Tenor / Giphy  │
  │              │                         │  CDN (gif URL)  │
  └──────┬───────┘                         └────────────────┘
         │ receives Blob
         ▼
  ┌──────────────┐     uploadFile(blob)    ┌────────────────┐
  │  Widget SPA   │ ───────────────────── │     Matrix       │
  │              │   via Widget API         │  Homeserver      │
  └──────┬───────┘                         │                 │
         │ receives mxc:// URI             │  media/          │
         ▼                                  │  upload → mxc    │
  ┌──────────────┐     sendRoomEvent()     └────────────────┘
  │  Widget SPA   │ ───────────────────── ──┘
  │              │   m.room.message
  │              │   msgtype: m.image
  │              │   url: mxc://...
  └──────────────┘


─────────────────────────────────────────────────────────────────────
  DEPLOYMENT — Two Options
─────────────────────────────────────────────────────────────────────

  Option A — Simple (no proxy, API key in URL or env)
  ─────────────────────────────────────────────────────

    ┌─────────────┐
    │  nginx       │  ← serves static SPA from :8080
    │  (Docker)    │
    └─────────────┘
    
    Widget URL: https://gif.example.com/?provider=tenor&apiKey=KEY
    ⚠ API key visible in widget URL (use proxy instead for prod)


  Option B — Production (proxy hides API keys)
  ──────────────────────────────────────────────

    ┌─────────────────┐     ┌─────────────────┐
    │  nginx           │     │  Express proxy    │
    │  (widget SPA)    │     │  (API keys)       │
    │  :8080           │     │  :3100            │
    └─────────────────┘     └─────────────────┘
    
    Widget URL: https://gif.example.com/?provider=tenor&proxyUrl=https://gif.example.com:3100
    ✅ No API keys in browser — proxy injects them server-side


  Option C — Docker Compose (both together)
  ──────────────────────────────────────────

    docker compose up -d
    
    Services:
      widget  → http://localhost:8080  (nginx + SPA)
      proxy   → http://localhost:3100  (Express API proxy)


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