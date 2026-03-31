import {
  type MouseEvent as ReactMouseEvent,
  type RefObject,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  dispatchOverlayAction,
  getOverlayState,
  getSelectedActions,
  getSelectedPlayer,
  getSelectedUsedAbilities,
  type OverlayAction,
  type OverlayState,
  type PanelWindowKey,
  useOverlayState
} from "./overlayStore";
import {
  PLAYER_CLASS_OPTIONS,
  formatPlayerClassLabel,
  getClassCounts,
  getAllowedClassesForRole,
  getClassRoleId,
  getEffectivePlayerClass,
  getForcedClassForRole,
  isClassLockedByRole
} from "./playerClass";
import { deriveKnownRoles } from "./knownRoles";
import { MAD_ROLE_ID, getRoleById } from "./roles";
import { TimelineNavigator } from "./TimelineNavigator";
import { TimelineGroup } from "./TimelineSection";
import {
  getLabelForTimelineStep,
  getTimelineStepFromAction,
  getTimelineStepFromEvidenceSource,
  getTimelineStepFromUsedAbility,
  getTimelineStepKey,
  getVisitEdgesForTimelineStep,
  groupItemsByTimelineStep,
  isSameTimelineStep
} from "./timeline";
import {
  ABILITY_UNKNOWN_VALUE,
  DOCTOR_REVIVE_RESULTS,
  OBSERVED_CLASS_OPTIONS,
  POLICE_MOVEMENT_RESULTS,
  createUsedAbilityDraft,
  formatAbilityPlayerReference,
  formatAbilityRoleReference,
  formatObservedClass,
  getDoctorReviveLabel,
  getPoliceMovementLabel,
  getUsedAbilityRoleOptions,
  getUsedAbilityRoundLabel,
  getUsedAbilitySummary,
  isUsedAbilityDraftValid,
  toUsedAbilityDraft
} from "./usedAbilities";
import {
  UNKNOWN_PARTICIPANT_ID,
  deriveVisitMapEntries,
  deriveVisitEvidence,
  getRoleIdFromVisitReference,
  isPlayerBasedVisitEvidence,
  isRoleBasedVisitEvidence,
  toRoleReference,
  type VisitMapEntry
} from "./visitEvidence";
import {
  CONTROLLER_WINDOW,
  PANEL_WINDOW_NAMES,
  bringDeclaredWindowToFront,
  changeDeclaredWindowPosition,
  changeDeclaredWindowSize,
  dragCurrentWindow,
  getCurrentWindowInfo,
  hideDeclaredWindow,
  isOverwolfAvailable,
  restoreDeclaredWindow,
  startManualResizeCurrentWindow
} from "./overwolfWindows";
import {
  readCurrentRolePickerRequest,
  requestRoleSelection,
  respondToRolePicker,
  subscribeToRolePickerRequests
} from "./rolePickerBridge";
import {
  type AbilityPlayerReference,
  type AbilityRoleReference,
  type DoctorReviveResult,
  type KnownRoleEntry,
  type NightAction,
  type ObservedPlayerClass,
  type PoliceMovementResult,
  type Player,
  type PlayerClass,
  type RoleInPlay,
  type RoleInstance,
  type RoleAssignmentSlot,
  type RoleOption,
  type TimelineStep,
  type VisitEvidence,
  type UsedAbilityDraft,
  type UsedAbilityLog,
  type UsedAbilityRoleType
} from "./types";
import { useTimelineSelection } from "./useTimelineSelection";

const DEFAULT_LEFT_X = 8;
const DEFAULT_Y = 44;
const WINDOW_EDGE_GAP = 8;
const CONTROLLER_EXPANDED_WIDTH = 680;
const CONTROLLER_EXPANDED_HEIGHT = 30;
const CONTROLLER_COLLAPSED_WIDTH = 26;
const CONTROLLER_COLLAPSED_HEIGHT = 22;
const CONTROLLER_STATE_STORAGE_KEY = "feign.overlay.controller-state.v1";
const KNOWN_ROLES_COLLAPSED_WIDTH = 116;
const KNOWN_ROLES_COLLAPSED_HEIGHT = 24;
type ActionMode = "visited_player" | "visited_by_player";

export function ControllerWindowApp() {
  const state = useOverlayState();
  const [collapsed, setCollapsed] = useState(() => readControllerCollapsed());
  usePanelHotkeys();
  useOverlayGlassEffect();

  useEffect(() => {
    if (state.compactMode) {
      dispatchOverlayAction({ type: "toggleCompactMode" });
    }

    if (state.panels.left_panel.collapsed) {
      dispatchOverlayAction({
        type: "setPanelCollapsed",
        panel: "left_panel",
        collapsed: false
      });
    }

    if (state.panels.right_panel.collapsed) {
      dispatchOverlayAction({
        type: "setPanelCollapsed",
        panel: "right_panel",
        collapsed: false
      });
    }
  }, [
    state.compactMode,
    state.panels.left_panel.collapsed,
    state.panels.right_panel.collapsed
  ]);

  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!isOverwolfAvailable()) {
      return;
    }

    const timer = window.setTimeout(async () => {
      const width = headerRef.current
        ? Math.ceil(headerRef.current.getBoundingClientRect().width)
        : undefined;
      await syncControllerWindow(collapsed, width);
    }, 120);

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        const width = Math.ceil(entry.target.getBoundingClientRect().width);
        void syncControllerWindow(collapsed, width);
      }
    });

    if (headerRef.current) {
      observer.observe(headerRef.current);
    }

    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [collapsed]);

  const handleTogglePanelVisibility = async (panel: PanelWindowKey) => {
    const nextVisible = !state.panels[panel].visible;

    dispatchOverlayAction({
      type: "setPanelVisibility",
      panel,
      visible: nextVisible
    });

    if (!isOverwolfAvailable()) {
      return;
    }

    if (nextVisible) {
      await restoreDeclaredWindow(PANEL_WINDOW_NAMES[panel]);
      await bringDeclaredWindowToFront(PANEL_WINDOW_NAMES[panel]);
      return;
    }

    await hideDeclaredWindow(PANEL_WINDOW_NAMES[panel]);
  };

  const handleResetMatch = () => {
    const confirmed = window.confirm(
      "Reset current match?\n\nThis keeps the current player list, clears roles, notes, actions and claims, marks everyone alive and not suspicious, and sets the phase to Night 1."
    );

    if (!confirmed) {
      return;
    }

    dispatchOverlayAction({ type: "resetMatch" });
  };

  return (
    <div className={`controller-shell${collapsed ? " is-collapsed" : ""}`}>
      <header
        ref={headerRef}
        className={`controller-bar${collapsed ? " is-collapsed" : ""}`}
        onMouseDown={(event) => {
          if (event.button !== 0 || isInteractiveTarget(event.target)) {
            return;
          }

          void dragCurrentWindow();
        }}
      >
        {collapsed ? (
          <button
            type="button"
            className="toolbar-button toolbar-button--icon"
            aria-label="Expand upper panel"
            title="Expand upper panel"
            onMouseDown={stopHeaderDrag}
            onClick={() => setCollapsed(false)}
          >
            ≡
          </button>
        ) : (
          <>
            <div className="controller-bar__controls" style={{ justifyContent: 'center' }}>
              <TimelineNavigator onMouseDown={stopHeaderDrag} />

              <button
                type="button"
                className={`toolbar-button toolbar-button--icon ${
                  state.panels.left_panel.visible ? " is-active" : ""
                }`}
                aria-label="Players"
                title="Players"
                onMouseDown={stopHeaderDrag}
                onClick={() => void handleTogglePanelVisibility("left_panel")}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              </button>

              <button
                type="button"
                className={`toolbar-button toolbar-button--icon ${
                  state.panels.right_panel.visible ? " is-active" : ""
                }`}
                aria-label="Detail"
                title="Detail"
                onMouseDown={stopHeaderDrag}
                onClick={() => void handleTogglePanelVisibility("right_panel")}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>
              </button>

              <button
                type="button"
                className={`toolbar-button toolbar-button--icon ${
                  state.panels.known_roles.visible ? " is-active" : ""
                }`}
                aria-label="Roles"
                title="Roles"
                onMouseDown={stopHeaderDrag}
                onClick={() => void handleTogglePanelVisibility("known_roles")}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2-1 4-2 7-2 2.5 0 4.5 1 7 2a1 1 0 0 1 1 1z"/></svg>
              </button>

              <button
                type="button"
                className={`toolbar-button toolbar-button--icon ${
                  state.panels.visit_map.visible ? " is-active" : ""
                }`}
                aria-label="Visit Map"
                title="Visit Map"
                onMouseDown={stopHeaderDrag}
                onClick={() => void handleTogglePanelVisibility("visit_map")}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"/><path d="M15 5.764v15"/><path d="M9 3.236v15"/></svg>
              </button>

              <button
                type="button"
                className="toolbar-button"
                onMouseDown={stopHeaderDrag}
                onClick={handleResetMatch}
              >
                Reset Match
              </button>

              <div className="glass-control" onMouseDown={stopHeaderDrag} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px', borderLeft: '1px solid var(--border)', marginLeft: 8 }}>
                <span title="Glass Opacity" style={{ fontSize: '10px', opacity: 0.6, cursor: 'default' }}>O</span>
                <input
                  type="range"
                  min="0.1"
                  max="0.9"
                  step="0.05"
                  value={state.glassOpacity}
                  onChange={(e) => dispatchOverlayAction({ type: "setGlassSettings", opacity: parseFloat(e.target.value), blur: state.glassBlur })}
                  style={{ width: 44, height: 4, cursor: 'pointer' }}
                />
                <span title="Glass Blur" style={{ fontSize: '10px', opacity: 0.6, cursor: 'default', marginLeft: 4 }}>B</span>
                <input
                  type="range"
                  min="0"
                  max="40"
                  step="2"
                  value={state.glassBlur}
                  onChange={(e) => dispatchOverlayAction({ type: "setGlassSettings", opacity: state.glassOpacity, blur: parseInt(e.target.value, 10) })}
                  style={{ width: 44, height: 4, cursor: 'pointer' }}
                />
              </div>

              <button
                type="button"
                className="toolbar-button toolbar-button--icon"
                aria-label="Collapse upper panel"
                title="Collapse upper panel"
                onMouseDown={stopHeaderDrag}
                onClick={() => setCollapsed(true)}
              >
                ×
              </button>
            </div>
          </>
        )}
      </header>
    </div>
  );
}

export function LeftPanelWindowApp() {
  const state = useOverlayState();
  const players = useMemo(
    () => [...state.match.players].sort((left, right) => left.seat - right.seat),
    [state.match.players]
  );
  const selectedPlayer = getSelectedPlayer(state);

  usePanelWindow("left_panel");
  usePanelHotkeys();
  useOverlayGlassEffect();

  return (
    <PanelWindowLayout
      panel="left_panel"
      title="Player List"
    >
      <PlayerTable
        players={players}
        roles={state.match.roles}
        ignoreActionsByPlayerId={state.match.ignoreActionsByPlayerId}
        selectedPlayerId={selectedPlayer?.id}
        compactMode={state.compactMode}
        onAddPlayer={() => dispatchOverlayAction({ type: "addPlayer" })}
        onSetPlayerName={(playerId, name) =>
          dispatchOverlayAction({ type: "setPlayerName", playerId, name })
        }
        onRemovePlayer={(playerId) =>
          dispatchOverlayAction({ type: "removePlayer", playerId })
        }
        onSelectPlayer={(playerId) =>
          dispatchOverlayAction({ type: "selectPlayer", playerId })
        }
        onReorderPlayers={(playerId, targetPlayerId, position) =>
          dispatchOverlayAction({
            type: "reorderPlayers",
            playerId,
            targetPlayerId,
            position
          })
        }
        onAssignRole={(playerId, slot, roleId) =>
          dispatchOverlayAction({ type: "assignRole", playerId, slot, roleId })
        }
        onAssignClass={(playerId, assignedClass) =>
          dispatchOverlayAction({ type: "assignClass", playerId, assignedClass })
        }
        onToggleSuspicious={(playerId) =>
          dispatchOverlayAction({ type: "toggleSuspicious", playerId })
        }
        onToggleAlive={(playerId) =>
          dispatchOverlayAction({ type: "toggleAlive", playerId })
        }
        onSaveQuickNote={(playerId, content) =>
          dispatchOverlayAction({ type: "saveQuickNote", playerId, content })
        }
      />
    </PanelWindowLayout>
  );
}

export function RightPanelWindowApp() {
  const state = useOverlayState();
  const { currentStep, currentStepLabel, timelineViewMode, steps, setTimelineViewMode } =
    useTimelineSelection();
  const players = useMemo(
    () => [...state.match.players].sort((left, right) => left.seat - right.seat),
    [state.match.players]
  );
  const selectedPlayerId = state.selectedPlayerId;
  const selectedPlayer = getSelectedPlayer(state);

  usePanelWindow("right_panel");
  usePanelHotkeys();
  useOverlayGlassEffect();

  return (
    <PanelWindowLayout
      panel="right_panel"
      title={
        selectedPlayer
          ? `${selectedPlayer.name || "Player Detail"}`
          : "Detail Panel"
      }
    >
      <PlayerDetailPanel
        key={selectedPlayerId ?? "empty"}
        selectedPlayerId={selectedPlayerId}
        players={players}
        roles={state.match.roles}
        actions={getSelectedActions(state)}
        usedAbilities={getSelectedUsedAbilities(state)}
        currentRound={state.match.round}
        selectedTimelineStep={currentStep}
        selectedTimelineStepLabel={currentStepLabel}
        timelineViewMode={timelineViewMode}
        timelineSteps={steps}
        onSetTimelineViewMode={setTimelineViewMode}
        ignoreActionsEnabled={
          selectedPlayerId
            ? Boolean(state.match.ignoreActionsByPlayerId[selectedPlayerId])
            : false
        }
        onSetPlayerName={(playerId, name) =>
          dispatchOverlayAction({ type: "setPlayerName", playerId, name })
        }
        onAssignRole={(playerId, slot, roleId) =>
          dispatchOverlayAction({ type: "assignRole", playerId, slot, roleId })
        }
        onAssignClass={(playerId, assignedClass) =>
          dispatchOverlayAction({ type: "assignClass", playerId, assignedClass })
        }
        onToggleSuspicious={(playerId) =>
          dispatchOverlayAction({ type: "toggleSuspicious", playerId })
        }
        onToggleAlive={(playerId) =>
          dispatchOverlayAction({ type: "toggleAlive", playerId })
        }
        onAddAction={(actorId, actionType, targetId) =>
          dispatchOverlayAction({
            type: "addAction",
            actorId,
            actionType,
            targetId,
            round: state.match.round
          })
        }
        onUpdateAction={(actionId, actorId, actionType, targetId) =>
          dispatchOverlayAction({
            type: "updateAction",
            actionId,
            actorId,
            actionType,
            targetId
          })
        }
        onRemoveAction={(actionId) =>
          dispatchOverlayAction({ type: "removeAction", actionId })
        }
        onAddUsedAbility={(entry) =>
          dispatchOverlayAction({ type: "addUsedAbility", entry })
        }
        onUpdateUsedAbility={(abilityId, entry) =>
          dispatchOverlayAction({ type: "updateUsedAbility", abilityId, entry })
        }
        onRemoveUsedAbility={(abilityId) =>
          dispatchOverlayAction({ type: "removeUsedAbility", abilityId })
        }
        onSetPlayerIgnoreActions={(playerId, ignored) =>
          dispatchOverlayAction({ type: "setPlayerIgnoreActions", playerId, ignored })
        }
      />
    </PanelWindowLayout>
  );
}

export function KnownRolesWindowApp() {
  const state = useOverlayState();
  const { currentStep, currentStepLabel } = useTimelineSelection();
  const players = useMemo(
    () => [...state.match.players].sort((left, right) => left.seat - right.seat),
    [state.match.players]
  );
  const visitEvidence = useMemo(
    () =>
      deriveVisitEvidence({
        players: state.match.players,
        actions: state.match.actions,
        usedAbilityLogs: state.match.usedAbilities
      }),
    [state.match.actions, state.match.players, state.match.usedAbilities]
  );
  const knownRoles = useMemo(
    () =>
      deriveKnownRoles({
        players: state.match.players,
        claims: state.match.claims,
        visitEvidence,
        usedAbilityLogs: state.match.usedAbilities,
        roleEvidenceOverrides: state.match.roleEvidenceOverrides
      }),
    [
      state.match.claims,
      state.match.players,
      state.match.roleEvidenceOverrides,
      state.match.usedAbilities,
      visitEvidence
    ]
  );

  usePanelWindow("known_roles");
  usePanelHotkeys();
  useOverlayGlassEffect();

  return (
    <PanelWindowLayout
      panel="known_roles"
      title="Roles in Play"
    >
      <KnownRolesPanel
        entries={knownRoles}
        players={players}
        roles={state.match.roles}
        selectedTimelineStep={currentStep}
        selectedTimelineStepLabel={currentStepLabel}
        onConfirmRole={(roleId, playerId, evidenceSourceKeys) =>
          dispatchOverlayAction({
            type: "confirmRoleInPlay",
            roleId,
            playerId,
            evidenceSourceKeys
          })
        }
      />
    </PanelWindowLayout>
  );
}

