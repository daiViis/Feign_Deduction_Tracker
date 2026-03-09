import {
  ABILITY_UNKNOWN_VALUE
} from "./usedAbilities";
import {
  type NightAction,
  type Player,
  type UsedAbilityLog,
  type VisitEvidence,
  type VisitEvidenceConfidence,
  type VisitEvidenceSourceType
} from "./types";

export const ROLE_REFERENCE_PREFIX = "role:";
export const UNKNOWN_PARTICIPANT_ID = "__unknown__";

export type ReconciledRoleVisitClaimant = {
  playerId: string;
  entries: VisitEvidence[];
  strong: boolean;
};

export type ReconciledRoleVisitGroup = {
  key: string;
  nightNumber?: number;
  roleId: string;
  targetPlayerId: string;
  claimants: ReconciledRoleVisitClaimant[];
  confirmedOwnerPlayerIds: string[];
  candidatePlayerIds: string[];
  anonymousEntries: VisitEvidence[];
  anonymousRemainingCount: number;
  ambiguousOccurrenceCount: number;
  conflict: boolean;
  notes?: string;
};

export type VisitMapEntry = VisitEvidence & {
  reportCount: number;
  summaries: string[];
  conflict?: boolean;
  candidatePlayerIds?: string[];
};

export function deriveVisitEvidence(input: {
  players: Player[];
  actions: NightAction[];
  usedAbilityLogs: UsedAbilityLog[];
}) {
  const { players, actions, usedAbilityLogs } = input;
  const entries: VisitEvidence[] = [];

  for (const action of actions) {
    const entry = createVisitEvidenceFromAction(action, players);
    if (entry) {
      entries.push(entry);
    }
  }

  for (const entry of usedAbilityLogs) {
    const visitEvidence = createVisitEvidenceFromUsedAbility(entry, players);
    if (visitEvidence) {
      entries.push(visitEvidence);
    }
  }

  return entries.sort((left, right) => {
    const leftNight = left.nightNumber ?? -1;
    const rightNight = right.nightNumber ?? -1;
    if (leftNight !== rightNight) {
      return rightNight - leftNight;
    }

    return left.id.localeCompare(right.id);
  });
}

export function getRoleIdFromVisitReference(value?: string | null) {
  if (!value?.startsWith(ROLE_REFERENCE_PREFIX)) {
    return undefined;
  }

  const roleId = value.slice(ROLE_REFERENCE_PREFIX.length);
  return roleId || undefined;
}

export function toRoleReference(roleId: string) {
  return `${ROLE_REFERENCE_PREFIX}${roleId}`;
}

export function isPlayerBasedVisitEvidence(entry: VisitEvidence) {
  return Boolean(entry.sourcePlayerId && entry.targetPlayerId);
}

export function isRoleBasedVisitEvidence(entry: VisitEvidence) {
  return Boolean(!entry.sourcePlayerId && entry.sourceRole);
}

export function hasRenderableVisitEndpoint(entry: VisitEvidence) {
  return Boolean(entry.targetPlayerId);
}

