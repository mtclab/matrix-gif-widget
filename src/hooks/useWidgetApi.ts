import { useCallback, useEffect, useReducer, useRef } from "react";
import {
  WidgetApi,
  MatrixCapabilities,
  WidgetApiToWidgetAction,
  StickerpickerCapabilities,
} from "matrix-widget-api";
import type { WidgetConfig } from "../types";

declare global {
  interface Window {
    widgetConfig?: Partial<WidgetConfig>;
  }
}

export interface WidgetApiState {
  api: WidgetApi | null;
  ready: boolean;
  error: string | null;
  theme: "light" | "dark";
  userId: string | null;
  roomId: string | null;
}

type Action =
  | { type: "INIT"; api: WidgetApi; userId: string | null; roomId: string | null }
  | { type: "READY" }
  | { type: "ERROR"; error: string }
  | { type: "THEME"; theme: "light" | "dark" };

const initState: WidgetApiState = {
  api: null,
  ready: false,
  error: null,
  theme: "dark",
  userId: null,
  roomId: null,
};

function reducer(state: WidgetApiState, action: Action): WidgetApiState {
  switch (action.type) {
    case "INIT":
      return { ...state, api: action.api, userId: action.userId, roomId: action.roomId };
    case "READY":
      return { ...state, ready: true };
    case "ERROR":
      return { ...state, error: action.error };
    case "THEME":
      return { ...state, theme: action.theme };
    default:
      return state;
  }
}

function getWidgetUrlParams(): { userId: string | null; roomId: string | null; widgetId: string | null } {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#\/?/, ""));
    return {
      userId: urlParams.get("userId") || hashParams.get("userId"),
      roomId: urlParams.get("roomId") || hashParams.get("roomId"),
      widgetId: urlParams.get("widgetId") || hashParams.get("widgetId"),
    };
  } catch {
    return { userId: null, roomId: null, widgetId: null };
  }
}

const LOG = (...args: unknown[]) => console.log("[GIF-Widget]", ...args);

const READY_TIMEOUT_MS = 5000;

