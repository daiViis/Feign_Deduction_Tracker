import {
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState
} from "react";
import { actionOptions, createMockMatch } from "./mockData";
import { MAD_ROLE_ID, getRoleById } from "./roles";
import { getAllowedClassesForRole, getForcedClassForRole } from "./playerClass";
import {
  type Claim,
  type FakeClaim,
  type MatchSeed,
  type NightAction,
  type Phase,
  type Player,
  type RoleAssignmentSlot,
  type RoleOption,
  type UsedAbilityDraft,
  type UsedAbilityLog
} from "./types";
import { setUsedAbilityIgnored, updateUsedAbilityLog } from "./usedAbilities";

type DomainAction =
  | { type: "resetMatch"; payload: MatchSeed }
  | { type: "setPhase"; phase: Phase }
  | {
      type: "assignRole";
      playerId: string;
      slot: RoleAssignmentSlot;
      roleId?: string;
    }
  | { type: "toggleSuspicious"; playerId: string }
  | { type: "toggleAlive"; playerId: string }
  | { type: "saveQuickNote"; playerId: string; content: string }
  | { type: "saveFullNote"; playerId: string; content: string }
  | {
      type: "addAction";
      actorId: string;
      actionType: string;
      targetId?: string;
      note?: string;
      round: number;
    }
  | {
      type: "setClaimText";
      playerId: string;
      content: string;
      round: number;
      phase: Phase;
    }
  | { type: "setSelfPlayerId"; playerId: string }
  | { type: "setSelfPlayerIgnoreActions"; ignored: boolean }
  | { type: "setPlayerIgnoreActions"; playerId: string; ignored: boolean }
  | { type: "setFakeClaim"; playerId: string; claim: FakeClaim }
  | { type: "addUsedAbility"; entry: UsedAbilityDraft }
  | { type: "updateUsedAbility"; abilityId: string; entry: UsedAbilityDraft }
  | { type: "removeUsedAbility"; abilityId: string };

const COMPACT_STORAGE_KEY = "feign.overlay.simple.compact";
const PANEL_LAYOUT_STORAGE_KEY = "feign.overlay.panel-layout.v1";
const EDGE_GAP = 8;
const TOP_BAR_TOP = 8;
const TOP_BAR_HEIGHT = 30;
const PANEL_HEADER_HEIGHT = 26;
const COLLAPSED_TAB_HEIGHT = 24;

type PanelSide = "left" | "right";

type ViewportSize = {
  width: number;
  height: number;
};

type FloatingPanelState = {
  x: number;
  y: number;
  collapsed: boolean;
  visible: boolean;
};

type PanelLayoutState = Record<PanelSide, FloatingPanelState>;