export function VisitMapWindowApp() {
  const state = useOverlayState();
  const { currentStep, currentStepLabel, timelineViewMode, steps, setTimelineViewMode } =
    useTimelineSelection();
  const players = useMemo(
    () => [...state.match.players].sort((left, right) => left.seat - right.seat),
    [state.match.players]
  );
  const visitEvidence = useMemo(
    () =>
      deriveVisitEvidence({
        players: state.match.players,
        actions: state.match.actions,
        usedAbilityLogs: state.match.usedAbilities
      }),
    [state.match.actions, state.match.players, state.match.usedAbilities]
  );

  usePanelWindow("visit_map");
  usePanelHotkeys();
  useOverlayGlassEffect();

  return (
    <PanelWindowLayout
      panel="visit_map"
      title={`Visit Map - ${
        timelineViewMode === "full" ? "All Nights" : currentStepLabel
      }`}
    >
      <VisitMap
        visitEvidence={visitEvidence}
        players={players}
        roles={state.match.roles}
        selectedTimelineStep={currentStep}
        selectedTimelineStepLabel={currentStepLabel}
        timelineViewMode={timelineViewMode}
        timelineSteps={steps}
        onSetTimelineViewMode={setTimelineViewMode}
      />
    </PanelWindowLayout>
  );
}

export function RolePickerWindowApp() {
  const [request, setRequest] = useState(() => readCurrentRolePickerRequest());

  useEffect(() => subscribeToRolePickerRequests(setRequest), []);

  return (
    <div className="window-shell role-picker-window-shell">
      <section className="panel-window role-picker-window">
        <PanelHeader
          title={request?.title ?? "Role Picker"}
          onDragStart={() => void dragCurrentWindow()}
          onHide={() =>
            void respondToRolePicker({
              requestId: request?.requestId ?? "unknown",
              status: "cancelled"
            })
          }
        />

        <div className="panel-window__body role-picker-window__body">
          {request ? (
            <RoleSelectionSection
              title="Role"
              roles={request.roles}
              value={request.value}
              allowClear={request.allowClear}
              clearLabel={request.clearLabel}
              onPick={(roleId) =>
                void respondToRolePicker({
                  requestId: request.requestId,
                  status: "picked",
                  roleId
                })
              }
            />
          ) : (
            <div className="detail-empty">Open a role selector from any overlay window.</div>
          )}
        </div>
        <button
          type="button"
          className="panel-resizer"
          aria-label="Resize panel"
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void startManualResizeCurrentWindow(event.clientX, event.clientY);
          }}
        />
      </section>
    </div>
  );
}

function PanelWindowLayout(props: {
  panel: PanelWindowKey;
  title: string;
  children: ReactNode;
  allowCollapse?: boolean;
}) {
  const { panel, title, children, allowCollapse = false } = props;
  const state = useOverlayState();
  const panelState = state.panels[panel];
  const collapsed = allowCollapse && panelState.collapsed;

  const handleHide = async () => {
    dispatchOverlayAction({
      type: "setPanelVisibility",
      panel,
      visible: false
    });
    await hideDeclaredWindow(PANEL_WINDOW_NAMES[panel]);
  };

  const handleToggleCollapse = async () => {
    const nextCollapsed = !panelState.collapsed;

    dispatchOverlayAction({
      type: "setPanelCollapsed",
      panel,
      collapsed: nextCollapsed
    });

    if (!isOverwolfAvailable()) {
      return;
    }

    await syncPanelWindowState(panel, nextCollapsed);
  };

  return (
    <div className="window-shell">
      <section className={`panel-window${collapsed ? " is-collapsed" : ""}`}>
        <PanelHeader
          title={title}
          onDragStart={() => void dragCurrentWindow(() => void syncPanelBounds(panel))}
          onHide={() => void handleHide()}
          collapsed={collapsed}
          onToggleCollapse={allowCollapse ? () => void handleToggleCollapse() : undefined}
        />

        {!collapsed ? <div className="panel-window__body">{children}</div> : null}

        {!collapsed ? (
          <button
            type="button"
            className="panel-resizer"
            aria-label="Resize panel"
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void startManualResizeCurrentWindow(event.clientX, event.clientY, () =>
                void syncPanelBounds(panel)
              );
            }}
          />
        ) : null}
      </section>
    </div>
  );
}

