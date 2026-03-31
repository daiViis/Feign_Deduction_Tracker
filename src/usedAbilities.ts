import {
  type AbilityPlayerReference,
  type AbilityRoleReference,
  type DoctorReviveResult,
  type InvestigatorPossibleResult,
  type ObservedPlayerClass,
  type Player,
  type PoliceMovementResult,
  type RoleOption,
  type UnknownValue,
  type UsedAbilityDraft,
  type UsedAbilityLog,
  type UsedAbilityRoleType
} from "./types";
import { formatPlayerClassLabel } from "./playerClass";
import { normalizeRoleId } from "./roles";

export const ABILITY_UNKNOWN_VALUE: UnknownValue = "unknown";

export const USED_ABILITY_ROLE_IDS: UsedAbilityRoleType[] = [
  "Doctor",
  "Police",
  "Lookout",
  "Investigator",
  "Trapper",
  "Snitch",
  "Provoker",
  "Tracker"
];

export const DOCTOR_REVIVE_RESULTS: DoctorReviveResult[] = [
  "revived",
  "not_revived",
  ABILITY_UNKNOWN_VALUE
];

export const POLICE_MOVEMENT_RESULTS: PoliceMovementResult[] = [
  "tried_to_leave",
  "stayed_home",
  ABILITY_UNKNOWN_VALUE
];

export const OBSERVED_CLASS_OPTIONS: ObservedPlayerClass[] = [
  "Innocent",
  "Neutral",
  "Killer",
  ABILITY_UNKNOWN_VALUE
];

const USED_ABILITY_ROLE_SET = new Set<string>(USED_ABILITY_ROLE_IDS);

export function isUsedAbilityRole(roleId?: string): roleId is UsedAbilityRoleType {
  return Boolean(roleId && USED_ABILITY_ROLE_SET.has(roleId));
}

export function getUsedAbilityRoleOptions(roles: RoleOption[]) {
  return roles.filter((role) => isUsedAbilityRole(role.id));
}

export function createUsedAbilityDraft(
  roleType: UsedAbilityRoleType,
  playerId: string,
  roundNumber: number
): UsedAbilityDraft {
  switch (roleType) {
    case "Doctor":
      return {
        playerId,
        roundNumber,
        roleType,
        targetPlayerId: ABILITY_UNKNOWN_VALUE,
        reviveResult: ABILITY_UNKNOWN_VALUE
      };
    case "Police":
      return {
        playerId,
        roundNumber,
        roleType,
        targetPlayerId: ABILITY_UNKNOWN_VALUE,
        movementResult: ABILITY_UNKNOWN_VALUE
      };
    case "Lookout":
      return {
        playerId,
        roundNumber,
        roleType,
        targetPlayerId: ABILITY_UNKNOWN_VALUE,
        seenVisitorIds: []
      };
    case "Investigator":
      return {
        playerId,
        roundNumber,
        roleType,
        targetPlayerId: ABILITY_UNKNOWN_VALUE,
        possibleResult1: createUnknownInvestigatorResult(),
        possibleResult2: createUnknownInvestigatorResult()
      };
    case "Trapper":
      return {
        playerId,
        roundNumber,
        roleType,
        trapTargetPlayerId: ABILITY_UNKNOWN_VALUE,
        trappedPlayerId: ABILITY_UNKNOWN_VALUE
      };
    case "Snitch":
      return {
        playerId,
        roundNumber,
        roleType,
        targetPlayerId: "",
        revealedRole: ABILITY_UNKNOWN_VALUE,
        revealedClass: ABILITY_UNKNOWN_VALUE
      };
    case "Provoker":
      return {
        playerId,
        roundNumber,
        roleType,
        targetPlayerId: ABILITY_UNKNOWN_VALUE
      };
    case "Tracker":
      return {
        playerId,
        roundNumber,
        roleType,
        trackedPlayerId: ABILITY_UNKNOWN_VALUE,
        destinationPlayerId: ABILITY_UNKNOWN_VALUE
      };
  }
}