export function useWidgetApi(): WidgetApiState {
  const [state, dispatch] = useReducer(reducer, initState);
  const apiRef = useRef<WidgetApi | null>(null);
  const mountedRef = useRef(true);
  const readyFiredRef = useRef(false);

  const handleThemeChange = useCallback((ev: Event) => {
    ev.preventDefault();
    const detail = (ev as CustomEvent).detail as { data?: { theme?: string } };
    const newTheme = detail?.data?.theme === "light" ? "light" : "dark";
    if (mountedRef.current) dispatch({ type: "THEME", theme: newTheme });
    const widget = apiRef.current;
    if (widget) widget.transport.reply((ev as CustomEvent).detail, {});
  }, []);

  const handleGenericAction = useCallback((ev: Event) => {
    ev.preventDefault();
    const widget = apiRef.current;
    if (widget) widget.transport.reply((ev as CustomEvent).detail, {});
  }, []);

  useEffect(() => {
    const urlParams = getWidgetUrlParams();
    LOG("Init — urlParams:", urlParams, "location:", window.location.href);

    const initialWidgetId = urlParams.widgetId || undefined;
    LOG("Using widgetId from URL:", initialWidgetId);

    // Raw postMessage debug listener — see everything Element sends
    const rawHandler = (event: MessageEvent) => {
      if (event.data && typeof event.data === "object" && event.data.api) {
        LOG("RAW postMessage received:", JSON.stringify(event.data).slice(0, 500));
      }
    };
    window.addEventListener("message", rawHandler);

    try {
      const widget = new WidgetApi(initialWidgetId);
      apiRef.current = widget;
      LOG("WidgetApi created with widgetId:", initialWidgetId);

      widget.requestCapability(MatrixCapabilities.Screenshots);
      widget.requestCapabilities(StickerpickerCapabilities);
      widget.requestCapabilityToSendMessage("m.image");
      LOG("Capabilities requested");

      widget.on(`action:${WidgetApiToWidgetAction.UpdateVisibility}`, handleGenericAction);
      widget.on(`action:${WidgetApiToWidgetAction.ThemeChange}`, handleThemeChange);
      widget.on(`action:${WidgetApiToWidgetAction.TakeScreenshot}`, handleGenericAction);

      const onReady = () => {
        if (readyFiredRef.current) return;
        readyFiredRef.current = true;
        LOG("WidgetApi ready event received");
        if (mountedRef.current) dispatch({ type: "READY" });

        requestAnimationFrame(() => {
          LOG("Sending contentLoaded + alwaysOnScreen");
          widget.sendContentLoaded().then(() => LOG("contentLoaded acked")).catch((e: unknown) => LOG("contentLoaded failed:", e));
          widget.setAlwaysOnScreen(true).then((v: boolean) => LOG("alwaysOnScreen result:", v)).catch((e: unknown) => LOG("alwaysOnScreen failed:", e));
        });
      };

      widget.on("ready", onReady);

      widget.start();
      LOG("WidgetApi started, waiting for ready event");

      dispatch({ type: "INIT", api: widget, userId: urlParams.userId, roomId: urlParams.roomId });

      const readyTimer = setTimeout(() => {
        if (!readyFiredRef.current) {
          LOG("Ready timeout — self-declaring ready (Element may not negotiate capabilities for custom widgets)");
          onReady();
        }
      }, READY_TIMEOUT_MS);

      return () => {
        clearTimeout(readyTimer);
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to initialize Widget API";
      LOG("Init error:", msg);
      if (mountedRef.current) dispatch({ type: "ERROR", error: msg });
    }

    const cleanupWidget = apiRef.current;
    return () => {
      mountedRef.current = false;
      apiRef.current = null;
      window.removeEventListener("message", rawHandler);
      cleanupWidget?.off(`action:${WidgetApiToWidgetAction.UpdateVisibility}`, handleGenericAction);
      cleanupWidget?.off(`action:${WidgetApiToWidgetAction.ThemeChange}`, handleThemeChange);
      cleanupWidget?.off(`action:${WidgetApiToWidgetAction.TakeScreenshot}`, handleGenericAction);
    };
  }, [handleThemeChange, handleGenericAction]);

  return state;
}

const STICKER_SEND_TIMEOUT = 15000;

const MEDIA_PROXY_BASE = typeof window !== "undefined" ? `${window.location.origin}/media` : "/media";

export function resolveGifUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "media.tenor.com") {
      return `${MEDIA_PROXY_BASE}/tenor${parsed.pathname}${parsed.search}`;
    }
    if (/^media\d*\.giphy\.com$/.test(parsed.hostname)) {
      return `${MEDIA_PROXY_BASE}/giphy${parsed.pathname}${parsed.search}`;
    }
  } catch {
    // not a valid URL, return as-is
  }
  return url;
}

