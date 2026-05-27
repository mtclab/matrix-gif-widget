import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import cors from "cors";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = parseInt(process.env.PORT || "3000", 10);
const TENOR_KEY = process.env.TENOR_API_KEY || "";
const GIPHY_KEY = process.env.GIPHY_API_KEY || "";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

async function proxyTenor(req, res) {
  if (!TENOR_KEY) {
    res.status(500).json({ error: "TENOR_API_KEY not configured" });
    return;
  }
  const subpath = req.path.replace(/^\/?/, "");
  const url = new URL(`https://tenor.googleapis.com/v2/${subpath}`);
  for (const [key, value] of Object.entries(req.query)) {
    if (key !== "key") url.searchParams.set(key, value);
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
  const url = new URL(`https://api.giphy.com/v1/gifs/${subpath}`);
  for (const [key, value] of Object.entries(req.query)) {
    if (key !== "api_key") url.searchParams.set(key, value);
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

app.use("/tenor", proxyTenor);
app.use("/giphy", proxyGiphy);

const distDir = join(__dirname, "dist");

app.use(express.static(distDir, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith(".html")) {
      res.setHeader("X-Frame-Options", "ALLOWALL");
      res.setHeader("Content-Security-Policy", "frame-ancestors *");
    }
  },
}));

app.use((_req, res) => {
  res.setHeader("X-Frame-Options", "ALLOWALL");
  res.setHeader("Content-Security-Policy", "frame-ancestors *");
  res.sendFile(join(distDir, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Matrix GIF Widget server running on port ${PORT}`);
  if (TENOR_KEY) console.log("  Tenor API: configured");
  if (GIPHY_KEY) console.log("  Giphy API: configured");
});