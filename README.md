# Matrix GIF Widget

A Matrix widget for searching and sending GIFs in Matrix rooms.

## Status

🚧 Investigation & Design Phase

## Overview

This project aims to build a Matrix widget that allows users to search for and send GIFs directly within Matrix rooms. The widget uses the [Matrix Widget API](https://github.com/matrix-org/matrix-widget-api) to communicate with Matrix clients (Element, etc.) and integrates with GIF providers (Tenor, Giphy, etc.) to provide a seamless GIF search and sharing experience.

## Key Questions (Investigation Phase)

- **Widget API specifics**: How does `matrix-widget-api` (npm package) work? What capabilities are needed?
- **Embedding model**: How do widgets get added to Matrix rooms? (via `m.widget` state event or Element's integration manager)
- **GIF source**: Which GIF API to use? (Tenor API, Giphy API, or self-hosted)
- **Message format**: How should GIFs be sent? (as `m.image` with `mxc://` URI after upload, or as `m.file` with external URL)
- **Self-hosting**: Can this be a simple static SPA, or does it need a backend for API key management?
- **Security**: API key handling — proxy through backend or use keyless GIF sources?
- **Client compatibility**: Element Web, Element Desktop, Element X — which support widgets?

## Tech Stack (Tentative)

- **Frontend**: TypeScript + React (or vanilla SPA)
- **Widget API**: [`matrix-widget-api`](https://github.com/matrix-org/matrix-widget-api) (v1.17.0)
- **GIF Provider**: TBD (Tenor API v2, Giphy API, or others)
- **Build**: Vite or similar
- **Hosting**: Static SPA, deployable to any web server

## Matrix Widget API Reference

The widget is loaded as an iframe within a Matrix client (Element). Key concepts:

1. **WidgetApi** class — main interface for widget ↔ client communication
2. **Capabilities** — request permissions (screenshot, sticker sending, etc.)
3. **Action handlers** — respond to client actions (visibility changes, etc.)
4. **Sending messages** — via `api.transport.send()` for custom actions or standard Matrix messaging

```typescript
// Example from matrix-widget-api
import { WidgetApi, MatrixCapabilities, StickerpickerCapabilities } from "matrix-widget-api";

const widgetId = null;
const api = new WidgetApi(widgetId);

api.requestCapability(MatrixCapabilities.Screenshots);
api.requestCapabilities(StickerpickerCapabilities);

api.on(`action:${WidgetApiToWidgetAction.UpdateVisibility}`, (ev) => {
  ev.preventDefault();
  api.transport.reply(ev.detail, {});
});

api.start();
api.sendContentLoaded();
```

## Architecture

```
┌─────────────────────┐
│   Matrix Client      │
│   (Element Web/X)    │
│                     │
│  ┌───────────────┐  │
│  │  Widget iframe │  │
│  │               │  │
│  │  GIF Search   │  │
│  │  GIF Preview  │  │
│  │  Send button  │  │
│  └───────┬───────┘  │
│          │ Widget API│
│          ▼          │
│  Matrix Protocol   │
│  (m.image events)  │
└─────────────────────┘
         │
         │ GIF API calls
         ▼
┌─────────────────────┐
│   GIF Provider      │
│   (Tenor/Giphy)     │
└─────────────────────┘
```

## Development

```bash
# Install dependencies
npm install

# Run dev server
npm run dev

# Build for production
npm run build
```

## License

TBD