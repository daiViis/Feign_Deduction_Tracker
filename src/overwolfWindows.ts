import type { PanelWindowKey } from "./overlayStore";

export const CONTROLLER_WINDOW = "ControllerWindow";

export const PANEL_WINDOW_NAMES: Record<PanelWindowKey, string> = {
  left_panel: "LeftPanelWindow",
  right_panel: "RightPanelWindow",
  known_roles: "KnownRolesWindow",
  visit_map: "VisitMapWindow"
};

export type CurrentWindowInfo = {
  id: string;
  name: string;
  left: number;
  top: number;
  width: number;
  height: number;
};

export function isOverwolfAvailable() {
  return (
    typeof overwolf !== "undefined" &&
    typeof overwolf.windows !== "undefined"
  );
}

export async function getCurrentWindowInfo(): Promise<CurrentWindowInfo | null> {
  if (!isOverwolfAvailable()) {
    return null;
  }

  return new Promise((resolve) => {
    overwolf.windows.getCurrentWindow((result: any) => {
      if (!result || result.status !== "success") {
        resolve(null);
        return;
      }

      resolve({
        id: result.window.id,
        name: result.window.name,
        left: Number(result.window.left ?? 0),
        top: Number(result.window.top ?? 0),
        width: Number(result.window.width ?? window.innerWidth),
        height: Number(result.window.height ?? window.innerHeight)
      });
    });
  });
}

export async function restoreDeclaredWindow(windowName: string) {
  const info = await obtainDeclaredWindow(windowName);
  if (!info) {
    return false;
  }

  return new Promise<boolean>((resolve) => {
    overwolf.windows.restore(info.id, (result: any) => {
      resolve(Boolean(result && result.status === "success"));
    });
  });
}

export async function hideDeclaredWindow(windowName: string) {
  const info = await obtainDeclaredWindow(windowName);
  if (!info) {
    return false;
  }

  return new Promise<boolean>((resolve) => {
    overwolf.windows.hide(info.id, (result: any) => {
      resolve(Boolean(result && result.status === "success"));
    });
  });
}

export async function bringDeclaredWindowToFront(windowName: string) {
  const info = await obtainDeclaredWindow(windowName);
  if (!info) {
    return false;
  }

  return new Promise<boolean>((resolve) => {
    overwolf.windows.bringToFront(info.id, (result: any) => {
      resolve(Boolean(result && result.status === "success"));
    });
  });
}

export async function changeDeclaredWindowPosition(
  windowName: string,
  left: number,
  top: number
) {
  const info = await obtainDeclaredWindow(windowName);
  if (!info) {
    return false;
  }

  return new Promise<boolean>((resolve) => {
    overwolf.windows.changePosition(
      info.id,
      Math.round(left),
      Math.round(top),
      (result: any) => {
        resolve(Boolean(result && result.status === "success"));
      }
    );
  });
}

export async function changeDeclaredWindowSize(
  windowName: string,
  width: number,
  height: number
) {
  const info = await obtainDeclaredWindow(windowName);
  if (!info) {
    return false;
  }

  return new Promise<boolean>((resolve) => {
    overwolf.windows.changeSize(
      info.id,
      Math.round(width),
      Math.round(height),
      (result: any) => {
        resolve(Boolean(result && result.status === "success"));
      }
    );
  });
}

export async function dragCurrentWindow(onComplete?: () => void) {
  const currentWindow = await getCurrentWindowInfo();
  if (!currentWindow) {
    return;
  }

  overwolf.windows.dragMove(currentWindow.id, () => {
    onComplete?.();
  });
}

export async function dragResizeCurrentWindow(
  edge: string,
  onComplete?: () => void
) {
  const currentWindow = await getCurrentWindowInfo();
  if (!currentWindow) {
    return;
  }

  overwolf.windows.dragResize(currentWindow.id, edge, () => {
    onComplete?.();
  });
}

async function obtainDeclaredWindow(windowName: string) {
  if (!isOverwolfAvailable()) {
    return null;
  }

  return new Promise<{ id: string; name: string } | null>((resolve) => {
    overwolf.windows.obtainDeclaredWindow(windowName, (result: any) => {
      if (!result || result.status !== "success" || !result.window) {
        resolve(null);
        return;
      }

      resolve({
        id: result.window.id,
        name: result.window.name
      });
    });
  });
}
