import { useCallback, useEffect, useReducer, useRef } from "react";
import {
  WidgetApi,
  WidgetApiToWidgetAction,
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
    LOG("handleGenericAction:", (ev as CustomEvent).detail?.action);
    const widget = apiRef.current;
    if (widget) widget.transport.reply((ev as CustomEvent).detail, {});
  }, []);

  useEffect(() => {
    const urlParams = getWidgetUrlParams();
    // Element substitutes $matrix_widget_id, $matrix_user_id, $matrix_room_id in the widget URL
    LOG("Init — urlParams:", urlParams, "location:", window.location.href);

    const widgetId = urlParams.widgetId || undefined;
    if (!widgetId) {
      LOG("WARNING: no widgetId in URL — Element requires $matrix_widget_id placeholder in widget URL");
    }

    const rawHandler = (event: MessageEvent) => {
      if (event.data && typeof event.data === "object" && event.data.api) {
        LOG("RAW postMessage:", JSON.stringify(event.data).slice(0, 500));
      }
    };
    window.addEventListener("message", rawHandler);

    try {
      const widget = new WidgetApi(widgetId);
      apiRef.current = widget;
      LOG("WidgetApi created with widgetId:", widgetId);

      // Only request capabilities a custom widget can actually get approved
      widget.requestCapabilityToSendMessage("m.image");
      widget.requestCapabilityToSendMessage("m.room.message");
      LOG("Capabilities requested: m.image, m.room.message");

      // Handle all toWidget actions Element may send — reply to each one
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

const SEND_TIMEOUT = 15000;

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
  if (!api) {
    LOG("sendGifAsImage: no WidgetApi — cannot send");
    return false;
  }

  LOG("sendGifAsImage: starting with url=", gifUrl, "data=", gifData);

  const stickerContent: { url: string; info: { h: number; w: number; mimetype: string; size?: number } } = {
    url: gifUrl,
    info: {
      h: gifData.height,
      w: gifData.width,
      mimetype: gifData.mimeType,
    },
  };

  // Try fetching via media proxy for uploadFile
  const proxiedUrl = resolveGifUrl(gifUrl);

  try {
    const response = await fetch(proxiedUrl);
    if (response.ok) {
      const blob = await response.blob();
      const file = new File([blob], gifData.fileName, { type: gifData.mimeType });
      stickerContent.info.size = blob.size;
      LOG("Fetched GIF via proxy, size=", blob.size);

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
    LOG("Proxy fetch failed, trying direct URL:", fetchErr);
    try {
      const response = await fetch(gifUrl);
      if (response.ok) {
        const blob = await response.blob();
        const file = new File([blob], gifData.fileName, { type: gifData.mimeType });
        stickerContent.info.size = blob.size;
        LOG("Fetched GIF direct, size=", blob.size);

        try {
          const uploadResponse = await api.uploadFile(file);
          const mxcUri = uploadResponse?.content_uri;
          if (mxcUri) {
            stickerContent.url = mxcUri;
          }
        } catch (uploadErr: unknown) {
          LOG("uploadFile failed:", uploadErr);
        }
      }
    } catch (directErr: unknown) {
      LOG("Direct fetch also failed:", directErr);
    }
  }

  // Send via sendRoomEvent — custom widgets use m.room.message with m.image msgtype
  LOG("Sending m.room.message with content.url=", stickerContent.url);
  try {
    await Promise.race([
      api.sendRoomEvent("m.room.message", {
        msgtype: "m.image",
        body: gifData.fileName,
        url: stickerContent.url,
        info: stickerContent.info,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("sendRoomEvent timeout")), SEND_TIMEOUT)
      ),
    ]);
    LOG("sendRoomEvent succeeded!");
    return true;
  } catch (err: unknown) {
    LOG("sendRoomEvent failed:", err);
    return false;
  }
}