function App() {
  const initialMatchRef = useRef<MatchSeed>(createMockMatch());
  const [state, dispatch] = useReducer(reducer, initialMatchRef.current);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | undefined>(
    () => createInitialSelection(initialMatchRef.current)
  );
  const [compactMode, setCompactMode] = useState(() =>
    readCompactSetting(COMPACT_STORAGE_KEY)
  );
  const viewport = useViewportSize();
  const [panelLayout, setPanelLayout] = useState<PanelLayoutState>(() =>
    readPanelLayout(PANEL_LAYOUT_STORAGE_KEY, viewport, compactMode)
  );

  const players = useMemo(
    () => [...state.players].sort((left, right) => left.seat - right.seat),
    [state.players]
  );

  const selectedPlayer =
    players.find((player) => player.id === selectedPlayerId) ?? players[0];

  const selectedActions = useMemo(
    () =>
      state.actions
        .filter((action) => action.actorId === selectedPlayerId)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    [selectedPlayerId, state.actions]
  );

  const selectedClaim = useMemo(
    () => getLatestClaim(state.claims, selectedPlayerId),
    [selectedPlayerId, state.claims]
  );

  useEffect(() => {
    window.localStorage.setItem(
      COMPACT_STORAGE_KEY,
      compactMode ? "1" : "0"
    );
  }, [compactMode]);

  useEffect(() => {
    window.localStorage.setItem(
      PANEL_LAYOUT_STORAGE_KEY,
      JSON.stringify(panelLayout)
    );
  }, [panelLayout]);

  useEffect(() => {
    setPanelLayout((current) => clampPanelLayout(current, viewport, compactMode));
  }, [compactMode, viewport.height, viewport.width]);

  useEffect(() => {
    if (!selectedPlayerId || !players.some((player) => player.id === selectedPlayerId)) {
      setSelectedPlayerId(players[0]?.id);
    }
  }, [players, selectedPlayerId]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || shouldIgnoreGlobalHotkeys(event.target)) {
        return;
      }

      if (event.key !== "1" && event.key !== "2") {
        return;
      }

      event.preventDefault();
      setPanelLayout((current) => {
        const side = event.key === "1" ? "left" : "right";
        const panel = current[side];
        return {
          ...current,
          [side]: panel.visible
            ? { ...panel, visible: false }
            : { ...panel, visible: true, collapsed: false }
        };
      });
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleResetMatch = () => {
    const nextMatch = resetCurrentMatch(state);
    dispatch({ type: "resetMatch", payload: nextMatch });
    setSelectedPlayerId(createInitialSelection(nextMatch));
  };

  const updatePanel = (
    side: PanelSide,
    updater: (current: FloatingPanelState) => FloatingPanelState
  ) => {
    setPanelLayout((current) => ({
      ...current,
      [side]: updater(current[side])
    }));
  };

  const togglePanelVisibility = (side: PanelSide) => {
    updatePanel(side, (current) =>
      current.visible
        ? { ...current, visible: false }
        : { ...current, visible: true, collapsed: false }
    );
  };

  const setPanelCollapsed = (side: PanelSide, collapsed: boolean) => {
    updatePanel(side, (current) => ({ ...current, collapsed }));
  };

  const setPanelPosition = (side: PanelSide, x: number, y: number) => {
    updatePanel(side, (current) => ({ ...current, x, y }));
  };

  return (
    <AppShell compactMode={compactMode}>
      <TopBar
        matchName={state.title}
        round={state.round}
        phase={state.phase}
        compactMode={compactMode}
        leftPanelVisible={panelLayout.left.visible}
        rightPanelVisible={panelLayout.right.visible}
        onPhaseChange={(phase) => dispatch({ type: "setPhase", phase })}
        onToggleCompact={() => setCompactMode((current) => !current)}
        onTogglePanelVisibility={togglePanelVisibility}
        onResetMatch={handleResetMatch}
      />

      <LeftPanel
        compactMode={compactMode}
        panelState={panelLayout.left}
        viewport={viewport}
        onMove={(x, y) => setPanelPosition("left", x, y)}
        onToggleCollapse={() =>
          setPanelCollapsed("left", !panelLayout.left.collapsed)
        }
        onExpand={() => setPanelCollapsed("left", false)}
        onHide={() => togglePanelVisibility("left")}
      >
        <PlayerTable
          players={players}
          roles={state.roles}
          ignoreActionsByPlayerId={state.ignoreActionsByPlayerId}
          selectedPlayerId={selectedPlayer?.id}
          compactMode={compactMode}
          onSelectPlayer={setSelectedPlayerId}
          onAssignRole={(playerId, slot, roleId) =>
            dispatch({ type: "assignRole", playerId, slot, roleId })
          }
          onToggleSuspicious={(playerId) =>
            dispatch({ type: "toggleSuspicious", playerId })
          }
          onToggleAlive={(playerId) =>
            dispatch({ type: "toggleAlive", playerId })
          }
          onSaveQuickNote={(playerId, content) =>
            dispatch({ type: "saveQuickNote", playerId, content })
          }
        />
      </LeftPanel>

      <RightPanel
        compactMode={compactMode}
        title={selectedPlayer ? `Detail - ${selectedPlayer.name}` : "Player Detail"}
        panelState={panelLayout.right}
        viewport={viewport}
        onMove={(x, y) => setPanelPosition("right", x, y)}
        onToggleCollapse={() =>
          setPanelCollapsed("right", !panelLayout.right.collapsed)
        }
        onExpand={() => setPanelCollapsed("right", false)}
        onHide={() => togglePanelVisibility("right")}
      >
        <PlayerDetailPanel
          key={selectedPlayerId ?? "empty"}
          selectedPlayerId={selectedPlayerId}
          players={players}
          roles={state.roles}
          phase={state.phase}
          round={state.round}
          actions={selectedActions}
          claim={selectedClaim}
          ignoreActionsEnabled={
            selectedPlayer
              ? Boolean(state.ignoreActionsByPlayerId[selectedPlayer.id])
              : false
          }
          onAssignRole={(playerId, slot, roleId) =>
            dispatch({ type: "assignRole", playerId, slot, roleId })
          }
          onToggleSuspicious={(playerId) =>
            dispatch({ type: "toggleSuspicious", playerId })
          }
          onToggleAlive={(playerId) =>
            dispatch({ type: "toggleAlive", playerId })
          }
          onSetClaimText={(playerId, content) =>
            dispatch({
              type: "setClaimText",
              playerId,
              content,
              round: state.round,
              phase: state.phase
            })
          }
          onAddAction={(actorId, actionType, targetId, note) =>
            dispatch({
              type: "addAction",
              actorId,
              actionType,
              targetId,
              note,
              round: state.round
            })
          }
          onSetPlayerIgnoreActions={(playerId, ignored) =>
            dispatch({ type: "setPlayerIgnoreActions", playerId, ignored })
          }
        />
      </RightPanel>
    </AppShell>
  );
}

function AppShell(props: {
  compactMode: boolean;
  children: ReactNode;
}) {
  const { compactMode, children } = props;
  return (
    <div className={`overlay-root${compactMode ? " is-compact" : ""}`}>
      <div className="app-shell">{children}</div>
    </div>
  );
}

function TopBar(props: {
  matchName: string;
  round: number;
  phase: Phase;
  compactMode: boolean;
  leftPanelVisible: boolean;
  rightPanelVisible: boolean;
  onPhaseChange: (phase: Phase) => void;
  onToggleCompact: () => void;
  onTogglePanelVisibility: (side: PanelSide) => void;
  onResetMatch: () => void;
}) {
  const {
    matchName,
    round,
    phase,
    compactMode,
    leftPanelVisible,
    rightPanelVisible,
    onPhaseChange,
    onToggleCompact,
    onTogglePanelVisibility,
    onResetMatch
  } = props;

  return (
    <header className="top-bar">
      <div className="top-bar__title">
        <strong>{matchName}</strong>
      </div>

      <div className="top-bar__controls">
        <div className="phase-switch" role="group" aria-label="Current night">
          <span className="phase-switch__button is-active">{`Night ${round}`}</span>
        </div>

        <button
          type="button"
          className={`toolbar-button${leftPanelVisible ? " is-active" : ""}`}
          title="Toggle player list panel (Alt+1)"
          onClick={() => onTogglePanelVisibility("left")}
        >
          Players
        </button>

        <button
          type="button"
          className={`toolbar-button${rightPanelVisible ? " is-active" : ""}`}
          title="Toggle detail panel (Alt+2)"
          onClick={() => onTogglePanelVisibility("right")}
        >
          Detail
        </button>

        <button
          type="button"
          className={`toolbar-button${compactMode ? " is-active" : ""}`}
          onClick={onToggleCompact}
        >
          Compact
        </button>

        <button type="button" className="toolbar-button" onClick={onResetMatch}>
          Reset Match
        </button>
      </div>
    </header>
  );
}

