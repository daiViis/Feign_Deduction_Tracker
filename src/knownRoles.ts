import {
  getEffectivePlayerClass,
  getForcedClassForRole
} from "./playerClass";
import {
  getTimelineStepFromClaim,
  getTimelineStepFromUsedAbility,
  getTimelineStepFromVisitEvidence
} from "./timeline";
import { ABILITY_UNKNOWN_VALUE } from "./usedAbilities";
import { reconcileRoleVisitEvidence } from "./visitEvidence";
import {
  type Claim,
  type EvidenceStrength,
  type EvidenceSource,
  type Player,
  type PlayerClass,
  type RoleInPlay,
  type RoleInstance,
  type UsedAbilityLog,
  type VisitEvidence
} from "./types";

type DeriveKnownRolesInput = {
  players: Player[];
  claims: Claim[];
  visitEvidence: VisitEvidence[];
  usedAbilityLogs: UsedAbilityLog[];
  roleEvidenceOverrides?: Record<
    string,
    {
      playerId?: string;
      strength: EvidenceStrength;
    }
  >;
};

type EvidenceMap = Map<string, EvidenceSource>;

type RoleGroupAccumulator = {
  key: string;
  type: "role";
  roleId: string;
  classId: PlayerClass | null;
  presenceEvidenceByKey: Map<string, EvidenceSource>;
  candidateEvidenceByPlayer: Map<string, EvidenceMap>;
  confirmedEvidenceByPlayer: Map<string, EvidenceMap>;
};

type ClassOnlyGroupAccumulator = {
  key: string;
  type: "class_only";
  classId: PlayerClass;
  unclaimedByKey: Map<string, EvidenceSource[]>;
};

