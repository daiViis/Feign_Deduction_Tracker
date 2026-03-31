import { type RoleOption } from "./types";
import {
  ROLE_PICKER_WINDOW,
  bringDeclaredWindowToFront,
  changeDeclaredWindowPosition,
  changeDeclaredWindowSize,
  hideDeclaredWindow,
  isOverwolfAvailable,
  restoreDeclaredWindow
} from "./overwolfWindows";

const ROLE_PICKER_REQUEST_STORAGE_KEY = "feign.overlay.role-picker-request.v1";
const ROLE_PICKER_CHANNEL_NAME = "feign.overlay.role-picker";
const ROLE_PICKER_WIDTH = 720;
const ROLE_PICKER_HEIGHT = 560;

export type RolePickerRequest = {
  requestId: string;
  title: string;
  roles: RoleOption[];
  value?: string;
  allowClear: boolean;
  clearLabel: string;
};

export type RolePickerResponse = {
  requestId: string;
  status: "picked" | "cancelled";
  roleId?: string;
};

type RolePickerBridgeMessage =
  | { type: "request"; request: RolePickerRequest }
  | { type: "response"; response: RolePickerResponse };

const syncChannel =
  typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel(ROLE_PICKER_CHANNEL_NAME)
    : null;

export async function requestRoleSelection(
  options: Omit<RolePickerRequest, "requestId">
) {
  const request: RolePickerRequest = {
    ...options,
    requestId: crypto.randomUUID()
  };

  persistCurrentRolePickerRequest(request);
  syncChannel?.postMessage({ type: "request", request } satisfies RolePickerBridgeMessage);

  if (!isOverwolfAvailable()) {
    persistCurrentRolePickerRequest(undefined);
    return {
      requestId: request.requestId,
      status: "cancelled" as const
    };
  }

  const opened = await openRolePickerWindow();
  if (!opened) {
    persistCurrentRolePickerRequest(undefined);
    if (typeof window !== "undefined" && typeof window.alert === "function") {
      window.alert(
        "The Role Picker window is not available in the current Overwolf session. Reload or restart the overlay so the updated manifest is loaded."
      );
    }
    return {
      requestId: request.requestId,
      status: "cancelled" as const
    };
  }

  return new Promise<RolePickerResponse>((resolve) => {
    const cleanup = subscribeToRolePickerResponses((response) => {
      if (response.requestId !== request.requestId) {
        return;
      }

      cleanup();
      resolve(response);
    });
  });
}

export function readCurrentRolePickerRequest() {
  const raw = window.localStorage.getItem(ROLE_PICKER_REQUEST_STORAGE_KEY);
  if (!raw) {
    return undefined;
  }

  try {
    return JSON.parse(raw) as RolePickerRequest;
  } catch {
    return undefined;
  }
}

export function persistCurrentRolePickerRequest(request?: RolePickerRequest) {
  if (!request) {
    window.localStorage.removeItem(ROLE_PICKER_REQUEST_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(
    ROLE_PICKER_REQUEST_STORAGE_KEY,
    JSON.stringify(request)
  );
}

export function subscribeToRolePickerRequests(
  listener: (request?: RolePickerRequest) => void
) {
  const handleStorage = (event: StorageEvent) => {
    if (event.key !== ROLE_PICKER_REQUEST_STORAGE_KEY) {
      return;
    }

    listener(readCurrentRolePickerRequest());
  };

  const handleMessage = (event: MessageEvent<RolePickerBridgeMessage>) => {
    if (event.data?.type !== "request") {
      return;
    }

    listener(event.data.request);
  };

  window.addEventListener("storage", handleStorage);
  syncChannel?.addEventListener("message", handleMessage);

  return () => {
    window.removeEventListener("storage", handleStorage);
    syncChannel?.removeEventListener("message", handleMessage);
  };
}

export async function respondToRolePicker(response: RolePickerResponse) {
  persistCurrentRolePickerRequest(undefined);
  syncChannel?.postMessage({ type: "response", response } satisfies RolePickerBridgeMessage);

  if (isOverwolfAvailable()) {
    await hideDeclaredWindow(ROLE_PICKER_WINDOW);
  }
}

function subscribeToRolePickerResponses(
  listener: (response: RolePickerResponse) => void
) {
  const handleMessage = (event: MessageEvent<RolePickerBridgeMessage>) => {
    if (event.data?.type !== "response") {
      return;
    }

    listener(event.data.response);
  };

  syncChannel?.addEventListener("message", handleMessage);

  return () => {
    syncChannel?.removeEventListener("message", handleMessage);
  };
}

async function openRolePickerWindow() {
  const screenWidth = Math.max(window.screen.availWidth || 0, window.screen.width || 0);
  const screenHeight = Math.max(window.screen.availHeight || 0, window.screen.height || 0);
  const left = Math.max(8, Math.round((screenWidth - ROLE_PICKER_WIDTH) / 2));
  const top = Math.max(8, Math.round((screenHeight - ROLE_PICKER_HEIGHT) / 2));

  const restored = await restoreDeclaredWindow(ROLE_PICKER_WINDOW);
  if (!restored) {
    return false;
  }

  const resized = await changeDeclaredWindowSize(
    ROLE_PICKER_WINDOW,
    ROLE_PICKER_WIDTH,
    ROLE_PICKER_HEIGHT
  );
  const moved = await changeDeclaredWindowPosition(ROLE_PICKER_WINDOW, left, top);
  const focused = await bringDeclaredWindowToFront(ROLE_PICKER_WINDOW);

  return restored && resized && moved && focused;
}