export function reconcileRoleVisitEvidence(input: {
  players: Player[];
  visitEvidence: VisitEvidence[];
}) {
  const { players, visitEvidence } = input;
  const playersById = new Map(players.map((player) => [player.id, player]));
  const groups = new Map<
    string,
    {
      nightNumber?: number;
      roleId: string;
      targetPlayerId: string;
      claimants: Map<
        string,
        {
          entries: VisitEvidence[];
          strong: boolean;
        }
      >;
      anonymousEntries: VisitEvidence[];
    }
  >();

  for (const entry of visitEvidence) {
    if (entry.ignored || !entry.targetPlayerId) {
      continue;
    }

    if (entry.sourceRole) {
      const group = ensureRoleVisitGroup(
        groups,
        entry.nightNumber,
        entry.sourceRole,
        entry.targetPlayerId
      );

      if (entry.sourcePlayerId && entry.sourcePlayerId !== ABILITY_UNKNOWN_VALUE) {
        addRoleVisitClaimant(group, entry.sourcePlayerId, entry, entry.confidence === "confirmed");
      } else {
        group.anonymousEntries.push(entry);
      }

      continue;
    }

    if (!entry.sourcePlayerId || entry.sourcePlayerId === ABILITY_UNKNOWN_VALUE) {
      continue;
    }

    const player = playersById.get(entry.sourcePlayerId);
    const claimedRoleId = getPlayerClaimedRoleId(player);
    if (!claimedRoleId) {
      continue;
    }

    const group = ensureRoleVisitGroup(
      groups,
      entry.nightNumber,
      claimedRoleId,
      entry.targetPlayerId
    );
    addRoleVisitClaimant(
      group,
      entry.sourcePlayerId,
      entry,
      player?.roleStatus === "confirmed"
    );
  }

  return [...groups.entries()]
    .map(([key, group]) => {
      const claimants = [...group.claimants.entries()]
        .map(([playerId, value]) => ({
          playerId,
          entries: value.entries.sort(compareVisitEvidenceEntries),
          strong: value.strong
        }))
        .sort((left, right) =>
          comparePlayersBySeat(
            playersById.get(left.playerId),
            playersById.get(right.playerId),
            left.playerId,
            right.playerId
          )
        );
      const claimantPlayerIds = claimants.map((claimant) => claimant.playerId);
      const strongOwnerIds = claimants
        .filter((claimant) => claimant.strong)
        .map((claimant) => claimant.playerId);
      const confirmedWitnessCount = group.anonymousEntries.filter(
        (entry) => entry.confidence === "confirmed"
      ).length;
      const confirmedOwnerPlayerIds = new Set(strongOwnerIds);
      const unresolvedClaimantIds = claimantPlayerIds.filter(
        (playerId) => !confirmedOwnerPlayerIds.has(playerId)
      );

      let anonymousRemainingCount = 0;
      let ambiguousOccurrenceCount = 0;
      let candidatePlayerIds: string[] = [];
      let conflict = false;

      if (confirmedWitnessCount > 0) {
        if (confirmedWitnessCount >= claimantPlayerIds.length) {
          claimantPlayerIds.forEach((playerId) => confirmedOwnerPlayerIds.add(playerId));
          anonymousRemainingCount = confirmedWitnessCount - claimantPlayerIds.length;
        } else {
          const availableAmbiguousCount = Math.max(
            confirmedWitnessCount - confirmedOwnerPlayerIds.size,
            0
          );

          if (unresolvedClaimantIds.length <= availableAmbiguousCount) {
            unresolvedClaimantIds.forEach((playerId) => confirmedOwnerPlayerIds.add(playerId));
            anonymousRemainingCount =
              confirmedWitnessCount - confirmedOwnerPlayerIds.size;
          } else {
            candidatePlayerIds = unresolvedClaimantIds;
            ambiguousOccurrenceCount = availableAmbiguousCount;
            conflict = availableAmbiguousCount > 0 && candidatePlayerIds.length > 1;
          }
        }
      } else if (unresolvedClaimantIds.length > 0) {
        candidatePlayerIds = unresolvedClaimantIds;
      }

      if (
        !conflict &&
        confirmedWitnessCount > 0 &&
        claimantPlayerIds.length > confirmedWitnessCount &&
        candidatePlayerIds.length > 0
      ) {
        conflict = true;
      }

      return {
        key,
        nightNumber: group.nightNumber,
        roleId: group.roleId,
        targetPlayerId: group.targetPlayerId,
        claimants,
        confirmedOwnerPlayerIds: sortPlayerIds(
          confirmedOwnerPlayerIds,
          playersById
        ),
        candidatePlayerIds: sortPlayerIds(candidatePlayerIds, playersById),
        anonymousEntries: group.anonymousEntries.sort(compareVisitEvidenceEntries),
        anonymousRemainingCount,
        ambiguousOccurrenceCount,
        conflict,
        notes: buildRoleVisitConflictNote({
          roleId: group.roleId,
          targetPlayerId: group.targetPlayerId,
          confirmedWitnessCount,
          candidatePlayerIds,
          playersById
        })
      } satisfies ReconciledRoleVisitGroup;
    })
    .sort((left, right) => {
      const leftNight = left.nightNumber ?? -1;
      const rightNight = right.nightNumber ?? -1;
      if (leftNight !== rightNight) {
        return rightNight - leftNight;
      }

      const roleComparison = left.roleId.localeCompare(right.roleId);
      if (roleComparison !== 0) {
        return roleComparison;
      }

      return left.targetPlayerId.localeCompare(right.targetPlayerId);
    });
}

