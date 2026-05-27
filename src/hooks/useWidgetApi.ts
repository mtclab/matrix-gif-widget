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

function getWidgetUrlParams(): { userId: string | null; roomId: string | null } {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    return {
      userId: urlParams.get("userId"),
      roomId: urlParams.get("roomId"),
    };
  } catch {
    return { userId: null, roomId: null };
  }
}

export function useWidgetApi(): WidgetApiState {
  const [state, dispatch] = useReducer(reducer, initState);
  const apiRef = useRef<WidgetApi | null>(null);
  const mountedRef = useRef(true);

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

  const LOG = (...args: unknown[]) => console.log("[GIF-Widget]", ...args);

  useEffect(() => {
    const urlParams = getWidgetUrlParams();
    LOG("Init — urlParams:", urlParams, "location:", window.location.href);

    try {
      const widget = new WidgetApi(undefined);
      apiRef.current = widget;
      LOG("WidgetApi created");

      widget.requestCapability(MatrixCapabilities.Screenshots);
      widget.requestCapabilities(StickerpickerCapabilities);
      widget.requestCapabilityToSendMessage("m.image");
      LOG("Capabilities requested");

      widget.on(`action:${WidgetApiToWidgetAction.UpdateVisibility}`, handleGenericAction);
      widget.on(`action:${WidgetApiToWidgetAction.ThemeChange}`, handleThemeChange);
      widget.on(`action:${WidgetApiToWidgetAction.TakeScreenshot}`, handleGenericAction);

      widget.on("ready", () => {
        LOG("WidgetApi ready event received");
        if (mountedRef.current) dispatch({ type: "READY" });
      });

      widget.start();
      LOG("WidgetApi started, waiting for ready event");

      dispatch({ type: "INIT", api: widget, userId: urlParams.userId, roomId: urlParams.roomId });

      requestAnimationFrame(() => {
        LOG("Sending contentLoaded + alwaysOnScreen");
        widget.sendContentLoaded().then(() => LOG("contentLoaded acked")).catch((e: unknown) => LOG("contentLoaded failed:", e));
        widget.setAlwaysOnScreen(true).then((v: boolean) => LOG("alwaysOnScreen result:", v)).catch((e: unknown) => LOG("alwaysOnScreen failed:", e));
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to initialize Widget API";
      LOG("Init error:", msg);
      if (mountedRef.current) dispatch({ type: "ERROR", error: msg });
    }

    const cleanupWidget = apiRef.current;
    return () => {
      mountedRef.current = false;
      apiRef.current = null;
      cleanupWidget?.off(`action:${WidgetApiToWidgetAction.UpdateVisibility}`, handleGenericAction);
      cleanupWidget?.off(`action:${WidgetApiToWidgetAction.ThemeChange}`, handleThemeChange);
      cleanupWidget?.off(`action:${WidgetApiToWidgetAction.TakeScreenshot}`, handleGenericAction);
    };
  }, [handleThemeChange, handleGenericAction]);

  return state;
}

const LOG = (...args: unknown[]) => console.log("[GIF-Widget]", ...args);

const STICKER_SEND_TIMEOUT = 15000;

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

  try {
    const response = await fetch(gifUrl);
    if (response.ok) {
      const blob = await response.blob();
      const file = new File([blob], gifData.fileName, { type: gifData.mimeType });
      stickerContent.info.size = blob.size;
      LOG("Fetched GIF, size=", blob.size, "attempting uploadFile");

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
    LOG("Could not fetch GIF for upload, sending HTTP URL:", fetchErr);
  }

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
    LOG("sendSticker failed, falling back to m.room.message:", stickerErr);
  }

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
    LOG("All send methods failed:", msgErr);
    return false;
  }
}