export async function sendGifAsImage(
  api: WidgetApi | null,
  gifUrl: string,
  gifData: {
    width: number;
    height: number;
    mimeType: string;
    fileName: string;
  }
): Promise<boolean> {
  if (!api) { LOG("sendGifAsImage: no api"); return false; }

  LOG("sendGifAsImage: starting with url=", gifUrl, "data=", gifData);

  const stickerContent = {
    url: gifUrl,
    info: {
      h: gifData.height,
      w: gifData.width,
      mimetype: gifData.mimeType,
      size: undefined as number | undefined,
    },
  };

  const proxiedUrl = resolveGifUrl(gifUrl);

  try {
    const response = await fetch(proxiedUrl);
    if (response.ok) {
      const blob = await response.blob();
      const file = new File([blob], gifData.fileName, { type: gifData.mimeType });
      stickerContent.info.size = blob.size;
      LOG("Fetched GIF via proxy, size=", blob.size, "attempting uploadFile");

      try {
        const uploadResponse = await api.uploadFile(file);
        const mxcUri = uploadResponse?.content_uri;
        LOG("uploadFile response:", uploadResponse, "mxcUri=", mxcUri);
        if (mxcUri) {
          stickerContent.url = mxcUri;
        }
      } catch (uploadErr: unknown) {
        LOG("uploadFile failed (MSC4039 unsupported?), using HTTP URL:", uploadErr);
      }
    }
  } catch (fetchErr: unknown) {
    LOG("Could not fetch GIF via proxy, trying direct URL:", fetchErr);
    try {
      const response = await fetch(gifUrl);
      if (response.ok) {
        const blob = await response.blob();
        const file = new File([blob], gifData.fileName, { type: gifData.mimeType });
        stickerContent.info.size = blob.size;
        LOG("Fetched GIF direct, size=", blob.size, "attempting uploadFile");

        try {
          const uploadResponse = await api.uploadFile(file);
          const mxcUri = uploadResponse?.content_uri;
          LOG("uploadFile response:", uploadResponse, "mxcUri=", mxcUri);
          if (mxcUri) {
            stickerContent.url = mxcUri;
          }
        } catch (uploadErr: unknown) {
          LOG("uploadFile failed:", uploadErr);
        }
      }
    } catch (directErr: unknown) {
      LOG("Could not fetch GIF for upload, sending HTTP URL:", directErr);
    }
  }

  // Try WidgetApi first
  LOG("Sending sticker with content.url=", stickerContent.url);
  try {
    await Promise.race([
      api.sendSticker({
        name: gifData.fileName,
        description: gifData.fileName,
        content: stickerContent,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("sendSticker timeout")), STICKER_SEND_TIMEOUT)
      ),
    ]);
    LOG("sendSticker succeeded!");
    return true;
  } catch (stickerErr: unknown) {
    LOG("sendSticker failed:", stickerErr);
  }

  // Fallback: try sendRoomEvent
  LOG("Trying sendRoomEvent m.room.message fallback");
  try {
    await api.sendRoomEvent("m.room.message", {
      msgtype: "m.image",
      body: gifData.fileName,
      url: stickerContent.url,
      info: stickerContent.info,
    });
    LOG("sendRoomEvent succeeded!");
    return true;
  } catch (msgErr: unknown) {
    LOG("sendRoomEvent failed:", msgErr);
  }

  // Final fallback: direct postMessage to Element
  LOG("Trying direct postMessage fallback to parent");
  try {
    const fallbackWidgetId = new URLSearchParams(window.location.search).get("widgetId") || new URLSearchParams(window.location.hash.replace(/^#\/?/, "")).get("widgetId") || "stickerpicker";
    LOG("sendGifAsImage: api.widgetId not accessible, using fallback:", fallbackWidgetId);
    const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    // Try im.vector.action (Element Web custom action)
    const stickerAction = {
      api: "fromWidget",
      widgetId: fallbackWidgetId,
      requestId,
      action: "m.sticker",
      data: {
        name: gifData.fileName,
        description: gifData.fileName,
        content: stickerContent,
      },
    };

    LOG("Sending direct postMessage:", JSON.stringify(stickerAction).slice(0, 300));
    window.parent.postMessage(stickerAction, "*");

    // Also try the toWidget notify format
    const notifyAction = {
      api: "toWidget",
      widgetId: fallbackWidgetId,
      requestId: `req_${Date.now()}_${Math.random().toString(36).slice(2)}_notify`,
      action: "m.sticker",
      data: {
        name: gifData.fileName,
        description: gifData.fileName,
        content: stickerContent,
      },
    };
    window.parent.postMessage(notifyAction, "*");

    // Return true optimistically — we can't confirm delivery via postMessage
    LOG("Direct postMessage sent");
    return true;
  } catch (postMsgErr: unknown) {
    LOG("All send methods failed:", postMsgErr);
    return false;
  }
}