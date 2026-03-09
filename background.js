(function () {
  "use strict";

  var CONTROLLER_WINDOW = "ControllerWindow";
  var PANEL_WINDOWS = {
    left_panel: "LeftPanelWindow",
    right_panel: "RightPanelWindow",
    known_roles: "KnownRolesWindow",
    visit_map: "VisitMapWindow"
  };
  var STORAGE_KEY = "feign.overlay.multi-window-state.v1";

  function log(message, details) {
    if (typeof console === "undefined") {
      return;
    }

    if (typeof details === "undefined") {
      console.log("[background]", message);
      return;
    }

    console.log("[background]", message, details);
  }

  function readOverlayState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      log("Failed to read overlay state.", error);
      return null;
    }
  }

  function restoreWindow(windowName) {
    if (
      typeof overwolf === "undefined" ||
      !overwolf.windows ||
      typeof overwolf.windows.obtainDeclaredWindow !== "function"
    ) {
      log("Overwolf window APIs are unavailable.");
      return;
    }

    overwolf.windows.obtainDeclaredWindow(windowName, function (result) {
      if (!result || result.status !== "success" || !result.window) {
        log("Failed to obtain window.", { windowName: windowName, result: result });
        return;
      }

      overwolf.windows.restore(result.window.id, function (restoreResult) {
        if (!restoreResult || restoreResult.status !== "success") {
          log("Failed to restore window.", {
            windowName: windowName,
            restoreResult: restoreResult
          });
        }
      });
    });
  }

  function hideWindow(windowName) {
    if (
      typeof overwolf === "undefined" ||
      !overwolf.windows ||
      typeof overwolf.windows.obtainDeclaredWindow !== "function"
    ) {
      return;
    }

    overwolf.windows.obtainDeclaredWindow(windowName, function (result) {
      if (!result || result.status !== "success" || !result.window) {
        return;
      }

      overwolf.windows.hide(result.window.id, function () {});
    });
  }

  function syncDeclaredWindows() {
    var state = readOverlayState();
    var panels = (state && state.panels) || {};

    restoreWindow(CONTROLLER_WINDOW);

    Object.keys(PANEL_WINDOWS).forEach(function (panelKey) {
      var panelState = panels[panelKey];
      if (!panelState || panelState.visible !== false) {
        restoreWindow(PANEL_WINDOWS[panelKey]);
        return;
      }

      hideWindow(PANEL_WINDOWS[panelKey]);
    });
  }

  function init() {
    syncDeclaredWindows();

    if (
      overwolf &&
      overwolf.extensions &&
      overwolf.extensions.onAppLaunchTriggered &&
      typeof overwolf.extensions.onAppLaunchTriggered.addListener === "function"
    ) {
      overwolf.extensions.onAppLaunchTriggered.addListener(function () {
        syncDeclaredWindows();
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