export function createUsedAbilityLog(draft: UsedAbilityDraft): UsedAbilityLog {
  const timestamp = new Date().toISOString();
  return {
    ...draft,
    id: `ability-${crypto.randomUUID().slice(0, 8)}`,
    sourceType: "self_action",
    ignored: false,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function toUsedAbilityDraft(entry: UsedAbilityLog): UsedAbilityDraft {
  const {
    id: _id,
    sourceType: _sourceType,
    ignored: _ignored,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    ...draft
  } = entry;
  return draft;
}

export function sanitizeUsedAbilityLog(entry: UsedAbilityLog): UsedAbilityLog {
  const normalizedEntry: UsedAbilityLog = {
    ...entry,
    sourceType: entry.sourceType ?? "self_action",
    ignored: Boolean(entry.ignored)
  };

  switch (normalizedEntry.roleType) {
    case "Investigator": {
      const legacyEntry = normalizedEntry as UsedAbilityLog & {
        possibleRole1?: AbilityRoleReference;
        possibleRole2?: AbilityRoleReference;
      };

      return {
        ...normalizedEntry,
        possibleResult1: sanitizeInvestigatorResult(
          normalizedEntry.possibleResult1 ?? {
            role: legacyEntry.possibleRole1 ?? ABILITY_UNKNOWN_VALUE,
            class: ABILITY_UNKNOWN_VALUE
          }
        ),
        possibleResult2: sanitizeInvestigatorResult(
          normalizedEntry.possibleResult2 ?? {
            role: legacyEntry.possibleRole2 ?? ABILITY_UNKNOWN_VALUE,
            class: ABILITY_UNKNOWN_VALUE
          }
        )
      };
    }
    case "Snitch":
      return {
        ...normalizedEntry,
        revealedRole: normalizeRoleId(normalizedEntry.revealedRole) ?? ABILITY_UNKNOWN_VALUE,
        revealedClass: normalizedEntry.revealedClass ?? ABILITY_UNKNOWN_VALUE
      };
    default:
      return normalizedEntry;
  }
}

export function updateUsedAbilityLog(
  current: UsedAbilityLog,
  draft: UsedAbilityDraft
): UsedAbilityLog {
  return {
    ...draft,
    id: current.id,
    sourceType: current.sourceType,
    ignored: current.ignored,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString()
  };
}

export function setUsedAbilityIgnored(
  entry: UsedAbilityLog,
  ignored: boolean
): UsedAbilityLog {
  if (entry.ignored === ignored) {
    return entry;
  }

  return {
    ...entry,
    ignored,
    updatedAt: new Date().toISOString()
  };
}

export function isUsedAbilityDraftValid(draft: UsedAbilityDraft) {
  if (draft.roleType === "Snitch") {
    return Boolean(draft.targetPlayerId);
  }

  return true;
}

export function replacePlayerReferenceInUsedAbility(
  entry: UsedAbilityLog,
  removedPlayerId: string
): UsedAbilityLog {
  switch (entry.roleType) {
    case "Doctor":
      return {
        ...entry,
        targetPlayerId: replacePlayerReference(entry.targetPlayerId, removedPlayerId)
      };
    case "Police":
      return {
        ...entry,
        targetPlayerId: replacePlayerReference(entry.targetPlayerId, removedPlayerId)
      };
    case "Lookout":
      return {
        ...entry,
        targetPlayerId: replacePlayerReference(entry.targetPlayerId, removedPlayerId),
        seenVisitorIds: entry.seenVisitorIds.map((value) =>
          replacePlayerReference(value, removedPlayerId)
        )
      };
    case "Investigator":
      return {
        ...entry,
        targetPlayerId: replacePlayerReference(entry.targetPlayerId, removedPlayerId)
      };
    case "Trapper":
      return {
        ...entry,
        trapTargetPlayerId: replacePlayerReference(
          entry.trapTargetPlayerId,
          removedPlayerId
        ),
        trappedPlayerId: replacePlayerReference(entry.trappedPlayerId, removedPlayerId)
      };
    case "Snitch":
      return {
        ...entry,
        targetPlayerId:
          entry.targetPlayerId === removedPlayerId ? "" : entry.targetPlayerId
      };
    case "Provoker":
      return {
        ...entry,
        targetPlayerId: replacePlayerReference(entry.targetPlayerId, removedPlayerId)
      };
    case "Tracker":
      return {
        ...entry,
        trackedPlayerId: replacePlayerReference(entry.trackedPlayerId, removedPlayerId),
        destinationPlayerId: replacePlayerReference(
          entry.destinationPlayerId,
          removedPlayerId
        )
      };
  }
}

export function getUsedAbilitySummary(entry: UsedAbilityLog, players: Player[]) {
  switch (entry.roleType) {
    case "Doctor":
      return `Visited ${formatAbilityPlayerReference(entry.targetPlayerId, players)} - ${getDoctorReviveLabel(
        entry.reviveResult
      )}`;
    case "Police":
      return `Blocked ${formatAbilityPlayerReference(entry.targetPlayerId, players)} - ${getPoliceMovementLabel(
        entry.movementResult
      )}`;
    case "Lookout":
      return `Watched ${formatAbilityPlayerReference(entry.targetPlayerId, players)} - saw ${formatVisitorList(
        entry.seenVisitorIds,
        players
      )}`;
    case "Investigator":
      return `Visited ${formatAbilityPlayerReference(entry.targetPlayerId, players)}, saw: ${formatInvestigatorResult(
        entry.possibleResult1
      )} / ${formatInvestigatorResult(entry.possibleResult2)}`;
    case "Trapper":
      return `Trap on ${formatAbilityPlayerReference(entry.trapTargetPlayerId, players)} - caught ${formatAbilityPlayerReference(
        entry.trappedPlayerId,
        players
      )}`;
    case "Snitch":
      return `Visited ${formatAbilityPlayerReference(entry.targetPlayerId, players)}, revealed: ${formatAbilityRoleReference(
        entry.revealedRole
      )} (${formatObservedClass(entry.revealedClass)})`;
    case "Provoker":
      return `Provoked ${formatAbilityPlayerReference(entry.targetPlayerId, players)}`;
    case "Tracker":
      return `Tracked ${formatAbilityPlayerReference(entry.trackedPlayerId, players)} -> ${formatAbilityPlayerReference(
        entry.destinationPlayerId,
        players
      )}`;
  }
}

export function getUsedAbilityRoundLabel(entry: UsedAbilityLog) {
  return `Night ${entry.roundNumber}`;
}

export function formatAbilityPlayerReference(
  value: AbilityPlayerReference | string,
  players: Player[]
) {
  if (!value || value === ABILITY_UNKNOWN_VALUE) {
    return "?";
  }

  const player = players.find((entry) => entry.id === value);
  if (!player) {
    return "?";
  }

  return player.name || `Player #${player.seat}`;
}

export function formatAbilityRoleReference(value: AbilityRoleReference) {
  return !value || value === ABILITY_UNKNOWN_VALUE ? "?" : normalizeRoleId(value) ?? value;
}

export function formatObservedClass(value: ObservedPlayerClass) {
  return !value || value === ABILITY_UNKNOWN_VALUE ? "?" : formatPlayerClassLabel(value) ?? value;
}

export function getDoctorReviveLabel(value: DoctorReviveResult) {
  switch (value) {
    case "revived":
      return "revived";
    case "not_revived":
      return "not revived";
    default:
      return "?";
  }
}

export function getPoliceMovementLabel(value: PoliceMovementResult) {
  switch (value) {
    case "tried_to_leave":
      return "tried to go out";
    case "stayed_home":
      return "stayed home";
    default:
      return "?";
  }
}

function formatVisitorList(values: AbilityPlayerReference[], players: Player[]) {
  if (values.length === 0) {
    return "nobody";
  }

  return values
    .map((value) => formatAbilityPlayerReference(value, players))
    .join(", ");
}

function formatInvestigatorResult(value: InvestigatorPossibleResult) {
  return `${formatAbilityRoleReference(value.role)} (${formatObservedClass(value.class)})`;
}

function createUnknownInvestigatorResult(): InvestigatorPossibleResult {
  return {
    role: ABILITY_UNKNOWN_VALUE,
    class: ABILITY_UNKNOWN_VALUE
  };
}

function sanitizeInvestigatorResult(
  value?: Partial<InvestigatorPossibleResult>
): InvestigatorPossibleResult {
  return {
    role: normalizeRoleId(value?.role) ?? ABILITY_UNKNOWN_VALUE,
    class: value?.class ?? ABILITY_UNKNOWN_VALUE
  };
}

function replacePlayerReference(
  value: AbilityPlayerReference,
  removedPlayerId: string
): AbilityPlayerReference {
  return value === removedPlayerId ? ABILITY_UNKNOWN_VALUE : value;
}