export function deriveKnownRoles(input: DeriveKnownRolesInput) {
  const {
    players,
    claims,
    visitEvidence,
    usedAbilityLogs,
    roleEvidenceOverrides
  } = input;
  const playersById = new Map(players.map((player) => [player.id, player]));
  const roleGroups = new Map<string, RoleGroupAccumulator>();

  for (const player of players) {
    if (!isKnownRoleId(player.primaryRole)) {
      continue;
    }

    const roleAssignmentSource: EvidenceSource = {
      type: "role_assignment",
      sourceId: `player:${player.id}:primary-role`,
      sourceCategory: "assignment",
      strength: player.roleStatus === "confirmed" ? "confirmed" : "possible",
      summary:
        player.roleStatus === "confirmed"
          ? "from confirmed player role assignment"
          : "from player role claim"
    };

    addRoleEvidenceFromSource(
      roleGroups,
      player.primaryRole,
      roleAssignmentSource,
      player.id
    );
  }

  applyReconciledRoleVisitEvidence(
    roleGroups,
    reconcileRoleVisitEvidence({ players, visitEvidence }),
    roleEvidenceOverrides
  );

  for (const entry of visitEvidence) {
    if (entry.ignored || !isKnownRoleId(entry.targetRole)) {
      continue;
    }

    const source: EvidenceSource = {
      type: "visit_evidence",
      sourceId: `${entry.id}:target-role`,
      sourceCategory: getVisitEvidenceCategory(entry.sourceType),
      strength: getVisitEvidenceStrength(entry),
      summary: entry.summary ?? "from visit evidence",
      timelineStep: getTimelineStepFromVisitEvidence(entry)
    };
    const resolvedSource = applyRoleEvidenceOverride(
      source,
      roleEvidenceOverrides,
      entry.targetPlayerId
    );

    addRoleEvidenceFromSource(
      roleGroups,
      entry.targetRole,
      resolvedSource.source,
      resolvedSource.playerId
    );
  }

  for (const entry of usedAbilityLogs) {
    if (entry.ignored) {
      continue;
    }

    if (isKnownRoleId(entry.roleType)) {
      const resolvedSource = applyRoleEvidenceOverride(
        {
          type: "ability_role",
          sourceId: `ability:${entry.id}:self`,
          sourceCategory: "used_ability",
          strength: "confirmed",
          summary: `from using ability on Night ${entry.roundNumber}`,
          timelineStep: getTimelineStepFromUsedAbility(entry)
        },
        roleEvidenceOverrides,
        entry.playerId
      );

      addRoleEvidenceFromSource(
        roleGroups,
        entry.roleType,
        resolvedSource.source,
        resolvedSource.playerId
      );
    }

    if (entry.roleType === "Investigator") {
      const possibleRoles = new Set<string>();

      if (isKnownRoleId(entry.possibleResult1.role)) {
        possibleRoles.add(entry.possibleResult1.role);
      }

      if (isKnownRoleId(entry.possibleResult2.role)) {
        possibleRoles.add(entry.possibleResult2.role);
      }

      for (const roleId of possibleRoles) {
        const source: EvidenceSource = {
          type: "reveal",
          sourceId: `ability:${entry.id}:investigator:${roleId}`,
          sourceCategory: "used_ability",
          strength: "possible",
          summary: `from investigator result on Night ${entry.roundNumber}`,
          timelineStep: getTimelineStepFromUsedAbility(entry)
        };
        const resolvedSource = applyRoleEvidenceOverride(
          source,
          roleEvidenceOverrides,
          entry.targetPlayerId && entry.targetPlayerId !== ABILITY_UNKNOWN_VALUE
            ? entry.targetPlayerId
            : null
        );

        addRoleEvidenceFromSource(
          roleGroups,
          roleId,
          resolvedSource.source,
          resolvedSource.playerId
        );
      }
    }

    if (entry.roleType === "Snitch" && isKnownRoleId(entry.revealedRole)) {
      const source: EvidenceSource = {
        type: "reveal",
        sourceId: `ability:${entry.id}:snitch:${entry.revealedRole}`,
        sourceCategory: "used_ability",
        strength: "confirmed",
        summary: `from snitch reveal on Night ${entry.roundNumber}`,
        timelineStep: getTimelineStepFromUsedAbility(entry)
      };
      const resolvedSource = applyRoleEvidenceOverride(
        source,
        roleEvidenceOverrides,
        entry.targetPlayerId
      );

      addRoleEvidenceFromSource(
        roleGroups,
        entry.revealedRole,
        resolvedSource.source,
        resolvedSource.playerId
      );
    }
  }

  for (const claim of claims) {
    if (!isKnownRoleId(claim.roleId)) {
      continue;
    }

    const resolvedSource = applyRoleEvidenceOverride(
      {
        type: "claim",
        sourceId: `claim:${claim.id}`,
        sourceCategory: "claim",
        strength: "possible",
        summary: "from claim",
        timelineStep: getTimelineStepFromClaim(claim)
      },
      roleEvidenceOverrides,
      claim.playerId
    );

    addRoleEvidenceFromSource(
      roleGroups,
      claim.roleId,
      resolvedSource.source,
      resolvedSource.playerId
    );
  }

  const resolvedPlayerIds = new Set<string>();
  for (const group of roleGroups.values()) {
    for (const playerId of group.candidateEvidenceByPlayer.keys()) {
      resolvedPlayerIds.add(playerId);
    }

    for (const playerId of group.confirmedEvidenceByPlayer.keys()) {
      resolvedPlayerIds.add(playerId);
    }
  }

  const classGroups = new Map<PlayerClass, ClassOnlyGroupAccumulator>();
  for (const player of players) {
    const effectiveClass = getEffectivePlayerClass(player);

    if (!effectiveClass || player.primaryRole || resolvedPlayerIds.has(player.id)) {
      continue;
    }

    addClassOnlyEvidence(classGroups, effectiveClass, player.id, {
      type: "class_assignment",
      sourceId: `player:${player.id}:class-only`,
      sourceCategory: "assignment",
      strength: "confirmed",
      summary: `from ${getPlayerLabel(player)} class assignment`
    });
  }

  return [
    ...[...roleGroups.values()].map((group) => buildRoleGroup(group, playersById)),
    ...[...classGroups.values()].map((group) => buildClassOnlyGroup(group))
  ]
    .filter((entry): entry is RoleInPlay => entry.instances.length > 0)
    .sort(compareRoleGroups);
}