export function deriveVisitMapEntries(input: {
  players: Player[];
  visitEvidence: VisitEvidence[];
}) {
  const { players, visitEvidence } = input;
  const reconciledRoleVisits = reconcileRoleVisitEvidence({ players, visitEvidence });
  const usedEvidenceIds = new Set<string>();
  const entries: VisitMapEntry[] = [];

  for (const group of reconciledRoleVisits) {
    for (const claimant of group.claimants) {
      claimant.entries.forEach((entry) => usedEvidenceIds.add(entry.id));

      entries.push({
        id: `visit-map:${group.key}:player:${claimant.playerId}`,
        nightNumber: group.nightNumber,
        sourceType: claimant.entries[0]?.sourceType ?? "manual_visit_evidence",
        sourceRole: group.roleId,
        sourcePlayerId: claimant.playerId,
        targetPlayerId: group.targetPlayerId,
        targetRole: null,
        confidence: group.confirmedOwnerPlayerIds.includes(claimant.playerId)
          ? "confirmed"
          : getGroupedVisitConfidence(claimant.entries),
        summary: buildNamedRoleVisitSummary(
          claimant.playerId,
          group.roleId,
          group.targetPlayerId,
          group.nightNumber,
          players
        ),
        reportCount: claimant.entries.length,
        summaries: getVisitEvidenceSummaries(claimant.entries),
        conflict:
          group.conflict &&
          group.candidatePlayerIds.includes(claimant.playerId) &&
          !group.confirmedOwnerPlayerIds.includes(claimant.playerId),
        candidatePlayerIds: group.candidatePlayerIds,
        ignored: claimant.entries.every((entry) => entry.ignored)
      });
    }

    const anonymousEntriesToRender = group.anonymousEntries
      .slice(0, Math.max(group.anonymousRemainingCount, group.ambiguousOccurrenceCount));

    anonymousEntriesToRender.forEach((entry, index) => {
      usedEvidenceIds.add(entry.id);

      entries.push({
        id: `visit-map:${group.key}:anonymous:${index}`,
        nightNumber: group.nightNumber,
        sourceType: entry.sourceType,
        sourceRole: group.roleId,
        sourcePlayerId: null,
        targetPlayerId: group.targetPlayerId,
        targetRole: null,
        confidence: entry.confidence,
        summary: buildAnonymousRoleVisitSummary(
          group.roleId,
          group.targetPlayerId,
          group.nightNumber,
          players
        ),
        reportCount: 1,
        summaries: getVisitEvidenceSummaries([entry]),
        conflict: group.conflict,
        candidatePlayerIds: group.candidatePlayerIds,
        ignored: Boolean(entry.ignored)
      });
    });

    group.anonymousEntries.forEach((entry) => {
      usedEvidenceIds.add(entry.id);
    });
  }

  const unmatchedEntries = visitEvidence.filter((entry) => !usedEvidenceIds.has(entry.id));
  const groupedEntries = new Map<
    string,
    {
      base: VisitEvidence;
      entries: VisitEvidence[];
    }
  >();

  for (const entry of unmatchedEntries) {
    const groupKey = getVisitEvidenceGroupKey(entry);
    const existing = groupedEntries.get(groupKey);
    if (existing) {
      existing.entries.push(entry);
      continue;
    }

    groupedEntries.set(groupKey, {
      base: entry,
      entries: [entry]
    });
  }

  for (const [groupKey, value] of groupedEntries.entries()) {
    entries.push({
      ...value.base,
      id: value.entries.length > 1 ? `visit-group:${groupKey}` : value.base.id,
      confidence: getGroupedVisitConfidence(value.entries),
      reportCount: value.entries.length,
      summaries: getVisitEvidenceSummaries(value.entries)
    });
  }

  return entries.sort((left, right) => {
    const leftNight = left.nightNumber ?? -1;
    const rightNight = right.nightNumber ?? -1;
    if (leftNight !== rightNight) {
      return rightNight - leftNight;
    }

    return left.id.localeCompare(right.id);
  });
}

function createVisitEvidenceFromAction(action: NightAction, players: Player[]) {
  if (action.actionType === "Stayed Home") {
    return undefined;
  }

  const sourceRole = getRoleIdFromVisitReference(action.actorId);
  const targetRole = getRoleIdFromVisitReference(action.targetId);
  const sourcePlayerId =
    action.actorId && !isSpecialReference(action.actorId) ? action.actorId : null;
  const targetPlayerId =
    action.targetId && !isSpecialReference(action.targetId) ? action.targetId : null;

  if (!sourcePlayerId && !sourceRole) {
    return undefined;
  }

  return {
    id: `action:${action.id}`,
    nightNumber: action.round,
    sourceType: mapNightActionSourceType(action.source),
    sourceRole: sourceRole ?? null,
    sourcePlayerId,
    targetPlayerId,
    targetRole: targetRole ?? null,
    confidence: getActionVisitConfidence(action, sourcePlayerId, sourceRole, targetPlayerId),
    summary: buildVisitEvidenceSummary({
      sourcePlayerId,
      sourceRole,
      targetPlayerId,
      targetRole: targetRole ?? null,
      nightNumber: action.round,
      players
    })
  } satisfies VisitEvidence;
}

