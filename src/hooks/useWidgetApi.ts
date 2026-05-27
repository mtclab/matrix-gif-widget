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
    LOG("Init — urlParams:", urlParams, "location:", window.location.href);

    if (!urlParams.widgetId) {
      const msg =
        "Widget URL is missing the widgetId parameter. The widget URL template must include " +
        "$matrix_widget_id (and ideally $matrix_user_id, $matrix_room_id, $theme) so Element " +
        "can substitute the real values. See README → 'Adding Widget to a Matrix Room'.";
      LOG("Init error:", msg);
      if (mountedRef.current) dispatch({ type: "ERROR", error: msg });
      return;
    }

    const rawHandler = (event: MessageEvent) => {
      if (event.data && typeof event.data === "object" && event.data.api) {
        LOG("RAW postMessage:", JSON.stringify(event.data).slice(0, 500));
      }
    };
    window.addEventListener("message", rawHandler);

    try {
      const widget = new WidgetApi(urlParams.widgetId);
      apiRef.current = widget;
      LOG("WidgetApi created with widgetId:", urlParams.widgetId);

      // Custom widgets can request m.send.event capabilities. Element will
      // prompt the user to approve them. We do NOT request StickerpickerCapabilities
      // or m.sticker — Element only grants those for type: "m.stickerpicker" widgets.
      widget.requestCapabilityToSendMessage("m.image");
      widget.requestCapabilityToSendMessage("m.room.message");
      LOG("Capabilities requested: m.send.event:m.image, m.send.event:m.room.message");

      // Register handlers BEFORE start() so we don't miss Element's opening
      // messages. Every toWidget action we don't specifically handle gets a
      // generic ack so Element doesn't log "unhandled".
      widget.on(`action:${WidgetApiToWidgetAction.ThemeChange}`, handleThemeChange);
      widget.on(`action:${WidgetApiToWidgetAction.UpdateVisibility}`, handleGenericAction);
      widget.on(`action:${WidgetApiToWidgetAction.TakeScreenshot}`, handleGenericAction);
      widget.on(`action:${WidgetApiToWidgetAction.NotifyCapabilities}`, handleGenericAction);

      const onReady = () => {
        if (readyFiredRef.current) return;
        readyFiredRef.current = true;
        LOG("WidgetApi ready event received");
        if (mountedRef.current) dispatch({ type: "READY" });

        widget
          .sendContentLoaded()
          .then(() => LOG("contentLoaded acked"))
          .catch((e: unknown) => LOG("contentLoaded failed:", e));
        widget
          .setAlwaysOnScreen(true)
          .then((v: boolean) => LOG("alwaysOnScreen result:", v))
          .catch((e: unknown) => LOG("alwaysOnScreen failed:", e));
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
      cleanupWidget?.off(`action:${WidgetApiToWidgetAction.ThemeChange}`, handleThemeChange);
      cleanupWidget?.off(`action:${WidgetApiToWidgetAction.UpdateVisibility}`, handleGenericAction);
      cleanupWidget?.off(`action:${WidgetApiToWidgetAction.TakeScreenshot}`, handleGenericAction);
      cleanupWidget?.off(`action:${WidgetApiToWidgetAction.NotifyCapabilities}`, handleGenericAction);
    };
  }, [handleThemeChange, handleGenericAction]);

  return state;
}

const SEND_TIMEOUT_MS = 15000;

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

export class SendGifError extends Error {
  readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "SendGifError";
    this.cause = cause;
  }
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
): Promise<void> {
  if (!api) {
    throw new SendGifError("Widget API not initialized");
  }

  LOG("sendGifAsImage: starting with url=", gifUrl, "data=", gifData);

  const imageContent: {
    msgtype: "m.image";
    body: string;
    url: string;
    info: { h: number; w: number; mimetype: string; size?: number };
  } = {
    msgtype: "m.image",
    body: gifData.fileName,
    url: gifUrl,
    info: {
      h: gifData.height,
      w: gifData.width,
      mimetype: gifData.mimeType,
    },
  };

  // Try to upload the GIF bytes to the homeserver for an mxc:// URI.
  // This is the only way images render in E2EE rooms.
  const proxiedUrl = resolveGifUrl(gifUrl);
  let uploadedMxc: string | null = null;

  try {
    const response = await fetch(proxiedUrl);
    if (!response.ok) {
      throw new Error(`proxy fetch returned ${response.status}`);
    }
    const blob = await response.blob();
    const file = new File([blob], gifData.fileName, { type: gifData.mimeType });
    imageContent.info.size = blob.size;
    LOG("Fetched GIF, size=", blob.size, "attempting uploadFile");

    const uploadResponse = await api.uploadFile(file);
    uploadedMxc = uploadResponse?.content_uri ?? null;
    LOG("uploadFile response:", uploadResponse, "mxcUri=", uploadedMxc);
  } catch (uploadErr: unknown) {
    LOG("Upload path failed, will fall back to sending the HTTPS URL:", uploadErr);
  }

  if (uploadedMxc) {
    imageContent.url = uploadedMxc;
  }

  LOG("Sending m.room.message m.image with url=", imageContent.url);
  try {
    await Promise.race([
      api.sendRoomEvent("m.room.message", imageContent),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("send timeout")), SEND_TIMEOUT_MS)
      ),
    ]);
    LOG("sendRoomEvent succeeded");
  } catch (sendErr: unknown) {
    const reason = sendErr instanceof Error ? sendErr.message : String(sendErr);
    LOG("sendRoomEvent failed:", sendErr);
    throw new SendGifError(
      `Could not send GIF: ${reason}. Element may not have granted the m.send.event:m.image capability — re-add the widget and approve the prompt.`,
      sendErr
    );
  }
}