function buildRoleGroup(
  group: RoleGroupAccumulator,
  playersById: Map<string, Player>
): RoleInPlay {
  const candidatePlayerIds = sortPlayerIds(group.candidateEvidenceByPlayer.keys(), playersById);
  const confirmedPlayerIds = sortPlayerIds(group.confirmedEvidenceByPlayer.keys(), playersById);
  const remainingCandidatePlayerIds = candidatePlayerIds.filter(
    (playerId) => !group.confirmedEvidenceByPlayer.has(playerId)
  );
  const presenceSources = [...group.presenceEvidenceByKey.values()].sort((left, right) =>
    left.sourceId.localeCompare(right.sourceId)
  );
  const instances: RoleInstance[] = confirmedPlayerIds.map((playerId) => {
    const confirmedEvidence = [...(group.confirmedEvidenceByPlayer.get(playerId)?.values() ?? [])];
    const candidateEvidence = [...(group.candidateEvidenceByPlayer.get(playerId)?.values() ?? [])];

    return createRolePresenceInstance({
      groupKey: group.key,
      instanceKey: playerId,
      status: "assigned",
      certainty: getEvidenceStrength([...confirmedEvidence, ...candidateEvidence]),
      assignedPlayerId: playerId,
      candidatePlayerIds: [],
      evidenceSources: mergeEvidenceSources(confirmedEvidence, candidateEvidence),
      promotionEvidenceSourceKeys: [],
      conflict: false
    });
  });

  if (presenceSources.length > 0) {
    if (remainingCandidatePlayerIds.length > 0) {
      const candidateEvidence = mergeEvidenceSources(
        ...remainingCandidatePlayerIds.map(
          (playerId) => [...(group.candidateEvidenceByPlayer.get(playerId)?.values() ?? [])]
        )
      );

      for (const [index, presenceSource] of presenceSources.entries()) {
        const evidenceSources = mergeEvidenceSources([presenceSource], candidateEvidence);

        instances.push(
          createRolePresenceInstance({
            groupKey: group.key,
            instanceKey: `presence-${index}`,
            status: "unclaimed",
            certainty: getEvidenceStrength(evidenceSources),
            assignedPlayerId: null,
            candidatePlayerIds: remainingCandidatePlayerIds,
            evidenceSources,
            promotionEvidenceSourceKeys: [toEvidenceKey(presenceSource)],
            conflict: remainingCandidatePlayerIds.length > 1,
            notes: buildConflictNote({
              roleId: group.roleId,
              candidatePlayerIds: remainingCandidatePlayerIds,
              evidenceSources,
              playersById
            })
          })
        );
      }
    } else {
      for (const [index, presenceSource] of presenceSources.entries()) {
        instances.push(
          createRolePresenceInstance({
            groupKey: group.key,
            instanceKey: `presence-${index}`,
            status: "unclaimed",
            certainty: getEvidenceStrength([presenceSource]),
            assignedPlayerId: null,
            candidatePlayerIds: [],
            evidenceSources: [presenceSource],
            promotionEvidenceSourceKeys: [toEvidenceKey(presenceSource)],
            conflict: false
          })
        );
      }
    }
  } else if (remainingCandidatePlayerIds.length > 0) {
    const candidateEvidence = mergeEvidenceSources(
      ...remainingCandidatePlayerIds.map(
        (playerId) => [...(group.candidateEvidenceByPlayer.get(playerId)?.values() ?? [])]
      )
    );

    instances.push(
      createRolePresenceInstance({
        groupKey: group.key,
        instanceKey: "candidate-cluster",
        status: "unclaimed",
        certainty: getEvidenceStrength(candidateEvidence),
        assignedPlayerId: null,
        candidatePlayerIds: remainingCandidatePlayerIds,
        evidenceSources: candidateEvidence,
        promotionEvidenceSourceKeys: [],
        conflict: false,
        notes: buildConflictNote({
          roleId: group.roleId,
          candidatePlayerIds: remainingCandidatePlayerIds,
          evidenceSources: candidateEvidence,
          playersById
        })
      })
    );
  }

  return {
    key: group.key,
    type: "role",
    roleId: group.roleId,
    classId: deriveRoleGroupClassId(group.classId, confirmedPlayerIds, playersById),
    instances
  };
}

function buildClassOnlyGroup(group: ClassOnlyGroupAccumulator): RoleInPlay {
  const instances = [...group.unclaimedByKey.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([instanceKey, evidenceSources]) =>
      createRolePresenceInstance({
        groupKey: group.key,
        instanceKey,
        status: "unclaimed",
        certainty: getEvidenceStrength(evidenceSources),
        assignedPlayerId: null,
        candidatePlayerIds: [],
        evidenceSources: mergeEvidenceSources(evidenceSources),
        promotionEvidenceSourceKeys: [],
        conflict: false
      })
    );

  return {
    key: group.key,
    type: "class_only",
    roleId: null,
    classId: group.classId,
    instances
  };
}

