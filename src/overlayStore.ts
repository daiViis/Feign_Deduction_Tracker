import { useSyncExternalStore } from "react";
import { createMockMatch, createEmptyMatch } from "./mockData";
import {
  getClassRoleId,
  reconcilePlayerClassWithRole
} from "./playerClass";
import {
  clampTimelineStep,
  getMatchTimelineStep,
  isSameTimelineStep
} from "./timeline";
import {
  replacePlayerReferenceInUsedAbility,
  sanitizeUsedAbilityLog,
  setUsedAbilityIgnored,
  updateUsedAbilityLog
} from "./usedAbilities";
import {
  type FakeClaim,
  type Claim,
  type MatchSeed,
  type NightAction,
  type Phase,
  type Player,
  type PlayerClass,
  type RoleAssignmentSlot,
  type TimelineStep,
  type TimelineViewMode,
  type UsedAbilityDraft,
  type UsedAbilityLog
} from "./types";
import { MAD_ROLE_ID } from "./roles";

export type PanelWindowKey =
  | "left_panel"
  | "right_panel"
  | "known_roles"
  | "visit_map";

export type PanelPreference = {
  visible: boolean;
  collapsed: boolean;
  x?: number;
  y?: number;
  expandedWidth: number;
  expandedHeight: number;
};

export type OverlayState = {
  match: MatchSeed;
  selectedPlayerId?: string;
  selectedTimelineStep: TimelineStep;
  timelineViewMode: TimelineViewMode;
  compactMode: boolean;
  panels: Record<PanelWindowKey, PanelPreference>;
};

export type OverlayAction =
  | { type: "resetMatch" }
  | { type: "setPhase"; phase: Phase }
  | { type: "nextPhase" }
  | { type: "toggleCompactMode" }
  | { type: "selectPlayer"; playerId?: string }
  | { type: "setCurrentTimelineStep"; step: TimelineStep }
  | { type: "setTimelineViewMode"; mode: TimelineViewMode }
  | { type: "setSelfPlayerId"; playerId?: string }
  | { type: "setSelfPlayerIgnoreActions"; ignored: boolean }
  | { type: "setPlayerIgnoreActions"; playerId: string; ignored: boolean }
  | { type: "setFakeClaim"; playerId: string; claim: FakeClaim }
  | { type: "addPlayer" }
  | {
      type: "reorderPlayers";
      playerId: string;
      targetPlayerId: string;
      position: "before" | "after";
    }
  | { type: "setPlayerName"; playerId: string; name: string }
  | { type: "removePlayer"; playerId: string }
  | { type: "assignRole"; playerId: string; slot: RoleAssignmentSlot; roleId?: string }
  | {
      type: "confirmRoleInPlay";
      playerId: string;
      roleId: string;
      evidenceSourceKeys: string[];
    }
  | { type: "assignClass"; playerId: string; assignedClass: PlayerClass | null }
  | { type: "toggleSuspicious"; playerId: string }
  | { type: "toggleAlive"; playerId: string }
  | { type: "saveQuickNote"; playerId: string; content: string }
  | { type: "saveFullNote"; playerId: string; content: string }
  | { type: "addAction"; actorId: string; actionType: string; targetId?: string; note?: string; round: number }
  | { type: "updateAction"; actionId: string; actorId: string; actionType: string; targetId?: string }
  | { type: "removeAction"; actionId: string }
  | { type: "addUsedAbility"; entry: UsedAbilityDraft }
  | { type: "updateUsedAbility"; abilityId: string; entry: UsedAbilityDraft }
  | { type: "removeUsedAbility"; abilityId: string }
  | { type: "setClaimText"; playerId: string; content: string; round: number; phase: Phase }
  | { type: "setPanelVisibility"; panel: PanelWindowKey; visible: boolean }
  | { type: "setPanelCollapsed"; panel: PanelWindowKey; collapsed: boolean }
  | { type: "setPanelBounds"; panel: PanelWindowKey; x: number; y: number; width: number; height: number }
  | { type: "setPanelExpandedSize"; panel: PanelWindowKey; width: number; height: number };