function PanelHeader(props: {
  title: string;
  onDragStart: () => void;
  onHide: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const { title, onDragStart, onHide, collapsed = false, onToggleCollapse } = props;

  return (
    <div
      className={`panel-header${collapsed ? " is-collapsed" : ""}`}
      onMouseDown={(event) => {
        if (event.button !== 0) {
          return;
        }

        onDragStart();
      }}
    >
      <div className="panel-header__title">{title}</div>

      <div className="panel-header__actions">
        {onToggleCollapse ? (
          <button
            type="button"
            className="panel-header__button panel-header__button--icon"
            aria-label={collapsed ? "Expand panel" : "Collapse panel"}
            title={collapsed ? "Expand panel" : "Collapse panel"}
            onMouseDown={stopHeaderDrag}
            onClick={onToggleCollapse}
          >
            {collapsed ? "+" : "-"}
          </button>
        ) : null}

        {!collapsed ? (
        <button
          type="button"
          className="panel-header__button panel-header__button--icon"
          aria-label="Hide panel"
          title="Hide panel"
          onMouseDown={stopHeaderDrag}
          onClick={onHide}
        >
          x
        </button>
        ) : null}
      </div>
    </div>
  );
}

function PlayerTable(props: {
  players: Player[];
  roles: RoleOption[];
  ignoreActionsByPlayerId: Record<string, boolean>;
  selectedPlayerId?: string;
  compactMode: boolean;
  onAddPlayer: () => void;
  onSetPlayerName: (playerId: string, name: string) => void;
  onRemovePlayer: (playerId: string) => void;
  onSelectPlayer: (playerId: string) => void;
  onReorderPlayers: (
    playerId: string,
    targetPlayerId: string,
    position: "before" | "after"
  ) => void;
  onAssignRole: (
    playerId: string,
    slot: RoleAssignmentSlot,
    roleId?: string
  ) => void;
  onAssignClass: (playerId: string, assignedClass: PlayerClass | null) => void;
  onToggleSuspicious: (playerId: string) => void;
  onToggleAlive: (playerId: string) => void;
  onSaveQuickNote: (playerId: string, content: string) => void;
}) {
  const {
    players,
    roles,
    ignoreActionsByPlayerId,
    selectedPlayerId,
    compactMode,
    onAddPlayer,
    onSetPlayerName,
    onRemovePlayer,
    onSelectPlayer,
    onReorderPlayers,
    onAssignRole,
    onAssignClass,
    onToggleSuspicious,
    onToggleAlive,
    onSaveQuickNote
  } = props;
  const [draggedPlayerId, setDraggedPlayerId] = useState<string>();
  const [dropTarget, setDropTarget] = useState<{
    playerId: string;
    position: "before" | "after";
  }>();
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [lifeFilter, setLifeFilter] = useState<
    "all" | "alive" | "dead" | "suspicious"
  >("all");
  const filteredPlayers = useMemo(() => {
    if (lifeFilter === "alive") {
      return players.filter((player) => player.isAlive);
    }

    if (lifeFilter === "dead") {
      return players.filter((player) => !player.isAlive);
    }

    if (lifeFilter === "suspicious") {
      return players.filter((player) => player.suspicious);
    }

    return players;
  }, [lifeFilter, players]);
  const classCounts = useMemo(() => getClassCounts(players), [players]);
  const handleDragEnd = () => {
    setDraggedPlayerId(undefined);
    setDropTarget(undefined);
  };

  useEffect(() => {
    if (!draggedPlayerId) {
      return;
    }

    const updateDropTarget = (clientY: number) => {
      const candidates = filteredPlayers.filter((player) => player.id !== draggedPlayerId);
      let nextTarget: { playerId: string; position: "before" | "after" } | undefined;

      for (const player of candidates) {
        const node = rowRefs.current[player.id];
        if (!node) {
          continue;
        }

        const bounds = node.getBoundingClientRect();
        if (clientY < bounds.top || clientY > bounds.bottom) {
          continue;
        }

        nextTarget = {
          playerId: player.id,
          position: clientY < bounds.top + bounds.height / 2 ? "before" : "after"
        };
        break;
      }

      setDropTarget(nextTarget);
    };

    const handleMouseMove = (event: MouseEvent) => {
      updateDropTarget(event.clientY);
    };

    const handleMouseUp = () => {
      if (dropTarget) {
        onReorderPlayers(draggedPlayerId, dropTarget.playerId, dropTarget.position);
      }

      handleDragEnd();
    };

    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [draggedPlayerId, dropTarget, filteredPlayers, onReorderPlayers]);

  return (
    <section className="table-panel">
      <div className="table-toolbar table-toolbar--minimal">
        <div className="list-filter" role="group" aria-label="Filter players by life state">
          <button
            type="button"
            className={`toolbar-button${lifeFilter === "all" ? " is-active" : ""}`}
            onClick={() => setLifeFilter("all")}
          >
            All
          </button>
          <button
            type="button"
            className={`toolbar-button${lifeFilter === "alive" ? " is-active" : ""}`}
            onClick={() => setLifeFilter("alive")}
          >
            Alive
          </button>
          <button
            type="button"
            className={`toolbar-button${lifeFilter === "dead" ? " is-active" : ""}`}
            onClick={() => setLifeFilter("dead")}
          >
            Dead
          </button>
          <button
            type="button"
            className={`toolbar-button${
              lifeFilter === "suspicious" ? " is-active" : ""
            }`}
            onClick={() => setLifeFilter("suspicious")}
          >
            Suspicious
          </button>
        </div>

        <div className="class-counts" aria-label="Player class counts">
          <div className="class-count" title={`Innocent: ${classCounts.innocent}`}>
            <span className="class-count__dot is-innocent" aria-hidden="true" />
            <span className="class-count__value">{classCounts.innocent}</span>
          </div>
          <div className="class-count" title={`Imposter: ${classCounts.killer}`}>
            <span className="class-count__dot is-killer" aria-hidden="true" />
            <span className="class-count__value">{classCounts.killer}</span>
          </div>
          <div className="class-count" title={`Neutral: ${classCounts.neutral}`}>
            <span className="class-count__dot is-neutral" aria-hidden="true" />
            <span className="class-count__value">{classCounts.neutral}</span>
          </div>

          <button
            type="button"
            className="row-icon-button row-icon-button--add"
            aria-label="Add player"
            title="Add player"
            onClick={onAddPlayer}
          >
            +
          </button>
        </div>
      </div>

      <div className="table-header table-header--scan">
        <span>Player</span>
        <span>Role</span>
        <span>Class</span>
        <span title="Suspicious" style={{ display: 'flex', justifyContent: 'center' }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        </span>
        <span title="Alive / Dead" style={{ display: 'flex', justifyContent: 'center' }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
        </span>
        <span aria-hidden="true" />
      </div>

      <div className="table-body">
        {filteredPlayers.length === 0 ? (
          <div className="table-empty">No players in this filter.</div>
        ) : (
          filteredPlayers.map((player) => (
          <PlayerRow
            key={player.id}
            player={player}
            roles={roles}
            ignoreActionsEnabled={Boolean(ignoreActionsByPlayerId[player.id])}
            selected={player.id === selectedPlayerId}
            compactMode={compactMode}
            rowRef={(node) => {
              rowRefs.current[player.id] = node;
            }}
            dragState={
              draggedPlayerId === player.id
                ? "dragging"
                : dropTarget?.playerId === player.id
                  ? dropTarget.position === "before"
                    ? "drop-before"
                    : "drop-after"
                  : undefined
            }
            onSelect={() => onSelectPlayer(player.id)}
            onReorderMouseDown={(event) => {
              if (event.button !== 0) {
                return;
              }

              event.preventDefault();
              event.stopPropagation();
              setDraggedPlayerId(player.id);
              setDropTarget(undefined);
              onSelectPlayer(player.id);
            }}
            onSetPlayerName={(name) => onSetPlayerName(player.id, name)}
            onRemove={() => onRemovePlayer(player.id)}
            onAssignRole={(slot, roleId) => onAssignRole(player.id, slot, roleId)}
            onAssignClass={(assignedClass) => onAssignClass(player.id, assignedClass)}
            onToggleSuspicious={() => onToggleSuspicious(player.id)}
            onToggleAlive={() => onToggleAlive(player.id)}
          />
          ))
        )}
      </div>
    </section>
  );
}

function KnownRolesPanel(props: {
  entries: RoleInPlay[];
  players: Player[];
  roles: RoleOption[];
  selectedTimelineStep: TimelineStep;
  selectedTimelineStepLabel: string;
  onConfirmRole: (
    roleId: string,
    playerId: string,
    evidenceSourceKeys: string[]
  ) => void;
}) {
  const {
    entries,
    players,
    roles,
    selectedTimelineStep,
    selectedTimelineStepLabel,
    onConfirmRole
  } = props;
  const [statusFilter, setStatusFilter] = useState<"all" | "assigned" | "unclaimed">(
    "all"
  );
  const [certaintyFilter, setCertaintyFilter] = useState<"all" | "confirmed" | "possible">(
    "all"
  );
  const [classFilter, setClassFilter] = useState<"all" | PlayerClass>("all");
  const [pendingConfirmInstanceId, setPendingConfirmInstanceId] = useState<string>();
  const [pendingConfirmPlayerId, setPendingConfirmPlayerId] = useState("");
  const playersById = useMemo(
    () => new Map(players.map((player) => [player.id, player])),
    [players]
  );

  useEffect(() => {
    if (!pendingConfirmInstanceId) {
      return;
    }

    const pendingInstance = entries
      .flatMap((entry) => entry.instances)
      .find((instance) => instance.id === pendingConfirmInstanceId);

    if (!pendingInstance || pendingInstance.assignedPlayerId) {
      setPendingConfirmInstanceId(undefined);
      setPendingConfirmPlayerId("");
    }
  }, [entries, pendingConfirmInstanceId]);

  const filteredEntries = useMemo(
    () =>
      entries
        .map((entry) => ({
          ...entry,
          instances: entry.instances.filter(
            (instance) =>
              matchesRoleInPlayStatusFilter(instance, statusFilter) &&
              matchesRoleInPlayCertaintyFilter(instance, certaintyFilter) &&
              matchesRoleInPlayClassFilter(
                entry,
                instance,
                classFilter,
                playersById
              )
          ).sort((left, right) =>
            compareRoleInstancesForTimeline(
              left,
              right,
              selectedTimelineStep,
              playersById
            )
          )
        }))
        .filter((entry) => entry.instances.length > 0)
        .sort((left, right) =>
          compareRoleEntriesForTimeline(left, right, selectedTimelineStep)
        ),
    [
      certaintyFilter,
      classFilter,
      entries,
      playersById,
      selectedTimelineStep,
      statusFilter
    ]
  );

  const resetPendingConfirm = () => {
    setPendingConfirmInstanceId(undefined);
    setPendingConfirmPlayerId("");
  };

  const handleConfirmRole = (entry: RoleInPlay, instance: RoleInstance) => {
    if (entry.type !== "role" || !entry.roleId || instance.assignedPlayerId) {
      return;
    }

    if (instance.candidatePlayerIds.length === 1) {
      onConfirmRole(
        entry.roleId,
        instance.candidatePlayerIds[0],
        instance.promotionEvidenceSourceKeys
      );
      resetPendingConfirm();
      return;
    }

    setPendingConfirmInstanceId(instance.id);
    setPendingConfirmPlayerId(instance.candidatePlayerIds[0] ?? "");
  };

  const handleSavePendingConfirm = (roleId?: string | null) => {
    if (!roleId || !pendingConfirmPlayerId) {
      return;
    }

    const pendingInstance = entries
      .flatMap((entry) => entry.instances)
      .find((instance) => instance.id === pendingConfirmInstanceId);
    const evidenceSourceKeys = pendingInstance?.promotionEvidenceSourceKeys ?? [];

    onConfirmRole(roleId, pendingConfirmPlayerId, evidenceSourceKeys);
    resetPendingConfirm();
  };
  const statusOptions = [
    { value: "all", label: "All" },
    { value: "assigned", label: "With Owner" },
    { value: "unclaimed", label: "No Owner" }
  ] as const;
  const evidenceOptions = [
    { value: "all", label: "All" },
    { value: "confirmed", label: "Confirmed" },
    { value: "possible", label: "Possible" }
  ] as const;
  const classOptions = [
    { value: "all", label: "All" },
    ...PLAYER_CLASS_OPTIONS.map((value) => ({
      value,
      label: formatPlayerClassLabel(value) ?? value,
      toneClass: getClassToneClass(value)
    }))
  ] as const;

  return (
    <section className="known-roles-panel">
      <div className="known-roles-filters">
        <KnownRolesFilterDropdown
          label="Status"
          value={statusFilter}
          options={statusOptions}
          onChange={setStatusFilter}
        />
        <KnownRolesFilterDropdown
          label="Evidence"
          value={certaintyFilter}
          options={evidenceOptions}
          onChange={setCertaintyFilter}
        />
        <KnownRolesFilterDropdown
          label="Class"
          value={classFilter}
          options={classOptions}
          onChange={setClassFilter}
        />
      </div>

      {entries.length === 0 ? (
        <div className="known-roles-empty">No roles in play yet.</div>
      ) : filteredEntries.length === 0 ? (
        <div className="known-roles-empty">No roles match filters.</div>
      ) : (
        <div className="known-roles-list known-roles-list--minimal">
          {filteredEntries.map((entry) => {
            const role = getRoleById(entry.roleId ?? undefined, roles);
            const toneClass = getRoleInPlayGroupToneClass(entry, playersById);

            return (
              <div
                key={entry.key}
                className={`known-role-group${toneClass ? ` ${toneClass}` : ""}`}
              >
                <div className="known-role-row known-role-row--minimal known-role-group__header">
                  <span className="known-role-row__icon">
                    {entry.type === "role" && role?.imageSrc ? (
                      <img
                        className={entry.classId ? getClassToneClass(entry.classId) : ""}
                        src={role.imageSrc}
                        alt=""
                      />
                    ) : entry.classId ? (
                      <span
                        className={`known-role-row__class-glyph ${getClassToneClass(
                          entry.classId
                        )}`}
                        aria-hidden="true"
                      />
                    ) : (
                      <span className="known-role-row__fallback">?</span>
                    )}
                  </span>

                  <span className="known-role-group__title">
                    <span className="known-role-row__name">
                      {getRoleInPlayGroupLabel(entry)}
                    </span>
                    <span className="known-role-group__count">({entry.instances.length})</span>
                  </span>
                </div>

                <div className="known-role-group__instances">
                  {entry.instances.map((instance) => {
                    const matchingEvidence = getTimelineEvidenceForStep(
                      instance.evidenceSources,
                      selectedTimelineStep
                    );
                    const primaryEvidence =
                      matchingEvidence[0] ?? instance.evidenceSources[0];
                    const canConfirmPossibleRole =
                      entry.type === "role" &&
                      Boolean(entry.roleId) &&
                      !instance.assignedPlayerId;
                    const isPendingPlayerPick =
                      canConfirmPossibleRole && pendingConfirmInstanceId === instance.id;
                    const confirmablePlayers = getRoleInstanceConfirmablePlayers(
                      instance,
                      players
                    );
                    const candidateSummary = getRoleInstanceCandidateSummary(
                      instance,
                      players
                    );

                    return (
                      <div
                        key={instance.id}
                        className={`known-role-instance known-role-instance--${
                          instance.status
                        } known-role-instance--${
                          instance.certainty
                        }${matchingEvidence.length > 0 ? " is-timeline-match" : ""}`}
                        title={getRoleInstanceEvidenceHint(instance, players)}
                      >
                        <span className="known-role-instance__lead">
                          {getRoleInstanceLead(instance, players)}
                        </span>
                        <div className="known-role-instance__meta">
                          <span
                            className={`known-role-instance__badge known-role-instance__badge--${
                              instance.certainty
                            }`}
                          >
                            {instance.certainty === "confirmed" ? "Confirmed" : "Possible"}
                          </span>
                          <span
                            className={`known-role-instance__badge known-role-instance__badge--${
                              instance.status
                            }`}
                          >
                            {instance.status === "assigned"
                              ? "Confirmed Owner"
                              : "No Owner"}
                          </span>
                          {instance.conflict ? (
                            <span className="known-role-instance__badge known-role-instance__badge--conflict">
                              Conflict
                            </span>
                          ) : null}

                          {canConfirmPossibleRole ? (
                            isPendingPlayerPick ? (
                              <div className="known-role-instance__confirm-group">
                                <KnownRoleConfirmPlayerPicker
                                  players={confirmablePlayers}
                                  value={pendingConfirmPlayerId}
                                  onChange={setPendingConfirmPlayerId}
                                />

                                <button
                                  type="button"
                                  className="toolbar-button known-role-instance__confirm"
                                  disabled={!pendingConfirmPlayerId}
                                  onClick={() =>
                                    handleSavePendingConfirm(entry.roleId)
                                  }
                                >
                                  Save
                                </button>

                                <button
                                  type="button"
                                  className="toolbar-button known-role-instance__confirm"
                                  aria-label="Cancel role confirmation"
                                  title="Cancel role confirmation"
                                  onClick={resetPendingConfirm}
                                >
                                  x
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                className="toolbar-button known-role-instance__confirm"
                                onClick={() => handleConfirmRole(entry, instance)}
                              >
                                Confirm
                              </button>
                            )
                          ) : null}
                        </div>
                        <div className="known-role-instance__details">
                          {candidateSummary ? (
                            <span className="known-role-instance__detail">
                              {candidateSummary}
                            </span>
                          ) : null}
                          {instance.notes ? (
                            <span className="known-role-instance__detail known-role-instance__detail--note">
                              {instance.notes}
                            </span>
                          ) : null}
                          {primaryEvidence ? (
                            <span className="known-role-instance__hint">
                              {matchingEvidence.length > 0
                                ? `${selectedTimelineStepLabel}: ${primaryEvidence.summary}`
                                : primaryEvidence.summary}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function KnownRolesFilterDropdown<T extends string>(props: {
  label: string;
  value: T;
  options: ReadonlyArray<{
    value: T;
    label: string;
    toneClass?: string;
  }>;
  onChange: (value: T) => void;
}) {
  const { label, value, options, onChange } = props;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selectedOption = options.find((option) => option.value === value) ?? options[0];
  const { menuStyle, openUpward } = useFloatingPicker(
    rootRef,
    open,
    () => setOpen(false),
    152,
    Math.min(168, Math.max(70, options.length * 26 + 8)),
    [options.length, selectedOption?.label.length ?? 0]
  );

  return (
    <div
      ref={rootRef}
      className={`known-roles-filter-dropdown${open ? " is-open" : ""}`}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className={`known-roles-filter-trigger${
          selectedOption?.toneClass ? ` ${selectedOption.toneClass}` : ""
        }`}
        aria-expanded={open}
        title={`${label}: ${selectedOption?.label ?? ""}`}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="known-roles-filter-trigger__text">
          {`${label}: ${selectedOption?.label ?? ""}`}
        </span>
        <span className="known-roles-filter-trigger__caret" aria-hidden="true">
          {openUpward ? "^" : "v"}
        </span>
      </button>

      {open ? (
        <div
          className={`role-dropdown__menu known-roles-filter-menu${
            openUpward ? " is-upward" : ""
          }`}
          style={menuStyle}
        >
          <div className="known-roles-filter-menu__list">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`known-roles-filter-option${
                  value === option.value ? " is-active" : ""
                }${option.toneClass ? ` ${option.toneClass}` : ""}`}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <span className="known-roles-filter-option__label">{option.label}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function KnownRoleConfirmPlayerPicker(props: {
  players: Player[];
  value: string;
  onChange: (playerId: string) => void;
}) {
  const { players, value, onChange } = props;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selectedPlayer =
    players.find((player) => player.id === value) ?? players[0] ?? null;
  const { menuStyle, openUpward } = useFloatingPicker(
    rootRef,
    open,
    () => setOpen(false),
    188,
    Math.min(232, Math.max(52, players.length * 26 + 10)),
    [players.length, selectedPlayer?.seat ?? 0]
  );

  useEffect(() => {
    if (players.length === 0) {
      if (value) {
        onChange("");
      }
      setOpen(false);
      return;
    }

    if (value && players.some((player) => player.id === value)) {
      return;
    }

    onChange(players[0].id);
  }, [onChange, players, value]);

  return (
    <div
      ref={rootRef}
      className={`known-role-instance__confirm-picker${open ? " is-open" : ""}`}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="known-role-instance__confirm-trigger"
        aria-expanded={open}
        disabled={players.length === 0}
        title={selectedPlayer ? getPlayerLabel(selectedPlayer.id, players) : "Select player"}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="known-role-instance__confirm-trigger-label">
          {selectedPlayer ? getPlayerLabel(selectedPlayer.id, players) : "Player"}
        </span>
        <span className="known-role-instance__confirm-trigger-caret" aria-hidden="true">
          {openUpward ? "^" : "v"}
        </span>
      </button>

      {open ? (
        <div
          className={`role-dropdown__menu quick-picker__menu known-role-instance__confirm-menu${
            openUpward ? " is-upward" : ""
          }`}
          style={menuStyle}
        >
          {players.length === 0 ? (
            <div className="quick-picker__empty">No players.</div>
          ) : (
            <div className="quick-picker__list">
              {players.map((player) => {
                const label = getPlayerLabel(player.id, players);

                return (
                  <button
                    key={player.id}
                    type="button"
                    className={`quick-picker__item known-role-instance__confirm-option${
                      value === player.id ? " is-active" : ""
                    }`}
                    title={label}
                    onClick={() => {
                      onChange(player.id);
                      setOpen(false);
                    }}
                  >
                    <span className="quick-picker__item-name">{label}</span>
                    <span className="quick-picker__item-meta">#{player.seat}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function PlayerRow(props: {
  player: Player;
  roles: RoleOption[];
  ignoreActionsEnabled: boolean;
  selected: boolean;
  compactMode: boolean;
  rowRef: (node: HTMLDivElement | null) => void;
  dragState?: "dragging" | "drop-before" | "drop-after";
  onSelect: () => void;
  onReorderMouseDown: (event: ReactMouseEvent<HTMLSpanElement>) => void;
  onSetPlayerName: (name: string) => void;
  onRemove: () => void;
  onAssignRole: (slot: RoleAssignmentSlot, roleId?: string) => void;
  onAssignClass: (assignedClass: PlayerClass | null) => void;
  onToggleSuspicious: () => void;
  onToggleAlive: () => void;
}) {
  const {
    player,
    roles,
    ignoreActionsEnabled,
    selected,
    compactMode,
    rowRef,
    dragState,
    onSelect,
    onReorderMouseDown,
    onSetPlayerName,
    onRemove,
    onAssignRole,
    onAssignClass,
    onToggleSuspicious,
    onToggleAlive
  } = props;

  return (
    <div
      ref={rowRef}
      role="button"
      tabIndex={0}
      className={`player-row${selected ? " is-selected" : ""}${
        compactMode ? " is-compact" : ""
      }${!player.isAlive ? " is-dead" : ""}${
        dragState ? ` is-${dragState}` : ""
      }`}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="player-cell player-cell--player">
        <span
          className="player-drag-handle"
          title="Drag to reorder"
          onMouseDown={onReorderMouseDown}
        >
          ⋮⋮
        </span>
        <PlayerNameEditor
          value={player.name}
          placeholder={`P${player.seat}`}
          onCommit={onSetPlayerName}
          onSelect={onSelect}
          className="player-name-input--row"
          suffix={ignoreActionsEnabled ? <IgnoreActionsTag /> : undefined}
        />
      </div>

      <div className="player-cell player-cell--role">
        <RoleDropdown
          roles={roles}
          primaryRole={player.primaryRole}
          secondaryRole={player.secondaryRole}
          compact={compactMode}
          onFocus={onSelect}
          onAssignRole={onAssignRole}
        />
      </div>

      <div className="player-cell player-cell--class">
        <ClassPicker
          player={player}
          compact
          symbolOnly
          onFocus={onSelect}
          onAssignClass={onAssignClass}
        />
      </div>

      <div className="player-cell player-cell--center">
        <SuspicionToggle
          active={player.suspicious}
          onSelect={onSelect}
          onToggle={onToggleSuspicious}
        />
      </div>

      <div className="player-cell player-cell--center">
        <AliveToggle
          alive={player.isAlive}
          onSelect={onSelect}
          onToggle={onToggleAlive}
        />
      </div>

      <div className="player-cell player-cell--center">
        <button
          type="button"
          className="row-icon-button row-icon-button--danger"
          aria-label={`Remove ${player.name || `player ${player.seat}`}`}
          title="Remove player"
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
        >
          <TrashIcon />
        </button>
      </div>
    </div>
  );
}

function PlayerNameEditor(props: {
  value: string;
  placeholder: string;
  onCommit: (content: string) => void;
  onSelect?: () => void;
  className?: string;
  suffix?: ReactNode;
}) {
  const { value, placeholder, onCommit, onSelect, className, suffix } = props;
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (!editing) {
      return;
    }

    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  const handleSave = () => {
    onCommit(draft.trim());
    setEditing(false);
  };

  const handleStartEditing = () => {
    onSelect?.();
    setDraft(value);
    setEditing(true);
  };

  if (!editing) {
    return (
      <div className={className ? `player-name-editor ${className}` : "player-name-editor"}>
        <span className="player-name-editor__content">
          <span
            className={`player-name-editor__text${
              value ? "" : " is-placeholder"
            }`}
          >
            {value || placeholder}
          </span>
          {suffix}
        </span>

        <button
          type="button"
          className="row-icon-button"
          aria-label="Edit player name"
          title="Edit player name"
          onClick={(event) => {
            event.stopPropagation();
            handleStartEditing();
          }}
        >
          <EditIcon />
        </button>
      </div>
    );
  }

  return (
    <div className={className ? `player-name-editor ${className}` : "player-name-editor"}>
      <input
        ref={inputRef}
        type="text"
        className="player-name-input"
        value={draft}
        placeholder={placeholder}
        onClick={(event) => event.stopPropagation()}
        onFocus={() => onSelect?.()}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            handleSave();
          }

          if (event.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
      />

      <button
        type="button"
        className="row-icon-button row-icon-button--save"
        aria-label="Save player name"
        title="Save player name"
        onClick={(event) => {
          event.stopPropagation();
          handleSave();
        }}
      >
        <SaveIcon />
      </button>
    </div>
  );
}

function EditIcon() {
  return (
    <svg
      className="action-icon"
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M3 11.5 11.9 2.6l1.5 1.5-8.9 8.9L3 13Zm0 0 1.7-.4"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.2"
      />
    </svg>
  );
}

function SaveIcon() {
  return (
    <svg
      className="action-icon"
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="m3.5 8 3 3 6-6"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      className="trash-icon"
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M3 4h10M6 4V2h4v2m-5 0-.5 9h7L11 4M6.5 6.5v4.5m3-4.5v4.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.2"
      />
    </svg>
  );
}

function IgnoreActionsTag() {
  return (
    <span className="player-ignore-tag" title="Ignore Actions enabled">
      ignored
    </span>
  );
}

function PlayerDetailPanel(props: {
  selectedPlayerId?: string;
  players: Player[];
  roles: RoleOption[];
  actions: NightAction[];
  usedAbilities: UsedAbilityLog[];
  currentRound: number;
  selectedTimelineStep: TimelineStep;
  selectedTimelineStepLabel: string;
  timelineViewMode: "focus" | "full";
  timelineSteps: TimelineStep[];
  onSetTimelineViewMode: (mode: "focus" | "full") => void;
  ignoreActionsEnabled: boolean;
  onSetPlayerName: (playerId: string, name: string) => void;
  onAssignRole: (
    playerId: string,
    slot: RoleAssignmentSlot,
    roleId?: string
  ) => void;
  onAssignClass: (playerId: string, assignedClass: PlayerClass | null) => void;
  onToggleSuspicious: (playerId: string) => void;
  onToggleAlive: (playerId: string) => void;
  onAddAction: (actorId: string, actionType: string, targetId?: string) => void;
  onUpdateAction: (
    actionId: string,
    actorId: string,
    actionType: string,
    targetId?: string
  ) => void;
  onRemoveAction: (actionId: string) => void;
  onAddUsedAbility: (entry: UsedAbilityDraft) => void;
  onUpdateUsedAbility: (abilityId: string, entry: UsedAbilityDraft) => void;
  onRemoveUsedAbility: (abilityId: string) => void;
  onSetPlayerIgnoreActions: (playerId: string, ignored: boolean) => void;
}) {
  const {
    selectedPlayerId,
    players,
    roles,
    actions,
    usedAbilities,
    currentRound,
    selectedTimelineStep,
    selectedTimelineStepLabel,
    timelineViewMode,
    timelineSteps,
    onSetTimelineViewMode,
    ignoreActionsEnabled,
    onSetPlayerName,
    onAssignRole,
    onAssignClass,
    onToggleSuspicious,
    onToggleAlive,
    onAddAction,
    onUpdateAction,
    onRemoveAction,
    onAddUsedAbility,
    onUpdateUsedAbility,
    onRemoveUsedAbility,
    onSetPlayerIgnoreActions
  } = props;

  const playersById = useMemo(
    () => new Map(players.map((player) => [player.id, player])),
    [players]
  );
  const selectedPlayer = selectedPlayerId ? playersById.get(selectedPlayerId) : undefined;
  const selectedPlayerIdRef = useRef<string | undefined>(selectedPlayerId);
  const timelineScopeLabel =
    timelineViewMode === "full" ? "All Nights" : selectedTimelineStepLabel;

  useEffect(() => {
    selectedPlayerIdRef.current = selectedPlayerId;
  }, [selectedPlayerId]);

  const getCurrentSelectedPlayer = () => {
    const currentPlayerId = selectedPlayerIdRef.current;
    return currentPlayerId ? playersById.get(currentPlayerId) : undefined;
  };

  if (!selectedPlayer) {
    return (
      <aside className="detail-panel">
        <div className="detail-empty">Select a player to edit details.</div>
      </aside>
    );
  }

  return (
    <aside className="detail-panel">
      <section className="detail-section detail-section--summary">
        <PlayerNameEditor
          value={selectedPlayer.name}
          placeholder="Player name"
          className="player-name-input--detail"
          onCommit={(name) => {
            const currentPlayer = getCurrentSelectedPlayer();
            if (currentPlayer) {
              onSetPlayerName(currentPlayer.id, name);
            }
          }}
          suffix={ignoreActionsEnabled ? <IgnoreActionsTag /> : undefined}
        />

        <div className="detail-meta-row">
          <RoleDropdown
            roles={roles}
            primaryRole={selectedPlayer.primaryRole}
            secondaryRole={selectedPlayer.secondaryRole}
            onAssignRole={(slot, roleId) => {
              const currentPlayer = getCurrentSelectedPlayer();
              if (currentPlayer) {
                onAssignRole(currentPlayer.id, slot, roleId);
              }
            }}
          />

          <ClassPicker
            player={selectedPlayer}
            onAssignClass={(assignedClass) => {
              const currentPlayer = getCurrentSelectedPlayer();
              if (currentPlayer) {
                onAssignClass(currentPlayer.id, assignedClass);
              }
            }}
          />
        </div>

        <div className="summary-actions-row">
          <div className="summary-action-item">
            <span className="summary-label">Suspicious</span>
            <SuspicionToggle
              active={selectedPlayer.suspicious}
              onToggle={() => {
                const currentPlayer = getCurrentSelectedPlayer();
                if (currentPlayer) {
                  onToggleSuspicious(currentPlayer.id);
                }
              }}
            />
          </div>

          <div className="summary-action-item">
            <span className="summary-label">Alive / Dead</span>
            <AliveToggle
              alive={selectedPlayer.isAlive}
              onToggle={() => {
                const currentPlayer = getCurrentSelectedPlayer();
                if (currentPlayer) {
                  onToggleAlive(currentPlayer.id);
                }
              }}
            />
          </div>

          <div className="summary-action-item">
            <label className="ignore-actions-toggle">
              <input
                type="checkbox"
                checked={ignoreActionsEnabled}
                onChange={(event) => {
                  const currentPlayer = getCurrentSelectedPlayer();
                  if (currentPlayer) {
                    onSetPlayerIgnoreActions(
                      currentPlayer.id,
                      event.currentTarget.checked
                    );
                  }
                }}
              />
              <span>Ignore Actions</span>
            </label>
          </div>
        </div>
      </section>

      <section className="detail-section">
        <div className="detail-section__header detail-section__header--with-step">
          <span>Timeline View</span>
          <span className="detail-section__timeline">{timelineScopeLabel}</span>
        </div>

        <TimelineViewModeToggle
          mode={timelineViewMode}
          onChange={onSetTimelineViewMode}
        />
      </section>

      <section className="detail-section">
        <div className="detail-section__header detail-section__header--with-step">
          <span>Used Ability</span>
          <span className="detail-section__timeline">{timelineScopeLabel}</span>
        </div>

        <UsedAbilitySection
          player={selectedPlayer}
          players={players}
          roles={roles}
          usedAbilities={usedAbilities}
          currentRound={currentRound}
          selectedTimelineStep={selectedTimelineStep}
          selectedTimelineStepLabel={selectedTimelineStepLabel}
          timelineViewMode={timelineViewMode}
          timelineSteps={timelineSteps}
          onAddUsedAbility={onAddUsedAbility}
          onUpdateUsedAbility={onUpdateUsedAbility}
          onRemoveUsedAbility={onRemoveUsedAbility}
        />
      </section>

      <section className="detail-section">
        <div className="detail-section__header detail-section__header--with-step">
          <span>Night History</span>
          <span className="detail-section__timeline">{timelineScopeLabel}</span>
        </div>

        <NightActionComposer
          player={selectedPlayer}
          players={players}
          roles={roles}
          onAddAction={onAddAction}
        />

        <NightActionList
          actions={actions}
          players={players}
          roles={roles}
          selectedPlayer={selectedPlayer}
          selectedTimelineStep={selectedTimelineStep}
          selectedTimelineStepLabel={selectedTimelineStepLabel}
          timelineViewMode={timelineViewMode}
          timelineSteps={timelineSteps}
          onUpdateAction={onUpdateAction}
          onRemoveAction={onRemoveAction}
        />
      </section>
    </aside>
  );
}

function UsedAbilitySection(props: {
  player: Player;
  players: Player[];
  roles: RoleOption[];
  usedAbilities: UsedAbilityLog[];
  currentRound: number;
  selectedTimelineStep: TimelineStep;
  selectedTimelineStepLabel: string;
  timelineViewMode: "focus" | "full";
  timelineSteps: TimelineStep[];
  onAddUsedAbility: (entry: UsedAbilityDraft) => void;
  onUpdateUsedAbility: (abilityId: string, entry: UsedAbilityDraft) => void;
  onRemoveUsedAbility: (abilityId: string) => void;
}) {
  const {
    player,
    players,
    roles,
    usedAbilities,
    currentRound,
    selectedTimelineStep,
    selectedTimelineStepLabel,
    timelineViewMode,
    timelineSteps,
    onAddUsedAbility,
    onUpdateUsedAbility,
    onRemoveUsedAbility
  } = props;
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingAbilityId, setEditingAbilityId] = useState<string>();
  const [draft, setDraft] = useState<UsedAbilityDraft>();
  const groupedUsedAbilities = useMemo(
    () => {
      const grouped = new Map(
        groupItemsByTimelineStep(usedAbilities, getTimelineStepFromUsedAbility).map(
          (group) => [getTimelineStepKey(group.step), group.items]
        )
      );
      const sourceSteps =
        timelineViewMode === "full"
          ? timelineSteps
          : timelineSteps.filter((step) => isSameTimelineStep(step, selectedTimelineStep));

      return sourceSteps.map((step) => ({
        step,
        items: grouped.get(getTimelineStepKey(step)) ?? []
      }));
    },
    [selectedTimelineStep, timelineSteps, timelineViewMode, usedAbilities]
  );

  useEffect(() => {
    setEditorOpen(false);
    setEditingAbilityId(undefined);
    setDraft(undefined);
  }, [player.id]);

  const closeEditor = () => {
    setEditorOpen(false);
    setEditingAbilityId(undefined);
    setDraft(undefined);
  };

  const handleSave = () => {
    if (!draft || !isUsedAbilityDraftValid(draft)) {
      return;
    }

    if (editingAbilityId) {
      onUpdateUsedAbility(editingAbilityId, draft);
    } else {
      onAddUsedAbility(draft);
    }

    closeEditor();
  };

  return (
    <div className="used-ability-section">
      <div className="used-ability-toolbar">
        <button
          type="button"
          className="row-icon-button row-icon-button--add"
          aria-label="Add used ability"
          title="Add used ability"
          onClick={() => {
            setEditorOpen((current) => !current || Boolean(editingAbilityId));
            setEditingAbilityId(undefined);
            setDraft(undefined);
          }}
        >
          +
        </button>
      </div>

      {editorOpen ? (
        <UsedAbilityEditor
          player={player}
          players={players}
          roles={roles}
          currentRound={currentRound}
          draft={draft}
          onDraftChange={setDraft}
          onSave={handleSave}
          onCancel={closeEditor}
        />
      ) : null}

      <div className="action-list action-list--timeline">
        {usedAbilities.length === 0 ? (
          <div className="empty-inline">No used abilities logged.</div>
        ) : (
          <>
            {groupedUsedAbilities.map((group) => {
              const isSelectedGroup = isSameTimelineStep(
                group.step,
                selectedTimelineStep
              );
              const label = getLabelForTimelineStep(group.step);

              return (
                <TimelineGroup
                  key={getTimelineStepKey(group.step)}
                  label={label}
                  active={isSelectedGroup}
                  className={timelineViewMode === "full" ? "timeline-group--full" : undefined}
                  emptyState={
                    <div className="timeline-log-group__summary">
                      {timelineViewMode === "focus"
                        ? `No used abilities for ${selectedTimelineStepLabel}.`
                        : "No used abilities logged."}
                    </div>
                  }
                >
                  {group.items.length > 0 ? (
                    <>
                      {timelineViewMode === "full" ? (
                        <div className="timeline-group__meta">{group.items.length}</div>
                      ) : null}
                      {group.items.map((entry) => (
                      <div key={entry.id} className="action-item used-ability-item">
                        <div className="action-item__header">
                          <UsedAbilityHistorySummary
                            entry={entry}
                            players={players}
                            roles={roles}
                          />

                          <div className="action-item__controls">
                            <button
                              type="button"
                              className="row-icon-button"
                              aria-label="Edit used ability"
                              title="Edit used ability"
                              onClick={() => {
                                setEditorOpen(true);
                                setEditingAbilityId(entry.id);
                                setDraft(toUsedAbilityDraft(entry));
                              }}
                            >
                              <EditIcon />
                            </button>

                            <button
                              type="button"
                              className="row-icon-button row-icon-button--danger"
                              aria-label="Remove used ability"
                              title="Remove used ability"
                              onClick={() => onRemoveUsedAbility(entry.id)}
                            >
                              <TrashIcon />
                            </button>
                          </div>
                        </div>

                        <div className="action-item__meta">
                          {getUsedAbilityRoundLabel(entry)}
                        </div>
                      </div>
                      ))}
                    </>
                  ) : undefined}
                </TimelineGroup>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

export function UsedAbilityEditor(props: {
  player: Player;
  players: Player[];
  roles: RoleOption[];
  currentRound: number;
  draft?: UsedAbilityDraft;
  onDraftChange: (draft?: UsedAbilityDraft) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const {
    player,
    players,
    roles,
    currentRound,
    draft,
    onDraftChange,
    onSave,
    onCancel
  } = props;
  const supportedRoles = useMemo(() => getUsedAbilityRoleOptions(roles), [roles]);
  const selectablePlayers = useMemo(
    () => players.filter((entry) => entry.id !== player.id),
    [player.id, players]
  );

  const handleRoleTypeChange = (roleType: UsedAbilityRoleType) => {
    onDraftChange(
      createUsedAbilityDraft(roleType, player.id, draft?.roundNumber ?? currentRound)
    );
  };

  return (
    <div className="used-ability-editor">
      <div className="used-ability-editor__row used-ability-editor__row--wide">
        <span className="summary-label">Role</span>
        <UsedAbilityRolePicker
          roles={supportedRoles}
          value={draft?.roleType}
          onPick={handleRoleTypeChange}
        />
      </div>

      {draft ? (
        <>
          <div className="used-ability-editor__meta">
            Night {draft.roundNumber}
          </div>

          {draft.roleType === "Doctor" ? (
            <>
              <AbilityPlayerValuePicker
                label="Target visited"
                players={selectablePlayers}
                value={draft.targetPlayerId}
                allowUnknown
                onPick={(targetPlayerId) =>
                  onDraftChange({ ...draft, targetPlayerId })
                }
              />

              <AbilityChoiceButtons
                label="Result"
                options={DOCTOR_REVIVE_RESULTS.map((value) => ({
                  value,
                  label: getDoctorReviveLabel(value)
                }))}
                value={draft.reviveResult}
                onPick={(value) =>
                  onDraftChange({
                    ...draft,
                    reviveResult: value as DoctorReviveResult
                  })
                }
              />
            </>
          ) : null}

          {draft.roleType === "Police" ? (
            <>
              <AbilityPlayerValuePicker
                label="Target player"
                players={selectablePlayers}
                value={draft.targetPlayerId}
                allowUnknown
                onPick={(targetPlayerId) =>
                  onDraftChange({ ...draft, targetPlayerId })
                }
              />

              <AbilityChoiceButtons
                label="Movement result"
                options={POLICE_MOVEMENT_RESULTS.map((value) => ({
                  value,
                  label: getPoliceMovementLabel(value)
                }))}
                value={draft.movementResult}
                onPick={(value) =>
                  onDraftChange({
                    ...draft,
                    movementResult: value as PoliceMovementResult
                  })
                }
              />
            </>
          ) : null}

          {draft.roleType === "Lookout" ? (
            <>
              <AbilityPlayerValuePicker
                label="Target visited"
                players={selectablePlayers}
                value={draft.targetPlayerId}
                allowUnknown
                onPick={(targetPlayerId) =>
                  onDraftChange({ ...draft, targetPlayerId })
                }
              />

              <LookoutVisitorListEditor
                players={selectablePlayers}
                values={draft.seenVisitorIds}
                onChange={(seenVisitorIds) =>
                  onDraftChange({ ...draft, seenVisitorIds })
                }
              />
            </>
          ) : null}

          {draft.roleType === "Investigator" ? (
            <>
              <AbilityPlayerValuePicker
                label="Target player"
                players={selectablePlayers}
                value={draft.targetPlayerId}
                allowUnknown
                onPick={(targetPlayerId) =>
                  onDraftChange({ ...draft, targetPlayerId })
                }
              />

              <div className="used-ability-editor__row used-ability-editor__row--wide">
                <span className="summary-label">Possible identities</span>

                <div className="used-ability-result-grid">
                  <InvestigatorObservedResultEditor
                    title="Option A"
                    roles={roles}
                    value={draft.possibleResult1}
                    onChange={(possibleResult1) =>
                      onDraftChange({ ...draft, possibleResult1 })
                    }
                  />

                  <InvestigatorObservedResultEditor
                    title="Option B"
                    roles={roles}
                    value={draft.possibleResult2}
                    onChange={(possibleResult2) =>
                      onDraftChange({ ...draft, possibleResult2 })
                    }
                  />
                </div>
              </div>
            </>
          ) : null}

          {draft.roleType === "Trapper" ? (
            <>
              <AbilityPlayerValuePicker
                label="Trap placed on"
                players={selectablePlayers}
                value={draft.trapTargetPlayerId}
                allowUnknown
                onPick={(trapTargetPlayerId) =>
                  onDraftChange({ ...draft, trapTargetPlayerId })
                }
              />

              <AbilityPlayerValuePicker
                label="Trapped player"
                players={selectablePlayers}
                value={draft.trappedPlayerId}
                allowUnknown
                onPick={(trappedPlayerId) =>
                  onDraftChange({ ...draft, trappedPlayerId })
                }
              />
            </>
          ) : null}

          {draft.roleType === "Snitch" ? (
            <>
              <AbilityPlayerValuePicker
                label="Target visited"
                players={selectablePlayers}
                value={draft.targetPlayerId}
                onPick={(targetPlayerId) =>
                  onDraftChange({ ...draft, targetPlayerId })
                }
              />

              <AbilityRoleValuePicker
                label="Revealed role"
                roles={roles}
                value={draft.revealedRole}
                allowUnknown
                onPick={(revealedRole) =>
                  onDraftChange({ ...draft, revealedRole })
                }
              />

              <ObservedClassValuePicker
                label="Revealed class"
                value={draft.revealedClass}
                onPick={(revealedClass) =>
                  onDraftChange({ ...draft, revealedClass })
                }
              />
            </>
          ) : null}

          {draft.roleType === "Provoker" ? (
            <AbilityPlayerValuePicker
              label="Target player"
              players={selectablePlayers}
              value={draft.targetPlayerId}
              allowUnknown
              onPick={(targetPlayerId) =>
                onDraftChange({ ...draft, targetPlayerId })
              }
            />
          ) : null}

          {draft.roleType === "Tracker" ? (
            <>
              <AbilityPlayerValuePicker
                label="Tracked player"
                players={selectablePlayers}
                value={draft.trackedPlayerId}
                allowUnknown
                onPick={(trackedPlayerId) =>
                  onDraftChange({ ...draft, trackedPlayerId })
                }
              />

              <AbilityPlayerValuePicker
                label="Destination seen"
                players={selectablePlayers}
                value={draft.destinationPlayerId}
                allowUnknown
                onPick={(destinationPlayerId) =>
                  onDraftChange({ ...draft, destinationPlayerId })
                }
              />
            </>
          ) : null}
        </>
      ) : null}

      <div className="used-ability-editor__actions">
        <button
          type="button"
          className="toolbar-button"
          disabled={!draft || !isUsedAbilityDraftValid(draft)}
          onClick={onSave}
        >
          Save
        </button>

        <button type="button" className="toolbar-button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function UsedAbilityHistorySummary(props: {
  entry: UsedAbilityLog;
  players: Player[];
  roles: RoleOption[];
}) {
  const { entry, players, roles } = props;

  if (entry.roleType !== "Investigator") {
    return (
      <div className="action-item__main">
        <strong>{entry.roleType}</strong>
        <span>{getUsedAbilitySummary(entry, players)}</span>
      </div>
    );
  }

  const investigatorRole = getRoleById(entry.roleType, roles);

  return (
    <div className="used-ability-item__content used-ability-item__content--investigator">
      <div className="used-ability-item__headline">
        <span className="used-ability-item__role-label">
          <span className="role-trigger__icon used-ability-item__role-icon">
            {investigatorRole ? (
              <img
                className="role-trigger__image"
                src={investigatorRole.imageSrc}
                alt=""
              />
            ) : (
              <span className="role-trigger__fallback">?</span>
            )}
          </span>
          <strong>Investigator</strong>
        </span>
        <span className="used-ability-item__arrow">-&gt;</span>
        <span className="used-ability-item__target">
          {formatAbilityPlayerReference(entry.targetPlayerId, players)}
        </span>
      </div>

      <div className="used-ability-chip-row">
        <ObservedIdentityChip
          result={entry.possibleResult1}
          roles={roles}
        />
        <span className="used-ability-chip-divider" aria-hidden="true">
          |
        </span>
        <ObservedIdentityChip
          result={entry.possibleResult2}
          roles={roles}
        />
      </div>
    </div>
  );
}

function ObservedIdentityChip(props: {
  result: {
    role: AbilityRoleReference;
    class: ObservedPlayerClass;
  };
  roles: RoleOption[];
}) {
  const { result, roles } = props;
  const roleOption = getRoleById(
    result.role === ABILITY_UNKNOWN_VALUE ? undefined : result.role,
    roles
  );
  const toneClass =
    result.class !== ABILITY_UNKNOWN_VALUE
      ? getClassToneClass(result.class)
      : "";

  return (
    <div className="ability-role-chip" title={formatObservedClass(result.class)}>
      <span className="role-trigger__icon ability-role-chip__icon">
        {roleOption ? (
          <img className="role-trigger__image" src={roleOption.imageSrc} alt="" />
        ) : (
          <span className="role-trigger__fallback">?</span>
        )}
      </span>

      <span className="ability-role-chip__name">
        {formatAbilityRoleReference(result.role)}
      </span>

      <span
        className={`ability-role-chip__class-indicator${
          toneClass ? ` ${toneClass}` : ""
        }`}
        aria-label={`Class ${formatObservedClass(result.class)}`}
      />
    </div>
  );
}

function UsedAbilityRolePicker(props: {
  roles: RoleOption[];
  value?: UsedAbilityRoleType;
  onPick: (roleType: UsedAbilityRoleType) => void;
}) {
  const { roles, value, onPick } = props;
  const currentRole = roles.find((role) => role.id === value);

  return (
    <div className="role-dropdown" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        className="role-dropdown__trigger"
        onClick={async () => {
          const response = await requestRoleSelection({
            title: "Used Ability Role",
            roles,
            value,
            allowClear: false,
            clearLabel: ""
          });
          if (response.status === "picked" && response.roleId) {
            onPick(response.roleId as UsedAbilityRoleType);
          }
        }}
      >
        <span className="role-trigger__icon">
          {currentRole ? (
            <img className="role-trigger__image" src={currentRole.imageSrc} alt="" />
          ) : (
            <span className="role-trigger__fallback">?</span>
          )}
        </span>
        <span className="role-trigger__label">{value ?? "Select role"}</span>
      </button>
    </div>
  );
}

function AbilityPlayerValuePicker(props: {
  label: string;
  players: Player[];
  value: string;
  allowUnknown?: boolean;
  onPick: (value: AbilityPlayerReference | string) => void;
}) {
  const { label, players, value, allowUnknown = false, onPick } = props;
  const [open, setOpen] = useState(false);
  useClosePickerOnWindowBlur(open, () => setOpen(false));

  return (
    <div className="used-ability-editor__row">
      <span className="summary-label">{label}</span>

      <div className="quick-picker" onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          className="role-dropdown__trigger quick-picker__trigger"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          <span className="quick-picker__text">
            {formatAbilityPlayerReference(value, players)}
          </span>
        </button>

        {open ? (
          <div className="role-dropdown__overlay" onClick={() => setOpen(false)}>
            <div
              className="role-dropdown__panel quick-picker__panel"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="role-dropdown__panel-header">
                <div className="role-dropdown__panel-title">{label}</div>
                <button
                  type="button"
                  className="panel-header__button panel-header__button--icon"
                  aria-label="Close player selector"
                  title="Close player selector"
                  onClick={() => setOpen(false)}
                >
                  x
                </button>
              </div>

              <div className="role-dropdown__section">
                <div className="quick-picker__list">
                  {allowUnknown ? (
                    <button
                      type="button"
                      className="quick-picker__item"
                      onClick={() => {
                        onPick(ABILITY_UNKNOWN_VALUE);
                        setOpen(false);
                      }}
                    >
                      <span className="quick-picker__item-name">?</span>
                    </button>
                  ) : null}

                  {players.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      className="quick-picker__item"
                      onClick={() => {
                        onPick(entry.id);
                        setOpen(false);
                      }}
                    >
                      <span className="quick-picker__item-name">
                        {entry.name || `Player #${entry.seat}`}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function AbilityRoleValuePicker(props: {
  label: string;
  roles: RoleOption[];
  value: AbilityRoleReference;
  allowUnknown?: boolean;
  onPick: (value: AbilityRoleReference) => void;
  inline?: boolean;
}) {
  const { label, roles, value, allowUnknown = false, onPick, inline = false } = props;
  const currentRole = getRoleById(
    value === ABILITY_UNKNOWN_VALUE ? undefined : value,
    roles
  );

  const content = (
    <div className="role-dropdown" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        className="role-dropdown__trigger"
        onClick={async () => {
          const response = await requestRoleSelection({
            title: label,
            roles,
            value: value === ABILITY_UNKNOWN_VALUE ? undefined : value,
            allowClear: allowUnknown,
            clearLabel: "?"
          });
          if (response.status === "picked") {
            onPick(response.roleId ?? ABILITY_UNKNOWN_VALUE);
          }
        }}
      >
        <span className="role-trigger__icon">
          {currentRole ? (
            <img className="role-trigger__image" src={currentRole.imageSrc} alt="" />
          ) : (
            <span className="role-trigger__fallback">?</span>
          )}
        </span>
        <span className="role-trigger__label">
          {formatAbilityRoleReference(value)}
        </span>
      </button>
    </div>
  );

  if (inline) {
    return content;
  }

  return (
    <div className="used-ability-editor__row">
      <span className="summary-label">{label}</span>
      {content}
    </div>
  );
}

function InvestigatorObservedResultEditor(props: {
  title: string;
  roles: RoleOption[];
  value: {
    role: AbilityRoleReference;
    class: ObservedPlayerClass;
  };
  onChange: (value: {
    role: AbilityRoleReference;
    class: ObservedPlayerClass;
  }) => void;
}) {
  const { title, roles, value, onChange } = props;

  return (
    <div className="investigator-identity-card">
      <div className="investigator-identity-card__title">{title}</div>

      <div className="investigator-identity-card__field">
        <span className="summary-label">Role</span>
        <AbilityRoleValuePicker
          inline
          label="Role"
          roles={roles}
          value={value.role}
          allowUnknown
          onPick={(role) => onChange({ ...value, role })}
        />
      </div>

      <div className="investigator-identity-card__field">
        <span className="summary-label">Class</span>
        <ObservedClassValuePicker
          inline
          label="Class"
          value={value.class}
          onPick={(playerClass) => onChange({ ...value, class: playerClass })}
        />
      </div>
    </div>
  );
}

function ObservedClassValuePicker(props: {
  label: string;
  value: ObservedPlayerClass;
  onPick: (value: ObservedPlayerClass) => void;
  inline?: boolean;
}) {
  const { label, value, onPick, inline = false } = props;

  const content = (
    <div className={`quick-action-types${inline ? " observed-class-grid" : ""}`}>
      {OBSERVED_CLASS_OPTIONS.map((option) => (
        <button
          key={option}
          type="button"
          className={`toolbar-button${
            option !== ABILITY_UNKNOWN_VALUE
              ? ` ${getClassToneClass(option)}`
              : ""
          }${value === option ? " is-active" : ""}`}
          onClick={() => onPick(option)}
        >
          {option === ABILITY_UNKNOWN_VALUE ? "Unknown" : option}
        </button>
      ))}
    </div>
  );

  if (inline) {
    return content;
  }

  return (
    <div className="used-ability-editor__row used-ability-editor__row--wide">
      <span className="summary-label">{label}</span>
      {content}
    </div>
  );
}

function AbilityChoiceButtons(props: {
  label: string;
  options: Array<{ value: string; label: string }>;
  value: string;
  onPick: (value: string) => void;
}) {
  const { label, options, value, onPick } = props;

  return (
    <div className="used-ability-editor__row used-ability-editor__row--wide">
      <span className="summary-label">{label}</span>
      <div className="quick-action-types">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`toolbar-button${value === option.value ? " is-active" : ""}`}
            onClick={() => onPick(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function LookoutVisitorListEditor(props: {
  players: Player[];
  values: AbilityPlayerReference[];
  onChange: (values: AbilityPlayerReference[]) => void;
}) {
  const { players, values, onChange } = props;

  return (
    <div className="used-ability-editor__row used-ability-editor__row--wide">
      <div className="used-ability-editor__subhead">
        <span className="summary-label">Seen visitors</span>
        <button
          type="button"
          className="row-icon-button row-icon-button--add"
          aria-label="Add seen visitor"
          title="Add seen visitor"
          onClick={() => onChange([...values, ABILITY_UNKNOWN_VALUE])}
        >
          +
        </button>
      </div>

      <div className="used-ability-visitors">
        {values.length === 0 ? (
          <div className="empty-inline">No visitors added.</div>
        ) : (
          values.map((value, index) => (
            <div key={`${value}-${index}`} className="used-ability-visitor-row">
              <AbilityPlayerValuePicker
                label={`Visitor ${index + 1}`}
                players={players}
                value={value}
                allowUnknown
                onPick={(nextValue) =>
                  onChange(
                    values.map((entry, entryIndex) =>
                      entryIndex === index
                        ? (nextValue as AbilityPlayerReference)
                        : entry
                    )
                  )
                }
              />

              <button
                type="button"
                className="row-icon-button row-icon-button--danger"
                aria-label="Remove visitor"
                title="Remove visitor"
                onClick={() =>
                  onChange(values.filter((_, entryIndex) => entryIndex !== index))
                }
              >
                <TrashIcon />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ClassPicker(props: {
  player: Player;
  compact?: boolean;
  symbolOnly?: boolean;
  onAssignClass: (assignedClass: PlayerClass | null) => void;
  onFocus?: () => void;
}) {
  const { player, compact = false, symbolOnly = false, onAssignClass, onFocus } = props;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const effectiveRoleId = getClassRoleId(player.primaryRole, player.secondaryRole);
  const allowedClasses = getAllowedClassesForRole(effectiveRoleId);
  const forcedClass = getForcedClassForRole(effectiveRoleId);
  const classLockedByRole = isClassLockedByRole(effectiveRoleId);
  const currentClass = forcedClass ?? player.assignedClass;
  const currentClassLabel = formatPlayerClassLabel(currentClass);
  const { menuStyle, openUpward } = useFloatingPicker(
    rootRef,
    open,
    () => setOpen(false),
    compact ? 188 : 220,
    compact ? 146 : 164,
    [allowedClasses.length, classLockedByRole ? 1 : 0]
  );

  useEffect(() => {
    if (classLockedByRole) {
      setOpen(false);
    }
  }, [classLockedByRole]);

  return (
    <div
      ref={rootRef}
      className={`class-picker${compact ? " is-compact" : ""}${
        classLockedByRole ? " is-locked" : ""
      }`}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className={`class-picker__trigger${
          currentClass ? ` ${getClassToneClass(currentClass)}` : ""
        }`}
        aria-expanded={classLockedByRole ? false : open}
        disabled={classLockedByRole}
        title={
          symbolOnly
            ? currentClassLabel ?? "Unknown"
            : classLockedByRole
              ? `Forced by role: ${currentClassLabel ?? "Unknown"}`
              : undefined
        }
        onClick={() => {
          onFocus?.();
          if (classLockedByRole) {
            return;
          }

          setOpen((current) => !current);
        }}
      >
        <span
          className={`class-picker__value${symbolOnly ? " class-picker__value--symbol" : ""}`}
        >
          {symbolOnly ? (
            currentClass ? (
              <span
                className={`class-picker__dot ${getClassToneClass(currentClass)}`}
                aria-hidden="true"
              />
            ) : (
              "?"
            )
          ) : (
            currentClassLabel ?? "?"
          )}
        </span>
        {classLockedByRole && !symbolOnly ? (
          <span className="class-picker__badge">Role</span>
        ) : null}
      </button>

      {open ? (
        <div
          className={`role-dropdown__menu class-picker__menu${
            openUpward ? " is-upward" : ""
          }`}
          style={menuStyle}
        >
          <div className="role-dropdown__section">
            <div className="role-dropdown__title">Class</div>
            <div className="class-picker__options">
              <button
                type="button"
                className={`class-option class-option--unknown${
                  currentClass == null ? " is-active" : ""
                }`}
                onClick={() => {
                  onFocus?.();
                  onAssignClass(null);
                  setOpen(false);
                }}
              >
                ?
              </button>

              {allowedClasses.map((playerClass) => (
                <button
                  key={playerClass}
                  type="button"
                  className={`class-option ${getClassToneClass(playerClass)}${
                    currentClass === playerClass ? " is-active" : ""
                  }`}
                  onClick={() => {
                    onFocus?.();
                    onAssignClass(playerClass);
                    setOpen(false);
                  }}
                >
                  {formatPlayerClassLabel(playerClass) ?? playerClass}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function RoleDropdown(props: {
  roles: RoleOption[];
  primaryRole?: string;
  secondaryRole?: string;
  compact?: boolean;
  iconOnly?: boolean;
  onAssignRole: (slot: RoleAssignmentSlot, roleId?: string) => void;
  onFocus?: () => void;
}) {
  const {
    roles,
    primaryRole,
    secondaryRole,
    compact = false,
    iconOnly = false,
    onAssignRole,
    onFocus
  } = props;
  const primaryRoleOption = getRoleById(primaryRole, roles);
  const hasMadRole = roles.some((role) => role.id === MAD_ROLE_ID);
  const canPickSecondary = primaryRole === MAD_ROLE_ID && hasMadRole;
  const pretendingRoles = roles.filter(
    (role) =>
      role.id !== MAD_ROLE_ID && getAllowedClassesForRole(role.id).includes("Innocent")
  );

  return (
    <div className={`role-dropdown${compact ? " is-compact" : ""}`} onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        className={`role-dropdown__trigger${iconOnly ? " is-icon-only" : ""}`}
        title={getRoleSelectionText(primaryRole, secondaryRole)}
        onClick={async () => {
          onFocus?.();
          const response = await requestRoleSelection({
            title: "Select Role",
            roles,
            value: primaryRole,
            allowClear: true,
            clearLabel: "?"
          });
          if (response.status === "picked") {
            onAssignRole("primary", response.roleId);
          }
        }}
      >
        <span className="role-trigger__icon">
          {primaryRoleOption ? (
            <img
              className={`role-trigger__image ${getClassToneClass(getForcedClassForRole(primaryRole) ?? "Neutral")}`}
              src={primaryRoleOption.imageSrc}
              alt=""
            />
          ) : (
            <span className="role-trigger__fallback">?</span>
          )}
        </span>
        {!iconOnly ? (
          <span className="role-trigger__label">
            {getRoleSelectionText(primaryRole, secondaryRole)}
          </span>
        ) : null}
      </button>

      {canPickSecondary && !iconOnly ? (
        <button
          type="button"
          className="role-dropdown__secondary-trigger"
          onClick={async () => {
            onFocus?.();
            const response = await requestRoleSelection({
              title: "Select Pretending Role",
              roles: pretendingRoles,
              value: secondaryRole,
              allowClear: true,
              clearLabel: "None"
            });
            if (response.status === "picked") {
              onAssignRole("secondary", response.roleId);
            }
          }}
        >
          <span className="role-dropdown__secondary-label">Pretending</span>
          <span className="role-dropdown__secondary-value">
            {secondaryRole ?? "None"}
          </span>
        </button>
      ) : null}
    </div>
  );
}

export function SingleRoleDropdown(props: {
  roles: RoleOption[];
  value?: string;
  compact?: boolean;
  iconOnly?: boolean;
  allowClear?: boolean;
  clearLabel?: string;
  emptyLabel?: string;
  panelTitle?: string;
  sectionTitle?: string;
  onPick: (roleId?: string) => void;
  onFocus?: () => void;
}) {
  const {
    roles,
    value,
    compact = false,
    iconOnly = false,
    allowClear = true,
    clearLabel = "Unknown",
    emptyLabel = "Unknown",
    panelTitle = "Select Role",
    sectionTitle = "Role",
    onPick,
    onFocus
  } = props;
  const selectedRoleOption = getRoleById(value, roles);
  const selectionText = value || emptyLabel;

  return (
    <div className={`role-dropdown${compact ? " is-compact" : ""}`} onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        className={`role-dropdown__trigger${iconOnly ? " is-icon-only" : ""}`}
        title={selectionText}
        onClick={async () => {
          onFocus?.();
          const response = await requestRoleSelection({
            title: panelTitle,
            roles,
            value,
            allowClear,
            clearLabel
          });
          if (response.status === "picked") {
            onPick(response.roleId);
          }
        }}
      >
        <span className="role-trigger__icon">
          {selectedRoleOption ? (
            <img
              className={`role-trigger__image ${getClassToneClass(getForcedClassForRole(value) ?? "Neutral")}`}
              src={selectedRoleOption.imageSrc}
              alt=""
            />
          ) : (
            <span className="role-trigger__fallback">?</span>
          )}
        </span>
        {!iconOnly ? (
          <span className="role-trigger__label">{selectionText}</span>
        ) : null}
      </button>
    </div>
  );
}

function RoleSelectionSection(props: {
  title: string;
  roles: RoleOption[];
  value?: string;
  allowClear: boolean;
  clearLabel: string;
  onPick: (roleId?: string) => void;
}) {
  const { title, roles, value, allowClear, clearLabel, onPick } = props;
  const [previewRoleId, setPreviewRoleId] = useState<string | undefined>(value);
  const [search, setSearch] = useState("");
  const [sideFilter, setSideFilter] = useState<RoleSideFilter>("all");
  const previewRole = getRoleById(previewRoleId ?? value, roles);
  const filteredRoles = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const nextRoles = roles.filter((role) => {
      if (!matchesRoleSideFilter(role, sideFilter)) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const haystack = [
        role.id,
        role.side,
        role.pickerSummary,
        role.summary,
        role.visitBehavior,
        role.keyEvidence,
        role.limitsOrCaveats
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });

    return nextRoles.sort((left, right) => {
      const leftSelected = left.id === value ? 1 : 0;
      const rightSelected = right.id === value ? 1 : 0;
      if (leftSelected !== rightSelected) {
        return rightSelected - leftSelected;
      }

      return left.id.localeCompare(right.id);
    });
  }, [roles, search, sideFilter, value]);

  useEffect(() => {
    setPreviewRoleId(value);
  }, [value, roles]);

  return (
    <div className="role-dropdown__section">
      <div className="role-dropdown__title">{title}</div>

      {roles.length === 0 ? (
        <div className="role-dropdown__empty">No role images found.</div>
      ) : (
        <div className="role-dropdown__content">
          <div className="role-dropdown__selection">
            <div className="role-toolbar">
              <input
                type="text"
                className="role-search-input"
                value={search}
                placeholder="Search role, clue, caveat..."
                onChange={(event) => setSearch(event.target.value)}
              />
              <div className="role-filter-segmented" role="group" aria-label="Filter roles by side">
                {ROLE_SIDE_FILTERS.map((filter) => (
                  <button
                    key={filter.id}
                    type="button"
                    className={`role-filter-segment${sideFilter === filter.id ? " is-active" : ""}`}
                    onClick={() => setSideFilter(filter.id)}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
              <div className="role-toolbar__meta">
                {filteredRoles.length} / {roles.length}
              </div>
            </div>

            <div className="role-grid-scroll">
              <div className="role-grid">
                {allowClear ? (
                  <button
                    type="button"
                    className={`role-option role-option--clear${
                      !value ? " is-active" : ""
                    }`}
                    onMouseEnter={() => setPreviewRoleId(undefined)}
                    onFocus={() => setPreviewRoleId(undefined)}
                    onClick={() => onPick(undefined)}
                  >
                    <span className="role-option__icon role-option__icon--empty">?</span>
                    <span className="role-option__name">{clearLabel}</span>
                    <span className="role-option__summary">Clear the current role choice.</span>
                  </button>
                ) : null}

                {filteredRoles.map((role) => (
                  <button
                    key={role.id}
                    type="button"
                    className={`role-option${role.id === value ? " is-active" : ""}`}
                    onMouseEnter={() => setPreviewRoleId(role.id)}
                    onFocus={() => setPreviewRoleId(role.id)}
                    onClick={() => onPick(role.id)}
                    title={role.id}
                  >
                    <div className="role-option__top">
                      <img
                        className={`role-option__image ${getClassToneClass(getForcedClassForRole(role.id) ?? "Neutral")}`}
                        src={role.imageSrc}
                        alt=""
                      />
                      {role.side ? (
                        <span className={`role-option__badge ${getRoleSideToneClass(role)}`}>
                          {getShortRoleSideLabel(role)}
                        </span>
                      ) : null}
                    </div>
                    <span className="role-option__name">{role.id}</span>
                    <span className="role-option__summary">
                      {role.pickerSummary ?? "No summary available."}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {filteredRoles.length === 0 ? (
              <div className="role-dropdown__empty role-dropdown__empty--boxed">
                No roles match the current search or filter.
              </div>
            ) : null}
          </div>

          <RoleReferencePanel role={previewRole} clearLabel={clearLabel} />
        </div>
      )}
    </div>
  );
}

function RoleReferencePanel(props: {
  role?: RoleOption;
  clearLabel: string;
}) {
  const { role, clearLabel } = props;

  if (!role) {
    return (
      <aside className="role-reference role-reference--empty">
        <div className="role-reference__eyebrow">Reference</div>
        <div className="role-reference__title">{clearLabel}</div>
        <div className="role-reference__summary">
          Remove the assigned role or leave it unknown.
        </div>
      </aside>
    );
  }

  return (
    <aside className="role-reference">
      <div className="role-reference__header">
        <span className="role-reference__icon">
          <img
            className={`role-reference__image ${getClassToneClass(getForcedClassForRole(role.id) ?? "Neutral")}`}
            src={role.imageSrc}
            alt=""
          />
        </span>
        <div className="role-reference__header-text">
          <div className="role-reference__title-row">
            <div className="role-reference__title">{role.id}</div>
            {role.side ? <span className="role-reference__badge">{role.side}</span> : null}
          </div>
          <div className="role-reference__summary">
            {role.summary ?? role.pickerSummary ?? "No description available."}
          </div>
        </div>
      </div>

      <RoleReferenceField label="Visit" value={role.visitBehavior} />
      <RoleReferenceField label="Evidence" value={role.keyEvidence} />
      <RoleReferenceField label="Caveats" value={role.limitsOrCaveats} />
    </aside>
  );
}

function RoleReferenceField(props: {
  label: string;
  value?: string;
}) {
  const { label, value } = props;
  if (!value) {
    return null;
  }

  return (
    <div className="role-reference__field">
      <div className="role-reference__label">{label}</div>
      <div className="role-reference__value">{value}</div>
    </div>
  );
}

type RoleSideFilter = "all" | "innocent" | "imposter" | "neutral" | "mixed";

const ROLE_SIDE_FILTERS: { id: RoleSideFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "innocent", label: "Innocent" },
  { id: "imposter", label: "Imposter" },
  { id: "neutral", label: "Neutral" },
  { id: "mixed", label: "Mixed" }
];

function matchesRoleSideFilter(role: RoleOption, filter: RoleSideFilter) {
  if (filter === "all") {
    return true;
  }

  if (!role.side) {
    return false;
  }

  const normalized = role.side.toLowerCase();
  if (filter === "mixed") {
    return normalized.includes("or");
  }

  return normalized.includes(filter);
}

function getShortRoleSideLabel(role: RoleOption) {
  switch (role.side) {
    case "Innocent":
      return "Town";
    case "Imposter":
      return "Imp";
    case "Neutral":
      return "Neu";
    case "Innocent or Imposter":
      return "Mix";
    default:
      return role.side ?? "";
  }
}

function getRoleSideToneClass(role: RoleOption) {
  switch (role.side) {
    case "Innocent":
      return "is-innocent";
    case "Imposter":
      return "is-killer";
    case "Neutral":
      return "is-neutral";
    default:
      return "";
  }
}

function SuspicionToggle(props: {
  active: boolean;
  onToggle: () => void;
  onSelect?: () => void;
}) {
  const { active, onToggle, onSelect } = props;
  return (
    <button
      type="button"
      className={`suspicion-toggle${active ? " is-active" : ""}`}
      onClick={(event) => {
        event.stopPropagation();
        onSelect?.();
        onToggle();
      }}
    >
      !
    </button>
  );
}

function AliveToggleLegacy(props: {
  alive: boolean;
  onToggle: () => void;
  onSelect?: () => void;
}) {
  const { alive, onToggle, onSelect } = props;
  return (
    <button
      type="button"
      className={`alive-toggle${alive ? " is-alive" : " is-dead"}`}
      onClick={(event) => {
        event.stopPropagation();
        onSelect?.();
        onToggle();
      }}
      aria-label={alive ? "Mark dead" : "Mark alive"}
    >
      {alive ? "·" : "☠"}
    </button>
  );
}

function AliveToggle(props: {
  alive: boolean;
  onToggle: () => void;
  onSelect?: () => void;
}) {
  const { alive, onToggle, onSelect } = props;
  return (
    <button
      type="button"
      className={`alive-toggle${alive ? " is-alive" : " is-dead"}`}
      onClick={(event) => {
        event.stopPropagation();
        onSelect?.();
        onToggle();
      }}
      aria-label={alive ? "Mark dead" : "Mark alive"}
    >
      {alive ? (
        <svg
          className="alive-toggle__icon"
          viewBox="0 0 16 16"
          aria-hidden="true"
          focusable="false"
        >
          <path
            d="M8 13.2 3.2 8.7A3 3 0 1 1 7.4 4.5L8 5.1l.6-.6a3 3 0 1 1 4.2 4.2Z"
            fill="currentColor"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1"
          />
        </svg>
      ) : (
        "☠"
      )}
    </button>
  );
}

function InlineNoteInput(props: {
  value: string;
  placeholder: string;
  onCommit: (content: string) => void;
  onSelect?: () => void;
}) {
  const { value, placeholder, onCommit, onSelect } = props;
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  return (
    <input
      type="text"
      className="inline-note-input"
      value={draft}
      placeholder={placeholder}
      onClick={(event) => event.stopPropagation()}
      onFocus={() => onSelect?.()}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft !== value) {
          onCommit(draft.trim());
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          if (draft !== value) {
            onCommit(draft.trim());
          }
          event.currentTarget.blur();
        }

        if (event.key === "Escape") {
          setDraft(value);
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function VisitMap(props: {
  visitEvidence: VisitEvidence[];
  players: Player[];
  roles: RoleOption[];
  selectedTimelineStep: TimelineStep;
  selectedTimelineStepLabel: string;
  timelineViewMode: "focus" | "full";
  timelineSteps: TimelineStep[];
  onSetTimelineViewMode: (mode: "focus" | "full") => void;
}) {
  const {
    visitEvidence,
    players,
    roles,
    selectedTimelineStep,
    selectedTimelineStepLabel,
    timelineViewMode,
    timelineSteps,
    onSetTimelineViewMode
  } = props;
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string>();
  const [hoveredEndpointKey, setHoveredEndpointKey] = useState<string>();
  const timelineScopeLabel =
    timelineViewMode === "full" ? "All Nights" : selectedTimelineStepLabel;
  const mapEntries = useMemo(
    () => deriveVisitMapEntries({ players, visitEvidence }),
    [players, visitEvidence]
  );

  const visitGroups = useMemo(
    () =>
      (timelineViewMode === "full"
        ? timelineSteps
        : timelineSteps.filter((step) => isSameTimelineStep(step, selectedTimelineStep))
      ).map((step) => ({
        step,
        items: mapEntries.filter(
          (entry) =>
            entry.nightNumber === step.index &&
            Boolean(
              (entry.sourcePlayerId || entry.sourceRole) &&
                (entry.targetPlayerId || entry.targetRole)
            )
        )
      })),
    [mapEntries, selectedTimelineStep, timelineSteps, timelineViewMode]
  );

  return (
    <div className="visit-map">
      <div className="visit-map__toolbar">
        <div className="visit-map__toolbar-meta">
          <span className="summary-label">Timeline</span>
          <span className="visit-map__mode">{timelineScopeLabel}</span>
        </div>
        <TimelineViewModeToggle
          mode={timelineViewMode}
          onChange={onSetTimelineViewMode}
        />
      </div>

      {timelineViewMode === "focus" && visitGroups.every((group) => group.items.length === 0) ? (
        <div className="empty-inline">No visit evidence for {selectedTimelineStepLabel}.</div>
      ) : (
        <div className="visit-map__list visit-map__list--timeline">
          {visitGroups.map((group) => {
            const isSelectedGroup = isSameTimelineStep(group.step, selectedTimelineStep);

            return (
              <TimelineGroup
                key={getTimelineStepKey(group.step)}
                label={getLabelForTimelineStep(group.step)}
                active={isSelectedGroup}
                className={timelineViewMode === "full" ? "timeline-group--full" : undefined}
                emptyState={<div className="timeline-log-group__summary">No visits.</div>}
              >
                {group.items.length > 0
                  ? group.items.map((entry) => {
            const sourceEndpointKey = getVisitEndpointKey(
              entry.sourcePlayerId ?? undefined,
              entry.sourceRole ?? undefined
            );
            const targetEndpointKey = getVisitEndpointKey(
              entry.targetPlayerId ?? undefined,
              entry.targetRole ?? undefined
            );
            const isHighlighted =
              hoveredEdgeId === entry.id ||
              hoveredEndpointKey === sourceEndpointKey ||
              hoveredEndpointKey === targetEndpointKey;

            return (
                <div
                  key={entry.id}
                  className={`visit-map__item${entry.ignored ? " is-ignored" : ""}${
                    isHighlighted ? " is-highlighted" : ""
                  }${
                    isSelectedGroup ? " is-current-step" : ""
                  }`}
                  title={getVisitMapEvidenceHint(entry, players)}
                  onMouseEnter={() => setHoveredEdgeId(entry.id)}
                  onMouseLeave={() => setHoveredEdgeId(undefined)}
              >
                <div className="visit-map__edge">
                  <VisitMapEndpoint
                    playerId={entry.sourcePlayerId ?? undefined}
                    roleId={entry.sourceRole ?? undefined}
                    players={players}
                    roles={roles}
                    fallbackLabel="?"
                    highlighted={isHighlighted}
                    onHover={setHoveredEndpointKey}
                  />

                  <span className="visit-map__connector" aria-hidden="true">
                    <span className="visit-map__connector-line" />
                    <span className="visit-map__connector-arrow">▶</span>
                  </span>

                  <VisitMapEndpoint
                    playerId={entry.targetPlayerId ?? undefined}
                    roleId={entry.targetRole ?? undefined}
                    players={players}
                    roles={roles}
                    fallbackLabel="?"
                    highlighted={isHighlighted}
                    onHover={setHoveredEndpointKey}
                  />
                </div>
                {entry.reportCount > 1 ? (
                  <div className="visit-map__details">
                    <span className="visit-map__count">{entry.reportCount} reports</span>
                  </div>
                ) : null}
              </div>
            );
                    })
                  : undefined}
              </TimelineGroup>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TimelineViewModeToggle(props: {
  mode: "focus" | "full";
  onChange: (mode: "focus" | "full") => void;
}) {
  const { mode, onChange } = props;

  return (
    <div className="timeline-view-toggle" role="group" aria-label="Timeline scope">
      <button
        type="button"
        className={`toolbar-button${mode === "focus" ? " is-active" : ""}`}
        onClick={() => onChange("focus")}
      >
        One Night
      </button>
      <button
        type="button"
        className={`toolbar-button${mode === "full" ? " is-active" : ""}`}
        onClick={() => onChange("full")}
      >
        All Nights
      </button>
    </div>
  );
}

function VisitMapEndpoint(props: {
  playerId?: string;
  roleId?: string;
  players: Player[];
  roles: RoleOption[];
  fallbackLabel: string;
  highlighted?: boolean;
  onHover?: (key?: string) => void;
}) {
  const { playerId, roleId, players, roles, fallbackLabel, highlighted = false, onHover } =
    props;
  const endpointKey = getVisitEndpointKey(playerId, roleId);
  const playerLabel = playerId ? getPlayerLabel(playerId, players) : "";
  const combinedLabel =
    playerLabel && roleId
      ? `${playerLabel} (${roleId})`
      : roleId || playerLabel || fallbackLabel;

  if (roleId || playerId) {
    const role = getRoleById(roleId, roles);
    const roleClass = getForcedClassForRole(roleId);

    return (      <span
        className={`visit-map__endpoint ${
          roleId ? "visit-map__endpoint--role" : "visit-map__endpoint--player"
        }${
          highlighted ? " is-highlighted" : ""
        }`}
        onMouseEnter={() => onHover?.(endpointKey)}
        onMouseLeave={() => onHover?.(undefined)}
      >
        {roleId ? (
          <span className="visit-map__endpoint-icon">
            {role?.imageSrc ? (
              <img
                className={roleClass ? getClassToneClass(roleClass) : ""}
                src={role.imageSrc}
                alt=""
              />
            ) : (
              <span className="visit-map__endpoint-fallback">?</span>
            )}
          </span>
        ) : null}
        <span className="visit-map__endpoint-label">{combinedLabel}</span>
      </span>
    );
  }

  return (
    <span className="visit-map__endpoint visit-map__endpoint--unknown">
      <span className="visit-map__endpoint-label">{fallbackLabel}</span>
    </span>
  );
}

function NightActionList(props: {
  actions: NightAction[];
  players: Player[];
  roles: RoleOption[];
  selectedPlayer: Player;
  selectedTimelineStep: TimelineStep;
  selectedTimelineStepLabel: string;
  timelineViewMode: "focus" | "full";
  timelineSteps: TimelineStep[];
  onUpdateAction: (
    actionId: string,
    actorId: string,
    actionType: string,
    targetId?: string
  ) => void;
  onRemoveAction: (actionId: string) => void;
}) {
  const {
    actions,
    players,
    roles,
    selectedPlayer,
    selectedTimelineStep,
    selectedTimelineStepLabel,
    timelineViewMode,
    timelineSteps,
    onUpdateAction,
    onRemoveAction
  } = props;
  const [editingActionId, setEditingActionId] = useState<string>();
  const [editingMode, setEditingMode] = useState<ActionMode | null>(null);
  const groupedActions = useMemo(
    () => {
      const grouped = new Map(
        groupItemsByTimelineStep(actions, getTimelineStepFromAction).map((group) => [
          getTimelineStepKey(group.step),
          group.items
        ])
      );
      const sourceSteps =
        timelineViewMode === "full"
          ? timelineSteps
          : timelineSteps.filter((step) => isSameTimelineStep(step, selectedTimelineStep));

      return sourceSteps.map((step) => ({
        step,
        items: grouped.get(getTimelineStepKey(step)) ?? []
      }));
    },
    [actions, selectedTimelineStep, timelineSteps, timelineViewMode]
  );

  useEffect(() => {
    setEditingActionId(undefined);
    setEditingMode(null);
  }, [selectedPlayer.id, selectedTimelineStep.index, selectedTimelineStep.phase]);

  useEffect(() => {
    if (!editingActionId) {
      return;
    }

    const action = actions.find((entry) => entry.id === editingActionId);
    if (!action) {
      setEditingActionId(undefined);
      setEditingMode(null);
    }
  }, [actions, editingActionId]);

  if (actions.length === 0) {
    return null;
  }

  const finishEditing = () => {
    setEditingActionId(undefined);
    setEditingMode(null);
  };

  return (
    <div className="action-list action-list--timeline">
      {groupedActions.map((group) => {
        const isSelectedGroup = isSameTimelineStep(group.step, selectedTimelineStep);
        const label = getLabelForTimelineStep(group.step);

        return (
          <TimelineGroup
            key={getTimelineStepKey(group.step)}
            label={label}
            active={isSelectedGroup}
            className={timelineViewMode === "full" ? "timeline-group--full" : undefined}
            emptyState={
              <div className="timeline-log-group__summary">
                {timelineViewMode === "focus"
                  ? `No night actions for ${selectedTimelineStepLabel}.`
                  : "No night actions logged."}
              </div>
            }
          >
            {group.items.length > 0 ? (
              <>
                {timelineViewMode === "full" ? (
                  <div className="timeline-group__meta">{group.items.length}</div>
                ) : null}
                {group.items.map((action) => {
                const isOutgoing = action.actorId === selectedPlayer.id;
                const counterpartId = isOutgoing ? action.targetId : action.actorId;
                const isEditing = editingActionId === action.id;
                const showsCounterpart = action.actionType !== "Stayed Home";

                return (
                  <div key={action.id} className="action-item">
                    <div className="action-item__header">
                      <div className="action-item__main">
                        <strong>{getActionLabel(action, selectedPlayer)}</strong>
                        {showsCounterpart ? (
                          <span>{formatActionCounterpart(counterpartId, players)}</span>
                        ) : null}
                      </div>

                      <div className="action-item__controls">
                        <button
                          type="button"
                          className={`toolbar-button${isEditing ? " is-active" : ""}`}
                          onClick={() => {
                            if (isEditing) {
                              finishEditing();
                              return;
                            }

                            setEditingActionId(action.id);
                            setEditingMode(
                              action.actionType === "Stayed Home"
                                ? null
                                : getActionMode(action, selectedPlayer)
                            );
                          }}
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          className="row-icon-button row-icon-button--danger"
                          aria-label="Remove hard claim"
                          title="Remove hard claim"
                          onClick={() => {
                            onRemoveAction(action.id);
                            if (isEditing) {
                              finishEditing();
                            }
                          }}
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </div>

                    <div className="action-item__meta">
                      Created {formatPhaseLabel(action.phase, action.round)}
                    </div>

                    {isEditing ? (
                      <div className="action-item__editor">
                        <ActionSelectionEditor
                          mode={editingMode}
                          onModeChange={setEditingMode}
                          players={players.filter((entry) => entry.id !== selectedPlayer.id)}
                          roles={roles}
                          onPickStayedHome={() => {
                            onUpdateAction(
                              action.id,
                              selectedPlayer.id,
                              "Stayed Home"
                            );
                            finishEditing();
                          }}
                          onPickUnknown={() => {
                            if (editingMode === "visited_player") {
                              onUpdateAction(
                                action.id,
                                selectedPlayer.id,
                                "Visited",
                                UNKNOWN_PARTICIPANT_ID
                              );
                            } else {
                              onUpdateAction(
                                action.id,
                                UNKNOWN_PARTICIPANT_ID,
                                "Visited",
                                selectedPlayer.id
                              );
                            }
                            finishEditing();
                          }}
                          onPickPlayer={(playerId) => {
                            if (editingMode === "visited_player") {
                              onUpdateAction(
                                action.id,
                                selectedPlayer.id,
                                "Visited",
                                playerId
                              );
                            } else {
                              onUpdateAction(
                                action.id,
                                playerId,
                                "Visited",
                                selectedPlayer.id
                              );
                            }
                            finishEditing();
                          }}
                          onPickRole={(roleId) => {
                            if (editingMode === "visited_player") {
                              onUpdateAction(
                                action.id,
                                selectedPlayer.id,
                                "Visited",
                                toRoleReference(roleId)
                              );
                            } else {
                              onUpdateAction(
                                action.id,
                                toRoleReference(roleId),
                                "Visited",
                                selectedPlayer.id
                              );
                            }
                            finishEditing();
                          }}
                          onCancel={finishEditing}
                        />
                      </div>
                    ) : null}
                  </div>
                );
                })}
              </>
            ) : undefined}
          </TimelineGroup>
        );
      })}
    </div>
  );
}

function NightActionComposer(props: {
  player: Player;
  players: Player[];
  roles: RoleOption[];
  onAddAction: (actorId: string, actionType: string, targetId?: string) => void;
}) {
  const { player, players, roles, onAddAction } = props;
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"visited_player" | "visited_by_player" | null>(
    null
  );
  const selectablePlayers = players.filter((entry) => entry.id !== player.id);

  useEffect(() => {
    setOpen(false);
    setMode(null);
  }, [player.id]);

  const resetComposer = () => {
    setOpen(false);
    setMode(null);
  };

  const handleAddUnknown = () => {
    if (mode === "visited_player") {
      onAddAction(player.id, "Visited", UNKNOWN_PARTICIPANT_ID);
      resetComposer();
      return;
    }

    if (mode === "visited_by_player") {
      onAddAction(UNKNOWN_PARTICIPANT_ID, "Visited", player.id);
      resetComposer();
    }
  };

  const handleAddPlayer = (nextValue: string) => {
    if (!nextValue) {
      return;
    }

    if (mode === "visited_player") {
      onAddAction(player.id, "Visited", nextValue);
      resetComposer();
      return;
    }

    if (mode === "visited_by_player") {
      onAddAction(nextValue, "Visited", player.id);
      resetComposer();
    }
  };

  const handleAddRole = (nextValue: string) => {
    if (!nextValue) {
      return;
    }

    if (mode === "visited_player") {
      onAddAction(player.id, "Visited", toRoleReference(nextValue));
      resetComposer();
      return;
    }

    if (mode === "visited_by_player") {
      onAddAction(toRoleReference(nextValue), "Visited", player.id);
      resetComposer();
    }
  };

  return (
    <div className="night-action-composer">
      <div className="night-action-toolbar">
        <button
          type="button"
          className="row-icon-button row-icon-button--add"
          aria-label="Add night action"
          title="Add night action"
          onClick={() => {
            if (open) {
              resetComposer();
              return;
            }

            setOpen(true);
            setMode(null);
          }}
        >
          {open ? "x" : "+"}
        </button>
      </div>

      {open ? (
        <ActionSelectionEditor
          mode={mode}
          onModeChange={setMode}
          players={selectablePlayers}
          roles={roles}
          onPickStayedHome={() => {
            onAddAction(player.id, "Stayed Home");
            resetComposer();
          }}
          onPickUnknown={handleAddUnknown}
          onPickPlayer={handleAddPlayer}
          onPickRole={handleAddRole}
        />
      ) : null}
    </div>
  );
}

function ActionSelectionEditor(props: {
  mode: ActionMode | null;
  onModeChange: (mode: ActionMode) => void;
  players: Player[];
  roles: RoleOption[];
  onPickStayedHome: () => void;
  onPickUnknown: () => void;
  onPickPlayer: (playerId: string) => void;
  onPickRole: (roleId: string) => void;
  onCancel?: () => void;
}) {
  const {
    mode,
    onModeChange,
    players,
    roles,
    onPickStayedHome,
    onPickUnknown,
    onPickPlayer,
    onPickRole,
    onCancel
  } = props;

  return (
    <div className="quick-actions">
      <div className="quick-action-types">
        <button
          type="button"
          className={`toolbar-button${
            mode === "visited_player" ? " is-active" : ""
          }`}
          onClick={() => onModeChange("visited_player")}
        >
          Visited player
        </button>

        <button
          type="button"
          className={`toolbar-button${
            mode === "visited_by_player" ? " is-active" : ""
          }`}
          onClick={() => onModeChange("visited_by_player")}
        >
          Visited by player
        </button>

        <button
          type="button"
          className="toolbar-button"
          onClick={onPickStayedHome}
        >
          Stayed Home
        </button>

        {onCancel ? (
          <button
            type="button"
            className="toolbar-button"
            onClick={onCancel}
          >
            Cancel
          </button>
        ) : null}
      </div>

      {mode ? (
        <div className="quick-action-row">
          <span className="quick-action-label">
            {mode === "visited_player" ? "Visited player" : "Visited by player"}
          </span>

          <button
            type="button"
            className="toolbar-button"
            onClick={onPickUnknown}
          >
            ?
          </button>

          <ActionPlayerPicker
            players={players}
            onPick={onPickPlayer}
          />

          <ActionRolePicker
            roles={roles}
            onPick={onPickRole}
          />
        </div>
      ) : null}
    </div>
  );
}

function ActionPlayerPicker(props: {
  players: Player[];
  onPick: (playerId: string) => void;
}) {
  const { players, onPick } = props;
  const [open, setOpen] = useState(false);
  useClosePickerOnWindowBlur(open, () => setOpen(false));

  return (
    <div
      className={`quick-picker${open ? " is-open" : ""}`}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="role-dropdown__trigger quick-picker__trigger"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="quick-picker__text">Player...</span>
      </button>

      {open ? (
        <div
          className="role-dropdown__overlay"
          onClick={() => setOpen(false)}
        >
          <div
            className="role-dropdown__panel quick-picker__panel"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="role-dropdown__panel-header">
              <div className="role-dropdown__panel-title">Select Player</div>
              <button
                type="button"
                className="panel-header__button panel-header__button--icon"
                aria-label="Close player selector"
                title="Close player selector"
                onClick={() => setOpen(false)}
              >
                x
              </button>
            </div>

            <div className="role-dropdown__section">
              {players.length === 0 ? (
                <div className="quick-picker__empty">No other players.</div>
              ) : (
                <div className="quick-picker__list">
                  {players.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      className="quick-picker__item"
                      onClick={() => {
                        onPick(entry.id);
                        setOpen(false);
                      }}
                    >
                      <span className="quick-picker__item-name">
                        {entry.name || `Player #${entry.seat}`}
                      </span>
                      <span className="quick-picker__item-meta">#{entry.seat}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ActionRolePicker(props: {
  roles: RoleOption[];
  onPick: (roleId: string) => void;
}) {
  const { roles, onPick } = props;

  return (
    <div className="quick-picker" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        className="role-dropdown__trigger quick-picker__trigger"
        onClick={async () => {
          const response = await requestRoleSelection({
            title: "Select Role",
            roles,
            allowClear: false,
            clearLabel: ""
          });
          if (response.status === "picked" && response.roleId) {
            onPick(response.roleId);
          }
        }}
      >
        <span className="role-trigger__icon">
          <span className="role-trigger__fallback">?</span>
        </span>
        <span className="role-trigger__label">Role...</span>
      </button>
    </div>
  );
}

function useFloatingPicker(
  rootRef: RefObject<HTMLDivElement | null>,
  open: boolean,
  onClose: () => void,
  preferredWidth: number,
  estimatedHeight: number,
  deps: ReadonlyArray<number>
) {
  const [openUpward, setOpenUpward] = useState(false);
  const [menuStyle, setMenuStyle] = useState<{
    left: number;
    top?: number;
    bottom?: number;
    width: number;
  }>({
    left: 0,
    top: 0,
    width: preferredWidth
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!(event.target instanceof Node)) {
        return;
      }

      if (!rootRef.current?.contains(event.target)) {
        onClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open, rootRef]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    const width = Math.min(preferredWidth, window.innerWidth - 16);
    const left = clamp(
      rect.left,
      8,
      Math.max(8, window.innerWidth - width - 8)
    );
    const shouldOpenUpward =
      window.innerHeight - rect.bottom < estimatedHeight &&
      rect.top > estimatedHeight / 2;

    setOpenUpward(shouldOpenUpward);
    setMenuStyle(
      shouldOpenUpward
        ? {
            left,
            bottom: Math.max(8, window.innerHeight - rect.top + 4),
            width
          }
        : {
            left,
            top: Math.min(window.innerHeight - 8, rect.bottom + 4),
            width
          }
    );
  }, [estimatedHeight, open, preferredWidth, rootRef, ...deps]);

  return { menuStyle, openUpward };
}

function useClosePickerOnWindowBlur(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    const handleBlur = () => {
      onClose();
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [onClose, open]);
}

function usePanelWindow(panel: PanelWindowKey) {
  const state = useOverlayState();
  const panelState = state.panels[panel];

  useEffect(() => {
    if (!isOverwolfAvailable()) {
      return;
    }

    const syncBounds = () => void syncPanelBounds(panel);
    const timer = window.setTimeout(async () => {
      const currentState = getOverlayState().panels[panel];

      if (currentState.x == null || currentState.y == null) {
        await applyDefaultPanelPosition(panel);
      } else {
        await changeDeclaredWindowPosition(
          PANEL_WINDOW_NAMES[panel],
          currentState.x,
          currentState.y
        );
      }

      await syncPanelBounds(panel);
    }, 120);

    window.addEventListener("resize", syncBounds);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", syncBounds);
    };
  }, [panel]);

  useEffect(() => {
    if (!isOverwolfAvailable() || !panelState.visible) {
      return;
    }

    const { width, height } = getPanelWindowSize(panel, panelState.collapsed);

    void changeDeclaredWindowSize(PANEL_WINDOW_NAMES[panel], width, height).then(() => {
      window.setTimeout(() => void syncPanelBounds(panel), 80);
    });
  }, [
    panelState.collapsed,
    panel,
    panelState.visible
  ]);
}

function usePanelHotkeys() {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || shouldIgnoreGlobalHotkeys(event.target)) {
        return;
      }

      if (!["1", "2", "3", "4"].includes(event.key)) {
        return;
      }

      event.preventDefault();
      const panel =
        event.key === "1"
          ? "left_panel"
          : event.key === "2"
            ? "right_panel"
            : event.key === "3"
              ? "known_roles"
              : "visit_map";
      const state = getOverlayState();
      const nextVisible = !state.panels[panel].visible;

      dispatchOverlayAction({
        type: "setPanelVisibility",
        panel,
        visible: nextVisible
      });

      if (!isOverwolfAvailable()) {
        return;
      }

      if (nextVisible) {
        void restoreDeclaredWindow(PANEL_WINDOW_NAMES[panel]).then(() => {
          void bringDeclaredWindowToFront(PANEL_WINDOW_NAMES[panel]);
        });
        return;
      }

      void hideDeclaredWindow(PANEL_WINDOW_NAMES[panel]);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}

async function syncPanelBounds(panel: PanelWindowKey) {
  if (!isOverwolfAvailable()) {
    return;
  }

  const currentWindow = await getCurrentWindowInfo();
  if (!currentWindow) {
    return;
  }

  const panelState = getOverlayState().panels[panel];
  dispatchOverlayAction({
    type: "setPanelBounds",
    panel,
    x: currentWindow.left,
    y: currentWindow.top,
    width: panelState.collapsed ? panelState.expandedWidth : currentWindow.width,
    height:
      panelState.collapsed ? panelState.expandedHeight : currentWindow.height
  });
}

function useOverlayGlassEffect() {
  const { glassOpacity, glassBlur } = useOverlayState();

  useEffect(() => {
    document.documentElement.style.setProperty("--glass-opacity", glassOpacity.toString());
    document.documentElement.style.setProperty("--glass-blur", `${glassBlur}px`);
  }, [glassOpacity, glassBlur]);
}

async function applyDefaultPanelPosition(panel: PanelWindowKey) {
  const overlayState = getOverlayState();
  const panelState = getOverlayState().panels[panel];
  const screenWidth = Math.max(
    window.screen.availWidth || 0,
    window.screen.width || 0
  );
  const screenHeight = Math.max(
    window.screen.availHeight || 0,
    window.screen.height || 0
  );
  const defaultX =
    panel === "left_panel"
      ? DEFAULT_LEFT_X
      : panel === "known_roles"
        ? DEFAULT_LEFT_X
      : panel === "visit_map"
        ? DEFAULT_LEFT_X
      : clamp(
          screenWidth - panelState.expandedWidth - WINDOW_EDGE_GAP,
          DEFAULT_LEFT_X,
          Math.max(
            DEFAULT_LEFT_X,
            screenWidth - panelState.expandedWidth - WINDOW_EDGE_GAP
          )
        );
  const defaultY = clamp(
    panel === "known_roles" ? 472 : panel === "visit_map" ? 708 : DEFAULT_Y,
    DEFAULT_Y,
    Math.max(
      DEFAULT_Y,
      screenHeight - panelState.expandedHeight - WINDOW_EDGE_GAP
    )
  );

  await changeDeclaredWindowPosition(
    PANEL_WINDOW_NAMES[panel],
    defaultX,
    defaultY
  );
}

function getPanelWindowSize(panel: PanelWindowKey, collapsed: boolean) {
  if (panel === "known_roles" && collapsed) {
    return {
      width: KNOWN_ROLES_COLLAPSED_WIDTH,
      height: KNOWN_ROLES_COLLAPSED_HEIGHT
    };
  }

  const panelState = getOverlayState().panels[panel];
  return {
    width: panelState.expandedWidth,
    height: panelState.expandedHeight
  };
}

async function syncPanelWindowState(panel: PanelWindowKey, collapsed: boolean) {
  if (!isOverwolfAvailable()) {
    return;
  }

  const { width, height } = getPanelWindowSize(panel, collapsed);
  await changeDeclaredWindowSize(PANEL_WINDOW_NAMES[panel], width, height);
  window.setTimeout(() => void syncPanelBounds(panel), 80);
}

function getQuickNote(player: Player) {
  return player.notes.find((note) => note.mode === "quick")?.content ?? "";
}

function getRoleSelectionText(primaryRole?: string, secondaryRole?: string) {
  if (!primaryRole) {
    return "?";
  }

  if (primaryRole !== MAD_ROLE_ID) {
    return primaryRole;
  }

  return secondaryRole ? `${primaryRole} + ${secondaryRole}` : primaryRole;
}

function getTimelineEvidenceForStep(
  evidenceSources: RoleInstance["evidenceSources"],
  step: TimelineStep
) {
  return evidenceSources.filter((source) =>
    isSameTimelineStep(getTimelineStepFromEvidenceSource(source), step)
  );
}

function hasTimelineEvidenceForStep(
  evidenceSources: RoleInstance["evidenceSources"],
  step: TimelineStep
) {
  return getTimelineEvidenceForStep(evidenceSources, step).length > 0;
}

function getTimelineEvidenceMatchCount(instances: RoleInstance[], step: TimelineStep) {
  return instances.filter((instance) =>
    hasTimelineEvidenceForStep(instance.evidenceSources, step)
  ).length;
}

function compareRoleInstancesForTimeline(
  left: RoleInstance,
  right: RoleInstance,
  step: TimelineStep,
  playersById: Map<string, Player>
) {
  const leftHighlighted = hasTimelineEvidenceForStep(left.evidenceSources, step);
  const rightHighlighted = hasTimelineEvidenceForStep(right.evidenceSources, step);
  if (leftHighlighted !== rightHighlighted) {
    return leftHighlighted ? -1 : 1;
  }

  const certaintyComparison =
    getRoleEvidenceStrengthRank(right.certainty) -
    getRoleEvidenceStrengthRank(left.certainty);
  if (certaintyComparison !== 0) {
    return certaintyComparison;
  }

  return compareRoleInstancesBySeat(left, right, playersById);
}

function compareRoleEntriesForTimeline(
  left: RoleInPlay,
  right: RoleInPlay,
  step: TimelineStep
) {
  const leftMatches = getTimelineEvidenceMatchCount(left.instances, step);
  const rightMatches = getTimelineEvidenceMatchCount(right.instances, step);
  if (leftMatches !== rightMatches) {
    return rightMatches - leftMatches;
  }

  const certaintyComparison =
    getRoleInPlayEntryStrengthRank(right) - getRoleInPlayEntryStrengthRank(left);
  if (certaintyComparison !== 0) {
    return certaintyComparison;
  }

  return getRoleInPlayGroupLabel(left).localeCompare(getRoleInPlayGroupLabel(right));
}

function getRoleInPlayEntryStrengthRank(entry: RoleInPlay) {
  return Math.max(
    ...entry.instances.map((instance) => getRoleEvidenceStrengthRank(instance.certainty)),
    0
  );
}

function getRoleEvidenceStrengthRank(certainty: RoleInstance["certainty"]) {
  return certainty === "confirmed" ? 2 : 1;
}

function compareRoleInstancesBySeat(
  left: RoleInstance,
  right: RoleInstance,
  playersById: Map<string, Player>
) {
  const leftPlayer = getRoleInstancePrimaryPlayer(left, playersById);
  const rightPlayer = getRoleInstancePrimaryPlayer(right, playersById);

  if (leftPlayer && rightPlayer) {
    return leftPlayer.seat - rightPlayer.seat;
  }

  if (leftPlayer) {
    return -1;
  }

  if (rightPlayer) {
    return 1;
  }

  return left.id.localeCompare(right.id);
}

function formatPhaseLabel(phase: "day" | "night", round: number) {
  return `Night ${round}`;
}

function formatActionCounterpart(counterpartId: string | undefined, players: Player[]) {
  if (!counterpartId || counterpartId === UNKNOWN_PARTICIPANT_ID) {
    return "?";
  }

  const roleId = getRoleIdFromVisitReference(counterpartId);
  if (roleId) {
    return roleId;
  }

  const player = players.find((entry) => entry.id === counterpartId);
  if (!player) {
    return "?";
  }

  return player.name || `Player #${player.seat}`;
}

function getActionLabel(action: NightAction, selectedPlayer: Player) {
  if (action.actionType === "Stayed Home") {
    return "Stayed Home";
  }

  if (action.actionType === "Visited") {
    return action.actorId === selectedPlayer.id
      ? "Visited player"
      : "Visited by player";
  }

  return action.actionType;
}

function getClassToneClass(playerClass: PlayerClass | ObservedPlayerClass) {
  switch (playerClass) {
    case "Innocent":
      return "is-innocent";
    case "Neutral":
      return "is-neutral";
    case "Killer":
      return "is-killer";
    default:
      return "";
  }
}

function getRolesInPlayAssignment(entry: KnownRoleEntry, players: Player[]) {
  const assignedPlayers =
    entry.assignedPlayerIds.length > 0 ? entry.assignedPlayerIds : entry.claimPlayerIds;
  const names = assignedPlayers
    .map((playerId) => getPlayerLabel(playerId, players))
    .filter(Boolean);

  if (names.length === 0) {
    return "?";
  }

  const [firstName, ...rest] = names;
  return rest.length > 0 ? `${firstName} +${rest.length}` : firstName;
}

function getKnownRoleEvidenceHint(entry: KnownRoleEntry, players: Player[]) {
  if (entry.status === "claimed_unconfirmed") {
    const claimNames = entry.claimPlayerIds
      .map((playerId) => getPlayerLabel(playerId, players))
      .filter(Boolean);
    if (claimNames.length === 0) {
      return "from claim";
    }

    return claimNames.length > 1
      ? `claimed by ${claimNames[0]} +${claimNames.length - 1}`
      : `claimed by ${claimNames[0]}`;
  }

  const [primaryEvidence] = entry.evidenceSources;
  if (!primaryEvidence) {
    return "";
  }

  const moreCount = entry.evidenceSources.length - 1;
  return moreCount > 0
    ? `${primaryEvidence.summary} · +${moreCount} more`
    : primaryEvidence.summary;
}

function matchesRoleInPlayStatusFilter(
  instance: RoleInstance,
  statusFilter: "all" | "assigned" | "unclaimed"
) {
  if (statusFilter === "all") {
    return true;
  }

  return instance.status === statusFilter;
}

function matchesRoleInPlayCertaintyFilter(
  instance: RoleInstance,
  certaintyFilter: "all" | "confirmed" | "possible"
) {
  if (certaintyFilter === "all") {
    return true;
  }

  return instance.certainty === certaintyFilter;
}

function matchesRoleInPlayClassFilter(
  entry: RoleInPlay,
  instance: RoleInstance,
  classFilter: "all" | PlayerClass,
  playersById: Map<string, Player>
) {
  if (classFilter === "all") {
    return true;
  }

  return getRoleInPlayInstanceClassId(entry, instance, playersById) === classFilter;
}

function getRoleInPlayInstanceClassId(
  entry: RoleInPlay,
  instance: RoleInstance,
  playersById: Map<string, Player>
) {
  if (entry.type === "class_only") {
    return entry.classId ?? null;
  }

  if (entry.classId) {
    return entry.classId;
  }

  if (!instance.assignedPlayerId) {
    return null;
  }

  const player = playersById.get(instance.assignedPlayerId);
  return player ? getEffectivePlayerClass(player) : null;
}

function getRoleInPlayGroupClassId(
  entry: RoleInPlay,
  playersById: Map<string, Player>
) {
  if (entry.classId) {
    return entry.classId;
  }

  const classIds = new Set<PlayerClass>();
  for (const instance of entry.instances) {
    const classId = getRoleInPlayInstanceClassId(entry, instance, playersById);
    if (!classId) {
      return null;
    }

    classIds.add(classId);
  }

  return classIds.size === 1 ? [...classIds][0] : null;
}

function getRoleInPlayGroupToneClass(
  entry: RoleInPlay,
  playersById: Map<string, Player>
) {
  const classId = getRoleInPlayGroupClassId(entry, playersById);

  switch (classId) {
    case "Innocent":
      return "known-role-group--innocent";
    case "Neutral":
      return "known-role-group--neutral";
    case "Killer":
      return "known-role-group--killer";
    default:
      return "";
  }
}

function getRoleInPlayGroupLabel(entry: RoleInPlay) {
  return entry.roleId ?? formatPlayerClassLabel(entry.classId) ?? "?";
}

function getRoleInstanceLead(instance: RoleInstance, players: Player[]) {
  if (instance.status !== "assigned" || !instance.assignedPlayerId) {
    return "Confirmed owner: none";
  }

  return `Confirmed owner: ${getPlayerLabel(instance.assignedPlayerId, players) || "?"}`;
}

function getRoleInstanceEvidenceHint(instance: RoleInstance, players: Player[]) {
  const ownerLabel =
    instance.status === "assigned" && instance.assignedPlayerId
      ? `Confirmed owner: ${getPlayerLabel(instance.assignedPlayerId, players) || "?"}`
      : "Confirmed owner: none";
  const certaintyLabel = instance.certainty === "confirmed" ? "Confirmed" : "Possible";
  const candidateLabel = getRoleInstanceCandidateSummary(instance, players);
  const evidenceLines = instance.evidenceSources
    .map((source) => source.summary)
    .filter(Boolean);

  if (evidenceLines.length === 0) {
    return [ownerLabel, certaintyLabel, candidateLabel, instance.notes]
      .filter(Boolean)
      .join("\n");
  }

  return [ownerLabel, certaintyLabel, candidateLabel, instance.notes, ...evidenceLines]
    .filter(Boolean)
    .join("\n");
}

function getRoleInstancePrimaryPlayer(
  instance: RoleInstance,
  playersById: Map<string, Player>
) {
  if (instance.assignedPlayerId) {
    return playersById.get(instance.assignedPlayerId);
  }

  const firstCandidateId = instance.candidatePlayerIds[0];
  return firstCandidateId ? playersById.get(firstCandidateId) : undefined;
}

function getRoleInstanceCandidateSummary(instance: RoleInstance, players: Player[]) {
  if (instance.candidatePlayerIds.length === 0) {
    return "";
  }

  const names = instance.candidatePlayerIds
    .map((playerId) => getPlayerLabel(playerId, players))
    .filter(Boolean);

  if (names.length === 0) {
    return "";
  }

  return `${names.length === 1 ? "Candidate" : "Candidates"}: ${names.join(", ")}`;
}

function getRoleInstanceConfirmablePlayers(instance: RoleInstance, players: Player[]) {
  if (instance.candidatePlayerIds.length === 0) {
    return players;
  }

  const allowedPlayerIds = new Set(instance.candidatePlayerIds);
  return players.filter((player) => allowedPlayerIds.has(player.id));
}

function getVisitEndpointKey(playerId?: string, roleId?: string) {
  if (playerId && roleId) {
    return `player-role:${playerId}:${roleId}`;
  }

  if (roleId) {
    return `role:${roleId}`;
  }

  if (playerId) {
    return `player:${playerId}`;
  }

  return "unknown";
}

function getVisitMapEvidenceHint(entry: VisitMapEntry, players: Player[]) {
  const candidateLabel =
    entry.conflict && entry.candidatePlayerIds && entry.candidatePlayerIds.length > 0
      ? `Candidates: ${entry.candidatePlayerIds
          .map((playerId) => getPlayerLabel(playerId, players))
          .filter(Boolean)
          .join(", ")}`
      : "";

  if (entry.reportCount <= 1) {
    return [entry.summary ?? "", candidateLabel].filter(Boolean).join("\n");
  }

  return [`${entry.reportCount} supporting reports`, candidateLabel, ...entry.summaries]
    .filter(Boolean)
    .join("\n");
}

function getPlayerLabel(playerId: string, players: Player[]) {
  const player = players.find((entry) => entry.id === playerId);
  if (!player) {
    return "";
  }

  return player.name || `Player #${player.seat}`;
}

function getActionMode(action: NightAction, selectedPlayer: Player): ActionMode {
  return action.actorId === selectedPlayer.id ? "visited_player" : "visited_by_player";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function readControllerCollapsed() {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const raw = window.localStorage.getItem(CONTROLLER_STATE_STORAGE_KEY);
    if (!raw) {
      return false;
    }

    const parsed = JSON.parse(raw) as { collapsed?: boolean };
    return Boolean(parsed.collapsed);
  } catch {
    return false;
  }
}

function persistControllerCollapsed(collapsed: boolean) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    CONTROLLER_STATE_STORAGE_KEY,
    JSON.stringify({ collapsed })
  );
}

async function syncControllerWindow(collapsed: boolean, dynamicWidth?: number) {
  if (!isOverwolfAvailable()) {
    persistControllerCollapsed(collapsed);
    return;
  }

  const currentWindow = await getCurrentWindowInfo();
  const width = collapsed
    ? CONTROLLER_COLLAPSED_WIDTH
    : (dynamicWidth ?? CONTROLLER_EXPANDED_WIDTH);
  const height = collapsed
    ? CONTROLLER_COLLAPSED_HEIGHT
    : CONTROLLER_EXPANDED_HEIGHT;

  await changeDeclaredWindowSize(CONTROLLER_WINDOW, width, height);

  const screenWidth = Math.max(
    window.screen.availWidth || 0,
    window.screen.width || 0
  );
  const nextX = Math.max(
    8,
    screenWidth - width - 8
  );
  const nextY = currentWindow?.top ?? 8;

  await changeDeclaredWindowPosition(CONTROLLER_WINDOW, nextX, nextY);
  persistControllerCollapsed(collapsed);
}

function isInteractiveTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest("button"));
}

function stopHeaderDrag(event: ReactMouseEvent<HTMLElement>) {
  event.stopPropagation();
}

function shouldIgnoreGlobalHotkeys(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT" ||
      target.isContentEditable)
  );
}
