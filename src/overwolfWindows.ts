import type { PanelWindowKey } from "./overlayStore";

export const CONTROLLER_WINDOW = "ControllerWindow";
export const ROLE_PICKER_WINDOW = "RolePickerWindow";

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

export async function startManualResizeCurrentWindow(
  startClientX: number,
  startClientY: number,
  onComplete?: () => void,
  minWidth = 280,
  minHeight = 220
) {
  const currentWindow = await getCurrentWindowInfo();
  if (!currentWindow || !isOverwolfAvailable()) {
    return;
  }

  const startWidth = currentWindow.width;
  const startHeight = currentWindow.height;
  let frameHandle = 0;
  let pendingWidth = startWidth;
  let pendingHeight = startHeight;

  const flushResize = () => {
    frameHandle = 0;
    overwolf.windows.changeSize(
      currentWindow.id,
      Math.max(minWidth, Math.round(pendingWidth)),
      Math.max(minHeight, Math.round(pendingHeight)),
      () => {}
    );
  };

  const handleMouseMove = (event: MouseEvent) => {
    pendingWidth = startWidth + (event.clientX - startClientX);
    pendingHeight = startHeight + (event.clientY - startClientY);
    if (!frameHandle) {
      frameHandle = window.requestAnimationFrame(flushResize);
    }
  };

  const handleMouseUp = () => {
    if (frameHandle) {
      window.cancelAnimationFrame(frameHandle);
      frameHandle = 0;
    }

    window.removeEventListener("mousemove", handleMouseMove);
    window.removeEventListener("mouseup", handleMouseUp);

    overwolf.windows.changeSize(
      currentWindow.id,
      Math.max(minWidth, Math.round(pendingWidth)),
      Math.max(minHeight, Math.round(pendingHeight)),
      () => {
        onComplete?.();
      }
    );
  };

  window.addEventListener("mousemove", handleMouseMove);
  window.addEventListener("mouseup", handleMouseUp);
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

export async function getMonitorsList(): Promise<any[]> {
  if (!isOverwolfAvailable() || !overwolf.utils || !overwolf.utils.getMonitorsList) {
    return [];
  }

  return new Promise((resolve) => {
    overwolf.utils.getMonitorsList((result: any) => {
      if (result && result.status === "success" && result.displays) {
        resolve(result.displays);
      } else {
        resolve([]);
      }
    });
  });
}