export const OVERLAY_STATE_STORAGE_KEY = "feign.overlay.multi-window-state.v1";
export const OVERLAY_STATE_CHANNEL_NAME = "feign.overlay.multi-window-state";
const RIGHT_PANEL_EXPANDED_HEIGHT = 500;

let overlayState = readInitialState();
const listeners = new Set<() => void>();
const syncChannel =
  typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel(OVERLAY_STATE_CHANNEL_NAME)
    : null;

syncChannel?.addEventListener("message", (event) => {
  const nextState = sanitizeState(event.data as OverlayState | undefined);
  overlayState = nextState;
  persistState(nextState);
  emitChange();
});

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== OVERLAY_STATE_STORAGE_KEY || !event.newValue) {
      return;
    }

    try {
      const nextState = sanitizeState(JSON.parse(event.newValue) as OverlayState);
      overlayState = nextState;
      emitChange();
    } catch {
      // Ignore corrupted cross-window payloads and keep the current state.
    }
  });
}

export function useOverlayState() {
  return useSyncExternalStore(subscribe, getOverlayState, getOverlayState);
}

export function getOverlayState() {
  return overlayState;
}

export function dispatchOverlayAction(action: OverlayAction) {
  const baseState = readPersistedState() ?? overlayState;
  overlayState = sanitizeState(reducer(baseState, action));
  persistState(overlayState);
  syncChannel?.postMessage(overlayState);
  emitChange();
}

export function getCurrentTimelineStep(state: OverlayState) {
  return clampTimelineStep(state.match, state.selectedTimelineStep);
}

export function setCurrentTimelineStep(step: TimelineStep) {
  dispatchOverlayAction({ type: "setCurrentTimelineStep", step });
}

export function setTimelineViewMode(mode: TimelineViewMode) {
  dispatchOverlayAction({ type: "setTimelineViewMode", mode });
}

export function getSelectedPlayer(state: OverlayState) {
  return (
    state.match.players.find((player) => player.id === state.selectedPlayerId) ??
    state.match.players[0]
  );
}

