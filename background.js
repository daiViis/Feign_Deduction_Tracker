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

  function toggleWindowVisibility(windowName) {
    if (typeof overwolf === "undefined" || !overwolf.windows) return;

    overwolf.windows.obtainDeclaredWindow(windowName, function (result) {
      if (!result || result.status !== "success" || !result.window) return;

      overwolf.windows.getWindowState(result.window.id, function(stateResult) {
        if (stateResult.status === "success" && (stateResult.window_state === "normal" || stateResult.window_state === "maximized")) {
          hideWindow(windowName);
        } else {
          restoreWindow(windowName);
        }
      });
    });
  }

  function registerHotkeys() {
    if (typeof overwolf === "undefined" || !overwolf.settings || !overwolf.settings.hotkeys) {
      return;
    }

    overwolf.settings.hotkeys.onPressed.addListener(function (result) {
      if (result.name === "feign_toggle_overlay") {
        toggleWindowVisibility(CONTROLLER_WINDOW);
        
        var state = readOverlayState();
        var panels = (state && state.panels) || {};
        Object.keys(PANEL_WINDOWS).forEach(function(panelKey) {
            var panelState = panels[panelKey];
            if (!panelState || panelState.visible !== false) {
                 toggleWindowVisibility(PANEL_WINDOWS[panelKey]);
            }
        });
      } else if (result.name === "feign_toggle_left_panel") {
        toggleWindowVisibility(PANEL_WINDOWS.left_panel);
      } else if (result.name === "feign_toggle_known_roles") {
        toggleWindowVisibility(PANEL_WINDOWS.known_roles);
      } else if (result.name === "feign_toggle_visit_map") {
        toggleWindowVisibility(PANEL_WINDOWS.visit_map);
      } else if (result.name === "feign_toggle_right_panel") {
        toggleWindowVisibility(PANEL_WINDOWS.right_panel);
      }
    });
  }

  function registerGameEvents() {
    if (typeof overwolf === "undefined" || !overwolf.games) {
      return;
    }

    overwolf.games.onGameInfoUpdated.addListener(function (res) {
      if (res && res.gameInfo) {
        if (!res.gameInfo.isRunning) {
          // Game closed, hide the overlay instead of closing the app
          // so it can wait for the game to relaunch.
          hideWindow(CONTROLLER_WINDOW);
          Object.keys(PANEL_WINDOWS).forEach(function (panelKey) {
            hideWindow(PANEL_WINDOWS[panelKey]);
          });
        } else if (res.focusChanged) {
          if (res.gameInfo.isInFocus) {
            syncDeclaredWindows();
          } else {
            hideWindow(CONTROLLER_WINDOW);
            Object.keys(PANEL_WINDOWS).forEach(function (panelKey) {
              hideWindow(PANEL_WINDOWS[panelKey]);
            });
          }
        }
      }
    });

    overwolf.games.getRunningGameInfo(function (res) {
      if (res && res.isRunning && res.isInFocus) {
        syncDeclaredWindows();
      }
    });
  }

  function init() {
    syncDeclaredWindows();
    registerHotkeys();
    registerGameEvents();

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