function applyReconciledRoleVisitEvidence(
  roleGroups: Map<string, RoleGroupAccumulator>,
  reconciledVisits: ReturnType<typeof reconcileRoleVisitEvidence>,
  roleEvidenceOverrides?: DeriveKnownRolesInput["roleEvidenceOverrides"]
) {
  for (const group of reconciledVisits) {
    const claimantEvidenceByPlayer = new Map<string, EvidenceSource[]>();

    for (const claimant of group.claimants) {
      claimantEvidenceByPlayer.set(
        claimant.playerId,
        claimant.entries.map((entry) =>
          createRoleVisitEvidenceSource(
            entry,
            claimant.strong || group.confirmedOwnerPlayerIds.includes(claimant.playerId),
            claimant.playerId
          )
        )
      );
    }

    for (const playerId of group.confirmedOwnerPlayerIds) {
      const claimantEvidence = claimantEvidenceByPlayer.get(playerId) ?? [];
      const confirmedEvidence = claimantEvidence.map((source) =>
        applyRoleEvidenceOverride(source, roleEvidenceOverrides, playerId).source
      );

      for (const source of confirmedEvidence) {
        addConfirmedRoleEvidence(roleGroups, group.roleId, playerId, {
          ...source,
          strength: "confirmed"
        });
      }
    }

    const remainingCandidatePlayerIds = group.candidatePlayerIds.filter(
      (playerId) => !group.confirmedOwnerPlayerIds.includes(playerId)
    );
    for (const playerId of remainingCandidatePlayerIds) {
      const candidateEvidence = claimantEvidenceByPlayer.get(playerId) ?? [];
      for (const source of candidateEvidence) {
        const resolvedSource = applyRoleEvidenceOverride(
          source,
          roleEvidenceOverrides,
          playerId
        );
        addCandidateRoleEvidence(
          roleGroups,
          group.roleId,
          playerId,
          resolvedSource.source
        );
      }
    }

    const anonymousEntriesToUse = group.anonymousEntries
      .filter((entry) => entry.confidence === "confirmed")
      .slice(0, group.anonymousRemainingCount + group.ambiguousOccurrenceCount);

    anonymousEntriesToUse.forEach((entry, index) => {
      const resolvedSource = applyRoleEvidenceOverride(
        createRoleVisitEvidenceSource(entry, true, null, `${index}`),
        roleEvidenceOverrides
      );
      addRoleEvidenceFromSource(
        roleGroups,
        group.roleId,
        resolvedSource.source,
        resolvedSource.playerId
      );
    });
  }
}

function createRoleVisitEvidenceSource(
  entry: VisitEvidence,
  confirmed: boolean,
  playerId?: string | null,
  suffix = ""
): EvidenceSource {
  const actorLabel = playerId ? ` by ${playerId}` : "";
  const suffixLabel = suffix ? `:${suffix}` : "";

  return {
    type: "visit_evidence",
    sourceId: `${entry.id}:role-visit${playerId ? `:${playerId}` : ""}${suffixLabel}`,
    sourceCategory: getVisitEvidenceCategory(entry.sourceType),
    strength: confirmed ? "confirmed" : getVisitEvidenceStrength(entry),
    summary: entry.summary ?? `from role visit evidence${actorLabel}`,
    timelineStep: getTimelineStepFromVisitEvidence(entry)
  };
}

function deriveRoleGroupClassId(
  baseClassId: PlayerClass | null,
  confirmedPlayerIds: string[],
  playersById: Map<string, Player>
) {
  if (baseClassId) {
    return baseClassId;
  }

  if (confirmedPlayerIds.length === 0) {
    return null;
  }

  const classIds = new Set<PlayerClass>();

  for (const playerId of confirmedPlayerIds) {
    const player = playersById.get(playerId);
    const classId = player ? getEffectivePlayerClass(player) : null;
    if (!classId) {
      return null;
    }

    classIds.add(classId);
  }

  return classIds.size === 1 ? [...classIds][0] : null;
}

