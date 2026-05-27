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
      return { ...state, api: action.api, ready: true, userId: action.userId, roomId: action.roomId };
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

  useEffect(() => {
    const urlParams = getWidgetUrlParams();

    try {
      const widget = new WidgetApi(undefined);
      apiRef.current = widget;

      widget.requestCapability(MatrixCapabilities.Screenshots);
      widget.requestCapabilities(StickerpickerCapabilities);
      widget.requestCapabilityToSendMessage("m.image");

      widget.on(`action:${WidgetApiToWidgetAction.UpdateVisibility}`, handleGenericAction);
      widget.on(`action:${WidgetApiToWidgetAction.ThemeChange}`, handleThemeChange);
      widget.on(`action:${WidgetApiToWidgetAction.TakeScreenshot}`, handleGenericAction);

      widget.start();

      dispatch({ type: "INIT", api: widget, userId: urlParams.userId, roomId: urlParams.roomId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to initialize Widget API";
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
  if (!api) return false;

  try {
    const response = await fetch(gifUrl);
    if (!response.ok) throw new Error(`Failed to fetch GIF: ${response.status}`);

    const blob = await response.blob();
    const file = new File([blob], gifData.fileName, { type: gifData.mimeType });

    const uploadResponse = await api.uploadFile(file) as Record<string, unknown>;
    const mxcUri = (uploadResponse?.content_uri || uploadResponse?.mxc || uploadResponse?.url) as string | undefined;

    if (!mxcUri) throw new Error("No content URI returned from upload");

    await api.sendRoomEvent("m.room.message", {
      msgtype: "m.image",
      body: gifData.fileName,
      url: mxcUri,
      info: {
        mimetype: gifData.mimeType,
        w: gifData.width,
        h: gifData.height,
        size: blob.size,
      },
    });

    return true;
  } catch (err) {
    console.error("Failed to send GIF:", err);
    return false;
  }
}