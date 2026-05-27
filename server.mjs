import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = parseInt(process.env.PORT || "3000", 10);
const TENOR_KEY = process.env.TENOR_API_KEY || "";
const GIPHY_KEY = process.env.GIPHY_API_KEY || "";
const CORS_ORIGINS = (process.env.CORS_ORIGINS || "").split(",").filter(Boolean);
const FRAME_ANCESTORS = process.env.FRAME_ANCESTORS || "'self'";

const ALLOWED_TENOR_PATHS = /^\/(search|featured|categories|gifs|search_suggestions|autocomplete|trending)(\/|$|\?)/i;
const ALLOWED_GIPHY_PATHS = /^\/(search|trending|translate|random|gifs_by_id|categories|search_suggestions|autocomplete)(\/|$|\?)/i;

const app = express();

app.use(express.json());

if (CORS_ORIGINS.length > 0) {
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && CORS_ORIGINS.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    }
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });
}

const rateLimiter = new Map();
const RATE_WINDOW = 60_000;
const RATE_MAX = 60;

function checkRateLimit(req, _res, next) {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const entry = rateLimiter.get(ip);
  if (!entry || now - entry.window > RATE_WINDOW) {
    rateLimiter.set(ip, { window: now, count: 1 });
    next();
    return;
  }
  entry.count++;
  if (entry.count > RATE_MAX) {
    _res.status(429).json({ error: "Too many requests" });
    return;
  }
  next();
}

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

async function proxyTenor(req, res) {
  if (!TENOR_KEY) {
    res.status(500).json({ error: "TENOR_API_KEY not configured" });
    return;
  }
  const subpath = req.path.replace(/^\/?/, "");
  if (!ALLOWED_TENOR_PATHS.test("/" + subpath)) {
    res.status(400).json({ error: "Invalid path" });
    return;
  }

  const url = new URL(`https://tenor.googleapis.com/v2/${subpath}`);
  for (const [key, value] of Object.entries(req.query)) {
    if (key !== "key") url.searchParams.set(key, String(value));
  }
  url.searchParams.set("key", TENOR_KEY);
  url.searchParams.set("client_key", "matrix-gif-widget");

  try {
    const upstream = await fetch(url.toString());
    const data = await upstream.text();
    res.set("Content-Type", upstream.headers.get("content-type") || "application/json");
    res.status(upstream.status).send(data);
  } catch {
    res.status(502).json({ error: "Upstream Tenor request failed" });
  }
}

async function proxyGiphy(req, res) {
  if (!GIPHY_KEY) {
    res.status(500).json({ error: "GIPHY_API_KEY not configured" });
    return;
  }
  const subpath = req.path.replace(/^\/?/, "");
  if (!ALLOWED_GIPHY_PATHS.test("/" + subpath)) {
    res.status(400).json({ error: "Invalid path" });
    return;
  }

  const url = new URL(`https://api.giphy.com/v1/gifs/${subpath}`);
  for (const [key, value] of Object.entries(req.query)) {
    if (key !== "api_key") url.searchParams.set(key, String(value));
  }
  url.searchParams.set("api_key", GIPHY_KEY);

  try {
    const upstream = await fetch(url.toString());
    const data = await upstream.text();
    res.set("Content-Type", upstream.headers.get("content-type") || "application/json");
    res.status(upstream.status).send(data);
  } catch {
    res.status(502).json({ error: "Upstream Giphy request failed" });
  }
}

app.use("/tenor", checkRateLimit, proxyTenor);
app.use("/giphy", checkRateLimit, proxyGiphy);

const distDir = join(__dirname, "dist");

const cspHeader = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://media.tenor.com https://media.giphy.com https://*.tenor.com https://*.giphy.com",
  "connect-src 'self'",
  "frame-ancestors " + FRAME_ANCESTORS,
].join("; ");

app.use(express.static(distDir, {
  setHeaders: (res, filePath) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    if (filePath.endsWith(".html")) {
      res.setHeader("Content-Security-Policy", cspHeader);
    }
  },
}));

app.use((_req, res) => {
  res.setHeader("Content-Security-Policy", cspHeader);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.sendFile(join(distDir, "index.html"));
});

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimiter) {
    if (now - entry.window > RATE_WINDOW) rateLimiter.delete(ip);
  }
}, 60_000);

app.listen(PORT, () => {
  console.log(`Matrix GIF Widget server running on port ${PORT}`);
  if (TENOR_KEY) console.log("  Tenor API: configured");
  if (GIPHY_KEY) console.log("  Giphy API: configured");
  if (CORS_ORIGINS.length) console.log(`  CORS origins: ${CORS_ORIGINS.join(", ")}`);
  console.log(`  Frame ancestors: ${FRAME_ANCESTORS}`);
});