function LeftPanel(props: {
  compactMode: boolean;
  panelState: FloatingPanelState;
  viewport: ViewportSize;
  onMove: (x: number, y: number) => void;
  onToggleCollapse: () => void;
  onExpand: () => void;
  onHide: () => void;
  children: ReactNode;
}) {
  const { compactMode, panelState, viewport, onMove, onToggleCollapse, onExpand, onHide, children } =
    props;

  return (
    <DraggableContainer
      side="left"
      title="Player List"
      tabLabel="Players"
      panelState={panelState}
      compactMode={compactMode}
      viewport={viewport}
      onMove={onMove}
      onToggleCollapse={onToggleCollapse}
      onExpand={onExpand}
      onHide={onHide}
    >
      {children}
    </DraggableContainer>
  );
}

function RightPanel(props: {
  compactMode: boolean;
  title: string;
  panelState: FloatingPanelState;
  viewport: ViewportSize;
  onMove: (x: number, y: number) => void;
  onToggleCollapse: () => void;
  onExpand: () => void;
  onHide: () => void;
  children: ReactNode;
}) {
  const {
    compactMode,
    title,
    panelState,
    viewport,
    onMove,
    onToggleCollapse,
    onExpand,
    onHide,
    children
  } = props;

  return (
    <DraggableContainer
      side="right"
      title={title}
      tabLabel="Detail"
      panelState={panelState}
      compactMode={compactMode}
      viewport={viewport}
      onMove={onMove}
      onToggleCollapse={onToggleCollapse}
      onExpand={onExpand}
      onHide={onHide}
    >
      {children}
    </DraggableContainer>
  );
}

function DraggableContainer(props: {
  side: PanelSide;
  title: string;
  tabLabel: string;
  panelState: FloatingPanelState;
  compactMode: boolean;
  viewport: ViewportSize;
  onMove: (x: number, y: number) => void;
  onToggleCollapse: () => void;
  onExpand: () => void;
  onHide: () => void;
  children: ReactNode;
}) {
  const {
    side,
    title,
    tabLabel,
    panelState,
    compactMode,
    viewport,
    onMove,
    onToggleCollapse,
    onExpand,
    onHide,
    children
  } = props;
  const width = getPanelWidth(side, compactMode);
  const dragStartRef = useRef<{
    pointerX: number;
    pointerY: number;
    startX: number;
    startY: number;
  } | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!dragging) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      const dragStart = dragStartRef.current;
      if (!dragStart) {
        return;
      }

      const next = clampPanelPosition(
        side,
        {
          x: dragStart.startX + event.clientX - dragStart.pointerX,
          y: dragStart.startY + event.clientY - dragStart.pointerY
        },
        viewport,
        compactMode
      );

      onMove(next.x, next.y);
    };

    const handleMouseUp = () => {
      dragStartRef.current = null;
      setDragging(false);
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
  }, [compactMode, dragging, onMove, side, viewport]);

  if (!panelState.visible) {
    return null;
  }

  if (panelState.collapsed) {
    const tabTop = clamp(
      panelState.y,
      TOP_BAR_TOP + TOP_BAR_HEIGHT + EDGE_GAP,
      Math.max(TOP_BAR_TOP + TOP_BAR_HEIGHT + EDGE_GAP, viewport.height - COLLAPSED_TAB_HEIGHT - EDGE_GAP)
    );

    return (
      <button
        type="button"
        className={`floating-tab floating-tab--${side}`}
        style={{ top: tabTop }}
        onClick={onExpand}
      >
        {tabLabel}
      </button>
    );
  }

  const maxBodyHeight = Math.max(
    160,
    viewport.height - panelState.y - EDGE_GAP - PANEL_HEADER_HEIGHT
  );

  return (
    <section
      className={`floating-panel floating-panel--${side}`}
      style={{
        left: panelState.x,
        top: panelState.y,
        width
      }}
    >
      <PanelHeader
        title={title}
        dragging={dragging}
        onDragStart={(event) => {
          if (event.button !== 0) {
            return;
          }

          dragStartRef.current = {
            pointerX: event.clientX,
            pointerY: event.clientY,
            startX: panelState.x,
            startY: panelState.y
          };
          setDragging(true);
        }}
        onToggleCollapse={onToggleCollapse}
        onHide={onHide}
      />

      <div className="floating-panel__body" style={{ maxHeight: maxBodyHeight }}>
        {children}
      </div>
    </section>
  );
}

function PanelHeader(props: {
  title: string;
  dragging: boolean;
  onDragStart: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onToggleCollapse: () => void;
  onHide: () => void;
}) {
  const { title, dragging, onDragStart, onToggleCollapse, onHide } = props;

  return (
    <div
      className={`panel-header${dragging ? " is-dragging" : ""}`}
      onMouseDown={onDragStart}
    >
      <div className="panel-header__title">{title}</div>

      <div className="panel-header__actions">
        <CollapseToggle onClick={onToggleCollapse} />
        <button
          type="button"
          className="panel-header__button"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={onHide}
        >
          Hide
        </button>
      </div>
    </div>
  );
}

function CollapseToggle(props: {
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="panel-header__button"
      onMouseDown={(event) => event.stopPropagation()}
      onClick={props.onClick}
    >
      Collapse
    </button>
  );
}