function createVisitEvidenceFromUsedAbility(
  entry: UsedAbilityLog,
  players: Player[]
) {
  const targetReference = getUsedAbilityVisitTarget(entry);
  const targetPlayerId =
    targetReference && !isSpecialReference(targetReference) ? targetReference : null;

  return {
    id: `ability:${entry.id}`,
    nightNumber: entry.roundNumber,
    sourceType: "ability_log",
    sourceRole: entry.roleType,
    sourcePlayerId: entry.playerId,
    targetPlayerId,
    targetRole: null,
    ignored: entry.ignored,
    confidence:
      targetPlayerId && !entry.ignored
        ? "confirmed"
        : "unknown",
    summary: buildVisitEvidenceSummary({
      sourcePlayerId: entry.playerId,
      sourceRole: entry.roleType,
      targetPlayerId,
      targetRole: null,
      nightNumber: entry.roundNumber,
      players
    })
  } satisfies VisitEvidence;
}

function getUsedAbilityVisitTarget(entry: UsedAbilityLog) {
  switch (entry.roleType) {
    case "Doctor":
    case "Police":
    case "Lookout":
    case "Investigator":
    case "Snitch":
    case "Provoker":
      return entry.targetPlayerId;
    case "Trapper":
      return entry.trapTargetPlayerId;
    case "Tracker":
      return entry.trackedPlayerId;
    default:
      return undefined;
  }
}

function mapNightActionSourceType(source: NightAction["source"]): VisitEvidenceSourceType {
  return source === "imported" ? "imported_event" : "manual_visit_evidence";
}

function getActionVisitConfidence(
  action: NightAction,
  sourcePlayerId: string | null,
  sourceRole: string | undefined,
  targetPlayerId: string | null
): VisitEvidenceConfidence {
  if (!targetPlayerId || (!sourcePlayerId && !sourceRole)) {
    return "unknown";
  }

  return action.source === "imported" ? "suspected" : "confirmed";
}

function buildVisitEvidenceSummary(input: {
  sourcePlayerId: string | null;
  sourceRole?: string;
  targetPlayerId: string | null;
  targetRole: string | null;
  nightNumber?: number;
  players: Player[];
}) {
  const { sourcePlayerId, sourceRole, targetPlayerId, targetRole, nightNumber, players } =
    input;
  const nightLabel = nightNumber ? `Night ${nightNumber}` : "Night ?";

  if (sourceRole && sourcePlayerId && targetPlayerId) {
    return `${sourceRole} by ${getPlayerLabel(sourcePlayerId, players)} -> ${getPlayerLabel(
      targetPlayerId,
      players
    )} on ${nightLabel}`;
  }

  if (sourceRole && targetPlayerId) {
    return `${sourceRole} -> ${getPlayerLabel(targetPlayerId, players)} on ${nightLabel}`;
  }

  if (sourcePlayerId && targetPlayerId) {
    return `${getPlayerLabel(sourcePlayerId, players)} visited ${getPlayerLabel(
      targetPlayerId,
      players
    )} on ${nightLabel}`;
  }

  if (sourcePlayerId && targetRole) {
    return `${getPlayerLabel(sourcePlayerId, players)} visited ${targetRole} on ${nightLabel}`;
  }

  if (sourceRole) {
    return `${sourceRole} visit evidence on ${nightLabel}`;
  }

  return `Visit evidence on ${nightLabel}`;
}

function getPlayerLabel(playerId: string, players: Player[]) {
  const player = players.find((entry) => entry.id === playerId);
  return player?.name || (player ? `Player #${player.seat}` : "?");
}

function ensureRoleVisitGroup(
  groups: Map<
    string,
    {
      nightNumber?: number;
      roleId: string;
      targetPlayerId: string;
      claimants: Map<
        string,
        {
          entries: VisitEvidence[];
          strong: boolean;
        }
      >;
      anonymousEntries: VisitEvidence[];
    }
  >,
  nightNumber: number | undefined,
  roleId: string,
  targetPlayerId: string
) {
  const key = getRoleVisitGroupKey(nightNumber, roleId, targetPlayerId);
  const existing = groups.get(key);
  if (existing) {
    return existing;
  }

  const nextGroup = {
    nightNumber,
    roleId,
    targetPlayerId,
    claimants: new Map<
      string,
      {
        entries: VisitEvidence[];
        strong: boolean;
      }
    >(),
    anonymousEntries: []
  };
  groups.set(key, nextGroup);
  return nextGroup;
}

