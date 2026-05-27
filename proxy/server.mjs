import express from "express";
import cors from "cors";

const PORT = parseInt(process.env.PROXY_PORT || "3100", 10);
const TENOR_KEY = process.env.TENOR_API_KEY || "";
const GIPHY_KEY = process.env.GIPHY_API_KEY || "";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/tenor/*", async (req, res) => {
  if (!TENOR_KEY) {
    res.status(500).json({ error: "TENOR_API_KEY not configured" });
    return;
  }
  const path = req.params[0];
  const url = new URL(req.url, `https://tenor.googleapis.com/v2/${path}`);
  url.searchParams.delete("key");
  url.searchParams.set("key", TENOR_KEY);
  url.searchParams.set("client_key", "matrix-gif-widget");

  try {
    const upstream = await fetch(url.toString());
    const data = await upstream.text();
    res.set("Content-Type", upstream.headers.get("content-type") || "application/json");
    res.status(upstream.status).send(data);
  } catch (err) {
    res.status(502).json({ error: "Upstream Tenor request failed" });
  }
});

app.get("/giphy/*", async (req, res) => {
  if (!GIPHY_KEY) {
    res.status(500).json({ error: "GIPHY_API_KEY not configured" });
    return;
  }
  const path = req.params[0];
  const url = new URL(req.url, `https://api.giphy.com/v1/gifs/${path}`);
  url.searchParams.delete("api_key");
  url.searchParams.set("api_key", GIPHY_KEY);

  try {
    const upstream = await fetch(url.toString());
    const data = await upstream.text();
    res.set("Content-Type", upstream.headers.get("content-type") || "application/json");
    res.status(upstream.status).send(data);
  } catch (err) {
    res.status(502).json({ error: "Upstream Giphy request failed" });
  }
});

app.listen(PORT, () => {
  console.log(`GIF proxy server running on port ${PORT}`);
  if (TENOR_KEY) console.log("  Tenor API: configured");
  if (GIPHY_KEY) console.log("  Giphy API: configured");
});