function PlayerTable(props: {
  players: Player[];
  roles: RoleOption[];
  ignoreActionsByPlayerId: Record<string, boolean>;
  selectedPlayerId?: string;
  compactMode: boolean;
  onSelectPlayer: (playerId: string) => void;
  onAssignRole: (
    playerId: string,
    slot: RoleAssignmentSlot,
    roleId?: string
  ) => void;
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
    onSelectPlayer,
    onAssignRole,
    onToggleSuspicious,
    onToggleAlive,
    onSaveQuickNote
  } = props;

  return (
    <section className="table-panel">
      <div className="table-header">
        <span>Player</span>
        <span>Role Guess</span>
        <span>Suspicious</span>
        <span>Note</span>
        <span>Alive/Dead</span>
      </div>

      <div className="table-body">
        {players.map((player) => (
          <PlayerRow
            key={player.id}
            player={player}
            roles={roles}
            ignoreActionsEnabled={Boolean(ignoreActionsByPlayerId[player.id])}
            selected={player.id === selectedPlayerId}
            compactMode={compactMode}
            onSelect={() => onSelectPlayer(player.id)}
            onAssignRole={(slot, roleId) => onAssignRole(player.id, slot, roleId)}
            onToggleSuspicious={() => onToggleSuspicious(player.id)}
            onToggleAlive={() => onToggleAlive(player.id)}
            onSaveQuickNote={(content) => onSaveQuickNote(player.id, content)}
          />
        ))}
      </div>
    </section>
  );
}

function PlayerRow(props: {
  player: Player;
  roles: RoleOption[];
  ignoreActionsEnabled: boolean;
  selected: boolean;
  compactMode: boolean;
  onSelect: () => void;
  onAssignRole: (slot: RoleAssignmentSlot, roleId?: string) => void;
  onToggleSuspicious: () => void;
  onToggleAlive: () => void;
  onSaveQuickNote: (content: string) => void;
}) {
  const {
    player,
    roles,
    ignoreActionsEnabled,
    selected,
    compactMode,
    onSelect,
    onAssignRole,
    onToggleSuspicious,
    onToggleAlive,
    onSaveQuickNote
  } = props;

  return (
    <div
      role="button"
      tabIndex={0}
      className={`player-row${selected ? " is-selected" : ""}${
        compactMode ? " is-compact" : ""
      }${!player.isAlive ? " is-dead" : ""}`}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="player-cell player-cell--player">
        <span className="player-name-with-tag">
          <span className="player-name">{player.name}</span>
          {ignoreActionsEnabled ? <IgnoreActionsTag /> : null}
        </span>
        <span className="player-seat">#{player.seat}</span>
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

      <div className="player-cell player-cell--center">
        <SuspicionToggle
          active={player.suspicious}
          onSelect={onSelect}
          onToggle={onToggleSuspicious}
        />
      </div>

      <div className="player-cell">
        <InlineNoteInput
          value={getQuickNote(player)}
          placeholder="Short note"
          onSelect={onSelect}
          onCommit={onSaveQuickNote}
        />
      </div>

      <div className="player-cell player-cell--center">
        <AliveToggle
          alive={player.isAlive}
          onSelect={onSelect}
          onToggle={onToggleAlive}
        />
      </div>
    </div>
  );
}

function PlayerDetailPanel(props: {
  selectedPlayerId?: string;
  players: Player[];
  roles: RoleOption[];
  phase: Phase;
  round: number;
  actions: NightAction[];
  claim?: Claim;
  ignoreActionsEnabled: boolean;
  onAssignRole: (
    playerId: string,
    slot: RoleAssignmentSlot,
    roleId?: string
  ) => void;
  onToggleSuspicious: (playerId: string) => void;
  onToggleAlive: (playerId: string) => void;
  onSetClaimText: (playerId: string, content: string) => void;
  onSetPlayerIgnoreActions: (playerId: string, ignored: boolean) => void;
  onAddAction: (
    actorId: string,
    actionType: string,
    targetId?: string,
    note?: string
  ) => void;
}) {
  const {
    selectedPlayerId,
    players,
    roles,
    phase,
    round,
    actions,
    claim,
    ignoreActionsEnabled,
    onAssignRole,
    onToggleSuspicious,
    onToggleAlive,
    onSetClaimText,
    onSetPlayerIgnoreActions,
    onAddAction
  } = props;

  const playersById = useMemo(
    () => new Map(players.map((player) => [player.id, player])),
    [players]
  );
  const selectedPlayer = selectedPlayerId ? playersById.get(selectedPlayerId) : undefined;
  const selectedPlayerIdRef = useRef<string | undefined>(selectedPlayerId);
  const [claimDraft, setClaimDraft] = useState(claim?.wording ?? "");

  useEffect(() => {
    selectedPlayerIdRef.current = selectedPlayerId;
  }, [selectedPlayerId]);

  useEffect(() => {
    setClaimDraft(claim?.wording ?? "");
  }, [claim?.id, claim?.wording, selectedPlayerId]);

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
      <section className="detail-section">
        <div className="detail-section__header">
          <span>Summary</span>
        </div>

        <div className="summary-card">
          <div className="summary-card__row">
            <span className="player-name-with-tag">
              <strong className="player-name">{selectedPlayer.name}</strong>
              {ignoreActionsEnabled ? <IgnoreActionsTag /> : null}
            </span>
            <span className="summary-meta">
              Night {round}
            </span>
          </div>

          <div className="summary-grid">
            <div className="summary-field summary-field--wide">
              <span className="summary-label">Role Guess</span>
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
            </div>

            {selectedPlayer.primaryRole === MAD_ROLE_ID ? (
              <div className="summary-field summary-field--wide">
                <span className="summary-label">Pretending Role</span>
                <div className="summary-value">
                  {selectedPlayer.secondaryRole ?? "Choose a pretending role"}
                </div>
              </div>
            ) : null}

            <div className="summary-field summary-field--inline">
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

            <div className="summary-field summary-field--inline">
              <span className="summary-label">Alive/Dead</span>
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

            <div className="summary-field summary-field--wide">
              <span className="summary-label">Ignore Actions</span>
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
        </div>
      </section>

      <section className="detail-section">
        <div className="detail-section__header">
          <span>Night Actions</span>
        </div>

        <NightActionList actions={actions} players={players} />

        <NightActionEditor
          players={players}
          onSave={(actionType, targetId, note) => {
            const currentPlayer = getCurrentSelectedPlayer();
            if (currentPlayer) {
              onAddAction(currentPlayer.id, actionType, targetId, note);
            }
          }}
        />
      </section>

      <section className="detail-section">
        <div className="detail-section__header">
          <span>Claim</span>
        </div>

        <div className="claim-row">
          <input
            type="text"
            className="claim-input"
            value={claimDraft}
            placeholder="Single claim field"
            onChange={(event) => setClaimDraft(event.target.value)}
            onBlur={() => {
              const currentPlayer = getCurrentSelectedPlayer();
              if (currentPlayer) {
                onSetClaimText(currentPlayer.id, claimDraft);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                const currentPlayer = getCurrentSelectedPlayer();
                if (currentPlayer) {
                  onSetClaimText(currentPlayer.id, claimDraft);
                }
                event.currentTarget.blur();
              }
            }}
          />
        </div>
      </section>
    </aside>
  );
}