function addRoleVisitClaimant(
  group: {
    claimants: Map<
      string,
      {
        entries: VisitEvidence[];
        strong: boolean;
      }
    >;
  },
  playerId: string,
  entry: VisitEvidence,
  strong: boolean
) {
  const existing = group.claimants.get(playerId);
  if (existing) {
    existing.entries.push(entry);
    existing.strong = existing.strong || strong;
    return;
  }

  group.claimants.set(playerId, {
    entries: [entry],
    strong
  });
}

function getRoleVisitGroupKey(
  nightNumber: number | undefined,
  roleId: string,
  targetPlayerId: string
) {
  return [nightNumber ?? "?", roleId, targetPlayerId].join("|");
}

function comparePlayersBySeat(
  left: Player | undefined,
  right: Player | undefined,
  leftFallback: string,
  rightFallback: string
) {
  if (left && right) {
    return left.seat - right.seat;
  }

  if (left) {
    return -1;
  }

  if (right) {
    return 1;
  }

  return leftFallback.localeCompare(rightFallback);
}

function sortPlayerIds(
  playerIds: Iterable<string>,
  playersById: Map<string, Player>
) {
  return [...new Set(playerIds)].sort((left, right) =>
    comparePlayersBySeat(playersById.get(left), playersById.get(right), left, right)
  );
}

function compareVisitEvidenceEntries(left: VisitEvidence, right: VisitEvidence) {
  return left.id.localeCompare(right.id);
}

function buildRoleVisitConflictNote(input: {
  roleId: string;
  targetPlayerId: string;
  confirmedWitnessCount: number;
  candidatePlayerIds: string[];
  playersById: Map<string, Player>;
}) {
  const { roleId, targetPlayerId, confirmedWitnessCount, candidatePlayerIds, playersById } =
    input;

  if (confirmedWitnessCount <= 0 || candidatePlayerIds.length === 0) {
    return undefined;
  }

  const targetLabel = getPlayerLabelById(targetPlayerId, playersById);
  const candidateLabel = candidatePlayerIds
    .map((playerId) => getPlayerLabelById(playerId, playersById))
    .join(", ");

  return `${candidateLabel} match ${confirmedWitnessCount} ${roleId} visit${
    confirmedWitnessCount === 1 ? "" : "s"
  } on ${targetLabel}, so ownership is still ambiguous.`;
}

function getPlayerClaimedRoleId(player?: Player) {
  if (!player?.primaryRole || player.primaryRole === ABILITY_UNKNOWN_VALUE) {
    return undefined;
  }

  return player.primaryRole;
}

function getGroupedVisitConfidence(entries: VisitEvidence[]) {
  if (entries.some((entry) => entry.confidence === "confirmed")) {
    return "confirmed";
  }

  if (entries.some((entry) => entry.confidence === "suspected")) {
    return "suspected";
  }

  return entries[0]?.confidence ?? "unknown";
}

function getVisitEvidenceSummaries(entries: VisitEvidence[]) {
  return [
    ...new Set(
      entries
        .map((entry) => entry.summary)
        .filter((summary): summary is string => Boolean(summary))
    )
  ];
}

function buildNamedRoleVisitSummary(
  playerId: string,
  roleId: string,
  targetPlayerId: string,
  nightNumber: number | undefined,
  players: Player[]
) {
  const nightLabel = nightNumber ? ` on Night ${nightNumber}` : "";
  return `${getPlayerLabel(playerId, players)} (${roleId}) -> ${getPlayerLabel(
    targetPlayerId,
    players
  )}${nightLabel}`;
}

function buildAnonymousRoleVisitSummary(
  roleId: string,
  targetPlayerId: string,
  nightNumber: number | undefined,
  players: Player[]
) {
  const nightLabel = nightNumber ? ` on Night ${nightNumber}` : "";
  return `${roleId} -> ${getPlayerLabel(targetPlayerId, players)}${nightLabel}`;
}

function getPlayerLabelById(playerId: string, playersById: Map<string, Player>) {
  const player = playersById.get(playerId);
  return player ? player.name || `Player #${player.seat}` : "?";
}

function getVisitEvidenceGroupKey(entry: VisitEvidence) {
  return [
    entry.nightNumber ?? "?",
    entry.sourceRole ?? "",
    entry.sourcePlayerId ?? "",
    entry.targetPlayerId ?? "",
    entry.targetRole ?? "",
    entry.ignored ? "ignored" : "active"
  ].join("|");
}

function isSpecialReference(value: string) {
  return (
    value === UNKNOWN_PARTICIPANT_ID ||
    value === ABILITY_UNKNOWN_VALUE ||
    Boolean(getRoleIdFromVisitReference(value))
  );
}