function createRolePresenceInstance(input: {
  groupKey: string;
  instanceKey: string;
  status: RoleInstance["status"];
  certainty: RoleInstance["certainty"];
  assignedPlayerId?: string | null;
  candidatePlayerIds: string[];
  conflict: boolean;
  evidenceSources: EvidenceSource[];
  promotionEvidenceSourceKeys: string[];
  notes?: string;
}): RoleInstance {
  const {
    groupKey,
    instanceKey,
    status,
    certainty,
    assignedPlayerId,
    candidatePlayerIds,
    conflict,
    evidenceSources,
    promotionEvidenceSourceKeys,
    notes
  } = input;

  return {
    id: `${groupKey}:${status}:${instanceKey}`,
    status,
    certainty,
    assignedPlayerId: assignedPlayerId ?? null,
    candidatePlayerIds,
    conflict,
    notes,
    evidenceSources: mergeEvidenceSources(evidenceSources),
    promotionEvidenceSourceKeys: [...new Set(promotionEvidenceSourceKeys)].sort(),
  };
}

function sortPlayerIds(
  playerIds: Iterable<string>,
  playersById: Map<string, Player>
) {
  return [...new Set(playerIds)].sort((left, right) => {
    const leftPlayer = playersById.get(left);
    const rightPlayer = playersById.get(right);

    if (leftPlayer && rightPlayer) {
      return leftPlayer.seat - rightPlayer.seat;
    }

    if (leftPlayer) {
      return -1;
    }

    if (rightPlayer) {
      return 1;
    }

    return left.localeCompare(right);
  });
}

function buildConflictNote(input: {
  roleId: string;
  candidatePlayerIds: string[];
  evidenceSources: EvidenceSource[];
  playersById: Map<string, Player>;
}) {
  const {
    roleId,
    candidatePlayerIds,
    evidenceSources,
    playersById
  } = input;

  if (candidatePlayerIds.length > 1) {
    const candidateLabel = joinPlayerLabels(candidatePlayerIds, playersById);
    const visitEvidence = evidenceSources.find((source) => source.type === "visit_evidence");
    if (visitEvidence) {
      return `${candidateLabel} all fit ${visitEvidence.summary}, but that only confirms ${roleId} exists.`;
    }

    return `${candidateLabel} still fit ${roleId}, so the owner is unresolved.`;
  }

  return undefined;
}

function joinPlayerLabels(
  playerIds: string[],
  playersById: Map<string, Player>
) {
  return playerIds
    .map((playerId) => getPlayerLabelById(playerId, playersById))
    .filter(Boolean)
    .join(", ");
}

function getPlayerLabelById(playerId: string, playersById: Map<string, Player>) {
  const player = playersById.get(playerId);
  return player ? getPlayerLabel(player) : "?";
}

function compareRoleGroups(left: RoleInPlay, right: RoleInPlay) {
  const labelComparison = getRoleGroupLabel(left).localeCompare(getRoleGroupLabel(right));
  if (labelComparison !== 0) {
    return labelComparison;
  }

  if (left.type !== right.type) {
    return left.type === "role" ? -1 : 1;
  }

  return left.key.localeCompare(right.key);
}

function getRoleGroupLabel(entry: RoleInPlay) {
  return entry.roleId ?? entry.classId ?? "";
}

function mergeEvidenceSources(...groups: EvidenceSource[][]): EvidenceSource[] {
  const evidenceMap = new Map<string, EvidenceSource>();

  for (const group of groups) {
    for (const source of group) {
      evidenceMap.set(toEvidenceKey(source), source);
    }
  }

  return [...evidenceMap.values()].sort((left, right) =>
    left.sourceId.localeCompare(right.sourceId)
  );
}

function getEvidenceStrength(evidenceSources: EvidenceSource[]): EvidenceStrength {
  return evidenceSources.some((source) => source.strength === "confirmed")
    ? "confirmed"
    : "possible";
}

function addRoleEvidenceFromSource(
  roleGroups: Map<string, RoleGroupAccumulator>,
  roleId: string,
  source: EvidenceSource,
  playerId?: string | null
) {
  if (source.strength === "confirmed" && playerId) {
    addConfirmedRoleEvidence(roleGroups, roleId, playerId, source);
    return;
  }

  if (playerId) {
    addCandidateRoleEvidence(roleGroups, roleId, playerId, source);
    return;
  }

  addPresenceRoleEvidence(roleGroups, roleId, source);
}