function RoleDropdown(props: {
  roles: RoleOption[];
  primaryRole?: string;
  secondaryRole?: string;
  compact?: boolean;
  onAssignRole: (slot: RoleAssignmentSlot, roleId?: string) => void;
  onFocus?: () => void;
}) {
  const {
    roles,
    primaryRole,
    secondaryRole,
    compact = false,
    onAssignRole,
    onFocus
  } = props;
  const [open, setOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const [menuStyle, setMenuStyle] = useState<{
    left: number;
    top?: number;
    bottom?: number;
    width: number;
  }>({
    left: 0,
    top: 0,
    width: 0
  });
  const rootRef = useRef<HTMLDivElement | null>(null);
  const primaryRoleOption = getRoleById(primaryRole, roles);
  const hasMadRole = roles.some((role) => role.id === MAD_ROLE_ID);
  const canPickSecondary = primaryRole === MAD_ROLE_ID && hasMadRole;
  const pretendingRoles = roles.filter(
    (role) =>
      role.id !== MAD_ROLE_ID && getAllowedClassesForRole(role.id).includes("Innocent")
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!(event.target instanceof Node)) {
        return;
      }

      if (!rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    const estimatedHeight = canPickSecondary ? 372 : 220;
    const width = Math.min(284, window.innerWidth - 28);
    const left = clamp(rect.left, EDGE_GAP, Math.max(EDGE_GAP, window.innerWidth - width - EDGE_GAP));
    const shouldOpenUpward =
      window.innerHeight - rect.bottom < estimatedHeight && rect.top > estimatedHeight / 2;
    setOpenUpward(shouldOpenUpward);
    setMenuStyle(
      shouldOpenUpward
        ? {
            left,
            bottom: Math.max(EDGE_GAP, window.innerHeight - rect.top + 4),
            width
          }
        : {
            left,
            top: Math.min(window.innerHeight - EDGE_GAP, rect.bottom + 4),
            width
          }
    );
  }, [canPickSecondary, open, roles.length]);

  return (
    <div
      ref={rootRef}
      className={`role-dropdown${compact ? " is-compact" : ""}${open ? " is-open" : ""}`}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="role-dropdown__trigger"
        aria-expanded={open}
        onClick={() => {
          onFocus?.();
          setOpen((current) => !current);
        }}
      >
        <span className="role-trigger__icon">
          {primaryRoleOption ? (
            <img
              className={`role-trigger__image ${getForcedClassForRole(primaryRole) === "Innocent" ? "is-innocent" : getForcedClassForRole(primaryRole) === "Killer" ? "is-killer" : "is-neutral"}`}
              src={primaryRoleOption.imageSrc}
              alt=""
            />
          ) : (
            <span className="role-trigger__fallback">?</span>
          )}
        </span>
        <span className="role-trigger__label">
          {getRoleSelectionText(primaryRole, secondaryRole)}
        </span>
      </button>

      {open ? (
        <div
          className={`role-dropdown__menu${openUpward ? " is-upward" : ""}`}
          style={menuStyle}
        >
          <RoleSelectionSection
            title="Role"
            roles={roles}
            value={primaryRole}
            allowClear
            clearLabel="Unknown"
            onPick={(roleId) => {
              onFocus?.();
              onAssignRole("primary", roleId);
              if (roleId === MAD_ROLE_ID) {
                return;
              }
              setOpen(false);
            }}
          />

          {canPickSecondary ? (
            <RoleSelectionSection
              title="Pretending Role"
              roles={pretendingRoles}
              value={secondaryRole}
              allowClear
              clearLabel="None"
              onPick={(roleId) => {
                onFocus?.();
                onAssignRole("secondary", roleId);
                setOpen(false);
              }}
            />
          ) : null}
        </div>
      ) : null}
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

  return (
    <div className="role-dropdown__section">
      <div className="role-dropdown__title">{title}</div>

      {roles.length === 0 ? (
        <div className="role-dropdown__empty">No role images found.</div>
      ) : (
        <div className="role-grid">
          {allowClear ? (
            <button
              type="button"
              className={`role-option role-option--clear${!value ? " is-active" : ""}`}
              onClick={() => onPick(undefined)}
            >
              <span className="role-option__icon role-option__icon--empty">?</span>
              <span className="role-option__name">{clearLabel}</span>
            </button>
          ) : null}

          {roles.map((role) => (
            <button
              key={role.id}
              type="button"
              className={`role-option${role.id === value ? " is-active" : ""}`}
              onClick={() => onPick(role.id)}
              title={role.id}
            >
              <img
                className={`role-option__image ${getForcedClassForRole(role.id) === "Innocent" ? "is-innocent" : getForcedClassForRole(role.id) === "Killer" ? "is-killer" : "is-neutral"}`}
                src={role.imageSrc}
                alt=""
              />
              <span className="role-option__name">{role.id}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
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
      {alive ? "O" : "X"}
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

function NightActionList(props: {
  actions: NightAction[];
  players: Player[];
}) {
  const { actions, players } = props;

  if (actions.length === 0) {
    return <div className="empty-inline">No actions yet.</div>;
  }

  return (
    <div className="action-list">
      {actions.map((action) => {
        const target = players.find((player) => player.id === action.targetId);
        return (
          <div key={action.id} className="action-item">
            <div className="action-item__main">
              <strong>{action.actionType}</strong>
              <span>{target ? target.name : "No target"}</span>
            </div>
            {action.note ? (
              <div className="action-item__note">{action.note}</div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function NightActionEditor(props: {
  players: Player[];
  onSave: (actionType: string, targetId?: string, note?: string) => void;
}) {
  const { players, onSave } = props;
  const [open, setOpen] = useState(false);
  const [actionType, setActionType] = useState(actionOptions[0]);
  const [targetId, setTargetId] = useState("");
  const [note, setNote] = useState("");

  const reset = () => {
    setActionType(actionOptions[0]);
    setTargetId("");
    setNote("");
  };

  return (
    <div className="action-editor">
      {!open ? (
        <button
          type="button"
          className="toolbar-button"
          onClick={() => setOpen(true)}
        >
          Quick Add Action
        </button>
      ) : (
        <div className="action-editor__form">
          <select
            className="compact-input"
            value={actionType}
            onChange={(event) => setActionType(event.target.value)}
          >
            {actionOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>

          <select
            className="compact-input"
            value={targetId}
            onChange={(event) => setTargetId(event.target.value)}
          >
            <option value="">No target</option>
            {players.map((player) => (
              <option key={player.id} value={player.id}>
                {player.name}
              </option>
            ))}
          </select>

          <input
            type="text"
            className="compact-input"
            value={note}
            placeholder="Optional note"
            onChange={(event) => setNote(event.target.value)}
          />

          <div className="action-editor__buttons">
            <button
              type="button"
              className="toolbar-button is-active"
              onClick={() => {
                onSave(actionType, targetId || undefined, note.trim() || undefined);
                reset();
                setOpen(false);
              }}
            >
              Save
            </button>

            <button
              type="button"
              className="toolbar-button"
              onClick={() => {
                reset();
                setOpen(false);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function reducer(state: MatchSeed, action: DomainAction): MatchSeed {
  switch (action.type) {
    case "resetMatch":
      return action.payload;

    case "setPhase":
      return {
        ...state,
        phase: "night"
      };

    case "setSelfPlayerId":
      return {
        ...state,
        selfPlayerId: action.playerId,
        selfPlayerIgnoreActions: getStoredIgnoreActionsForPlayer(
          state.ignoreActionsByPlayerId,
          action.playerId
        )
      };

    case "setSelfPlayerIgnoreActions": {
      const nextIgnoreActionsByPlayerId = setIgnoreActionsForPlayer(
        state.ignoreActionsByPlayerId,
        state.selfPlayerId,
        action.ignored
      );

      return {
        ...state,
        selfPlayerIgnoreActions: action.ignored,
        ignoreActionsByPlayerId: nextIgnoreActionsByPlayerId,
        usedAbilities: applyIgnoreActionsToSelfLogs(
          state.usedAbilities,
          state.selfPlayerId,
          action.ignored
        )
      };
    }

    case "setPlayerIgnoreActions":
      return {
        ...state,
        selfPlayerIgnoreActions:
          state.selfPlayerId === action.playerId
            ? action.ignored
            : state.selfPlayerIgnoreActions,
        ignoreActionsByPlayerId: setIgnoreActionsForPlayer(
          state.ignoreActionsByPlayerId,
          action.playerId,
          action.ignored
        ),
        usedAbilities: applyIgnoreActionsToSelfLogs(
          state.usedAbilities,
          action.playerId,
          action.ignored
        )
      };

    case "setFakeClaim":
      return {
        ...state,
        fakeClaims: {
          ...state.fakeClaims,
          [action.playerId]: action.claim
        }
      };

    case "assignRole":
      return {
        ...state,
        players: state.players.map((player) => {
          if (player.id !== action.playerId) {
            return player;
          }

          if (action.slot === "primary") {
            const nextPrimaryRole = action.roleId;
            return {
              ...player,
              primaryRole: nextPrimaryRole,
              secondaryRole:
                nextPrimaryRole === MAD_ROLE_ID ? player.secondaryRole : undefined,
              roleStatus: nextPrimaryRole ? "suspected" : "unknown",
              updatedAt: makeTimestamp()
            };
          }

          if (player.primaryRole !== MAD_ROLE_ID) {
            return player;
          }

          return {
            ...player,
            secondaryRole: action.roleId,
            updatedAt: makeTimestamp()
          };
        })
      };

    case "toggleSuspicious":
      return {
        ...state,
        players: state.players.map((player) =>
          player.id === action.playerId
            ? {
                ...player,
                suspicious: !player.suspicious,
                updatedAt: makeTimestamp()
              }
            : player
        )
      };

    case "toggleAlive":
      return {
        ...state,
        players: state.players.map((player) =>
          player.id === action.playerId
            ? {
                ...player,
                isAlive: !player.isAlive,
                updatedAt: makeTimestamp()
              }
            : player
        )
      };

    case "saveQuickNote":
      return {
        ...state,
        players: state.players.map((player) => {
          if (player.id !== action.playerId) {
            return player;
          }

          const nextContent = action.content.trim();
          const quickNoteIndex = player.notes.findIndex((note) => note.mode === "quick");
          const nextNotes = [...player.notes];

          if (!nextContent) {
            if (quickNoteIndex >= 0) {
              nextNotes.splice(quickNoteIndex, 1);
            }
          } else if (quickNoteIndex >= 0) {
            nextNotes[quickNoteIndex] = {
              ...nextNotes[quickNoteIndex],
              content: nextContent,
              createdAt: makeTimestamp()
            };
          } else {
            nextNotes.unshift({
              id: createId("note"),
              content: nextContent,
              mode: "quick",
              createdAt: makeTimestamp()
            });
          }

          return {
            ...player,
            notes: nextNotes,
            updatedAt: makeTimestamp()
          };
        })
      };

    case "saveFullNote":
      return {
        ...state,
        players: state.players.map((player) =>
          player.id === action.playerId
            ? {
                ...player,
                fullNote: action.content,
                updatedAt: makeTimestamp()
              }
            : player
        )
      };

    case "addAction": {
      const nextAction: NightAction = {
        id: createId("action"),
        actorId: action.actorId,
        targetId: action.targetId,
        round: action.round,
        phase: "night",
        actionType: action.actionType,
        note: action.note,
        source: "manual",
        createdAt: makeTimestamp()
      };

      return {
        ...state,
        actions: [nextAction, ...state.actions],
        players: state.players.map((player) =>
          player.id === action.actorId
            ? {
                ...player,
                actionIds: [nextAction.id, ...player.actionIds],
                updatedAt: makeTimestamp()
              }
            : player
        )
      };
    }

    case "addUsedAbility": {
      const timestamp = makeTimestamp();
      const nextEntry: UsedAbilityLog = {
        ...action.entry,
        id: createId("ability"),
        sourceType: "self_action",
        ignored: getStoredIgnoreActionsForPlayer(
          state.ignoreActionsByPlayerId,
          action.entry.playerId
        ),
        createdAt: timestamp,
        updatedAt: timestamp
      };

      return {
        ...state,
        usedAbilities: [nextEntry, ...state.usedAbilities],
        players: state.players.map((player) =>
          player.id === action.entry.playerId
            ? {
                ...player,
                usedAbilityIds: [nextEntry.id, ...player.usedAbilityIds],
                updatedAt: timestamp
              }
            : player
        )
      };
    }

    case "updateUsedAbility": {
      const nextUsedAbilities = state.usedAbilities.map((entry) =>
        entry.id === action.abilityId
          ? (() => {
              const updatedEntry = updateUsedAbilityLog(entry, action.entry);
              if (updatedEntry.sourceType === "self_action") {
                return setUsedAbilityIgnored(
                  updatedEntry,
                  getStoredIgnoreActionsForPlayer(
                    state.ignoreActionsByPlayerId,
                    updatedEntry.playerId
                  )
                );
              }

              return updatedEntry;
            })()
          : entry
      );
      const updatedEntry = nextUsedAbilities.find(
        (entry) => entry.id === action.abilityId
      );

      return {
        ...state,
        usedAbilities: nextUsedAbilities,
        players: state.players.map((player) =>
          player.id === updatedEntry?.playerId
            ? {
                ...player,
                updatedAt: updatedEntry.updatedAt
              }
            : player
        )
      };
    }

    case "removeUsedAbility": {
      const removedEntry = state.usedAbilities.find(
        (entry) => entry.id === action.abilityId
      );

      return {
        ...state,
        usedAbilities: state.usedAbilities.filter(
          (entry) => entry.id !== action.abilityId
        ),
        players: state.players.map((player) =>
          player.id === removedEntry?.playerId
            ? {
                ...player,
                usedAbilityIds: player.usedAbilityIds.filter(
                  (abilityId) => abilityId !== action.abilityId
                ),
                updatedAt: makeTimestamp()
              }
            : player
        )
      };
    }

    case "setClaimText": {
      const trimmed = action.content.trim();
      const existingClaim = getLatestClaim(state.claims, action.playerId);

      if (existingClaim) {
        return {
          ...state,
          claims: state.claims.map((claim) =>
            claim.id === existingClaim.id
              ? {
                  ...claim,
                  wording: trimmed,
                  createdAt: makeTimestamp()
                }
              : claim
          )
        };
      }

      if (!trimmed) {
        return state;
      }

      const nextClaim: Claim = {
        id: createId("claim"),
        playerId: action.playerId,
        round: action.round,
        phase: action.phase,
        type: "hard",
        wording: trimmed,
        createdAt: makeTimestamp()
      };

      return {
        ...state,
        claims: [nextClaim, ...state.claims],
        players: state.players.map((player) =>
          player.id === action.playerId
            ? {
                ...player,
                claimIds: [nextClaim.id, ...player.claimIds],
                updatedAt: makeTimestamp()
              }
            : player
        )
      };
    }

    default:
      return state;
  }
}

function getQuickNote(player: Player) {
  return player.notes.find((note) => note.mode === "quick")?.content ?? "";
}

function getLatestClaim(claims: Claim[], playerId?: string) {
  if (!playerId) {
    return undefined;
  }

  return claims
    .filter((claim) => claim.playerId === playerId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
}

function getStoredIgnoreActionsForPlayer(
  ignoreActionsByPlayerId: Record<string, boolean>,
  playerId?: string
) {
  if (!playerId) {
    return false;
  }

  return Boolean(ignoreActionsByPlayerId[playerId]);
}

function setIgnoreActionsForPlayer(
  ignoreActionsByPlayerId: Record<string, boolean>,
  playerId: string | undefined,
  ignored: boolean
) {
  if (!playerId) {
    return ignoreActionsByPlayerId;
  }

  if (ignored) {
    return {
      ...ignoreActionsByPlayerId,
      [playerId]: true
    };
  }

  const { [playerId]: _removed, ...nextIgnoreActionsByPlayerId } =
    ignoreActionsByPlayerId;
  return nextIgnoreActionsByPlayerId;
}

function applyIgnoreActionsToSelfLogs(
  usedAbilities: UsedAbilityLog[],
  playerId: string | undefined,
  ignored: boolean
) {
  if (!playerId) {
    return usedAbilities;
  }

  return usedAbilities.map((entry) =>
    entry.sourceType === "self_action" && entry.playerId === playerId
      ? setUsedAbilityIgnored(entry, ignored)
      : entry
  );
}

function resetCurrentMatch(match: MatchSeed): MatchSeed {
  const timestamp = makeTimestamp();

  return {
    ...match,
    round: 1,
    phase: "night",
    selfPlayerId: undefined,
    selfPlayerIgnoreActions: false,
    ignoreActionsByPlayerId: {},
    fakeClaims: {},
    roleEvidenceOverrides: {},
    players: match.players.map((player) => ({
      ...player,
      isAlive: true,
      primaryRole: undefined,
      secondaryRole: undefined,
      assignedClass: null,
      roleStatus: "unknown",
      confidence: 0,
      tags: [],
      suspicious: false,
      fullNote: "",
      notes: [],
      claimIds: [],
      actionIds: [],
      usedAbilityIds: [],
      contradictionIds: [],
      relationships: [],
      sourceFlags: ["manual"],
      updatedAt: timestamp
    })),
    claims: [],
    actions: [],
    usedAbilities: [],
    contradictions: [],
    reviewQueue: [],
    timelineEvents: [],
    timelineGroups: []
  };
}

function IgnoreActionsTag() {
  return (
    <span className="player-ignore-tag" title="Ignore Actions enabled">
      ignored
    </span>
  );
}

function getRoleSelectionText(primaryRole?: string, secondaryRole?: string) {
  if (!primaryRole) {
    return "Unknown";
  }

  if (primaryRole !== MAD_ROLE_ID) {
    return primaryRole;
  }

  return secondaryRole ? `${primaryRole} + ${secondaryRole}` : `${primaryRole} + ?`;
}

function createInitialSelection(match: MatchSeed) {
  return match.players.find((player) => player.isAlive)?.id ?? match.players[0]?.id;
}

function useViewportSize(): ViewportSize {
  const [viewport, setViewport] = useState<ViewportSize>(() => ({
    width: window.innerWidth,
    height: window.innerHeight
  }));

  useEffect(() => {
    const handleResize = () => {
      setViewport({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return viewport;
}

function readPanelLayout(
  key: string,
  viewport: ViewportSize,
  compactMode: boolean
): PanelLayoutState {
  const defaults = createDefaultPanelLayout(viewport, compactMode);
  const storedValue = window.localStorage.getItem(key);

  if (!storedValue) {
    return defaults;
  }

  try {
    const parsed = JSON.parse(storedValue) as Partial<PanelLayoutState>;
    return clampPanelLayout(
      {
        left: { ...defaults.left, ...parsed.left },
        right: { ...defaults.right, ...parsed.right }
      },
      viewport,
      compactMode
    );
  } catch {
    return defaults;
  }
}

function createDefaultPanelLayout(
  viewport: ViewportSize,
  compactMode: boolean
): PanelLayoutState {
  const top = TOP_BAR_TOP + TOP_BAR_HEIGHT + EDGE_GAP;
  const rightWidth = getPanelWidth("right", compactMode);

  return {
    left: {
      x: EDGE_GAP,
      y: top,
      collapsed: false,
      visible: true
    },
    right: {
      x: Math.max(EDGE_GAP, viewport.width - rightWidth - EDGE_GAP),
      y: top,
      collapsed: false,
      visible: true
    }
  };
}

function clampPanelLayout(
  panelLayout: PanelLayoutState,
  viewport: ViewportSize,
  compactMode: boolean
): PanelLayoutState {
  return {
    left: {
      ...panelLayout.left,
      ...clampPanelPosition("left", panelLayout.left, viewport, compactMode)
    },
    right: {
      ...panelLayout.right,
      ...clampPanelPosition("right", panelLayout.right, viewport, compactMode)
    }
  };
}

function clampPanelPosition(
  side: PanelSide,
  panelState: Pick<FloatingPanelState, "x" | "y">,
  viewport: ViewportSize,
  compactMode: boolean
) {
  const width = getPanelWidth(side, compactMode);

  return {
    x: clamp(panelState.x, EDGE_GAP, Math.max(EDGE_GAP, viewport.width - width - EDGE_GAP)),
    y: clamp(
      panelState.y,
      TOP_BAR_TOP + TOP_BAR_HEIGHT + EDGE_GAP,
      Math.max(
        TOP_BAR_TOP + TOP_BAR_HEIGHT + EDGE_GAP,
        viewport.height - COLLAPSED_TAB_HEIGHT - EDGE_GAP
      )
    )
  };
}

function getPanelWidth(side: PanelSide, compactMode: boolean) {
  if (side === "left") {
    return compactMode ? 456 : 520;
  }

  return compactMode ? 336 : 384;
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

function readCompactSetting(key: string) {
  return window.localStorage.getItem(key) === "1";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function createId(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function makeTimestamp() {
  return new Date().toISOString();
}

export default App;