export function getSelectedActions(state: OverlayState) {
  const selectedPlayer = getSelectedPlayer(state);
  return state.match.actions
    .filter(
      (action) =>
        action.actorId === selectedPlayer?.id ||
        action.targetId === selectedPlayer?.id
    )
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function getSelectedUsedAbilities(state: OverlayState) {
  const selectedPlayer = getSelectedPlayer(state);
  return state.match.usedAbilities
    .filter((entry) => entry.playerId === selectedPlayer?.id)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function getSelectedClaim(state: OverlayState) {
  const selectedPlayer = getSelectedPlayer(state);
  return getLatestClaim(state.match.claims, selectedPlayer?.id);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emitChange() {
  listeners.forEach((listener) => listener());
}

function readInitialState() {
  return readPersistedState() ?? createInitialState();
}

function createInitialState(): OverlayState {
  const match = import.meta.env.DEV ? createMockMatch() : createEmptyMatch();
  return {
    match,
    selectedPlayerId: match.players.length > 0 ? match.players[0].id : undefined,
    selectedTimelineStep: { phase: "night", index: 1 },
    timelineViewMode: "focus",
    compactMode: false,
    panels: {
      left_panel: {
        visible: true,
        collapsed: false,
        expandedWidth: 408,
        expandedHeight: 420
      },
      right_panel: {
        visible: true,
        collapsed: false,
        expandedWidth: 384,
        expandedHeight: RIGHT_PANEL_EXPANDED_HEIGHT
      },
      known_roles: {
        visible: true,
        collapsed: false,
        expandedWidth: 280,
        expandedHeight: 228
      },
      visit_map: {
        visible: true,
        collapsed: false,
        expandedWidth: 340,
        expandedHeight: 320
      }
    }
  };
}

function sanitizeState(state?: OverlayState) {
  const initialState = createInitialState();
  if (!state) {
    return initialState;
  }

  const nextMatch = {
    ...(state.match ?? initialState.match),
    round: Math.max(1, state.match?.round ?? initialState.match.round),
    phase: "night" as const,
    usedAbilities: state.match?.usedAbilities ?? initialState.match.usedAbilities,
    roles: initialState.match.roles,
    tags: initialState.match.tags
  };
  const sanitizedUsedAbilities = nextMatch.usedAbilities.map((entry) =>
    sanitizeUsedAbilityLog(entry)
  );
  const sanitizedIgnoreActionsByPlayerId = sanitizeIgnoreActionsByPlayer(
    state.match?.ignoreActionsByPlayerId,
    sanitizedUsedAbilities,
    nextMatch.selfPlayerId,
    state.match?.selfPlayerIgnoreActions
  );

  const nextState: OverlayState = {
      match: {
        ...nextMatch,
        selfPlayerIgnoreActions: getStoredIgnoreActionsForPlayer(
          sanitizedIgnoreActionsByPlayerId,
          nextMatch.selfPlayerId
        ),
        ignoreActionsByPlayerId: sanitizedIgnoreActionsByPlayerId,
        fakeClaims: sanitizeFakeClaims(state.match?.fakeClaims),
        roleEvidenceOverrides: sanitizeRoleEvidenceOverrides(
          state.match?.roleEvidenceOverrides
        ),
        usedAbilities: sanitizedUsedAbilities,
        players: nextMatch.players.map((player) =>
          sanitizePlayer(player, nextMatch.actions, sanitizedUsedAbilities)
        )
    },
    selectedPlayerId: state.selectedPlayerId ?? initialState.selectedPlayerId,
    selectedTimelineStep: clampTimelineStep(
      nextMatch,
      state.selectedTimelineStep ?? initialState.selectedTimelineStep
    ),
    timelineViewMode:
      state.timelineViewMode === "full" ? "full" : initialState.timelineViewMode,
    compactMode: Boolean(state.compactMode),
    panels: {
      left_panel: {
        ...initialState.panels.left_panel,
        ...state.panels?.left_panel
      },
      right_panel: {
        ...initialState.panels.right_panel,
        ...state.panels?.right_panel
      },
      known_roles: {
        ...initialState.panels.known_roles,
        ...state.panels?.known_roles
      },
      visit_map: {
        ...initialState.panels.visit_map,
        ...state.panels?.visit_map
      }
    }
  };

  if (nextState.panels.left_panel.expandedWidth === 520) {
    nextState.panels.left_panel.expandedWidth = initialState.panels.left_panel.expandedWidth;
  }

  if (nextState.panels.right_panel.expandedHeight > RIGHT_PANEL_EXPANDED_HEIGHT) {
    nextState.panels.right_panel.expandedHeight = RIGHT_PANEL_EXPANDED_HEIGHT;
  }

  if (!nextState.match.players.some((player) => player.id === nextState.selectedPlayerId)) {
    nextState.selectedPlayerId = createInitialSelection(nextState.match);
  }

  return nextState;
}

function persistState(state: OverlayState) {
  window.localStorage.setItem(OVERLAY_STATE_STORAGE_KEY, JSON.stringify(state));
}

function readPersistedState() {
  const storedValue = window.localStorage.getItem(OVERLAY_STATE_STORAGE_KEY);
  if (!storedValue) {
    return undefined;
  }

  try {
    return sanitizeState(JSON.parse(storedValue) as OverlayState);
  } catch {
    return undefined;
  }
}

function deriveTimelineAwareState(previousState: OverlayState, nextState: OverlayState) {
  const previousCurrentStep = getMatchTimelineStep(previousState.match);
  const nextCurrentStep = getMatchTimelineStep(nextState.match);
  const shouldFollowCurrent = isSameTimelineStep(
    previousState.selectedTimelineStep,
    previousCurrentStep
  );

  return {
    ...nextState,
    selectedTimelineStep: shouldFollowCurrent
      ? nextCurrentStep
      : clampTimelineStep(nextState.match, nextState.selectedTimelineStep)
  };
}

function reducer(state: OverlayState, action: OverlayAction): OverlayState {
  switch (action.type) {
    case "resetMatch": {
      const nextMatch = resetCurrentMatch(state.match);
      return {
        ...state,
        match: nextMatch,
        selectedTimelineStep: getMatchTimelineStep(nextMatch),
        selectedPlayerId: nextMatch.players.some(
          (player) => player.id === state.selectedPlayerId
        )
          ? state.selectedPlayerId
          : createInitialSelection(nextMatch)
      };
    }

    case "setPhase":
      return deriveTimelineAwareState(state, {
        ...state,
        match: {
          ...state.match,
          phase: "night"
        }
      });

    case "nextPhase": {
      return deriveTimelineAwareState(state, {
        ...state,
        match: {
          ...state.match,
          phase: "night",
          round: state.match.round + 1
        }
      });
    }

    case "toggleCompactMode":
      return {
        ...state,
        compactMode: !state.compactMode
      };

    case "selectPlayer":
      return {
        ...state,
        selectedPlayerId: action.playerId
      };

    case "setSelfPlayerId":
      return {
        ...state,
        match: {
          ...state.match,
          selfPlayerId: action.playerId,
          selfPlayerIgnoreActions: getStoredIgnoreActionsForPlayer(
            state.match.ignoreActionsByPlayerId,
            action.playerId
          )
        }
      };

    case "setSelfPlayerIgnoreActions": {
      const nextUsedAbilities = applyIgnoreActionsToSelfLogs(
        state.match.usedAbilities,
        state.match.selfPlayerId,
        action.ignored
      );
      const nextIgnoreActionsByPlayerId = setIgnoreActionsForPlayer(
        state.match.ignoreActionsByPlayerId,
        state.match.selfPlayerId,
        action.ignored
      );

      return {
        ...state,
        match: {
          ...state.match,
          selfPlayerIgnoreActions: action.ignored,
          ignoreActionsByPlayerId: nextIgnoreActionsByPlayerId,
          usedAbilities: nextUsedAbilities,
          players: state.match.players.map((player) =>
            player.id === state.match.selfPlayerId
              ? {
                  ...player,
                  updatedAt: makeTimestamp()
                }
              : player
          )
        }
      };
    }

    case "setPlayerIgnoreActions": {
      const nextUsedAbilities = applyIgnoreActionsToSelfLogs(
        state.match.usedAbilities,
        action.playerId,
        action.ignored
      );
      const nextIgnoreActionsByPlayerId = setIgnoreActionsForPlayer(
        state.match.ignoreActionsByPlayerId,
        action.playerId,
        action.ignored
      );

      return {
        ...state,
        match: {
          ...state.match,
          selfPlayerIgnoreActions:
            state.match.selfPlayerId === action.playerId
              ? action.ignored
              : state.match.selfPlayerIgnoreActions,
          ignoreActionsByPlayerId: nextIgnoreActionsByPlayerId,
          usedAbilities: nextUsedAbilities,
          players: state.match.players.map((player) =>
            player.id === action.playerId
              ? {
                  ...player,
                  updatedAt: makeTimestamp()
                }
              : player
          )
        }
      };
    }

    case "setFakeClaim":
      return {
        ...state,
        match: {
          ...state.match,
          fakeClaims: {
            ...state.match.fakeClaims,
            [action.playerId]: sanitizeFakeClaim(action.claim)
          }
        }
      };

    case "setCurrentTimelineStep":
      return {
        ...state,
        selectedTimelineStep: clampTimelineStep(state.match, action.step)
      };

    case "setTimelineViewMode":
      return {
        ...state,
        timelineViewMode: action.mode
      };

    case "addPlayer": {
      const nextPlayer = createEmptyPlayer(state.match.players);
      return {
        ...state,
        match: {
          ...state.match,
          players: [...state.match.players, nextPlayer]
        },
        selectedPlayerId: nextPlayer.id
      };
    }

    case "reorderPlayers":
      return {
        ...state,
        match: {
          ...state.match,
          players: reorderPlayers(
            state.match.players,
            action.playerId,
            action.targetPlayerId,
            action.position
          )
        }
      };

    case "setPlayerName":
      return {
        ...state,
        match: {
          ...state.match,
          players: state.match.players.map((player) =>
            player.id === action.playerId
              ? {
                  ...player,
                  name: action.name,
                  updatedAt: makeTimestamp()
                }
              : player
          )
        }
      };

    case "removePlayer": {
      const nextPlayers = state.match.players
        .filter((player) => player.id !== action.playerId)
        .map((player) => ({
          ...player,
          claimIds: player.claimIds.filter((claimId) =>
            state.match.claims.some(
              (claim) =>
                claim.id === claimId && claim.playerId !== action.playerId
            )
          ),
          actionIds: player.actionIds.filter((actionId) =>
            state.match.actions.some(
              (entry) =>
                entry.id === actionId &&
                entry.actorId !== action.playerId &&
                entry.targetId !== action.playerId
            )
          ),
          contradictionIds: player.contradictionIds.filter((contradictionId) =>
            state.match.contradictions.some(
              (contradiction) =>
                contradiction.id === contradictionId &&
                !contradiction.playerIds.includes(action.playerId)
            )
          ),
          relationships: player.relationships.filter(
            (relationship) => relationship.targetId !== action.playerId
          )
        }));
      const nextClaims = state.match.claims.filter(
        (claim) => claim.playerId !== action.playerId
      );
      const nextActions = state.match.actions.filter(
        (entry) =>
          entry.actorId !== action.playerId && entry.targetId !== action.playerId
      );
      const nextContradictions = state.match.contradictions.filter(
        (contradiction) => !contradiction.playerIds.includes(action.playerId)
      );
      const nextReviewQueue = state.match.reviewQueue.filter(
        (item) => item.playerId !== action.playerId
      );
      const nextUsedAbilities = state.match.usedAbilities
        .filter((entry) => entry.playerId !== action.playerId)
        .map((entry) => replacePlayerReferenceInUsedAbility(entry, action.playerId));
      const nextTimelineEvents = state.match.timelineEvents.filter(
        (event) => !event.playerIds.includes(action.playerId)
      );
      const nextEventIds = new Set(nextTimelineEvents.map((event) => event.id));
      const nextTimelineGroups = state.match.timelineGroups
        .map((group) => ({
          ...group,
          eventIds: group.eventIds.filter((eventId) => nextEventIds.has(eventId))
        }))
        .filter((group) => group.eventIds.length > 0);
      const nextSelectedPlayerId =
        state.selectedPlayerId === action.playerId
          ? createInitialSelection({
              ...state.match,
              players: nextPlayers
            })
          : state.selectedPlayerId;

      return {
        ...state,
        match: {
          ...state.match,
          selfPlayerId:
            state.match.selfPlayerId === action.playerId
              ? undefined
              : state.match.selfPlayerId,
          selfPlayerIgnoreActions:
            state.match.selfPlayerId === action.playerId
              ? false
              : state.match.selfPlayerIgnoreActions,
          ignoreActionsByPlayerId: Object.fromEntries(
            Object.entries(state.match.ignoreActionsByPlayerId).filter(
              ([playerId]) => playerId !== action.playerId
            )
          ),
          fakeClaims: Object.fromEntries(
            Object.entries(state.match.fakeClaims).filter(
              ([playerId]) => playerId !== action.playerId
            )
          ),
          roleEvidenceOverrides: Object.fromEntries(
            Object.entries(state.match.roleEvidenceOverrides).filter(
              ([, override]) => override.playerId !== action.playerId
            )
          ),
          players: nextPlayers,
          claims: nextClaims,
          actions: nextActions,
          usedAbilities: nextUsedAbilities,
          contradictions: nextContradictions,
          reviewQueue: nextReviewQueue,
          timelineEvents: nextTimelineEvents,
          timelineGroups: nextTimelineGroups
        },
        selectedPlayerId: nextSelectedPlayerId
      };
    }

    case "assignRole":
      return {
        ...state,
        match: {
          ...state.match,
          players: state.match.players.map((player) => {
            if (player.id !== action.playerId) {
              return player;
            }

            return applyPlayerRoleAssignment(player, action.slot, action.roleId);
          })
        }
      };

    case "confirmRoleInPlay":
      return {
        ...state,
        match: {
          ...state.match,
          roleEvidenceOverrides: {
            ...state.match.roleEvidenceOverrides,
            ...Object.fromEntries(
              action.evidenceSourceKeys.map((sourceKey) => [
                sourceKey,
                {
                  playerId: action.playerId,
                  strength: "confirmed" as const
                }
              ])
            )
          },
          players: state.match.players.map((player) =>
            player.id === action.playerId
              ? applyPlayerRoleAssignment(
                  player,
                  "primary",
                  action.roleId,
                  "confirmed"
                )
              : player
          )
        }
      };

    case "assignClass":
      return {
        ...state,
        match: {
          ...state.match,
          players: state.match.players.map((player) =>
            player.id === action.playerId
              ? {
                  ...player,
                  assignedClass: reconcilePlayerClassWithRole(
                    getClassRoleId(player.primaryRole, player.secondaryRole),
                    action.assignedClass
                  ),
                  updatedAt: makeTimestamp()
                }
              : player
          )
        }
      };

    case "toggleSuspicious":
      return {
        ...state,
        match: {
          ...state.match,
          players: state.match.players.map((player) =>
            player.id === action.playerId
              ? {
                  ...player,
                  suspicious: !player.suspicious,
                  updatedAt: makeTimestamp()
                }
              : player
          )
        }
      };

    case "toggleAlive":
      return {
        ...state,
        match: {
          ...state.match,
          players: state.match.players.map((player) =>
            player.id === action.playerId
              ? {
                  ...player,
                  isAlive: !player.isAlive,
                  updatedAt: makeTimestamp()
                }
              : player
          )
        }
      };

    case "saveQuickNote":
      return {
        ...state,
        match: {
          ...state.match,
          players: state.match.players.map((player) => {
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
        }
      };

    case "saveFullNote":
      return {
        ...state,
        match: {
          ...state.match,
          players: state.match.players.map((player) =>
            player.id === action.playerId
              ? {
                  ...player,
                  fullNote: action.content,
                  updatedAt: makeTimestamp()
                }
              : player
          )
        }
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
      const nextActions = [nextAction, ...state.match.actions];

      return {
        ...state,
        match: {
          ...state.match,
          actions: nextActions,
          players: synchronizePlayerActionIds(state.match.players, nextActions)
        }
      };
    }

    case "updateAction": {
      const nextActions = state.match.actions.map((entry) =>
        entry.id === action.actionId
          ? {
              ...entry,
              actorId: action.actorId,
              actionType: action.actionType,
              targetId: action.targetId
            }
          : entry
      );

      return {
        ...state,
        match: {
          ...state.match,
          actions: nextActions,
          players: synchronizePlayerActionIds(state.match.players, nextActions)
        }
      };
    }

    case "removeAction": {
      const nextActions = state.match.actions.filter(
        (entry) => entry.id !== action.actionId
      );

      return {
        ...state,
        match: {
          ...state.match,
          actions: nextActions,
          players: synchronizePlayerActionIds(state.match.players, nextActions)
        }
      };
    }

    case "addUsedAbility": {
      const timestamp = makeTimestamp();
      const nextEntry: UsedAbilityLog = {
        ...action.entry,
        id: createId("ability"),
        sourceType: "self_action",
        ignored: getStoredIgnoreActionsForPlayer(
          state.match.ignoreActionsByPlayerId,
          action.entry.playerId
        ),
        createdAt: timestamp,
        updatedAt: timestamp
      };

      return {
        ...state,
        match: {
          ...state.match,
          usedAbilities: [nextEntry, ...state.match.usedAbilities],
          players: state.match.players.map((player) =>
            player.id === action.entry.playerId
              ? {
                  ...player,
                  updatedAt: timestamp
                }
              : player
          )
        }
      };
    }

    case "updateUsedAbility": {
      const nextUsedAbilities = state.match.usedAbilities.map((entry) =>
        entry.id === action.abilityId
          ? (() => {
              const updatedEntry = updateUsedAbilityLog(entry, action.entry);
              if (updatedEntry.sourceType === "self_action") {
                return setUsedAbilityIgnored(
                  updatedEntry,
                  getStoredIgnoreActionsForPlayer(
                    state.match.ignoreActionsByPlayerId,
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
        match: {
          ...state.match,
          usedAbilities: nextUsedAbilities,
          players: state.match.players.map((player) =>
            player.id === updatedEntry?.playerId
              ? {
                  ...player,
                  updatedAt: updatedEntry.updatedAt
                }
              : player
          )
        }
      };
    }

    case "removeUsedAbility": {
      const removedEntry = state.match.usedAbilities.find(
        (entry) => entry.id === action.abilityId
      );
      const nextUsedAbilities = state.match.usedAbilities.filter(
        (entry) => entry.id !== action.abilityId
      );

      return {
        ...state,
        match: {
          ...state.match,
          usedAbilities: nextUsedAbilities,
          players: state.match.players.map((player) =>
            player.id === removedEntry?.playerId
              ? {
                  ...player,
                  updatedAt: makeTimestamp()
                }
              : player
          )
        }
      };
    }

    case "setClaimText": {
      const trimmed = action.content.trim();
      const existingClaim = getLatestClaim(state.match.claims, action.playerId);

      if (existingClaim) {
        return {
          ...state,
          match: {
            ...state.match,
            claims: state.match.claims.map((claim) =>
              claim.id === existingClaim.id
                ? {
                    ...claim,
                    wording: trimmed,
                    createdAt: makeTimestamp()
                  }
                : claim
            )
          }
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
        match: {
          ...state.match,
          claims: [nextClaim, ...state.match.claims],
          players: state.match.players.map((player) =>
            player.id === action.playerId
              ? {
                  ...player,
                  claimIds: [nextClaim.id, ...player.claimIds],
                  updatedAt: makeTimestamp()
                }
              : player
          )
        }
      };
    }

    case "setPanelVisibility":
      return {
        ...state,
        panels: {
          ...state.panels,
          [action.panel]: {
            ...state.panels[action.panel],
            visible: action.visible
          }
        }
      };

    case "setPanelCollapsed":
      return {
        ...state,
        panels: {
          ...state.panels,
          [action.panel]: {
            ...state.panels[action.panel],
            collapsed: action.collapsed
          }
        }
      };

    case "setPanelBounds":
      return {
        ...state,
        panels: {
          ...state.panels,
          [action.panel]: {
            ...state.panels[action.panel],
            x: action.x,
            y: action.y,
            expandedWidth: action.width,
            expandedHeight: action.height
          }
        }
      };

    case "setPanelExpandedSize":
      return {
        ...state,
        panels: {
          ...state.panels,
          [action.panel]: {
            ...state.panels[action.panel],
            expandedWidth: action.width,
            expandedHeight: action.height
          }
        }
      };

    default:
      return state;
  }
}

function createInitialSelection(match: MatchSeed) {
  return match.players.find((player) => player.isAlive)?.id ?? match.players[0]?.id;
}

function applyPlayerRoleAssignment(
  player: Player,
  slot: RoleAssignmentSlot,
  roleId?: string,
  roleStatus: Player["roleStatus"] = "suspected"
): Player {
  if (slot === "primary") {
    const nextPrimaryRole = roleId;
    const nextSecondaryRole =
      nextPrimaryRole === MAD_ROLE_ID ? player.secondaryRole : undefined;

    return {
      ...player,
      primaryRole: nextPrimaryRole,
      secondaryRole: nextSecondaryRole,
      assignedClass: reconcilePlayerClassWithRole(
        getClassRoleId(nextPrimaryRole, nextSecondaryRole),
        player.assignedClass
      ),
      roleStatus: nextPrimaryRole ? roleStatus : "unknown",
      updatedAt: makeTimestamp()
    };
  }

  if (player.primaryRole !== MAD_ROLE_ID) {
    return player;
  }

  return {
    ...player,
    secondaryRole: roleId,
    assignedClass: reconcilePlayerClassWithRole(
      getClassRoleId(player.primaryRole, roleId),
      player.assignedClass
    ),
    updatedAt: makeTimestamp()
  };
}

function getLatestClaim(claims: Claim[], playerId?: string) {
  if (!playerId) {
    return undefined;
  }

  return claims
    .filter((claim) => claim.playerId === playerId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
}

function createId(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function makeTimestamp() {
  return new Date().toISOString();
}

function createEmptyPlayer(players: Player[]): Player {
  const nextSeat =
    players.reduce((maxSeat, player) => Math.max(maxSeat, player.seat), 0) + 1;

  return {
    id: createId("player"),
    name: "",
    seat: nextSeat,
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
    updatedAt: makeTimestamp()
  };
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

function reorderPlayers(
  players: Player[],
  playerId: string,
  targetPlayerId: string,
  position: "before" | "after"
) {
  if (playerId === targetPlayerId) {
    return players;
  }

  const orderedPlayers = [...players].sort((left, right) => left.seat - right.seat);
  const sourceIndex = orderedPlayers.findIndex((player) => player.id === playerId);
  const targetIndex = orderedPlayers.findIndex((player) => player.id === targetPlayerId);

  if (sourceIndex < 0 || targetIndex < 0) {
    return players;
  }

  const [movedPlayer] = orderedPlayers.splice(sourceIndex, 1);
  const adjustedTargetIndex =
    sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
  const rawInsertIndex =
    position === "before" ? adjustedTargetIndex : adjustedTargetIndex + 1;
  const insertIndex = Math.min(rawInsertIndex, orderedPlayers.length);

  orderedPlayers.splice(insertIndex, 0, movedPlayer);

  return orderedPlayers.map((player, index) => ({
    ...player,
    seat: index + 1
  }));
}

function synchronizePlayerActionIds(players: Player[], actions: NightAction[]) {
  return players.map((player) => ({
    ...player,
    actionIds: actions
      .filter((action) => action.actorId === player.id)
      .map((action) => action.id)
  }));
}

function sanitizePlayer(
  player: Player,
  actions: NightAction[],
  usedAbilities: UsedAbilityLog[]
) {
  const effectiveRoleId = getClassRoleId(player.primaryRole, player.secondaryRole);

  return {
    ...player,
    actionIds: actions
      .filter((action) => action.actorId === player.id)
      .map((action) => action.id),
    usedAbilityIds: usedAbilities
      .filter((entry) => entry.playerId === player.id)
      .map((entry) => entry.id),
    assignedClass: reconcilePlayerClassWithRole(
      effectiveRoleId,
      player.assignedClass ?? null
    )
  };
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

function sanitizeIgnoreActionsByPlayer(
  ignoreActionsByPlayerId: Record<string, boolean> | undefined,
  usedAbilities: UsedAbilityLog[],
  selfPlayerId?: string,
  selfPlayerIgnoreActions?: boolean
) {
  const nextIgnoreActionsByPlayerId = Object.fromEntries(
    Object.entries(ignoreActionsByPlayerId ?? {}).filter(
      ([, ignored]) => Boolean(ignored)
    )
  );

  if (selfPlayerId && selfPlayerIgnoreActions) {
    nextIgnoreActionsByPlayerId[selfPlayerId] = true;
  }

  for (const entry of usedAbilities) {
    if (entry.sourceType === "self_action" && entry.ignored) {
      nextIgnoreActionsByPlayerId[entry.playerId] = true;
    }
  }

  return nextIgnoreActionsByPlayerId;
}

function sanitizeFakeClaims(fakeClaims?: Record<string, FakeClaim>) {
  if (!fakeClaims) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(fakeClaims).map(([playerId, claim]) => [
      playerId,
      sanitizeFakeClaim(claim)
    ])
  );
}

function sanitizeRoleEvidenceOverrides(
  overrides?: MatchSeed["roleEvidenceOverrides"]
): MatchSeed["roleEvidenceOverrides"] {
  if (!overrides) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(overrides)
      .filter(([sourceKey]) => Boolean(sourceKey))
      .map(([sourceKey, override]) => [
        sourceKey,
        {
          playerId: override?.playerId,
          strength: override?.strength === "possible" ? "possible" : "confirmed"
        }
      ])
  );
}

function sanitizeFakeClaim(claim?: FakeClaim): FakeClaim {
  return {
    roleId: claim?.roleId,
    notes: claim?.notes ?? "",
    entries: (claim?.entries ?? [])
      .filter(
        (entry): entry is FakeClaim["entries"][number] =>
          Boolean(entry) &&
          (entry.claimedAction === "Stayed Home" || entry.claimedAction === "Visited")
      )
      .map((entry) => ({
        timelineStep: {
          phase: "night" as const,
          index: Math.max(1, Math.trunc(entry.timelineStep?.index ?? 1))
        },
        claimedAction: entry.claimedAction,
        claimedTargetPlayerId: entry.claimedTargetPlayerId
      }))
      .sort((left, right) => left.timelineStep.index - right.timelineStep.index)
  };
}