function addConfirmedRoleEvidence(
  roleGroups: Map<string, RoleGroupAccumulator>,
  roleId: string,
  playerId: string,
  source: EvidenceSource
) {
  if (!isKnownRoleId(roleId) || !playerId || playerId === ABILITY_UNKNOWN_VALUE) {
    return;
  }

  const group = ensureRoleGroup(roleGroups, roleId);
  const evidenceMap =
    group.confirmedEvidenceByPlayer.get(playerId) ?? new Map<string, EvidenceSource>();
  evidenceMap.set(toEvidenceKey(source), source);
  group.confirmedEvidenceByPlayer.set(playerId, evidenceMap);
}

function addCandidateRoleEvidence(
  roleGroups: Map<string, RoleGroupAccumulator>,
  roleId: string,
  playerId: string,
  source: EvidenceSource
) {
  if (!isKnownRoleId(roleId) || !playerId || playerId === ABILITY_UNKNOWN_VALUE) {
    return;
  }

  const group = ensureRoleGroup(roleGroups, roleId);
  const evidenceMap =
    group.candidateEvidenceByPlayer.get(playerId) ?? new Map<string, EvidenceSource>();
  evidenceMap.set(toEvidenceKey(source), source);
  group.candidateEvidenceByPlayer.set(playerId, evidenceMap);
}

function addPresenceRoleEvidence(
  roleGroups: Map<string, RoleGroupAccumulator>,
  roleId: string,
  source: EvidenceSource
) {
  if (!isKnownRoleId(roleId)) {
    return;
  }

  const group = ensureRoleGroup(roleGroups, roleId);
  group.presenceEvidenceByKey.set(toEvidenceKey(source), source);
}

function addClassOnlyEvidence(
  classGroups: Map<PlayerClass, ClassOnlyGroupAccumulator>,
  classId: PlayerClass,
  playerId: string,
  source: EvidenceSource
) {
  const group = ensureClassOnlyGroup(classGroups, classId);
  const evidenceSources = group.unclaimedByKey.get(playerId) ?? [];
  evidenceSources.push(source);
  group.unclaimedByKey.set(playerId, evidenceSources);
}

function ensureRoleGroup(
  roleGroups: Map<string, RoleGroupAccumulator>,
  roleId: string
) {
  const existing = roleGroups.get(roleId);
  if (existing) {
    return existing;
  }

  const nextGroup: RoleGroupAccumulator = {
    key: `role:${roleId}`,
    type: "role",
    roleId,
    classId: getForcedClassForRole(roleId) ?? null,
    presenceEvidenceByKey: new Map<string, EvidenceSource>(),
    candidateEvidenceByPlayer: new Map<string, EvidenceMap>(),
    confirmedEvidenceByPlayer: new Map<string, EvidenceMap>()
  };
  roleGroups.set(roleId, nextGroup);
  return nextGroup;
}

function ensureClassOnlyGroup(
  classGroups: Map<PlayerClass, ClassOnlyGroupAccumulator>,
  classId: PlayerClass
) {
  const existing = classGroups.get(classId);
  if (existing) {
    return existing;
  }

  const nextGroup: ClassOnlyGroupAccumulator = {
    key: `class:${classId}`,
    type: "class_only",
    classId,
    unclaimedByKey: new Map<string, EvidenceSource[]>()
  };
  classGroups.set(classId, nextGroup);
  return nextGroup;
}

function toEvidenceKey(source: EvidenceSource) {
  return `${source.type}:${source.sourceId}`;
}

function getVisitEvidenceCategory(
  sourceType: VisitEvidence["sourceType"]
): EvidenceSource["sourceCategory"] {
  return sourceType === "ability_log" ? "used_ability" : "night_action";
}

function getVisitEvidenceStrength(entry: VisitEvidence): EvidenceStrength {
  return entry.confidence === "confirmed" ? "confirmed" : "possible";
}

function applyRoleEvidenceOverride(
  source: EvidenceSource,
  overrides: DeriveKnownRolesInput["roleEvidenceOverrides"],
  playerId?: string | null
) {
  const override = overrides?.[toEvidenceKey(source)];
  if (!override) {
    return {
      source,
      playerId: playerId ?? null
    };
  }

  return {
    source: {
      ...source,
      strength: override.strength
    },
    playerId: override.playerId ?? playerId ?? null
  };
}

function getPlayerLabel(player: Pick<Player, "id" | "name" | "seat">) {
  return player.name || `Player #${player.seat}`;
}

function isKnownRoleId(roleId?: string | null): roleId is string {
  return Boolean(roleId && roleId !== ABILITY_UNKNOWN_VALUE);
}
