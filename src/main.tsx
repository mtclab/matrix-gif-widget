import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { GifWidget } from "./components/GifWidget";
import { getConfig } from "./config";
import "./index.css";

const config = getConfig();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <GifWidget config={config} />
  </StrictMode>
);